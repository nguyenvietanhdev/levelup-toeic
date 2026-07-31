import { useState, useCallback, useRef, useEffect } from 'react';
import { ToeicAPI } from '@api/toeic.js';
import { Notification } from '@ui/Toaster.jsx';
import { Quest } from '@components/quest/quest.js';
import { GameState } from '@game/state.js';
import { EventBus, GameEvents } from '@game/eventBus.js';

// Áp số dư SỰ THẬT từ server (sau khi bắt đầu bài) vào GameState để thanh năng
// lượng/ví cập nhật ngay. Bài TOEIC trừ năng lượng SERVER-SIDE (không như luyện
// tập thường trừ ở client), nên nếu không đồng bộ thì UI đứng im → tưởng không trừ.
function syncResourcesFromServer(resources) {
    if (!resources) return;
    const R = GameState.state.resources;
    for (const k of ['coins', 'gems', 'energy', 'maxEnergy', 'hints', 'shields', 'timeFreezes']) {
        if (typeof resources[k] === 'number') R[k] = resources[k];
    }
    if (resources.lastEnergyUpdate) R.lastEnergyUpdate = new Date(resources.lastEnergyUpdate).getTime();
    EventBus.emit(GameEvents.ENERGY_CHANGED, { current: R.energy, max: R.maxEnergy });
    EventBus.emit(GameEvents.COINS_CHANGED, { total: R.coins });
    EventBus.emit(GameEvents.STATE_CHANGED);
}

const initialState = {
    attemptId: null,
    test: null,
    questions: [],
    currentIndex: 0,
    answers: {},
    markedQuestions: new Set(),
    customTimeLimit: undefined,
    timeMode: 'suggested', // 'suggested' | 'custom' | 'unlimited' — quyết định cách chia giờ Part Đọc
    fillInBlankMode: false,
    keywordAnswers: {},
};

/**
 * Owns all state for an in-progress TOEIC attempt + API calls.
 * Returns state + methods, plus a transition signal for the runner.
 */
