/**
 * Sinh bài ĐỌC HIỂU dạng TOEIC Part 7 và chấm.
 *
 * Vì sao cần chế độ này: Part 7 là 54/200 câu Reading của đề thật — phần nặng
 * nhất — mà ngân hàng đề trong DB không có câu nào (Part 1/2/5/6 có 474 câu,
 * Part 7 có 0). Mọi chế độ hiện có đều hỏi TỪ đơn lẻ hoặc một câu; không có chỗ
 * nào luyện đọc một văn bản dài rồi suy ra thông tin.
 *
 * Khác Dịch/Viết luận ở chỗ quyết định: bài này chấm bằng ĐÁP ÁN CÓ SẴN, không
 * gọi AI lần thứ hai. AI chỉ sinh đề một lần, còn chấm là so đáp án — nên chi
 * phí bằng nửa hai chế độ kia và kết quả tuyệt đối ổn định. Chấm bằng AI ở đây
 * còn tệ hơn: câu trắc nghiệm có đúng một đáp án đúng, không có gì để "đánh giá".
 */

/** Nạp lười như các bộ chấm khác — phần thuần tuý phải test được không cần khoá API. */
function chatCompletion(...args) {
    return require('../config/openai').chatCompletion(...args);
}

const { parseJson } = require('./essayGrader');

/**
 * Các dạng văn bản Part 7 thật hay dùng.
 *
 * Cố định danh sách thay vì để AI tự chọn: mỗi dạng có bố cục riêng (email có
 * người gửi/nhận, thông báo có tiêu đề và ngày) và người học cần gặp đủ các
 * dạng. Để AI tự do thì nó ra email chín lần trên mười.
 */
const DANG_BAI = [
    { key: 'email', vi: 'Email' },
    { key: 'notice', vi: 'Thông báo' },
    { key: 'advertisement', vi: 'Quảng cáo' },
    { key: 'article', vi: 'Bài báo' },
    { key: 'memo', vi: 'Ghi chú nội bộ' },
    { key: 'schedule', vi: 'Lịch trình' },
];

/** Số câu hỏi theo mức. Part 7 thật cho 2–5 câu mỗi đoạn. */
const CAU_HOI_THEO_MUC = { easy: 2, medium: 3, hard: 4 };

/** Chuẩn hoá mức khó. Giá trị lạ → `medium`, không ném lỗi. */
function mucKho(v) {
    return Object.prototype.hasOwnProperty.call(CAU_HOI_THEO_MUC, v) ? v : 'medium';
}

/** Chuẩn hoá dạng bài. Không nhận ra → chọn ngẫu nhiên, không trả rỗng. */
function chuanHoaDang(v) {
    const k = String(v || '').trim().toLowerCase();
    if (DANG_BAI.some((d) => d.key === k)) return k;
    return DANG_BAI[Math.floor(Math.random() * DANG_BAI.length)].key;
}

/** Nhãn tiếng Việt của một dạng bài. */
function nhanDang(key) {
    return (DANG_BAI.find((d) => d.key === key) || {}).vi || 'Văn bản';
}

const NHAN = ['A', 'B', 'C', 'D'];

/**
 * Dọn một câu hỏi AI trả về, bỏ câu nào không dùng được.
 *
 * Kiểm ĐỦ bốn lựa chọn và đáp án nằm trong A–D. Một câu thiếu lựa chọn hoặc có
 * `answer: "E"` mà lọt qua thì người học bấm mãi không đúng được — và không có
 * cách nào biết đó là lỗi của đề chứ không phải của mình.
 */
function donCauHoi(raw) {
    const q = String(raw?.question || '').trim();
    const opts = Array.isArray(raw?.options) ? raw.options.map((o) => String(o || '').trim()) : [];
    const ans = String(raw?.answer || '').trim().toUpperCase();

    if (!q || opts.length !== 4 || opts.some((o) => !o)) return null;
    if (!NHAN.includes(ans)) return null;

    return {
        question: q,
        options: opts,
        answer: ans,
        // Giải thích là thứ biến bài kiểm tra thành bài học — sai mà không biết
        // vì sao thì lần sau vẫn sai đúng chỗ đó.
        explain: String(raw?.explain || '').trim(),
    };
}

/**
 * Sinh một bài đọc kèm câu hỏi.
 *
 * `tuVung` = các từ người học vừa luyện. Bài đọc dùng đúng vốn từ đó nên đọc
 * xong là ôn lại luôn — thay vì gặp một văn bản toàn từ chưa thấy bao giờ.
 */
