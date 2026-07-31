// ===================================
// BALANCE SERVICE
// ===================================
// Trừ tiền (coins/gems) theo kiểu ATOMIC. Đối xứng với inventoryService.consume():
// điều kiện "đủ" nằm TRONG filter của update, nên hai request song song không thể
// cùng qua cửa.
//
// Vì sao phải có file này: trước đây shopController đọc số dư ra RAM → kiểm tra →
// trừ trên bản RAM → save(). Hai request đồng thời cùng đọc 100, cùng qua cửa với
// món giá 100, cùng ghi 0 → 2 món, trả tiền 1 món. UserStats đặt `versionKey: false`
// nên không có cả lớp optimistic concurrency của Mongoose để đỡ.

const UserStats = require('../models/UserStats');

/**
 * Dựng filter + update cho một lần trừ tiền.
 * Tách khỏi phần chạm DB để test được mà không cần MongoDB.
 *
 * Currency lạ rơi về 'gems' — giữ đúng hành vi cũ của shopController
 * (`if (currency === 'coins') coins -= x; else gems -= x`), chỉ khác là giờ
 * trường hợp đó cũng được chặn bởi điều kiện đủ tiền thay vì trừ mù.
 *
 * @param {string} userId
 * @param {'coins'|'gems'} currency
 * @param {number} amount  số dương
 */
function buildDebitQuery(userId, currency, amount) {
    const field = currency === 'coins' ? 'coins' : 'gems';
    return {
        filter: { userId, [field]: { $gte: amount } },
        update: { $inc: { [field]: -amount } },
    };
}

/**
 * Trừ tiền ATOMIC.
 *
 * @returns {Promise<object|null>} doc UserStats SAU khi trừ, hoặc null nếu không đủ.
 *
 * ⚠ Phải dùng doc trả về cho mọi thao tác sau đó. Gọi save() trên doc đã đọc
 * TRƯỚC lúc trừ sẽ ghi đè số dư bằng giá trị cũ, xoá sạch tác dụng của hàm này.
 */
async function debit(userId, currency, amount) {
    const { filter, update } = buildDebitQuery(userId, currency, amount);
    return UserStats.findOneAndUpdate(filter, update, { new: true });
}

/**
 * Hoàn tiền — dùng khi đã trừ xong nhưng bước sau hỏng.
 *
 * `$inc` nên không cần điều kiện: cộng lại luôn hợp lệ, và không có khe hở kiểu
 * đọc-rồi-ghi. Đây là bù trừ thủ công, KHÔNG phải rollback thật: hiệu ứng đã áp
 * lên UserStats trước đó (năng lượng, boost, hạn VIP) không được gỡ ra. Muốn
 * nguyên tử thật thì phải bọc cả cụm trong Mongo session — ROADMAP mục 22, chờ Atlas.
 */
async function credit(userId, currency, amount) {
    const field = currency === 'coins' ? 'coins' : 'gems';
    return UserStats.updateOne({ userId }, { $inc: { [field]: amount } });
}

module.exports = { buildDebitQuery, debit, credit };
