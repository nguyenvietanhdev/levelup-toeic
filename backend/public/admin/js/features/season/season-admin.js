// modules/season-admin.js — Mùa giải: đếm ngược header + cấu hình + reset thủ công
(function () {
  const hdr = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  let seasonEndMs = null, seasonNum = 1, clockOffset = 0, inited = false;

  function fmtRemain(ms) {
    if (ms <= 0) return 'Đã hết hạn';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}`;
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }

  function tick() {
    const el = document.getElementById('season-countdown');
    if (!el || seasonEndMs == null) return;
    const now = Date.now() + clockOffset;
    el.textContent = `SS${seasonNum}: ${fmtRemain(seasonEndMs - now)}`;
  }

  async function loadCurrent() {
    try {
      const r = await fetch(`${API_URL}/season/current`);
      const j = await r.json();
      if (j.success) {
        seasonNum = j.data.seasonNumber;
        seasonEndMs = new Date(j.data.endAt).getTime();
        clockOffset = new Date(j.data.serverNow).getTime() - Date.now();
        tick();
      }
    } catch (_) {}
  }

  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function loadConfig() {
    try {
      const r = await fetch(`${API_URL}/season/config`, { headers: hdr() });
      const j = await r.json();
      if (!j.success) return;
      const s = j.data;
      const badge = document.getElementById('season-num-badge'); if (badge) badge.textContent = `SS${s.seasonNumber}`;
      const start = document.getElementById('season-start'); if (start) start.value = toLocalInput(s.startAt);
      const end = document.getElementById('season-end'); if (end) end.value = toLocalInput(s.endAt);
      const rb = s.resetBuckets || {};
      ['resources', 'progress', 'stats', 'learning'].forEach((k) => {
        const cb = document.getElementById('rb-' + k); if (cb) cb.checked = rb[k] !== false;
      });
    } catch (_) {}
  }

  function setStatus(msg, ok) {
    const el = document.getElementById('season-config-status');
    if (el) { el.textContent = msg; el.style.color = ok ? '#22c55e' : '#ef4444'; }
  }

  async function saveConfig() {
    const startV = document.getElementById('season-start').value;
    const endV = document.getElementById('season-end').value;
    const body = {
      startAt: startV ? new Date(startV).toISOString() : undefined,
      endAt: endV ? new Date(endV).toISOString() : undefined,
      resetBuckets: {
        resources: document.getElementById('rb-resources').checked,
        progress: document.getElementById('rb-progress').checked,
        stats: document.getElementById('rb-stats').checked,
        learning: document.getElementById('rb-learning').checked,
      },
    };
    try {
      const r = await fetch(`${API_URL}/season/config`, { method: 'PUT', headers: hdr(), body: JSON.stringify(body) });
      const j = await r.json();
      setStatus(j.success ? '✅ Đã lưu cấu hình' : '❌ ' + (j.message || 'Lỗi'), j.success);
      if (j.success) loadCurrent();
    } catch (e) { setStatus('❌ ' + e.message, false); }
  }

  async function resetNow() {
    if (!confirm('⚠️ RESET MÙA NGAY?\n\nToàn bộ dữ liệu các nhóm đã chọn sẽ bị XÓA/ĐẶT LẠI cho MỌI người dùng và KHÔNG THỂ hoàn tác.\nBảng vinh danh mùa hiện tại sẽ được lưu trước khi reset.\n\nTiếp tục?')) return;
    try {
      const r = await fetch(`${API_URL}/season/reset`, { method: 'POST', headers: hdr() });
      const j = await r.json();
      setStatus(j.success ? `✅ ${j.message}` : '❌ ' + (j.message || 'Lỗi'), j.success);
      loadConfig(); loadCurrent();
    } catch (e) { setStatus('❌ ' + e.message, false); }
  }

  function initSeasonAdmin() {
    loadCurrent();
    loadConfig();
    if (!inited) {
      inited = true;
      setInterval(tick, 1000);
      setInterval(loadCurrent, 60000);
      document.getElementById('season-save-btn')?.addEventListener('click', saveConfig);
      document.getElementById('season-reset-btn')?.addEventListener('click', resetNow);
    }
  }

  document.addEventListener('DOMContentLoaded', initSeasonAdmin);
  // Gọi lại sau khi đăng nhập (loadConfig cần token)
  window.refreshSeasonAdmin = () => { loadCurrent(); loadConfig(); };
  window.initSeasonAdmin = initSeasonAdmin;
})();
