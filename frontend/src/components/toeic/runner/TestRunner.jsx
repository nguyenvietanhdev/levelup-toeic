import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Modal } from '@ui/Modal.jsx';
import { Notification } from '@ui/Toaster.jsx';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { registerToeicExitGuard, clearToeicExitGuard } from '../toeicRunGuard.js';
import { EnergyShop } from '@game/energyShop.js';
import { useToeicAttempt } from '../hooks/useToeicAttempt.js';
import { useToeicTimer } from '../hooks/useToeicTimer.js';
import { useToeicAudio } from '../hooks/useToeicAudio.js';
import RunnerHeader from './RunnerHeader.jsx';
import QuestionView from './QuestionView.jsx';
import GroupQuestionView from './GroupQuestionView.jsx';
import QuestionNavPopup from './QuestionNavPopup.jsx';
import PartTransitionModal from './PartTransitionModal.jsx';
import {
    isToeicQuestionTimerOn,
    isToeicAutoAdvanceOn,
    getToeicScreenTime,
    getToeicTransition,
    buildToeicReadingPlan,
    buildCustomReadingPlan,
    buildFullTestReadingPlan,
    isFullTestType,
    toeicQuestionNumber,
    TOEIC_TOTAL_QUESTIONS,
    FULL_TEST_LISTENING_SECONDS,
    FULL_TEST_READING_SECONDS,
} from '../toeicPartTime.js';

// Dải index của nhóm chứa `index` (các câu liền kề cùng groupId). Không nhóm → [i,i].
function getGroupRange(questions, index) {
    const q = questions[index];
    if (!q) return [index, index];

    // Backend dàn phẳng theo MÀN nên mỗi câu tự biết vị trí của mình trong màn
    // (questionIndex 1..N) và màn có bao nhiêu câu (setSize) → suy ra dải ngay,
    // khỏi quét hai chiều và khỏi giả định các câu cùng màn nằm liền kề.
    const idx = Number(q.questionIndex);
    const size = Number(q.setSize);
    if (Number.isFinite(idx) && Number.isFinite(size) && size > 0) {
        const start = Math.max(0, index - (idx - 1));
        return [start, Math.min(questions.length - 1, start + size - 1)];
    }

    // Dữ liệu cũ không có setSize → quay lại cách quét theo groupId.
    if (!q.groupId) return [index, index];
    let start = index;
    let end = index;
    while (start > 0 && questions[start - 1]?.groupId === q.groupId) start--;
    while (end < questions.length - 1 && questions[end + 1]?.groupId === q.groupId) end++;
    return [start, end];
}