async function generateReading({ tuVung = [], userId = null, level = 'medium', dang = '', lang = 'en' } = {}) {
    const zh = lang === 'zh';
    const muc = mucKho(level);
    const soCau = CAU_HOI_THEO_MUC[muc];
    const kieu = chuanHoaDang(dang);

    // Lọc và cắt tại đây: danh sách từ do client gửi và đi thẳng vào prompt.
    // Không chặn thì một mảng 500 phần tử thổi bay giới hạn token, và một chuỗi
    // rác thành chỉ thị cho model.
    const tu = (Array.isArray(tuVung) ? tuVung : [])
        .map((t) => String(t || '').trim())
        .filter((t) => t && t.length <= 40)
        .slice(0, 8);

    const doDai = muc === 'easy' ? '80-120' : muc === 'hard' ? '200-260' : '130-180';
    // Chữ Hán đặc hơn từ tiếng Anh: cùng một lượng thông tin cần ít ký tự hơn.
    // Dùng chung con số là bài tiếng Trung dài gấp rưỡi bài tiếng Anh.
    const doDaiZh = muc === 'easy' ? '100-150' : muc === 'hard' ? '250-350' : '160-220';

    // Hai CHUẨN chứ không phải một chuẩn dịch sang hai thứ tiếng — cùng lý do
    // đã tách IELTS/HSK ở Viết luận. Tiếng Trung không có TOEIC; dạng đọc hiểu
    // tương đương là HSK 阅读, và độ dài đo bằng CHỮ HÁN chứ không phải từ.
    const system = [
        zh
            ? 'You write HSK reading comprehension (阅读) items.'
            : 'You write TOEIC Part 7 reading comprehension items.',
        'Return ONLY valid JSON, no markdown fences, no commentary.',
        'Shape: {',
        '  "title": "...",',
        '  "passage": "...",',
        `  "questions": [ { "question": "...", "options": ["...","...","...","..."],`,
        '                  "answer": "A|B|C|D", "explain": "..." } ]',
        '}',
        zh
            // Đơn vị là CHỮ, không phải từ: tiếng Trung không đặt khoảng trắng
            // giữa các từ nên "150 words" là một yêu cầu model không đo được.
            ? `The passage must be a realistic ${kieu} in Simplified Chinese, ${doDaiZh} characters.`
            : `The passage must be a realistic business ${kieu} of ${doDai} words.`,
        `Write exactly ${soCau} questions.`,
        'Each question must have exactly 4 options.',
        // Đây là điều phân biệt Part 7 thật với một bài trắc nghiệm từ vựng:
        // câu hỏi phải BUỘC đọc hiểu, không tra được bằng cách quét một từ.
        'Questions must require understanding the passage — inference, purpose,',
        'or detail synthesis. Never ask about a word\'s dictionary meaning.',
        'Exactly one option is correct; the other three must be plausible.',
        // Giải thích bằng TIẾNG VIỆT: người học chế độ này theo định nghĩa là
        // người chưa đọc vững ngôn ngữ đích; giải thích bằng chính ngôn ngữ đó
        // là thêm một tầng rào cản đúng lúc họ cần hiểu vì sao mình sai.
        'Write "explain" in Vietnamese, one or two sentences, quoting the part',
        'of the passage that proves the answer.',
        zh
            ? 'Keep "title", "passage", "question" and "options" in Simplified Chinese.'
            : 'Keep "title", "passage", "question" and "options" in English.',
    ];

    if (tu.length) {
        system.push(`Naturally use these words in the passage: ${tu.join(', ')}.`);
    }

    const messages = [
        { role: 'system', content: system.join('\n') },
        { role: 'user', content: `Write one TOEIC Part 7 ${kieu} with ${soCau} questions.` },
    ];

    const res = await chatCompletion(messages, {
        maxTokens: 1400,
        temperature: 0.9,   // cao để mỗi lần một bài khác
        feature: 'reading-passage',
        userId,
    });
    if (!res.success) return res;

    const parsed = parseJson(res.content);
    if (!parsed?.passage) {
        return { success: false, error: 'AI trả về bài đọc không đọc được' };
    }

    const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
        .map(donCauHoi)
        .filter(Boolean);

    // Không còn câu nào dùng được → coi như thất bại, KHÔNG trả bài đọc trống
    // câu hỏi: người học đọc xong 200 từ rồi không có gì để làm.
    if (!questions.length) {
        return { success: false, error: 'AI trả về câu hỏi không hợp lệ' };
    }

    return {
        success: true,
        lang: zh ? 'zh' : 'en',
        title: String(parsed.title || '').trim(),
        passage: String(parsed.passage).trim(),
        dang: kieu,
        dangVi: nhanDang(kieu),
        level: muc,
        words: tu,
        questions,
    };
}

/**
 * Chấm bài — so đáp án, KHÔNG gọi AI.
 *
 * `traLoi` là mảng nhãn A–D theo thứ tự câu hỏi; phần tử rỗng = bỏ trống.
 * Bỏ trống tính SAI chứ không bỏ qua: trong đề thi thật không trả lời cũng là
 * mất điểm, và cho qua thì điểm không phản ánh được năng lực.
 */
function gradeReading(questions, traLoi) {
    const qs = Array.isArray(questions) ? questions : [];
    const ans = Array.isArray(traLoi) ? traLoi : [];

    const details = qs.map((q, i) => {
        const chon = String(ans[i] || '').trim().toUpperCase();
        return {
            question: q.question,
            chose: NHAN.includes(chon) ? chon : '',
            answer: q.answer,
            correct: chon === q.answer,
            explain: q.explain || '',
        };
    });

    const correct = details.filter((d) => d.correct).length;
    return {
        details,
        correct,
        total: qs.length,
        // `total` có thể bằng 0 nếu gọi với mảng rỗng — chia thẳng ra NaN, và
        // NaN đi vào công thức thưởng làm XP thành NaN.
        ratio: qs.length ? correct / qs.length : 0,
    };
}

module.exports = {
    generateReading,
    gradeReading,
    donCauHoi,
    mucKho,
    chuanHoaDang,
    nhanDang,
    DANG_BAI,
    CAU_HOI_THEO_MUC,
};
