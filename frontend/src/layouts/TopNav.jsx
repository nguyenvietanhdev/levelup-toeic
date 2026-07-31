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
    // readOnly cho tới khi user tương tác → chặn Edge autofill email lúc load trang
    const [searchReadOnly, setSearchReadOnly] = useState(true);
    const [favOpen, setFavOpen] = useState(false);
    const [topicOpen, setTopicOpen] = useState(false);
    const [spinOpen, setSpinOpen] = useState(false);
    const [translateText, setTranslateText] = useState(null); // từ đang dịch (popup)
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
                            : translateLock.locked
                                ? `Tìm từ vựng... (Dịch nhanh mở ở Level ${translateLock.requiredLevel})`
                                : 'Tìm từ vựng... (Shift+Enter: dịch Google)'}
                        autoComplete="off"
                        readOnly={searchReadOnly || isInPractice}
                        disabled={isInPractice}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onFocus={() => { setSearchReadOnly(false); setSearchFocused(true); }}
                        onMouseDown={() => setSearchReadOnly(false)}
                        onBlur={() => setSearchFocused(false)}
                        onKeyDown={(e) => {
                            // Shift+Enter → mở popup dịch nhanh ngay trong app (khi không tìm thấy trong app)
                            if (e.key === 'Enter' && e.shiftKey) {
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
                onClose={() => setTranslateText(null)}
                onOpenFavorites={() => setFavOpen(true)}
            />
        )}
        </>
    );
}
