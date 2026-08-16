/**
 * Cài đặt phải ĐỒNG BỘ được giữa nhiều thiết bị.
 *
 * App cho phép đăng nhập nhiều máy cùng một tài khoản, nhưng 11/23 khoá cài đặt
 * chỉ nằm ở localStorage. Nguyên nhân: `settingsSchema` thiếu trường, mà
 * Mongoose chạy `strict` mặc định nên trường không khai bị LOẠI BỎ ÂM THẦM —
 * client gửi lên bao nhiêu lần cũng vô ích, không lỗi nào báo.
 *
 * Hậu quả: đổi cài đặt ở điện thoại, mở máy tính thấy giá trị cũ. Không có dấu
 * hiệu gì để đoán ra.
 *
 * Test dựng document thật rồi ghi/đọc — bắt được đúng việc strip, thứ mà đọc mã
 * nguồn không thấy.
 */
const mongoose = require('mongoose');
const UserProfile = require('../models/UserProfile');

/** Giá trị mẫu cho từng khoá — kiểu phải khớp schema. */
const SAMPLE = {
    vocabLang: 'zh',
    levelFilter: ['HSK1', 'HSK2'],
    reverseMode: true,
    timeLimitEnabled: false,
    questionTime: { flashcard: 25, 'multiple-choice': 15 },
    autoAdvance: false,
    toeicPerQuestionTimer: true,
    toeicAutoAdvance: false,
    toeicTransition: 3,
    toeicCustomPartMin: { 5: 20, 6: 10, 7: 45 },
};

function writeRead(patch) {
    const doc = new UserProfile({ userId: new mongoose.Types.ObjectId() });
    Object.assign(doc.settings, patch);
    return doc.toObject().settings;
}

describe('mười khoá từng chỉ nằm ở localStorage', () => {
    for (const [key, value] of Object.entries(SAMPLE)) {
        test(`${key} KHÔNG bị Mongoose strip`, () => {
            const out = writeRead({ [key]: value });
            if (out[key] === undefined) {
                throw new Error(`${key} bị loại bỏ — thiếu khai trong settingsSchema`);
            }
            expect(JSON.parse(JSON.stringify(out[key]))).toEqual(value);
        });
    }

    test('ghi cả mười cùng lúc vẫn giữ đủ', () => {
        const out = writeRead(SAMPLE);
        const mất = Object.keys(SAMPLE).filter((k) => out[k] === undefined);
        expect(mất).toEqual([]);
    });
});

describe('kiểu dữ liệu đúng với thứ client gửi', () => {
    test('questionTime là object khoá tự do, không phải mảng', () => {
        // `{ [modeId]: giây }` — khoá do client đặt nên phải Mixed.
        const out = writeRead({ questionTime: { dictation: 40 } });
        expect(out.questionTime).toEqual({ dictation: 40 });
    });

    test('toeicCustomPartMin nhận khoá là SỐ Part', () => {
        const out = writeRead({ toeicCustomPartMin: { 5: 20 } });
        expect(JSON.parse(JSON.stringify(out.toeicCustomPartMin))).toEqual({ 5: 20 });
    });

    test('levelFilter mặc định null, KHÔNG phải mảng rỗng', () => {
        // `null` = không lọc; mảng rỗng lọt vào `includes` là lọc ra 0 từ.
        const doc = new UserProfile({ userId: new mongoose.Types.ObjectId() });
        expect(doc.settings.levelFilter).toBeNull();
    });

    test('vocabLang chỉ nhận en/zh', () => {
        const doc = new UserProfile({ userId: new mongoose.Types.ObjectId() });
        doc.settings.vocabLang = 'fr';
        const err = doc.validateSync();
        expect(err?.errors?.['settings.vocabLang']).toBeDefined();
    });

    test('toeicTransition chặn biên 0–10', () => {
        const doc = new UserProfile({ userId: new mongoose.Types.ObjectId() });
        doc.settings.toeicTransition = 99;
        expect(doc.validateSync()?.errors?.['settings.toeicTransition']).toBeDefined();
    });
});

describe('theme CỐ TÌNH không đồng bộ', () => {
    test('không có trong schema — nền sáng/tối thuộc về THIẾT BỊ', () => {
        // Máy bàn để sáng, điện thoại để tối là hợp lý. Đồng bộ nó là ép người
        // dùng dùng chung một nền trên mọi máy.
        const out = writeRead({ theme: 'dark' });
        expect(out.theme).toBeUndefined();
    });
});
