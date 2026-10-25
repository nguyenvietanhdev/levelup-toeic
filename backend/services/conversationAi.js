/**
 * `config/openai` dựng client NGAY khi import và ném lỗi nếu thiếu
 * `OPENAI_API_KEY`. Nạp lười ở đây để phần thuần tuý (chọn từ, dựng prompt)
 * kiểm thử được mà không cần khoá API — chúng là chỗ dễ sai nhất, bắt buộc
 * phải có test.
 */
function chatCompletion(...args) {
    return require('../config/openai').chatCompletion(...args);
}

const { chiThiMuc } = require('./aiLevel');
const { CHI_THI_HOP_BOI_CANH } = require('./dangBai');
const { chiThiNham } = require('./nhamDiemYeu');

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

/**
 * VAI của AI trong hội thoại — người học chọn trước khi mở phiên. Client chỉ gửi
 * MÃ; câu mô tả nằm ở đây, không nhận chuỗi tự do vào prompt.
 *
 * Vai quyết định giọng điệu và mức trang trọng. TÌNH HUỐNG cụ thể do AI tự sinh
 * từ bộ từ mục tiêu (xem `openConversation`), nên không phụ thuộc Part.
 */
const VAI_AI = {
    colleague: 'a colleague at work: casual but professional, talking about tasks and plans',
    customer: 'a customer: polite and a little demanding, asking about a product or a service',
    receptionist: 'a receptionist or front-desk staff: formal, helpful, handling requests',
    interviewer: 'a job interviewer: formal, asking about experience and goals',
};

/** Mã vai hợp lệ, hoặc '' (= không đặt vai, AI tự chọn giọng chung). */
function chuanHoaVai(ma) {
    // Chỉ chấp nhận CHUỖI: hasOwnProperty ép kiểu khoá, nên object có `toString`
    // sẽ lọt qua và trả về chính object đó.
    if (typeof ma !== 'string') return '';
    return Object.prototype.hasOwnProperty.call(VAI_AI, ma) ? ma : '';
}

/** Câu mô tả vai đưa vào prompt, '' nếu không chọn. */
function moTaVai(ma) {
    return VAI_AI[chuanHoaVai(ma)] || '';
}

/** Số khung gợi ý tối đa và độ dài tối đa mỗi khung. */
const MAX_KHUNG = 3;
const MAX_DAI_KHUNG = 120;

/**
 * Đọc dòng `HINT: a | b | c` mà `goiYKhung` xin AI trả về, tách ra các khung.
 *
 * Khung là MẪU CÂU có chỗ trống `___` bám đúng câu AI vừa hỏi — để người học
 * biết cách đáp và tự điền, luyện phản xạ; không phải câu trả lời hoàn chỉnh.
 * Phần chữ ngoài dòng HINT trả về ở `text` (bỏ qua). Không có dòng HINT thì
 * `khung` rỗng — client dùng khung dựng bằng luật.
 */
function tachKhung(content) {
    const dong = String(content || '').split(/\r?\n/);
    const khung = [];
    const conLai = [];
    for (const d of dong) {
        // Model đôi khi viết HINT ngay sau lời nói trên CÙNG một dòng — cắt tại đó.
        const i = d.search(/\bHINT\s*:/i);
        if (i < 0) { conLai.push(d); continue; }
        if (d.slice(0, i).trim()) conLai.push(d.slice(0, i));
        const sau = d.slice(i).replace(/^HINT\s*:\s*/i, '');
        for (const k of sau.split('|')) {
            const t = k.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
            if (t.length >= 3 && t.length <= MAX_DAI_KHUNG && khung.length < MAX_KHUNG) khung.push(t);
        }
    }
    return { text: conLai.join('\n').trim(), khung };
}

/**
 * Tách lời mở đầu thành TÌNH HUỐNG và LỜI NÓI. AI được yêu cầu viết theo hai
 * dòng `SCENARIO:` và `REPLY:`; nếu không đúng định dạng thì coi cả câu trả lời
 * là lời nói, tình huống để trống — hội thoại vẫn chạy.
 */
