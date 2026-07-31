import { Modal } from '@ui/Modal.jsx';
import ItemThumb from '@ui/ItemThumb.jsx';

// Popup "nhận thưởng" dùng chung: tiền tệ (xp/coins/gems) + vật phẩm (icon/ảnh + số lượng).
// rewards: { coins, xp, gems, items: [{ itemId, quantity, name, icon, image }] }
function RewardContent({ subtitle, rewards }) {
    const r = rewards || {};
    const chips = [];
    if (r.xp) chips.push({ k: 'xp', icon: '⭐', text: `+${r.xp} XP`, color: '#06b6d4' });
    if (r.coins) chips.push({ k: 'coins', icon: '🪙', text: `+${r.coins}`, color: '#f59e0b' });
    if (r.gems) chips.push({ k: 'gems', icon: '💎', text: `+${r.gems}`, color: '#a855f7' });
    const items = Array.isArray(r.items) ? r.items : [];

    return (
        <div style={{ textAlign: 'center', padding: '4px 0' }}>
            {subtitle && <div style={{ color: 'var(--text-secondary)', fontSize: '0.9em', marginBottom: 12 }}>{subtitle}</div>}
            {chips.length > 0 && (
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: items.length ? 16 : 0 }}>
                    {chips.map(c => (
                        <span key={c.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: 'var(--bg-secondary)', fontWeight: 700, color: c.color }}>
                            <span>{c.icon}</span>{c.text}
                        </span>
                    ))}
                </div>
            )}
            {items.length > 0 && (
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {items.map((it, i) => {
                        const iconNode = it.icon && it.icon.startsWith('fa-')
                            ? <i className={`fas ${it.icon}`}></i>
                            : <span>{it.icon || '🎁'}</span>;
                        return (
                            <span key={i} className="gift-slot" title={it.name}>
                                <span className="gift-slot-box">
                                    <ItemThumb image={it.image} imgClassName="gift-slot-img">{iconNode}</ItemThumb>
                                    {it.quantity > 1 && <span className="gift-slot-count">×{it.quantity}</span>}
                                </span>
                                {it.name && <span className="gift-slot-name">{it.name}</span>}
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export function showRewardPopup({ title = '🎉 Nhận thưởng', subtitle, rewards }) {
    Modal.show({
        title,
        contentJsx: <RewardContent subtitle={subtitle} rewards={rewards} />,
        buttons: [{ text: 'Tuyệt vời!', className: 'btn-primary' }],
    });
}
