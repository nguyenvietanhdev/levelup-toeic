const mongoose = require('mongoose');

// 1 like của likerId dành cho targetId. Mỗi cặp là duy nhất → mỗi tài khoản chỉ
// like 1 lần/người (bấm lại = bỏ like).
const profileLikeSchema = new mongoose.Schema(
    {
        likerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        at: { type: Date, default: Date.now },
    },
    { collection: 'profile_likes' }
);

profileLikeSchema.index({ likerId: 1, targetId: 1 }, { unique: true });
profileLikeSchema.index({ targetId: 1 });

module.exports = mongoose.model('ProfileLike', profileLikeSchema);
