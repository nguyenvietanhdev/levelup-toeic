import { useState, useEffect } from 'react';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { GameState } from '@game/state.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import FlagIcon from '@ui/FlagIcon.jsx';
import { Notification } from '@ui/Toaster.jsx';
import { loadUnlocks, lockInfo } from '@game/featureUnlocks.js';

const LEVEL_MAP = { easy: ['A1', 'A2'], medium: ['B1', 'B2'], hard: ['C1', 'C2'], adaptive: null };
const LEVEL_LABEL = { easy: 'Dễ (A1-A2)', medium: 'Trung bình (B1-B2)', hard: 'Khó (C1-C2)', adaptive: 'Toàn bộ' };

/**
 * Ba lựa chọn nhanh: số câu mỗi lượt · độ khó · ngôn ngữ học.
 *
 * Tách khỏi StatusBar để dùng được ở HAI chỗ: thanh trạng thái (máy tính) và
 * menu bên (điện thoại, nơi thanh trạng thái không đủ chỗ). Tách chứ không chép
 * sang menu: `handleDifficultyChange` còn phải đồng bộ `levelFilter`, và đổi
 * ngôn ngữ có khoá theo level + ghi localStorage + reload — hai bản chép sẽ lệch
 * nhau ngay lần sửa đầu tiên, mà triệu chứng là "đổi ở chỗ này thì ăn, chỗ kia
 * thì không".
 *
 * `variant`:
 *   'bar'  — nằm ngang trong thanh trạng thái (mặc định)
 *   'menu' — xếp dọc, có nhãn chữ, dùng trong menu bên
 */
