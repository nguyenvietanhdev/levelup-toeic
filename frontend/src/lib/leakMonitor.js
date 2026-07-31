// Công cụ đo rò rỉ (dev): đếm interval/timeout/DOM listener/EventBus đang sống.
// Bật bằng: thêm ?debug=leaks vào URL, HOẶC chạy localStorage.setItem('debugLeaks','1') rồi F5.
// Overlay góc trái-dưới cập nhật mỗi giây. SỐ NÀO TĂNG DẦN qua mỗi phiên = rò rỉ.
import { EventBus } from '@game/eventBus.js';

export function startLeakMonitor() {
    if (typeof window === 'undefined' || window.__leakMon) return;
    const on = location.search.includes('debug=leaks') || localStorage.getItem('debugLeaks') === '1';
    if (!on) return;
    window.__leakMon = true;

    // ── Đếm interval đang chạy ──
    const ivSet = new Set();
    const _si = window.setInterval.bind(window), _ci = window.clearInterval.bind(window);
    window.setInterval = (...a) => { const id = _si(...a); ivSet.add(id); return id; };
    window.clearInterval = (id) => { ivSet.delete(id); return _ci(id); };

    // ── Đếm timeout đang chờ ──
    const toSet = new Set();
    const _st = window.setTimeout.bind(window), _ct = window.clearTimeout.bind(window);
    window.setTimeout = (fn, d, ...a) => {
        const id = _st((...x) => { toSet.delete(id); return typeof fn === 'function' ? fn(...x) : undefined; }, d, ...a);
        toSet.add(id); return id;
    };
    window.clearTimeout = (id) => { toSet.delete(id); return _ct(id); };

    // ── Đếm DOM listener trên document/window theo loại ──
    const dom = {};
    const patch = (target, label) => {
        const _add = target.addEventListener.bind(target), _rem = target.removeEventListener.bind(target);
        target.addEventListener = (type, ...a) => { const k = label + ':' + type; dom[k] = (dom[k] || 0) + 1; return _add(type, ...a); };
        target.removeEventListener = (type, ...a) => { const k = label + ':' + type; dom[k] = Math.max(0, (dom[k] || 0) - 1); return _rem(type, ...a); };
    };
    patch(document, 'doc');
    patch(window, 'win');

    // ── Overlay ──
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;background:rgba(0,0,0,.88);color:#4ade80;font:11px/1.45 monospace;padding:8px 10px;border-radius:8px;max-width:360px;max-height:60vh;overflow:auto;white-space:pre;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.5)';
    const mount = () => { if (document.body) document.body.appendChild(el); else _st(mount, 200); };
    mount();

    const topN = (obj, n = 8) => Object.entries(obj)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([k, v]) => `  ${String(v).padStart(3)}  ${k}`)
        .join('\n');

    _si(() => {
        const eb = {};
        const events = EventBus.events || {};
        Object.keys(events).forEach(k => { eb[k] = events[k]?.length || 0; });
        const ebTotal = Object.values(eb).reduce((a, b) => a + b, 0);
        el.textContent =
            `🔎 LEAK MONITOR (số tăng dần = rò rỉ)\n` +
            `⏱ interval sống: ${ivSet.size}\n` +
            `⏳ timeout chờ:   ${toSet.size}\n` +
            `📡 EventBus tổng: ${ebTotal}\n${topN(eb)}\n` +
            `🖱 DOM listener:\n${topN(dom)}`;
    }, 1000);

    // eslint-disable-next-line no-console
    console.log('[leakMonitor] BẬT — theo dõi overlay góc trái-dưới. Tắt: localStorage.removeItem("debugLeaks")');
}
