import { bumpCosmetics } from './cosmeticsStore.js';

// Registry khung avatar (cosmetic_frame). Key = itemId (khớp item_definitions.itemId).
// Khung mặc định = vòng viền + glow (CSS box-shadow) — đồng nhất Hồ sơ / Nav / BXH.
// Admin có thể định nghĩa thêm khung ở Catalog (ảnh hoặc CSS màu) → nạp qua
// registerFrameCosmetics(). css/ảnh của DB được ưu tiên hơn ring/glow hardcoded.
export const FRAMES = {
    'frame-gold': { label: 'Khung Vàng', ring: '#f59e0b', glow: 'rgba(245,158,11,.65)' },
    'frame-neon': { label: 'Khung Neon', ring: '#22d3ee', glow: 'rgba(34,211,238,.7)' },
};

// Gộp khung do admin định nghĩa (effect.slot === 'frame') từ catalog vào FRAMES.
export function registerFrameCosmetics(items) {
    let changed = false;
    (items || []).forEach(d => {
        const eff = d.effect || {};
        if (eff.slot !== 'frame' || !eff.key) return;
        // Theo cả effect.key lẫn itemId — xem chú thích cùng chỗ ở backgrounds.js.
        for (const key of new Set([eff.key, d.itemId].filter(Boolean))) {
            FRAMES[key] = {
                ...(FRAMES[key] || {}),
                label: d.name || FRAMES[key]?.label || key,
                styleMode: eff.styleMode || FRAMES[key]?.styleMode || 'css',
                css: eff.css || FRAMES[key]?.css || '',
                image: d.image || FRAMES[key]?.image || '',
            };
        }
        changed = true;
    });
    if (changed) bumpCosmetics(); // xem chú thích trong cosmeticsStore.js
}

// Style gắn vào phần tử avatar (tròn) để hiện khung. null nếu không có khung.
// Ưu tiên: ảnh (overlay — cần position:relative) → CSS màu (box-shadow) → ring/glow.
export function frameStyle(key) {
    const f = FRAMES[key];
    if (!f) return null;
    if (f.styleMode === 'image' && f.image) {
        // Khung ảnh render bằng lớp phủ .frame-overlay — neo vị trí + cho phủ ra ngoài.
        return { position: 'relative', overflow: 'visible' };
    }
    if (f.css) {
        // css = màu (vd '#f59e0b') → vòng viền + glow cùng màu.
        return { boxShadow: `0 0 0 3px ${f.css}, 0 0 14px 3px ${f.css}` };
    }
    if (f.ring) {
        return { boxShadow: `0 0 0 3px ${f.ring}, 0 0 14px 3px ${f.glow}` };
    }
    return null;
}

// URL ảnh khung để render lớp phủ (chỉ khung dạng ẢNH). null nếu CSS/không có.
// Dùng: {frameOverlayUrl(key) && <span className="frame-overlay" style={{backgroundImage:`url("${url}")`}} />}
export function frameOverlayUrl(key) {
    const f = FRAMES[key];
    return (f && f.styleMode === 'image' && f.image) ? f.image : null;
}
