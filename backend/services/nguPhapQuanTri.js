/**
 * QUẢN TRỊ NỘI DUNG NGỮ PHÁP DO AI TẠO — dùng cho admin panel và `scripts/xemBaoSai.js`.
 *
 * Người học báo sai là nội dung bị ẩn ngay; ở đây người quản trị xem lại và quyết định:
 *   · Khôi phục: báo nhầm, cho nội dung hiện lại.
 *   · Xác nhận sai: giữ ẩn, đánh dấu đã xử lý để khỏi xem lại lần nữa.
 * Ngoài ra xem được các mục AI đã thêm vào thư viện và chủ động ẩn mục sai.
 *
 * Không có thao tác xoá hẳn: mọi thứ khôi phục được.
 */
const NguPhapBaoSai = require('../models/NguPhapBaoSai');
const NguPhapBaiTap = require('../models/NguPhapBaiTap');
const NguPhapMuc = require('../models/NguPhapMuc');
const { baoSaiMuc } = require('./nguPhapBaoSai');
const { THEO_ID } = require('./nguPhapKho');

const MOI_TRANG = 30;
const TRANG_THAI = {
    'cho-xu-ly': { daKhoiPhuc: false, daXuLy: { $ne: true } },
    'da-xac-nhan': { daKhoiPhuc: false, daXuLy: true },
    'da-khoi-phuc': { daKhoiPhuc: true },
};

/** Một dòng tóm tắt nội dung bị báo (thuần). */
function tomTat(b) {
    const c = b.banSao || {};
    if (b.loai === 'muc') return `Mục "${c.noiDung?.ten || ''}"`;
    if (c.loai === 'chon') return `Chọn: ${c.de} [${(c.lua || []).join(' | ')}] => ${c.dapAn}`;
    if (c.loai === 'sua') return `Sửa: ${c.sai} => ${c.dung}`;
    return `Dịch: ${c.vi} => ${c.dung}`;
}

/** Tên công thức mà báo cáo thuộc về, để người quản trị biết đang xem gì. */
async function tenCongThuc(ds) {
    const can = [...new Set(ds.filter((b) => b.loai === 'cau' && !THEO_ID.has(b.mucId)).map((b) => b.mucId))]
        .filter((id) => /^[a-f0-9]{24}$/i.test(id));
    const docs = can.length ? await NguPhapMuc.find({ _id: { $in: can } }).select('noiDung').lean() : [];
    const ten = new Map(docs.map((d) => [String(d._id), d.noiDung?.ten]));
    return (b) => (b.loai === 'muc' ? b.banSao?.noiDung?.ten : THEO_ID.get(b.mucId)?.ten || ten.get(b.mucId)) || b.mucId;
}

async function danhSachBaoCao({ trangThai = 'cho-xu-ly', trang = 1 } = {}) {
    const loc = TRANG_THAI[trangThai] || TRANG_THAI['cho-xu-ly'];
    const so = Math.max(1, Math.floor(Number(trang) || 1));
    const [ds, tong, demTung] = await Promise.all([
        NguPhapBaoSai.find(loc).sort({ createdAt: -1 }).skip((so - 1) * MOI_TRANG).limit(MOI_TRANG)
            .populate('userId', 'email').lean(),
        NguPhapBaoSai.countDocuments(loc),
        Promise.all(Object.entries(TRANG_THAI).map(async ([k, q]) => [k, await NguPhapBaoSai.countDocuments(q)])),
    ]);
    const tenCua = await tenCongThuc(ds);
    return {
        trang: so,
        soTrang: Math.max(1, Math.ceil(tong / MOI_TRANG)),
        thongKe: Object.fromEntries(demTung),
        baoCao: ds.map((b) => ({
            id: String(b._id),
            loai: b.loai,
            mucId: b.mucId,
            congThuc: tenCua(b),
            noiDung: tomTat(b),
            nguoiBao: b.userId?.email || '',
            luc: b.createdAt,
            daKhoiPhuc: !!b.daKhoiPhuc,
            daXuLy: !!b.daXuLy,
        })),
    };
}

/** Khôi phục nội dung bị báo nhầm. */
async function khoiPhuc(id) {
    const b = await NguPhapBaoSai.findById(id).lean();
    if (!b) return { loi: 'Không tìm thấy báo cáo này.', ma: 404 };
    if (b.daKhoiPhuc) return { loi: 'Báo cáo này đã được khôi phục trước đó.', ma: 409 };
    if (b.loai === 'cau') {
        await NguPhapBaiTap.updateOne({ mucId: b.mucId }, { $unset: { [`cau.${b.so}.an`]: '' } });
    } else {
        // Trong lúc mục bị ẩn có thể đã có mục mới cùng tên: không đè lên, tránh trùng.
        const c = b.banSao || {};
        if (await NguPhapMuc.exists({ $or: [{ khoa: c.khoa }, { tenChuan: c.tenChuan }] })) {
            return { loi: 'Đã có mục mới cùng tên trong thư viện, không khôi phục để tránh trùng.', ma: 409 };
        }
        await NguPhapMuc.updateOne({ _id: b.mucId }, { $set: { noiDung: c.noiDung, khoa: c.khoa, tenChuan: c.tenChuan, timKiem: c.timKiem } });
    }
    // Cùng một nội dung có thể bị nhiều người báo: khôi phục là khép mọi báo cáo về nó.
    await NguPhapBaoSai.updateMany({ loai: b.loai, mucId: b.mucId, so: b.so }, { $set: { daKhoiPhuc: true } });
    return { ok: true, noiDung: tomTat(b) };
}

/** Xác nhận nội dung đúng là sai: giữ ẩn, không cần xem lại nữa. */
async function xacNhanSai(id) {
    const b = await NguPhapBaoSai.findById(id).lean();
    if (!b) return { loi: 'Không tìm thấy báo cáo này.', ma: 404 };
    if (b.daKhoiPhuc) return { loi: 'Nội dung này đã được khôi phục.', ma: 409 };
    await NguPhapBaoSai.updateMany({ loai: b.loai, mucId: b.mucId, so: b.so }, { $set: { daXuLy: true } });
    return { ok: true };
}

/** Các mục AI đang có trong thư viện, mới nhất trước. */
async function danhSachThuVien({ trang = 1 } = {}) {
    const so = Math.max(1, Math.floor(Number(trang) || 1));
    const loc = { noiDung: { $ne: null } };
    const [ds, tong] = await Promise.all([
        NguPhapMuc.find(loc).select('noiDung viDuThem createdAt khoa').sort({ createdAt: -1 })
            .skip((so - 1) * MOI_TRANG).limit(MOI_TRANG).lean(),
        NguPhapMuc.countDocuments(loc),
    ]);
    return {
        trang: so,
        soTrang: Math.max(1, Math.ceil(tong / MOI_TRANG)),
        tong,
        muc: ds.map((d) => ({
            id: String(d._id),
            ten: d.noiDung?.ten || '',
            cauTra: String(d.khoa || '').replace(/^hoi:/, ''),
            soCongThuc: d.noiDung?.congThuc?.length || 0,
            soViDu: (d.noiDung?.vd?.length || 0) + (d.viDuThem?.length || 0),
            luc: d.createdAt,
        })),
    };
}

/** Người quản trị chủ động ẩn một mục AI. Đi cùng đường với báo sai để khôi phục được. */
const anMuc = (adminId, id) => baoSaiMuc(adminId, id, new Date(), { boQuaTran: true });

module.exports = { danhSachBaoCao, khoiPhuc, xacNhanSai, danhSachThuVien, anMuc, tomTat, TRANG_THAI };
