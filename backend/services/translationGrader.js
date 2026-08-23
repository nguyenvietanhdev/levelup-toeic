/**
 * Sinh đoạn văn TIẾNG VIỆT và CHẤM bản dịch của người học sang tiếng Anh/Trung.
 *
 * Vì sao chế độ này đáng có bên cạnh Viết luận: viết luận để người học tự chọn
 * nói gì, nên khi bí ý họ viết vòng quanh bằng vốn từ an toàn và không lộ ra
 * chỗ yếu. Dịch thì NỘI DUNG bị ấn định sẵn — muốn dịch đúng phải gọi tên đúng
 * thứ trong bản gốc, không né được. Đó cũng là lý do chấm được chính xác hơn:
 * có bản gốc làm mốc, đối chiếu được "câu này bỏ mất ý gì", còn bài luận thì AI
 * phải đoán xem người viết định nói gì.
 *
 * Ba tiêu chí chứ không phải một điểm tổng: lỗi hay gặp nhất khi dịch là câu
 * ĐÚNG NGỮ PHÁP HOÀN TOÀN nhưng người bản ngữ không nói thế. Một điểm tổng giấu
 * mất chuyện đó — người học thấy 7.0 và tưởng mình chỉ cần cố thêm chút nữa,
 * trong khi vấn đề thật nằm ở chỗ khác hẳn.
 */

/**
 * Nạp lười giống `essayGrader`: `config/openai` dựng client ngay khi import và
 * ném lỗi nếu thiếu `OPENAI_API_KEY`. Phần thuần tuý (dựng prompt, đọc JSON,
 * kẹp điểm) phải kiểm thử được mà không cần khoá API — đó là chỗ dễ sai nhất.
 */
function chatCompletion(...args) {
    return require('../config/openai').chatCompletion(...args);
}

const { parseJson, clampBand, countUnits } = require('./essayGrader');
const { chiThiPhanLoai, chuanHoaLoai } = require('./errorTaxonomy');

/**
 * Ba trục chấm.
 *
 * `accuracy` đứng đầu vì nó là thứ phân biệt dịch với viết tự do: bỏ sót một ý
 * trong bản gốc là lỗi của DỊCH, dù câu tiếng Anh viết ra hay đến mấy.
 *
 * `naturalness` tách riêng khỏi `grammar` một cách có chủ ý. Gộp lại thì câu
 * "I have a headache in my head" được điểm cao vì ngữ pháp không sai chỗ nào,
 * và người học không bao giờ biết vì sao câu mình viết nghe kỳ.
 */
const CRITERIA = [
    { key: 'accuracy', label: 'Accuracy', vi: 'Đủ ý & đúng nghĩa' },
    { key: 'grammar', label: 'Grammar', vi: 'Ngữ pháp & chính tả' },
    { key: 'naturalness', label: 'Naturalness', vi: 'Tự nhiên như người bản ngữ' },
];

/** Số câu của đoạn đề, theo mức. Giữ ngắn: dịch dài không dạy thêm gì mà nản. */
const CAU_THEO_MUC = { easy: 3, medium: 4, hard: 5 };

/** Độ dài tối thiểu của bản dịch, để chặn bài nộp trống hoặc một chữ. */
const MIN_EN = 15;   // từ
const MIN_ZH = 20;   // chữ Hán

function limitsFor(lang) {
    return lang === 'zh' ? { min: MIN_ZH } : { min: MIN_EN };
}

