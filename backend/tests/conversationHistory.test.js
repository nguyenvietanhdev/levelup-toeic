/**
 * Lịch sử hội thoại: chỉ phiên ĐÃ KẾT THÚC của CHÍNH người dùng, và route
 * `/history` không bị `/:id` nuốt mất.
 */
const fs = require('node:fs');
const path = require('node:path');

const ctrlSrc = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'conversationController.js'), 'utf8');
const routeSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'conversation.js'), 'utf8');

describe('danh sách lịch sử', () => {
    test('lọc theo userId của người gọi và chỉ lấy phiên đã kết thúc', () => {
        expect(ctrlSrc).toMatch(/Conversation\.find\(\{ userId: req\.user\.id, status: 'done' \}\)/);
    });

    test('không trả lời thoại trong danh sách (chỉ đủ để nhận diện và xem điểm)', () => {
        const i = ctrlSrc.indexOf('exports.history');
        const seg = ctrlSrc.slice(i, ctrlSrc.indexOf('exports.detail'));
        expect(seg).not.toMatch(/turns/);
    });

    test('giới hạn số dòng, không để tải cả lịch sử', () => {
        expect(ctrlSrc).toMatch(/Math\.min\(50,/);
    });
});

describe('xem chi tiết một phiên', () => {
    test('chỉ chủ phiên và chỉ phiên đã kết thúc', () => {
        expect(ctrlSrc).toMatch(/findOne\(\{ _id: req\.params\.id, userId: req\.user\.id, status: 'done' \}\)/);
    });

    test('trả về lời thoại và kết quả chấm', () => {
        const i = ctrlSrc.indexOf('exports.detail');
        const seg = ctrlSrc.slice(i, ctrlSrc.indexOf('exports.ENERGY_COST'));
        expect(seg).toMatch(/turns:/);
        expect(seg).toMatch(/feedback: convo\.feedback/);
    });
});

describe('thứ tự route', () => {
    test('/history khai trước /:id', () => {
        expect(routeSrc.indexOf("'/history'")).toBeGreaterThan(-1);
        expect(routeSrc.indexOf("'/history'")).toBeLessThan(routeSrc.indexOf("'/:id'"));
    });
});
