// modules/feature-unlock-admin.js — CRUD mốc mở khoá theo Level (FeatureUnlock).
(function () {
  let inited = false;
  let ALL = [];

  const iconCell = (u) => {
    const ic = u.icon || '';
    if (ic.startsWith('fa-')) return `<i class="fas ${ic}" style="font-size:18px"></i>`;
    return `<span style="font-size:20px">${ic || '🔓'}</span>`;
  };
  const esc = (s) => String(s || '').replace(/"/g, '&quot;');

  // Cùng công thức với server: XP mỗi cấp = floor(100 * level^1.5).
  // Tổng XP để ĐẠT `level` = cộng dồn các cấp trước đó.
  const xpForLevel = (lv) => Math.floor(100 * Math.pow(lv, 1.5));
  const xpToReach = (lv) => { let a = 0; for (let i = 1; i < lv; i++) a += xpForLevel(i); return a; };

  async function load() {
    const tbody = document.getElementById('unlock-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    try {
      const r = await fetch(`${API_URL}/admin/feature-unlocks`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const j = await r.json();
      ALL = j.success ? (j.data || []) : [];
      render();
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger)">${e.message}</td></tr>`;
    }
  }

  function render() {
    const tbody = document.getElementById('unlock-tbody');
    if (!tbody) return;
    if (!ALL.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:20px">Chưa có mốc nào</td></tr>';
      return;
    }
    tbody.innerHTML = ALL.map(u => `<tr>
        <td style="text-align:center">${iconCell(u)}</td>
        <td><strong>${u.label || ''}</strong>${u.description ? `<br><small style="color:var(--text-secondary)">${u.description}</small>` : ''}</td>
        <td><small style="font-family:monospace;color:var(--text-secondary)">${u.key}</small></td>
        <td>
          <span class="badge neutral">Lv. ${u.requiredLevel}</span>
          <br><small style="color:var(--text-secondary)">≈ ${xpToReach(u.requiredLevel).toLocaleString()} XP</small>
        </td>
        <td>${u.isActive !== false ? '<span class="badge success">Bật</span>' : '<span class="badge neutral">Tắt</span>'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-secondary btn-sm unlock-edit" data-id="${u._id}"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm unlock-del" data-id="${u._id}" data-name="${esc(u.label)}" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('.unlock-edit').forEach(b => b.onclick = () => {
      const u = ALL.find(x => x._id === b.dataset.id);
      if (u) openModal(u);
    });
    tbody.querySelectorAll('.unlock-del').forEach(b => b.onclick = async () => {
      if (!confirm(`Xóa mốc "${b.dataset.name}"? (Tính năng sẽ mở cho mọi Level)`)) return;
      const r = await fetch(`${API_URL}/admin/feature-unlocks/${b.dataset.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` },
      });
      const j = await r.json();
      showToast(j.message || 'Đã xóa', j.success ? 'success' : 'error');
      if (j.success) load();
    });
  }

  function openModal(u) {
    u = u || {};
    const isEdit = !!u._id;
    document.getElementById('unlock-id').value = u._id || '';
    document.getElementById('unlock-modal-title').textContent = isEdit ? 'Sửa mốc mở khoá' : 'Thêm mốc mở khoá';
    const key = document.getElementById('unlock-key');
    key.value = u.key || '';
    key.readOnly = isEdit; key.style.opacity = isEdit ? '0.6' : '1';
    document.getElementById('unlock-label').value = u.label || '';
    document.getElementById('unlock-level').value = u.requiredLevel || 1;
    document.getElementById('unlock-icon').value = u.icon || '';
    document.getElementById('unlock-order').value = u.order || 0;
    document.getElementById('unlock-desc').value = u.description || '';
    document.getElementById('unlock-active').checked = u.isActive !== false;
    updateXpHint();
    document.getElementById('unlock-modal').style.display = 'flex';
  }

  // Hiện tổng XP tương ứng với Level đang nhập → đặt mốc có cơ sở.
  function updateXpHint() {
    const lv = Math.max(1, Number(document.getElementById('unlock-level')?.value) || 1);
    const el = document.getElementById('unlock-xp-hint');
    if (el) el.innerHTML = `Người chơi cần tích luỹ <b>${xpToReach(lv).toLocaleString()} XP</b> để đạt Level ${lv}`;
  }

  function initModal() {
    document.getElementById('unlock-level')?.addEventListener('input', updateXpHint);
    document.getElementById('btn-add-unlock')?.addEventListener('click', () => openModal());
    document.getElementById('btn-unlock-cancel')?.addEventListener('click', () => {
      document.getElementById('unlock-modal').style.display = 'none';
    });
    document.getElementById('unlock-form')?.addEventListener('submit', async function (e) {
      e.preventDefault();
      const id = document.getElementById('unlock-id').value;
      const payload = {
        key: document.getElementById('unlock-key').value.trim(),
        label: document.getElementById('unlock-label').value.trim(),
        requiredLevel: Math.max(1, Number(document.getElementById('unlock-level').value) || 1),
        icon: document.getElementById('unlock-icon').value.trim(),
        order: Number(document.getElementById('unlock-order').value) || 0,
        description: document.getElementById('unlock-desc').value.trim(),
        isActive: document.getElementById('unlock-active').checked,
      };
      const url = id ? `${API_URL}/admin/feature-unlocks/${id}` : `${API_URL}/admin/feature-unlocks`;
      const r = await fetch(url, {
        method: id ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      showToast(j.message || (id ? 'Đã cập nhật' : 'Đã tạo'), j.success ? 'success' : 'error');
      if (j.success) { document.getElementById('unlock-modal').style.display = 'none'; load(); }
    });
  }

  // ===== Tài khoản ngoại lệ (bỏ qua mốc Level) =====
  async function loadExceptions() {
    const tbody = document.getElementById('exception-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    try {
      const r = await fetch(`${API_URL}/admin/feature-unlock-exceptions`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const j = await r.json();
      renderExceptions(j.success ? (j.data || []) : []);
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger)">${e.message}</td></tr>`;
    }
  }

  function renderExceptions(list) {
    const tbody = document.getElementById('exception-tbody');
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:20px">Chưa có tài khoản ngoại lệ nào</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(u => `<tr>
        <td><strong>${esc(u.email)}</strong></td>
        <td>${esc(u.username) || '<small style="color:var(--text-secondary)">—</small>'}</td>
        <td><span class="badge neutral">Lv. ${u.level}</span></td>
        <td>${u.role === 'admin' ? '<span class="badge success">admin</span>' : '<span class="badge neutral">user</span>'}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-sm exc-del" data-id="${u._id}" data-email="${esc(u.email)}"
                  style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5"><i class="fas fa-user-minus"></i> Gỡ</button>
        </td>
      </tr>`).join('');

    tbody.querySelectorAll('.exc-del').forEach(b => b.onclick = async () => {
      if (!confirm(`Gỡ "${b.dataset.email}" khỏi ngoại lệ? (Tài khoản sẽ bị khoá lại theo Level)`)) return;
      const r = await fetch(`${API_URL}/admin/feature-unlock-exceptions/${b.dataset.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` },
      });
      const j = await r.json();
      showToast(j.message || 'Đã gỡ', j.success ? 'success' : 'error');
      if (j.success) loadExceptions();
    });
  }

  function initExceptionModal() {
    const modal = document.getElementById('exception-modal');
    document.getElementById('btn-add-exception')?.addEventListener('click', () => {
      document.getElementById('exception-email').value = '';
      if (modal) modal.style.display = 'flex';
    });
    document.getElementById('btn-exception-cancel')?.addEventListener('click', () => {
      if (modal) modal.style.display = 'none';
    });
    document.getElementById('exception-form')?.addEventListener('submit', async function (e) {
      e.preventDefault();
      const email = document.getElementById('exception-email').value.trim();
      if (!email) return;
      const r = await fetch(`${API_URL}/admin/feature-unlock-exceptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const j = await r.json();
      showToast(j.message || 'Đã thêm', j.success ? 'success' : 'error');
      if (j.success) { if (modal) modal.style.display = 'none'; loadExceptions(); }
    });
  }

  window.loadFeatureUnlocks = function () {
    if (!inited) { inited = true; initModal(); initExceptionModal(); }
    load();
    loadExceptions();
  };
})();
