import { useEffect, lazy, Suspense } from 'react';
import { GameProvider, useGame } from '@game/GameContext.jsx';
import { AuthProvider, useAuth } from '@components/auth/AuthContext.jsx';
import { applyUiTheme, applySavedColorTheme } from '@/services/theme.js';
import { InventoryAPI } from '@api/inventory.js';
import { registerFrameCosmetics } from '@game/frames.js';
import { registerBackgroundCosmetics } from '@game/backgrounds.js';
import { loadUnlocks } from '@game/featureUnlocks.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { GameState } from '@game/state.js';
import { STORAGE_KEYS } from '@/constants/storageKeys.js';
import './assets/styles/index.css';

import LoadingScreen from '@ui/LoadingScreen.jsx';
import ErrorBoundary from '@ui/ErrorBoundary.jsx';
import TopNav from '@layouts/TopNav.jsx';
import StatusBar from '@layouts/StatusBar.jsx';
import SideMenu from '@layouts/SideMenu.jsx';
import Modal, { Modal as UIModal } from '@ui/Modal.jsx';
import Toaster, { Notification } from '@ui/Toaster.jsx';
import SearchResults from '@components/search/SearchResults.jsx';
import AuthModal from '@components/auth/AuthModal.jsx';
import ExpiryNotice from '@components/vocab/upload/ExpiryNotice.jsx';
import { playSfx, initUiClickSound } from '@game/uiSounds.js';

// Eager: Home (mặc định) + Practice (engine vanilla inject vào #practice-content,
// phải mount thường trực — không được unmount giữa chừng).
import HomeScreen from '@components/home/HomeScreen.jsx';
import PracticeScreen from '@components/practice/PracticeScreen.jsx';

// Lazy: các màn còn lại tách chunk riêng, chỉ tải khi mở. Chúng tự nạp lại dữ
// liệu khi mount (useEffect theo `active`) nên unmount khi rời màn là an toàn.
const ShopScreen         = lazy(() => import('@components/shop/ShopScreen.jsx'));
const QuestScreen        = lazy(() => import('@components/quest/QuestScreen.jsx'));
const LeaderboardScreen  = lazy(() => import('@components/leaderboard/LeaderboardScreen.jsx'));
const ProfileScreen      = lazy(() => import('@components/profile/ProfileScreen.jsx'));
const AchievementsScreen = lazy(() => import('@components/achievements/AchievementsScreen.jsx'));
const StatisticsScreen   = lazy(() => import('@components/statistics/StatisticsScreen.jsx'));
const SettingsScreen     = lazy(() => import('@components/settings/SettingsScreen.jsx'));
const ToeicScreen        = lazy(() => import('@components/toeic/ToeicScreen.jsx'));
const ToeicResultScreen  = lazy(() => import('@components/toeic/results/ToeicResultScreen.jsx'));
const InventoryScreen    = lazy(() => import('@components/inventory/InventoryScreen.jsx'));

// Bản đồ màn lazy → render có điều kiện (chỉ mount màn đang mở).
const LAZY_SCREENS = {
    'shop-screen': ShopScreen,
    'inventory-screen': InventoryScreen,
    'quest-screen': QuestScreen,
    'leaderboard-screen': LeaderboardScreen,
    'profile-screen': ProfileScreen,
    'achievements-screen': AchievementsScreen,
    'statistics-screen': StatisticsScreen,
    'settings-screen': SettingsScreen,
    'toeic-screen': ToeicScreen,
    'toeic-result-screen': ToeicResultScreen,
};

function ScreenFallback() {
    return (
        <div className="loading-state" style={{ textAlign: 'center', padding: 60 }}>
            <i className="fas fa-spinner fa-spin fa-2x"></i>
        </div>
    );
}

