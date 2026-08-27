import { useState, useEffect } from 'react';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { GameState } from '@game/state.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { Notification } from '@ui/Toaster.jsx';
import { loadUnlocks, lockInfo } from '@game/featureUnlocks.js';
import { levelsFor, bandLabel, BANDS } from '@lib/levelBands.js';

// Bảng mức độ khó theo ngôn ngữ nằm ở `@lib/levelBands.js` — tiếng Trung dùng
// HSK, tiếng Anh dùng CEFR. Trước đây bảng CEFR bị chép cứng ở đây, nên chọn
// "Dễ" lúc học tiếng Trung là lọc ra 0 từ (kho zh toàn HSK*).

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
            // `vocabLang` cũng phải đọc lại. `useState` chỉ chạy lúc gắn vào
            // cây, mà lúc đó GameState thường CHƯA nạp xong hồ sơ server → chốt
            // 'en' rồi giữ mãi. Người dùng đang luyện tiếng Trung mà ô trên nav
            // vẫn hiện "Tiếng Anh", bấm vào là đổi nhầm sang tiếng Anh thật.
            if (s.vocabLang === 'en' || s.vocabLang === 'zh') setVocabLang(s.vocabLang);
        };
        sync();
        const unsub = EventBus.on(GameEvents.SESSION_BADGE_UPDATED, sync);
        // Hồ sơ server nạp XONG mới có `vocabLang` thật. `sync()` ở trên chạy
        // lúc gắn vào cây, thường là TRƯỚC khi init() xong nên đọc phải giá trị
        // rỗng — không nghe sự kiện này thì ô ngôn ngữ đứng nguyên ở 'en'.
        const unsubInit = EventBus.on(GameEvents.GAME_INITIALIZED, sync);
        return () => { unsub?.(); unsubInit?.(); };
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
        // Theo ĐÚNG khung của ngôn ngữ đang học: zh → HSK*, en → CEFR.
        const levels = levelsFor(val, vocabLang);
        s.levelFilter = levels;
        GameState.save?.();
        // Để bản còn lại (thanh trạng thái / menu bên) cập nhật theo.
        EventBus.emit(GameEvents.SESSION_BADGE_UPDATED);
        Notification.info(val === 'adaptive'
            ? 'Cấp độ: Toàn bộ — không lọc theo trình độ'
            : `Cấp độ: ${bandLabel(val, vocabLang)} — chỉ lấy từ ${levels.join('/')}`);
    };

    /**
     * Đổi ngôn ngữ học sang `dich`.
     *
     * Nhận ĐÍCH chứ không đảo: từ khi có kho thứ ba (song ngữ) thì "đảo" không
     * còn nghĩa gì — chọn `bi` mà hàm tự nhảy sang `zh` là chọn một đằng ra
     * một nẻo. Không truyền gì thì giữ hành vi cũ (đảo en ↔ zh) cho nơi gọi cũ.
     */
    const handleToggleVocabLang = async (dich) => {
        // Khách chưa login: đổi ngôn ngữ ghi vào settings + reload, mà khách
        // không có hồ sơ server → mời đăng nhập thay vì đổi.
        if (!isLoggedIn) {
            Notification.show({ type: 'info', title: '🔒 Đăng nhập để mở khoá', message: 'Đổi ngôn ngữ học cần đăng nhập.', duration: 3000 });
            setAuthModal('login');
            return;
        }
        const next = dich || (vocabLang === 'en' ? 'zh' : 'en');
        // Chỉ khoá chiều SANG tiếng Trung — luôn cho quay về tiếng Anh
        // (tránh kẹt nếu đang ở 'zh' mà mốc bị nâng lên).
        //
        // Kho song ngữ cũng có chữ Hán nên chịu chung mốc Level: mở nó ra khi
        // chưa mở tiếng Trung là đi cửa sau.
        if ((next === 'zh' || next === 'bi') && zhLock.locked) {
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
            const s = window.GameState.state.settings;
            s.vocabLang = next;
            // Dịch bộ lọc độ khó sang khung của ngôn ngữ MỚI.
            //
            // Hai kho dùng hai khung (en → CEFR, zh → HSK) và bộ lọc so khớp
            // CHÍNH XÁC từng chuỗi. Giữ nguyên `['A1','A2']` khi chuyển sang
            // tiếng Trung là lọc ra 0 từ — vào luyện tập báo hết từ mà không ai
            // hiểu vì sao, vì ô độ khó vẫn hiện "Dễ" như bình thường.
            if (s.difficulty && s.difficulty !== 'adaptive') {
                s.levelFilter = levelsFor(s.difficulty, next);
            }
            // ĐỢI ghi xong mới reload. `save()` hoãn 100ms rồi trả về ngay nên
            // reload giết trang trước khi nó kịp gửi — đổi sang tiếng Trung
            // xong load lại thấy nhảy về tiếng Anh, vì server vẫn giữ 'en'.
            try {
                await window.GameState.saveNow?.();
            } catch {
                // Mạng hỏng: vẫn reload: localStorage đã có 'next' nên giao
                // diện đúng ý người dùng, lần save sau sẽ đẩy lên server.
            }
        }
        window.location.reload();
    };

    const handleReverse = (next) => {
        if (next === reverseMode) return;
        setReverseMode(next);
        // localStorage cho `gameLogic.isReversed()` (đọc đồng bộ), GameState để
        // đồng bộ lên server — thiếu vế sau là máy khác không thấy lựa chọn này.
        localStorage.setItem('reverseMode', String(next));
        GameState.state.settings.reverseMode = next;
        GameState.save?.();
        Notification.success(next
            ? 'Đảo chiều: hỏi bằng Tiếng Việt → trả lời bằng từ đang học'
            : 'Chiều thường: hỏi bằng từ đang học → trả lời bằng Tiếng Việt');
    };

    const guestBlocked = !isLoggedIn;
    // Chỉ khoá chiều SANG chữ Hán (zh hoặc song ngữ). Đang ở đó rồi thì luôn
    // cho quay về, tránh kẹt nếu mốc Level bị nâng lên sau.
    const zhBlocked = vocabLang === 'en' && zhLock.locked;
    const blocked = guestBlocked || zhBlocked;
    const inMenu = variant === 'menu';

    // Nhãn chiều luyện tập. Kho song ngữ KHÔNG đi qua tiếng Việt — hiện
    // "Tiếng Trung → Tiếng Việt" ở đó là sai cả hai vế.
    const tenChieu = vocabLang === 'bi'
        ? { tu: 'Tiếng Trung', sang: 'Tiếng Anh' }
        : { tu: vocabLang === 'en' ? 'Tiếng Anh' : 'Tiếng Trung', sang: 'Tiếng Việt' };

    // Ngôn ngữ học dùng <select> cho ĐỒNG BỘ với các lựa chọn nhanh còn lại
    // (số câu · độ khó · chiều luyện tập) — trước đây nó là nút bật/tắt duy nhất
    // trong nhóm, mà nút chỉ hiện giá trị hiện tại nên phải bấm thử mới biết
    // lựa chọn kia là gì.
    //
    // KHÔNG dùng `disabled` khi bị khoá: select mờ đi thì bấm vào không có gì
    // xảy ra và người dùng không biết vì sao. Vẫn cho chọn, rồi `handleSelectLang`
    // NÓI RÕ lý do (mời đăng nhập / cần Level N) và trả giá trị về như cũ.
    const handleSelectLang = (e) => {
        const next = e.target.value;
        if (next === vocabLang) return;
        // Dùng lại đúng đường cũ: nó đã lo khách chưa đăng nhập, mốc Level,
        // localStorage và reload. Truyền ĐÍCH vào — không truyền thì nó tự đảo
        // en ↔ zh và lựa chọn thứ ba không bao giờ tới nơi.
        handleToggleVocabLang(next);
    };

    const langBtn = (
        <div className="quick-difficulty-selector" style={{ width: inMenu ? '100%' : undefined }}>
            <select
                id={inMenu ? 'menu-lang-select' : 'quick-lang-select'}
                value={vocabLang}
                onChange={handleSelectLang}
                title={guestBlocked ? 'Đăng nhập để đổi ngôn ngữ học'
                    : zhBlocked ? `Học tiếng Trung mở ở Level ${zhLock.requiredLevel}`
                    : 'Ngôn ngữ đang học'}
                style={{
                    width: inMenu ? '100%' : undefined,
                    opacity: blocked ? 0.7 : 1,
                }}
            >
                <option value="en">🇬🇧 Tiếng Anh</option>
                <option value="zh">
                    {zhBlocked ? `🔒 Tiếng Trung (Lv.${zhLock.requiredLevel})` : '🇨🇳 Tiếng Trung'}
                </option>
                <option value="bi">
                    {zhBlocked ? `🔒 Trung–Anh (Lv.${zhLock.requiredLevel})` : '🔀 Trung–Anh'}
                </option>
            </select>
        </div>
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
                        {BANDS.map(b => (
                            <option key={b} value={b}>{bandLabel(b, vocabLang)}</option>
                        ))}
                    </select>
                </div>

                {/* Đảo chiều hỏi–đáp. Dùng <select> chứ không phải nút bật/tắt:
                    hai chiều là hai LỰA CHỌN ngang hàng, và select cho thấy cả
                    hai cùng lúc — nút chỉ hiện chiều đang dùng, người dùng phải
                    bấm thử mới biết chiều kia là gì. Nó cũng đồng bộ với hai ô
                    chọn ngay phía trên.

                    CHỈ hiện khi đã đăng nhập: khách chưa có hồ sơ nên lựa chọn
                    của họ mất khi đóng trình duyệt — bày ra rồi để nó bốc hơi
                    thì tệ hơn là không bày. Nút đổi ngôn ngữ bên dưới vẫn hiện
                    ở dạng khoá vì nó NÓI RÕ lý do khi bấm. */}
                {isLoggedIn && (
                    <>
                        <label className="menu-quick-label" htmlFor="menu-reverse-select">
                            Chiều luyện tập
                        </label>
                        <div className="quick-difficulty-selector">
                            <select
                                id="menu-reverse-select"
                                value={reverseMode ? 'reverse' : 'normal'}
                                onChange={(e) => handleReverse(e.target.value === 'reverse')}
                            >
                                <option value="normal">
                                    {tenChieu.tu} → {tenChieu.sang}
                                </option>
                                <option value="reverse">
                                    {tenChieu.sang} → {tenChieu.tu}
                                </option>
                            </select>
                        </div>
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
                    {BANDS.map(b => (
                        <option key={b} value={b}>{bandLabel(b, vocabLang)}</option>
                    ))}
                </select>
            </div>
            {langBtn}
        </>
    );
}