export default function TestRunner({ config, onExit, onShowResults }) {
    const attempt = useToeicAttempt();
    const [phase, setPhase] = useState('loading'); // loading | running
    const [navOpen, setNavOpen] = useState(false);
    const [keywordStatus, setKeywordStatus] = useState({});
    const startedRef = useRef(false);

    // Ref trỏ tới doSubmit MỚI NHẤT — tránh stale closure khi hết giờ (onTimeUp
    // deps [] sẽ ôm doSubmit của render đầu lúc attemptId còn null → submit lỗi).
    const doSubmitRef = useRef(null);

    // ── FULL TEST: 2 chặng giờ chuẩn ETS, KHÔNG theo popup/Cài đặt ──────────
    // Nghe 45' xuyên suốt Part 1-4, rồi Đọc 75' cho Part 5-7 (đồng hồ chạy lại
    // từ đầu khi sang chặng Đọc), thay vì một đồng hồ tổng như đề thường.
    const isFullTest = isFullTestType(attempt.test);
    const section = (attempt.currentQuestion?.part ?? 1) <= 4 ? 'listening' : 'reading';
    const timerTotal = isFullTest
        ? (section === 'listening' ? FULL_TEST_LISTENING_SECONDS : FULL_TEST_READING_SECONDS)
        : attempt.customTimeLimit;

    // onTimeUp có deps [] nên đọc qua ref để không ôm giá trị của render đầu.
    const isFullTestRef = useRef(false);
    const sectionRef = useRef('listening');
    const jumpToReadingRef = useRef(null);
    const contentRef = useRef(null);   // khung 2 cột, để trả vị trí cuộn về đầu
    isFullTestRef.current = isFullTest;
    sectionRef.current = section;

    const onTimeUp = useCallback(() => {
        // Hết 45' phần Nghe của Full Test → sang phần Đọc như thi thật,
        // KHÔNG nộp bài. Chỉ hết giờ phần Đọc (hoặc đề thường) mới nộp.
        if (isFullTestRef.current && sectionRef.current === 'listening') {
            Notification.warning('Hết 45 phút phần Nghe — chuyển sang phần Đọc!');
            jumpToReadingRef.current?.();
            return;
        }
        Notification.warning('Hết giờ! Tự động nộp bài...');
        setTimeout(() => doSubmitRef.current?.(), 2000);
    }, []);

    const timer = useToeicTimer({ totalSeconds: timerTotal, onTimeUp });

    const handleAudioFinished = useCallback(() => {
        const q = attempt.currentQuestion;
        if (!q || q.part > 4) return;
        if (attempt.pendingTransition) return;
        // Tôn trọng công tắc "Tự động chuyển câu": tắt thì đứng yên cho tự bấm Tiếp.
        if (!isToeicAutoAdvanceOn()) return;
        const [gs, ge] = getGroupRange(attempt.questions, attempt.currentIndex);
        const isGroup = ge > gs;
        // Nghe xong: NHÓM (Part 3/4) nhảy qua CẢ nhóm, câu đơn (Part 1/2) sang câu
        // kế. Nhóm chừa lâu hơn (2s) để kịp chốt đáp án các câu con.
        setTimeout(() => {
            if (isGroup) attempt.goToQuestionChecked(Math.min(ge + 1, attempt.questions.length - 1));
            else attempt.nextQuestion();
        }, isGroup ? 2000 : 600);
    }, [attempt]);

    // Thanh nhịp: giây còn lại + tổng của MÀN hiện tại.
    //  - Part Đọc 5·6·7: chia từ tổng thời gian đã chọn (effect bên dưới).
    //  - Part Nghe 1·4: theo ĐỘ DÀI FILE AUDIO (handleAudioProgress).
    const [screenLeft, setScreenLeft] = useState(null);
    const [screenTotal, setScreenTotal] = useState(0);

    // Vẽ thanh nhịp Part Nghe theo tiến trình audio. Chỉ khi bật đồng hồ từng câu
    // và có giới hạn thời gian; audio thật mới biết độ dài (TTS bỏ qua).
    const handleAudioProgress = useCallback(({ duration, currentTime }) => {
        if (!isToeicQuestionTimerOn()) return;
        const q = attempt.currentQuestion;
        if (!q || q.part > 4) return;
        // "không giới hạn" → không thanh. Full Test luôn có giờ nên bỏ qua kiểm tra này.
        if (!isFullTestType(attempt.test) && attempt.customTimeLimit == null) return;
        if (!Number.isFinite(duration) || duration <= 0) return;
        setScreenTotal(Math.ceil(duration));
        setScreenLeft(Math.max(0, Math.ceil(duration - currentTime)));
    }, [attempt]);

    const audio = useToeicAudio({ onFinished: handleAudioFinished, onProgress: handleAudioProgress });

    // Hết giờ phần Nghe → cắt audio, nhảy thẳng tới câu Part 5 đầu tiên.
    // Đổi part kéo theo đổi `section` → effect bên dưới đặt lại đồng hồ 75'.
    jumpToReadingRef.current = () => {
        const idx = attempt.questions.findIndex(q => Number(q.part) >= 5);
        if (idx < 0) { doSubmitRef.current?.(); return; }  // đề không có phần Đọc
        audio.stop();
        attempt.goToQuestion(idx);
    };

    // Ẩn header khi cuộn XUỐNG, hiện lại khi cuộn LÊN (để đọc câu dài rộng hơn).
    const [headerHidden, setHeaderHidden] = useState(false);
    useEffect(() => {
        let lastY = window.scrollY;
        let ticking = false;
        const apply = () => {
            const y = window.scrollY;
            const dy = y - lastY;
            if (Math.abs(dy) >= 6) {           // bỏ rung nhỏ
                if (dy > 0 && y > 80) setHeaderHidden(true);   // xuống + đã qua khỏi đầu → ẩn
                else if (dy < 0) setHeaderHidden(false);        // lên → hiện
                lastY = y;
            }
            ticking = false;
        };
        const onScroll = () => {
            if (!ticking) { ticking = true; requestAnimationFrame(apply); }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Header đề thi dính (sticky) NGAY DƯỚI hai thanh chung của app (.top-nav +
    // .status-bar) — cả hai cũng sticky. Để top:0 thì nó trượt xuống dưới hai
    // thanh kia và biến mất đúng lúc cuộn xem ảnh. Đo chiều cao thật thay vì
    // ghi số cứng: desktop/mobile mỗi nơi một khác.
    useEffect(() => {
        const measure = () => {
            const h = ['.top-nav', '.status-bar'].reduce((sum, sel) => {
                const el = document.querySelector(sel);
                if (!el) return sum;
                const st = getComputedStyle(el);
                if (st.position !== 'sticky' && st.position !== 'fixed') return sum;
                return sum + el.getBoundingClientRect().height;
            }, 0);
            document.documentElement.style.setProperty('--app-sticky-offset', `${Math.round(h)}px`);
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    // Khoá thanh tìm kiếm trên header CHỈ khi đang làm Full Test (mini/đục lỗ không khoá).
    useEffect(() => {
        EventBus.emit(GameEvents.TOEIC_SEARCH_LOCK, phase === 'running' && isFullTest);
        return () => EventBus.emit(GameEvents.TOEIC_SEARCH_LOCK, false);
    }, [phase, isFullTest]);

    // Start or resume attempt on mount
    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        (async () => {
            try {
                if (config.resumeInfo) {
                    await attempt.resumeAttempt(config.resumeInfo.attemptId, config.resumeInfo.data);
                } else {
                    await attempt.startAttempt(config.testId, {
                        fillInBlankMode: config.fillInBlankMode,
                        customTimeLimit: config.customTimeLimit,
                        timeMode: config.timeMode,
                    });
                }
                setPhase('running');
            } catch (err) {
                // Hết năng lượng → mở thẳng popup mua, khỏi bắt vào cửa hàng.
                // Vẫn thoát runner: mua xong người dùng đang ở danh sách đề,
                // bấm lại đề là vào (khôi phục runner vừa gỡ thì phức tạp mà
                // chẳng lợi gì).
                if (err.energyNeeded) {
                    EnergyShop.showModal({ needed: err.energyNeeded });
                } else {
                    Notification.error(err.message || 'Không thể bắt đầu bài thi');
                }
                onExit();
            }
        })();
    }, [config, attempt, onExit]);

    // Start timer once running
    useEffect(() => {
        if (phase === 'running') timer.start();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    // Full Test: sang chặng Đọc thì đồng hồ chạy lại từ đầu với ngân sách 75'.
    // (useToeicTimer chốt totalSeconds trong closure của start → phải start lại.)
    const prevSectionRef = useRef(section);
    useEffect(() => {
        if (!isFullTest || phase !== 'running') return;
        if (prevSectionRef.current === section) return;
        prevSectionRef.current = section;
        timer.reset();
        timer.start();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [section, isFullTest, phase]);

    // Auto-play audio on question change (listening parts)
    useEffect(() => {
        if (phase !== 'running') return;
        const q = attempt.currentQuestion;
        if (!q || q.part > 4) return;
        audio.resetFinished();
        const prev = attempt.questions[attempt.currentIndex - 1];
        const isFirstOfPart = attempt.currentIndex === 0 || (prev && prev.part !== q.part);
        const t = setTimeout(() => {
            if (q.audioUrl) audio.playRealAudio(q.audioUrl);
            else if (q.audioText) audio.playTTS(q.audioText, { part: q.part, isFirstOfPart });
        }, 300);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt.currentIndex, phase]);

    // Sang câu/nhóm mới → trả HAI CỘT về đầu. Hai cột cuộn độc lập với trang, nên
    // giữ nguyên vị trí cuộn cũ là câu mới hiện ra ở lưng chừng: người thi tưởng
    // mất phần đầu đề bài, hoặc tệ hơn là không thấy câu hỏi đâu cả.
    useEffect(() => {
        contentRef.current
            ?.querySelectorAll('.toeic-left-panel, .toeic-right-panel')
            .forEach(el => { el.scrollTop = 0; });
    }, [attempt.currentIndex]);

    const doSubmit = useCallback(async () => {
        timer.pause();
        audio.stop();
        // Nộp bài tự điều hướng sang màn kết quả — gỡ guard để không bị hỏi
        // "Thoát bài thi?" nhầm khi đang chấm.
        clearToeicExitGuard();
        Modal.show({
            title: 'Đang chấm bài...',
            content: '<div style="text-align:center;padding:20px"><i class="fas fa-spinner fa-spin" style="font-size:48px;color:var(--primary-color)"></i></div>',
        });
        try {
            const data = await attempt.submitTest();
            Modal.close();
            attempt.reset();
            onShowResults?.(data); // mở TRANG kết quả thay cho popup
        } catch (err) {
            Modal.close();
            Notification.error(err.message || 'Lỗi nộp bài thi');
        }
    }, [attempt, timer, audio, onShowResults]);
    doSubmitRef.current = doSubmit; // luôn trỏ tới doSubmit mới nhất

    const handleSelectAnswer = useCallback((answer) => {
        const q = attempt.currentQuestion;
        attempt.submitAnswer(answer);
        // Part Đọc: chọn xong tự sang câu kế sau 1s — chỉ khi công tắc "Tự động
        // chuyển câu" đang bật (tắt thì người dùng tự bấm Tiếp, đúng như mô tả).
        // TRỪ Full Test — thi thật phần Đọc tự quản lý thời gian, được quay lại
        // sửa/bỏ qua câu tuỳ ý, nên không giật câu khỏi tay người làm bài.
        // (Phần Nghe 1-4 vẫn tự chuyển vì audio dẫn nhịp.)
        if (q && q.part >= 5 && !isFullTest && isToeicAutoAdvanceOn()) {
            setTimeout(() => {
                if (!attempt.pendingTransition && attempt.currentIndex < attempt.questions.length - 1) {
                    attempt.nextQuestion();
                }
            }, 1000);
        }
    }, [attempt, isFullTest]);

    // Đánh dấu rồi nhảy sang câu tiếp. Riêng FULL TEST: chỉ nhảy ở phần Đọc
    // (Part 5-7); phần Nghe (Part 1-4) tự chuyển theo audio nên chỉ đánh dấu.
    const handleToggleMark = useCallback(() => {
        attempt.toggleMark();
        const q = attempt.currentQuestion;
        const isListening = q && q.part <= 4;
        if (isFullTest && isListening) return; // chỉ đánh dấu, không nhảy
        if (!attempt.pendingTransition) {
            const [, end] = getGroupRange(attempt.questions, attempt.currentIndex);
            if (end < attempt.questions.length - 1) attempt.goToQuestionChecked(end + 1);
        }
    }, [attempt, isFullTest]);

    const handleCheckKeywords = useCallback(() => {
        const inputs = document.querySelectorAll('.keyword-blank-input');
        let correct = 0;
        const status = {};
        inputs.forEach(input => {
            const ok = input.value.trim().toLowerCase() === (input.dataset.correct || '').toLowerCase();
            status[input.id] = ok ? 'correct' : 'wrong';
            if (ok) correct++;
        });
        setKeywordStatus(status);
        const total = inputs.length;
        Notification.show({
            type: correct === total ? 'success' : 'warning',
            message: `Đúng ${correct}/${total} từ điền`,
        });
    }, []);

    const handlePause = useCallback(async () => {
        timer.pause();
        audio.stop();
        try { await attempt.pause(); } catch { /* notified in hook */ }
        Modal.show({
            title: 'Bài thi đã tạm dừng',
            content: '<p>Bạn có muốn tiếp tục làm bài không?</p>',
            buttons: [
                {
                    text: 'Tiếp tục', className: 'btn-primary', stayOpen: true,
                    onClick: async () => {
                        try { await attempt.resume(); } catch { /* */ }
                        timer.start();
                        Modal.close();
                    },
                },
                { text: 'Thoát', className: 'btn-secondary', onClick: () => { Modal.close(); onExit(); } },
            ],
        });
    }, [attempt, timer, audio, onExit]);

    const handleConfirmSubmit = useCallback(() => {
        const unanswered = attempt.questions.length - Object.keys(attempt.answers).length;
        Modal.show({
            title: 'Nộp bài thi?',
            content: `<p>Bạn còn <strong>${unanswered}</strong> câu chưa trả lời.</p><p>Xác nhận nộp bài?</p>`,
            buttons: [
                { text: 'Nộp bài', className: 'btn-primary', stayOpen: true, onClick: () => { Modal.close(); doSubmit(); } },
                { text: 'Hủy', className: 'btn-secondary', onClick: () => Modal.close() },
            ],
        });
    }, [attempt.questions.length, attempt.answers, doSubmit]);

    const handleConfirmExit = useCallback(() => {
        Modal.show({
            title: 'Thoát bài thi?',
            content: '<p>Bài làm của bạn sẽ được lưu lại. Bạn có chắc muốn thoát?</p>',
            buttons: [
                {
                    text: 'Thoát', className: 'btn-danger',
                    onClick: () => { Modal.close(); timer.pause(); audio.stop(); onExit(); },
                },
                { text: 'Ở lại', className: 'btn-primary', onClick: () => Modal.close() },
            ],
        });
    }, [timer, audio, onExit]);

    // Đăng ký chốt chặn: bấm avatar/Trang chủ/menu khi đang làm bài → hỏi trước
    // (showScreen trong GameContext gọi hàm này). Chỉ bật lúc đang chạy.
    useEffect(() => {
        if (phase !== 'running') return;
        registerToeicExitGuard((proceed) => {
            Modal.show({
                title: 'Thoát bài thi?',
                content: '<p>Bài làm của bạn sẽ được lưu lại (có thể tiếp tục sau). Bạn có chắc muốn thoát?</p>',
                buttons: [
                    {
                        text: 'Thoát', className: 'btn-danger',
                        onClick: () => { Modal.close(); timer.pause(); audio.stop(); proceed(); },
                    },
                    { text: 'Ở lại', className: 'btn-primary', onClick: () => Modal.close() },
                ],
            });
        });
        return () => clearToeicExitGuard();
    }, [phase, timer, audio]);

    const handlePlayAudio = useCallback(() => {
        const q = attempt.currentQuestion;
        if (!q) return;
        if (q.audioUrl) audio.playRealAudio(q.audioUrl);
        else if (q.audioText) {
            const prev = attempt.questions[attempt.currentIndex - 1];
            const isFirstOfPart = attempt.currentIndex === 0 || (prev && prev.part !== q.part);
            audio.playTTS(q.audioText, { part: q.part, isFirstOfPart });
        }
    }, [attempt, audio]);

    // Điều hướng THEO NHÓM: Next nhảy qua cả nhóm; Prev về đầu nhóm trước đó.
    const handleNext = useCallback(() => {
        const [, end] = getGroupRange(attempt.questions, attempt.currentIndex);
        attempt.goToQuestionChecked(Math.min(end + 1, attempt.questions.length - 1));
    }, [attempt]);
    const handlePrev = useCallback(() => {
        const [start] = getGroupRange(attempt.questions, attempt.currentIndex);
        if (start <= 0) return;
        const [ps] = getGroupRange(attempt.questions, start - 1);
        attempt.goToQuestion(ps);
    }, [attempt]);
    const handleNavSelect = useCallback((index) => {
        const [gs] = getGroupRange(attempt.questions, index);
        attempt.goToQuestion(gs);
    }, [attempt]);
    const handleGroupAnswer = useCallback((absIndex, label) => {
        attempt.submitAnswerAt(absIndex, label);
    }, [attempt]);

    // ── Đếm ngược THEO MÀN (Part nhóm = số câu × thời gian mỗi câu) ──────────

    // NGUỒN THỜI GIAN DUY NHẤT: con số người dùng chọn ở popup (customTimeLimit).
    // null = "không giới hạn". Bảng nhịp giây/câu chia theo CHÍNH nó, không phải
    // totalTime admin — nhờ vậy tổng và từng câu luôn khớp nhau.
    // Riêng FULL TEST: ngân sách của CHẶNG hiện tại (45'/75'), không giới hạn
    // cũng không áp dụng — giờ thi thật là cố định.
    const effectiveTotal = isFullTest ? timerTotal : attempt.customTimeLimit;
    const unlimited = !isFullTest && (effectiveTotal === null || effectiveTotal === undefined);

    // Bảng giờ Part Đọc, khớp với chế độ đã chọn ở popup:
    //  - full test: chia đúng ngân sách 75' của chặng Đọc
    //  - custom: mỗi Part một ngân sách riêng (settings)
    //  - suggested/khác: chia tổng theo trọng số
    const readingPlan = useMemo(
        () => isFullTest
            ? buildFullTestReadingPlan(attempt.questions)
            : attempt.timeMode === 'custom'
                ? buildCustomReadingPlan(attempt.questions)
                : buildToeicReadingPlan(effectiveTotal, attempt.questions),
        [isFullTest, attempt.timeMode, effectiveTotal, attempt.questions],
    );
    const handleNextRef = useRef(handleNext);
    handleNextRef.current = handleNext;

    useEffect(() => {
        // Không giới hạn thời gian → tắt luôn đếm ngược từng câu (kể cả Part Nghe):
        // tổng vô hạn mà mỗi câu vẫn bị hối là mâu thuẫn.
        if (phase !== 'running' || unlimited || !isToeicQuestionTimerOn()) { setScreenLeft(null); return; }
        const qs = attempt.questions;
        const [gs, ge] = getGroupRange(qs, attempt.currentIndex);
        const cur = qs[gs];
        if (!cur) { setScreenLeft(null); return; }
        // Part 1-4 (Nghe): audio dẫn nhịp, KHÔNG đếm ngược câu (tránh cắt audio).
        // Chỉ Part 5-7 (Đọc) mới chia giờ từ tổng thời gian đã chọn.
        if (cur.part <= 4) { setScreenLeft(null); return; }
        const atLast = ge >= qs.length - 1;
        let left = getToeicScreenTime(cur.part, ge - gs + 1, readingPlan);
        setScreenTotal(left);
        setScreenLeft(left);

        let moveTimer = null;
        const id = setInterval(() => {
            left -= 1;
            setScreenLeft(left);
            if (left > 0) return;

            clearInterval(id);
            // Câu cuối thì để đồng hồ tổng lo; tắt tự chuyển thì dừng ở 0 cho
            // người dùng tự bấm Tiếp (vẫn sửa được đáp án, không khoá gì).
            // FULL TEST: phần Đọc KHÔNG bao giờ tự nhảy — thanh nhịp chỉ để
            // liệu sức, còn 75' là của người làm bài tự chia.
            if (atLast || isFullTest || !isToeicAutoAdvanceOn()) return;
            // Chờ đúng khoảng chuyển câu đã trừ khỏi ngân sách mỗi câu — có
            // trừ thì phải có nghỉ thật, không thì phép tính chỉ là lý thuyết.
            moveTimer = setTimeout(() => handleNextRef.current(), getToeicTransition() * 1000);
        }, 1000);

        return () => { clearInterval(id); if (moveTimer) clearTimeout(moveTimer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt.currentIndex, phase, attempt.questions.length, readingPlan, unlimited, isFullTest]);

    if (phase === 'loading') {
        return (
            <div className="toeic-container" style={{ textAlign: 'center', padding: 60 }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize: 48, color: 'var(--primary-color)' }}></i>
                <p style={{ marginTop: 16 }}>Đang chuẩn bị bài thi...</p>
            </div>
        );
    }

    const q = attempt.currentQuestion;

    // Gộp nhóm: nếu câu hiện tại thuộc nhóm (Part 3/4/6/7) → hiện cả nhóm 1 màn.
    // Không áp dụng ở chế độ "đục lỗ" (fill-blank) — giữ nguyên từng câu.
    const [gStart, gEnd] = getGroupRange(attempt.questions, attempt.currentIndex);
    const isGroupView = !attempt.fillInBlankMode && gEnd > gStart;
    const groupItems = [];
    for (let i = gStart; i <= gEnd; i++) groupItems.push({ q: attempt.questions[i], index: i });

    // Điều hướng câu giờ nằm trên thanh tiêu đề khung nội dung, không ở header đề.
    // Số câu THẬT (Part 3 → 32, Part 5 → 101…), không phải vị trí trong đề: mini
    // test lấy riêng một Part nên đánh từ 1 sẽ lệch hẳn với số câu lúc thi thật.
    const navNum = (i) => toeicQuestionNumber(attempt.questions[i], i);
    const navProps = {
        // Màn nhóm phủ nhiều câu → hiện DẢI số câu (vd 32–34) cho đúng thực tế.
        current: gEnd > gStart ? `${navNum(gStart)}–${navNum(gEnd)}` : navNum(gStart),
        total: TOEIC_TOTAL_QUESTIONS,
        part: attempt.questions[gStart]?.part, // Part của câu/nhóm hiện tại
        canPrev: gStart > 0,
        canNext: gEnd < attempt.questions.length - 1,
        onPrev: handlePrev,
        onNext: handleNext,
    };

    return (
        <div className="toeic-container">
            <RunnerHeader
                testName={attempt.test?.testName || ''}
                timer={timer}
                timerSectionLabel={isFullTest ? (section === 'listening' ? 'Nghe' : 'Đọc') : undefined}
                nav={navProps}
                hidden={headerHidden}
                pace={{
                    left: screenLeft,
                    total: screenTotal,
                    label: `Còn ${Math.max(0, screenLeft ?? 0)}s cho ${isGroupView ? `nhóm ${groupItems.length} câu` : 'câu này'}`,
                }}
                isMarked={attempt.markedQuestions.has(attempt.currentIndex)}
                onBack={handleConfirmExit}
                onToggleNav={() => setNavOpen(o => !o)}
                onToggleMark={handleToggleMark}
                onPause={handlePause}
                onSubmit={handleConfirmSubmit}
            />

            <div className="toeic-question-container" ref={contentRef}>
                {isGroupView ? (
                    <GroupQuestionView
                        groupItems={groupItems}
                        answers={attempt.answers}
                        onSelectAnswer={handleGroupAnswer}
                        audioPlaying={audio.playing}
                        onPlayAudio={handlePlayAudio}
                    />
                ) : (
                    <QuestionView
                        question={q}
                        timer={timer}
                        onToggleNav={() => setNavOpen(o => !o)}
                        currentIndex={attempt.currentIndex}
                        fillInBlankMode={attempt.fillInBlankMode}
                        selectedAnswer={attempt.answers[attempt.currentIndex]}
                        audioPlaying={audio.playing}
                        onPlayAudio={handlePlayAudio}
                        onSelectAnswer={handleSelectAnswer}
                        keywordAnswers={attempt.keywordAnswers}
                        keywordStatus={keywordStatus}
                        onKeywordChange={attempt.updateKeywordAnswer}
                        onCheckKeywords={handleCheckKeywords}
                    />
                )}
            </div>

            <QuestionNavPopup
                open={navOpen}
                questions={attempt.questions}
                currentIndex={attempt.currentIndex}
                answers={attempt.answers}
                markedQuestions={attempt.markedQuestions}
                onSelect={handleNavSelect}
                onClose={() => setNavOpen(false)}
            />

            {attempt.pendingTransition && (
                <PartTransitionModal
                    fromPart={attempt.pendingTransition.fromPart}
                    toPart={attempt.pendingTransition.toPart}
                    onContinue={() => attempt.acknowledgeTransition(true)}
                />
            )}
        </div>
    );
}
