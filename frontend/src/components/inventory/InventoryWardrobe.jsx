import { useState, useEffect, useMemo } from 'react';
import { GameState } from '@game/state.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { InventoryAPI } from '@api/inventory.js';
import { BACKGROUNDS, bgStyle } from '@game/backgrounds.js';
import { useCosmetics } from '@game/cosmeticsStore.js';
import { FRAMES, frameStyle, frameOverlayUrl } from '@game/frames.js';
import ItemThumb from '@ui/ItemThumb.jsx';
import { Notification } from '@ui/Toaster.jsx';
import { Modal } from '@ui/Modal.jsx';

const CATS = [
    { key: 'active', label: 'Đang hiệu lực', icon: 'fa-fire' },
    { key: 'consumable', label: 'Tiêu hao', icon: 'fa-flask' },
    { key: 'boost', label: 'Thẻ tăng tốc', icon: 'fa-bolt' },
    { key: 'cosmetic', label: 'Trang bị', icon: 'fa-shirt' },
];

// Thời gian còn lại tới khi hết hạn (vd nền VIP). null nếu vĩnh viễn.
function fmtLeft(exp) {
    if (!exp) return null;
    const ms = new Date(exp).getTime() - Date.now();
    if (ms <= 0) return 'Hết hạn';
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return d > 0 ? `${d} ngày ${h}h` : (h > 0 ? `${h}h ${m}m` : `${m}m`);
}

const CONSUMABLE_META = {
    hint: { name: 'Gợi ý', icon: 'fa-lightbulb', color: '#f59e0b', desc: 'Dùng khi luyện tập', field: 'hints' },
    shield: { name: 'Khiên bảo vệ streak', icon: 'fa-shield-halved', color: '#3b82f6', desc: 'Giữ streak khi nghỉ 1 ngày', field: 'shields' },
    'time-freeze': { name: 'Dừng thời gian', icon: 'fa-snowflake', color: '#06b6d4', desc: 'Tạm dừng đồng hồ câu hỏi', field: 'timeFreezes' },
};

