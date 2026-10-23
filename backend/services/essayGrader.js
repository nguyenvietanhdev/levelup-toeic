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
const { chiThiPhanLoai, chuanHoaLoai } = require('./errorTaxonomy');
const { chiThiMuc } = require('./aiLevel');
const { chonDang } = require('./dangBai');

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

/**
 * Bộ chấm GIAO TIẾP cho bài viết: bài viết thực tế (email, tin nhắn, đoạn văn đời
 * thường), không chấm theo chuẩn học thuật. Thang 0–9 như các bộ khác.
 */
const RUBRIC_GIAOTIEP = [
    { key: 'ro_y', label: 'Clarity of ideas', vi: 'Rõ ý' },
    { key: 'tu_nhien', label: 'Naturalness', vi: 'Tự nhiên' },
    { key: 'dung_ngu_canh', label: 'Appropriateness', vi: 'Đúng ngữ cảnh' },
    { key: 'ngu_phap', label: 'Grammar', vi: 'Ngữ pháp' },
];

/** Bộ chấm TOEIC cho bài viết (Writing): ngữ pháp, mạch lạc, từ vựng, bám đề. */
const RUBRIC_TOEIC = [
    { key: 'ngu_phap', label: 'Grammar', vi: 'Ngữ pháp' },
    { key: 'mach_lac', label: 'Organization', vi: 'Mạch lạc' },
    { key: 'von_tu', label: 'Vocabulary', vi: 'Vốn từ' },
    { key: 'lien_quan', label: 'Relevance', vi: 'Liên quan đề' },
];

/**
 * Kiểu chấm áp dụng cho từng ngôn ngữ bài viết. Tiếng Anh: Giao tiếp, TOEIC, IELTS.
 * Tiếng Trung: Giao tiếp, HSK. Khớp với cách Hội thoại chọn bộ chấm.
 */
const RUBRICS_BY_LANG = {
    en: ['giaotiep', 'toeic', 'ielts'],
    zh: ['giaotiep', 'hsk'],
};

/** Kiểu chấm mặc định khi không chọn gì: IELTS cho tiếng Anh, HSK cho tiếng Trung. */
const DEFAULT_RUBRIC = { en: 'ielts', zh: 'hsk' };

/** Kiểu chấm hợp lệ cho ngôn ngữ đó, hoặc mặc định. Chỉ nhận chuỗi trong danh sách. */
function chuanHoaRubric(rubric, lang = 'en') {
    const ngonNgu = lang === 'zh' ? 'zh' : 'en';
    const cho = RUBRICS_BY_LANG[ngonNgu];
    if (typeof rubric === 'string' && cho.includes(rubric)) return rubric;
    return DEFAULT_RUBRIC[ngonNgu];
}

/**
 * Các tiêu chí của một kiểu chấm. Không truyền kiểu chấm thì lấy bộ mặc định của
 * ngôn ngữ (giữ hành vi cũ cho bài đã chấm trước khi có kiểu chấm).
 */
function criteriaFor(lang, rubric) {
    const rb = chuanHoaRubric(rubric, lang);
    if (rb === 'giaotiep') return RUBRIC_GIAOTIEP;
    if (rb === 'toeic') return RUBRIC_TOEIC;
    if (rb === 'hsk') return CRITERIA_ZH;
    return lang === 'zh' ? CRITERIA_ZH : CRITERIA;
}

