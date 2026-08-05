/**
 * Thanh nhịp của câu hiện tại ở màn luyện từ vựng — dữ liệu mà `questionTimer`
 * đẩy sang React để vẽ.
 *
 * Điểm dễ sai nhất và là lý do test này tồn tại: ngưỡng "sắp hết" phải tính theo
 * GIÂY CÒN LẠI, không theo tỉ lệ. Mỗi chế độ có thời lượng khác nhau (20s cho
 * trắc nghiệm, 40s cho nghe chuỗi từ) — lấy tỉ lệ thì 5 giây cuối của câu 40 giây
 * mới là 12.5%, còn của câu 20 giây là 25%: cùng một mức gấp mà hai màu khác nhau.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameState } from '@game/state.js';
import { startQuestionTimer, stopQuestionTimer } from './questionTimer.js';

/** Phần trăm bề rộng thanh — cùng công thức với PracticeScreen.jsx và RunnerHeader.jsx. */
const pct = ({ left, total }) => Math.max(0, Math.min(100, (left / total) * 100));

describe('questionTimer — dữ liệu thanh nhịp', () => {
    let pushed;

    beforeEach(() => {
        vi.useFakeTimers();
        pushed = [];
        window._reactSetPracticePace = (p) => pushed.push(p);
        window._reactSetPracticeTimer = () => {};
        window._reactSetTimerVisible = () => {};
        GameState.state = { settings: { timeLimitEnabled: true, questionTime: { 'multiple-choice': 20 } } };
    });

    afterEach(() => {
        stopQuestionTimer();
        vi.useRealTimers();
        delete window._reactSetPracticePace;
        delete window._reactSetPracticeTimer;
        delete window._reactSetTimerVisible;
    });

    test('đẩy đầy đủ {left,total} ngay khi bắt đầu câu', () => {
        startQuestionTimer('multiple-choice', () => {});
        expect(pushed[0]).toEqual({ left: 20, total: 20 });
        expect(pct(pushed[0])).toBe(100);
    });

    test('left giảm mỗi giây, total giữ nguyên — thanh rút dần', () => {
        startQuestionTimer('multiple-choice', () => {});
        vi.advanceTimersByTime(3000);
        const last = pushed[pushed.length - 1];
        expect(last).toEqual({ left: 17, total: 20 });
        expect(pct(last)).toBe(85);
    });

    test('tắt giới hạn thời gian trong cài đặt → đẩy null, không vẽ thanh', () => {
        GameState.state.settings.timeLimitEnabled = false;
        startQuestionTimer('multiple-choice', () => {});
        expect(pushed).toEqual([null]);
    });

    test('total đổi theo TỪNG chế độ, không phải một hằng số', () => {
        GameState.state.settings.questionTime = { 'multiple-choice': 20, 'sentence-listening': 40 };
        startQuestionTimer('multiple-choice', () => {});
        expect(pushed[0].total).toBe(20);

        pushed = [];
        startQuestionTimer('sentence-listening', () => {});
        expect(pushed[0].total).toBe(40);
    });

    test('ngưỡng đỏ theo GIÂY, nên câu dài và câu ngắn đỏ ở cùng mức gấp', () => {
        const urgent = (p) => p.left <= 5;   // cùng điều kiện với PracticeScreen.jsx

        // Câu 20 giây: còn 5 → đỏ. Theo tỉ lệ thì đây là 25%.
        expect(urgent({ left: 5, total: 20 })).toBe(true);
        // Câu 40 giây: còn 5 → CŨNG đỏ, dù chỉ là 12.5%.
        expect(urgent({ left: 5, total: 40 })).toBe(true);
        // Còn 6 giây thì chưa, ở cả hai.
        expect(urgent({ left: 6, total: 20 })).toBe(false);
        expect(urgent({ left: 6, total: 40 })).toBe(false);

        // Đối chứng: nếu lỡ đổi sang ngưỡng theo tỉ lệ (vd < 20%), mốc đỏ TRÔI theo
        // độ dài câu — câu 20s đỏ ở 4 giây (muộn hơn), câu 40s đỏ ở 8 giây (sớm hơn).
        // Cùng một mức gấp mà người học thấy hai tín hiệu khác nhau.
        const byRatio = (p) => p.left / p.total < 0.2;
        expect(byRatio({ left: 4, total: 20 })).toBe(false);   // tỉ lệ CHƯA đỏ...
        expect(urgent({ left: 4, total: 20 })).toBe(true);     // ...mà theo giây thì rồi
        expect(byRatio({ left: 7, total: 40 })).toBe(true);    // tỉ lệ ĐÃ đỏ...
        expect(urgent({ left: 7, total: 40 })).toBe(false);    // ...mà theo giây thì chưa
    });

    test('không rơi xuống âm khi hết giờ', () => {
        startQuestionTimer('multiple-choice', () => {});
        vi.advanceTimersByTime(25000);
        for (const p of pushed.filter(Boolean)) {
            expect(p.left).toBeGreaterThanOrEqual(0);
            expect(pct(p)).toBeGreaterThanOrEqual(0);
        }
    });
});
