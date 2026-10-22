/**
 * Chấm cuối phiên hội thoại theo một bộ tiêu chí (giao tiếp / TOEIC / IELTS / HSK).
 *
 * Chỉ chấm được những gì thấy trên CHỮ. Phát âm, ngữ điệu, thanh điệu không có
 * trong bộ nào ở đây, vì chat bằng chữ không thể nghe được chúng.
 *
 * Điểm thang 0–9 cho cả bốn bộ, để so sánh được giữa các bộ. Thang gốc của
 * từng kỳ thi khác nhau — ghi rõ trong phần mô tả để người học hiểu.
 */
const { textCompletion } = require('./aiClient');
const logger = require('../utils/logger');

const BO_TIEU_CHI = {
    giaotiep: {
        label: 'Giao tiếp',
        criteria: [
            { key: 'ro_y', label: 'Rõ ý', mota: 'Người học diễn đạt được điều muốn nói, người nghe hiểu ngay.' },
            { key: 'tu_nhien', label: 'Tự nhiên', mota: 'Cách nói giống người bản xứ trong tình huống đời thường.' },
            { key: 'dung_ngu_canh', label: 'Đúng ngữ cảnh', mota: 'Phù hợp vai trò của người đối thoại và mức trang trọng.' },
            { key: 'tra_loi', label: 'Trả lời đúng câu hỏi', mota: 'Đáp đúng điều AI vừa hỏi, không lạc đề.' },
            { key: 'ngu_phap', label: 'Ngữ pháp', mota: 'Cấu trúc câu đúng. Có thể nới lỏng theo lựa chọn của người học (xem nghiemNguPhap).' },
        ],
    },
    toeic: {
        label: 'TOEIC',
        criteria: [
            { key: 'ngu_phap', label: 'Ngữ pháp', mota: 'Cấu trúc câu đúng, đa dạng; ít lỗi thì. Thang TOEIC Speaking/Writing.' },
            { key: 'mach_lac', label: 'Mạch lạc', mota: 'Các câu nối với nhau, có lý do và ví dụ khi cần.' },
            { key: 'von_tu', label: 'Vốn từ', mota: 'Dùng từ công sở chính xác, không lặp từ đơn điệu.' },
            { key: 'lien_quan', label: 'Liên quan câu hỏi', mota: 'Trả lời đúng trọng tâm câu hỏi công việc.' },
        ],
    },
    ielts: {
        label: 'IELTS',
        criteria: [
            { key: 'mach_lac', label: 'Mạch lạc & liên kết', mota: 'Fluency & Coherence: ý được sắp xếp, có từ nối hợp lý.' },
            { key: 'von_tu', label: 'Vốn từ', mota: 'Lexical Resource: phạm vi từ, độ chính xác và tự nhiên của từ.' },
            { key: 'ngu_phap', label: 'Ngữ pháp', mota: 'Grammatical Range & Accuracy: đa dạng cấu trúc và độ chính xác.' },
        ],
    },
    hsk: {
        label: 'HSK',
        criteria: [
            { key: 'von_tu', label: 'Từ vựng', mota: 'Dùng đúng từ theo chuẩn HSK, phạm vi từ phù hợp trình độ.' },
            { key: 'ngu_phap', label: 'Ngữ pháp', mota: 'Cấu trúc câu đúng, đúng vị trí trạng ngữ và bổ ngữ.' },
            { key: 'luu_loat', label: 'Độ lưu loát', mota: 'Câu nói liền mạch, ít ngắt quãng và lặp lại.' },
        ],
    },
};

const BO_MAC_DINH = 'giaotiep';

/**
 * Bộ tiêu chí áp dụng cho từng ngôn ngữ. TOEIC/IELTS là chuẩn tiếng Anh, HSK là
 * chuẩn tiếng Trung — chấm tiếng Anh theo HSK (hoặc ngược lại) là chấm sai chuẩn.
 */
const BO_THEO_NGON_NGU = {
    en: ['giaotiep', 'toeic', 'ielts'],
    zh: ['giaotiep', 'hsk'],
    // Kho song ngữ Trung–Anh: người học ôn cả hai, nên được chọn mọi bộ.
    bi: ['giaotiep', 'toeic', 'ielts', 'hsk'],
};

/**
 * Mức chấm (easy / medium / hard) hiểu THEO TỪNG BỘ. Cùng khoá `level` được dùng
 * cho cả hai việc: điều chỉnh độ phức tạp lời AI và quy điểm về ngưỡng đạt.
 *
 * `nguong` là điểm tối thiểu trên thang 0–9 để được "Đạt". Đây là quy đổi ước
 * lượng từ mốc hiển thị (vd TOEIC 600–700 ~ 6.0), không phải chuẩn chính thức.
 */
