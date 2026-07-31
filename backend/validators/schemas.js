/**
 * Route input schemas for middleware/validate.js.
 * Messages mirror the controller's existing wording EXACTLY so adopting
 * the validator does not change any client-facing error text (pure move,
 * just earlier + via the standard error handler).
 */

// POST /api/shop/purchase — userStateController.purchaseItem
const shopPurchase = {
    itemId: { required: true, message: 'Item ID is required' },
};

// POST /api/upload/vocabulary — uploadController.uploadVocabulary
const vocabUpload = {
    en:     { required: true, message: 'English is required' },
    part:   { required: true, message: 'Part is required' },
    source: { required: true, message: 'Source is required' },
};

module.exports = { shopPurchase, vocabUpload };
