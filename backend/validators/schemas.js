/**
 * Route input schemas for middleware/validate.js.
 * Messages mirror the controller's existing wording EXACTLY so adopting
 * the validator does not change any client-facing error text (pure move,
 * just earlier + via the standard error handler).
 */

// POST /api/shop/purchase — shopController.purchaseItem
//
// `type` ở đây không phải cho đẹp. Trước đây chỉ khai `required`, mà `required`
// chỉ loại undefined/null/chuỗi rỗng — nên `itemId` dạng object đi lọt vào tận
// filter của Mongo. Kèm theo đó, `COOLDOWN_DAYS[itemId]` tra bằng khoá object
// luôn ra undefined, làm bay cả 3 chốt của giới hạn mua theo chu kỳ (ép
// quantity=1, kiểm chờ N ngày, ghi mốc để tái vũ trang). Xem SEC-be.economy-002.
const shopPurchase = {
    itemId:   { required: true, type: 'string', message: 'Item ID is required' },
    quantity: { type: 'number', message: 'Quantity must be a number' },
};

// POST /api/inventory/use và /equip — routes/inventory.js
// Giữ nguyên câu chữ mà route vẫn trả để không đổi text người dùng thấy.
const inventoryItem = {
    itemId: { required: true, type: 'string', message: 'Thiếu itemId' },
};

// POST /api/inventory/unequip
const inventorySlot = {
    slot: { required: true, type: 'string', message: 'Thiếu slot' },
};

// POST /api/upload/vocabulary — uploadController.uploadVocabulary
const vocabUpload = {
    en:     { required: true, message: 'English is required' },
    part:   { required: true, message: 'Part is required' },
    source: { required: true, message: 'Source is required' },
};

module.exports = { shopPurchase, vocabUpload, inventoryItem, inventorySlot };
