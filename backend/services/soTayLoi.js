/**
 * SỔ TAY LỖI — mọi lỗi đã được chữa trong bài Viết và Dịch, kèm cách sửa.
 *
 * Mỗi bài chấm xong là một danh sách lỗi đọc một lần rồi trôi vào lịch sử. Sổ tay
 * gom chúng lại theo LOẠI LỖI để người học thấy chính những câu mình từng sai,
 * đặt cạnh nhau — "sai mạo từ 6 lần" chỉ có nghĩa khi thấy lại 6 câu đó.
 *
 * Không gọi AI, không lưu thêm: đọc lại từ `Essay.issues` và `Translation.notes`.
 */
const Essay = require('../models/Essay');
const Translation = require('../models/Translation');
const UserProfile = require('../models/UserProfile');
const { thongKe, chuanHoaLoai, nhanLoi, chuanHoaMuc } = require('./errorTaxonomy');

/** Lấy lỗi trong chừng này ngày; đủ xa để thấy thói quen, đủ gần để còn liên quan. */
const SO_NGAY = 180;
/** Trần số mục trả về — sổ tay để đọc, không phải để tải cả kho. */
const TOI_DA = 300;

/** Chuẩn hoá một lỗi thô (hai nguồn dùng tên trường khác nhau). */
function mucSoTay(raw, { nguon, baiId, at, i }) {
    const loai = chuanHoaLoai(raw?.loai ?? raw?.type);
    return {
        id: `${nguon}-${baiId}-${i}`,
        nguon,
        baiId: String(baiId),
        at,
        quote: String(raw?.quote || '').slice(0, 300),
        issue: String(raw?.issue || '').slice(0, 500),
        // Viết lưu cụm sửa ở `fix`, Dịch ở `better`.
        sua: String(raw?.fix ?? raw?.better ?? '').slice(0, 300),
        loai,
        vi: nhanLoi(loai),
        // Bài chấm trước khi có mức độ: `muc` vắng → coi là lỗi.
        muc: raw?.muc === 'nen' ? 'nen' : chuanHoaMuc(raw?.level),
    };
}

/**
 * Dựng sổ tay từ bài đã chấm (thuần — test được không cần DB).
 * Mục nào không có cả trích dẫn lẫn cách sửa thì bỏ: không có gì để học lại.
 */
function dungSoTay({ viet = [], dich = [] }) {
    const ds = [];
    for (const b of viet) {
        (b.issues || []).forEach((raw, i) => ds.push(mucSoTay(raw, { nguon: 'viet', baiId: b._id, at: b.createdAt, i })));
    }
    for (const b of dich) {
        (b.notes || []).forEach((raw, i) => ds.push(mucSoTay(raw, { nguon: 'dich', baiId: b._id, at: b.createdAt, i })));
    }
    const muc = ds
        .filter((m) => m.quote || m.sua)
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .slice(0, TOI_DA);
    // "Khác" xuống CUỐI dù nhiều nhất: bài chấm trước khi có phân loại dồn hết vào
    // đó, đứng đầu thì người học mở sổ tay ra gặp ngay nhóm không dạy được gì.
    const nhom = thongKe(muc);
    return { tong: muc.length, nhom: [...nhom.filter((n) => n.key !== 'other'), ...nhom.filter((n) => n.key === 'other')], muc };
}

async function laySoTay(userId, now = new Date()) {
    const profile = await UserProfile.findOne({ userId }).select('settings').lean();
    const lang = profile?.settings?.vocabLang === 'zh' ? 'zh' : 'en';
    const theoLang = lang === 'zh' ? { lang: 'zh' } : { lang: { $ne: 'zh' } };
    const tu = new Date(now.getTime() - SO_NGAY * 86400000);

    const [viet, dich] = await Promise.all([
        Essay.find({ userId, createdAt: { $gte: tu }, ...theoLang }).select('issues createdAt').lean(),
        Translation.find({ userId, createdAt: { $gte: tu }, ...theoLang }).select('notes createdAt').lean(),
    ]);
    return { ...dungSoTay({ viet, dich }), soNgay: SO_NGAY, lang };
}

module.exports = { laySoTay, dungSoTay, mucSoTay, SO_NGAY, TOI_DA };
