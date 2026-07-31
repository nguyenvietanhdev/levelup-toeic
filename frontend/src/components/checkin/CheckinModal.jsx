import { useState, useEffect, useCallback } from 'react';
import { CheckinAPI } from '@api/checkin.js';
import { GameState } from '@game/state.js';
import { useGame } from '@game/GameContext.jsx';
import { Notification } from '@ui/Toaster.jsx';
import { Utils } from '@lib/utils.js';
import { Config } from '@game/config.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { showRewardPopup } from '@ui/RewardPopup.jsx';

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];

const FALLBACK_REWARDS = [
    { day: 1, icon: '🪙', label: '+100 Coins' },
    { day: 2, icon: '⭐', label: '+50 XP' },
    { day: 3, icon: '💎', label: '+5 Gems' },
    { day: 4, icon: '🪙', label: '+250 Coins' },
    { day: 5, icon: '⭐', label: '+150 XP' },
    { day: 6, icon: '💎', label: '+10 Gems' },
    { day: 7, icon: '🎁', label: 'COMBO +500/300/20' },
];

export default function CheckinModal({ open, onClose }) {
    const { syncFromState } = useGame();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadFailed(false);
        const res = await CheckinAPI.get();
        if (res.success) {
            setData(res.data);
        } else {
            setLoadFailed(true);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (open) load();
    }, [open, load]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const claimed = new Set(data?.claimedDays || []);
    const today = data?.currentDay || 0;
    const rewards = data?.rewards?.length ? data.rewards : FALLBACK_REWARDS;

    async function handleClaim() {
        if (busy) return;
        setBusy(true);
        const res = await CheckinAPI.claim();
        if (res.success) {
            // Điểm danh trả THẲNG xu/gem → tiếng xu đúng nghĩa hơn tiếng thành
            // tích (vốn dùng chung một file cho cả nhiệm vụ lẫn thành tích).
            Utils.playSound?.(Config.sounds?.coin, 0.6, { ignoreSettings: true });
            const rw = res.data?.reward || {};
            GameState.creditServerRewards(rw);
            showRewardPopup({
                title: '📅 Điểm danh thành công',
                subtitle: rw.label,
                rewards: {
                    coins: rw.coins || (rw.type === 'coins' ? rw.amount : 0),
                    xp:    rw.xp    || (rw.type === 'xp'    ? rw.amount : 0),
                    gems:  rw.gems  || (rw.type === 'gems'  ? rw.amount : 0),
                    items: rw.items || [],
                },
            });
            syncFromState();
            // Báo cho badge hamburger (useMenuBadges) tính lại — điểm danh hôm
            // nay đã nhận nên +1 "đến hạn điểm danh" phải biến mất.
            EventBus.emit(GameEvents.QUEST_UPDATED, { source: 'checkin' });
            await load();
        } else {
            Notification.error(res.message || 'Không thể điểm danh');
        }
        setBusy(false);
    }

    const canClaimToday = today > 0 && !claimed.has(today);

    return (
        <div className="checkin-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="checkin-modal" role="dialog" aria-label="Điểm danh">
                <div className="checkin-header">
                    <h3><i className="fas fa-calendar-check"></i> Điểm danh hằng tuần</h3>
                    <button className="checkin-close" onClick={onClose}><i className="fas fa-times"></i></button>
                </div>

                <div className="checkin-sub">
                    Đăng nhập mỗi ngày để nhận thưởng. Tuần mới reset vào <b>thứ 2</b>.
                </div>

                {loading ? (
                    <div className="checkin-loading"><i className="fas fa-spinner fa-spin"></i> Đang tải...</div>
                ) : (
                    <>
                        {loadFailed && (
                            <div className="checkin-error-banner">
                                <i className="fas fa-exclamation-circle"></i> Không thể tải dữ liệu.{' '}
                                <button className="checkin-retry-btn" onClick={load}>Thử lại</button>
                            </div>
                        )}

                        <div className={`checkin-grid${loadFailed ? ' checkin-grid--faded' : ''}`}>
                            {rewards.map(r => {
                                const isClaimed = claimed.has(r.day);
                                const isToday = r.day === today;
                                const isPast = r.day < today;
                                const status = isClaimed ? 'claimed'
                                    : isPast ? 'missed'
                                    : isToday ? 'today'
                                    : 'future';
                                return (
                                    <div key={r.day} className={`checkin-card ${status} ${r.day === 7 ? 'big' : ''}`}>
                                        <div className="checkin-day">{DAY_LABELS[r.day - 1]}</div>
                                        <div className="checkin-icon">{r.icon}</div>
                                        <div className="checkin-label">{r.label}</div>
                                        <div className="checkin-status">
                                            {isClaimed && <span><i className="fas fa-check-circle"></i> Đã nhận</span>}
                                            {!isClaimed && isPast && <span className="missed-text">Đã bỏ lỡ</span>}
                                            {isToday && !isClaimed && <span className="today-text">Hôm nay</span>}
                                            {!isClaimed && !isPast && !isToday && <span className="future-text">Chưa tới</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="checkin-footer">
                            <button
                                className="checkin-claim-btn"
                                onClick={handleClaim}
                                disabled={!canClaimToday || busy || loadFailed}
                            >
                                {loadFailed
                                    ? <><i className="fas fa-wifi"></i> Lỗi kết nối</>
                                    : canClaimToday
                                        ? <><i className="fas fa-gift"></i> Nhận thưởng hôm nay</>
                                        : claimed.has(today)
                                            ? <><i className="fas fa-check"></i> Đã điểm danh hôm nay</>
                                            : 'Chưa đến ngày'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
