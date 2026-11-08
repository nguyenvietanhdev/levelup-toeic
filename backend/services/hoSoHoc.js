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
const { KHUNG, KHUNG_ZH } = require('./phanXaKho');

const KHUNG_KEYS = KHUNG.map((k) => k.key);
const KY_NANG = [
    ...KHUNG.map((k) => ({ key: k.key, ten: k.ten, icon: k.icon })),
    { key: 'nghe', ten: 'Nghe hiểu câu', icon: 'fa-headphones' },
    { key: 'noi', ten: 'Nói thành câu', icon: 'fa-microphone-lines' },
];
/**
 * Khung Phản xạ câu tiếng Trung: GHI được điểm (để dành cho hồ sơ HSK), nhưng chưa vào
 * `KY_NANG` — danh sách đó là hồ sơ Giao tiếp tiếng Anh, thêm vào thì người học tiếng Anh
 * thấy cả khung tiếng Trung và lộ trình có thể chọn nhầm trọng tâm.
 */
const KY_NANG_ZH = [
    ...KHUNG_ZH.map((k) => ({ key: k.key, ten: k.ten, icon: k.icon })),
    { key: 'zh-nghe', ten: 'Nghe hiểu câu', icon: 'fa-headphones' },
    { key: 'zh-noi', ten: 'Nói thành câu', icon: 'fa-microphone-lines' },
];
const KHUNG_KEYS_ZH = KHUNG_ZH.map((k) => k.key);
const kyNangCua = (lang) => (lang === 'zh' ? KY_NANG_ZH : KY_NANG);
const TEN_KY_NANG = new Map([...KY_NANG, ...KY_NANG_ZH].map((k) => [k.key, k.ten]));

const GIAM = 0.9;
const NGUONG_YEU = 50;
const NGUONG_VUNG = 75;
const DU_DU_LIEU = 3;
/** Các mục tiêu và ngôn ngữ học mà mỗi mục tiêu cần. */
const MUC_TIEU_MO = ['giao-tiep', 'toeic', 'ielts', 'hsk'];
const NGON_NGU_CUA = { 'giao-tiep': 'en', toeic: 'en', ielts: 'en', hsk: 'zh' };
const TEN_NGON_NGU = { en: 'tiếng Anh', zh: 'tiếng Trung' };

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
function tomTatKyNang(kyNang = {}, lang = 'en') {
    return kyNangCua(lang).map((k) => {
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
function chonTrongTam(tomTat, loiGanDay = [], khungKeys = KHUNG_KEYS) {
    const lapLai = new Set(loiGanDay.map((l) => LOI_THEO_KHUNG[l]).filter(Boolean));
    const ds = tomTat
        .filter((k) => khungKeys.includes(k.key))
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

/**
 * Nền tảng câu tiếng Trung từ test đầu vào HSK và Phản xạ câu tiếng Trung (thuần). Cùng
 * cách tính với hồ sơ Giao tiếp, nhưng trên bộ khung tiếng Trung và phần lưu riêng.
 */
function nenTangZh(doc) {
    const kyNang = tomTatKyNang(doc?.kyNang, 'zh');
    return {
        testNgay: doc?.testNgayZh || null,
        kyNang,
        trinhDo: tongQuanTrinhDo(kyNang),
        chanDoan: doc?.chanDoanZh || [],
        soVoiTruoc: soSanhTest(doc?.lichSuTestZh),
        trongTam: chonTrongTam(kyNang, [], KHUNG_KEYS_ZH),
    };
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
        ...(['ielts', 'hsk'].includes(doc?.mucTieu)
            ? { bang: await require('./hoSoBang').layHoSoBang(userId, doc.mucTieu, doc.chiTiet) }
            : {}),
        ...(doc?.mucTieu === 'hsk' ? { nenTang: nenTangZh(doc) } : {}),
    };
}

/** Điểm TOEIC hợp lệ: 0 (chưa đặt) đến 990, là bội của 5 (thuần). */
const diemHopLe = (d) => Number.isInteger(d) && d >= 0 && d <= 990 && d % 5 === 0;

/** Mức muốn đạt hợp lệ cho IELTS (band 4.0–9.0, bước 0.5) và HSK (cấp 1–6). 0 = chưa đặt (thuần). */
const MUC_HOP_LE = {
    ielts: (d) => d === 0 || (Number.isFinite(d) && d >= 4 && d <= 9 && Number.isInteger(d * 2)),
    hsk: (d) => Number.isInteger(d) && d >= 0 && d <= 6,
};

/**
 * Đặt mục tiêu. Mục tiêu phải khớp ngôn ngữ đang học: chọn HSK khi đang học tiếng Anh thì mọi
 * bài làm vẫn là tiếng Anh và hồ sơ HSK sẽ trống mãi. Học cả hai ngôn ngữ thì chọn được mọi mục tiêu.
 */
async function datMucTieu(userId, mucTieu, { diemMucTieu } = {}) {
    if (!MUC_TIEU_MO.includes(mucTieu)) return { loi: 'Mục tiêu này chưa được hỗ trợ.', ma: 400 };
    const p = await UserProfile.findOne({ userId }).select('settings.vocabLang').lean();
    const dangHoc = p?.settings?.vocabLang || 'en';
    const can = NGON_NGU_CUA[mucTieu];
    if (dangHoc !== 'bi' && dangHoc !== can) {
        return {
            loi: `Mục tiêu này dùng ${TEN_NGON_NGU[can]}. Hãy đổi ngôn ngữ học sang ${TEN_NGON_NGU[can]} ở thanh trên cùng rồi chọn lại.`,
            ma: 400,
        };
    }
    const doi = { mucTieu };
    if (MUC_HOP_LE[mucTieu]?.(diemMucTieu)) doi[`chiTiet.${mucTieu}`] = diemMucTieu;
    await HoSoHocVien.updateOne({ userId }, { $set: doi }, { upsert: true });
    // Dùng chung cài đặt đã có ở màn Cài đặt để không có hai "điểm mục tiêu" khác nhau.
    if (mucTieu === 'toeic' && diemHopLe(diemMucTieu)) {
        await UserProfile.updateOne({ userId }, { $set: { 'settings.toeicTargetScore': diemMucTieu } });
    }
    return { ok: true };
}

module.exports = {
    KY_NANG, KY_NANG_ZH, KHUNG_KEYS_ZH, TEN_KY_NANG, MUC_TIEU_MO, NGUONG_YEU, NGUONG_VUNG, nenTangZh,
    capNhatKyNang, diemCua, mucCua, tomTatKyNang, tongQuanTrinhDo, chonTrongTam, anhKyNang, soSanhTest,
    ghiKetQua, layHoSo, datMucTieu,
};
