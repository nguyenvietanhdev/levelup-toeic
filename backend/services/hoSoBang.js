/**
 * HỒ SƠ MỤC TIÊU IELTS VÀ HSK — trình độ 4 kỹ năng, đọc từ bài đã làm, không có bài test riêng.
 *
 *   · Viết, Nói: lấy từ các bài AI đã chấm THEO ĐÚNG tiêu chí của mục tiêu (kiểu chấm 'ielts'
 *     hoặc 'hsk'), thang 0–9. Bài chấm kiểu khác không tính: band IELTS mà lấy từ bài chấm kiểu
 *     giao tiếp là sai đơn vị.
 *   · Đọc, Nghe: chỉ có % đúng ở bài luyện của app. Bài luyện không phải đề IELTS hay HSK nên KHÔNG
 *     quy ra band hay cấp: quy đổi như vậy là bịa số.
 *
 * Ước lượng band chung chỉ có với IELTS và chỉ từ Viết + Nói. HSK không quy ra cấp vì app không
 * có cơ sở để quy đổi; người học tự đặt cấp mục tiêu và thấy từng kỹ năng đang ở đâu.
 *
 * Bài mới nặng hơn bài cũ, cùng nhịp với dự đoán điểm TOEIC.
 */
const Essay = require('../models/Essay');
const Conversation = require('../models/Conversation');
const ReadingAttempt = require('../models/ReadingAttempt');
const ListeningSession = require('../models/ListeningSession');

const DECAY = 0.75;
const BAI_TOI_THIEU = 2;
const LAY_TOI_DA = 20;

const CAU_HINH = {
    ielts: { lang: 'en', rubric: 'ielts', ten: 'IELTS' },
    hsk: { lang: 'zh', rubric: 'hsk', ten: 'HSK' },
};
const KY_NANG = [
    { key: 'viet', ten: 'Viết', donVi: '/9', buoc: 'bang-viet' },
    { key: 'noi', ten: 'Nói', donVi: '/9', buoc: 'bang-noi' },
    { key: 'doc', ten: 'Đọc', donVi: '%', buoc: 'doc' },
    { key: 'nghe', ten: 'Nghe', donVi: '%', buoc: 'nghe' },
];

/** Trung bình có trọng số giảm dần (phần tử đầu = mới nhất). */
function tbGiam(ds) {
    let tu = 0;
    let mau = 0;
    ds.forEach((v, i) => {
        const w = DECAY ** i;
        tu += v * w;
        mau += w;
    });
    return mau ? tu / mau : null;
}

const lamTronNua = (n) => Math.round(n * 2) / 2;

/**
 * Điều kiện ngôn ngữ (thuần). Bản ghi cũ không lưu `lang` vì lúc đó app chỉ có tiếng Anh, nên
 * tiếng Anh tính cả bản ghi thiếu trường này.
 */
const theoNgonNgu = (lang) => (lang === 'en' ? { $in: ['en', null] } : 'zh');

/**
 * Kiểu chấm của bài Viết (thuần). Bài trước khi có nhiều kiểu chấm không lưu trường này, và lúc đó
 * bài tiếng Anh chấm theo IELTS, tiếng Trung theo HSK (`DEFAULT_RUBRIC` ở essayGrader), nên vẫn
 * tính. Hội thoại thì không: kiểu mặc định của hội thoại cũ là giao tiếp.
 */
const kieuChamViet = (rubric) => ({ $in: [rubric, null, ''] });

/** Tóm tắt 4 kỹ năng (thuần). Mỗi mảng đã sắp mới nhất trước. */
function tomTatBang({ viet = [], noi = [], doc = [], nghe = [] }) {
    const giaTri = {
        viet: viet.map(Number).filter(Number.isFinite),
        noi: noi.map(Number).filter(Number.isFinite),
        doc: doc.filter((x) => x.tong > 0).map((x) => (x.dung / x.tong) * 100),
        nghe: nghe.map(Number).filter(Number.isFinite),
    };
    return KY_NANG.map((k) => {
        const ds = giaTri[k.key];
        const duDuLieu = ds.length >= BAI_TOI_THIEU;
        const tb = tbGiam(ds);
        const diem = tb === null ? null : (k.donVi === '/9' ? lamTronNua(tb) : Math.round(tb));
        return { ...k, soBai: ds.length, duDuLieu, diem: duDuLieu ? diem : null };
    });
}