function AppInner() {
    const { initialized, currentScreen } = useGame();
    const { validateToken, isServerSynced } = useAuth();

    useEffect(() => {
        // Tách chunk riêng, chỉ tải khi bật cờ ?debug=leaks / localStorage.debugLeaks
        if (location.search.includes('debug=leaks') || localStorage.getItem('debugLeaks') === '1') {
            import('@lib/leakMonitor.js').then(m => m.startLeakMonitor());
        }
        const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'light';
        applyUiTheme(savedTheme);
        applySavedColorTheme();
        // Nạp cosmetic khung/nền do admin định nghĩa (ảnh/CSS) từ catalog → FRAMES/BACKGROUNDS.
        InventoryAPI.items().then(res => {
            const items = res?.data || [];
            registerFrameCosmetics(items);
            registerBackgroundCosmetics(items);
        }).catch(() => {});
    }, []);

    // Tiếng bấm nút — một listener ở document, không rắc onClick khắp nơi.
    useEffect(() => initUiClickSound(), []);

    // Lên cấp → nạp lại mốc & báo những gì vừa mở khoá.
    useEffect(() => {
        const onLevelUp = async ({ level }) => {
            // Phát TRƯỚC mọi nhánh return: lên cấp mà không mở khoá gì thì hàm
            // dưới thoát sớm, đặt tiếng ở đó là level nào cũng im.
            playSfx('levelUp', 0.7);

            const data = await loadUnlocks(true).catch(() => null);
            const just = (data?.unlocks || []).filter(u => u.requiredLevel === level);
            if (just.length === 0) return;

            const lines = just.map(u => `${u.icon || '🔓'} ${u.label}`).join(' · ');
            // Đang luyện tập → chỉ toast, không chen popup giữa bài.
            if (GameState.state?.session?.currentScreen === 'practice-screen') {
                Notification.show({
                    type: 'success',
                    title: `🎉 Level ${level} — Mở khoá mới!`,
                    message: lines,
                    duration: 5000,
                });
                return;
            }
            UIModal.show({
                title: `🎉 Level ${level} — Mở khoá mới!`,
                content: `
                    <div style="text-align:center;padding:6px 0">
                        <div style="font-size:44px;margin-bottom:10px">🔓</div>
                        <p style="margin:0 0 14px;color:var(--text-secondary)">Bạn vừa mở khoá:</p>
                        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
                            ${just.map(u => `
                                <span style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;
                                             background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.35);
                                             color:#fbbf24;font-weight:700;font-size:13px">
                                    ${u.icon || '🔓'} ${u.label}
                                </span>`).join('')}
                        </div>
                    </div>`,
                buttons: [{ text: 'Tuyệt vời!', className: 'btn-primary' }],
            });
        };
        const unsub = EventBus.on(GameEvents.USER_LEVEL_UP, onLevelUp);
        return () => unsub?.();
    }, []);

    useEffect(() => {
        if (initialized) {
            validateToken();
            // User id is known after init — re-apply in case the saved
            // theme is stored under the per-user key.
            applySavedColorTheme();
        }
    }, [initialized, validateToken]);

    if (!initialized || !isServerSynced) {
        return <LoadingScreen />;
    }

    return (
        <div id="game-container" className="game-container">
            <TopNav />
            <StatusBar />

            <main id="main-content" className="main-content">
                {/* Luôn mount: Home + Practice */}
                <HomeScreen active={currentScreen === 'home-screen'} />
                <PracticeScreen active={currentScreen === 'practice-screen'} />
                {/* Lazy: chỉ mount màn đang mở */}
                {LAZY_SCREENS[currentScreen] && (
                    <Suspense fallback={<ScreenFallback />}>
                        {(() => {
                            const ActiveScreen = LAZY_SCREENS[currentScreen];
                            return <ActiveScreen active={true} />;
                        })()}
                    </Suspense>
                )}
            </main>

            <SideMenu />
            <Modal />
            <Toaster />
            <SearchResults />
            <AuthModal />
            <ExpiryNotice />
        </div>
    );
}

export default function App() {
    return (
        <ErrorBoundary>
            <GameProvider>
                <AuthProvider>
                    <AppInner />
                </AuthProvider>
            </GameProvider>
        </ErrorBoundary>
    );
}
