/**
 * HỒ SƠ NGƯỜI HỌC — mục tiêu và trình độ theo từng kỹ năng con, nguồn chung để lộ trình
 * biết cần giao bài gì.
 *
 * Điểm và trọng tâm tính bằng LUẬT, không nhờ AI: rẻ, test được, và luôn giải thích được
 * vì sao hệ thống giao bài đó. AI chỉ chấm câu trả lời tự do.
 *
 * Điểm mỗi kỹ năng: số đúng/sai giảm dần (câu cũ nhẹ dần) cộng một giả định trung lập,
 * để một câu may rủi không đẩy điểm lên 0 hay 100.
 */
const HoSoHocVien = require('../models/HoSoHocVien');
const UserProfile = require('../models/UserProfile');
const { KHUNG } = require('./phanXaKho');

const KHUNG_KEYS = KHUNG.map((k) => k.key);
const KY_NANG = [
    ...KHUNG.map((k) => ({ key: k.key, ten: k.ten, icon: k.icon })),
    { key: 'nghe', ten: 'Nghe hiểu câu', icon: 'fa-headphones' },
    { key: 'noi', ten: 'Nói thành câu', icon: 'fa-microphone-lines' },
];
const TEN_KY_NANG = new Map(KY_NANG.map((k) => [k.key, k.ten]));

const GIAM = 0.9;
const NGUONG_YEU = 50;
const NGUONG_VUNG = 75;
const DU_DU_LIEU = 3;
/** Chỉ mục tiêu có đủ nội dung và lộ trình riêng mới chọn được; IELTS, HSK mở khi có. */
const MUC_TIEU_MO = ['giao-tiep', 'toeic'];

function capNhatKyNang(k, dung, now = new Date()) {
    return {
        d: (k?.d || 0) * GIAM + (dung ? 1 : 0),
        s: (k?.s || 0) * GIAM + (dung ? 0 : 1),
        soLan: (k?.soLan || 0) + 1,
        capNhat: now,
    };
}

const diemCua = (k) => Math.round((100 * ((k?.d || 0) + 1)) / ((k?.d || 0) + (k?.s || 0) + 2));

function mucCua(diem) {
    if (diem < NGUONG_YEU) return 'yeu';
    return diem < NGUONG_VUNG ? 'dang-len' : 'vung';
}

/** Tóm tắt để hiển thị. Ít dữ liệu thì báo chưa đủ, không đoán. */
function tomTatKyNang(kyNang = {}) {
    return KY_NANG.map((k) => {
        const x = kyNang[k.key];
        const duDuLieu = (x?.soLan || 0) >= DU_DU_LIEU;
        const diem = diemCua(x);
        return { ...k, diem, soLan: x?.soLan || 0, duDuLieu, muc: duDuLieu ? mucCua(diem) : 'chua-du' };
    });
}

/** Trình độ chung — chỉ là ước lượng từ các kỹ năng đã đủ dữ liệu. */
function tongQuanTrinhDo(tomTat) {
    const du = tomTat.filter((k) => k.duDuLieu);
    if (!du.length) return { diem: 0, nhan: 'Chưa đủ dữ liệu' };
    const diem = Math.round(du.reduce((s, k) => s + k.diem, 0) / du.length);
    let nhan = 'Khá';
    if (diem < 45) nhan = 'Mới bắt đầu';
    else if (diem < 70) nhan = 'Cơ bản';
    return { diem, nhan };
}

/** Điểm từng kỹ năng đã đủ dữ liệu, lưu kèm mỗi lần test để so sánh về sau. */
function anhKyNang(tomTat) {
    return Object.fromEntries(tomTat.filter((k) => k.duDuLieu).map((k) => [k.key, k.diem]));
}

/**
 * Chênh lệch giữa hai lần test gần nhất, CHỈ trên các kỹ năng có ở cả hai lần (thuần).
 * So điểm chung sẽ sai khi lần sau có thêm kỹ năng mới: thêm Nói điểm thấp làm điểm tụt
 * dù không kỹ năng nào giảm. Bản ghi cũ không có điểm từng kỹ năng thì không so.
 */