export default function QuickSettings({ variant = 'bar' }) {
    const { isLoggedIn, setAuthModal } = useAuth();
    const [questionsPerSession, setQuestionsPerSession] = useState('auto');
    const [difficulty, setDifficulty] = useState('adaptive');

    // Đảo chiều hỏi–đáp: EN→VN hay VN→EN (áp dụng cho cả tiếng Trung).
    // `gameLogic.js:179` đọc thẳng localStorage nên đây là nguồn duy nhất.
    const [reverseMode, setReverseMode] = useState(
        () => localStorage.getItem('reverseMode') === 'true'
    );

    const [vocabLang, setVocabLang] = useState(() => {
        try {
            return localStorage.getItem('vocabLang') || window.GameState?.state?.settings?.vocabLang || 'en';
        } catch {
            return window.GameState?.state?.settings?.vocabLang || 'en';
        }
    });

    // Đọc giá trị đang lưu khi gắn vào cây.
    //
    // Hai bản (thanh trạng thái + menu bên) cùng tồn tại, nên phải nghe sự kiện
    // để bản kia đổi thì bản này theo — không thì mở menu ra vẫn thấy giá trị cũ
    // và người dùng đổi lại lần nữa.
    useEffect(() => {
        const sync = () => {
            const s = GameState.state?.settings || {};
            setQuestionsPerSession(s.questionsPerSession ?? 'auto');
            setDifficulty(s.difficulty || 'adaptive');
        };
        sync();
        const unsub = EventBus.on(GameEvents.SESSION_BADGE_UPDATED, sync);
        return () => unsub?.();
    }, []);

    // Mốc mở khoá — nạp 1 lần, làm mới khi lên cấp.
    const [, setUnlockTick] = useState(0);
    useEffect(() => {
        const reload = () => loadUnlocks(true).then(() => setUnlockTick(t => t + 1));
        reload();
        const unsub = EventBus.on(GameEvents.USER_LEVEL_UP, reload);
        return () => unsub?.();
    }, []);
    const zhLock = lockInfo('feature:lang-zh');

    const handleQuestionsChange = (e) => {
        const val = e.target.value;
        setQuestionsPerSession(val);
        GameState.state.settings.questionsPerSession = val === 'auto' ? 'auto' : parseInt(val);
        GameState.save?.();
        EventBus.emit(GameEvents.SESSION_BADGE_UPDATED);
        Notification.info(val === 'auto'
            ? 'Số câu mỗi lượt: Toàn bộ từ trong bộ lọc'
            : `Số câu mỗi lượt: ${val} câu`);
    };

    const handleDifficultyChange = (e) => {
        const val = e.target.value;
        setDifficulty(val);
        const s = GameState.state.settings;
        s.difficulty = val;
        // BẮT BUỘC: bộ lọc từ vựng đọc `levelFilter`, không đọc `difficulty`.
        // Thiếu dòng này thì đổi cấp độ sẽ không có tác dụng.
        s.levelFilter = LEVEL_MAP[val] ?? null;
        GameState.save?.();
        // Để bản còn lại (thanh trạng thái / menu bên) cập nhật theo.
        EventBus.emit(GameEvents.SESSION_BADGE_UPDATED);
        Notification.info(val === 'adaptive'
            ? 'Cấp độ: Toàn bộ — không lọc theo trình độ'
            : `Cấp độ: ${LEVEL_LABEL[val]} — chỉ lấy từ ${LEVEL_MAP[val].join('/')}`);
    };

    const handleToggleVocabLang = () => {
        // Khách chưa login: đổi ngôn ngữ ghi vào settings + reload, mà khách
        // không có hồ sơ server → mời đăng nhập thay vì đổi.
        if (!isLoggedIn) {
            Notification.show({ type: 'info', title: '🔒 Đăng nhập để mở khoá', message: 'Đổi ngôn ngữ học cần đăng nhập.', duration: 3000 });
            setAuthModal('login');
            return;
        }
        const next = vocabLang === 'en' ? 'zh' : 'en';
        // Chỉ khoá chiều SANG tiếng Trung — luôn cho quay về tiếng Anh
        // (tránh kẹt nếu đang ở 'zh' mà mốc bị nâng lên).
        if (next === 'zh' && zhLock.locked) {
            Notification.show({
                type: 'warning',
                title: `🔒 Cần Level ${zhLock.requiredLevel}`,
                message: `Học tiếng Trung mở khi bạn đạt Level ${zhLock.requiredLevel}.`,
                duration: 3500,
            });
            return;
        }
        setVocabLang(next);
        try {
            localStorage.setItem('vocabLang', next);
        } catch {}
        if (window.GameState?.state?.settings) {
            window.GameState.state.settings.vocabLang = next;
            window.GameState.save?.();
        }
        window.location.reload();
    };

    const handleToggleReverse = () => {
        const next = !reverseMode;
        setReverseMode(next);
        localStorage.setItem('reverseMode', String(next));
        Notification.success(next
            ? 'Đảo chiều: hỏi bằng Tiếng Việt → trả lời bằng từ đang học'
            : 'Chiều thường: hỏi bằng từ đang học → trả lời bằng Tiếng Việt');
    };

    const guestBlocked = !isLoggedIn;
    const zhBlocked = vocabLang === 'en' && zhLock.locked;   // chỉ khoá chiều sang tiếng Trung
    const blocked = guestBlocked || zhBlocked;
    const inMenu = variant === 'menu';

    const langBtn = (
        <button
            onClick={handleToggleVocabLang}
            title={guestBlocked ? 'Đăng nhập để đổi ngôn ngữ học'
                : zhBlocked ? `Học tiếng Trung mở ở Level ${zhLock.requiredLevel}`
                : (vocabLang === 'en' ? 'Đang học Tiếng Anh — bấm để chuyển Tiếng Trung' : 'Đang học Tiếng Trung — bấm để chuyển Tiếng Anh')}
            style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '3px 8px', border: '1px solid var(--border-color)',
                borderRadius: '20px', background: 'var(--bg-secondary)',
                color: 'var(--text-primary)', fontSize: '12px', fontWeight: 500,
                cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.55 : 1,
                width: inMenu ? '100%' : undefined,
                justifyContent: inMenu ? 'flex-start' : undefined,
            }}
        >
            <FlagIcon lang={vocabLang} size={18} />
            <span>{vocabLang === 'en' ? 'Tiếng Anh' : 'Tiếng Trung'}</span>
            {blocked && <i className="fas fa-lock" style={{ fontSize: 10, marginLeft: 2 }}></i>}
        </button>
    );

    // Trong menu: mỗi lựa chọn một dòng, có nhãn chữ. Thanh trạng thái chỉ có
    // `title` để hover — trên điện thoại không hover được nên phải ghi ra.
    if (inMenu) {
        return (
            <div className="menu-quick-settings">
                <label className="menu-quick-label" htmlFor="menu-questions-select">Số câu mỗi lượt</label>
                <div className="quick-difficulty-selector">
                    <select id="menu-questions-select" value={questionsPerSession} onChange={handleQuestionsChange}>
                        <option value={5}>5 — Khởi động</option>
                        <option value={10}>10 — Dễ</option>
                        <option value={20}>20 — Bình thường</option>
                        <option value={30}>30 — Tập trung</option>
                        <option value={50}>50 — Khó</option>
                        <option value={100}>100 — Rất khó</option>
                        <option value={200}>200 — Thử thách</option>
                        <option value="auto">Toàn bộ</option>
                    </select>
                </div>

                <label className="menu-quick-label" htmlFor="menu-difficulty-select">Độ khó</label>
                <div className="quick-difficulty-selector">
                    <select id="menu-difficulty-select" value={difficulty} onChange={handleDifficultyChange}>
                        <option value="easy">Dễ (A1-A2)</option>
                        <option value="medium">Trung bình (B1-B2)</option>
                        <option value="hard">Khó (C1-C2)</option>
                        <option value="adaptive">Toàn bộ</option>
                    </select>
                </div>

                {/* Đảo chiều hỏi–đáp. CHỈ hiện khi đã đăng nhập: khách chưa có
                    hồ sơ nên mọi lựa chọn của họ đều mất khi đóng trình duyệt —
                    bày ra rồi để nó bốc hơi thì tệ hơn là không bày.
                    Nút đổi ngôn ngữ bên dưới thì vẫn hiện, ở dạng khoá, vì nó
                    NÓI RÕ lý do khi bấm (mời đăng nhập). */}
                {isLoggedIn && (
                    <>
                        <label className="menu-quick-label">Chiều luyện tập</label>
                        <button
                            onClick={handleToggleReverse}
                            title={reverseMode
                                ? 'Đang hỏi bằng Tiếng Việt — bấm để đổi lại'
                                : 'Đang hỏi bằng từ đang học — bấm để đảo chiều'}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                width: '100%', padding: '3px 8px',
                                border: '1px solid var(--border-color)', borderRadius: '20px',
                                background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                                fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                            }}
                        >
                            <i className="fas fa-right-left"></i>
                            <span>
                                {reverseMode
                                    ? `Tiếng Việt → ${vocabLang === 'en' ? 'Tiếng Anh' : 'Tiếng Trung'}`
                                    : `${vocabLang === 'en' ? 'Tiếng Anh' : 'Tiếng Trung'} → Tiếng Việt`}
                            </span>
                        </button>
                    </>
                )}

                <label className="menu-quick-label">Ngôn ngữ học</label>
                {langBtn}
            </div>
        );
    }

    return (
        <>
            <div className="quick-difficulty-selector" title="Số câu hỏi mỗi lượt">
                <select id="quick-questions-select" value={questionsPerSession} onChange={handleQuestionsChange}>
                    <option value={5}>5 — Khởi động</option>
                    <option value={10}>10 — Dễ</option>
                    <option value={20}>20 — Bình thường</option>
                    <option value={30}>30 — Tập trung</option>
                    <option value={50}>50 — Khó</option>
                    <option value={100}>100 — Rất khó</option>
                    <option value={200}>200 — Thử thách</option>
                    <option value="auto">Toàn bộ</option>
                </select>
            </div>
            <div className="quick-difficulty-selector" title="Độ khó câu hỏi">
                <select id="quick-difficulty-select" value={difficulty} onChange={handleDifficultyChange}>
                    <option value="easy">Dễ (A1-A2)</option>
                    <option value="medium">Trung bình (B1-B2)</option>
                    <option value="hard">Khó (C1-C2)</option>
                    <option value="adaptive">Toàn bộ</option>
                </select>
            </div>
            {langBtn}
        </>
    );
}
