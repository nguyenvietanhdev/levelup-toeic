import { useEffect, useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { useMenuBadges } from './useMenuBadges.js';
import SeasonCountdown from '@components/season/SeasonCountdown.jsx';
import QuickSettings from './QuickSettings.jsx';
import { loadUnlocks, lockInfo } from '@game/featureUnlocks.js';
import { Notification } from '@ui/Toaster.jsx';

// `feature` = key trong FeatureUnlock → khoá theo Level (Hồ sơ/Cài đặt luôn mở).
//
// Menu chia NHÓM có tiêu đề, không phải danh sách phẳng. 13 mục xếp phẳng thì
// người dùng phải đọc hết từ trên xuống mới thấy cái mình cần; tiêu đề nhóm cho
// mắt nhảy thẳng tới đúng vùng.
//
// Nhóm bằng TIÊU ĐỀ chứ không bằng tab bung/thu: nhóm thu lại giấu mục đi, và
// thứ bị giấu sau một cú bấm là thứ người ta quên mất là có. Tiêu đề chỉ tốn
// ~22px mỗi nhóm mà mọi mục vẫn nhìn thấy và vẫn bấm một lần là tới.
const MENU_GROUPS = [
    {
        title: 'Luyện tập',
        items: [
            { label: 'Luyện đề test TOEIC', icon: 'fa-graduation-cap', screen: 'toeic-screen', hot: true, feature: 'feature:toeic' },
        ],
    },
    {
        // Hai chế độ này gọi AI có phí và tốn năng lượng, khác hẳn những chế độ
        // bấm-là-chơi. Gom lại để thấy rõ chúng cùng một loại — và để người dùng
        // biết trước là chúng "đắt" hơn.
        title: 'Luyện với AI',
        items: [
            { label: 'Hội thoại', icon: 'fa-comments', screen: 'conversation-screen', feature: 'feature:conversation' },
            { label: 'Luyện viết luận', icon: 'fa-pen-nib', screen: 'essay-screen', feature: 'feature:essay' },
        ],
    },
    {
        title: 'Tiến độ',
        items: [
            { label: 'Nhiệm vụ', icon: 'fa-tasks', screen: 'quest-screen', badgeKey: 'quest', feature: 'feature:quest' },
            { label: 'Bảng xếp hạng', icon: 'fa-trophy', screen: 'leaderboard-screen', badgeKey: 'online', badgeStyle: 'info', feature: 'feature:leaderboard' },
            { label: 'Thành tích', icon: 'fa-medal', screen: 'achievements-screen', badgeKey: 'achievement', feature: 'feature:achievements' },
            { label: 'Thống kê', icon: 'fa-chart-bar', screen: 'statistics-screen', badgeKey: 'statsExport', badgeStyle: 'dot', feature: 'feature:stats' },
        ],
    },
    {
        title: 'Kho đồ',
        items: [
            { label: 'Cửa hàng', icon: 'fa-shopping-cart', screen: 'shop-screen', badgeKey: 'shopDiscount', badgeStyle: 'sale', feature: 'feature:shop' },
            // KHÔNG khoá theo level (không có `feature:`): nhiệm vụ và thành tích phát
            // vật phẩm ngay từ level 1, khoá túi đồ là người mới có đồ mà không có chỗ dùng.
            { label: 'Túi đồ', icon: 'fa-briefcase', screen: 'inventory-screen' },
            // MÀN HÌNH riêng, không phải popup: nó có 5 tab và người dùng ở lại lâu
            // (thêm từ · dán JSON · quản lý · chia sẻ · duyệt bộ được chia sẻ) — đó là
            // một nơi để ĐẾN, không phải hộp thoại làm nhanh rồi đóng.
            { label: 'Từ vựng riêng', icon: 'fa-cloud-upload-alt', screen: 'vocab-screen', feature: 'feature:upload-vocab' },
        ],
    },
    {
        title: 'Tài khoản',
        items: [
            { label: 'Hồ sơ', icon: 'fa-user', screen: 'profile-screen' },
            { label: 'Cài đặt', icon: 'fa-cog', screen: 'settings-screen' },
        ],
    },
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
                            // Chỉ ICON, không chữ: mũi tên-ra-khỏi-cửa là ký hiệu ai
                            // cũng đọc được, bỏ chữ thì header còn chỗ. `title` +
                            // `aria-label` giữ nghĩa cho hover và trình đọc màn hình.
                            <button id="logout-menu-btn" className="menu-auth-btn logout logout-icon-only"
                                onClick={logout} title="Đăng xuất" aria-label="Đăng xuất">
                                <i className="fas fa-sign-out-alt"></i>
                            </button>
                        )}
                    </div>
                    <button id="close-menu-btn" className="icon-btn" onClick={() => setMenuOpen(false)}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {/* Nav — matches .menu-nav in CSS */}
                <nav className="menu-nav">
                    {MENU_GROUPS.map(group => (
                        <div key={group.title} className="menu-group">
                            {/* `aria-hidden`: tiêu đề là gợi ý THỊ GIÁC để mắt nhảy
                                nhanh. Trình đọc màn hình đã đọc nhãn đầy đủ của
                                từng nút rồi, chèn thêm tiêu đề vào luồng đọc chỉ
                                làm dài thêm mà không thêm thông tin. */}
                            <div className="menu-group-title" aria-hidden="true">{group.title}</div>
                            {group.items.map(item => {
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
                        </div>
                    ))}
                </nav>

                {/* Số câu / độ khó / ngôn ngữ — CHỈ hiện trên điện thoại
                    (responsive.css). Trên máy tính chúng ở thanh trạng thái;
                    trên màn hẹp thanh đó không đủ chỗ, mà menu thì thừa. */}
                <div className="menu-quick-settings-wrap">
                    <QuickSettings variant="menu" />
                </div>

                {/* Footer: đếm ngược mùa giải (ghim đáy sidebar) */}
                <div className="menu-season-row">
                    <SeasonCountdown />
                </div>
            </aside>
        </>
    );
}
