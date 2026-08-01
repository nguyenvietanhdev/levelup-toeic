/**
 * Backoff đăng nhập — bỏ miễn trừ cho admin mà không tự nhốt mình
 * (SEC-be.auth-001, phần còn nợ từ 11ed1cb).
 *
 * Bối cảnh: `adminLoginLimiter` vá được nửa đầu (brute-force không còn hoàn toàn
 * không giới hạn), nhưng tài khoản admin vẫn được MIỄN TRỪ khỏi cơ chế khoá theo
 * số lần sai — cả khối đếm/khoá bọc trong `if (user.role !== 'admin')`. Rate
 * limiter khoá theo IP, mà IP thì xoay được, nên tài khoản quyền cao nhất là
 * tài khoản được bảo vệ ít nhất.
 *
 * Miễn trừ đó có lý do chính đáng: chưa có đường lấy lại nếu tự khoá mình. Nên
 * cách giải không phải là bỏ miễn trừ rồi thôi, mà là làm cho việc bị khoá
 * KHÔNG BAO GIỜ vĩnh viễn. Trần 5 phút là điểm mấu chốt, và là thứ file này chốt.
 */
const {
    lockMinutesFor,
    ADMIN_MAX_LOCK_MINUTES,
    ADMIN_SCHEDULE,
    USER_SCHEDULE,
} = require('../utils/loginBackoff');

describe('người dùng thường — giữ nguyên lịch cũ', () => {
    test.each([
        [0, 0], [1, 0], [4, 0],
        [5, 5], [9, 5],
        [10, 15], [14, 15],
        [15, 30], [19, 30],
        [20, 60], [500, 60],
    ])('%d lần sai → khoá %d phút', (attempts, minutes) => {
        expect(lockMinutesFor(attempts, 'user')).toBe(minutes);
    });
});

describe('admin — có backoff, nhưng có TRẦN', () => {
    test('dưới 5 lần sai thì chưa khoá', () => {
        for (const n of [0, 1, 4]) expect(lockMinutesFor(n, 'admin')).toBe(0);
    });

    test('5 lần sai → 1 phút; 10 lần → 5 phút', () => {
        expect(lockMinutesFor(5, 'admin')).toBe(1);
        expect(lockMinutesFor(9, 'admin')).toBe(1);
        expect(lockMinutesFor(10, 'admin')).toBe(5);
    });

    test('KHÔNG BAO GIỜ vượt trần, dù sai bao nhiêu lần', () => {
        // Đây là cam kết khiến việc bỏ miễn trừ trở nên an toàn. Nếu test này
        // đỏ nghĩa là chủ dự án có thể tự khoá mình ra khỏi hệ thống.
        for (const n of [10, 20, 50, 100, 1000, 999999]) {
            expect(lockMinutesFor(n, 'admin')).toBeLessThanOrEqual(ADMIN_MAX_LOCK_MINUTES);
        }
    });

    test('admin luôn bị khoá ngắn hơn hoặc bằng người thường', () => {
        for (let n = 0; n <= 60; n++) {
            expect(lockMinutesFor(n, 'admin')).toBeLessThanOrEqual(lockMinutesFor(n, 'user'));
        }
    });

    test('admin KHÔNG còn được miễn trừ — phải có mốc khoá thật', () => {
        // Hồi quy về hành vi cũ (miễn trừ hoàn toàn) sẽ làm test này đỏ.
        expect(lockMinutesFor(10, 'admin')).toBeGreaterThan(0);
    });
});

describe('tính chất chung của lịch backoff', () => {
    test('không giảm khi số lần sai tăng', () => {
        for (const role of ['user', 'admin']) {
            let prev = 0;
            for (let n = 0; n <= 100; n++) {
                const cur = lockMinutesFor(n, role);
                expect(cur).toBeGreaterThanOrEqual(prev);
                prev = cur;
            }
        }
    });

    test('mốc trong bảng phải xếp giảm dần, nếu không vòng lặp trả sai mốc', () => {
        for (const schedule of [USER_SCHEDULE, ADMIN_SCHEDULE]) {
            const thresholds = schedule.map(([t]) => t);
            expect(thresholds).toEqual([...thresholds].sort((a, b) => b - a));
        }
    });

    test('đầu vào rác không làm ném lỗi, coi như chưa sai lần nào', () => {
        for (const bad of [null, undefined, NaN, 'abc', {}, -5]) {
            expect(lockMinutesFor(bad, 'user')).toBe(0);
        }
    });

    test('vai trò lạ dùng lịch của người thường, không phải lịch admin', () => {
        // Nhầm hướng này là vô tình nới lỏng cho vai trò chưa biết.
        expect(lockMinutesFor(20, 'moderator')).toBe(60);
        expect(lockMinutesFor(20, undefined)).toBe(60);
    });
});
