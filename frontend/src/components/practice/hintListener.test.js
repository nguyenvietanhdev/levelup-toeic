/**
 * Nút "Gợi ý" chết ở chế độ Điền từ (và mọi chế độ khác) sau khi ĐỔI CHẾ ĐỘ.
 *
 * Nguyên nhân là `EventBus.off(event)` KHÔNG truyền handler. Đọc eventBus.js:
 *
 *     off(event, callback) {
 *       if (!callback) { delete this.events[event]; return; }   // xoá SẠCH
 *       ...
 *     }
 *
 * Nên `cleanup()` của một chế độ xoá luôn listener của MỌI chế độ, không riêng
 * của mình. Kịch bản hỏng:
 *
 *   1. Vào Trắc nghiệm  → multipleChoice đăng ký listener HINT_USED
 *   2. Đổi sang Điền từ → PracticeManager.start() gọi cleanupMode(chế độ cũ)
 *                          → multipleChoice.cleanup() → off(HINT_USED) → XOÁ HẾT
 *   3. fillBlank.start() đăng ký listener của mình
 *   4. Nhưng bước 2 và 3 chạy XEN KẼ vì start() là async: fillBlank đăng ký ở
 *      SAU `await generateQuestions()`, còn cleanup của chế độ kế tiếp lại chạy
 *      ngay đầu start() — nên listener vừa đăng ký có thể bị xoá bởi lần cleanup
 *      sau đó.
 *
 * Test này khoá hành vi ĐÚNG của EventBus.off: gỡ đúng handler của mình, không
 * đụng handler của người khác.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '@game/eventBus.js';

const EV = 'test:hint-used';

describe('EventBus.off — gỡ listener không được đụng của người khác', () => {
    beforeEach(() => { EventBus.off(EV); });

    test('off(event, handler) chỉ gỡ đúng handler đó', () => {
        const a = vi.fn();
        const b = vi.fn();
        EventBus.on(EV, a);
        EventBus.on(EV, b);

        EventBus.off(EV, a);
        EventBus.emit(EV);

        expect(a).not.toHaveBeenCalled();
        expect(b).toHaveBeenCalledTimes(1);   // của người khác PHẢI còn sống
    });

    test('mô phỏng đổi chế độ: chế độ cũ dọn dẹp, chế độ mới vẫn nhận sự kiện', () => {
        // Chế độ A vào trước
        const hintA = vi.fn();
        EventBus.on(EV, hintA);

        // Đổi sang chế độ B: B đăng ký, rồi A dọn dẹp (thứ tự này xảy ra thật vì
        // start() là async — A.cleanup có thể chạy sau khi B đã đăng ký).
        const hintB = vi.fn();
        EventBus.on(EV, hintB);
        EventBus.off(EV, hintA);          // A gỡ ĐÚNG handler của mình

        EventBus.emit(EV);

        expect(hintA).not.toHaveBeenCalled();
        expect(hintB).toHaveBeenCalledTimes(1);   // đây là ca đã hỏng trên app
    });

    test('off(event) không truyền handler thì xoá SẠCH — nguồn gốc lỗi', () => {
        // Ghi lại hành vi này để ai đọc test hiểu vì sao phải luôn truyền handler.
        const a = vi.fn();
        const b = vi.fn();
        EventBus.on(EV, a);
        EventBus.on(EV, b);

        EventBus.off(EV);                 // KHÔNG truyền handler
        EventBus.emit(EV);

        expect(a).not.toHaveBeenCalled();
        expect(b).not.toHaveBeenCalled(); // cả hai chết — kể cả của chế độ khác
    });
});