function parseOpening(content) {
    const text = String(content || '').trim();
    const m = text.match(/SCENARIO:\s*([\s\S]*?)\s*REPLY:\s*([\s\S]*)$/i);
    if (!m) return { scenario: '', reply: text };
    return { scenario: m[1].trim().slice(0, 300), reply: m[2].trim() };
}

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
function systemPrompt({ lang, topic, scenario, words, level, voice = false, nham = [] }) {
    const L = langName(lang);
    return [
        `You are a friendly conversation partner helping a ${NATIVE} speaker practise ${L}.`,
        // Hội thoại GIỌNG NÓI: lời AI được đọc bằng TTS và người học chỉ NGHE, không
        // thấy chữ — emoji, ký hiệu, gạch đầu dòng đọc lên thành tiếng vô nghĩa.
        voice ? 'This is a SPOKEN conversation: your words are read aloud and the learner cannot see them. Use plain spoken sentences only: no emojis, symbols, lists or abbreviations.' : '',
        topic ? `Your role: ${topic}.` : '',
        scenario ? `Current situation: ${scenario}. Stay inside this situation.` : '',
        '',
        'RULES:',
        `1. Speak ONLY in ${L}. Never translate or explain — a separate button does that.`,
        '2. Keep every reply to ONE or TWO short sentences. Long replies stop the',
        '   learner from getting a turn, which is the whole point of the exercise.',
        '3. End with a QUESTION so the learner always has something to answer.',
        // Từ AI nói ra được tính là "đã xong" (không thưởng) — AI nói nhiều là người
        // học mất cơ hội tự dùng. Nên AI GỢI để người học nói, không nói hộ.
        `4. These are the learner's target words: ${words.join(', ')}.`,
        '   Ask questions that make the LEARNER need them. Avoid saying them yourself;',
        '   use at most ONE per reply, only when the conversation really needs it,',
        '   and never list them.',
        // Trước đây cứng ở "beginner level": người Level 18 — đúng mốc mở khoá
        // của chế độ này — vẫn nhận hội thoại vỡ lòng, và không có cách nào
        // tăng độ khó.
        `5. ${chiThiMuc(level)}`,
        '6. If the learner makes a mistake, just reply naturally. Do not correct',
        '   them mid-conversation; corrections come at the end.',
        // Lỗi ngữ pháp lặp lại trong hồ sơ người học: thỉnh thoảng hỏi câu cần đúng
        // cấu trúc đó (xem `nhamDiemYeu`). Rỗng thì không thêm gì.
        chiThiNham(nham, 'hoi-thoai'),
    ].filter(Boolean).join('\n');
}

/**
 * Kho TÌNH HUỐNG hội thoại (cùng cách với kho dạng bài của Đọc hiểu/Viết).
 *
 * Ghép với VAI chứ không thay: vai là AI đóng ai (Bartender), tình huống là đang
 * ở đâu, làm gì (khách phàn nàn đồ uống). `hop` = các kiểu chấm nhóm đó hợp nhất.
 * Khoá khớp `NHOM_DANG` ở frontend/src/components/conversation/ConversationScreen.jsx.
 * "Ngẫu nhiên" (không chọn) giữ như trước: AI tự dựng tình huống từ bộ từ.
 */
