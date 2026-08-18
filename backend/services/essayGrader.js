/**
 * Sinh đề và CHẤM bài viết luận — IELTS Task 2 (tiếng Anh) hoặc HSK 书写 (tiếng Trung).
 *
 * HAI chuẩn chứ không phải một chuẩn dịch sang hai thứ tiếng: tiếng Trung không
 * có IELTS, và gán band IELTS cho bài tiếng Trung là một con số không có nghĩa.
 * HSK chấm theo tiêu chí khác (dùng đúng chữ Hán quan trọng ngang ngữ pháp) và
 * độ dài khác hẳn — HSK5 khoảng 80 chữ, HSK6 khoảng 400, không phải 250 từ.
 *
 * Vì sao chấm bài viết khả thi trong khi chấm PHÁT ÂM thì không: AI đọc được
 * văn bản, hiểu cấu trúc lập luận và so được với tiêu chí. Còn phát âm thì Web
 * Speech chỉ trả về CHỮ, không trả điểm âm — muốn chấm thật phải mua dịch vụ
 * chuyên dụng.
 *
 * Rẻ hơn hẳn chế độ Hội thoại: một bài chấm là MỘT lượt gọi (~$0.0004 với model
 * rẻ), còn hội thoại là ~13 lượt vì mỗi lượt phải gửi lại lịch sử.
 */

/**
 * `config/openai` dựng client NGAY khi import và ném lỗi nếu thiếu
 * `OPENAI_API_KEY`. Nạp lười để phần thuần tuý (dựng prompt, đọc JSON, kẹp
 * band) kiểm thử được mà không cần khoá API — đó là chỗ dễ sai nhất.
 */
function chatCompletion(...args) {
    return require('../config/openai').chatCompletion(...args);
}

/** Bốn tiêu chí chính thức của IELTS Writing Task 2. */
const CRITERIA = [
    { key: 'taskResponse', label: 'Task Response', vi: 'Trả lời đúng đề' },
    { key: 'coherence', label: 'Coherence & Cohesion', vi: 'Mạch lạc & liên kết' },
    { key: 'lexical', label: 'Lexical Resource', vi: 'Vốn từ vựng' },
    { key: 'grammar', label: 'Grammatical Range & Accuracy', vi: 'Ngữ pháp' },
];

/**
 * Bốn tiêu chí HSK 书写.
 *
 * Cùng SỐ LƯỢNG bốn tiêu chí nhưng nội dung khác IELTS ở chỗ quan trọng nhất:
 * `characters` — viết đúng chữ Hán. Trong tiếng Anh sai chính tả là lỗi nhỏ;
 * trong tiếng Trung viết nhầm 的/得/地 hay dùng chữ đồng âm sai là lỗi nặng, nên
 * nó đứng riêng thành một tiêu chí thay vì gộp vào "vốn từ".
 */
const CRITERIA_ZH = [
    { key: 'taskResponse', label: '内容完成', vi: 'Trả lời đúng đề' },
    { key: 'coherence', label: '结构连贯', vi: 'Bố cục & mạch lạc' },
    { key: 'characters', label: '汉字词汇', vi: 'Chữ Hán & dùng từ' },
    { key: 'grammar', label: '语法', vi: 'Ngữ pháp' },
];

/** Chọn bộ tiêu chí theo ngôn ngữ. */
function criteriaFor(lang) {
    return lang === 'zh' ? CRITERIA_ZH : CRITERIA;
}

/** Độ dài tối thiểu của Task 2 theo quy định thi thật. */
const MIN_WORDS = 250;

/**
 * Tối thiểu cho bài HSK — tính bằng CHỮ HÁN, không phải từ.
 *
 * 200 chữ nằm giữa HSK5 (~80) và HSK6 (~400): đủ dài để có bố cục và lập luận
 * mà chấm được, không dài tới mức người học bỏ cuộc. Yêu cầu 250 "từ" như IELTS
 * là sai đơn vị — một bài 250 chữ Hán dài gần gấp đôi bài HSK6 thi thật.
 */
