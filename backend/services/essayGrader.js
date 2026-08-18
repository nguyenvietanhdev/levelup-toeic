/**
 * Sinh đề và CHẤM bài viết luận theo tiêu chí IELTS Writing Task 2.
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

/** Độ dài tối thiểu của Task 2 theo quy định thi thật. */
const MIN_WORDS = 250;

/** Trần độ dài — chặn nhồi prompt và tốn token vô ích. */
const MAX_WORDS = 1000;

/** Đếm từ. Dùng chung cho cả kiểm đầu vào lẫn hiển thị. */
function countWords(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean).length;
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
 */
function clampBand(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.min(9, Math.max(0, Math.round(x * 2) / 2));
}

/** Band tổng = trung bình 4 tiêu chí, làm tròn 0.5 (đúng luật IELTS). */
function overallBand(scores = {}) {
    const vals = CRITERIA.map((c) => clampBand(scores[c.key]));
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
async function generatePrompt({ topicHint = '', userId = null } = {}) {
    const messages = [
        {
            role: 'system',
            content: [
                'You write IELTS Writing Task 2 questions.',
                'Return ONLY valid JSON, no markdown fences, no commentary.',
                'Shape: { "prompt": "...", "type": "opinion|discussion|problem-solution|advantages-disadvantages" }',
                'The prompt must be ONE question of 2-3 sentences, in the exact',
                'style of a real IELTS Task 2 question.',
            ].join('\n'),
        },
        {
            role: 'user',
            content: topicHint
                ? `Write one Task 2 question related to: ${topicHint}`
                : 'Write one Task 2 question on a common IELTS topic.',
        },
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
async function gradeEssay({ prompt = '', essay = '', userId = null } = {}) {
    const messages = [
        {
            role: 'system',
            content: [
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
            ].join('\n'),
        },
        {
            role: 'user',
            content: `QUESTION:\n${prompt}\n\nESSAY:\n${essay}`,
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
    const scores = {};
    for (const c of CRITERIA) scores[c.key] = clampBand(parsed.scores[c.key]);

    return {
        success: true,
        result: {
            scores,
            overall: overallBand(scores),
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
    CRITERIA,
    MIN_WORDS,
    MAX_WORDS,
};
