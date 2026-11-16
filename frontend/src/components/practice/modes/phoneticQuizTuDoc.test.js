/**
 * Đọc phiên âm: sang câu mới là tự đọc từ.
 *
 * Chỗ dễ hỏng: dạng "nhìn phiên âm, chọn từ" không tự đọc (chỉ dạng nghe-chọn-nghĩa mới đọc);
 * đọc chữ Hán bằng giọng Anh vì không truyền giọng; bấm sang câu nhanh thì đọc nhầm từ câu cũ;
 * tắt âm thanh trong Cài đặt mà vẫn đọc.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const loa = vi.hoisted(() => ({ speakWord: vi.fn() }));
const caiDat = vi.hoisted(() => ({ soundEnabled: true }));
vi.mock('@game/gameLogic.js', () => ({
    GameLogic: loa,
    ttsLang: (w) => w?.ttsLang || 'en-US',
    vocabLang: () => 'en',
}));
vi.mock('@game/state.js', () => ({ GameState: { state: { settings: caiDat } } }));
vi.mock('@components/practice/questionTimer.js', () => ({ startQuestionTimer: vi.fn() }));
vi.mock('@components/practice/questionTimeout.js', () => ({ timeoutQuestion: vi.fn() }));
vi.mock('@components/practice/practiceNav.js', () => ({ afterAnswer: vi.fn() }));
vi.mock('@components/vocab/part/partSelector.js', () => ({ PartSelector: {} }));
vi.mock('@ui/Toaster.jsx', () => ({ Notification: { show: vi.fn() } }));

import { PhoneticQuiz } from './phoneticQuiz.js';

const tu = (en, extra = {}) => ({ en, vn: `nghĩa ${en}`, phonetic: `ipa-${en}`, ...extra });
const cauHoi = (word, mode = 'ipa-to-word') => ({ word, options: [word, tu('x'), tu('y'), tu('z')], correctIndex: 0, mode });

beforeEach(() => {
    vi.useFakeTimers();
    loa.speakWord.mockClear();
    caiDat.soundEnabled = true;
    document.body.innerHTML = '<div id="practice-content"></div>';
    globalThis.PracticeManager = { updateProgress: vi.fn(), setCurrentWord: vi.fn(), complete: vi.fn(), recordAnswer: vi.fn() };
    PhoneticQuiz.config = { pointsPerCorrect: 140 };
    PhoneticQuiz.currentIndex = 0;
});
afterEach(() => {
    vi.useRealTimers();
    delete globalThis.PracticeManager;
});

describe('tự đọc khi sang câu mới', () => {
    test('dạng nhìn phiên âm cũng tự đọc từ', () => {
        PhoneticQuiz.questions = [cauHoi(tu('schedule'))];
        PhoneticQuiz.showQuestion();
        expect(loa.speakWord).not.toHaveBeenCalled();
        vi.advanceTimersByTime(500);
        expect(loa.speakWord).toHaveBeenCalledWith('schedule', 'en-US');
    });

    test('câu sau cũng tự đọc, và đọc đúng từ của câu đó', () => {
        PhoneticQuiz.questions = [cauHoi(tu('schedule')), cauHoi(tu('budget'))];
        PhoneticQuiz.showQuestion();
        vi.advanceTimersByTime(500);
        PhoneticQuiz.nextQuestion();
        vi.advanceTimersByTime(500);
        expect(loa.speakWord).toHaveBeenLastCalledWith('budget', 'en-US');
    });

    test('bấm sang câu mới trước khi kịp đọc: không đọc từ câu cũ', () => {
        PhoneticQuiz.questions = [cauHoi(tu('schedule')), cauHoi(tu('budget'))];
        PhoneticQuiz.showQuestion();
        PhoneticQuiz.nextQuestion();
        vi.advanceTimersByTime(1000);
        expect(loa.speakWord.mock.calls.map((c) => c[0])).toEqual(['budget']);
    });

    test('từ chữ Hán đọc bằng giọng Trung theo chính từ đó', () => {
        PhoneticQuiz.questions = [cauHoi(tu('银行', { ttsLang: 'zh-CN', phonetic: 'yínháng' }))];
        PhoneticQuiz.showQuestion();
        vi.advanceTimersByTime(500);
        expect(loa.speakWord).toHaveBeenCalledWith('银行', 'zh-CN');
    });

    test('tắt âm thanh trong Cài đặt thì không tự đọc', () => {
        caiDat.soundEnabled = false;
        PhoneticQuiz.questions = [cauHoi(tu('schedule')), cauHoi(tu('budget'), 'meaning')];
        PhoneticQuiz.showQuestion();
        PhoneticQuiz.nextQuestion();
        vi.advanceTimersByTime(1000);
        expect(loa.speakWord).not.toHaveBeenCalled();
    });

    test('nút loa vẫn đọc lại được', () => {
        PhoneticQuiz.questions = [cauHoi(tu('schedule'))];
        PhoneticQuiz.showQuestion();
        vi.advanceTimersByTime(500);
        loa.speakWord.mockClear();
        document.getElementById('pq-play-btn').click();
        expect(loa.speakWord).toHaveBeenCalledWith('schedule', 'en-US');
    });
});
