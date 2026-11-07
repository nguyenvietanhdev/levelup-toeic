/**
 * HỒ SƠ NĂNG LỰC — một trang gộp mọi thứ hệ thống biết về người học.
 *
 * Không tính lại gì: chỉ đọc từ các nguồn đã có (hồ sơ trình độ, TOEIC, tiến bộ 8 tuần, Phản xạ
 * câu, ngữ pháp, từ vựng) để mỗi con số chỉ có MỘT nơi tính. Hai màn khác nhau không được nói hai
 * điều khác nhau về cùng một kỹ năng.
 *
 * Điểm mạnh và điểm cần cải thiện rút ra bằng luật, mỗi điều kèm nguồn để người học bấm vào luyện
 * ngay. Chỉ nói khi đủ dữ liệu: thà ít mà đúng còn hơn nhiều mà đoán.
 */
const UserProfile = require('../models/UserProfile');
const UserStats = require('../models/UserStats');
const PhanXaTienDo = require('../models/PhanXaTienDo');
const NguPhapTienDo = require('../models/NguPhapTienDo');
const { layHoSo } = require('./hoSoHoc');
const { layHoSoToeic } = require('./hoSoToeic');
const { layTienBo } = require('./tienBo');
const { TAT_CA: CAU_PHAN_XA } = require('./phanXaKho');
const { MUC: MUC_NGU_PHAP } = require('./nguPhapKho');

const TOI_DA_MUC = 4;
/** Part TOEIC có tỉ lệ đúng từ mức này là điểm mạnh. */
const PART_MANH = 75;

/** Rút điểm mạnh và điểm cần cải thiện (thuần). Mỗi điều có `loai` + `key` để mở đúng chỗ luyện. */
function rutNhanXet({ kyNangCon = [], kyNang = [], diemYeuTienBo = [], toeic = null }) {
    const manh = [];
    const yeu = [];

    for (const k of kyNangCon) {
        if (k.muc === 'vung') manh.push({ chu: `${k.ten}: đã vững (${k.diem}/100)`, loai: 'ky-nang-con', key: k.key });
        if (k.muc === 'yeu') yeu.push({ chu: `${k.ten}: còn yếu (${k.diem}/100)`, loai: 'ky-nang-con', key: k.key });
    }
    for (const k of kyNang) {
        if (k.xuHuong === 'len') manh.push({ chu: `${k.ten} đang tiến bộ trong 4 tuần gần đây`, loai: 'ky-nang', key: k.key });
        if (k.xuHuong === 'xuong') yeu.push({ chu: `${k.ten} đang đi xuống trong 4 tuần gần đây`, loai: 'ky-nang', key: k.key });
    }
    for (const d of diemYeuTienBo) {
        if (d.loai === 'ngu-phap') yeu.push({ chu: `Hay sai: ${d.vi}`, loai: 'loi', key: d.key });
    }
    if (toeic?.soBai) {
        const tot = toeic.parts.filter((p) => p.duDuLieu && p.doChinhXac >= PART_MANH);
        for (const p of tot) manh.push({ chu: `TOEIC Part ${p.part} (${p.ten}): đúng ${p.doChinhXac}%`, loai: 'toeic-part', key: p.part });
        const tt = toeic.trongTam;
        if (tt && toeic.parts.find((p) => p.part === tt.part)?.duDuLieu) {
            yeu.push({ chu: `TOEIC Part ${tt.part} (${tt.ten}) đang mất nhiều câu nhất`, loai: 'toeic-part', key: tt.part });
        }
    }
    // Cùng một kỹ năng không được vừa mạnh vừa yếu: dữ liệu mâu thuẫn thì không kết luận.
    const khoa = (x) => `${x.loai}|${x.key}`;
    const yeuKhoa = new Set(yeu.map(khoa));
    const manhLoc = manh.filter((x) => !yeuKhoa.has(khoa(x)));
    const manhKhoa = new Set(manh.map(khoa));
    return {
        diemManh: manhLoc.slice(0, TOI_DA_MUC),
        canCaiThien: yeu.filter((x) => !manhKhoa.has(khoa(x))).slice(0, TOI_DA_MUC),
    };
}

/** Gộp các nguồn thành dữ liệu cho trang (thuần). */
function tongHop({ hoSo, tienBo, toeic, phanXaDaThuoc = 0, nguPhap = {}, taiKhoan = {} }) {
    const coToeic = !!toeic?.soBai;
    const kyNang = (tienBo?.kyNang || []).map((k) => ({
        key: k.key, ten: k.ten, icon: k.icon, donVi: k.donVi, ganDay: k.ganDay, xuHuong: k.xuHuong, soLuot: k.soLuot,
    }));
    const kyNangCon = hoSo?.kyNang || [];
    const nhanXet = rutNhanXet({ kyNangCon, kyNang, diemYeuTienBo: tienBo?.diemYeu || [], toeic: coToeic ? toeic : null });
    return {
        tongQuan: {
            mucTieu: hoSo?.mucTieu || '',
            trinhDo: hoSo?.trinhDo || { diem: 0, nhan: 'Chưa đủ dữ liệu' },
            level: taiKhoan.level || 1,
            streak: taiKhoan.streak || 0,
        },
        ...nhanXet,
        kyNang,
        kyNangCon,
        toeic: coToeic
            ? {
                soBai: toeic.soBai,
                diemMucTieu: toeic.diemMucTieu,
                duDoan: toeic.duDoan,
                parts: toeic.parts,
            }
            : null,
        thanhTich: {
            tuDaThuoc: tienBo?.tuVung?.daThuoc || 0,
            tuDangOn: tienBo?.tuVung?.dangOn || 0,
            nguPhapDaThuoc: nguPhap.daThuoc || 0,
            nguPhapDaLuyen: nguPhap.daLuyen || 0,
            nguPhapTong: MUC_NGU_PHAP.length,
            phanXaDaThuoc,
            phanXaTong: CAU_PHAN_XA.length,
        },
        coDuLieu: kyNang.some((k) => k.soLuot > 0) || kyNangCon.some((k) => k.duDuLieu) || coToeic,
    };
}

async function layHoSoNangLuc(userId) {
    const [hoSo, tienBo, toeic, phanXaDaThuoc, nguPhapDs, profile, stats] = await Promise.all([
        layHoSo(userId),
        layTienBo(userId),
        layHoSoToeic(userId),
        PhanXaTienDo.countDocuments({ userId, daThuoc: true }),
        NguPhapTienDo.find({ userId }).select('daThuoc').lean(),
        UserProfile.findOne({ userId }).select('level').lean(),
        UserStats.findOne({ userId }).select('streakCurrent').lean(),
    ]);
    return tongHop({
        hoSo,
        tienBo,
        toeic,
        phanXaDaThuoc,
        nguPhap: { daLuyen: nguPhapDs.length, daThuoc: nguPhapDs.filter((t) => t.daThuoc).length },
        taiKhoan: { level: profile?.level, streak: stats?.streakCurrent },
    });
}

module.exports = { layHoSoNangLuc, tongHop, rutNhanXet };
