/**
 * BÁO NỘI DUNG NGỮ PHÁP DO AI TẠO BỊ SAI. AI soát trước khi lưu vẫn lọt lỗi, mà nội dung dùng chung
 * nên một câu sai tới tay mọi người. Người học báo là ẩn với tất cả ngay.
 *
 * Một người có thể ẩn nội dung của mọi người, nên:
 *   · Chỉ báo được câu đã trả lời trong lượt của chính mình, không dò được cả kho.
 *   · Có trần lượt báo mỗi ngày.
 *   · Không xoá gì: nội dung giữ lại trong báo cáo và khôi phục được.
 *   · Kho lõi viết tay không báo ẩn được.
 *
 * Câu bị báo không tính vào kết quả của lượt: câu sai thì không nên làm người học mất điểm.
 */
const BuoiNguPhap = require('../models/BuoiNguPhap');
const NguPhapBaiTap = require('../models/NguPhapBaiTap');
const NguPhapMuc = require('../models/NguPhapMuc');
const NguPhapBaoSai = require('../models/NguPhapBaoSai');
const { homNayVN } = require('./loTrinh');

const TOI_DA_BAO_NGAY = 10;
const RE_OBJECT_ID = /^[a-f0-9]{24}$/i;
const HET_LUOT = { loi: 'Hôm nay bạn đã báo đủ số lần cho phép. Cảm ơn bạn, hãy báo tiếp vào ngày mai nhé.', ma: 429 };

const quaTran = async (userId, now) => (
    await NguPhapBaoSai.countDocuments({ userId, createdAt: { $gte: homNayVN(now).dau } })
) >= TOI_DA_BAO_NGAY;

/** Ghi báo cáo, bỏ qua nếu người này đã báo đúng nội dung đó. */
async function ghiBaoCao(userId, loai, mucId, so, banSao) {
    await NguPhapBaoSai.updateOne(
        { userId, loai, mucId, so },
        { $setOnInsert: { userId, loai, mucId, so, banSao } },
        { upsert: true },
    );
}

/** Báo một câu luyện đã trả lời trong lượt của mình. */
async function baoSaiCau(userId, buoiId, i, now = new Date()) {
    const buoi = await BuoiNguPhap.findOne({ _id: buoiId, userId }).lean();
    const muc = buoi?.cau?.[i];
    if (!muc) return { loi: 'Không tìm thấy câu này.', ma: 404 };
    if (!muc.daTra) return { loi: 'Hãy trả lời câu này trước khi báo.', ma: 400 };
    if (await quaTran(userId, now)) return HET_LUOT;

    // Kiểm tra tổng hợp: mỗi câu thuộc chủ điểm riêng của nó.
    const mucId = muc.mucId || buoi.mucId;
    const bo = await NguPhapBaiTap.findOne({ mucId }).lean();
    const cau = bo?.cau?.[muc.so];
    if (!cau) return { loi: 'Không tìm thấy câu này.', ma: 404 };

    await ghiBaoCao(userId, 'cau', mucId, muc.so, cau);
    await NguPhapBaiTap.updateOne({ mucId }, { $set: { [`cau.${muc.so}.an`]: true } });
    await BuoiNguPhap.updateOne({ _id: buoiId, userId }, { $set: { [`cau.${i}.khongChac`]: true } });
    return { daBao: true };
}

/**
 * Báo một mục AI tạo trong thư viện. Chuyển nội dung sang chỗ cất và trả lại tên, để tra lần sau
 * AI soạn được bản mới; bỏ các cách gọi đang trỏ tới mục này để chúng không thành đường cụt.
 */
async function baoSaiMuc(userId, id, now = new Date(), { boQuaTran = false } = {}) {
    if (!RE_OBJECT_ID.test(String(id))) return { loi: 'Chỉ báo được mục do AI tạo.', ma: 400 };
    const doc = await NguPhapMuc.findOne({ _id: id }).lean();
    if (!doc?.noiDung) return { loi: 'Không tìm thấy mục này.', ma: 404 };
    // Người quản trị chủ động ẩn thì không tính vào trần báo của người học.
    if (!boQuaTran && await quaTran(userId, now)) return HET_LUOT;

    await ghiBaoCao(userId, 'muc', String(doc._id), -1, { khoa: doc.khoa, tenChuan: doc.tenChuan, timKiem: doc.timKiem, noiDung: doc.noiDung });
    await NguPhapMuc.updateOne(
        { _id: doc._id },
        { $set: { noiDung: null, khoa: `an:${doc._id}`, tenChuan: '', timKiem: '' } },
    );
    await NguPhapMuc.deleteMany({ troDen: String(doc._id) });
    return { daBao: true };
}

module.exports = { baoSaiCau, baoSaiMuc, TOI_DA_BAO_NGAY };
