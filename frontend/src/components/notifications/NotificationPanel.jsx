import { useState, useEffect, useMemo } from 'react';
import { useNotifications } from './useNotifications.js';
import { NotificationsAPI } from '@api/notifications.js';
import { GameState } from '@game/state.js';
import { useGame } from '@game/GameContext.jsx';
import { Notification as Toast } from '@ui/Toaster.jsx';
import { showRewardPopup } from '@ui/RewardPopup.jsx';
import ItemThumb from '@ui/ItemThumb.jsx';

const TABS = [
    { key: 'all',         label: 'Tất cả',    icon: 'fa-list' },
    { key: 'system',      label: 'Hệ thống',  icon: 'fa-cog' },
    { key: 'achievement', label: 'Tài khoản', icon: 'fa-user' },
    { key: 'violation',   label: 'Vi phạm',   icon: 'fa-shield-alt' },
];

function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d)) return '';
    return d.toLocaleString('vi-VN', {
        hour: '2-digit', minute: '2-digit',
        day: '2-digit', month: '2-digit', year: 'numeric',
    });
}

/** Số ngày còn lại đến lúc auto-xoá (TTL). null nếu không có expiresAt
 * hoặc đã quá hạn. */
function daysLeft(ts) {
    if (!ts) return null;
    const ms = new Date(ts).getTime() - Date.now();
    if (!isFinite(ms) || ms <= 0) return null;
    return Math.ceil(ms / 86400000);
}

