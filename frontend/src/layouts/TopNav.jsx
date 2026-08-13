import { useState, useCallback, useEffect, useRef } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { GameState } from '@game/state.js';
import { resolveAvatarSrc } from '@game/avatars.js';
import { frameStyle, frameOverlayUrl } from '@game/frames.js';
import { loadUnlocks, lockInfo } from '@game/featureUnlocks.js';
import { Notification } from '@ui/Toaster.jsx';
import { useMenuBadges } from './useMenuBadges.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import NotificationPanel from '@components/notifications/NotificationPanel.jsx';
import FavoritesModal from '@components/favorites/FavoritesModal.jsx';
import TopicModal from '@components/vocab/topic/TopicModal.jsx';
import { openUploadModal } from '@components/vocab/upload/openUploadModal.js';
import SpinWheelModal from '@components/spin/SpinWheelModal.jsx';
import TranslateModal from '@components/translate/TranslateModal.jsx';
import { isSpeechSupported, speechLangFor, createSpeechInput } from '@lib/speechInput.js';
import { createHoldGesture } from '@lib/holdGesture.js';
import { getVocabLang } from '@api/vocabulary.js';

export default function TopNav() {
    const { user, resources, setMenuOpen, showScreen, menuOpen, currentScreen } = useGame();
    // Khiên bảo vệ streak: đổi màu theo số lượng (≥3 xanh dương, 2 vàng, 1 đỏ).
    const shields = resources?.shields || 0;
    const shieldColor = shields >= 3 ? '#3b82f6' : shields === 2 ? '#eab308' : '#ef4444';
    // Xếp hạng bảng xếp hạng (all-time): top 1/2/3 = vàng/bạc/đồng, còn lại tím.
    const [rank, setRank] = useState(null);
    const rankColor = rank === 1 ? '#fbbf24' : rank === 2 ? '#cbd5e1' : rank === 3 ? '#d97706' : '#a78bfa';
    // Khoá khi đang làm Full Test TOEIC (mini/đục lỗ không khoá) — báo qua EventBus.
    const [toeicFullTestLock, setToeicFullTestLock] = useState(false);
    const isInPractice = currentScreen === 'practice-screen' || currentScreen === 'toeic-test-screen' || toeicFullTestLock;
    const { isLoggedIn, setAuthModal } = useAuth();
    const { badges: menuBadges } = useMenuBadges(isLoggedIn, { listenEvents: true });
    // Number = unclaimed quest + achievement rewards; dot = other menu items have badges
    const menuRewardCount = menuBadges.quest + menuBadges.achievement;
    const menuHasDot = menuRewardCount === 0 && (menuBadges.online > 0 || menuBadges.shopDiscount > 0);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    // Nhập bằng giọng nói. `speechOn` là trạng thái ĐANG NGHE để vẽ nút; bản thân
    // phiên nhận dạng nằm trong ref vì nó không phải dữ liệu render.
    const [speechOn, setSpeechOn] = useState(false);
    const speechRef = useRef(null);
    // Chữ cuối cùng nghe được trong phiên đang chạy. Phải là ref chứ không phải
    // state: callback `onStateChange` do effect tạo một lần, closure của nó giữ
    // giá trị `searchQuery` của lần render đó và không bao giờ thấy chữ mới.
    const lastHeardRef = useRef('');
    // Nói xong có TỰ mở popup dịch không. Bật khi vào bằng cử chỉ giữ Shift, tắt
    // khi bấm nút micro — bấm nút là muốn điền vào ô tìm kiếm, tự nhảy popup lên
    // là cướp thao tác.
    const autoTranslateRef = useRef(false);
    // Hàm mở popup dịch, đặt trong ref để `onStateChange` gọi được mà không phải
    // dựng lại phiên nhận dạng mỗi lần hàm đó đổi.
    const openTranslateRef = useRef(null);
    const speechSupported = isSpeechSupported();
    // readOnly cho tới khi user tương tác → chặn Edge autofill email lúc load trang
    const [searchReadOnly, setSearchReadOnly] = useState(true);
    const [favOpen, setFavOpen] = useState(false);
    const [topicOpen, setTopicOpen] = useState(false);
    const [spinOpen, setSpinOpen] = useState(false);
    const [translateText, setTranslateText] = useState(null); // từ đang dịch (popup)
    // Bản ghi đang SỬA (null = popup dịch bình thường). Modal Từ vựng riêng dựng
    // bằng vanilla JS nên không truyền prop xuống được — mở qua cửa toàn cục.
    const [translateEdit, setTranslateEdit] = useState(null);

    useEffect(() => {
        window._reactOpenTranslate = ({ text, editWord = null, onSaved = null } = {}) => {
            setTranslateEdit(editWord ? { word: editWord, onSaved } : null);
            setTranslateText(text || '');
        };
        return () => { delete window._reactOpenTranslate; };
    }, []);
    const [spinAvailable, setSpinAvailable] = useState(false);
    const pendingModeRef = useRef(null);

    // Nghe tín hiệu khoá/mở thanh tìm kiếm khi vào/ra Full Test TOEIC.
    useEffect(() => {
        const unsub = EventBus.on(GameEvents.TOEIC_SEARCH_LOCK, (lock) => setToeicFullTestLock(!!lock));
        return unsub;
    }, []);
    const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');

    // Mở popup chọn đề khi user click 1 chế độ mà chưa chọn đề
    useEffect(() => {
        const unsub = EventBus.on(GameEvents.TOPIC_MODAL_REQUESTED, ({ pendingMode } = {}) => {
            pendingModeRef.current = pendingMode || null;
            setTopicOpen(true);
        });
        return unsub;
    }, []);

    // Lấy xếp hạng all-time của user (cạnh khiên); refresh sau mỗi lượt luyện tập.
    useEffect(() => {
        const uid = user?.id || user?._id;
        if (!uid) { setRank(null); return; }
        let cancelled = false;
        const fetchRank = () => {
            fetch(`/api/leaderboard/rank/${uid}/all-time`)
                .then(r => r.json())
                .then(j => { if (!cancelled && j.success) setRank(j.data?.rank ?? null); })
                .catch(() => {});
        };
        fetchRank();
        const unsub = EventBus.on(GameEvents.PRACTICE_COMPLETED, fetchRank);
        return () => { cancelled = true; unsub?.(); };
    }, [user?.id, user?._id]);

    const handleTopicSelected = useCallback(() => {
        const mode = pendingModeRef.current;
        pendingModeRef.current = null;
        if (mode) {
            // Chọn đề xong → mở Part selector với pendingMode,
            // PartSelector.selectPart() sẽ emit PRACTICE_REQUESTED sau khi user chọn part.
            setTimeout(() => {
                PartSelector.pendingMode = mode;
                PartSelector.showPartSelectionModal();
            }, 200);
        }
    }, []);

    const handleTopicClose = useCallback(() => {
        // Đóng mà không chọn → bỏ pending, không auto-start
        pendingModeRef.current = null;
        setTopicOpen(false);
    }, []);

    const handlePartSelector = useCallback(() => {
        PartSelector.showPartSelectionModal();
    }, []);


    // Mốc mở khoá — nạp khi đăng nhập & khi lên cấp (để nút tự mở/khoá).
    const [unlockTick, setUnlockTick] = useState(0);
    useEffect(() => {
        if (!isLoggedIn) return;
        const reload = () => loadUnlocks(true).then(() => setUnlockTick(t => t + 1));
        reload();
        const unsub = EventBus.on(GameEvents.USER_LEVEL_UP, reload);
        return () => unsub?.();
    }, [isLoggedIn]);
    // Khách chưa login: các tính năng CẦN TÀI KHOẢN (từ vựng riêng, yêu thích)
    // hiện ổ khoá, bấm ra popup đăng nhập — không lưu server được thì mở cũng vô ích.
    const uploadLock = isLoggedIn ? lockInfo('feature:upload-vocab') : { locked: true, guest: true };
    const favLock = isLoggedIn ? lockInfo('feature:favorites') : { locked: true, guest: true };
    const translateLock = isLoggedIn ? lockInfo('feature:translate') : { locked: false };

    // Bấm nút khoá-khách → mời đăng nhập.
    const promptLogin = () => {
        Notification.show({ type: 'info', title: '🔒 Đăng nhập để mở khoá', message: 'Tính năng này cần đăng nhập.', duration: 3000 });
        setAuthModal('login');
    };

    // Báo mốc còn thiếu (dùng chung cho các nút bị khoá trên nav).
    const warnLocked = (name, requiredLevel) => Notification.show({
        type: 'warning',
        title: `🔒 Cần Level ${requiredLevel}`,
        message: `${name} mở khi bạn đạt Level ${requiredLevel}.`,
        duration: 3500,
    });

    // ── Nhập bằng giọng nói ───────────────────────────────────────────────────
    // Phiên nhận dạng tạo MỘT lần và giữ trong ref: tạo lại mỗi lần render sẽ ngắt
    // giữa chừng lúc người dùng đang nói (mỗi ký tự nghe được là một lần setState).
    useEffect(() => {
        if (!speechSupported) return;
        const s = createSpeechInput({
            lang: speechLangFor(getVocabLang()),
            onText: (text) => {
                setSearchReadOnly(false);
                setSearchQuery(text);
                // Nhớ lại chữ cuối cùng nghe được, để lúc dừng còn biết mở popup
                // dịch với nội dung gì. Không đọc `searchQuery` trong onStateChange
                // được: closure ở đó giữ giá trị cũ của lần render tạo ra nó.
                lastHeardRef.current = text;
            },
            onStateChange: (listening) => {
                setSpeechOn(listening);
                if (listening) {
                    // Bắt đầu phiên mới thì quên chữ của phiên trước, không thì
                    // bấm nói rồi im lặng sẽ mở popup với nội dung nói lần trước.
                    lastHeardRef.current = '';
                    return;
                }
                // Vừa dừng nghe = người dùng nói xong. Mở popup dịch.
                //
                // Mốc là lúc DỪNG chứ không phải `isFinal`: một phiên có thể chốt
                // nhiều đoạn giữa chừng, mở popup ở đó là cắt ngang lúc còn đang nói.
                const text = (lastHeardRef.current || '').trim();
                lastHeardRef.current = '';
                if (!text || !autoTranslateRef.current) return;
                autoTranslateRef.current = false;
                openTranslateRef.current?.(text);
            },
            onError: (code) => {
                Notification.show({
                    type: 'warning',
                    title: code === 'not-allowed' ? '🎤 Chưa cấp quyền micro' : '🎤 Không nghe được',
                    message: code === 'not-allowed'
                        ? 'Cho phép trang này dùng micro trong cài đặt trình duyệt rồi thử lại.'
                        : 'Trình duyệt báo lỗi khi nhận giọng nói. Thử lại hoặc gõ tay.',
                    duration: 4000,
                });
            },
        });
        speechRef.current = s;
        return () => { s.destroy(); speechRef.current = null; };
    }, [speechSupported]);

    // Firefox chưa cài đặt SpeechRecognition (tính tới 2026). Nói thẳng tên trình
    // duyệt dùng được, đừng chỉ báo "không hỗ trợ" rồi để người dùng tự đoán.
    const warnNoSpeech = useCallback(() => Notification.show({
        type: 'info',
        title: '🎤 Trình duyệt chưa hỗ trợ',
        message: 'Nhập bằng giọng nói cần Chrome, Edge hoặc Safari. Firefox chưa có tính năng này — bạn vẫn gõ tay bình thường nhé.',
        duration: 5000,
    }), []);

    // Đặt vào ref để callback nhận dạng giọng nói (tạo một lần trong effect) luôn
    // gọi được bản mới nhất, mà không phải dựng lại cả phiên mỗi lần khoá đổi.
    openTranslateRef.current = (text) => {
        if (translateLock.locked) return warnLocked('Dịch nhanh', translateLock.requiredLevel);
        setTranslateEdit(null);     // vào bằng giọng nói luôn là dịch mới, không phải sửa
        setTranslateText(text);
    };

    const stopSpeech = useCallback(() => speechRef.current?.stop(), []);
    const startSpeech = useCallback(() => {
        if (isInPractice) return;   // đang luyện tập thì ô tìm kiếm khoá

        // Kéo con trỏ về ô tìm kiếm trước khi nghe. Không có bước này thì đang ở
        // giữa trang bấm phím nói xong, chữ hiện ra ở một ô mà con trỏ không nằm
        // trong đó — gõ sửa tiếp là gõ vào chỗ khác.
        setSearchReadOnly(false);
        document.getElementById('search-input')?.focus();

        // Xoá chữ cũ trước khi nghe. Không xoá thì chữ mới NỐI ĐUÔI chữ cũ —
        // ô còn `管家爱华。` mà nói `你好` sẽ ra một câu vô nghĩa, và popup dịch
        // mở lên với nội dung đó.
        setSearchQuery('');

        speechRef.current?.start();
    }, [isInPractice]);
    const toggleSpeech = useCallback(() => {
        if (speechRef.current?.isListening()) stopSpeech();
        else {
            // Bấm nút micro = muốn điền vào ô tìm kiếm. Tự nhảy popup dịch lên
            // là cướp thao tác, nên KHÔNG bật cờ tự dịch ở đây.
            autoTranslateRef.current = false;
            startSpeech();
        }
    }, [startSpeech, stopSpeech]);

    // GIỮ Shift để nói, thả ra thì dừng — và thả xong TỰ MỞ popup dịch với nội
    // dung vừa nói (xem autoTranslateRef trong onStateChange). Dùng được ở bất kỳ
    // đâu trong trang, không cần bấm vào ô tìm kiếm trước: `startSpeech` tự kéo
    // con trỏ về đó.
    //
    // Ngưỡng giữ + huỷ khi có phím khác nằm trong `createHoldGesture` — không có
    // hai lớp đó thì mỗi lần gõ chữ hoa là một lần bật micro.
    useEffect(() => {
        if (!speechSupported) return;

        const gesture = createHoldGesture({
            thresholdMs: 350,
            // Vào bằng phím tắt thì nói xong tự mở popup dịch; bấm nút micro thì
            // không (xem toggleSpeech).
            onStart: () => { autoTranslateRef.current = true; startSpeech(); },
            onStop: stopSpeech,
        });

        // Chỉ nhận cử chỉ khi người dùng KHÔNG đang gõ ở ô nhập nào khác — dictate
        // vào ô tìm kiếm thì được, chứ đang soạn trong popup dịch mà Shift cướp
        // micro thì rất khó chịu.
        const busyElsewhere = () => {
            // Có cửa sổ khác đang CHIẾM phím nói (popup Dịch nhanh) thì nav đứng
            // im. Không có lớp này thì hai listener cùng nghe một phím: popup mở
            // ra, giữ Shift, chữ chui vào ô tìm kiếm sau lưng người dùng.
            //
            // Kiểm bằng quyền sở hữu chứ không bằng focus: popup vừa mở thì
            // activeElement còn là <body>, kiểm focus không phát hiện được gì.
            if (window._speechOwner) return true;

            const el = document.activeElement;
            if (!el || el.id === 'search-input') return false;
            // `!!` vì `isContentEditable` không có trên mọi phần tử (undefined trên
            // <body>) — thiếu nó thì hàm trả undefined thay vì false. Ở đây
            // undefined vẫn falsy nên hành vi không đổi, nhưng một hàm tên
            // `busyElsewhere` mà trả undefined là chỗ dễ đọc nhầm về sau.
            return !!(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        };

        const onKeyDown = (e) => {
            if (e.key === 'Shift') {
                if (busyElsewhere() || isInPractice) return;
                gesture.keyDown({ repeat: e.repeat });
            } else {
                gesture.otherKeyDown();
            }
        };
        const onKeyUp = (e) => { if (e.key === 'Shift') gesture.keyUp(); };
        // Alt-Tab ra khỏi trang khi đang giữ Shift → không bao giờ nhận được keyup,
        // micro sẽ kẹt ở trạng thái nghe. Dừng chủ động.
        const onBlur = () => { gesture.reset(); stopSpeech(); };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
            gesture.reset();
        };
    }, [speechSupported, isInPractice, startSpeech, stopSpeech]);

    // Vào màn luyện tập giữa chừng thì ngắt luôn, không để micro chạy nền.
    useEffect(() => { if (isInPractice) stopSpeech(); }, [isInPractice, stopSpeech]);

    // Expose spin opener globally + check availability
    useEffect(() => {
        // Khoá theo Level: chặn mở Vòng quay ở MỌI nơi gọi (Cửa hàng, Túi đồ…).
        window._openSpinWheel = () => {
            const lv = lockInfo('feature:spin');
            if (lv.locked) {
                Notification.show({
                    type: 'warning',
                    title: `🔒 Cần Level ${lv.requiredLevel}`,
                    message: `Vòng quay mở khi bạn đạt Level ${lv.requiredLevel}.`,
                    duration: 3500,
                });
                return;
            }
            setSpinOpen(true); setSpinAvailable(false);
        };
        return () => { delete window._openSpinWheel; };
    }, []);

    useEffect(() => {
        const token = user ? localStorage.getItem('authToken') : null;
        if (!token) return;
        const parsed = (() => { try { return JSON.parse(token); } catch { return {}; } })();
        const t = parsed.token || token;
        if (!t) return;
        fetch('/api/spin/status', { headers: { Authorization: `Bearer ${t}` } })
            .then(r => r.json())
            .then(d => { if (d.success) setSpinAvailable(d.canSpin); })
            .catch(() => {});
    }, [user]);

    const avatarSrc = resolveAvatarSrc(GameState.state?.equippedImages?.avatar, user?.avatar);
    const isAvatarImg = !!avatarSrc;
    // Khung cosmetic đang trang bị — đồng bộ với Hồ sơ / Bảng xếp hạng.
    const equippedFrame = GameState.state?.equipped?.frame;
    const avatarFrameStyle = frameStyle(equippedFrame);
    const frameImg = frameOverlayUrl(equippedFrame);

    return (
        <>
        <nav className={`top-nav${searchFocused ? ' search-active' : ''}`}>
            <div className="nav-left">
                <button id="menu-btn" className="icon-btn" onClick={() => setMenuOpen(!menuOpen)} style={{ position: 'relative' }}>
                    <i className="fas fa-bars"></i>
                    {menuRewardCount > 0
                        ? <span className="notif-badge">{menuRewardCount > 99 ? '99+' : menuRewardCount}</span>
                        : menuHasDot
                        ? <span className="notif-badge notif-badge-dot" />
                        : null
                    }
                </button>
                <button id="home-btn" className="icon-btn nav-home-btn" title="Trang chủ" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-home"></i>
                </button>

                <NotificationPanel isLoggedIn={isLoggedIn} />

                <div className="user-info" onClick={() => showScreen('home-screen')} style={{ cursor: 'pointer' }}>
                    <div className="avatar-small" id="user-avatar" style={avatarFrameStyle || undefined}>
                        {isAvatarImg
                            ? <img src={avatarSrc} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            : (avatarSrc || user?.username?.charAt(0)?.toUpperCase() || 'P')
                        }
                        {frameImg && <span className="frame-overlay" style={{ backgroundImage: `url("${frameImg}")` }} aria-hidden="true" />}
                    </div>
                    <div className="user-details">
                        <span id="username" className="username">{user?.username || 'Player'}</span>
                        <div className="level-badge">
                            <i className="fas fa-star"></i>
                            <span>Level </span>
                            <span id="user-level">{user?.level || 1}</span>
                            {shields > 0 && (
                                <span
                                    className="shield-badge"
                                    style={{ color: shieldColor }}
                                    title={`${shields} khiên bảo vệ streak`}
                                >
                                    <i className="fas fa-shield-alt"></i>
                                    <span className="shield-count">{shields}</span>
                                </span>
                            )}
                            {rank != null && (
                                <span
                                    className="rank-badge"
                                    style={{ color: rankColor }}
                                    title={`Xếp hạng #${rank} toàn hệ thống`}
                                >
                                    <i className="fas fa-trophy"></i>
                                    <span className="rank-count">#{rank}</span>
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="nav-center">
                <div className={`search-bar ${isInPractice ? 'disabled' : ''}`}>
                    <i className={`fas ${isInPractice ? 'fa-lock' : 'fa-search'}`}></i>
                    <input
                        type="text"
                        id="search-input"
                        placeholder={isInPractice
                            ? 'Đang luyện tập — tạm khoá tìm kiếm'
                            : speechOn
                                ? '🎤 Đang nghe... nói từ bạn muốn tìm'
                                : translateLock.locked
                                    ? `Tìm từ vựng... (Dịch nhanh mở ở Level ${translateLock.requiredLevel})`
                                    : 'Tìm từ vựng... (Enter: dịch · giữ Shift: nói · Esc: xoá)'}
                        autoComplete="off"
                        readOnly={searchReadOnly || isInPractice}
                        disabled={isInPractice}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onFocus={() => { setSearchReadOnly(false); setSearchFocused(true); }}
                        onMouseDown={() => setSearchReadOnly(false)}
                        onBlur={() => setSearchFocused(false)}
                        onKeyDown={(e) => {
                            // Esc → xoá ô tìm kiếm và bỏ focus. Đặt TRƯỚC nhánh Enter
                            // vì đây là lối thoát, phải luôn chạy được.
                            if (e.key === 'Escape') {
                                e.preventDefault();
                                setSearchQuery('');
                                window._reactClearSearch?.();
                                e.currentTarget.blur();
                                return;
                            }
                            // Enter → mở Dịch nhanh. Trước đây phải Shift+Enter, nhưng
                            // Enter thường KHÔNG làm gì cả (tìm kiếm lọc theo onChange),
                            // nên gán Enter cho việc này không cướp mất hành vi nào.
                            // Vẫn nhận Shift+Enter để thói quen cũ không gãy.
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (translateLock.locked) return warnLocked('Dịch nhanh', translateLock.requiredLevel);
                                const q = searchQuery.trim();
                                if (q) setTranslateText(q);
                            }
                        }}
                    />
                    {searchQuery && !isInPractice && (
                        <button id="clear-search-btn" className="clear-search-btn" onClick={() => { setSearchQuery(''); window._reactClearSearch?.(); }}>
                            <i className="fas fa-times"></i>
                        </button>
                    )}
                </div>

                {/* Nút ghi âm nằm NGOÀI `.search-bar`, là anh em của nó.
                    Trước đây nó là CON của ô tìm. Trên điện thoại ô tìm thu lại
                    thành nút kính lúp và mic bị `display: none` — bấm vào chỗ đó
                    là bấm trúng input, nên nút ghi âm coi như không tồn tại.
                    Ra ngoài thì nó là đích chạm riêng, độc lập với việc ô tìm
                    đang thu hay đang bung.

                    Trên máy tính vẫn TRÔNG như nằm trong ô: layout.css kéo nó
                    chồng lên mép phải ô tìm bằng margin âm, không phải absolute.

                    Trình duyệt không hỗ trợ (Firefox) thì VẪN HIỆN nút, ở dạng mờ
                    + gạch chéo, bấm vào nói rõ lý do. Bản đầu tôi ẩn hẳn — và nó
                    lặp đúng lỗi của nút đăng nhập Google: tính năng biến mất mà
                    người dùng phải mở Console mới biết vì sao. Ẩn im lặng khiến
                    người ta nghĩ app hỏng; nút mờ khiến người ta biết phải đổi
                    trình duyệt. */}
                {!isInPractice && (
                    <button
                        type="button"
                        className={`mic-btn${speechOn ? ' is-listening' : ''}${speechSupported ? '' : ' is-unsupported'}`}
                        onClick={speechSupported ? toggleSpeech : warnNoSpeech}
                        aria-pressed={speechSupported ? speechOn : undefined}
                        aria-label={!speechSupported
                            ? 'Nhập bằng giọng nói — trình duyệt này không hỗ trợ'
                            : speechOn ? 'Dừng nhập bằng giọng nói' : 'Nhập bằng giọng nói'}
                        title={!speechSupported
                            ? 'Trình duyệt này không hỗ trợ nhập giọng nói — dùng Chrome hoặc Edge'
                            : speechOn ? 'Đang nghe — bấm để dừng' : 'Nói để tìm (hoặc giữ Shift)'}
                    >
                        <i className={`fas ${!speechSupported ? 'fa-microphone-slash' : speechOn ? 'fa-stop' : 'fa-microphone'}`}></i>
                    </button>
                )}
            </div>

            <div className="nav-right">
                <button id="topic-selector-btn" className="icon-btn" title="Chọn chủ đề từ vựng" onClick={() => setTopicOpen(true)}>
                    <i className="fas fa-book"></i>
                </button>
                <button id="part-selector-btn" className="icon-btn" title="Chọn Part" onClick={handlePartSelector}>
                    <i className="fas fa-layer-group"></i>
                </button>
                <button
                    id="upload-btn"
                    className={`icon-btn${uploadLock.locked ? ' icon-btn--locked' : ''}`}
                    title={uploadLock.guest ? 'Đăng nhập để mở khoá'
                        : uploadLock.locked ? `Mở ở Level ${uploadLock.requiredLevel}` : 'Tải lên từ vựng'}
                    onClick={() => {
                        if (uploadLock.guest) return promptLogin();
                        if (uploadLock.locked) {
                            Notification.show({
                                type: 'warning',
                                title: `🔒 Cần Level ${uploadLock.requiredLevel}`,
                                message: `Từ vựng riêng mở khi bạn đạt Level ${uploadLock.requiredLevel}.`,
                                duration: 3500,
                            });
                            return;
                        }
                        openUploadModal();
                    }}
                >
                    <i className={`fas ${uploadLock.locked ? 'fa-lock' : 'fa-cloud-upload-alt'}`}></i>
                </button>
                <button
                    id="nav-favorite-btn"
                    className={`icon-btn${favLock.locked ? ' icon-btn--locked' : ''}`}
                    title={favLock.guest ? 'Đăng nhập để mở khoá'
                        : favLock.locked ? `Mở ở Level ${favLock.requiredLevel}` : 'Danh sách từ yêu thích'}
                    onClick={() => {
                        if (favLock.guest) return promptLogin();
                        if (favLock.locked) return warnLocked('Từ vựng yêu thích', favLock.requiredLevel);
                        setFavOpen(true);
                    }}
                >
                    <i className={`fas ${favLock.locked ? 'fa-lock' : 'fa-star'}`}></i>
                </button>
                <button
                    id="theme-toggle-btn"
                    className="icon-btn"
                    title={isDark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
                    onClick={() => {
                        const newTheme = isDark ? 'light' : 'dark';
                        document.documentElement.setAttribute('data-theme', newTheme);
                        localStorage.setItem('theme', newTheme);
                        setIsDark(!isDark);
                    }}
                >
                    <i className={`fas ${isDark ? 'fa-sun' : 'fa-moon'}`}></i>
                </button>
            </div>
        </nav>
        <FavoritesModal open={favOpen} onClose={() => setFavOpen(false)} />
        <TopicModal open={topicOpen} onClose={handleTopicClose} onSelected={handleTopicSelected} />
        <SpinWheelModal open={spinOpen} onClose={() => setSpinOpen(false)} />
        {translateText && (
            <TranslateModal
                text={translateText}
                // Xoá luôn translateEdit khi đóng — giữ lại thì lần sau mở popup
                // dịch bình thường lại rơi vào chế độ sửa của từ cũ.
                onClose={() => { setTranslateText(null); setTranslateEdit(null); }}
                editWord={translateEdit?.word || null}
                onSaved={translateEdit?.onSaved}
            />
        )}
        </>
    );
}
