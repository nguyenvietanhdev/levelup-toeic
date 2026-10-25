/**
 * Bài làm dở của Viết / Dịch / Đọc / Nghe: lưu đề lúc sinh, lưu phần đã làm, xoá khi
 * đã nộp chấm.
 *
 * Mọi hàm ở đây "hỏng thì thôi": lưu nháp là phần thêm vào, lỗi DB không được làm
 * hỏng việc lấy đề hay chấm bài — chỉ ghi log rồi bỏ qua.
 */
const BaiNhap = require('../models/BaiNhap');
const logger = require('../utils/logger');

const MODES = ['viet', 'dich', 'doc', 'nghe'];

/**
 * Trường của đề dùng để nhận ra "cùng một bài" khi tự lưu (xem `luuNoiDung`):
 * Viết so đề bài, Dịch so đoạn văn, Đọc và Nghe so mã bài (duy nhất).
 */
const KHOA_DE = { viet: 'de.prompt', dich: 'de.passage', doc: 'de.readingId', nghe: 'de.id' };
const MAX_NOI_DUNG = 20000;

const hopLe = (mode) => MODES.includes(mode);

/**
 * Lưu đề vừa sinh thành bài nháp mới (thay bài nháp cũ cùng chế độ, ngôn ngữ).
 * `an` = dữ liệu chỉ server đọc (đáp án bài Đọc) — không bao giờ trả về client.
 */
async function luuDe(userId, mode, lang, de, an) {
    if (!hopLe(mode) || !de) return;
    try {
        await BaiNhap.findOneAndUpdate(
            { userId, mode, lang },
            { $set: { de, noiDung: '', an: an ?? null } },
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
        { userId, mode, lang, [KHOA_DE[mode]]: deBai },
        { $set: { noiDung: String(noiDung || '').slice(0, MAX_NOI_DUNG) } },
    );
    return (r?.matchedCount ?? r?.n ?? 0) > 0;
}

async function layNhap(userId, mode, lang) {
    if (!hopLe(mode)) return null;
    const doc = await BaiNhap.findOne({ userId, mode, lang }).select('de noiDung updatedAt').lean();
    return doc ? { de: doc.de, noiDung: doc.noiDung || '', capNhat: doc.updatedAt } : null;
}

/**
 * Lấy LẠI đề Đọc (kèm đáp án) từ bài nháp khi bộ nhớ của server đã mất nó (quá 1 giờ,
 * hoặc server khởi động lại). XOÁ bài nháp ngay trong cùng thao tác: lấy được là
 * "chiếm" bài — hai lần nộp song song chỉ một lần có đề để chấm.
 */
async function chiemDeDoc(userId, readingId) {
    if (typeof readingId !== 'string' || !readingId) return null;
    const doc = await BaiNhap.findOneAndDelete({ userId, mode: 'doc', 'de.readingId': readingId }).select('+an').lean();
    return doc?.an || null;
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

module.exports = { luuDe, luuNoiDung, layNhap, xoaNhap, chiemDeDoc, MODES, KHOA_DE, MAX_NOI_DUNG };