export default function NotificationPanel({ isLoggedIn }) {
    const { badge, items, tab, loading, unreadByTab, seenIds, fetchItems, loadBadge, changeTab, markAllRead, deleteAll, deleteOne, markRead, setBadge } = useNotifications(isLoggedIn);
    const { syncFromState } = useGame();
    const [open, setOpen] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [claimingGift, setClaimingGift] = useState(false);
    const [claimingAll, setClaimingAll] = useState(false);

    // ESC để đóng
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    // Tự chọn item đầu tiên khi mở/đổi tab
    useEffect(() => {
        if (!open || items.length === 0) return;
        const stillExists = items.some(n => (n._id || n.id) === selectedId);
        if (!stillExists) setSelectedId(items[0]._id || items[0].id);
    }, [open, items, selectedId]);

    async function handleClaimGift(id) {
        if (claimingGift) return;
        setClaimingGift(true);
        const res = await NotificationsAPI.claimGift(id);
        setClaimingGift(false);
        if (res.success) {
            const { coins = 0, gems = 0, xp = 0, items = [] } = res.reward || {};
            GameState.creditServerRewards({ coins, gems, xp });
            syncFromState();
            window.Utils?.playSound?.(window.Config?.sounds?.reward || 'assets/sounds/achieve.mp3', 0.8);
            showRewardPopup({ subtitle: 'Quà tặng từ hệ thống', rewards: { coins, gems, xp, items } });
            await loadBadge();
        } else {
            Toast.error(res.message || 'Không thể nhận quà');
        }
    }

    async function handleMarkAllRead() {
        if (claimingAll) return;
        setClaimingAll(true);

        const unclaimed = items.filter(n => {
            const g = n.gift;
            return g && (g.coins || g.gems || g.xp || (g.items && g.items.length)) && !n.giftClaimed;
        });

        if (unclaimed.length > 0) {
            const results = await Promise.allSettled(
                unclaimed.map(n => NotificationsAPI.claimGift(n._id || n.id))
            );
            let totalCoins = 0, totalGems = 0, totalXp = 0;
            for (const r of results) {
                if (r.status === 'fulfilled' && r.value?.success) {
                    const { coins = 0, gems = 0, xp = 0 } = r.value.reward || {};
                    totalCoins += coins; totalGems += gems; totalXp += xp;
                }
            }
            if (totalCoins || totalGems || totalXp) {
                GameState.creditServerRewards({ coins: totalCoins, gems: totalGems, xp: totalXp });
                syncFromState();
                window.Utils?.playSound?.(window.Config?.sounds?.reward || 'assets/sounds/achieve.mp3', 0.8);
                Toast.success(`Đã nhận tất cả: ${[totalCoins && `+${totalCoins} Coins`, totalGems && `+${totalGems} Gems`, totalXp && `+${totalXp} XP`].filter(Boolean).join(', ')}`);
            }
        }

        await markAllRead();
        await loadBadge();
        setClaimingAll(false);
    }

    async function handleBellClick() {
        if (!open) {
            // Mở panel → refresh list nhưng KHÔNG xoá badge ngay — badge giờ
            // bám unreadByTab.all, chỉ giảm khi user thực sự click vào card
            // (markRead) hoặc bấm "đánh dấu đã đọc tất cả".
            await fetchItems(tab);
        }
        setOpen(o => !o);
    }

    const selected = useMemo(
        () => items.find(n => (n._id || n.id) === selectedId),
        [items, selectedId],
    );

    const unclaimedGiftCount = useMemo(
        () => items.filter(n => {
            const g = n.gift;
            return g && (g.coins || g.gems || g.xp || (g.items && g.items.length)) && !n.giftClaimed;
        }).length,
        [items],
    );

    return (
        <>
            <button id="notif-btn" className="icon-btn" title="Thông báo" onClick={handleBellClick}>
                <i className="fas fa-bell"></i>
                {unclaimedGiftCount > 0
                    ? <span id="notif-badge" className="notif-badge">{unclaimedGiftCount}</span>
                    : badge > 0
                    ? <span id="notif-badge" className="notif-badge notif-badge-dot" />
                    : null
                }
            </button>

            {open && (
                <div
                    className="notif-overlay"
                    onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
                >
                    <div className="notif-modal" role="dialog" aria-label="Thông báo">
                        <div className="notif-modal-header">
                            <h3><i className="fas fa-envelope-open-text"></i> Thông báo</h3>
                            {/* Đếm notif CÁ NHÂN (không gồm broadcast hệ thống).
                                Cap = 50 newest theo backend limit. Đặt sát X. */}
                            <span className="notif-count">
                                {items.filter(n => !n.isGlobal).length}/50
                            </span>
                            <button className="icon-btn" title="Làm mới" onClick={() => fetchItems(tab)}>
                                <i className="fas fa-rotate-right"></i>
                            </button>
                            <button className="notif-modal-close" onClick={() => setOpen(false)} title="Đóng (Esc)">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="notif-modal-body">
                            {/* LEFT — Detail */}
                            <div className="notif-detail">
                                {selected ? (
                                    <>
                                        <div className="notif-detail-header">
                                            <h4>{selected.title || '(Không có tiêu đề)'}</h4>
                                            <span className="notif-detail-time">{fmtTime(selected.createdAt)}</span>
                                        </div>
                                        {selected.type && (
                                            <span className={`notif-type-badge type-${selected.type}`}>
                                                {selected.type}
                                            </span>
                                        )}
                                        <div className="notif-detail-body">
                                            {selected.message || selected.body || '(Không có nội dung)'}
                                        </div>
                                        {(() => {
                                            const g = selected.gift;
                                            const gItems = (g && Array.isArray(g.items)) ? g.items : [];
                                            if (!g || (!g.coins && !g.gems && !g.xp && !gItems.length)) return null;
                                            return (
                                                <div className="notif-gift-box">
                                                    <div className="notif-gift-label">
                                                        <i className="fas fa-gift"></i> Phần thưởng
                                                        {selected.giftClaimed && <span className="notif-gift-claimed"><i className="fas fa-check-circle"></i> Đã nhận</span>}
                                                    </div>
                                                    <div className="notif-gift-rewards">
                                                        {g.coins > 0 && <span className="notif-gift-item"><i className="fas fa-coins"></i> {g.coins}</span>}
                                                        {g.gems  > 0 && <span className="notif-gift-item"><i className="fas fa-gem"></i> {g.gems}</span>}
                                                        {g.xp    > 0 && <span className="notif-gift-item"><i className="fas fa-star"></i> {g.xp} XP</span>}
                                                        {gItems.map((it, i) => (
                                                            <span key={i} className="gift-slot" title={it.name}>
                                                                <span className="gift-slot-box">
                                                                    <ItemThumb image={it.image} imgClassName="gift-slot-img">
                                                                        {it.icon && it.icon.startsWith('fa-') ? <i className={`fas ${it.icon}`}></i> : <span>{it.icon || '🎁'}</span>}
                                                                    </ItemThumb>
                                                                    {it.quantity > 1 && <span className="gift-slot-count">×{it.quantity}</span>}
                                                                </span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        <div className="notif-detail-actions">
                                            <button
                                                className="btn btn-danger btn-sm"
                                                onClick={async () => {
                                                    if (!window.confirm('Xoá thông báo này?')) return;
                                                    await deleteOne(selected._id || selected.id);
                                                    setSelectedId(null);
                                                }}
                                            >
                                                <i className="fas fa-trash"></i> Xoá
                                            </button>
                                            {(() => {
                                                const g = selected.gift;
                                                if (!g || (!g.coins && !g.gems && !g.xp && !(g.items && g.items.length)) || selected.giftClaimed) return null;
                                                return (
                                                    <button
                                                        className="btn btn-primary btn-sm"
                                                        disabled={claimingGift}
                                                        onClick={() => handleClaimGift(selected._id || selected.id)}
                                                    >
                                                        {claimingGift ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-gift"></i>} Nhận thưởng
                                                    </button>
                                                );
                                            })()}
                                        </div>
                                    </>
                                ) : (
                                    <div className="notif-empty-detail">
                                        <i className="fas fa-inbox"></i>
                                        <p>Chọn một thông báo bên phải để xem chi tiết</p>
                                    </div>
                                )}
                            </div>

                            {/* MIDDLE — List */}
                            <div className="notif-list-col">
                                {loading ? (
                                    <div className="notif-loading">
                                        <i className="fas fa-spinner fa-spin"></i> Đang tải...
                                    </div>
                                ) : items.length === 0 ? (
                                    <div className="notif-empty">Không có thông báo nào</div>
                                ) : (
                                    items.map((n, i) => {
                                        const id = n._id || n.id || i;
                                        const sid = String(id);
                                        const isSel = id === selectedId;
                                        // Broadcast (isGlobal) đọc track qua localStorage seenIds;
                                        // personal đọc theo n.read trên server.
                                        const isUnread = n.isGlobal ? !seenIds.has(sid) : !n.read;
                                        return (
                                            <div
                                                key={id}
                                                className={`notif-card ${isUnread ? 'unread' : 'read'} ${isSel ? 'selected' : ''}`}
                                                onClick={() => { setSelectedId(id); if (isUnread) markRead(id); }}
                                            >
                                                {/* Chấm đỏ ở GÓC TRÊN PHẢI báo chưa đọc — kiểu game */}
                                                {isUnread && <span className="notif-card-unread-pip" />}
                                                <div className="notif-card-row">
                                                    <span className="notif-card-title">{n.title}</span>
                                                </div>
                                                <div className="notif-card-time">
                                                    {fmtTime(n.createdAt)}
                                                    {(() => {
                                                        const d = daysLeft(n.expiresAt);
                                                        return d != null ? <span className="notif-card-ttl"> · còn {d} ngày</span> : null;
                                                    })()}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* RIGHT — Sidebar categories */}
                            <div className="notif-sidebar">
                                {TABS.map(t => {
                                    const n = unreadByTab?.[t.key] || 0;
                                    return (
                                        <button
                                            key={t.key}
                                            className={`notif-side-tab ${tab === t.key ? 'active' : ''}`}
                                            onClick={() => changeTab(t.key)}
                                        >
                                            <i className={`fas ${t.icon}`}></i>
                                            <span>{t.label}</span>
                                            {n > 0 && <span className="notif-side-pip" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="notif-modal-footer">
                            <button
                                className="btn btn-danger"
                                onClick={async () => {
                                    if (!window.confirm('Xoá toàn bộ thông báo? Không thể hoàn tác.')) return;
                                    await deleteAll();
                                    setSelectedId(null);
                                }}
                                disabled={items.length === 0}
                            >
                                <i className="fas fa-trash"></i> Xoá tất cả
                            </button>
                            <button className="btn btn-primary" onClick={handleMarkAllRead} disabled={claimingAll}>
                                {claimingAll
                                    ? <><i className="fas fa-spinner fa-spin"></i> Đang nhận...</>
                                    : <><i className="fas fa-check-double"></i> {unclaimedGiftCount > 0 ? `Nhận thưởng & đánh dấu đã đọc` : `Đánh dấu đã đọc tất cả`}</>
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