const NHOM_TINH_HUONG = [
    {
        key: 'doi-thuong', vi: 'Đời thường', hop: ['giaotiep', 'hsk'],
        dang: [
            { key: 'order-food', vi: 'Gọi món', en: 'ordering food or drinks' },
            { key: 'directions', vi: 'Hỏi đường', en: 'asking for or giving directions' },
            { key: 'shopping', vi: 'Mua sắm / trả giá', en: 'shopping and asking about prices' },
            { key: 'small-talk', vi: 'Làm quen', en: 'meeting someone new and making small talk' },
            { key: 'invite', vi: 'Rủ đi chơi', en: 'inviting someone out and making plans' },
            { key: 'phone-friend', vi: 'Gọi điện cho bạn', en: 'a phone call to catch up with a friend' },
        ],
    },
    {
        key: 'dich-vu', vi: 'Dịch vụ', hop: ['giaotiep', 'toeic', 'hsk'],
        dang: [
            { key: 'hotel', vi: 'Khách sạn', en: 'checking in or out of a hotel' },
            { key: 'booking', vi: 'Đặt chỗ', en: 'booking a table, ticket or appointment' },
            { key: 'doctor', vi: 'Khám bệnh', en: 'describing a health problem at a clinic' },
            { key: 'bank', vi: 'Ngân hàng', en: 'sorting out something at a bank' },
            { key: 'airport', vi: 'Sân bay', en: 'checking in or solving a problem at the airport' },
            { key: 'complaint', vi: 'Khiếu nại', en: 'a customer complaining about a product or service' },
        ],
    },
    {
        key: 'cong-viec', vi: 'Công việc', hop: ['toeic'],
        dang: [
            { key: 'interview', vi: 'Phỏng vấn xin việc', en: 'a job interview' },
            { key: 'meeting', vi: 'Họp nhóm', en: 'a short team meeting' },
            { key: 'negotiate', vi: 'Đàm phán', en: 'negotiating a price or deadline' },
            { key: 'client-call', vi: 'Gọi cho khách hàng', en: 'a phone call with a client' },
            { key: 'leave', vi: 'Xin nghỉ phép', en: 'asking a manager for time off' },
            { key: 'progress', vi: 'Báo cáo tiến độ', en: 'reporting progress on a project' },
        ],
    },
    {
        key: 'thao-luan', vi: 'Thảo luận', hop: ['ielts'],
        dang: [
            { key: 'opinion', vi: 'Bày tỏ ý kiến', en: 'giving and defending an opinion on a topic' },
            { key: 'debate', vi: 'Tranh luận hai mặt', en: 'discussing both sides of an issue' },
            { key: 'experience', vi: 'Kể trải nghiệm', en: 'telling a personal experience' },
            { key: 'describe', vi: 'Mô tả nơi chốn', en: 'describing a place you know well' },
            { key: 'future', vi: 'Kế hoạch tương lai', en: 'talking about future plans' },
            { key: 'compare', vi: 'So sánh xưa – nay', en: 'comparing the past and the present' },
        ],
    },
];

/**
 * Mở một hội thoại mới.
 *
 * @returns {{success:boolean, content?:string, scenario?:string, khung?:string[], error?:string}}
 */
async function openConversation({ lang = 'en', topic = '', targetWords = [], userId = null, level = 'medium', tinhHuong = null, voice = false, nham = [] } = {}) {
    const words = pickWords(targetWords, [], WORDS_IN_PROMPT);
    // Tình huống do AI TỰ DỰNG từ bộ từ — không lấy từ Part. Yêu cầu hai dòng
    // SCENARIO và REPLY để server tách được tình huống ra khỏi lời nói.
    const messages = [
        { role: 'system', content: systemPrompt({ lang, topic, words, level, voice, nham }) },
        {
            role: 'user',
            content: [
                'Start the conversation.',
                tinhHuong
                    // Tình huống người học chọn (từ kho hoặc tự nhập, đã làm sạch ở `chonDang`):
                    // AI dựng cảnh theo đúng loại đó, vẫn giữ vai và bộ từ.
                    ? `First set up ONE short, realistic situation for your role, of this kind: ${tinhHuong.en}. It should naturally use these words: ${words.join(', ')}. ${CHI_THI_HOP_BOI_CANH}`
                    : `First invent ONE short, realistic situation for your role that can naturally use these words: ${words.join(', ')}.`,
                'Answer in exactly this format, two lines and nothing else:',
                'SCENARIO: <one sentence describing the situation, in English>',
                'REPLY: <your greeting and ONE simple question, in ' + langName(lang) + '>',
            ].join('\n'),
        },
    ];

    const res = await chatCompletion(messages, {
        // Ngắn hơn `chat-tutor` (500) rất nhiều: luật số 2 bảo AI nói 1–2 câu,
        // nhưng giới hạn cứng mới là thứ chặn được prompt bị lờ đi — và nó cắt
        // thẳng chi phí, thứ tăng theo mỗi lượt. Thêm một dòng tình huống nên
        // nới nhẹ so với 120.
        maxTokens: 180,
        temperature: 0.9,   // cao để mỗi phiên một khác, không lặp lại nhàm
        feature: 'conversation-open',
        userId,
    });
    if (!res.success) return res;
    const { scenario, reply } = parseOpening(res.content);
    return { ...res, content: reply, scenario };
}

