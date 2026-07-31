import { Fragment, useState, useEffect, useCallback, useRef } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { GameState } from '@game/state.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { PracticeManager } from '@components/practice/practiceManager.js';
import { TopicSelector } from '@components/vocab/topic/topicSelector.js';
import { QuestsAPI } from '@api/quests.js';
import { ToeicAPI } from '@api/toeic.js';
import { Quest } from '@components/quest/quest.js';
import { Utils } from '@lib/utils.js';
import { Config } from '@game/config.js';
import { Notification } from '@ui/Toaster.jsx';
import { loadUnlocks, lockInfo } from '@game/featureUnlocks.js';

// 4 tầng ĐỘ KHÓ (màu = độ khó): 🟢 Dễ < 🔵 Trung bình < 🟣 Khó < 🔴 Thử thách.
// Trong mỗi tầng, sắp theo cost (dễ → khó).
const C_EASY = '#10b981, #059669';   // xanh cây
const C_MED  = '#3b82f6, #2563eb';   // xanh dương
const C_HARD = '#8b5cf6, #7c3aed';   // tím
const C_MAX  = '#ef4444, #dc2626';   // đỏ

// Chế độ khách (chưa đăng nhập) được dùng thử — 3 chế độ cơ bản nhất. Bấm chế
// độ khác thì mời đăng nhập. Đủ để nếm trải nghiệm mà vẫn đẩy tạo tài khoản.
const GUEST_FREE_MODES = new Set(['flashcard', 'multiple-choice', 'matching']);

const gameModes = [
    { group: 'Học & Nhận diện từ', icon: 'fa-book-open', modes: [
        { mode: 'flashcard', icon: 'fa-layer-group', label: 'Flashcard', desc: 'Học từ vựng theo thẻ ghi nhớ', cost: 8, color: C_EASY },
        { mode: 'multiple-choice', icon: 'fa-circle-check', label: 'Trắc nghiệm', desc: 'Chọn nghĩa đúng của từ', cost: 10, color: C_EASY },
        { mode: 'matching', icon: 'fa-link', label: 'Nối từ', desc: 'Nối từ với nghĩa tương ứng', cost: 10, color: C_EASY },
        { mode: 'word-type-check', icon: 'fa-tag', label: 'Từ loại', desc: 'Xác định từ loại của từ', cost: 10, color: C_EASY },
    ]},
    { group: 'Nghe & Phát âm', icon: 'fa-headphones', modes: [
        { mode: 'listening', icon: 'fa-headphones', label: 'Nghe và chọn', desc: 'Nghe từ, chọn từ đúng trong 4 lựa chọn', cost: 12, color: C_MED },
        { mode: 'sentence-listening', icon: 'fa-ear-listen', label: 'Nghe chuỗi từ', desc: 'Nghe 3 từ đọc liên tiếp, chọn đúng trong lưới 8 từ', cost: 12, color: C_MED },
        { mode: 'pronunciation', icon: 'fa-microphone', label: 'Phát âm', desc: 'Nói đúng từ tiếng Anh để ghi điểm', cost: 15, color: C_MED },
        { mode: 'dictation', icon: 'fa-keyboard', label: 'Chép chính tả', desc: 'Nghe từ và gõ lại chính xác tiếng Anh', cost: 15, color: C_MED },
    ]},
    { group: 'Đọc & Viết', icon: 'fa-pen-nib', modes: [
        { mode: 'synonym-check', icon: 'fa-equals', label: 'Từ đồng nghĩa', desc: 'Tìm từ đồng nghĩa với từ cho sẵn', cost: 10, color: C_HARD },
        { mode: 'example-fill-blank', icon: 'fa-pen-to-square', label: 'Điền vào câu', desc: 'Điền từ đúng vào câu ví dụ', cost: 12, color: C_HARD },
        { mode: 'phonetic-quiz', icon: 'fa-spell-check', label: 'Đọc phiên âm', desc: 'Nhìn ký hiệu IPA, tìm từ tiếng Anh tương ứng', cost: 12, color: C_HARD },
        { mode: 'fill-blank', icon: 'fa-pen', label: 'Điền từ', desc: 'Điền từ tiếng Anh vào chỗ trống', cost: 15, color: C_HARD },
    ]},
    { group: 'Nâng cao & Thử thách', icon: 'fa-brain', modes: [
        { mode: 'context-learning', icon: 'fa-book-reader', label: 'Hiểu qua câu', desc: 'Đọc câu ví dụ, suy luận nghĩa tiếng Việt', cost: 10, color: C_MAX, weekendOnly: true },
        { mode: 'review-mistakes', icon: 'fa-repeat', label: 'Ôn lại từ sai', desc: 'Luyện lại các từ đã làm sai', cost: 10, color: C_MAX, special: true, weekendOnly: true },
        { mode: 'sentence-builder', icon: 'fa-puzzle-piece', label: 'Xếp câu', desc: 'Sắp xếp cụm từ thành câu hoàn chỉnh', cost: 15, color: C_MAX, weekendOnly: true },
        { mode: 'speed-quiz', icon: 'fa-clock', label: 'Tốc độ', desc: 'Trả lời nhanh nhất trong giới hạn thời gian', cost: 20, color: C_MAX, weekendOnly: true },
    ]},
];

