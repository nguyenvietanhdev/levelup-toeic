import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Đồng hồ bài thi luôn đọc theo PHÚT, không tách giờ: chặng Đọc 75' hiện
 * "75:00" thay vì "1:15:00". Đề TOEIC nói bằng phút (45'/75'/120') nên hiện
 * dạng giờ khiến người làm bài không đối chiếu được với mốc mình biết.
 */
export function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Test timer hook.
 * - If totalSeconds is null → count up (unlimited mode)
 * - Otherwise → count down; calls onTimeUp() at 0
 */
export function useToeicTimer({ totalSeconds, onTimeUp }) {
    const [elapsed, setElapsed] = useState(0);
    const [running, setRunning] = useState(false);
    const intervalRef = useRef(null);
    const onTimeUpRef = useRef(onTimeUp);
    onTimeUpRef.current = onTimeUp;

    const start = useCallback(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setRunning(true);
        intervalRef.current = setInterval(() => {
            setElapsed(e => {
                const next = e + 1;
                if (totalSeconds !== null && totalSeconds !== undefined && next >= totalSeconds) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                    onTimeUpRef.current?.();
                    return totalSeconds;
                }
                return next;
            });
        }, 1000);
    }, [totalSeconds]);

    const pause = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setRunning(false);
    }, []);

    const reset = useCallback(() => {
        pause();
        setElapsed(0);
    }, [pause]);

    useEffect(() => () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
    }, []);

    const isUnlimited = totalSeconds === null || totalSeconds === undefined;
    const remaining = isUnlimited ? elapsed : Math.max(0, totalSeconds - elapsed);
    const display = formatTime(isUnlimited ? elapsed : remaining);
    const warning = !isUnlimited && remaining <= 300;

    return { elapsed, remaining, display, isUnlimited, warning, running, start, pause, reset };
}