/**
 * Đáp lại một lượt của người học.
 *
 * @param {object} o
 * @param {Array}  o.turns  Toàn bộ lượt đã có (`{ role: 'npc'|'user', content }`).
 */
async function replyTurn({
    lang = 'en', topic = '', scenario = '', targetWords = [], usedWords = [], turns = [], userId = null, level = 'medium', voice = false, nham = [],
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
        { role: 'system', content: systemPrompt({ lang, topic, scenario, words, level, voice, nham }) },
        ...recent,
    ];

    return chatCompletion(messages, {
        maxTokens: 120,
        temperature: 0.9,
        feature: 'conversation-reply',
        userId,
    });
}

/**
 * Khung câu trả lời cho câu NPC vừa nói — CHỈ gọi khi người học bấm "Gợi ý"
 * (hoặc ngồi im quá lâu), không gọi ở mọi lượt để tiết kiệm chi phí.
 *
 * Trả 2–3 MẪU CÂU có chỗ trống `___` bám đúng câu AI hỏi, để người học tự điền
 * và luyện phản xạ — không phải câu trả lời hoàn chỉnh.
 *
 * @returns {Promise<{success:boolean, khung?:string[], error?:string}>}
 */
async function goiYKhung({ lang = 'en', topic = '', scenario = '', cauAI = '', words = [], level = 'medium', userId = null } = {}) {
    const L = langName(lang);
    const messages = [
        {
            role: 'system',
            content: [
                `You help a ${NATIVE} learner answer a message in a ${L} conversation.`,
                topic ? `The other speaker's role: ${topic}.` : '',
                scenario ? `Situation: ${scenario}.` : '',
                `Write 2-3 short answer patterns in ${L} that directly answer the message,`,
                'with ___ for the parts the learner fills in. Patterns only, never a complete answer.',
                words.length ? `Where natural, leave room for one of these words: ${words.join(', ')}.` : '',
                chiThiMuc(level),
                'Reply with ONE line only: HINT: pattern 1 | pattern 2 | pattern 3',
            ].filter(Boolean).join('\n'),
        },
        { role: 'user', content: `Message: ${String(cauAI).slice(0, 500)}` },
    ];
    const res = await chatCompletion(messages, {
        maxTokens: 80,
        temperature: 0.5,
        feature: 'conversation-hint',
        userId,
    });
    if (!res.success) return res;
    // Model có khi bỏ nhãn "HINT:" — thêm vào để `tachKhung` đọc được.
    const raw = /\bHINT\s*:/i.test(res.content) ? res.content : `HINT: ${res.content}`;
    const { khung } = tachKhung(raw);
    if (!khung.length) return { success: false, error: 'AI không trả khung đọc được' };
    return { success: true, khung };
}

module.exports = {
    openConversation,
    replyTurn,
    goiYKhung,
    // Xuất ra để test — đây là hai chỗ quyết định chi phí và chất lượng prompt.
    pickWords,
    systemPrompt,
    WORDS_IN_PROMPT,
    chuanHoaVai,
    moTaVai,
    parseOpening,
    tachKhung,
    VAI_AI,
    NHOM_TINH_HUONG,
};
