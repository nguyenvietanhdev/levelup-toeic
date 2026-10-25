/**
 * Bài làm dở của Viết / Dịch: lưu đề lúc sinh, lưu phần gõ, xoá khi đã nộp chấm.
 *
 * Mọi hàm ở đây "hỏng thì thôi": lưu nháp là phần thêm vào, lỗi DB không được làm
 * hỏng việc lấy đề hay chấm bài — chỉ ghi log rồi bỏ qua.
 */
const BaiNhap = require('../models/BaiNhap');
const logger = require('../utils/logger');

const MODES = ['viet', 'dich'];
const MAX_NOI_DUNG = 20000;

const hopLe = (mode) => MODES.includes(mode);

/** Lưu đề vừa sinh thành bài nháp mới (thay bài nháp cũ cùng chế độ, ngôn ngữ). */
async function luuDe(userId, mode, lang, de) {
    if (!hopLe(mode) || !de) return;
    try {
        await BaiNhap.findOneAndUpdate(
            { userId, mode, lang },
            { $set: { de, noiDung: '' } },
            { upsert: true, setDefaultsOnInsert: true },
        );
    } catch (err) {
        logger.warn('Không lưu được bài nháp', { mode, error: err?.message });
    }
}

/**
 * Cập nhật phần đã gõ. Chỉ cập nhật bài nháp ĐANG CÓ (không tạo mới): client không
 * được tự đặt đề. Trả `false` khi không có bài nháp nào.
 *
 * `deBai` = đề / đoạn văn đang hiện trên màn của client. Chỉ lưu khi KHỚP đề của bài
 * nháp: mở hai tab (hoặc hai máy) với hai đề khác nhau thì tab cũ không được ghi
 * chữ của đề A vào bài nháp của đề B.
 */
async function luuNoiDung(userId, mode, lang, noiDung, deBai) {
    if (!hopLe(mode) || typeof deBai !== 'string' || !deBai) return false;
    const r = await BaiNhap.updateOne(
        { userId, mode, lang, [mode === 'viet' ? 'de.prompt' : 'de.passage']: deBai },
        { $set: { noiDung: String(noiDung || '').slice(0, MAX_NOI_DUNG) } },
    );
    return (r?.matchedCount ?? r?.n ?? 0) > 0;
}

async function layNhap(userId, mode, lang) {
    if (!hopLe(mode)) return null;
    const doc = await BaiNhap.findOne({ userId, mode, lang }).select('de noiDung updatedAt').lean();
    return doc ? { de: doc.de, noiDung: doc.noiDung || '', capNhat: doc.updatedAt } : null;
}

/** Xoá bài nháp (đã nộp chấm, hoặc người học bỏ). */
async function xoaNhap(userId, mode, lang) {
    if (!hopLe(mode)) return;
    try {
        await BaiNhap.deleteOne({ userId, mode, lang });
    } catch (err) {
        logger.warn('Không xoá được bài nháp', { mode, error: err?.message });
    }
}

module.exports = { luuDe, luuNoiDung, layNhap, xoaNhap, MODES, MAX_NOI_DUNG };