const MUC_CHAM = {
    giaotiep: {
        easy: { label: 'Dễ', nguong: 4, mota: 'Câu ngắn, nói đủ ý, chấp nhận lỗi nhỏ.' },
        medium: { label: 'Vừa', nguong: 5.5, mota: 'Câu đầy đủ, tự nhiên, đúng ngữ cảnh.' },
        hard: { label: 'Khó', nguong: 7, mota: 'Câu linh hoạt, tự nhiên như người bản xứ.' },
    },
    toeic: {
        easy: { label: '400–500', nguong: 4, mota: 'Ngữ pháp cơ bản đúng, từ công sở đơn giản.' },
        medium: { label: '600–700', nguong: 6, mota: 'Ngữ pháp đa dạng hơn, từ công sở chính xác.' },
        hard: { label: '800+', nguong: 7.5, mota: 'Ngữ pháp chắc, vốn từ công sở phong phú, mạch lạc tốt.' },
    },
    ielts: {
        easy: { label: 'Band 5.0–5.5', nguong: 5, mota: 'Ý rõ, ngữ pháp và từ vựng đủ dùng.' },
        medium: { label: 'Band 6.0–6.5', nguong: 6, mota: 'Mạch lạc, từ vựng đa dạng, ngữ pháp đa dạng.' },
        hard: { label: 'Band 7.0+', nguong: 7, mota: 'Từ vựng tinh tế, cấu trúc phức, ít lỗi.' },
    },
    hsk: {
        easy: { label: 'HSK 2–3', nguong: 4, mota: 'Câu đơn giản, từ thường dùng.' },
        medium: { label: 'HSK 4', nguong: 5.5, mota: 'Câu dài hơn, dùng bổ ngữ và trạng ngữ.' },
        hard: { label: 'HSK 5+', nguong: 7, mota: 'Câu phức, từ vựng rộng, lưu loát.' },
    },
};

const MUC_MAC_DINH = 'medium';

/** Bảng mức của đúng bộ đã cho (khoá đã là mã bộ, không đi qua chuẩn hoá theo ngôn ngữ). */
function mucCuaBo(rubric) {
    return Object.prototype.hasOwnProperty.call(MUC_CHAM, rubric)
        ? MUC_CHAM[rubric] : MUC_CHAM[BO_MAC_DINH];
}

/** Mức chấm hợp lệ cho bộ đó, hoặc mức vừa. Chỉ nhận khoá có trong bảng. */
function chuanHoaMucCham(rubric, level) {
    const bo = mucCuaBo(rubric);
    return Object.prototype.hasOwnProperty.call(bo, level) ? level : MUC_MAC_DINH;
}

/** Dòng mô tả mức cho prompt (tiếng Anh, vì prompt viết bằng tiếng Anh). */
function moTaMucChamPrompt(rubric, level) {
    const m = mucCuaBo(rubric)[chuanHoaMucCham(rubric, level)];
    return `Expected level: ${m.label}. ${m.mota}`;
}

/**
 * Mã bộ tiêu chí hợp lệ CHO NGÔN NGỮ ĐÓ, hoặc mặc định. Chọn sai cặp (vd HSK
 * cho tiếng Anh) thì rơi về Giao tiếp — không báo lỗi, không chấm sai chuẩn.
 */
function chuanHoaBoTieuChi(ma, track = 'en') {
    if (typeof ma !== 'string') return BO_MAC_DINH;
    const cho = Object.prototype.hasOwnProperty.call(BO_THEO_NGON_NGU, track)
        ? BO_THEO_NGON_NGU[track] : BO_THEO_NGON_NGU.en;
    if (!cho.includes(ma)) return BO_MAC_DINH;
    return Object.prototype.hasOwnProperty.call(BO_TIEU_CHI, ma) ? ma : BO_MAC_DINH;
}

/**
 * Prompt chấm. Chỉ chấm lời NGƯỜI HỌC (lượt `user`); lời AI chỉ để hiểu ngữ cảnh.
 * Nhận xét viết bằng tiếng Việt vì người học đọc tiếng Việt.
 */