const isWeekend = () => { const d = new Date().getDay(); return d === 0 || d === 6; };

// Châm ngôn động lực — mỗi ngày hiển thị 1 câu, ĐỔI theo ngày và ổn định
// trong suốt ngày đó (chỉ số tính theo ngày địa phương).
const DAILY_QUOTES = [
    'Học một ngôn ngữ là có thêm một cửa sổ nhìn ra thế giới.',
    'Mỗi từ mới hôm nay là một viên gạch cho tương lai bạn.',
    'Kiên trì mỗi ngày một chút, hơn cố gắng một lần rồi bỏ.',
    'Không phải vì khó mà ta ngại, mà vì ta ngại nên nó mới khó.',
    'Tiến bộ nhỏ vẫn là tiến bộ. Cứ đi rồi sẽ tới.',
    'Người giỏi nhất cũng từng là người mới bắt đầu.',
    'Giới hạn của ngôn ngữ là giới hạn của thế giới bạn.',
    'Hôm nay khó, ngày mai khó hơn, nhưng ngày kia sẽ tươi đẹp.',
    'Thành công là tổng của những nỗ lực nhỏ lặp lại mỗi ngày.',
    'Đừng đếm số ngày, hãy làm cho mỗi ngày đáng giá.',
    'Một hành trình ngàn dặm bắt đầu từ một bước chân.',
    'Bạn không cần phải giỏi để bắt đầu, nhưng phải bắt đầu để giỏi.',
    'Bộ não như cơ bắp — càng luyện càng mạnh.',
    'Sai lầm là bằng chứng rằng bạn đang cố gắng.',
    'Chậm cũng được, miễn là đừng dừng lại.',
    'Đầu tư vào tri thức luôn trả lãi cao nhất.',
    'Kỷ luật là cây cầu giữa mục tiêu và thành quả.',
    'Học khi người khác ngủ, bạn sẽ sống điều người khác mơ.',
    'Mỗi ngày một từ, một năm là ba trăm sáu lăm cơ hội mới.',
    'Hãy tự hào vì bạn đã không bỏ cuộc hôm nay.',
    'Nỗ lực không phản bội. Hôm nay bạn gieo, mai bạn gặt.',
    'Việc khó làm hôm nay, ngày mai sẽ thành chuyện dễ.',
    'Thói quen tốt được xây bằng những ngày bình thường.',
    'Đừng so với người khác, hãy hơn chính bạn hôm qua.',
    'Ngôn ngữ mở ra những cánh cửa mà tiền bạc không mua được.',
    'Bền bỉ đánh bại tài năng khi tài năng lười biếng.',
    'Một chút mỗi ngày tạo nên khác biệt lớn theo thời gian.',
    'Hôm nay bạn học vì ngày mai bạn không phải hối tiếc.',
    'Giữ ngọn lửa cháy — streak của bạn là minh chứng cho ý chí.',
    'Cố lên! Phiên bản tốt hơn của bạn đang chờ phía trước.',
];
const quoteOfTheDay = () => {
    // Số ngày kể từ epoch theo giờ địa phương → cùng 1 ngày luôn ra cùng câu.
    const ms = Date.now() - new Date().getTimezoneOffset() * 60000;
    const dayIndex = Math.floor(ms / 86400000);
    return DAILY_QUOTES[((dayIndex % DAILY_QUOTES.length) + DAILY_QUOTES.length) % DAILY_QUOTES.length];
};