/** Bộ chấm dùng khung chung (không phải IELTS/HSK có sẵn): giao tiếp và TOEIC. */
function laBoChungKhung(rubric) {
    return rubric === 'giaotiep' || rubric === 'toeic';
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
function overallBand(scores = {}, lang = 'en', rubric) {
    const vals = criteriaFor(lang, rubric).map((c) => clampBand(scores[c.key]));
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
/**
 * Độ khó của đề tiếng Anh là CẤP TỪ VỰNG (CEFR), không phải mức "quen thuộc" của
 * đề. Dễ = A1–A2, Vừa = B1–B2, Khó = C1–C2.
 */
const CEFR_DE_BAI = { easy: 'A1–A2', medium: 'B1–B2', hard: 'C1–C2' };

function capTuVungDeBai(level) {
    const k = Object.prototype.hasOwnProperty.call(CEFR_DE_BAI, level) ? level : 'medium';
    return `Use vocabulary and grammar at CEFR level ${CEFR_DE_BAI[k]}; keep every word within that level.`;
}

/**
 * Kho DẠNG BÀI VIẾT dùng chung mọi kiểu chấm (cùng cách với Đọc hiểu). Khoá phải
 * khớp `NHOM_DANG` ở frontend/src/components/essay/EssayScreen.jsx.
 * "Ngẫu nhiên" (không chọn dạng) giữ nguyên đề như trước: IELTS Task 2, đề thực
 * tế cho Giao tiếp/TOEIC, đề HSK 书写.
 */
const NHOM_DANG_VIET = [
    {
        key: 'doi-thuong', vi: 'Đời thường', hop: ['giaotiep', 'hsk'],
        dang: [
            { key: 'message', vi: 'Tin nhắn', en: 'short text message to a friend' },
            { key: 'personal-email', vi: 'Email cá nhân', en: 'personal email to a friend or relative' },
            { key: 'greeting', vi: 'Thiệp / lời chúc', en: 'greeting card or congratulations message' },
            { key: 'review', vi: 'Đánh giá', en: 'review of a restaurant, product or film' },
            { key: 'diary', vi: 'Nhật ký', en: 'diary entry about the day' },
            { key: 'social-post', vi: 'Bài đăng MXH', en: 'social media post' },
        ],
    },
    {
        key: 'cong-viec', vi: 'Công việc', hop: ['toeic'],
        dang: [
            { key: 'email', vi: 'Email công việc', en: 'business email' },
            { key: 'complaint-reply', vi: 'Trả lời khiếu nại', en: 'reply to a customer complaint' },
            { key: 'cover-letter', vi: 'Thư xin việc', en: 'short job application letter' },
            { key: 'memo', vi: 'Ghi chú nội bộ', en: 'internal memo to colleagues' },
            { key: 'report', vi: 'Báo cáo ngắn', en: 'short report on a work situation' },
            { key: 'proposal', vi: 'Đề xuất', en: 'short proposal suggesting an improvement' },
        ],
    },
    {
        key: 'hoc-thuat', vi: 'Luận & học thuật', hop: ['ielts'],
        dang: [
            { key: 'opinion', vi: 'Luận ý kiến', en: 'opinion essay (agree or disagree)' },
            { key: 'discussion', vi: 'Thảo luận hai mặt', en: 'essay discussing both views and giving an opinion' },
            { key: 'problem-solution', vi: 'Vấn đề – giải pháp', en: 'problem and solution essay' },
            { key: 'adv-disadv', vi: 'Ưu – nhược điểm', en: 'advantages and disadvantages essay' },
            { key: 'chart', vi: 'Mô tả biểu đồ', en: 'description of a chart or graph whose data you state in the task' },
            { key: 'formal-letter', vi: 'Thư trang trọng', en: 'formal letter of request or complaint' },
        ],
    },
    {
        key: 'sang-tao', vi: 'Kể & mô tả', hop: ['giaotiep', 'toeic', 'ielts', 'hsk'],
        dang: [
            { key: 'story', vi: 'Kể chuyện', en: 'short story or personal anecdote' },
            { key: 'describe', vi: 'Mô tả người / nơi chốn', en: 'description of a person or place' },
            { key: 'persuade', vi: 'Bài thuyết phục', en: 'persuasive piece convincing the reader' },
            { key: 'how-to', vi: 'Hướng dẫn', en: 'step-by-step instructions' },
        ],
    },
];

/** Giọng đề theo kiểu chấm khi người học đã chọn dạng bài. */
const GIONG_DE_VIET = {
    giaotiep: 'Keep it realistic for everyday life.',
    toeic: 'Keep it realistic for the workplace, in the spirit of TOEIC Writing.',
    ielts: 'Make it as demanding and formal as an IELTS Writing task.',
    hsk: 'Match the style of an HSK writing (书写) task.',
};

async function generatePrompt({ topicHint = '', userId = null, lang = 'en', level = 'medium', rubric, dang = '', tuChon = '' } = {}) {
    const zh = lang === 'zh';
    const rb = chuanHoaRubric(rubric, lang);
    const thucTe = laBoChungKhung(rb);
    // Dạng người học chọn (null = Ngẫu nhiên → giữ đề như trước).
    const chon = chonDang(NHOM_DANG_VIET, { dang, tuChon });
    if (chon) {
        return deTheoDang({ chon, zh, rb, level, topicHint, userId });
    }

    const system = zh
        ? [
            // Đề PHẢI bằng tiếng Trung: ra đề tiếng Anh rồi bắt viết tiếng Trung
            // là bài kiểm tra dịch thuật, không phải bài kiểm tra viết.
            'You write HSK writing (书写) prompts for Chinese learners.',
            'Return ONLY valid JSON, no markdown fences, no commentary.',
            'Shape: { "prompt": "...", "type": "叙述|说明|议论|应用" }',
            'The prompt MUST be written in Simplified Chinese.',
            chiThiMuc(level),
            'It must be ONE task of 1-2 sentences, in the style of a real HSK',
            `writing task, asking the learner to write about ${MIN_CHARS_ZH} characters.`,
            'Use vocabulary and grammar appropriate for an intermediate learner.',
        ].join('\n')
        : thucTe
            ? [
                // Giao tiếp / TOEIC: đề viết thực tế (email, tin nhắn, ghi chú công việc),
                // không phải câu hỏi luận học thuật.
                'You write one practical English writing task for a learner.',
                'Return ONLY valid JSON, no markdown fences, no commentary.',
                'Shape: { "prompt": "...", "type": "" }',
                capTuVungDeBai(level),
                'The task must be ONE instruction of 2-3 sentences, realistic for everyday life or the office',
                '(for example: write a short email, a message, or a note).',
            ].join('\n')
            : [
                'You write IELTS Writing Task 2 questions.',
                'Return ONLY valid JSON, no markdown fences, no commentary.',
                'Shape: { "prompt": "...", "type": "opinion|discussion|problem-solution|advantages-disadvantages" }',
                capTuVungDeBai(level),
                'The prompt must be ONE question of 2-3 sentences, in the exact',
                'style of a real IELTS Task 2 question.',
            ].join('\n');

    const user = zh
        ? (topicHint
            ? `Write one HSK writing task related to: ${topicHint}`
            : 'Write one HSK writing task on a common everyday topic.')
        : thucTe
            ? (topicHint
                ? `Write one practical writing task related to: ${topicHint}`
                : 'Write one practical writing task on a common everyday or office situation.')
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
 * Đề theo DẠNG BÀI người học chọn (hoặc tự nhập). Kiểu chấm chỉ quyết định giọng
 * đề; dạng bài quyết định viết cái gì — nên IELTS + "Email cá nhân" vẫn hợp lệ.
 */
async function deTheoDang({ chon, zh, rb, level, topicHint, userId }) {
    const system = [
        zh
            ? 'You write Chinese writing prompts for learners. The prompt MUST be written in Simplified Chinese.'
            : 'You write one English writing task for a learner.',
        'Return ONLY valid JSON, no markdown fences, no commentary.',
        'Shape: { "prompt": "...", "type": "" }',
        zh ? chiThiMuc(level) : capTuVungDeBai(level),
        `The task must ask the learner to write a ${chon.en}.`,
        'It must be ONE instruction of 1-3 sentences that gives a concrete situation.',
        zh ? `Ask for about ${MIN_CHARS_ZH} characters.` : '',
        GIONG_DE_VIET[rb] || '',
    ].filter(Boolean).join('\n');

    const user = topicHint
        ? `Write one such task related to: ${topicHint}`
        : 'Write one such task on a fresh, everyday-relevant topic.';

    const res = await chatCompletion([
        { role: 'system', content: system },
        { role: 'user', content: user },
    ], {
        maxTokens: 200,
        temperature: 1.0,
        feature: 'essay-prompt',
        userId,
    });
    if (!res.success) return res;

    const parsed = parseJson(res.content);
    if (!parsed?.prompt) {
        return { success: false, error: 'AI trả về đề không đọc được' };
    }
    return { success: true, prompt: String(parsed.prompt), type: chon.key, dang: chon.key, dangVi: chon.vi };
}

/**
 * Chấm một bài viết theo 4 tiêu chí IELTS.
 *
 * Nhiệt độ THẤP (0.2): chấm điểm phải ổn định. Cùng một bài mà lần chấm này 6.0
 * lần sau 7.5 thì điểm mất hết ý nghĩa, và người học không biết mình có tiến bộ
 * hay chỉ là AI đổi ý.
 */
/**
 * Khung chấm chung cho bộ không có sẵn chỉ dẫn riêng (Giao tiếp, TOEIC): liệt kê
 * đúng các tiêu chí của bộ đó và yêu cầu JSON với đúng các khoá ấy.
 */
function khungChamChung(crit, zh, rb) {
    const ngonNguBai = zh ? 'CHINESE' : 'ENGLISH';
    const tenBo = rb === 'toeic' ? 'TOEIC Writing' : 'everyday communication';
    return [
        `You are an experienced ${zh ? 'Chinese' : 'English'} writing examiner judging ${tenBo}.`,
        'Assess the piece against these criteria (key — meaning):',
        ...crit.map((c) => `  ${c.key} — ${c.vi}`),
        'Return ONLY valid JSON, no markdown fences, no commentary.',
        'Shape:',
        '{',
        `  "scores": { ${crit.map((c) => `"${c.key}": 0-9`).join(', ')} },`,
        `  "comments": { ${crit.map((c) => `"${c.key}": "..."`).join(', ')} },`,
        '  "errors": [ { "quote": "text from the piece", "issue": "...", "fix": "..." } ],',
        '  "strengths": ["..."],',
        `  "improved": "a rewritten version of ONE weak paragraph, in ${ngonNguBai}"`,
        '}',
        'Scores are whole numbers from 0 to 9.',
        'Write every comment, issue, fix and strength in VIETNAMESE.',
        `Keep "quote" and "improved" in ${ngonNguBai} (they are the learner's text).`,
        'Be specific: quote the actual wording, never say "some grammar errors".',
        chiThiPhanLoai(),
    ].join('\n');
}

async function gradeEssay({ prompt = '', essay = '', userId = null, lang = 'en', rubric } = {}) {
    const zh = lang === 'zh';
    const rb = chuanHoaRubric(rubric, lang);
    const crit = criteriaFor(lang, rb);

    const system = laBoChungKhung(rb)
        ? khungChamChung(crit, zh, rb)
        : zh
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
            chiThiPhanLoai(),
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
            chiThiPhanLoai(),
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
    for (const c of crit) scores[c.key] = clampBand(parsed.scores[c.key]);

    return {
        success: true,
        result: {
            lang,
            rubric: rb,
            // Danh sách tiêu chí của kiểu chấm này để giao diện hiển thị đúng nhãn.
            criteria: crit.map(({ key, label, vi }) => ({ key, label, vi })),
            scores,
            overall: overallBand(scores, lang, rb),
            comments: parsed.comments || {},
            // Chuẩn hoá nhãn NGAY tại đây: `Article`/`articles`/`ARTICLE` là ba
            // chuỗi khác nhau, để nguyên thì thống kê tách thành ba dòng.
            errors: (Array.isArray(parsed.errors) ? parsed.errors.slice(0, 12) : [])
                .map((e) => ({ ...e, type: chuanHoaLoai(e?.type) })),
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
    chuanHoaRubric,
    RUBRICS_BY_LANG,
    DEFAULT_RUBRIC,
    RUBRIC_GIAOTIEP,
    RUBRIC_TOEIC,
    limitsFor,
    CRITERIA,
    CRITERIA_ZH,
    MIN_WORDS,
    MAX_WORDS,
    MIN_CHARS_ZH,
    MAX_CHARS_ZH,
    NHOM_DANG_VIET,
};
