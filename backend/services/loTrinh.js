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
const LoiOn = require('../models/LoiOn');
const BuoiOnLoi = require('../models/BuoiOnLoi');
const BuoiPhanXa = require('../models/BuoiPhanXa');
const HoSoHocVien = require('../models/HoSoHocVien');
const { tomTatKyNang, chonTrongTam, NGUONG_YEU, NGUONG_VUNG } = require('./hoSoHoc');

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
        (() => {
            // Ôn TỪ sai (chế độ Ôn lại từ sai) và ôn LỖI sai (Kiểm tra lại lỗi đã chữa)
            // gộp một bước: cùng là quay lại chỗ mình từng sai trước khi học cái mới.
            const lan = dem.onSai + (dem.onLoi || 0);
            const denHan = dem.tuDenHan + (dem.loiDenHan || 0);
            return {
                key: 'on-sai',
                soLan: lan,
                // Không có gì đến hạn thì không có gì để ôn — tính là xong.
                xong: lan > 0 || denHan === 0,
                boQua: lan === 0 && denHan === 0,
                tuDenHan: dem.tuDenHan,
                loiDenHan: dem.loiDenHan || 0,
            };
        })(),
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

/**
 * Thứ tự bài của mục tiêu Giao tiếp, theo trình độ (thuần). Nói và phản xạ là chính; mỗi
 * bước có `lyDo` để người học biết vì sao được giao bài này. Đọc, Viết vẫn mở ở menu.
 */
function thuTuGiaoTiep(tomTat) {
    const lay = (key) => tomTat.find((k) => k.key === key);
    const nghe = lay('nghe');
    const noi = lay('noi');
    const khung = tomTat.filter((k) => !['nghe', 'noi'].includes(k.key));
    const khungVung = khung.every((k) => k.duDuLieu && k.diem >= NGUONG_VUNG);
    const noiVung = !!noi?.duDuLieu && noi.diem >= NGUONG_VUNG;
    const ngheYeu = !!nghe?.duDuLieu && nghe.diem < NGUONG_YEU;

    // Khung câu và nói đều vững thì hội thoại thật lên trước; chưa thì dựng phản xạ trước.
    const chinh = khungVung && noiVung ? ['noi', 'phan-xa'] : ['phan-xa', 'noi'];
    // Nghe yếu thì nghe trước khi hội thoại: không nghe được thì không đối đáp được.
    const giua = ngheYeu ? ['nghe', ...chinh] : [...chinh, 'nghe'];
    return ['on-sai', ...giua, 'hoc-tu'];
}

/** Lộ trình theo hồ sơ (thuần). Chỉ đổi thứ tự và lý do; "xong" vẫn đếm từ việc đã làm. */
function dungLoTrinhHoSo(dem, tomTat, trongTam, { ngay, soNgay }) {
    const goc = dungLoTrinh(dem, { ngay, soNgay }).buoc;
    const theoKey = new Map(goc.map((b) => [b.key, b]));
    const noi = tomTat.find((k) => k.key === 'noi');
    const nghe = tomTat.find((k) => k.key === 'nghe');
    const lyDoPhanXa = trongTam
        ? `Trọng tâm: ${trongTam.ten} (${trongTam.diem}/100)${trongTam.cungLapLai ? ' — bài làm gần đây cũng hay sai chỗ này' : ''}.`
        : '';
    const them = {
        'phan-xa': { key: 'phan-xa', soLan: dem.phanXa || 0, xong: (dem.phanXa || 0) > 0, khung: trongTam?.khung || '', lyDo: lyDoPhanXa },
        noi: { ...theoKey.get('noi'), lyDo: noi?.duDuLieu ? `Kỹ năng nói: ${noi.diem}/100.` : 'Dùng câu vừa luyện trong hội thoại thật.' },
        nghe: { ...theoKey.get('nghe'), lyDo: nghe?.duDuLieu ? `Nghe hiểu câu: ${nghe.diem}/100.` : '' },
    };
    const buoc = thuTuGiaoTiep(tomTat).map((k) => them[k] || theoKey.get(k));
    return { ngay, buoc, soXong: buoc.filter((b) => b.xong).length, tong: buoc.length };
}

async function layLoTrinh(userId, now = new Date()) {
    const { dau, ngay, soNgay } = homNayVN(now);
    const profile = await UserProfile.findOne({ userId }).select('settings').lean();
    const lang = profile?.settings?.vocabLang === 'zh' ? 'zh' : 'en';
    const tuNay = { $gte: dau };

    const [onSai, hocTu, nghe, doc, noi, viet, dich, tuDenHan, tongKet, loiDenHan, onLoi, phanXa, hoSo] = await Promise.all([
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
        // Lỗi đã chữa đến hạn kiểm tra lại, và số buổi kiểm tra lại hôm nay đã trả lời.
        LoiOn.countDocuments({ userId, lang, denHan: { $lte: now } }),
        BuoiOnLoi.countDocuments({ userId, createdAt: tuNay, 'cau.daTra': true }),
        BuoiPhanXa.countDocuments({ userId, createdAt: tuNay, 'cau.daTra': true }),
        HoSoHocVien.findOne({ userId }).select('mucTieu testNgay kyNang').lean(),
    ]);
    const dem = { onSai, hocTu, nghe, doc, noi, viet, dich, tuDenHan, loiDenHan, onLoi, phanXa };
    const keHoachTuan = tongKet?.keHoach || [];

    // Chưa có mục tiêu + test (hoặc học tiếng Trung, chưa có kho): giữ lộ trình chung.
    if (lang === 'zh' || hoSo?.mucTieu !== 'giao-tiep' || !hoSo?.testNgay) {
        return { ...dungLoTrinh(dem, { ngay, soNgay }), keHoachTuan, moiLapHoSo: lang !== 'zh' };
    }
    const tomTat = tomTatKyNang(hoSo.kyNang);
    // Nạp trễ vì nhamDiemYeu → tienBo → loTrinh. Lỗi đọc đã được nó tự xử lý (trả rỗng).
    const nham = await require('./nhamDiemYeu').layNham(userId, lang);
    const trongTam = chonTrongTam(tomTat, nham.map((n) => n.key));
    return {
        ...dungLoTrinhHoSo(dem, tomTat, trongTam, { ngay, soNgay }),
        keHoachTuan,
        mucTieu: hoSo.mucTieu,
        trongTam,
    };
}

module.exports = { layLoTrinh, dungLoTrinh, dungLoTrinhHoSo, thuTuGiaoTiep, homNayVN, vietHayDich, dauTuanVN };
