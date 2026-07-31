const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    username: { type: String, default: 'Ẩn danh' },
    content: { type: String, required: true, maxlength: 5000 },
    imageUrl: { type: String, default: null },
    status: {
        type: String,
        enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
        default: 'pending',
    },
    adminNote: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Report', reportSchema);
