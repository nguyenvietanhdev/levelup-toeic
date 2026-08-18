/**
 * Nộp câu trả lời TOEIC — lỗi hết năng lượng phải HIỆN RA.
 *
 * Năng lượng bài thi giờ trừ ở câu trả lời ĐẦU TIÊN (trước đây trừ lúc bấm
 * "Bắt đầu", khiến 93% năng lượng TOEIC trong DB đi vào những lượt bỏ ở câu 0).
 * Hệ quả: lỗi "không đủ năng lượng" chuyển từ lúc MỞ bài sang lúc NỘP CÂU.
 *
 * Chỗ chết người: `Http` KHÔNG ném với HTTP 400 — nó trả `{ success: false }`.
 * Nên `try/catch` quanh lời gọi không bao giờ chạy. Nếu chỉ dựa vào catch thì
 * người dùng làm hết 200 câu rồi mới biết không câu nào được ghi nhận.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'useToeicAttempt.js'), 'utf8');

/** Bỏ chú thích — tránh khớp phải lời giải thích thay vì mã thật. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Chạy thật `checkAnswerResponse` cắt ra từ nguồn, với các phụ thuộc giả. */
function loadChecker() {
    const i = code.indexOf('function checkAnswerResponse');
    const body = code.slice(i, code.indexOf('\n}', i) + 2);
    const calls = { modal: [], errors: [] };
    const fn = new Function(
        'EnergyShop', 'Notification',
        `${body}; return checkAnswerResponse;`
    )(
        { showModal: (o) => calls.modal.push(o) },
        { error: (m) => calls.errors.push(m) }
    );
    return { fn, calls };
}

describe('đọc kết quả nộp câu, không nuốt lặng lẽ', () => {
    test('thành công → true, không báo gì', () => {
        const { fn, calls } = loadChecker();
        expect(fn({ success: true })).toBe(true);
        expect(calls.errors).toHaveLength(0);
        expect(calls.modal).toHaveLength(0);
    });

    test('hết năng lượng → MỞ popup nạp, không chỉ báo lỗi', () => {
        // Chỉ hiện dòng lỗi là bắt người dùng tự đi tìm cửa hàng giữa lúc đang thi.
        const { fn, calls } = loadChecker();
        const ok = fn({
            success: false, message: 'Không đủ năng lượng! Cần 18⚡ cho bài 30 câu.',
            energyNeeded: 18, currentEnergy: 3,
        });
        expect(ok).toBe(false);
        expect(calls.modal[0]).toEqual({ needed: 18 });
        expect(calls.errors[0]).toMatch(/Không đủ năng lượng/);
    });

    test('lỗi KHÁC vẫn báo, không im lặng', () => {
        const { fn, calls } = loadChecker();
        expect(fn({ success: false, message: 'Attempt not found' })).toBe(false);
        expect(calls.errors[0]).toBe('Attempt not found');
        expect(calls.modal).toHaveLength(0);
    });

    test('lỗi không kèm message → vẫn có câu chữ cho người dùng', () => {
        const { fn, calls } = loadChecker();
        expect(fn({ success: false })).toBe(false);
        expect(calls.errors[0]).toMatch(/Không lưu được/);
    });

    test('gỡ được lớp bọc `.data` của Http', () => {
        // Http bọc phản hồi server vào `.data`; quên gỡ là mọi lỗi lọt qua.
        const { fn, calls } = loadChecker();
        expect(fn({ data: { success: false, energyNeeded: 18 } })).toBe(false);
        expect(calls.modal[0]).toEqual({ needed: 18 });
    });

    test('phản hồi rỗng/undefined coi như OK, không báo lỗi giả', () => {
        // Một số đường trả về rỗng khi thành công — báo lỗi ở đây là làm phiền
        // người dùng giữa bài thi vì chuyện không có thật.
        const { fn, calls } = loadChecker();
        expect(fn(undefined)).toBe(true);
        expect(calls.errors).toHaveLength(0);
    });
});

describe('CẢ HAI đường nộp câu đều kiểm', () => {
    test('submitAnswer (màn từng câu) gọi checkAnswerResponse', () => {
        const i = code.indexOf('const submitAnswer =');
        const body = code.slice(i, code.indexOf('const submitAnswerAt', i));
        expect(body).toMatch(/checkAnswerResponse\(res\)/);
    });

    test('submitAnswerAt (màn NHÓM) cũng gọi', () => {
        // Part 3/4/6/7 hiển thị nhiều câu cùng lúc và đi qua đường này; bỏ sót
        // là đúng những Part dài nhất mất cảnh báo.
        const i = code.indexOf('const submitAnswerAt =');
        const body = code.slice(i, code.indexOf('const goToQuestion', i));
        expect(body).toMatch(/checkAnswerResponse\(res\)/);
    });

    test('lỗi mạng (catch thật sự chạy) cũng báo cho người dùng', () => {
        const i = code.indexOf('const submitAnswer =');
        const body = code.slice(i, code.indexOf('const goToQuestion', i));
        const catches = body.match(/catch \(err\) \{[\s\S]*?\}/g) || [];
        expect(catches.length).toBeGreaterThanOrEqual(2);
        for (const c of catches) expect(c).toMatch(/Notification\.error/);
    });
});