export default function InventoryWardrobe() {
    const cosmeticsVersion = useCosmetics(); // vẽ lại khi ảnh nền/khung nạp xong
    const [cat, setCat] = useState('active');
    const [inv, setInv] = useState([]);
    const [equipped, setEquipped] = useState({});
    const [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState(false);
    const [defMap, setDefMap] = useState({}); // itemId → catalog def (lấy ảnh/icon/tên)

    const reload = async () => {
        const res = await InventoryAPI.get();
        setInv(res.data || []);
        setEquipped(res.equipped || GameState.state?.equipped || {});
    };
    useEffect(() => { reload(); }, []);
    // Catalog để hint/shield/time-freeze (từ UserStats, không có definition) lấy được ảnh.
    useEffect(() => {
        InventoryAPI.items().then(res => {
            const map = {};
            (res.data || []).forEach(d => { map[d.itemId] = d; });
            setDefMap(map);
        });
    }, []);

    const r = GameState.state?.resources || {};
    const b = GameState.state?.boosts || {};
    const now = Date.now();
    const boostLeft = (x) => {
        if (!x?.active || !x.expiresAt) return null;
        const ms = new Date(x.expiresAt).getTime() - now;
        if (ms <= 0) return null;
        const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    /**
     * Ảnh của thẻ đã sinh ra hiệu ứng đang chạy. Boost đọc từ UserStats nên chỉ
     * biết (loại, hệ số) — dò ngược catalog để tab "Đang hiệu lực" dùng đúng ảnh
     * thẻ thay vì icon chữ, khớp với ảnh ở tab "Thẻ tăng tốc".
     */
    const boostImage = (boostType, multiplier) => {
        const hit = Object.values(defMap).find(d =>
            d?.effect?.type === 'boost'
            && d.effect.boostType === boostType
            && Number(d.effect.multiplier) === Number(multiplier)
            && d.image,
        );
        return hit?.image || '';
    };

    /**
     * Thẻ này có đang bị hiệu ứng mạnh hơn CÙNG LOẠI chặn không → trả lý do.
     * Chỉ để báo trước cho người chơi; quyết định thật vẫn ở server
     * (boostBlockReason trong services/shopEffects.js).
     */
    const boostBlockedBy = (effect) => {
        if (effect?.type !== 'boost') return null;
        const cur = b[effect.boostType];
        if (!cur?.active || !cur.expiresAt || new Date(cur.expiresAt).getTime() <= now) return null;
        const curMult = Math.max(1, cur.multiplier || 1);
        return (Number(effect.multiplier) || 1) < curMult
            ? `Đang chạy x${curMult} mạnh hơn — chờ hết hạn rồi dùng`
            : null;
    };

    // Item của tab đang chọn (định dạng thống nhất cho lưới).
    const items = useMemo(() => {
        if (cat === 'cosmetic') {
            return inv
                .filter(i => String(i.definition?.type || '').startsWith('cosmetic'))
                .map(i => ({
                    id: i.itemId,
                    kind: 'cosmetic',
                    name: BACKGROUNDS[i.itemId]?.label || FRAMES[i.itemId]?.label || i.definition?.name || i.itemId,
                    bg: BACKGROUNDS[i.itemId] || null,
                    frame: FRAMES[i.itemId] || null,
                    avatar: i.definition?.type === 'cosmetic_avatar',
                    image: i.definition?.image || '', // ảnh avatar từ DB (admin sửa được)
                    slot: i.definition?.effect?.slot || 'background',
                    equipped: equipped[i.definition?.effect?.slot || 'background'] === i.itemId,
                    rarity: i.definition?.rarity,
                    expiresAt: i.expiresAt || null,
                    left: fmtLeft(i.expiresAt),
                }));
        }
        if (cat === 'consumable') {
            // Từ UserStats (hint/shield/timeFreeze) — lấy ảnh/icon/tên từ catalog nếu có.
            const fromStats = Object.entries(CONSUMABLE_META).map(([id, m]) => {
                const d = defMap[id] || {};
                return {
                    id, kind: 'consumable',
                    name: d.name || m.name,
                    icon: d.icon || m.icon,
                    image: d.image || '',
                    color: m.color,
                    desc: d.description || m.desc,
                    count: r[m.field] || 0,
                };
            }).filter(x => x.count > 0);
            // Từ inventory (vd vé quay) — các consumable không nằm trong UserStats
            const known = new Set(Object.keys(CONSUMABLE_META));
            const fromInv = inv
                .filter(i => i.definition?.type === 'consumable' && !known.has(i.itemId) && i.quantity > 0)
                .map(i => ({
                    id: i.itemId, kind: 'consumable', name: i.definition.name,
                    icon: i.definition.icon || 'fa-cube', image: i.definition.image || '', color: '#8b5cf6',
                    desc: i.definition.description, count: i.quantity,
                }));
            return [...fromStats, ...fromInv];
        }
        // Thẻ tăng tốc — thẻ boost SỞ HỮU (on_use), kích hoạt được.
        if (cat === 'boost') {
            return inv
                .filter(i => i.definition?.type === 'boost' && i.quantity > 0)
                .map(i => ({
                    id: i.itemId, kind: 'boost-card', name: i.definition.name,
                    icon: i.definition.icon || 'fa-bolt', image: i.definition.image || '', color: '#8b5cf6',
                    desc: i.definition.description, count: i.quantity,
                    // Cùng loại boost chỉ 1 hiệu ứng chạy: thẻ yếu hơn cái đang
                    // chạy thì server chặn — nói trước ở đây để người chơi khỏi
                    // bấm rồi ăn lỗi.
                    blocked: boostBlockedBy(i.definition.effect),
                }));
        }
        // Đang hiệu lực — buff ĐANG CHẠY (VIP + boost x2), chỉ xem đếm ngược.
        const list = [];
        const xp = boostLeft(b.xp), co = boostLeft(b.coins);
        const vip = GameState.state?.vip;
        const vipActive = !!(vip?.active && vip.expiresAt > now);
        if (vipActive) {
            const ms = vip.expiresAt - now, d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
            list.push({ id: 'vip', kind: 'boost', name: 'VIP', icon: 'fa-crown', color: '#f59e0b', desc: 'Năng lượng ∞ + x2 XP/Coins', left: d > 0 ? `${d} ngày ${h}h` : `${h}h` });
        }
        if (xp) list.push({
            id: 'xp', kind: 'boost', name: `x${b.xp.multiplier} XP`,
            icon: 'fa-bolt', image: boostImage('xp', b.xp.multiplier), color: '#8b5cf6',
            desc: `Nhân ${b.xp.multiplier} XP nhận được`, left: xp,
        });
        if (co) list.push({
            id: 'coins', kind: 'boost', name: `x${b.coins.multiplier} Coins`,
            icon: 'fa-coins', image: boostImage('coins', b.coins.multiplier), color: '#f59e0b',
            desc: `Nhân ${b.coins.multiplier} xu nhận được`, left: co,
        });
        // Boost ⚡ cũng phải hiện ở đây — bật rồi mà tab "Đang hiệu lực" trống thì
        // người chơi tưởng thẻ không ăn. Ghi rõ tốc độ để thấy ngay nó làm gì.
        const en = boostLeft(b.energy);
        if (en) {
            const mult = b.energy.multiplier || 1;
            list.push({
                id: 'energy', kind: 'boost', name: `x${mult} tốc độ hồi ⚡`,
                icon: 'fa-battery-full', image: boostImage('energy', mult), color: '#22c55e',
                desc: `Hồi ${mult} ⚡/phút (thường 1 ⚡/phút)`, left: en,
            });
        }
        return list;
        // cosmeticsVersion: tên/ảnh cosmetic lấy từ FRAMES/BACKGROUNDS, hai
        // registry đó được nạp thêm sau khi catalog về → phải tính lại.
    }, [cat, inv, equipped, r, b, now, defMap, cosmeticsVersion]);

    const equip = async (item) => {
        if (busy || item.equipped) return;
        setBusy(true);
        const res = await InventoryAPI.equip(item.id);
        setBusy(false);
        if (res?.success) {
            const slot = res.slot || item.slot || 'background';
            if (!GameState.state.equipped) GameState.state.equipped = {};
            GameState.state.equipped[slot] = item.id;
            // Cập nhật ảnh cosmetic đang trang bị (avatar) để hồ sơ/topnav đổi ngay.
            if (!GameState.state.equippedImages) GameState.state.equippedImages = {};
            if (item.image) GameState.state.equippedImages[slot] = item.image;
            else delete GameState.state.equippedImages[slot];
            EventBus.emit(GameEvents.STATE_CHANGED);
            await reload();
            setSelected({ ...item, equipped: true });
            Notification.show({ type: 'success', message: `Đã trang bị "${item.name}"`, duration: 1500 });
        } else {
            Notification.error(res?.message || 'Không trang bị được');
        }
    };

    /**
     * Gỡ trang bị → về mặc định của slot đó (nền gradient, không khung, avatar
     * gốc). Gỡ theo SLOT chứ không theo itemId: server dọn cả slot, và người
     * dùng nghĩ theo kiểu "bỏ nền đi", không phải "bỏ đúng cái nền này".
     */
    const unequip = async (item) => {
        if (busy || !item.equipped) return;
        const slot = item.slot || 'background';
        setBusy(true);
        const res = await InventoryAPI.unequip(slot);
        setBusy(false);
        if (res?.success) {
            // Xoá khỏi state ngay để hồ sơ/topnav trả về mặc định, khỏi chờ đồng bộ.
            if (GameState.state.equipped) delete GameState.state.equipped[slot];
            if (GameState.state.equippedImages) delete GameState.state.equippedImages[slot];
            EventBus.emit(GameEvents.STATE_CHANGED);
            await reload();
            setSelected({ ...item, equipped: false });
            Notification.show({ type: 'success', message: `Đã gỡ "${item.name}"`, duration: 1500 });
        } else {
            Notification.error(res?.message || 'Không gỡ được');
        }
    };

    // Dùng vật phẩm tiêu hao: vé quay → mở Vòng quay; hint/dừng giờ → về trang chủ (dùng khi luyện tập).
    const useConsumable = (item) => {
        Modal.close(); // đóng túi đồ
        if (item.id === 'spin-ticket') {
            window._openSpinWheel?.();
        } else {
            window.UI?.showScreen?.('home-screen');
        }
    };

    // Kích hoạt thẻ boost (on_use): tiêu 1 + bật boost trong state.
    const activate = async (item) => {
        if (busy) return;
        setBusy(true);
        const res = await InventoryAPI.use(item.id);
        setBusy(false);
        if (res?.success) {
            if (res.boosts && GameState.state?.boosts) {
                if (res.boosts.xp) GameState.state.boosts.xp = res.boosts.xp;
                if (res.boosts.coins) GameState.state.boosts.coins = res.boosts.coins;
                // Thiếu dòng này thì thẻ hồi ⚡ có ăn ở server nhưng client vẫn
                // tính 1 ⚡/phút, rồi saveState ghi số cũ đè lên phần đã hồi.
                if (res.boosts.energy) GameState.state.boosts.energy = res.boosts.energy;
            }
            // Thẻ đổi thẳng tài nguyên (hồi đầy ⚡) — lấy số server trả về, đừng
            // để client giữ số cũ.
            if (res.resources && GameState.state?.resources) {
                const r0 = GameState.state.resources;
                const { lastEnergyUpdate, ...rest } = res.resources;
                Object.assign(r0, rest);
                if (lastEnergyUpdate) r0.lastEnergyUpdate = new Date(lastEnergyUpdate).getTime();
                EventBus.emit(GameEvents.ENERGY_CHANGED, { current: r0.energy, max: r0.maxEnergy, used: 0 });
            }
            EventBus.emit(GameEvents.STATE_CHANGED);
            await reload();
            setSelected(null);
            Notification.show({ type: 'success', message: `Đã kích hoạt "${item.name}"`, duration: 1600 });
        } else {
            Notification.error(res?.message || 'Không kích hoạt được');
        }
    };

    return (
        <div className="wardrobe">
            {/* Sidebar category */}
            <div className="wardrobe-cats">
                {CATS.map(c => (
                    <button
                        key={c.key}
                        className={`wardrobe-cat${cat === c.key ? ' active' : ''}`}
                        onClick={() => { setCat(c.key); setSelected(null); }}
                    >
                        <i className={`fas ${c.icon}`}></i>
                        <span>{c.label}</span>
                    </button>
                ))}
            </div>

            {/* Lưới item */}
            <div className="wardrobe-grid">
                {items.length === 0 ? (
                    <div className="wardrobe-empty">
                        {cat === 'active' ? 'Không có hiệu lực nào đang chạy'
                            : cat === 'boost' ? 'Chưa có thẻ tăng tốc — mua ở cửa hàng'
                            : cat === 'cosmetic' ? 'Chưa có trang bị'
                            : 'Chưa có vật phẩm ở mục này'}
                    </div>
                ) : items.map(it => (
                    <button
                        key={it.id}
                        className={`wardrobe-cell${selected?.id === it.id ? ' selected' : ''}${it.equipped ? ' equipped' : ''}${it.rarity ? ' rarity-' + it.rarity : ''}`}
                        onClick={() => setSelected(it)}
                    >
                        {it.kind === 'cosmetic' && it.bg ? (
                            <span className="cell-thumb" style={bgStyle(it.id) || undefined}>
                                {it.left && <span className="cell-expiry">{it.left}</span>}
                            </span>
                        ) : it.kind === 'cosmetic' && it.frame ? (
                            <span className="cell-thumb cell-thumb--icon">
                                <span className="frame-dot" style={frameStyle(it.id) || undefined}>
                                    <i className="fas fa-user"></i>
                                    {frameOverlayUrl(it.id) && <span className="frame-overlay" style={{ backgroundImage: `url("${frameOverlayUrl(it.id)}")` }} aria-hidden="true" />}
                                </span>
                            </span>
                        ) : it.kind === 'cosmetic' && it.avatar ? (
                            <span className="cell-thumb cell-thumb--icon">
                                <img src={it.image} alt="" className="avatar-dot"
                                    onError={e => { e.currentTarget.style.display = 'none'; if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = ''; }} />
                                <i className="fas fa-user" style={{ display: 'none', color: '#94a3b8' }}></i>
                            </span>
                        ) : (
                            <span className="cell-thumb cell-thumb--icon">
                                <ItemThumb image={it.image} imgClassName="cell-img">
                                    <i className={`fas ${it.icon}`} style={{ color: it.color }}></i>
                                </ItemThumb>
                                {(it.kind === 'consumable' || it.kind === 'boost-card') && <span className="cell-count">{it.count}</span>}
                                {it.kind === 'boost' && it.left && <span className="cell-expiry">{it.left}</span>}
                            </span>
                        )}
                        <span className="cell-name">{it.name}</span>
                        {it.equipped && <span className="cell-equipped"><i className="fas fa-check"></i></span>}
                    </button>
                ))}
            </div>

            {/* Preview + hành động */}
            <div className="wardrobe-preview">
                {!selected ? (
                    <div className="wardrobe-preview-empty"><i className="fas fa-hand-pointer"></i><p>Chọn một vật phẩm</p></div>
                ) : (
                    <>
                        <div className="preview-visual" style={selected.kind === 'cosmetic' && selected.bg ? (bgStyle(selected.id) || undefined) : undefined}>
                            {selected.kind === 'cosmetic' && selected.frame
                                ? <span className="frame-dot frame-dot--lg" style={frameStyle(selected.id) || undefined}><i className="fas fa-user"></i>{frameOverlayUrl(selected.id) && <span className="frame-overlay" style={{ backgroundImage: `url("${frameOverlayUrl(selected.id)}")` }} aria-hidden="true" />}</span>
                                : selected.kind === 'cosmetic' && selected.avatar
                                    ? <img src={selected.image} alt="" className="avatar-dot avatar-dot--lg" />
                                    : selected.kind !== 'cosmetic'
                                        ? <ItemThumb image={selected.image} imgClassName="preview-img"><i className={`fas ${selected.icon}`} style={{ color: selected.color }}></i></ItemThumb>
                                        : null}
                        </div>
                        <div className="preview-name">{selected.name}</div>
                        {selected.desc && <div className="preview-desc">{selected.desc}</div>}
                        {(selected.kind === 'consumable' || selected.kind === 'boost-card') && <div className="preview-desc">Số lượng: ×{selected.count}</div>}
                        {selected.kind === 'boost' && selected.left && <div className="preview-desc">Còn lại: {selected.left}</div>}
                        {selected.kind === 'cosmetic' && selected.left && <div className="preview-desc"><i className="fas fa-clock"></i> Còn lại: {selected.left}</div>}
                        {selected.kind === 'boost-card' && (
                            selected.blocked ? (
                                <>
                                    <div className="preview-desc" style={{ color: '#f59e0b' }}>
                                        <i className="fas fa-triangle-exclamation"></i> {selected.blocked}
                                    </div>
                                    <button className="btn btn-secondary btn-sm preview-btn" disabled>
                                        <i className="fas fa-ban"></i> Chưa dùng được
                                    </button>
                                </>
                            ) : (
                                <button className="btn btn-primary btn-sm preview-btn" disabled={busy} onClick={() => activate(selected)}>
                                    <i className="fas fa-bolt"></i> Kích hoạt
                                </button>
                            )
                        )}
                        {selected.kind === 'consumable' && (
                            <button className="btn btn-primary btn-sm preview-btn" onClick={() => useConsumable(selected)}>
                                <i className="fas fa-play"></i> Sử dụng
                            </button>
                        )}
                        {selected.kind === 'cosmetic' && (
                            selected.equipped ? (
                                <>
                                    <div className="preview-desc preview-equipped-note">
                                        <i className="fas fa-circle-check"></i> Đang dùng
                                    </div>
                                    {/* Trang bị được thì phải gỡ được. Trước đây chỗ này là
                                        nút xám disabled → vào rồi không có đường ra, muốn về
                                        nền/khung mặc định là bó tay. */}
                                    <button className="btn btn-secondary btn-sm preview-btn" disabled={busy} onClick={() => unequip(selected)}>
                                        <i className="fas fa-xmark"></i> Gỡ ra
                                    </button>
                                </>
                            ) : (
                                <button className="btn btn-primary btn-sm preview-btn" disabled={busy} onClick={() => equip(selected)}>
                                    <i className="fas fa-check"></i> Trang bị
                                </button>
                            )
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