const MIN_CHARS_ZH = 200;

/** Trần độ dài — chặn nhồi prompt và tốn token vô ích. */
const MAX_WORDS = 1000;

/** Trần cho tiếng Trung, tính theo chữ Hán. */
const MAX_CHARS_ZH = 2000;

/** Ngưỡng tối thiểu/tối đa theo ngôn ngữ. */
function limitsFor(lang) {
    return lang === 'zh'
        ? { min: MIN_CHARS_ZH, max: MAX_CHARS_ZH }
        : { min: MIN_WORDS, max: MAX_WORDS };
}

/** Đếm từ. Dùng chung cho cả kiểm đầu vào lẫn hiển thị. */
function countWords(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Đếm CHỮ HÁN.
 *
 * Tiếng Trung không đặt khoảng trắng giữa các từ, nên `countWords` trả về 1 cho
 * cả một bài luận — người học viết 200 chữ vẫn bị báo "chưa đủ 250 từ" và không
 * bao giờ nộp được bài.
 *
 * Chỉ đếm chữ Hán, BỎ dấu câu và khoảng trắng: nếu đếm cả `。，！` thì nhồi dấu
 * câu là qua ngưỡng. Gồm cả khối mở rộng A (một số chữ HSK cao nằm ngoài khối
 * cơ bản).
 */
function countChars(text) {
    const m = String(text || '').match(/[一-鿿㐀-䶿]/g);
    return m ? m.length : 0;
}

/** Đếm theo đơn vị ĐÚNG với ngôn ngữ — chữ Hán cho `zh`, từ cho `en`. */
function countUnits(text, lang) {
    return lang === 'zh' ? countChars(text) : countWords(text);
}

/**
 * Đọc JSON từ phản hồi AI.
 *
 * `JSON.parse` trần KHÔNG đủ: model rất hay bọc kết quả trong ```json … ```
 * dù prompt đã dặn "chỉ trả JSON". Parse thẳng là ném lỗi, và người dùng nhận
 * "chấm bài thất bại" trong khi AI đã trả lời đúng.
 */
function parseJson(raw) {
    const text = String(raw || '').trim();
    // Gỡ rào ```json … ``` nếu có.
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    const body = fenced ? fenced[1] : text;
    try {
        return JSON.parse(body);
    } catch {
        // Vớt vát: lấy đoạn từ `{` đầu tới `}` cuối. Model đôi khi thêm một câu
        // dẫn trước JSON ("Here is the assessment:").
        const s = body.indexOf('{');
        const e = body.lastIndexOf('}');
        if (s >= 0 && e > s) {
            try { return JSON.parse(body.slice(s, e + 1)); } catch { /* chịu */ }
        }
        return null;
    }
}

/**
 * Kẹp band về thang IELTS hợp lệ: 0–9, bước 0.5.
 *
 * AI hay trả 7.3 hoặc 8.7 — không phải band có thật. Hiện số đó lên là nói dối
 * về độ chính xác của thứ vốn đã chỉ là ước lượng.
 *
 * Dùng cho CẢ hai chuẩn: HSK không có thang band, nên ở chế độ tiếng Trung
 * điểm 0–9 chỉ là thang nội bộ của app để theo dõi tiến bộ — màn hình phải nói
 * rõ điều đó thay vì để người dùng tưởng là điểm HSK chính thức.
 */
function clampBand(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.min(9, Math.max(0, Math.round(x * 2) / 2));
}

/**
 * Band tổng = trung bình 4 tiêu chí, làm tròn 0.5 (đúng luật IELTS).
 *
 * Nhận `lang` vì hai chuẩn có KHOÁ tiêu chí khác nhau (`lexical` vs
 * `characters`): lấy nhầm bộ là một tiêu chí ra `undefined` → clamp thành 0 →
 * band tổng tụt xuống 3/4 giá trị thật.
 */
function overallBand(scores = {}, lang = 'en') {
    const vals = criteriaFor(lang).map((c) => clampBand(scores[c.key]));
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return clampBand(avg);
}

/**
 * Sinh đề Task 2.
 *
 * `topicHint` = chủ đề bộ từ người học đang luyện. Bám vào đó thì đề bài dùng
 * đúng vốn từ họ vừa học — thứ ChatGPT không làm được vì nó không biết người
 * học đang học gì.
 */
async function generatePrompt({ topicHint = '', userId = null, lang = 'en' } = {}) {
    const zh = lang === 'zh';

    const system = zh
        ? [
            // Đề PHẢI bằng tiếng Trung: ra đề tiếng Anh rồi bắt viết tiếng Trung
            // là bài kiểm tra dịch thuật, không phải bài kiểm tra viết.
            'You write HSK writing (书写) prompts for Chinese learners.',
            'Return ONLY valid JSON, no markdown fences, no commentary.',
            'Shape: { "prompt": "...", "type": "叙述|说明|议论|应用" }',
            'The prompt MUST be written in Simplified Chinese.',
            'It must be ONE task of 1-2 sentences, in the style of a real HSK',
            `writing task, asking the learner to write about ${MIN_CHARS_ZH} characters.`,
            'Use vocabulary and grammar appropriate for an intermediate learner.',
        ].join('\n')
        : [
            'You write IELTS Writing Task 2 questions.',
            'Return ONLY valid JSON, no markdown fences, no commentary.',
            'Shape: { "prompt": "...", "type": "opinion|discussion|problem-solution|advantages-disadvantages" }',
            'The prompt must be ONE question of 2-3 sentences, in the exact',
            'style of a real IELTS Task 2 question.',
        ].join('\n');

    const user = zh
        ? (topicHint
            ? `Write one HSK writing task related to: ${topicHint}`
            : 'Write one HSK writing task on a common everyday topic.')
        : (topicHint
            ? `Write one Task 2 question related to: ${topicHint}`
            : 'Write one Task 2 question on a common IELTS topic.');

    const messages = [
        { role: 'system', content: system },
        { role: 'user', content: user },
    ];

    const res = await chatCompletion(messages, {
        maxTokens: 200,
        temperature: 1.0,   // cao để mỗi lần một đề khác
        feature: 'essay-prompt',
        userId,
    });
    if (!res.success) return res;

    const parsed = parseJson(res.content);
    if (!parsed?.prompt) {
        return { success: false, error: 'AI trả về đề không đọc được' };
    }
    return { success: true, prompt: String(parsed.prompt), type: parsed.type || '' };
}

/**
 * Chấm một bài viết theo 4 tiêu chí IELTS.
 *
 * Nhiệt độ THẤP (0.2): chấm điểm phải ổn định. Cùng một bài mà lần chấm này 6.0
 * lần sau 7.5 thì điểm mất hết ý nghĩa, và người học không biết mình có tiến bộ
 * hay chỉ là AI đổi ý.
 */
async function gradeEssay({ prompt = '', essay = '', userId = null, lang = 'en' } = {}) {
    const zh = lang === 'zh';

    const system = zh
        ? [
            'You are an experienced HSK writing (书写) examiner.',
            'Assess the composition against four criteria:',
            '  taskResponse (内容完成) — does it fully address the task?',
            '  coherence (结构连贯) — paragraphing, connectives, logical flow.',
            // Tiêu chí RIÊNG của tiếng Trung. Viết nhầm 的/得/地, dùng chữ đồng
            // âm sai, hay viết sai nét là lỗi nặng — trong tiếng Anh không có
            // thứ tương đương ở mức nghiêm trọng này.
            '  characters (汉字词汇) — correct characters and word choice.',
            '    Treat wrong characters (的/得/地, homophone errors) as serious.',
            '  grammar (语法) — sentence patterns, 把/被, aspect particles, measure words.',
            'Return ONLY valid JSON, no markdown fences, no commentary.',
            'Shape:',
            '{',
            '  "scores": { "taskResponse": 0-9, "coherence": 0-9, "characters": 0-9, "grammar": 0-9 },',
            '  "comments": { "taskResponse": "...", "coherence": "...", "characters": "...", "grammar": "..." },',
            '  "errors": [ { "quote": "text from the composition", "issue": "...", "fix": "..." } ],',
            '  "strengths": ["..."],',
            '  "improved": "a rewritten version of ONE weak paragraph, in Chinese"',
            '}',
            'Scores must be whole or half numbers (6.0, 6.5, 7.0).',
            'Write every comment, issue, fix and strength in VIETNAMESE.',
            'Keep "quote" and "improved" in CHINESE (they are the composition text).',
            'Be specific: quote the actual wording, never say "some grammar errors".',
        ].join('\n')
        : [
            'You are an experienced IELTS Writing examiner.',
            'Assess the essay against the four official Task 2 criteria.',
            'Return ONLY valid JSON, no markdown fences, no commentary.',
            'Shape:',
            '{',
            '  "scores": { "taskResponse": 0-9, "coherence": 0-9, "lexical": 0-9, "grammar": 0-9 },',
            '  "comments": { "taskResponse": "...", "coherence": "...", "lexical": "...", "grammar": "..." },',
            '  "errors": [ { "quote": "text from the essay", "issue": "...", "fix": "..." } ],',
            '  "strengths": ["..."],',
            '  "improved": "a rewritten version of ONE weak paragraph"',
            '}',
            'Bands must be whole or half numbers (6.0, 6.5, 7.0).',
            // Nhận xét bằng TIẾNG VIỆT: người học Việt Nam đọc nhận xét
            // tiếng Anh học thuật thì mất luôn phần giá trị nhất của việc
            // chấm — họ hiểu được điểm nhưng không hiểu vì sao.
            'Write every comment, issue, fix and strength in VIETNAMESE.',
            'Keep "quote" and "improved" in English (they are the essay text).',
            'Be specific: quote the actual wording, never say "some grammar errors".',
        ].join('\n');

    const messages = [
        { role: 'system', content: system },
        {
            role: 'user',
            content: zh
                ? `题目:\n${prompt}\n\n作文:\n${essay}`
                : `QUESTION:\n${prompt}\n\nESSAY:\n${essay}`,
        },
    ];

    const res = await chatCompletion(messages, {
        // Đủ chỗ cho 4 nhận xét + danh sách lỗi + một đoạn viết lại.
        maxTokens: 1400,
        temperature: 0.2,
        feature: 'essay-grade',
        userId,
    });
    if (!res.success) return res;

    const parsed = parseJson(res.content);
    if (!parsed?.scores) {
        return { success: false, error: 'AI trả về kết quả chấm không đọc được' };
    }

    // Kẹp mọi band về thang hợp lệ — KHÔNG tin số AI trả về.
    // Lặp theo bộ tiêu chí ĐÚNG ngôn ngữ: bài tiếng Trung có `characters` chứ
    // không có `lexical`, lấy nhầm bộ là mọi điểm ra 0.
    const scores = {};
    for (const c of criteriaFor(lang)) scores[c.key] = clampBand(parsed.scores[c.key]);

    return {
        success: true,
        result: {
            lang,
            scores,
            overall: overallBand(scores, lang),
            comments: parsed.comments || {},
            errors: Array.isArray(parsed.errors) ? parsed.errors.slice(0, 12) : [],
            strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [],
            improved: typeof parsed.improved === 'string' ? parsed.improved : '',
        },
    };
}

module.exports = {
    generatePrompt,
    gradeEssay,
    // Xuất cho test — đây là phần thuần tuý, chỗ dễ sai nhất.
    parseJson,
    clampBand,
    overallBand,
    countWords,
    countChars,
    countUnits,
    criteriaFor,
    limitsFor,
    CRITERIA,
    CRITERIA_ZH,
    MIN_WORDS,
    MAX_WORDS,
    MIN_CHARS_ZH,
    MAX_CHARS_ZH,
};