/** Điểm tổng = trung bình ba trục, làm tròn 0.5 như thang band quen thuộc. */
function overallBand(scores = {}) {
    const vals = CRITERIA.map((c) => clampBand(scores[c.key]));
    return clampBand(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/**
 * Chuẩn hoá mức khó về một trong ba giá trị hợp lệ.
 *
 * Nhận giá trị lạ → `medium`, không ném lỗi: mức khó chỉ ảnh hưởng độ dài đoạn
 * đề, sai một nhịp thì bài vẫn dùng được — chặn cả lượt vì nó thì không đáng.
 */
function mucKho(v) {
    return Object.prototype.hasOwnProperty.call(CAU_THEO_MUC, v) ? v : 'medium';
}

/**
 * Sinh một đoạn văn tiếng Việt để dịch.
 *
 * `tuVung` = các từ người học vừa luyện. Đoạn đề được yêu cầu dùng đúng những
 * từ đó, nên dịch xong là ôn lại luôn vốn từ vừa học — thay vì gặp một đoạn
 * ngẫu nhiên toàn từ chưa từng thấy. Đây là thứ ChatGPT không làm được: nó
 * không biết người học đang học bộ nào.
 */
async function generatePassage({ tuVung = [], userId = null, lang = 'en', level = 'medium' } = {}) {
    const zh = lang === 'zh';
    const muc = mucKho(level);
    const soCau = CAU_THEO_MUC[muc];

    // Lọc và cắt ngay tại đây: danh sách từ đi thẳng vào prompt, mà `tuVung` do
    // client gửi lên. Không chặn thì một mảng 500 phần tử thổi bay giới hạn
    // token và một chuỗi rác thành chỉ thị cho model.
    const tu = (Array.isArray(tuVung) ? tuVung : [])
        .map((t) => String(t || '').trim())
        .filter((t) => t && t.length <= 40)
        .slice(0, 8);

    const system = [
        'You write short Vietnamese paragraphs for translation practice.',
        'Return ONLY valid JSON, no markdown fences, no commentary.',
        'Shape: { "passage": "...", "topic": "..." }',
        // Đoạn đề PHẢI bằng tiếng Việt — đó là bản gốc để dịch đi.
        'The "passage" MUST be written in natural Vietnamese.',
        `It must be exactly ${soCau} sentences, forming ONE coherent paragraph`,
        'about a single everyday situation — not ' + soCau + ' unrelated sentences.',
        // Không cho gợi ý sẵn: kèm bản dịch trong đề là đưa luôn đáp án.
        'Do NOT include any English or Chinese words in the passage.',
        'Do NOT include the translation.',
    ];

    if (tu.length) {
        // Nêu từ đích bằng ngôn ngữ ĐÍCH, và bảo model tự chọn cách diễn đạt
        // tiếng Việt tương ứng — ép nó chèn nguyên chữ tiếng Anh vào đoạn tiếng
        // Việt là hỏng chính yêu cầu "không có tiếng Anh trong đề".
        system.push(
            `Write the paragraph so that a good translation would naturally use`,
            `these ${zh ? 'Chinese' : 'English'} words: ${tu.join(', ')}.`,
            'Express their meaning in Vietnamese; never write them literally.',
        );
    }

    const messages = [
        { role: 'system', content: system.join('\n') },
        {
            role: 'user',
            content: tu.length
                ? `Write one ${soCau}-sentence Vietnamese paragraph for translation practice.`
                : `Write one ${soCau}-sentence Vietnamese paragraph on a common everyday topic.`,
        },
    ];

    const res = await chatCompletion(messages, {
        maxTokens: 400,
        temperature: 1.0,   // cao để mỗi lần một đoạn khác
        feature: 'translation-passage',
        userId,
    });
    if (!res.success) return res;

    const parsed = parseJson(res.content);
    if (!parsed?.passage) {
        return { success: false, error: 'AI trả về đoạn văn không đọc được' };
    }
    return {
        success: true,
        passage: String(parsed.passage),
        topic: String(parsed.topic || ''),
        words: tu,
        level: muc,
    };
}

/**
 * Chấm một bản dịch.
 *
 * Nhiệt độ THẤP (0.2) như chấm luận: cùng một bài mà lần này 6.0 lần sau 7.5
 * thì điểm mất hết ý nghĩa, và người học không biết mình tiến bộ hay AI đổi ý.
 */
async function gradeTranslation({ passage = '', translation = '', userId = null, lang = 'en' } = {}) {
    const zh = lang === 'zh';
    const dich = zh ? 'Chinese' : 'English';

    const system = [
        `You are an experienced ${dich} teacher marking a Vietnamese-to-${dich} translation.`,
        'Assess it on three criteria, each scored 0-9 (IELTS-like band, .5 steps):',
        '  accuracy — is every idea in the Vietnamese source present and correct?',
        '    Omitting or inventing content is the most serious error here.',
        '  grammar — grammar, spelling, punctuation.',
        // Trục quan trọng nhất và cũng là trục dễ bị bỏ qua nhất.
        `  naturalness — would a native ${dich} speaker actually phrase it this way?`,
        '    A sentence can be grammatically perfect and still score low here.',
        'Return ONLY valid JSON, no markdown fences, no commentary.',
        'Shape: {',
        '  "scores": { "accuracy": 0-9, "grammar": 0-9, "naturalness": 0-9 },',
        '  "reference": "your own good translation of the whole passage",',
        '  "notes": [ { "quote": "...", "issue": "...", "better": "..." } ],',
        '  "summary": "..."',
        '}',
        // Nhận xét bằng TIẾNG VIỆT: người học chế độ này theo định nghĩa là
        // người chưa vững ngôn ngữ đích, đọc nhận xét tiếng Anh về lỗi tiếng
        // Anh của mình là thêm một tầng rào cản.
        'Write "issue" and "summary" in Vietnamese. Keep "quote" and "better"',
        `in ${dich}, quoting the learner's own words exactly.`,
        'Give at most 4 notes — the most useful ones, not every small slip.',
        chiThiPhanLoai(),
    ].join('\n');

    const messages = [
        { role: 'system', content: system },
        {
            role: 'user',
            content: [
                'Vietnamese source:', passage,
                '', `Learner's ${dich} translation:`, translation,
            ].join('\n'),
        },
    ];

    const res = await chatCompletion(messages, {
        maxTokens: 900,
        temperature: 0.2,
        feature: 'translation-grade',
        userId,
    });
    if (!res.success) return res;

    const parsed = parseJson(res.content);
    if (!parsed?.scores) {
        return { success: false, error: 'AI trả về kết quả chấm không đọc được' };
    }

    // Kẹp từng trục rồi mới tính tổng: AI hay trả 7.3 — không phải band có
    // thật. Hiện số đó lên là nói dối về độ chính xác của một ước lượng.
    const scores = {};
    for (const c of CRITERIA) scores[c.key] = clampBand(parsed.scores[c.key]);

    const notes = (Array.isArray(parsed.notes) ? parsed.notes : [])
        .slice(0, 4)
        .map((n) => ({
            quote: String(n?.quote || ''),
            issue: String(n?.issue || ''),
            better: String(n?.better || ''),
            loai: chuanHoaLoai(n?.type),
        }))
        .filter((n) => n.issue);

    return {
        success: true,
        scores,
        overall: overallBand(scores),
        reference: String(parsed.reference || ''),
        notes,
        summary: String(parsed.summary || ''),
    };
}

module.exports = {
    generatePassage,
    gradeTranslation,
    overallBand,
    limitsFor,
    countUnits,
    mucKho,
    CRITERIA,
    CAU_THEO_MUC,
};
