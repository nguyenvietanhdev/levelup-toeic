import { useState, useEffect, useCallback } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { Notification } from '@ui/Toaster.jsx';
import { getToken } from '@/auth/token.js';
import { AuthAPI } from '@api/auth.js';
import { AchievementsAPI } from '@api/achievements.js';
import { Utils } from '@lib/utils.js';
import { Config } from '@game/config.js';
import { GameState } from '@game/state.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { showRewardPopup } from '@ui/RewardPopup.jsx';
import { calculateProgress } from './achievementsProgress.js';

export { calculateProgress };

const CATEGORIES = [
    { key: 'all',      label: 'Tất cả',    icon: 'fa-star' },
    { key: 'learning', label: 'Học tập',   icon: 'fa-book' },
    { key: 'practice', label: 'Luyện tập', icon: 'fa-gamepad' },
    { key: 'social',   label: 'Xã hội',    icon: 'fa-users' },
    { key: 'special',  label: 'Đặc biệt',  icon: 'fa-gem' },
];

// ===================================================================
// CATALOG METRIC THÀNH TÍCH — NGUỒN SỰ THẬT DUY NHẤT
// Admin (backend/public/admin) phải dùng ĐÚNG các `key` này cho
// conditionType. Khoá chuẩn là kebab-case; chấp nhận cả underscore
// và vài alias cũ (normalize bên dưới) để không vỡ data đã seed.
// `needsMode: true` → cần chọn thêm conditionMode (chế độ game).
// ===================================================================
export const ACHIEVEMENT_METRICS = [
    { key: 'words-learned',     label: 'Số từ đã học' },
    { key: 'words-mastered',    label: 'Số từ đã thuộc' },
    { key: 'sessions',          label: 'Số lượt luyện tập (session)' },
    { key: 'games-played',      label: 'Số lượt chơi (game)' },
    { key: 'perfect-rounds',    label: 'Số vòng hoàn hảo' },
    { key: 'correct-answers',   label: 'Tổng số câu trả lời đúng' },
    { key: 'wrong-answers',     label: 'Tổng số câu trả lời sai' },
    { key: 'questions-answered', label: 'Tổng số câu đã trả lời' },
    { key: 'streak',            label: 'Streak hiện tại (ngày)' },
    { key: 'streak-longest',    label: 'Streak dài nhất (ngày)' },
    { key: 'level',             label: 'Cấp độ (level)' },
    { key: 'total-xp',          label: 'Tổng XP tích luỹ' },
    { key: 'coins',             label: 'Số coins đang có' },
    { key: 'gems',              label: 'Số gems đang có' },
    { key: 'highest-score',     label: 'Điểm cao nhất' },
    { key: 'play-time',         label: 'Tổng thời gian luyện (giây)' },
    { key: 'accuracy',          label: 'Độ chính xác (%)' },
    { key: 'mode-plays',        label: 'Số lượt chơi 1 chế độ', needsMode: true },
];


