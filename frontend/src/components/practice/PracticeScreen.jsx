import { useState, useEffect, useCallback } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { PracticeManager } from '@components/practice/practiceManager.js';
import { stopPracticeBgm } from '@game/uiSounds.js';
import FavoriteButton from '@components/favorites/FavoriteButton.jsx';
import { LangPairSwitch } from './LangPairSwitch.jsx';

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
    // { left, total } giây của CÂU hiện tại, do questionTimer đẩy sang. null = tắt
    // giới hạn thời gian trong cài đặt.
    const [pace, setPace] = useState(null);

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
        window._reactSetPracticePace = (p) => setPace(p);
        return () => {
            delete window._reactSetPracticeHeader;
            delete window._reactSetPracticeScore;
            delete window._reactSetPracticeTimer;
            delete window._reactSetPracticeProgress;
            delete window._reactSetFreezeCount;
            delete window._reactSetTimerVisible;
            delete window._reactSetPracticePace;
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
                {/* NGẮT DÒNG trên màn hẹp — chỉ hiện ở mobile (CSS).
                    Header là flex có `wrap`, nên trước đây nút đổi cặp có xuống
                    dòng hay không là TÌNH CỜ: phụ thuộc tên chế độ dài bao
                    nhiêu. Tên ngắn thì nó chen vào hàng đầu và bóp méo cả hàng.
                    Một phần tử rộng 100% cao 0 là cách duy nhất ép flex xuống
                    dòng chắc chắn. */}
                <div className="practice-header-break" aria-hidden="true" />

                {/* Đổi chiều hỏi–đáp ngay tại chỗ. Trước đây phải thoát ra vào
                    Settings, mà đó là hai lựa chọn nằm hai chỗ khác nhau. */}
                <LangPairSwitch />
                <FavoriteButton />
                {timerVisible && (
                    <div className="practice-timer">
                        <i className="fas fa-clock"></i>
                        <span id="practice-timer">{timer}</span>
                    </div>
                )}

                {/* Thanh nhịp câu hiện tại — cùng cách đọc với màn thi TOEIC
                    (RunnerHeader.jsx). Ngưỡng đỏ tính theo GIÂY còn lại chứ không
                    theo tỉ lệ: 5 giây cuối của câu 10 giây và của câu 60 giây đều
                    gấp như nhau, còn theo tỉ lệ thì câu ngắn sẽ chẳng bao giờ đỏ. */}
                {pace && pace.total > 0 && (
                    <div className="practice-pace-bar">
                        <div
                            className={`practice-pace-fill${pace.left <= 5 ? ' urgent' : ''}`}
                            style={{ width: `${Math.max(0, Math.min(100, (pace.left / pace.total) * 100))}%` }}
                        />
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
                <button id="freeze-btn" className="action-btn freeze-btn" title="Dừng thời gian">
                    <i className="fas fa-pause"></i>
                    {/* Hai nhãn, CSS chọn hiện cái nào theo khổ màn (responsive.css).
                        "Dừng thời gian" không vừa một dòng khi ba nút chia đều màn
                        360px — nó vỡ GIỮA TỪ ("Dừng thời / gian") và nút cao gấp đôi
                        hai nút bên cạnh. Nhãn ngắn nói đủ nghĩa, `title` giữ nghĩa đầy. */}
                    <span className="label-full">Dừng thời gian</span>
                    <span className="label-short">Dừng giờ</span>
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
