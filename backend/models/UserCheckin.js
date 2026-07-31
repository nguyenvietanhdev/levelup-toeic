const mongoose = require('mongoose');

/**
 * UserCheckin — điểm danh hằng tuần (7 slot, 1 slot/ngày, reset thứ 2).
 * Mỗi user có 1 doc duy nhất; weekKey + claimedDays đổi mỗi tuần.
 */
const userCheckinSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        weekKey: { type: String, default: '' },             // 'YYYY-WNN'
        claimedDays: { type: [Number], default: [] },        // [1..7], thứ 2 = 1
        lastClaimDate: { type: Date, default: null },
    },
    { timestamps: true, collection: 'user_checkin', versionKey: false }
);

userCheckinSchema.index({ userId: 1 }, { unique: true });
userCheckinSchema.index({ userId: 1, weekKey: 1 });

module.exports = mongoose.model('UserCheckin', userCheckinSchema);
