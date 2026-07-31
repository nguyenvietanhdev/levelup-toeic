import { useState, useEffect, useCallback } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { PracticeManager } from '@components/practice/practiceManager.js';
import { stopPracticeBgm } from '@game/uiSounds.js';
import FavoriteButton from '@components/favorites/FavoriteButton.jsx';

export default function PracticeScreen({ active }) {
    const { showScreen, syncFromState } = useGame();
    const [modeTitle, setModeTitle] = useState('Chế độ luyện tập');
    const [difficultyBadge, setDifficultyBadge] = useState('');
    const [questionNum, setQuestionNum] = useState(1);
    const [totalQuestions, setTotalQuestions] = useState(10);
    const [timer, setTimer] = useState('00:00');
    const [score, setScore] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [wrongCount, setWrongCount] = useState(0);
    const [freezeCount, setFreezeCount] = useState(0);
    const [engineLoaded, setEngineLoaded] = useState(false);
    const [engineLoading, setEngineLoading] = useState(false);
    const [timerVisible, setTimerVisible] = useState(
        () => GameState.state?.settings?.timeLimitEnabled !== false
    );

    // Expose React state setters to window so vanilla JS can update practice header
    useEffect(() => {
        window._reactSetPracticeHeader = ({ mode, diffBadge }) => {
            if (mode) setModeTitle(mode);
            if (diffBadge !== undefined) setDifficultyBadge(diffBadge);
        };
        window._reactSetPracticeScore = ({ score: s, correct: c, wrong: w }) => {
            if (s !== undefined) setScore(s);
            if (c !== undefined) setCorrectCount(c);
            if (w !== undefined) setWrongCount(w);
        };
        window._reactSetPracticeTimer = (t) => setTimer(t);
        window._reactSetPracticeProgress = ({ current, total }) => {
            if (current !== undefined) setQuestionNum(current);
            if (total !== undefined) setTotalQuestions(total);
        };
        window._reactSetFreezeCount = (n) => setFreezeCount(n);
        window._reactSetTimerVisible = (v) => setTimerVisible(v);
        return () => {
            delete window._reactSetPracticeHeader;
            delete window._reactSetPracticeScore;
            delete window._reactSetPracticeTimer;
            delete window._reactSetPracticeProgress;
            delete window._reactSetFreezeCount;
            delete window._reactSetTimerVisible;
        };
    }, []);

    // Sync GameState changes back to React after practice
    useEffect(() => {
        const unsub = EventBus.on(GameEvents.PRACTICE_COMPLETED, () => syncFromState());
        return () => unsub();
    }, [syncFromState]);

    // Chốt tắt nhạc nền: rời màn luyện tập là im, bất kể đi bằng đường nào
    // (nút quay lại, menu, bỏ dở giữa chừng). Bật thì do PracticeManager lo —
    // ở đây không bật, vì màn có thể active mà chưa chọn chế độ nào.
    useEffect(() => {
        if (active) return;
        stopPracticeBgm();
    }, [active]);

    const loadAndStart = useCallback(async (mode) => {
        if (engineLoading) return;
        setEngineLoading(true);
        try {
            setEngineLoaded(true);
            PracticeManager.start(mode);
        } catch (err) {
            console.error('[PracticeScreen] Engine start failed:', err);
        } finally {
            setEngineLoading(false);
        }
    }, [engineLoading]);

    // When screen becomes active, check for pending mode and sync freeze count
    useEffect(() => {
        if (!active) return;
        setFreezeCount(window.GameState?.state?.resources?.timeFreezes || 0);
        const pendingMode = sessionStorage.getItem('pendingMode');
        if (pendingMode) {
            sessionStorage.removeItem('pendingMode');
            loadAndStart(pendingMode);
        }
    }, [active, loadAndStart]);

    const handleBack = () => {
        PracticeManager.exit('home-screen');
    };

    return (
        <div id="practice-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="practice-header">
                <button id="back-btn" className="icon-btn" onClick={handleBack}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <div className="practice-info">
                    <h2 id="practice-mode-title">{modeTitle}</h2>
                    <div className="practice-meta">
                        <span id="practice-difficulty-badge" className="difficulty-badge">{difficultyBadge}</span>
                        <span className="practice-progress">
                            <span id="question-number">{questionNum}</span> /
                            <span id="total-questions">{totalQuestions}</span>
                        </span>
                    </div>
                </div>
                <div className="practice-score-bar">
                    <div className="score-item">
                        <i className="fas fa-star"></i>
                        <span id="practice-score">{score}</span>
                    </div>
                    <div className="score-item">
                        <i className="fas fa-check-circle"></i>
                        <span id="correct-count">{correctCount}</span>
                    </div>
                    <div className="score-item">
                        <i className="fas fa-times-circle"></i>
                        <span id="wrong-count">{wrongCount}</span>
                    </div>
                </div>
                <FavoriteButton />
                {timerVisible && (
                    <div className="practice-timer">
                        <i className="fas fa-clock"></i>
                        <span id="practice-timer">{timer}</span>
                    </div>
                )}
            </div>

            {engineLoading && (
                <div className="loading-state" style={{ textAlign: 'center', padding: 40 }}>
                    <i className="fas fa-spinner fa-spin fa-2x"></i>
                    <p style={{ marginTop: 12 }}>Đang tải chế độ luyện tập...</p>
                </div>
            )}

            <div id="practice-content" className="practice-content">
                {/* Vanilla JS practice modes inject DOM here */}
            </div>

            <div className="practice-actions">
                <button id="hint-btn" className="action-btn hint-btn">
                    <i className="fas fa-lightbulb"></i>
                    <span>Gợi ý</span>
                    <span className="cost">50 <i className="fas fa-coins"></i></span>
                </button>
                <button id="freeze-btn" className="action-btn freeze-btn">
                    <i className="fas fa-pause"></i>
                    <span>Dừng thời gian</span>
                    <span className="freeze-count">{freezeCount}</span>
                </button>
                <button id="skip-btn" className="action-btn skip-btn">
                    <i className="fas fa-forward"></i>
                    <span>Bỏ qua</span>
                </button>
            </div>
        </div>
    );
}