function buildGradingMessages({ rubric, lang, track, level, turns, nghiemNguPhap = false }) {
    const ma = chuanHoaBoTieuChi(rubric, track || lang);
    const bo = BO_TIEU_CHI[ma];
    // Ngữ pháp của Giao tiếp là văn NÓI: mặc định nới lỏng để không phạt lối nói
    // đời thường. Người học có thể bật chấm nghiêm theo chuẩn viết.
    const luatNguPhap = ma === 'giaotiep'
        ? (nghiemNguPhap
            ? 'Grammar: judge against standard written English. Count every error.'
            : 'Grammar: this is spoken conversation. Do NOT penalize contractions, slang, abbreviations or everyday spoken forms (e.g. "gonna", "wanna", "u", dropped articles in casual speech). Lower the grammar score only for errors that actually hurt understanding.')
        : '';
    const ngonNgu = lang === 'zh' ? 'Chinese' : 'English';
    const transcript = turns
        .map((t) => `${t.role === 'user' ? 'LEARNER' : 'PARTNER'}: ${t.content}`)
        .join('\n');
    const danhSach = bo.criteria.map((c) => `- ${c.key} (${c.label}): ${c.mota}`).join('\n');

    return [
        {
            role: 'system',
            content: [
                `You are an examiner grading a ${ngonNgu} conversation for the "${bo.label}" rubric.`,
                'Grade ONLY the LEARNER lines. PARTNER lines show context and must not be graded.',
                moTaMucChamPrompt(ma, level),
                luatNguPhap,
                'Score every criterion from 0 to 9 (integers) AGAINST THAT expected level. Do not grade pronunciation or intonation: they are not visible in text.',
                '',
                'Criteria:',
                danhSach,
                '',
                'Reply with JSON only, no prose around it, in exactly this shape:',
                '{"criteria":[{"key":"<key>","score":<0-9>,"comment":"<one short Vietnamese sentence>"}],"summary":"<two short Vietnamese sentences>"}',
                'Include every criterion key once. Comments and summary are in Vietnamese.',
            ].join('\n'),
        },
        { role: 'user', content: `Transcript:\n${transcript}` },
    ];
}

/**
 * Đọc JSON từ câu trả lời của model. Model hay bọc trong ```json ... ``` nên bóc
 * hàng rào trước khi parse, rồi kiểm từng trường — không tin hình dạng đầu ra.
 */
function parseGrading(text, rubric, track = 'en', level = MUC_MAC_DINH) {
    const ma = chuanHoaBoTieuChi(rubric, track);
    const mucKey = chuanHoaMucCham(ma, level);
    const muc = mucCuaBo(ma)[mucKey];
    const bo = BO_TIEU_CHI[ma];
    let raw = String(text || '').trim();
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) raw = fence[1].trim();
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end < start) return null;

    let obj;
    try { obj = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }

    const byKey = new Map(
        (Array.isArray(obj.criteria) ? obj.criteria : [])
            .filter((c) => c && typeof c.key === 'string')
            .map((c) => [c.key, c]),
    );
    const criteria = bo.criteria.map((def) => {
        const got = byKey.get(def.key);
        const diem = Number(got?.score);
        return {
            key: def.key,
            label: def.label,
            score: Number.isFinite(diem) ? Math.min(9, Math.max(0, Math.round(diem))) : null,
            comment: typeof got?.comment === 'string' ? got.comment.slice(0, 300) : '',
        };
    });
    const co = criteria.filter((c) => c.score !== null);
    if (co.length === 0) return null;   // không có điểm nào thì coi như không chấm được

    const overall = Math.round((co.reduce((s, c) => s + c.score, 0) / co.length) * 10) / 10;
    return {
        rubric: ma,
        label: bo.label,
        // Mức đã chọn và ngưỡng đạt của mức đó. `dat` = điểm tổng ≥ ngưỡng.
        level: mucKey,
        muc: muc.label,
        nguong: muc.nguong,
        dat: overall >= muc.nguong,
        criteria,
        overall,
        summary: typeof obj.summary === 'string' ? obj.summary.slice(0, 600) : '',
    };
}

/**
 * Chấm cả phiên. Trả về `null` khi không chấm được — việc chấm là phần thêm vào,
 * không được làm hỏng việc nhận thưởng từ vựng.
 */
async function gradeConversation({ rubric, lang, track, level, turns, nghiemNguPhap = false, userId = null }) {
    const hasLearner = turns.some((t) => t.role === 'user');
    if (!hasLearner) return null;

    const out = await textCompletion({
        feature: 'conversation-grade',
        messages: buildGradingMessages({ rubric, lang, track, level, turns, nghiemNguPhap }),
        maxTokens: 500,
        temperature: 0,
        userId,
    }).catch((err) => {
        logger.error('Chấm hội thoại lỗi', { error: err?.message });
        return null;
    });
    if (!out) return null;
    return parseGrading(out.text, rubric, track || lang, level);
}

module.exports = {
    BO_TIEU_CHI,
    BO_MAC_DINH,
    BO_THEO_NGON_NGU,
    MUC_CHAM,
    chuanHoaBoTieuChi,
    chuanHoaMucCham,
    buildGradingMessages,
    parseGrading,
    gradeConversation,
};