/** Ước lượng band IELTS chung từ Viết + Nói, khi cả hai đủ dữ liệu (thuần). */
function uocLuongIelts(kyNang) {
    const vn = kyNang.filter((k) => k.donVi === '/9');
    if (!vn.every((k) => k.duDuLieu)) return null;
    return lamTronNua(vn.reduce((s, k) => s + k.diem, 0) / vn.length);
}

/**
 * Kỹ năng cần luyện tiếp (thuần): kỹ năng chưa đủ dữ liệu trước, Viết và Nói trước Đọc và Nghe
 * vì chỉ hai kỹ năng đó đo theo đúng tiêu chí của mục tiêu. Đủ hết thì chọn kỹ năng thấp nhất,
 * quy về cùng thang 0–100 để so được band với phần trăm.
 */
function chonKyNangTrongTam(kyNang, ten) {
    const chuaCo = kyNang.find((k) => !k.duDuLieu);
    if (chuaCo) {
        return {
            ...chuaCo,
            lyDo: chuaCo.donVi === '/9'
                ? `Chưa đủ bài ${chuaCo.ten} chấm theo tiêu chí ${ten}, làm thêm để hệ thống đánh giá được.`
                : `Chưa đủ bài ${chuaCo.ten} để đánh giá, làm thêm vài bài.`,
        };
    }
    const quy = (k) => (k.donVi === '/9' ? (k.diem / 9) * 100 : k.diem);
    const yeu = [...kyNang].sort((a, b) => quy(a) - quy(b))[0];
    return { ...yeu, lyDo: `${yeu.ten} đang thấp nhất trong 4 kỹ năng (${yeu.diem}${yeu.donVi}).` };
}

async function layHoSoBang(userId, mucTieu, chiTiet = {}) {
    const ch = CAU_HINH[mucTieu];
    if (!ch) return null;
    const { lang, rubric } = ch;
    const [viet, noi, doc, nghe] = await Promise.all([
        Essay.find({ userId, lang: theoNgonNgu(lang), rubric: kieuChamViet(rubric) }).sort({ createdAt: -1 }).limit(LAY_TOI_DA).select('overall').lean(),
        Conversation.find({ userId, lang: theoNgonNgu(lang), rubric, status: 'done' }).sort({ updatedAt: -1 }).limit(LAY_TOI_DA).select('feedback.overall').lean(),
        ReadingAttempt.find({ userId, lang: theoNgonNgu(lang) }).sort({ createdAt: -1 }).limit(LAY_TOI_DA).select('correct total').lean(),
        ListeningSession.find({ userId, lang: theoNgonNgu(lang), status: 'done' }).sort({ updatedAt: -1 }).limit(LAY_TOI_DA).select('score').lean(),
    ]);
    const kyNang = tomTatBang({
        viet: viet.map((b) => b.overall),
        noi: noi.map((b) => b.feedback?.overall),
        doc: doc.map((b) => ({ dung: b.correct || 0, tong: b.total || 0 })),
        nghe: nghe.map((b) => b.score),
    });
    return {
        mucTieu,
        ten: ch.ten,
        rubric,
        diemMucTieu: chiTiet?.[mucTieu] ?? null,
        kyNang,
        uocLuong: mucTieu === 'ielts' ? uocLuongIelts(kyNang) : null,
        trongTam: chonKyNangTrongTam(kyNang, ch.ten),
    };
}

module.exports = { theoNgonNgu, kieuChamViet, layHoSoBang, tomTatBang, uocLuongIelts, chonKyNangTrongTam, CAU_HINH, KY_NANG };
