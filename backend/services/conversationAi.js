/**
 * `config/openai` dựng client NGAY khi import và ném lỗi nếu thiếu
 * `OPENAI_API_KEY`. Nạp lười ở đây để phần thuần tuý (chọn từ, dựng prompt)
 * kiểm thử được mà không cần khoá API — chúng là chỗ dễ sai nhất, bắt buộc
 * phải có test.
 */
function chatCompletion(...args) {
    return require('../config/openai').chatCompletion(...args);
}

/**
 * Sinh hội thoại luyện nói, ÉP dùng đúng bộ từ người học vừa luyện.
 *
 * Đây là thứ ChatGPT thường không làm được: nó không biết người học đang học
 * bộ nào, sai từ nào. App biết, nên hội thoại nhắm đúng chỗ yếu.
 *
 * Hai lượt gọi AI cho mỗi phiên loại:
 *   · `openConversation` — mở màn, đặt bối cảnh (1 lần/phiên)
 *   · `replyTurn`        — đáp lại người học (mỗi lượt 1 lần)
 *
 * Việc CHẤM ĐIỂM cố ý KHÔNG ở đây — xem `utils/wordMatch.js`. So khớp chuỗi
 * thì miễn phí, tức thì và khách quan; nhờ AI chấm thì cùng một câu lúc được
 * lúc không.
 */

const LANG_NAME = { en: 'English', zh: 'Mandarin Chinese' };

/**
 * Số từ mục tiêu nhét vào prompt.
 *
 * KHÔNG gửi cả 30 từ: prompt dài thì AI rải đều và nói hết danh sách ngay lượt
 * đầu, người học chẳng còn gì để dùng. 8 từ đủ để dựng bối cảnh mà vẫn chừa chỗ.
 */
const WORDS_IN_PROMPT = 8;

/** Ngôn ngữ mẹ đẻ của người dùng — dùng cho phần gợi ý/dịch. */
const NATIVE = 'Vietnamese';

function langName(lang) {
    return LANG_NAME[lang] || LANG_NAME.en;
}

/** Lấy tối đa `n` từ, ưu tiên những từ CHƯA dùng trong phiên. */
function pickWords(targetWords = [], usedWords = [], n = WORDS_IN_PROMPT) {
    const used = new Set(usedWords);
    const remaining = targetWords.filter((w) => !used.has(w));
    // Hết từ chưa dùng thì quay lại dùng cả danh sách — hội thoại vẫn chạy
    // tiếp được thay vì đứng im.
    const pool = remaining.length ? remaining : targetWords;
    return pool.slice(0, n);
}

/**
 * Luật chung cho cả hai lượt gọi.
 *
 * Viết bằng tiếng Anh vì mọi model đều bám prompt tiếng Anh tốt hơn; nội dung
 * SINH RA thì vẫn theo `lang`.
 */
function systemPrompt({ lang, topic, words }) {
    const L = langName(lang);
    return [
        `You are a friendly conversation partner helping a ${NATIVE} speaker practise ${L}.`,
        topic ? `Setting: ${topic}.` : '',
        '',
        'RULES:',
        `1. Speak ONLY in ${L}. Never translate or explain — a separate button does that.`,
        '2. Keep every reply to ONE or TWO short sentences. Long replies stop the',
        '   learner from getting a turn, which is the whole point of the exercise.',
        '3. End with a QUESTION so the learner always has something to answer.',
        `4. Naturally work in some of these words: ${words.join(', ')}.`,
        '   Do NOT use all of them at once, and do NOT list them — the learner',
        '   needs words left to use themselves.',
        '5. Stay at beginner level. Simple grammar, everyday vocabulary.',
        '6. If the learner makes a mistake, just reply naturally. Do not correct',
        '   them mid-conversation; corrections come at the end.',
    ].filter(Boolean).join('\n');
}

/**
 * Mở một hội thoại mới.
 *
 * @returns {{success:boolean, content?:string, error?:string}}
 */
async function openConversation({ lang = 'en', topic = '', targetWords = [], userId = null } = {}) {
    const words = pickWords(targetWords, [], WORDS_IN_PROMPT);
    const messages = [
        { role: 'system', content: systemPrompt({ lang, topic, words }) },
        {
            role: 'user',
            content: 'Start the conversation. Greet me and ask one simple question.',
        },
    ];

    return chatCompletion(messages, {
        // Ngắn hơn `chat-tutor` (500) rất nhiều: luật số 2 bảo AI nói 1–2 câu,
        // nhưng giới hạn cứng mới là thứ chặn được prompt bị lờ đi — và nó cắt
        // thẳng chi phí, thứ tăng theo mỗi lượt.
        maxTokens: 120,
        temperature: 0.9,   // cao để mỗi phiên một khác, không lặp lại nhàm
        feature: 'conversation-open',
        userId,
    });
}

/**
 * Đáp lại một lượt của người học.
 *
 * @param {object} o
 * @param {Array}  o.turns  Toàn bộ lượt đã có (`{ role: 'npc'|'user', content }`).
 */
async function replyTurn({
    lang = 'en', topic = '', targetWords = [], usedWords = [], turns = [], userId = null,
} = {}) {
    // Ưu tiên từ CHƯA dùng: hội thoại tự lái về phía những từ người học còn nợ,
    // thay vì lặp lại mấy từ đã ăn điểm rồi.
    const words = pickWords(targetWords, usedWords, WORDS_IN_PROMPT);

    // Chỉ gửi lại N lượt gần nhất, KHÔNG gửi cả phiên.
    //
    // Chi phí một hội thoại tăng theo BÌNH PHƯƠNG số lượt nếu gửi lại tất cả
    // (lượt thứ 12 phải chở theo 11 lượt trước). Cắt cửa sổ giữ chi phí tuyến
    // tính, mà mạch hội thoại ngắn thế này không cần nhớ xa hơn.
    const WINDOW = 8;
    const recent = turns.slice(-WINDOW).map((t) => ({
        role: t.role === 'user' ? 'user' : 'assistant',
        content: t.content,
    }));

    const messages = [
        { role: 'system', content: systemPrompt({ lang, topic, words }) },
        ...recent,
    ];

    return chatCompletion(messages, {
        maxTokens: 120,
        temperature: 0.9,
        feature: 'conversation-reply',
        userId,
    });
}

module.exports = {
    openConversation,
    replyTurn,
    // Xuất ra để test — đây là hai chỗ quyết định chi phí và chất lượng prompt.
    pickWords,
    systemPrompt,
    WORDS_IN_PROMPT,
};
