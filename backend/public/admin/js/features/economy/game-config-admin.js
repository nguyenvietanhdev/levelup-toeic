// modules/game-config-admin.js — chỉnh hằng số game (GameConfig singleton).
(function () {
  const FIELDS = ['maxUploadWords', 'maxFavorites', 'extendCostPerWord', 'vipBoostCards'];
  let inited = false;

  function setStatus(msg, ok) {
    const el = document.getElementById('game-config-status');
    if (el) { el.textContent = msg; el.style.color = ok ? '#22c55e' : '#ef4444'; }
  }

  async function load() {
    try {
      const r = await fetch(`${API_URL}/admin/game-config`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const j = await r.json();
      if (!j.success) return;
      FIELDS.forEach(f => {
        const el = document.getElementById('gc-' + f);
        if (el) el.value = j.data[f] ?? 0;
      });
    } catch (e) { setStatus(e.message, false); }
  }

  async function save(e) {
    e.preventDefault();
    const body = {};
    FIELDS.forEach(f => { body[f] = Number(document.getElementById('gc-' + f).value) || 0; });
    setStatus('Đang lưu...', true);
    try {
      const r = await fetch(`${API_URL}/admin/game-config`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      setStatus(j.success ? '✅ ' + j.message : '❌ ' + (j.message || 'Lỗi'), j.success);
    } catch (e2) { setStatus('❌ ' + e2.message, false); }
  }

  window.loadGameConfig = function () {
    if (!inited) { inited = true; document.getElementById('game-config-form')?.addEventListener('submit', save); }
    load();
  };
})();
