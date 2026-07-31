import { useEffect, useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { useMenuBadges } from './useMenuBadges.js';
import SeasonCountdown from '@components/season/SeasonCountdown.jsx';
import { loadUnlocks, lockInfo } from '@game/featureUnlocks.js';
import { Notification } from '@ui/Toaster.jsx';

// `feature` = key trong FeatureUnlock → khoá theo Level (Hồ sơ/Cài đặt luôn mở).
const MENU_ITEMS = [
    { label: 'Luyện đề test TOEIC',icon: 'fa-graduation-cap', screen: 'toeic-screen',      hot: true, feature: 'feature:toeic' },
    { label: 'Hồ sơ',          icon: 'fa-user',             screen: 'profile-screen' },
    { label: 'Nhiệm vụ',       icon: 'fa-tasks',            screen: 'quest-screen',        badgeKey: 'quest',        feature: 'feature:quest' },
    { label: 'Bảng xếp hạng',  icon: 'fa-trophy',           screen: 'leaderboard-screen',  badgeKey: 'online',       badgeStyle: 'info', feature: 'feature:leaderboard' },
    { label: 'Thành tích',     icon: 'fa-medal',            screen: 'achievements-screen', badgeKey: 'achievement',  feature: 'feature:achievements' },
    { label: 'Thống kê',       icon: 'fa-chart-bar',        screen: 'statistics-screen',   badgeKey: 'statsExport',  badgeStyle: 'dot', feature: 'feature:stats' },
    { label: 'Cửa hàng',       icon: 'fa-shopping-cart',    screen: 'shop-screen',         badgeKey: 'shopDiscount', badgeStyle: 'sale', feature: 'feature:shop' },
    // KHÔNG khoá theo level (không có `feature:`): nhiệm vụ và thành tích phát
    // vật phẩm ngay từ level 1, khoá túi đồ là người mới có đồ mà không có chỗ dùng.
    { label: 'Túi đồ',         icon: 'fa-briefcase',        screen: 'inventory-screen' },
    { label: 'Cài đặt',        icon: 'fa-cog',              screen: 'settings-screen' },
];

export default function SideMenu() {
    const { menuOpen, setMenuOpen, showScreen, currentScreen } = useGame();
    const { isLoggedIn, setAuthModal, logout } = useAuth();
    const { badges, refresh } = useMenuBadges(isLoggedIn);

    // Refresh badges each time the menu opens
    useEffect(() => { if (menuOpen) refresh(); }, [menuOpen, refresh]);

    // Nạp lại mốc mở khoá mỗi lần mở menu (level có thể vừa tăng).
    const [unlockTick, setUnlockTick] = useState(0);
    useEffect(() => {
        if (menuOpen) loadUnlocks(true).then(() => setUnlockTick(t => t + 1));
    }, [menuOpen]);

    // Bấm mục bị khoá theo Level → báo mốc cần đạt, KHÔNG điều hướng.
    const handleLevelLockedClick = (item, requiredLevel) => {
        Notification.show({
            type: 'warning',
            title: `🔒 Cần Level ${requiredLevel}`,
            message: `"${item.label}" mở khi bạn đạt Level ${requiredLevel}. Luyện tập thêm để lên cấp!`,
            duration: 3500,
        });
    };

    const handleNav = (screen) => {
        showScreen(screen);
        setMenuOpen(false);
    };

    // Khách bấm vào mục bị khóa → mở popup đăng nhập thay vì điều hướng.
    const handleLockedClick = () => {
        setAuthModal('login');
        setMenuOpen(false);
    };

    return (
        <>
            {/* Overlay — uses class "overlay" matching CSS */}
            <div
                id="menu-overlay"
                className={`overlay ${menuOpen ? 'active' : ''}`}
                onClick={() => setMenuOpen(false)}
            />

            <aside id="side-menu" className={`side-menu ${menuOpen ? 'active' : ''}`}>
                <div className="menu-header">
                    <div className="menu-header-auth">
                        {!isLoggedIn ? (
                            <>
                                <button
                                    id="login-menu-btn"
                                    className="menu-auth-btn login"
                                    onClick={() => { setAuthModal('login'); setMenuOpen(false); }}
                                >
                                    <i className="fas fa-sign-in-alt"></i> Đăng nhập
                                </button>
                                <button
                                    id="register-menu-btn"
                                    className="menu-auth-btn register"
                                    onClick={() => { setAuthModal('register'); setMenuOpen(false); }}
                                >
                                    <i className="fas fa-user-plus"></i> Đăng ký
                                </button>
                            </>
                        ) : (
                            <button id="logout-menu-btn" className="menu-auth-btn logout" onClick={logout}>
                                <i className="fas fa-sign-out-alt"></i> Đăng xuất
                            </button>
                        )}
                    </div>
                    <button id="close-menu-btn" className="icon-btn" onClick={() => setMenuOpen(false)}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Nav — matches .menu-nav in CSS */}
                <nav className="menu-nav">
                    {MENU_ITEMS.map(item => {
                        const n = item.badgeKey ? badges[item.badgeKey] : 0;
                        const guestLocked = !isLoggedIn && !item.guestOk;
                        // Khoá theo Level (chỉ xét khi đã đăng nhập).
                        const lv = (!guestLocked && item.feature) ? lockInfo(item.feature) : { locked: false };
                        const levelLocked = !!lv.locked;
                        const locked = guestLocked || levelLocked;
                        return (
                            <button
                                key={item.screen}
                                className={`menu-item${currentScreen === item.screen ? ' active' : ''}${locked ? ' is-locked' : ''}`}
                                data-screen={item.screen}
                                onClick={() => {
                                    if (guestLocked) return handleLockedClick();
                                    if (levelLocked) return handleLevelLockedClick(item, lv.requiredLevel);
                                    handleNav(item.screen);
                                }}
                                title={guestLocked ? 'Đăng nhập để mở khóa'
                                    : levelLocked ? `Mở ở Level ${lv.requiredLevel}` : undefined}
                            >
                                {item.hot && !locked && <span className="menu-item-hot">hot</span>}
                                <i className={`fas ${levelLocked ? 'fa-lock' : item.icon}`}></i>
                                <span>{item.label}</span>
                                {levelLocked ? (
                                    <span className="menu-item-badge level-lock">Lv.{lv.requiredLevel}</span>
                                ) : guestLocked ? (
                                    <i className="fas fa-lock menu-item-lock"></i>
                                ) : (n > 0 && (
                                    item.badgeStyle === 'dot'
                                        ? <span className="menu-item-badge dot" title="Nên xuất báo cáo trước khi sang tháng mới" />
                                        : <span className={`menu-item-badge ${item.badgeStyle || 'reward'}`}>
                                            {n > 99 ? '99+' : n}
                                          </span>
                                ))}
                            </button>
                        );
                    })}
                </nav>

                {/* Footer: đếm ngược mùa giải (ghim đáy sidebar) */}
                <div className="menu-season-row">
                    <SeasonCountdown />
                </div>
            </aside>
        </>
    );
}
