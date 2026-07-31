const mongoose = require('mongoose');

/**
 * Mốc mở khoá theo Level — admin chỉnh được, không hardcode.
 * key:
 *   - 'mode:<modeId>'      → chế độ luyện tập (vd mode:speed-quiz)
 *   - 'feature:<name>'     → tính năng (vd feature:spin, feature:leaderboard)
 * isActive=false → coi như KHÔNG khoá (mở cho mọi level).
 */
const featureUnlockSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, trim: true },
        label: { type: String, required: true, trim: true },
        requiredLevel: { type: Number, default: 1, min: 1 },
        icon: { type: String, default: '' },
        description: { type: String, default: '' },
        isActive: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true, collection: 'feature_unlocks' }
);

featureUnlockSchema.index({ isActive: 1, requiredLevel: 1, order: 1 });

module.exports = mongoose.model('FeatureUnlock', featureUnlockSchema);