export default function AchievementsScreen({ active }) {
    const { showScreen, syncFromState } = useGame();
    const [achievements, setAchievements] = useState([]);
    const [category, setCategory] = useState('all');
    const [loading, setLoading] = useState(false);
    const [claimingAll, setClaimingAll] = useState(false);

    const loadAchievements = useCallback(async () => {
        setLoading(true);

        const gsAchs = window.GameState?.state?.achievements;
        if (gsAchs?.length > 0) {
            setAchievements([...gsAchs]);
            setLoading(false);
            return;
        }

        if (!getToken()) { setLoading(false); return; }

        const res = await AuthAPI.me();

        if (res.success) {
            const achs = res.data?.achievements
                || res.data?.gameState?.achievements
                || res.data?.user?.achievements
                || [];
            setAchievements(achs);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (active) loadAchievements();
    }, [active, loadAchievements]);

    async function handleClaim(achievementId) {
        const res = await AchievementsAPI.claim(achievementId);
        if (res.success) {
            // Cộng thưởng cục bộ + đánh dấu unlocked để UI đổi NGAY,
            // không phải F5 mới thấy. Backend đã ghi DB rồi.
            const rewards = res.data?.rewards || {};
            GameState.creditServerRewards(rewards);
            const now = new Date().toISOString();
            setAchievements(prev => prev.map(a =>
                (a.id || a._id) === achievementId
                    ? { ...a, unlocked: true, unlockedAt: now }
                    : a
            ));
            const gs = window.GameState?.state?.achievements;
            if (Array.isArray(gs)) {
                const i = gs.findIndex(a => (a.id || a._id) === achievementId);
                if (i >= 0) gs[i] = { ...gs[i], unlocked: true, unlockedAt: now };
            }
            Utils.playSound(Config.sounds.achievement, 0.6, { ignoreSettings: true });
            const ach = achievements.find(a => (a.id || a._id) === achievementId);
            const hasReward = rewards.coins || rewards.xp || rewards.gems || (rewards.items && rewards.items.length);
            if (hasReward) {
                showRewardPopup({ subtitle: ach ? `Mở khoá: ${ach.name}` : undefined, rewards });
            } else {
                Notification.success('Nhận thưởng thành công!');
            }
            EventBus.emit(GameEvents.ACHIEVEMENT_UNLOCKED, { achievementId });
            syncFromState();
        } else {
            Notification.error(res.message || 'Không thể nhận thưởng');
        }
    }

    // Nhận thưởng TẤT CẢ thành tích đã đủ điều kiện (mọi tab). Lặp qua API
    // claim đơn lẻ rồi gộp cập nhật UI 1 lần để tránh re-render/âm thanh dồn dập.
    async function handleClaimAll() {
        const toClaim = achievements.filter(a => {
            if (a.unlocked) return false;
            const { current } = calculateProgress(a);
            return current >= (a.conditionValue || a.target || 1);
        });
        if (toClaim.length === 0 || claimingAll) return;

        setClaimingAll(true);

        // GOM TỔNG thưởng + đánh dấu TẤT CẢ mở khóa → cập nhật giao diện 1 LẦN
        // (thay vì credit + render mỗi thành tích → hết delay nhảy số dồn dập).
        const rewardOf = (a) => ({
            coins: a.rewardCoins || a.reward?.coins || 0,
            xp:    a.rewardXp    || a.reward?.xp    || 0,
            gems:  a.rewardGems  || a.reward?.gems  || 0,
        });
        const total = toClaim.reduce((s, a) => {
            const r = rewardOf(a);
            return { coins: s.coins + r.coins, xp: s.xp + r.xp, gems: s.gems + r.gems };
        }, { coins: 0, xp: 0, gems: 0 });
        const ids = new Set(toClaim.map(a => a.id || a._id));
        const now = new Date().toISOString();

        const markUnlocked = (idSet, unlock) => {
            setAchievements(prev => prev.map(a =>
                idSet.has(a.id || a._id) ? { ...a, unlocked: unlock, unlockedAt: unlock ? now : null } : a
            ));
            const gs = window.GameState?.state?.achievements;
            if (Array.isArray(gs)) gs.forEach((a, i) => {
                if (idSet.has(a.id || a._id)) gs[i] = { ...a, unlocked: unlock, unlockedAt: unlock ? now : null };
            });
        };

        markUnlocked(ids, true);
        GameState.creditServerRewards(total);
        Utils.playSound(Config.sounds.achievement, 0.6, { ignoreSettings: true });
        EventBus.emit(GameEvents.ACHIEVEMENT_UNLOCKED, { bulk: true });
        Notification.success(`Đã nhận thưởng ${toClaim.length} thành tích!`);
        syncFromState();

        // Server chạy NỀN (tuần tự); cái nào lỗi → hoàn tác phần thưởng + khóa lại.
        const failed = [];
        for (const a of toClaim) {
            let ok = false;
            try { ok = !!(await AchievementsAPI.claim(a.id || a._id)).success; } catch { ok = false; }
            if (!ok) failed.push(a);
        }

        if (failed.length > 0) {
            const back = failed.reduce((s, a) => {
                const r = rewardOf(a);
                return { coins: s.coins - r.coins, xp: s.xp - r.xp, gems: s.gems - r.gems };
            }, { coins: 0, xp: 0, gems: 0 });
            GameState.creditServerRewards(back);
            markUnlocked(new Set(failed.map(a => a.id || a._id)), false);
            Notification.error(`${failed.length} thành tích nhận thất bại, đã hoàn lại`);
            syncFromState();
        }
        setClaimingAll(false);
    }

    // Gom các category gốc (learning/practice/streak/skill/speed/social) về
    // 4 tab hiển thị. Mọi category lạ rơi vào "Đặc biệt" để không "tịt".
    const CATEGORY_BUCKETS = {
        learning: 'learning',
        practice: 'practice', speed: 'practice', skill: 'practice',
        social: 'social',
        streak: 'special', special: 'special',
    };
    const bucketOf = (cat) => CATEGORY_BUCKETS[String(cat || '').toLowerCase()] || 'special';
    const filtered = category === 'all'
        ? achievements
        : achievements.filter(a => bucketOf(a.category) === category);
    const unlocked = achievements.filter(a => a.unlocked).length;
    const progressPct = achievements.length > 0 ? Math.round((unlocked / achievements.length) * 100) : 0;
    const claimableCount = achievements.reduce((n, a) => {
        if (a.unlocked) return n;
        const { current } = calculateProgress(a);
        return current >= (a.conditionValue || a.target || 1) ? n + 1 : n;
    }, 0);

    return (
        <div id="achievements-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-medal"></i> Thành tích</h2>
                {achievements.length > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: '0.82em', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', boxShadow: '0 0 6px #f59e0b' }} />
                        <span><strong style={{ color: '#f59e0b' }}>{unlocked}</strong> / {achievements.length} đã mở</span>
                    </span>
                )}
                {claimableCount > 0 && (
                    <button
                        className="btn btn-primary btn-sm"
                        style={{ marginLeft: achievements.length > 0 ? 12 : 'auto', whiteSpace: 'nowrap' }}
                        disabled={claimingAll}
                        onClick={handleClaimAll}
                        title="Nhận thưởng tất cả thành tích đã đạt"
                    >
                        <i className={`fas ${claimingAll ? 'fa-spinner fa-spin' : 'fa-gift'}`}></i> Nhận tất cả ({claimableCount})
                    </button>
                )}
                <button className="icon-btn" title="Làm mới" onClick={loadAchievements}>
                    <i className="fas fa-rotate-right"></i>
                </button>
            </div>
            <div className="achievements-content">

                <div className="achievement-tabs">
                    {(() => {
                        // Đếm thành tích CLAIMABLE (chưa unlock + đã đạt target) theo bucket tab.
                        const claimable = { all: 0, learning: 0, practice: 0, social: 0, special: 0 };
                        for (const a of achievements) {
                            if (a.unlocked) continue;
                            const { current } = calculateProgress(a);
                            if (current < (a.conditionValue || 1)) continue;
                            claimable.all++;
                            const b = bucketOf(a.category);
                            if (claimable[b] !== undefined) claimable[b]++;
                        }
                        return CATEGORIES.map(cat => {
                            const n = claimable[cat.key] || 0;
                            return (
                                <button key={cat.key} className={`achievement-tab ${category === cat.key ? 'active' : ''}`} data-category={cat.key} onClick={() => setCategory(cat.key)}>
                                    <i className={`fas ${cat.icon}`}></i> {cat.label}
                                    {n > 0 && <span className="tab-badge">{n > 99 ? '99+' : n}</span>}
                                </button>
                            );
                        });
                    })()}
                </div>

                <div className="achievements-grid" id="achievements-grid">
                    {loading ? (
                        <div className="loading-state"><i className="fas fa-spinner fa-spin"></i> Đang tải...</div>
                    ) : filtered.length === 0 ? (
                        <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                            <i className="fas fa-trophy" style={{ fontSize: 48, marginBottom: 16, opacity: .3 }}></i>
                            <p>Chưa có thành tích nào trong danh mục này.</p>
                        </div>
                    ) : [...filtered].sort((a, b) => {
                        const rank = x => {
                            if (x.unlocked) return 2;
                            const p = calculateProgress(x);
                            return p.current >= (x.conditionValue || x.target || 1) ? 0 : 1;
                        };
                        return rank(a) - rank(b);
                    }).map((ach, i) => {
                        const isUnlocked = !!ach.unlocked;
                        const prog = calculateProgress(ach);
                        const target = ach.conditionValue || ach.target || 1;
                        const isClaimable = !isUnlocked && prog.current >= target;
                        const iconIsEmoji = ach.icon && ach.icon.length <= 4;
                        // Khi đã mở khoá → hiển thị progress 100% cho đẹp.
                        const displayPct = isUnlocked ? 100 : prog.pct;
                        const displayCur = isUnlocked ? target : prog.current;

                        return (
                            <div key={ach.id || ach._id || i} className={`achievement-card ${isUnlocked ? 'unlocked' : isClaimable ? 'claimable' : 'locked'}`}>
                                <div className="achievement-card-top">
                                    <div className={`achievement-icon ${isUnlocked || isClaimable ? 'gold' : ''}`}>
                                        {iconIsEmoji
                                            ? <span style={{ fontSize: 28 }}>{ach.icon}</span>
                                            : <i className={`fas ${ach.icon || (isUnlocked || isClaimable ? 'fa-trophy' : 'fa-lock')}`}></i>
                                        }
                                    </div>
                                    <div className="achievement-info">
                                        <h4>{ach.name}</h4>
                                        <p>{ach.description}</p>
                                    </div>
                                    {(ach.rewardCoins || ach.rewardXp || ach.rewardGems || ach.reward) && (
                                        <div className="achievement-reward">
                                            {(ach.rewardCoins || ach.reward?.coins) > 0 && <span><i className="fas fa-coins"></i> {ach.rewardCoins || ach.reward?.coins}</span>}
                                            {(ach.rewardXp || ach.reward?.xp) > 0 && <span><i className="fas fa-star"></i> {ach.rewardXp || ach.reward?.xp} XP</span>}
                                            {(ach.rewardGems || ach.reward?.gems) > 0 && <span><i className="fas fa-gem"></i> {ach.rewardGems || ach.reward?.gems}</span>}
                                        </div>
                                    )}
                                </div>
                                <div className="achievement-card-bottom">
                                    <div className="achievement-progress">
                                        <div className="achievement-progress-bar">
                                            <div className="progress-fill" style={{ width: `${displayPct}%` }}></div>
                                        </div>
                                        <span className="achievement-progress-text">{displayCur}/{target}</span>
                                    </div>
                                    {isUnlocked ? (
                                        <span className="achievement-status unlocked-badge"><i className="fas fa-check-circle"></i> Đã mở khoá</span>
                                    ) : isClaimable ? (
                                        <button className="achievement-status btn btn-primary btn-sm" onClick={() => handleClaim(ach.id || ach._id)}>
                                            Nhận thưởng
                                        </button>
                                    ) : (
                                        <span className="achievement-status locked-badge"><i className="fas fa-lock"></i> Chưa mở khoá</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
