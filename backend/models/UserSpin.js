const mongoose = require('mongoose');

const userSpinSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        lastSpinAt: { type: Date, default: null },
        totalSpins: { type: Number, default: 0 },
    },
    { timestamps: true, collection: 'user_spins', versionKey: false }
);

module.exports = mongoose.model('UserSpin', userSpinSchema);
