/**
 * "Lộ trình hôm nay": dẫn người học đi qua các kỹ năng với CÙNG bộ từ của Part.
 *
 * Thứ tự đi từ tiếp nhận tới tạo ra — gặp từ vài lần trước khi phải tự dùng nó:
 *   1. Ôn sai  → 2. Học từ → 3. Nghe → 4. Đọc hiểu → 5. Nói → 6. Viết hoặc Dịch.
 *
 * Tiến độ tính TỪ DỮ LIỆU ĐÃ CÓ trên server (lượt luyện, phiên hội thoại, bài đọc…),
 * không lưu thêm gì: không thể "đánh dấu xong" mà chưa làm, và không lệch giữa
 * các thiết bị. "Hôm nay" theo giờ Việt Nam.
 */
const PracticeSession = require('../models/PracticeSession');
const Conversation = require('../models/Conversation');
const ListeningSession = require('../models/ListeningSession');
const ReadingAttempt = require('../models/ReadingAttempt');
const Essay = require('../models/Essay');
const Translation = require('../models/Translation');
const WrongWord = require('../models/WrongWord');
const UserProfile = require('../models/UserProfile');
const TongKetTuan = require('../models/TongKetTuan');

/** Giờ Việt Nam = UTC+7, không đổi theo mùa. */
const LECH_GIO_VN = 7 * 60 * 60 * 1000;
const MOT_NGAY = 24 * 60 * 60 * 1000;

/** Mốc 00:00 hôm nay theo giờ Việt Nam (dạng Date UTC) và chuỗi ngày 'YYYY-MM-DD'. */
function homNayVN(now = new Date()) {
    const vn = now.getTime() + LECH_GIO_VN;
    const soNgay = Math.floor(vn / MOT_NGAY);
    const dau = new Date(soNgay * MOT_NGAY - LECH_GIO_VN);
    const ngay = new Date(soNgay * MOT_NGAY).toISOString().slice(0, 10);
    return { dau, ngay, soNgay };
}

/** Ngày thứ Hai đầu tuần (giờ VN) dạng 'YYYY-MM-DD' — khoá tuần của Tổng kết tuần. */
function dauTuanVN(now = new Date()) {
    const { soNgay } = homNayVN(now);
    // Ngày 0 (01/01/1970) là thứ Năm → (soNgay + 3) % 7 = 0 vào thứ Hai.
    const thuHai = soNgay - ((soNgay + 3) % 7);
    return new Date(thuHai * MOT_NGAY).toISOString().slice(0, 10);
}

/**
 * Bước 6 đổi xen kẽ theo ngày: viết một ngày, dịch ngày sau — hai kỹ năng tạo câu
 * bổ trợ nhau, làm cả hai mỗi ngày thì quá tải.
 */
function vietHayDich(soNgay) {
    return soNgay % 2 === 0 ? 'viet' : 'dich';
}

/**
 * Dựng lộ trình từ các con số đếm được (thuần — test được không cần DB).
 *
 * @param {object} dem  số lượt hôm nay của từng việc + `tuDenHan` (từ sai đến hạn ôn)
 */
function dungLoTrinh(dem, { ngay, soNgay }) {
    const goiY = vietHayDich(soNgay);
    const buoc = [
        {
            key: 'on-sai',
            soLan: dem.onSai,
            // Không có từ nào đến hạn thì không có gì để ôn — tính là xong.
            xong: dem.onSai > 0 || dem.tuDenHan === 0,
            boQua: dem.onSai === 0 && dem.tuDenHan === 0,
            tuDenHan: dem.tuDenHan,
        },
        { key: 'hoc-tu', soLan: dem.hocTu, xong: dem.hocTu > 0 },
        { key: 'nghe', soLan: dem.nghe, xong: dem.nghe > 0 },
        { key: 'doc', soLan: dem.doc, xong: dem.doc > 0 },
        { key: 'noi', soLan: dem.noi, xong: dem.noi > 0 },
        {
            key: 'viet-dich',
            soLan: dem.viet + dem.dich,
            // Làm cái nào trong hai cũng tính — gợi ý chỉ để đổi xen kẽ, không bắt buộc.
            xong: dem.viet + dem.dich > 0,
            goiY,
        },
    ];
    return { ngay, buoc, soXong: buoc.filter((b) => b.xong).length, tong: buoc.length };
}

async function layLoTrinh(userId, now = new Date()) {
    const { dau, ngay, soNgay } = homNayVN(now);
    const profile = await UserProfile.findOne({ userId }).select('settings').lean();
    const lang = profile?.settings?.vocabLang === 'zh' ? 'zh' : 'en';
    const tuNay = { $gte: dau };

    const [onSai, hocTu, nghe, doc, noi, viet, dich, tuDenHan, tongKet] = await Promise.all([
        PracticeSession.countDocuments({ user: userId, mode: 'review-mistakes', completedAt: tuNay }),
        PracticeSession.countDocuments({ user: userId, mode: { $ne: 'review-mistakes' }, completedAt: tuNay }),
        ListeningSession.countDocuments({ userId, status: 'done', updatedAt: tuNay }),
        ReadingAttempt.countDocuments({ userId, createdAt: tuNay }),
        Conversation.countDocuments({ userId, status: 'done', updatedAt: tuNay }),
        Essay.countDocuments({ userId, createdAt: tuNay }),
        Translation.countDocuments({ userId, createdAt: tuNay }),
        WrongWord.countDocuments({
            userId, status: 'active', nextReviewDate: { $lte: now }, ...WrongWord.langFilter(lang),
        }),
        // Kế hoạch tuần do "Tổng kết tuần" (AI) đề ra — chỉ đọc, chưa tổng kết thì rỗng.
        TongKetTuan.findOne({ userId, tuan: dauTuanVN(now), lang }).select('keHoach').lean(),
    ]);

    return {
        ...dungLoTrinh({ onSai, hocTu, nghe, doc, noi, viet, dich, tuDenHan }, { ngay, soNgay }),
        keHoachTuan: tongKet?.keHoach || [],
    };
}

module.exports = { layLoTrinh, dungLoTrinh, homNayVN, vietHayDich, dauTuanVN };
