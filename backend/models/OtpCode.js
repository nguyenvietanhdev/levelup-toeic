const mongoose = require('mongoose');

const otpCodeSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    code: {
        type: String,
        required: true,
    },
    // 'reset' = forgot password, 'register' = email verification for new account
    type: {
        type: String,
        enum: ['reset', 'register'],
        required: true,
    },
    // For register type: store pending user data until verified
    userData: {
        username: String,
        passwordHash: String,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
    attempts: {
        type: Number,
        default: 0,
    },
}, {
    collection: 'otp_codes',
});

// Auto-delete documents after expiresAt
otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Fast lookup
otpCodeSchema.index({ email: 1, type: 1 });

module.exports = mongoose.model('OtpCode', otpCodeSchema);
