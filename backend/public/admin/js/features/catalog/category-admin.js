// modules/category-admin.js — CRUD danh mục (shop/quest/achievement).
(function () {
  let inited = false;

  const iconCell = (c) => {
    const ic = c.icon || '';
    if (ic.startsWith('fa-')) return `<i class="fas ${ic}" style="font-size:18px"></i>`;
    return `<span style="font-size:20px">${ic || '🏷️'}</span>`;
  };

  async function load() {
    const domain = document.getElementById('cat-domain')?.value || 'shop';
    const tbody = document.getElementById('cat-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    try {
      const r = await fetch(`${API_URL}/admin/categories?domain=${domain}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const j = await r.json();
      const rows = j.success ? (j.data || []) : [];
      if (!tbody) return;
      tbody.innerHTML = rows.length ? rows.map(c => `<tr>
          <td style="text-align:center">${iconCell(c)}</td>
          <td><strong>${c.label}</strong></td>
          <td><small style="font-family:monospace;color:var(--text-secondary)">${c.key}</small></td>
          <td>${c.order || 0}</td>
          <td>${c.isActive !== false ? '<span class="badge success">Bật</span>' : '<span class="badge neutral">Tắt</span>'}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-secondary btn-sm cat-edit" data-id="${c._id}"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm cat-del" data-id="${c._id}" data-name="${(c.label || '').replace(/"/g, '&quot;')}" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:20px">Chưa có danh mục</td></tr>';

      tbody.querySelectorAll('.cat-edit').forEach(b => b.onclick = async () => {
        const rr = await fetch(`${API_URL}/admin/categories?domain=${domain}`, { headers: { Authorization: `Bearer ${getToken()}` } });
        const jj = await rr.json();
        const c = (jj.data || []).find(x => x._id === b.dataset.id);
        if (c) openModal(c);
      });
      tbody.querySelectorAll('.cat-del').forEach(b => b.onclick = async () => {
        if (!confirm(`Xóa danh mục "${b.dataset.name}"? (Item/nhiệm vụ đang thuộc danh mục này sẽ mất tab)`)) return;
        const rr = await fetch(`${API_URL}/admin/categories/${b.dataset.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
        const jj = await rr.json();
        showToast(jj.message || 'Đã xóa', jj.success ? 'success' : 'error');
        if (jj.success) load();
      });
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger)">${e.message}</td></tr>`;
    }
  }

  function openModal(c) {
    c = c || {};
    const isEdit = !!c._id;
    document.getElementById('cat-id').value = c._id || '';
    document.getElementById('cat-modal-title').textContent = isEdit ? 'Sửa danh mục' : 'Thêm danh mục';
    const dom = document.getElementById('cat-domain-f');
    dom.value = c.domain || document.getElementById('cat-domain')?.value || 'shop';
    dom.disabled = isEdit;
    const key = document.getElementById('cat-key');
    key.value = c.key || '';
    key.readOnly = isEdit; key.style.opacity = isEdit ? '0.6' : '1';
    document.getElementById('cat-label').value = c.label || '';
    document.getElementById('cat-icon').value = c.icon || '';
    document.getElementById('cat-order').value = c.order || 0;
    document.getElementById('cat-active').checked = c.isActive !== false;
    document.getElementById('cat-modal').style.display = 'flex';
  }

  function initModal() {
    document.getElementById('cat-domain')?.addEventListener('change', load);
    document.getElementById('btn-add-cat')?.addEventListener('click', () => openModal());
    document.getElementById('btn-cat-cancel')?.addEventListener('click', () => { document.getElementById('cat-modal').style.display = 'none'; });
    document.getElementById('cat-form')?.addEventListener('submit', async function (e) {
      e.preventDefault();
      const id = document.getElementById('cat-id').value;
      const payload = {
        domain: document.getElementById('cat-domain-f').value,
        key: document.getElementById('cat-key').value.trim(),
        label: document.getElementById('cat-label').value.trim(),
        icon: document.getElementById('cat-icon').value.trim(),
        order: Number(document.getElementById('cat-order').value) || 0,
        isActive: document.getElementById('cat-active').checked,
      };
      const url = id ? `${API_URL}/admin/categories/${id}` : `${API_URL}/admin/categories`;
      const r = await fetch(url, { method: id ? 'PUT' : 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      showToast(j.message || (id ? 'Đã cập nhật' : 'Đã tạo'), j.success ? 'success' : 'error');
      if (j.success) { document.getElementById('cat-modal').style.display = 'none'; load(); }
    });
  }

  window.loadCategories = function () {
    if (!inited) { inited = true; initModal(); }
    load();
  };
})();