export function useToeicAttempt() {
    const [state, setState] = useState(initialState);
    const [pendingTransition, setPendingTransition] = useState(null); // { fromPart, toPart, nextIndex }
    const startTimeRef = useRef(null);
    // Mốc bắt đầu MÀN hiện tại — reset mỗi khi đổi câu/nhóm, để timeSpent là
    // thời gian phản hồi THẬT của câu đó chứ không phải cộng dồn từ đầu bài.
    const questionStartRef = useRef(Date.now());
    const shownTransitionsRef = useRef(new Set());

    const reset = useCallback(() => {
        setState(initialState);
        setPendingTransition(null);
        startTimeRef.current = null;
        shownTransitionsRef.current = new Set();
    }, []);

    const startAttempt = useCallback(async (testId, { fillInBlankMode = false, customTimeLimit, timeMode = 'suggested' } = {}) => {
        const response = await ToeicAPI.startAttempt(testId, fillInBlankMode);
        const apiData = response.data || response;
        if (!apiData?.success || !apiData.data) {
            // Đính kèm số ⚡/🪙 còn thiếu (server trả về) để chỗ gọi mở đúng
            // popup mua năng lượng thay vì chỉ hiện một dòng lỗi cụt.
            const err = new Error(apiData?.message || 'Không thể bắt đầu bài thi');
            if (apiData?.energyNeeded) {
                err.energyNeeded = apiData.energyNeeded;
                err.currentEnergy = apiData.currentEnergy;
            }
            if (apiData?.coinsNeeded) err.coinsNeeded = apiData.coinsNeeded;
            throw err;
        }
        startTimeRef.current = Date.now();
        shownTransitionsRef.current = new Set();
        setState({
            attemptId: apiData.data.attemptId,
            test: apiData.data.test,
            questions: apiData.data.questions || [],
            currentIndex: 0,
            answers: {},
            markedQuestions: new Set(),
            customTimeLimit,
            timeMode,
            fillInBlankMode,
            keywordAnswers: {},
        });
        // Server đã trừ năng lượng/xu khi tạo attempt mới → cập nhật UI ngay.
        syncResourcesFromServer(apiData.data.resources);
        return apiData.data;
    }, []);

    const resumeAttempt = useCallback(async (attemptId, attemptData) => {
        // Resume giờ trả về ĐỦ câu hỏi của đề + map đáp án đã lưu (server dựng lại).
        const res = await ToeicAPI.resumeAttempt(attemptId);
        const apiData = res?.data || res;
        if (!apiData?.success || !apiData.data) {
            throw new Error('Không thể tiếp tục bài thi');
        }
        startTimeRef.current = Date.now();
        shownTransitionsRef.current = new Set();
        setState({
            attemptId,
            test: apiData.data.test || attemptData.testId,
            questions: apiData.data.questions || [],
            currentIndex: 0,
            answers: apiData.data.answers || {},
            markedQuestions: new Set(apiData.data.markedQuestions || []),
            // Đếm ngược tiếp từ thời gian CÒN LẠI server chốt. Để undefined như
            // trước thì useToeicTimer hiểu là "không giới hạn" và đếm TIẾN.
            customTimeLimit: Number.isFinite(apiData.data.timeRemaining)
                ? apiData.data.timeRemaining
                : (apiData.data.test?.totalTime ?? undefined),
            // Resume không nhớ chế độ đã chọn → chia giờ Part Đọc theo trọng số
            // từ thời gian còn lại (xấp xỉ, chấp nhận được cho phiên làm dở).
            timeMode: 'suggested',
            fillInBlankMode: false,
            keywordAnswers: {},
        });
    }, []);

    // Đổi câu/nhóm → khởi động lại đồng hồ phản hồi. Chỉ câu đầu tiên của mỗi
    // màn nhóm được đo từ lúc vào màn; các câu sau đo từ cùng mốc đó (chấp nhận
    // được — không thể tách khi nhiều câu hiện cùng lúc).
    useEffect(() => {
        questionStartRef.current = Date.now();
    }, [state.currentIndex]);

    const submitAnswer = useCallback(async (answer) => {
        let isPartTransition = false;
        let transitionInfo = null;

        setState(prev => {
            const next = { ...prev, answers: { ...prev.answers, [prev.currentIndex]: answer } };
            // Check part transition for full-test
            const cur = prev.questions[prev.currentIndex];
            const nextIdx = prev.currentIndex + 1;
            const nxt = prev.questions[nextIdx];
            if (cur && nxt && cur.part !== nxt.part) {
                const isFull = prev.test?.testType === 'full' || prev.test?.testType === 'full-test';
                if (isFull) {
                    const key = `${cur.part}-${nxt.part}`;
                    if (!shownTransitionsRef.current.has(key)) {
                        shownTransitionsRef.current.add(key);
                        isPartTransition = true;
                        transitionInfo = { fromPart: cur.part, toPart: nxt.part, nextIndex: nextIdx };
                    }
                }
            }
            return next;
        });

        // Send answer to server (fire-and-forget; don't block UI)
        try {
            const questionId = state.questions[state.currentIndex]?._id;
            if (questionId) {
                await ToeicAPI.submitAnswer(state.attemptId, {
                    questionId,
                    userAnswer: answer,
                    timeSpent: Date.now() - (questionStartRef.current || Date.now()),
                });
            }
        } catch (err) {
            console.error('Error submitting answer:', err);
        }

        if (isPartTransition && transitionInfo) {
            setPendingTransition(transitionInfo);
        }
    }, [state.questions, state.currentIndex, state.attemptId]);

    // Ghi đáp án cho MỘT câu bất kỳ theo index tuyệt đối (dùng cho màn NHÓM,
    // nơi nhiều câu cùng hiển thị và trả lời độc lập). Không tự chuyển câu,
    // không kiểm tra chuyển Part (điều đó xử ở điều hướng group-by-group).
    const submitAnswerAt = useCallback(async (index, answer) => {
        setState(prev => ({ ...prev, answers: { ...prev.answers, [index]: answer } }));
        try {
            const questionId = state.questions[index]?._id;
            if (questionId) {
                await ToeicAPI.submitAnswer(state.attemptId, {
                    questionId,
                    userAnswer: answer,
                    timeSpent: Date.now() - (questionStartRef.current || Date.now()),
                });
            }
        } catch (err) {
            console.error('Error submitting answer:', err);
        }
    }, [state.questions, state.attemptId]);

    const goToQuestion = useCallback((index) => {
        setState(prev => ({ ...prev, currentIndex: index }));
    }, []);

    // Nhảy tới index có KIỂM TRA chuyển Part (full-test): nếu vượt ranh giới Part
    // lần đầu thì bật modal chuyển phần thay vì nhảy thẳng (modal sẽ nhảy tiếp).
    const goToQuestionChecked = useCallback((targetIndex) => {
        let transition = null;
        setState(prev => {
            if (targetIndex < 0 || targetIndex >= prev.questions.length) return prev;
            const cur = prev.questions[prev.currentIndex];
            const tgt = prev.questions[targetIndex];
            const isFull = prev.test?.testType === 'full' || prev.test?.testType === 'full-test';
            if (cur && tgt && cur.part !== tgt.part && isFull) {
                const key = `${cur.part}-${tgt.part}`;
                if (!shownTransitionsRef.current.has(key)) {
                    shownTransitionsRef.current.add(key);
                    transition = { fromPart: cur.part, toPart: tgt.part, nextIndex: targetIndex };
                    return prev; // giữ nguyên; modal sẽ nhảy
                }
            }
            return { ...prev, currentIndex: targetIndex };
        });
        if (transition) setPendingTransition(transition);
    }, []);

    const nextQuestion = useCallback(() => {
        setState(prev => {
            if (prev.currentIndex < prev.questions.length - 1) {
                return { ...prev, currentIndex: prev.currentIndex + 1 };
            }
            return prev;
        });
    }, []);

    const prevQuestion = useCallback(() => {
        setState(prev => {
            if (prev.currentIndex > 0) {
                return { ...prev, currentIndex: prev.currentIndex - 1 };
            }
            return prev;
        });
    }, []);

    const toggleMark = useCallback(() => {
        setState(prev => {
            const newSet = new Set(prev.markedQuestions);
            if (newSet.has(prev.currentIndex)) newSet.delete(prev.currentIndex);
            else newSet.add(prev.currentIndex);
            return { ...prev, markedQuestions: newSet };
        });
    }, []);

    const updateKeywordAnswer = useCallback((id, value) => {
        setState(prev => ({ ...prev, keywordAnswers: { ...prev.keywordAnswers, [id]: value } }));
    }, []);

    const pause = useCallback(async () => {
        try {
            await ToeicAPI.pauseAttempt(state.attemptId);
        } catch (err) {
            Notification.error('Lỗi tạm dừng bài thi');
            throw err;
        }
    }, [state.attemptId]);

    const resume = useCallback(async () => {
        try {
            await ToeicAPI.resumeAttempt(state.attemptId);
        } catch (err) {
            Notification.error('Lỗi tiếp tục bài thi');
            throw err;
        }
    }, [state.attemptId]);

    const submitTest = useCallback(async () => {
        const duration = Math.floor((Date.now() - (startTimeRef.current || Date.now())) / 1000);
        const response = await ToeicAPI.submitAttempt(state.attemptId, duration);
        const apiData = response.data || response;
        if (!apiData?.success) {
            throw new Error(apiData?.message || 'Lỗi nộp bài thi');
        }
        // Tick quest TOEIC (vd special_first_toeic) — không có flow nào khác
        // phát sự kiện này nên trước đây quest TOEIC luôn đứng yên.
        try { Quest.updateProgress('complete-toeic', 1); } catch (_) {}
        return apiData.data;
    }, [state.attemptId]);

    const acknowledgeTransition = useCallback((advance = true) => {
        const t = pendingTransition;
        setPendingTransition(null);
        if (advance && t) {
            setState(prev => ({ ...prev, currentIndex: t.nextIndex }));
        }
    }, [pendingTransition]);

    return {
        ...state,
        currentQuestion: state.questions[state.currentIndex],
        pendingTransition,
        startAttempt,
        resumeAttempt,
        submitAnswer,
        submitAnswerAt,
        goToQuestion,
        goToQuestionChecked,
        nextQuestion,
        prevQuestion,
        toggleMark,
        updateKeywordAnswer,
        pause,
        resume,
        submitTest,
        acknowledgeTransition,
        reset,
    };
}
