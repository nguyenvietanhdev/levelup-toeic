/**
 * Enum `mode` của PracticeSession phải phủ MỌI chế độ luyện tập.
 *
 * Lỗi đã gặp: enum là một mảng gõ cứng 9 chế độ, trong khi bảng giá có 17. Chín
 * chế độ — example-fill-blank, review-mistakes, sentence-builder, pronunciation,
 * context-learning, dictation, sentence-listening, phonetic-quiz và hanzi-writing —
 * đều KHÔNG có trong enum.
 *
 * Hậu quả: chơi xong, `POST /api/practice/submit` trả 400
 *     "`hanzi-writing` is not a valid enum value for path `mode`"
 * Phiên luyện tập không được lưu, thống kê thiếu. Mà người dùng KHÔNG thấy lỗi,
 * vì client đã cộng điểm lạc quan từ trước — chỉ có một dòng đỏ trong console.
 *
 * Đây là hình dạng SYS-001 lần thứ tư trong dự án: cùng một danh sách tồn tại ở
 * hai nơi, thêm ở một nơi mà quên nơi kia. Cách đóng hẳn là SINH enum từ bảng
 * giá thay vì gõ lại — test này chốt việc đó.
 */
const PracticeSession = require('../models/PracticeSession');
const { PRACTICE_COSTS } = require('../utils/energyCosts');

const enumValues = PracticeSession.schema.path('mode').enumValues;

describe('PracticeSession.mode — enum phủ mọi chế độ', () => {

    test('mọi chế độ trong bảng giá đều hợp lệ với model', () => {
        const missing = Object.keys(PRACTICE_COSTS).filter(m => !enumValues.includes(m));
        // Thiếu một chế độ ở đây nghĩa là chơi xong không lưu được phiên.
        expect(missing).toEqual([]);
    });

    test('chín chế độ từng bị bỏ quên đều có mặt', () => {
        // Liệt kê tường minh để ai đọc test biết chuyện gì đã xảy ra.
        const previouslyMissing = [
            'example-fill-blank', 'review-mistakes', 'sentence-builder', 'pronunciation',
            'context-learning', 'dictation', 'sentence-listening', 'phonetic-quiz',
            'hanzi-writing',
        ];
        for (const mode of previouslyMissing) {
            expect(enumValues).toContain(mode);
        }
    });

    test('giữ word-scramble — chế độ cũ còn dữ liệu lịch sử', () => {
        // Không còn trong bảng giá nhưng phiên cũ trong DB vẫn mang giá trị này;
        // bỏ khỏi enum là các bản ghi đó thành không hợp lệ.
        expect(enumValues).toContain('word-scramble');
    });

    test('model chấp nhận chế độ mới mà không cần sửa enum bằng tay', () => {
        // Kiểm bằng validate thật chứ không chỉ so mảng.
        const doc = new PracticeSession({
            user: '507f1f77bcf86cd799439011',
            mode: 'hanzi-writing',
            questionsCount: 8,
        });
        const err = doc.validateSync();
        expect(err?.errors?.mode).toBeUndefined();
    });

    test('chế độ bịa vẫn bị từ chối — enum không được nới thành tự do', () => {
        const doc = new PracticeSession({
            user: '507f1f77bcf86cd799439011',
            mode: 'khong-ton-tai',
            questionsCount: 5,
        });
        expect(doc.validateSync()?.errors?.mode).toBeDefined();
    });
});