function soSanhTest(lich = []) {
    const [truoc, sau] = lich.slice(-2);
    if (!sau || !truoc?.theoKyNang || !sau.theoKyNang) return null;
    const chung = Object.keys(sau.theoKyNang).filter((k) => k in truoc.theoKyNang);
    if (!chung.length) return null;
    const tong = chung.reduce((s, k) => s + sau.theoKyNang[k] - truoc.theoKyNang[k], 0);
    return { chenh: Math.round(tong / chung.length), soKyNang: chung.length };
}

/** Lỗi bài làm AI → khung câu tương ứng. Chỉ nối những cặp chắc chắn cùng một vấn đề. */
const LOI_THEO_KHUNG = { tense: 'qua-khu', 'literal-translation': 'khung-cau' };

/**
 * Chọn khung cần luyện nhất: điểm thấp nhất; khung cũng đang hay sai trong bài viết/nói
 * thì được ưu tiên thêm, vì hai nguồn cùng chỉ một chỗ.
 */
function chonTrongTam(tomTat, loiGanDay = []) {
    const lapLai = new Set(loiGanDay.map((l) => LOI_THEO_KHUNG[l]).filter(Boolean));
    const ds = tomTat
        .filter((k) => KHUNG_KEYS.includes(k.key))
        .map((k) => ({ ...k, uuTien: k.diem - (lapLai.has(k.key) ? 15 : 0) }))
        .sort((a, b) => a.uuTien - b.uuTien);
    if (!ds.length) return null;
    const { key, ten, diem } = ds[0];
    return { khung: key, ten, diem, cungLapLai: lapLai.has(key) };
}

/** Ghi nhiều kết quả. Chỉ đụng kỹ năng có thay đổi để không đè kết quả của nơi khác. */
async function ghiKetQua(userId, ketQua, now = new Date()) {
    if (!ketQua.length) return;
    const doc = await HoSoHocVien.findOne({ userId }).select('kyNang').lean();
    const ky = { ...(doc?.kyNang || {}) };
    const doi = {};
    for (const { kyNang, dung } of ketQua) {
        if (!TEN_KY_NANG.has(kyNang)) continue;
        ky[kyNang] = capNhatKyNang(ky[kyNang], dung, now);
        doi[`kyNang.${kyNang}`] = ky[kyNang];
    }
    if (Object.keys(doi).length) await HoSoHocVien.updateOne({ userId }, { $set: doi }, { upsert: true });
}

async function layHoSo(userId) {
    const doc = await HoSoHocVien.findOne({ userId }).lean();
    const kyNang = tomTatKyNang(doc?.kyNang);
    return {
        mucTieu: doc?.mucTieu || '',
        testNgay: doc?.testNgay || null,
        kyNang,
        trinhDo: tongQuanTrinhDo(kyNang),
        chanDoan: doc?.chanDoan || [],
        lichSuTest: doc?.lichSuTest || [],
        soVoiTruoc: soSanhTest(doc?.lichSuTest),
        // Nạp trễ: chỉ đọc lịch sử thi khi đang theo mục tiêu này.
        ...(doc?.mucTieu === 'toeic' ? { toeic: await require('./hoSoToeic').layHoSoToeic(userId) } : {}),
    };
}

/** Điểm TOEIC hợp lệ: 0 (chưa đặt) đến 990, là bội của 5 (thuần). */
const diemHopLe = (d) => Number.isInteger(d) && d >= 0 && d <= 990 && d % 5 === 0;

async function datMucTieu(userId, mucTieu, { diemMucTieu } = {}) {
    if (!MUC_TIEU_MO.includes(mucTieu)) return false;
    await HoSoHocVien.updateOne({ userId }, { $set: { mucTieu } }, { upsert: true });
    // Dùng chung cài đặt đã có ở màn Cài đặt để không có hai "điểm mục tiêu" khác nhau.
    if (mucTieu === 'toeic' && diemHopLe(diemMucTieu)) {
        await UserProfile.updateOne({ userId }, { $set: { 'settings.toeicTargetScore': diemMucTieu } });
    }
    return true;
}

module.exports = {
    KY_NANG, TEN_KY_NANG, MUC_TIEU_MO, NGUONG_YEU, NGUONG_VUNG,
    capNhatKyNang, diemCua, mucCua, tomTatKyNang, tongQuanTrinhDo, chonTrongTam, anhKyNang, soSanhTest,
    ghiKetQua, layHoSo, datMucTieu,
};