// Chuỗi YYYY-MM-DD theo giờ ĐỊA PHƯƠNG (khớp với khóa ngày practiceHistory).
const toDateKey = (y, m, d) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// Dựng lưới lịch 1 tháng: mảng ô (null = đệm đầu tuần) + cờ đã-học/hôm-nay.
const buildCalendar = (monthDate, studiedSet, todayKey) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const startDow = new Date(year, month, 1).getDay(); // 0 = Chủ nhật
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
        const key = toDateKey(year, month, d);
        cells.push({ day: d, studied: studiedSet.has(key), isToday: key === todayKey });
    }
    return cells;
};

const CAL_WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function getTimeUntilWeekend() {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) return null;
    const daysUntilSat = 6 - day;
    const nextSat = new Date(now);
    nextSat.setDate(now.getDate() + daysUntilSat);
    nextSat.setHours(0, 0, 0, 0);
    const diff = nextSat - now;
    const d2 = Math.floor(diff / 86400000);
    const h = String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    return d2 > 0 ? `${d2} ngày ${h}:${m}:${s}` : `${h}:${m}:${s}`;
}

function getTimeUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diff = midnight - now;
    const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

export default function HomeScreen({ active }) {
    const { showScreen, streak, syncFromState } = useGame();
    const { isLoggedIn, setAuthModal } = useAuth();
    const [quests, setQuests] = useState([]);
    const [timer, setTimer] = useState(getTimeUntilMidnight());
    const [weekendTimer, setWeekendTimer] = useState(getTimeUntilWeekend());
    const [stats, setStats] = useState({});
    const [wrongWordsCount, setWrongWordsCount] = useState(0);
    const [userRank, setUserRank] = useState(null);
    // Độ chính xác TOEIC trung bình (mọi lần thi) + số lần thi — cho vòng tiến độ thứ 4.
    const [toeicStats, setToeicStats] = useState({ averageAccuracy: 0, totalAttempts: 0 });
    // Nhắc luyện tập: ẩn trong phiên nếu user tự đóng (mỗi phiên reset lại).
    const [reminderDismissed, setReminderDismissed] = useState(false);
    // Tháng đang xem trên lịch streak (mặc định = tháng hiện tại).
    const [calMonth, setCalMonth] = useState(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1);
    });

    const loadLocalData = useCallback(() => {
        const s = GameState.state;
        // Quest.init đã nạp 4 loại vào _cache; lấy thẳng từ đó (đầy đủ 5
        // daily quest sau Phase A). Fallback GameState legacy nếu rỗng.
        const cached = Quest.getQuests?.('daily') || [];
        setQuests(cached.length ? cached : (s.quests?.daily || []));
        setWrongWordsCount(s.progress?.wrongWords?.length || 0);
        setStats(GameState.getStatistics?.() || {});
    }, []);

    useEffect(() => {
        if (active) {
            loadLocalData();
            const userId = GameState.state.user?.id || GameState.state.user?._id;
            if (userId) {
                fetch(`/api/leaderboard/rank/${userId}/all-time`)
                    .then(r => r.json())
                    .then(j => { if (j.success) setUserRank(j.data.rank); })
                    .catch(() => {});
            }
            ToeicAPI.getAnalyticsOverview()
                .then(res => {
                    const d = res?.data?.data || res?.data || res;
                    if (d) setToeicStats({ averageAccuracy: d.averageAccuracy || 0, totalAttempts: d.totalAttempts || 0 });
                })
                .catch(() => {});
        }
    }, [active, loadLocalData]);

    useEffect(() => {
        const unsub1 = EventBus.on(GameEvents.QUEST_UPDATED, loadLocalData);
        const unsub2 = EventBus.on(GameEvents.PRACTICE_REQUESTED, ({ mode }) => PracticeManager.start(mode));
        return () => { unsub1(); unsub2(); };
    }, [loadLocalData]);

    useEffect(() => {
        if (!active) return;
        setTimer(getTimeUntilMidnight());
        setWeekendTimer(getTimeUntilWeekend());
        const id = setInterval(() => {
            setTimer(getTimeUntilMidnight());
            setWeekendTimer(getTimeUntilWeekend());
        }, 1000);
        return () => clearInterval(id);
    }, [active]);

    // Mốc mở khoá theo Level — nạp lại mỗi lần vào Trang chủ (level có thể vừa tăng).
    const [unlockTick, setUnlockTick] = useState(0);
    useEffect(() => {
        if (!active) return;
        loadUnlocks(true).then(() => setUnlockTick(t => t + 1));
    }, [active]);

    const handleModeClick = (mode) => {
        const modeConfig = gameModes.flatMap(g => g.modes).find(m => m.mode === mode);
        // Khách chỉ dùng thử vài chế độ cơ bản; chế độ khác → mời đăng nhập.
        if (!isLoggedIn && !GUEST_FREE_MODES.has(mode)) {
            Notification.show({
                type: 'info',
                title: '🔒 Đăng nhập để mở khoá',
                message: 'Chế độ này cần đăng nhập. Đăng nhập để chơi đủ 16 chế độ và lưu tiến độ!',
                duration: 3500,
            });
            setAuthModal('login');
            return;
        }
        // Khoá theo Level (server cũng chặn — đây là phản hồi tức thì cho người dùng).
        const lv = lockInfo(`mode:${mode}`);
        if (lv.locked) {
            Notification.show({
                type: 'warning',
                title: `🔒 Cần Level ${lv.requiredLevel}`,
                message: `Chế độ này mở khi bạn đạt Level ${lv.requiredLevel}. Luyện tập thêm để lên cấp!`,
                duration: 3500,
            });
            return;
        }
        if (modeConfig?.weekendOnly && !isWeekend()) {
            Notification.show({ type: 'warning', title: '🔒 Chế độ cuối tuần', message: 'Chế độ này chỉ mở vào Thứ 7 & Chủ Nhật. Hãy quay lại vào cuối tuần!', duration: 3500 });
            return;
        }
        if (!TopicSelector.getCurrentTopic()) {
            EventBus.emit(GameEvents.TOPIC_MODAL_REQUESTED, { pendingMode: mode });
            return;
        }
        PracticeManager.start(mode);
    };

    const claimingRef = useRef(new Set());
    const handleClaimQuest = async (quest) => {
        const code = quest.code || quest.id;
        if (!code || !quest.completed || quest.claimedAt || quest.claimed) return;
        if (claimingRef.current.has(code)) return; // chặn double-click
        claimingRef.current.add(code);

        const reward = {
            coins: quest.rewardCoins || quest.reward?.coins || 0,
            xp:    quest.rewardXp    || quest.reward?.xp    || 0,
            gems:  quest.rewardGems  || quest.reward?.gems  || 0,
        };

        // OPTIMISTIC: thưởng + âm thanh + thông báo + nút "Đã nhận" NGAY;
        // đồng bộ server (save → flush → claim) chạy nền để hết delay.
        setQuests(prev => prev.map(q => (q.code || q.id) === code ? { ...q, claimedAt: new Date().toISOString() } : q));
        GameState.creditServerRewards(reward);
        Utils.playSound(Config.sounds.quest, 0.6, { ignoreSettings: true });
        Notification.success('Nhận thưởng thành công!');
        syncFromState();

        let ok = false;
        try {
            if (Quest?.claimReward) ok = (await Quest.claimReward('daily', code)) != null;
            else ok = !!(await QuestsAPI.claim({ type: 'daily', code })).success;
        } catch { ok = false; }

        if (!ok) {
            GameState.creditServerRewards({ coins: -reward.coins, xp: -reward.xp, gems: -reward.gems });
            setQuests(prev => prev.map(q => (q.code || q.id) === code ? { ...q, claimedAt: null } : q));
            Notification.error('Không thể nhận thưởng, vui lòng thử lại');
        }
        claimingRef.current.delete(code);
        loadLocalData();
        syncFromState();
    };

    // Nhắc luyện tập (lớp nhẹ, không đụng DB): hiện banner nếu HÔM NAY chưa học.
    const _now = new Date();
    const _todayKey = toDateKey(_now.getFullYear(), _now.getMonth(), _now.getDate());
    const practicedToday = (GameState.state.progress?.studiedDays || []).includes(_todayKey)
        || (GameState.state.practiceHistory || []).some(e => e.date === _todayKey);
    const showReminder = !practicedToday && !reminderDismissed;
    const reminderText = streak.current > 0
        ? `Giữ chuỗi ${streak.current} ngày — học hôm nay kẻo mất streak!`
        : 'Học một chút hôm nay để bắt đầu chuỗi streak nào!';

    // ── 3 vòng tiến độ (conic-gradient, màu đổi theo %) ──
    // Màu: <40% đỏ, 40–69% vàng, ≥70% xanh — để dễ phân biệt mức.
    const ringColor = (pct) => (pct >= 70 ? '#4ade80' : pct >= 40 ? '#fde047' : '#f87171');

    // 1) Mục tiêu giờ học: tổng thời gian các lượt hôm nay vs mục tiêu.
    const _todayEntry = (GameState.state.practiceHistory || []).find(e => e.date === _todayKey);
    const studiedSecToday = _todayEntry?.timeSpent || 0;
    const goalMin = GameState.state.settings?.dailyStudyGoalMin ?? 15;
    const studyPct = goalMin > 0 ? Math.min(100, Math.round((studiedSecToday / (goalMin * 60)) * 100)) : 0;
    const studiedMinToday = Math.floor(studiedSecToday / 60);

    // 2) Độ chính xác tổng: câu đúng / tổng câu đã trả lời.
    const _prog = GameState.state.progress || {};
    const _correctTotal = _prog.totalCorrectAnswers || 0;
    const _answeredTotal = _correctTotal + (_prog.totalWrongAnswers || 0);
    const accPct = _answeredTotal > 0 ? Math.round((_correctTotal / _answeredTotal) * 100) : 0;

    // 3) Chuyên cần tháng này: số ngày đã học / tổng số ngày trong tháng.
    const _monthPrefix = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`;
    const _daysInMonth = new Date(_now.getFullYear(), _now.getMonth() + 1, 0).getDate();
    const _studiedAll = new Set([
        ...(GameState.state.progress?.studiedDays || []),
        ...((GameState.state.practiceHistory || []).map(e => e.date)),
    ]);
    const studiedDaysThisMonth = [..._studiedAll].filter(d => (d || '').startsWith(_monthPrefix)).length;
    const monthPct = _daysInMonth > 0 ? Math.round((studiedDaysThisMonth / _daysInMonth) * 100) : 0;

    // Helper render 1 vòng.
    const Ring = ({ pct, sub, caption }) => (
        <div className="study-goal-ring" title={`${caption}: ${pct}%`}>
            <div className="study-goal-circle"
                style={{ background: `conic-gradient(${ringColor(pct)} ${pct * 3.6}deg, rgba(255,255,255,0.28) 0deg)` }}>
                <div className="study-goal-inner">
                    <span className="study-goal-pct" style={{ color: ringColor(pct) }}>{pct}%</span>
                    <span className="study-goal-sub">{sub}</span>
                </div>
            </div>
            <span className="study-goal-caption">{caption}</span>
        </div>
    );

    return (
        <div id="home-screen" className={`screen ${active ? 'active' : ''}`}>
            {showReminder && (
                <div className="practice-reminder">
                    <i className="fas fa-bell practice-reminder-icon"></i>
                    <div className="practice-reminder-text">
                        <strong>Nhắc ôn tập</strong>
                        <span>{reminderText}{wrongWordsCount > 0 ? ` Có ${wrongWordsCount} từ sai đang chờ ôn.` : ''}</span>
                    </div>
                    <button className="practice-reminder-cta" onClick={() => handleModeClick('multiple-choice')}>
                        <i className="fas fa-play"></i> Luyện tập ngay
                    </button>
                    <button className="practice-reminder-close" title="Đóng" onClick={() => setReminderDismissed(true)}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            )}
            <div className="streak-card">
                <div className="streak-flame">
                    <i className="fas fa-fire"></i>
                </div>
                <div className="streak-info">
                    <h3><span id="streak-count">{streak.current}</span> ngày liên tục</h3>
                    <p>Học mỗi ngày để giữ streak!</p>
                    <p className="streak-quote">
                        <i className="fas fa-quote-left"></i> {quoteOfTheDay()}
                    </p>
                    <button className="streak-cta-btn" onClick={() => handleModeClick('multiple-choice')}>
                        <i className="fas fa-play"></i> Luyện tập ngay
                    </button>
                </div>

                <div className="study-rings">
                    <Ring pct={studyPct} sub={`${studiedMinToday}/${goalMin}′`} caption="Giờ học" />
                    <Ring pct={monthPct} sub={`${studiedDaysThisMonth}/${_daysInMonth}`} caption="Chuyên cần" />
                    <Ring pct={accPct} sub={`${_correctTotal}/${_answeredTotal}`} caption="Chính xác" />
                    <Ring
                        pct={Math.round(toeicStats.averageAccuracy)}
                        sub={toeicStats.totalAttempts > 0 ? `${toeicStats.totalAttempts} bài` : 'Chưa thi'}
                        caption="TOEIC"
                    />
                </div>
                {(() => {
                    const now = new Date();
                    const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
                    // studiedDays là nguồn bền (không bị xoá khi reset thống kê
                    // hàng tháng); gộp thêm practiceHistory tháng hiện tại cho chắc.
                    const prog = GameState.state.progress || {};
                    const studiedSet = new Set([
                        ...(prog.studiedDays || []),
                        ...((GameState.state.practiceHistory || []).map(e => e.date)),
                    ]);
                    const cells = buildCalendar(calMonth, studiedSet, todayKey);
                    return (
                        <div className="streak-calendar">
                            <div className="cal-header">
                                <button className="cal-nav" title="Tháng trước"
                                    onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
                                    <i className="fas fa-chevron-left"></i>
                                </button>
                                <span className="cal-title">Tháng {calMonth.getMonth() + 1}, {calMonth.getFullYear()}</span>
                                <button className="cal-nav" title="Tháng sau"
                                    onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
                                    <i className="fas fa-chevron-right"></i>
                                </button>
                            </div>
                            <div className="cal-weekdays">
                                {CAL_WEEKDAYS.map(w => <span key={w}>{w}</span>)}
                            </div>
                            <div className="cal-grid">
                                {cells.map((c, i) => c === null
                                    ? <span key={`e${i}`} className="cal-cell empty"></span>
                                    : <span key={`d${c.day}`}
                                        className={`cal-cell${c.studied ? ' studied' : ''}${c.isToday ? ' today' : ''}`}>
                                        {c.day}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </div>

            <section className="quests-section">
                <div className="section-header">
                    <h2><i className="fas fa-tasks"></i> Nhiệm vụ hàng ngày</h2>
                    <span id="quest-timer" className="timer">{timer}</span>
                </div>
                <div id="daily-quests" className="quests-container">
                    {quests.length === 0 ? (
                        <div className="empty-state"><i className="fas fa-tasks"></i><p>Không có nhiệm vụ nào</p></div>
                    ) : [...quests]
                        .sort((a, b) => {
                            const rank = q => (q.completed && !q.claimedAt && !q.claimed) ? 0 : (q.claimedAt || q.claimed) ? 2 : 1;
                            return rank(a) - rank(b);
                        })
                        .slice(0, 3)
                        .map((quest, i) => {
                        const progress = quest.progress ?? quest.current ?? 0;
                        const target = quest.target || 1;
                        const pct = Math.min(100, Math.round((progress / target) * 100));
                        const isCompleted = quest.completed;
                        const isClaimed = !!(quest.claimedAt || quest.claimed);
                        const name = (quest.name || '').replace('{target}', target);
                        return (
                            <div key={quest.code || quest.id || i} className={`quest-card${isCompleted ? ' completed' : ''}${isClaimed ? ' claimed' : ''}`} data-code={quest.code}>
                                <div className="quest-header">
                                    <div className="quest-title">
                                        <div className="quest-icon">{quest.icon || '🎯'}</div>
                                        <span>{name}</span>
                                    </div>
                                    <div className="quest-reward">
                                        {quest.rewardCoins > 0 && <span><i className="fas fa-coins"></i> {quest.rewardCoins}</span>}
                                        {quest.rewardXp > 0 && <span><i className="fas fa-star"></i> {quest.rewardXp} XP</span>}
                                        {quest.rewardGems > 0 && <span><i className="fas fa-gem"></i> {quest.rewardGems}</span>}
                                        {!quest.rewardXp && quest.reward?.xp > 0 && <span><i className="fas fa-star"></i> {quest.reward.xp} XP</span>}
                                    </div>
                                </div>
                                {quest.description && <div className="quest-description">{quest.description}</div>}
                                <div className="quest-progress">
                                    <div className="quest-progress-bar">
                                        <div className="quest-progress-fill" style={{ width: `${pct}%` }}></div>
                                    </div>
                                    <div className="quest-progress-text">{progress} / {target}</div>
                                </div>
                                {isCompleted && !isClaimed && (
                                    <button className="quest-claim-btn btn btn-primary btn-sm" onClick={() => handleClaimQuest(quest)}>
                                        Nhận thưởng
                                    </button>
                                )}
                                {isClaimed && (
                                    <div className="quest-claimed-badge"><i className="fas fa-check-circle"></i> Đã nhận</div>
                                )}
                                {!isCompleted && (
                                    <div className="quest-pending-badge"><i className="fas fa-hourglass-half"></i> Chưa đạt</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="game-modes-section">
                <h2><i className="fas fa-gamepad"></i> Chọn chế độ chơi</h2>
                <div className="game-modes-grid">
                    {gameModes.map(group => (
                        <Fragment key={group.group}>
                            <div className="mode-group-label">
                                <i className={`fas ${group.icon}`}></i> {group.group}
                            </div>
                            {group.modes.map(m => {
                                // 3 loại khoá: khách chưa login, theo LEVEL, theo cuối tuần.
                                const guestLocked = !isLoggedIn && !GUEST_FREE_MODES.has(m.mode);
                                const lv = lockInfo(`mode:${m.mode}`);
                                const levelLocked = lv.locked;
                                const weekendLocked = m.weekendOnly && !isWeekend();
                                const locked = guestLocked || levelLocked || weekendLocked;
                                return (
                                <div
                                    key={m.mode}
                                    className={`game-mode-card${locked ? ' game-mode-card--locked' : ''}`}
                                    data-mode={m.mode}
                                    onClick={() => handleModeClick(m.mode)}
                                >
                                    <div className="mode-icon" style={{ background: `linear-gradient(135deg, ${m.color})` }}>
                                        <i className={`fas ${locked ? 'fa-lock' : m.icon}`}></i>
                                    </div>
                                    <h3>{m.label}</h3>
                                    <p>{m.desc}</p>
                                    {guestLocked ? (
                                        <div className="mode-level-badge" title="Đăng nhập để mở khoá">
                                            <i className="fas fa-lock"></i> Đăng nhập để mở
                                        </div>
                                    ) : levelLocked ? (
                                        <div className="mode-level-badge" title={`Cần đạt Level ${lv.requiredLevel}`}>
                                            <i className="fas fa-lock"></i> Mở ở <b>Level {lv.requiredLevel}</b>
                                        </div>
                                    ) : weekendLocked ? (
                                        <div className="mode-weekend-badge">
                                            <i className="fas fa-lock"></i> Mở sau: <span className="mode-weekend-countdown">{weekendTimer}</span>
                                        </div>
                                    ) : (
                                        <div className="mode-cost"><i className="fas fa-bolt"></i> {m.cost}</div>
                                    )}
                                    {!locked && m.mode === 'review-mistakes' && (
                                        <div className="wrong-words-count" style={{ marginTop: 8, color: '#a855f7', fontWeight: 'bold', fontSize: '0.9em' }}>
                                            <i className="fas fa-exclamation-circle"></i> <span>{wrongWordsCount}</span> từ cần ôn
                                        </div>
                                    )}
                                </div>
                                );
                            })}
                        </Fragment>
                    ))}
                </div>
            </section>

            <section className="stats-section">
                <h2><i className="fas fa-chart-line"></i> Thống kê của bạn</h2>
                <div className="stats-grid">
                    <div className="stat-card">
                        <i className="fas fa-book"></i>
                        <div className="stat-value">{stats.wordsLearned || 0}</div>
                        <div className="stat-label">Từ đã học</div>
                    </div>
                    <div className="stat-card">
                        <i className="fas fa-trophy"></i>
                        <div className="stat-value">{stats.totalXp || 0}</div>
                        <div className="stat-label">Tổng XP</div>
                    </div>
                    <div className="stat-card">
                        <i className="fas fa-chart-line"></i>
                        <div className="stat-value">{stats.accuracy || 0}%</div>
                        <div className="stat-label">Độ chính xác</div>
                    </div>
                    <div className="stat-card">
                        <i className="fas fa-crown"></i>
                        <div className="stat-value">{userRank != null ? `#${userRank}` : '-'}</div>
                        <div className="stat-label">Xếp hạng</div>
                    </div>
                </div>
            </section>
        </div>
    );
}
