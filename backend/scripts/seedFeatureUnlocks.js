/**
 * Seed mốc mở khoá theo Level (idempotent — chỉ TẠO nếu chưa có, KHÔNG ghi đè
 * mốc admin đã chỉnh).
 *   node scripts/seedFeatureUnlocks.js
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const FeatureUnlock = require('../models/FeatureUnlock');

const UNLOCKS = [
    // ── Tính năng ──
    { key: 'feature:quest',        label: 'Nhiệm vụ',        requiredLevel: 1,  icon: '✅', order: 10 },
    { key: 'feature:checkin',      label: 'Điểm danh',       requiredLevel: 3,  icon: '📅', order: 20 },
    { key: 'feature:shop',         label: 'Cửa hàng',        requiredLevel: 5,  icon: '🏪', order: 30 },
    { key: 'feature:inventory',    label: 'Túi đồ',          requiredLevel: 5,  icon: '🎒', order: 31 },
    { key: 'feature:favorites',    label: 'Từ vựng yêu thích', requiredLevel: 4, icon: '⭐', order: 25 },
    { key: 'feature:stats',        label: 'Thống kê',        requiredLevel: 7,  icon: '📊', order: 40 },
    { key: 'feature:translate',    label: 'Dịch nhanh (Shift+Enter)', requiredLevel: 6, icon: '🌐', order: 41 },
    { key: 'feature:spin',         label: 'Vòng quay',       requiredLevel: 8,  icon: '🎰', order: 50 },
    { key: 'feature:achievements', label: 'Thành tích',      requiredLevel: 10, icon: '🏆', order: 60 },
    { key: 'feature:lang-zh',      label: 'Học tiếng Trung', requiredLevel: 10, icon: '🇨🇳', order: 61 },
    { key: 'feature:upload-vocab', label: 'Từ vựng riêng',   requiredLevel: 12, icon: '📤', order: 70 },
    { key: 'feature:wrong-words',  label: 'Ôn từ sai',       requiredLevel: 12, icon: '❌', order: 71 },
    { key: 'feature:leaderboard',  label: 'Bảng xếp hạng',   requiredLevel: 15, icon: '🥇', order: 80 },
    { key: 'feature:toeic',        label: 'Thi TOEIC',       requiredLevel: 20, icon: '📝', order: 90 },

    // ── Chế độ luyện tập (theo 4 tầng độ khó) ──
    { key: 'mode:flashcard',           label: 'Flashcard',       requiredLevel: 1,  icon: '🃏', order: 100 },
    { key: 'mode:multiple-choice',     label: 'Trắc nghiệm',     requiredLevel: 1,  icon: '✅', order: 101 },
    { key: 'mode:matching',            label: 'Nối từ',          requiredLevel: 1,  icon: '🔗', order: 102 },
    { key: 'mode:word-type-check',     label: 'Từ loại',         requiredLevel: 1,  icon: '🏷️', order: 103 },

    { key: 'mode:listening',           label: 'Nghe và chọn',    requiredLevel: 3,  icon: '🎧', order: 110 },
    { key: 'mode:sentence-listening',  label: 'Nghe chuỗi từ',   requiredLevel: 3,  icon: '👂', order: 111 },
    { key: 'mode:pronunciation',       label: 'Phát âm',         requiredLevel: 4,  icon: '🎤', order: 112 },
    { key: 'mode:dictation',           label: 'Chép chính tả',   requiredLevel: 4,  icon: '⌨️', order: 113 },

    { key: 'mode:synonym-check',       label: 'Từ đồng nghĩa',   requiredLevel: 8,  icon: '🟰', order: 120 },
    { key: 'mode:example-fill-blank',  label: 'Điền vào câu',    requiredLevel: 8,  icon: '📝', order: 121 },
    { key: 'mode:phonetic-quiz',       label: 'Đọc phiên âm',    requiredLevel: 9,  icon: '🔤', order: 122 },
    { key: 'mode:fill-blank',          label: 'Điền từ',         requiredLevel: 9,  icon: '✏️', order: 123 },

    { key: 'mode:context-learning',    label: 'Hiểu qua câu',    requiredLevel: 18, icon: '📖', order: 130 },
    { key: 'mode:review-mistakes',     label: 'Ôn lại từ sai',   requiredLevel: 18, icon: '🔁', order: 131 },
    { key: 'mode:sentence-builder',    label: 'Xếp câu',         requiredLevel: 18, icon: '🧩', order: 132 },
    { key: 'mode:speed-quiz',          label: 'Tốc độ',          requiredLevel: 18, icon: '⏱️', order: 133 },
];

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    let created = 0;
    for (const u of UNLOCKS) {
        const existed = await FeatureUnlock.findOne({ key: u.key }).lean();
        if (!existed) { await FeatureUnlock.create(u); created++; }
    }
    console.log(`Seeded ${created} mốc mở khoá (tổng: ${await FeatureUnlock.countDocuments()}).`);
    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
