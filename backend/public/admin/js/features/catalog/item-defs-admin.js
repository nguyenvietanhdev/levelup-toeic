// modules/item-defs-admin.js — CRUD catalog vật phẩm (item_definitions).
// Dùng chung ô upload ảnh với shop (POST /admin/upload-image?role=...).
(function () {
  let ALL = [];
  let ITEM_CATS = null; // danh mục domain 'item' (đổ vào #itemdef-category)

  async function fillCategorySelect(selected) {
    const sel = document.getElementById('itemdef-category');
    if (!sel) return;
    if (!ITEM_CATS) {
      try { const r = await fetch(`${API_URL}/categories?domain=item`); const j = await r.json(); ITEM_CATS = j.success ? j.data : []; }
      catch (_) { ITEM_CATS = []; }
    }
    let opts = '<option value="">— Chưa phân loại —</option>' +
      ITEM_CATS.map(c => `<option value="${c.key}">${c.icon || ''} ${c.label}</option>`).join('');
    // Danh mục của vật phẩm không còn trong danh sách (bị xoá) → GIỮ nó lại thành
    // một option. Không giữ thì select tụt về '' và cú bấm Lưu sẽ âm thầm xoá
    // danh mục, đá vật phẩm ra khỏi mọi kênh.
    if (selected && !ITEM_CATS.some(c => c.key === selected)) {
      opts += `<option value="${selected}">⚠ ${selected} (danh mục đã bị xoá)</option>`;
    }
    sel.innerHTML = opts;
    sel.value = selected || '';
  }

  // ── Vật phẩm con (combo) ──
  const childOptions = (sel) => '<option value="">— chọn vật phẩm —</option>' +
    ALL.map(d => `<option value="${d.itemId}" ${d.itemId === sel ? 'selected' : ''}>${d.name} (${d.itemId})</option>`).join('');
  function addChildRow(itemId, qty) {
    const wrap = document.getElementById('itemdef-children');
    const row = document.createElement('div');
    row.className = 'itemdef-child-row';
    row.style.cssText = 'display:flex;gap:8px;margin-bottom:6px';
    row.innerHTML = `<select class="child-id" style="flex:1;padding:7px;border:1.5px solid var(--border-color);border-radius:6px">${childOptions(itemId || '')}</select>
      <input type="number" class="child-qty" min="1" value="${qty || 1}" style="width:80px;padding:7px;border:1.5px solid var(--border-color);border-radius:6px">
      <button type="button" class="btn btn-sm child-del" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5"><i class="fas fa-times"></i></button>`;
    row.querySelector('.child-del').onclick = () => row.remove();
    wrap.appendChild(row);
  }
  function renderChildren(children) {
    const wrap = document.getElementById('itemdef-children');
    wrap.innerHTML = '';
    (children || []).forEach(c => addChildRow(c.itemId, c.quantity || 1));
  }
  const collectChildren = () => [...document.querySelectorAll('#itemdef-children .itemdef-child-row')]
    .map(r => ({ itemId: r.querySelector('.child-id').value, quantity: Number(r.querySelector('.child-qty').value) || 1 }))
    .filter(c => c.itemId);

  // Tổng giá = floor(giá × (1−giảm%)) × số lượng.
  function updateTotal() {
    const q = Number(document.getElementById('itemdef-quantity').value) || 1;
    const p = Number(document.getElementById('itemdef-price').value) || 0;
    const d = Number(document.getElementById('itemdef-discount').value) || 0;
    const cur = document.getElementById('itemdef-currency').value === 'gems' ? '💎' : '🪙';
    document.getElementById('itemdef-total-price').textContent = `${Math.floor(p * (1 - d / 100)) * q} ${cur}`;
  }
  // ── Editor hiệu ứng (thay ô JSON tay) ──
  const EFF_GRID = new Set(['boost', 'item', 'cosmetic']);
  const EFF_HINTS = {
    none: 'Không có hiệu ứng chủ động (ảnh nền/khung: chọn “Cosmetic” nếu trang bị được).',
    resource: 'Cộng vào kho tài nguyên người dùng (Gợi ý/Khiên/Dừng giờ).',
    energy: 'Nạp năng lượng khi mua/nhận.',
    coins: 'Tặng xu.', gems: 'Tặng đá.',
    boost: 'Bật nhân XP/Coins có thời hạn.',
    vip: 'Kích hoạt / gia hạn VIP.',
    item: 'Cấp thêm 1 vật phẩm khác khi mua/nhận.',
    cosmetic: 'Trang bị được: gán slot avatar / nền / khung.',
    spin: 'Dùng để quay Vòng quay may mắn.',
    raw: 'Tự nhập JSON cho trường hợp đặc biệt.',
  };
  const _num = (id) => Number(document.getElementById(id).value) || 0;
  function showEffFields(type) {
    document.querySelectorAll('.eff-fields').forEach(el => {
      el.style.display = (el.dataset.eff === type) ? (EFF_GRID.has(type) ? 'grid' : 'block') : 'none';
    });
    const h = document.querySelector('.eff-hint');
    if (h) h.textContent = EFF_HINTS[type] || '';
  }
  function setEffFromData(eff) {
    eff = eff || {};
    let type = 'none';
    if (eff.slot) {
      type = 'cosmetic';
      document.getElementById('eff-cos-slot').value = eff.slot;
      document.getElementById('eff-cos-key').value = eff.key || '';
      document.getElementById('eff-cos-mode').value = eff.styleMode || 'image';
      document.getElementById('eff-cos-css').value = eff.css || '';
      _cosToggleStyleRow(eff.slot);
    }
    else if (eff.type === 'resource') { type = 'resource'; document.getElementById('eff-resource-field').value = eff.field || 'hints'; }
    else if (eff.type === 'boost') { type = 'boost'; document.getElementById('eff-boost-type').value = eff.boostType || 'xp'; document.getElementById('eff-boost-mult').value = eff.multiplier || 2; document.getElementById('eff-boost-dur').value = eff.duration || 86400; }
    else if (eff.type === 'vip') { type = 'vip'; document.getElementById('eff-vip-dur').value = eff.duration || 604800; }
    else if (eff.type === 'item') { type = 'item'; document.getElementById('eff-item-id').value = eff.itemId || ''; document.getElementById('eff-item-amount').value = eff.amount || 1; }
    else if (eff.type === 'energy') { type = 'energy'; document.getElementById('eff-energy-amount').value = eff.amount || 0; }
    else if (eff.type === 'coins') { type = 'coins'; document.getElementById('eff-coins-amount').value = eff.amount || 0; }
    else if (eff.type === 'gems') { type = 'gems'; document.getElementById('eff-gems-amount').value = eff.amount || 0; }
    else if (eff.type === 'spin') { type = 'spin'; }
    else if (Object.keys(eff).length) { type = 'raw'; document.getElementById('itemdef-effect').value = JSON.stringify(eff, null, 2); }
    document.getElementById('itemdef-eff-type').value = type;
    showEffFields(type);
  }
  // Avatar chỉ dùng ảnh → ẩn hàng chọn kiểu (mode + css).
  function _cosToggleStyleRow(slot) {
    const row = document.getElementById('eff-cos-style-row');
    if (row) row.style.display = (slot === 'avatar') ? 'none' : 'grid';
  }
  function buildEffect() {
    const type = document.getElementById('itemdef-eff-type').value;
    switch (type) {
      case 'resource': return { type: 'resource', field: document.getElementById('eff-resource-field').value };
      case 'energy': return { type: 'energy', amount: _num('eff-energy-amount') };
      case 'coins': return { type: 'coins', amount: _num('eff-coins-amount') };
      case 'gems': return { type: 'gems', amount: _num('eff-gems-amount') };
      case 'boost': return { type: 'boost', boostType: document.getElementById('eff-boost-type').value, multiplier: _num('eff-boost-mult') || 2, duration: _num('eff-boost-dur') || 86400 };
      case 'vip': return { type: 'vip', duration: _num('eff-vip-dur') || 604800 };
      case 'item': return { type: 'item', itemId: document.getElementById('eff-item-id').value.trim(), amount: _num('eff-item-amount') || 1 };
      case 'cosmetic': {
        const slot = document.getElementById('eff-cos-slot').value;
        const eff = { slot, key: document.getElementById('eff-cos-key').value.trim() };
        if (slot !== 'avatar') { // avatar chỉ dùng ảnh
          eff.styleMode = document.getElementById('eff-cos-mode').value;
          if (eff.styleMode === 'css') eff.css = document.getElementById('eff-cos-css').value.trim();
        }
        return eff;
      }
      case 'spin': return { type: 'spin' };
      case 'raw': { const raw = document.getElementById('itemdef-effect').value.trim(); return raw ? JSON.parse(raw) : {}; }
      default: return {};
    }
  }

  // Thư mục lưu ảnh = key danh mục (rỗng → item).
  function updateRoleHint() {
    const cat = document.getElementById('itemdef-category')?.value || 'item';
    const hint = document.getElementById('itemdef-image-role-hint');
    if (hint) hint.textContent = `/uploads/${cat}/`;
  }

  // Date → giá trị input datetime-local (giờ địa phương).
  const toLocalInput = (iso) => {
    if (!iso) return '';
    const dt = new Date(iso); const pad = n => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };

  const iconCell = (d) => {
    if (d.image) return `<img src="${d.image}" alt="" style="width:30px;height:30px;object-fit:contain;border-radius:6px">`;
    const ic = d.icon || '';
    if (ic.startsWith('fa-')) return `<i class="fas ${ic}" style="font-size:18px"></i>`;
    return `<span style="font-size:20px">${ic || '📦'}</span>`;
  };

  const fmtDuration = (d) => {
    if (d.durationType === 'permanent' || !d.durationSec) return 'vĩnh viễn';
    const s = d.durationSec;
    const t = s % 86400 === 0 ? `${s / 86400} ngày` : s % 3600 === 0 ? `${s / 3600} giờ` : `${s}s`;
    return `${d.durationType} · ${t}`;
  };

  function render() {
    const tbody = document.getElementById('itemdef-tbody');
    if (!tbody) return;
    const q = (document.getElementById('itemdef-search')?.value || '').trim().toLowerCase();
    const type = document.getElementById('itemdef-filter-type')?.value || '';
    const rows = ALL.filter(d => {
      if (type && d.type !== type) return false;
      if (q && !((d.name || '') + (d.itemId || '') + (d.type || '')).toLowerCase().includes(q)) return false;
      return true;
    });
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:20px">Không có vật phẩm</td></tr>'; return; }
    tbody.innerHTML = rows.map(d => `<tr>
      <td style="text-align:center">${iconCell(d)}</td>
      <td><strong>${d.name || ''}</strong> ${d.published === false ? '<span class="badge neutral" title="Chưa xuất bản — kênh không hiển thị">🚫 nháp</span>' : ''}<br><small style="color:var(--text-secondary);font-family:monospace">${d.itemId}</small></td>
      <td><span class="badge neutral">${d.type}</span>${d.category ? `<br><small style="color:var(--text-secondary)">📁 ${d.category}</small>` : ''}${d.price ? `<br><small style="color:var(--warning,#d97706)">${d.currency === 'gems' ? '💎' : '🪙'} ${d.price}${d.discountPercent ? ` −${d.discountPercent}%` : ''}</small>` : ''}</td>
      <td>${d.rarity || 'common'}</td>
      <td style="font-size:12px">${fmtDuration(d)}</td>
      <td>${d.order || 0}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm btn-itemdef-edit" data-id="${d._id}"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-itemdef-del" data-id="${d._id}" data-name="${(d.name || '').replace(/"/g, '&quot;')}" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`).join('');

    tbody.querySelectorAll('.btn-itemdef-edit').forEach(b => b.onclick = async () => {
      const r = await fetch(`${API_URL}/admin/item-defs/${b.dataset.id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const j = await r.json();
      if (j.success) openModal(j.data);
    });
    tbody.querySelectorAll('.btn-itemdef-del').forEach(b => b.onclick = async () => {
      if (!confirm(`Xóa vật phẩm "${b.dataset.name}"?`)) return;
      const r = await fetch(`${API_URL}/admin/item-defs/${b.dataset.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
      const j = await r.json();
      showToast(j.message || 'Đã xóa', j.success ? 'success' : 'error');
      if (j.success) load();
    });
  }

  async function load() {
    const tbody = document.getElementById('itemdef-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    try {
      const r = await fetch(`${API_URL}/admin/item-defs`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const j = await r.json();
      ALL = j.success ? (j.data || []) : [];
      render();
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--danger)">${e.message}</td></tr>`;
    }
  }

  function setImage(url) {
    document.getElementById('itemdef-image').value = url || '';
    const img = document.getElementById('itemdef-image-preview');
    if (url) { img.src = url; img.style.display = ''; }
    else { img.removeAttribute('src'); img.style.display = 'none'; }
  }

  function openModal(data) {
    data = data || {};
    const isEdit = !!data._id;
    document.getElementById('itemdef-id').value = data._id || '';
    document.getElementById('itemdef-modal-title').textContent = isEdit ? 'Sửa vật phẩm' : 'Thêm vật phẩm';
    document.getElementById('itemdef-name').value = data.name || '';
    document.getElementById('itemdef-icon').value = data.icon || '';
    const idInp = document.getElementById('itemdef-item-id');
    idInp.value = data.itemId || '';
    idInp.readOnly = isEdit; idInp.style.opacity = isEdit ? '0.6' : '1';
    fillCategorySelect(data.category || '');
    updateRoleHint();
    document.getElementById('itemdef-price').value = data.price || 0;
    document.getElementById('itemdef-quantity').value = data.quantity || 1;
    document.getElementById('itemdef-currency').value = data.currency || 'coins';
    document.getElementById('itemdef-discount').value = data.discountPercent || 0;
    document.getElementById('itemdef-sale-ends').value = toLocalInput(data.saleEndsAt);
    document.getElementById('itemdef-after-expiry').value = data.afterExpiry || 'unpublish';
    renderChildren(data.children);
    updateTotal();
    document.getElementById('itemdef-rarity').value = data.rarity || 'common';
    document.getElementById('itemdef-duration-type').value = data.durationType || 'permanent';
    document.getElementById('itemdef-duration-sec').value = data.durationSec || 0;
    document.getElementById('itemdef-order').value = data.order || 0;
    document.getElementById('itemdef-desc').value = data.description || '';
    document.getElementById('itemdef-effect').value = '';
    setEffFromData(data.effect);
    document.getElementById('itemdef-stackable').checked = data.stackable !== false;
    document.getElementById('itemdef-tradable').checked = !!data.tradable;
    document.getElementById('itemdef-active').checked = data.isActive !== false;
    document.getElementById('itemdef-published').checked = data.published !== false;
    setImage(data.image || '');
    document.getElementById('itemdef-modal').style.display = 'flex';
  }

  function initModal() {
    document.getElementById('btn-add-item-def')?.addEventListener('click', () => openModal());
    document.getElementById('btn-itemdef-cancel')?.addEventListener('click', () => { document.getElementById('itemdef-modal').style.display = 'none'; });
    document.getElementById('itemdef-search')?.addEventListener('input', render);
    document.getElementById('itemdef-filter-type')?.addEventListener('change', render);
    document.getElementById('itemdef-add-child')?.addEventListener('click', () => addChildRow('', 1));
    document.getElementById('itemdef-category')?.addEventListener('change', updateRoleHint);
    document.getElementById('itemdef-eff-type')?.addEventListener('change', e => showEffFields(e.target.value));
    document.getElementById('eff-cos-slot')?.addEventListener('change', e => _cosToggleStyleRow(e.target.value));
    ['itemdef-quantity', 'itemdef-price', 'itemdef-discount', 'itemdef-currency'].forEach(id =>
      document.getElementById(id)?.addEventListener('input', updateTotal));

    // Upload ảnh
    document.getElementById('itemdef-image-file')?.addEventListener('change', async function () {
      const file = this.files && this.files[0];
      if (!file) return;
      const role = document.getElementById('itemdef-category').value || 'item';
      const fd = new FormData(); fd.append('image', file);
      showToast('Đang tải ảnh...', 'info');
      try {
        const r = await fetch(`${API_URL}/admin/upload-image?role=${encodeURIComponent(role)}`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
        const j = await r.json();
        if (j.success) { setImage(j.url); showToast('Đã tải ảnh', 'success'); }
        else showToast(j.message || 'Tải ảnh thất bại', 'error');
      } catch (e) { showToast(e.message, 'error'); }
      this.value = '';
    });
    document.getElementById('itemdef-image-clear')?.addEventListener('click', () => setImage(''));

    document.getElementById('itemdef-form')?.addEventListener('submit', async function (e) {
      e.preventDefault();
      const id = document.getElementById('itemdef-id').value;
      let effect;
      try { effect = buildEffect(); } catch { showToast('Effect JSON (nâng cao) không hợp lệ', 'error'); return; }
      const payload = {
        itemId: document.getElementById('itemdef-item-id').value.trim(),
        name: document.getElementById('itemdef-name').value.trim(),
        description: document.getElementById('itemdef-desc').value.trim(),
        icon: document.getElementById('itemdef-icon').value.trim(),
        image: document.getElementById('itemdef-image').value.trim(),
        category: document.getElementById('itemdef-category').value,
        price: Number(document.getElementById('itemdef-price').value) || 0,
        quantity: Number(document.getElementById('itemdef-quantity').value) || 1,
        currency: document.getElementById('itemdef-currency').value,
        discountPercent: Number(document.getElementById('itemdef-discount').value) || 0,
        saleEndsAt: document.getElementById('itemdef-sale-ends').value
          ? new Date(document.getElementById('itemdef-sale-ends').value).toISOString() : null,
        afterExpiry: document.getElementById('itemdef-after-expiry').value,
        children: collectChildren(),
        rarity: document.getElementById('itemdef-rarity').value,
        stackable: document.getElementById('itemdef-stackable').checked,
        tradable: document.getElementById('itemdef-tradable').checked,
        durationType: document.getElementById('itemdef-duration-type').value,
        durationSec: Number(document.getElementById('itemdef-duration-sec').value) || 0,
        order: Number(document.getElementById('itemdef-order').value) || 0,
        isActive: document.getElementById('itemdef-active').checked,
        published: document.getElementById('itemdef-published').checked,
      };
      payload.effect = effect;
      const url = id ? `${API_URL}/admin/item-defs/${id}` : `${API_URL}/admin/item-defs`;
      const r = await fetch(url, { method: id ? 'PUT' : 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      showToast(j.message || (id ? 'Đã cập nhật' : 'Đã tạo'), j.success ? 'success' : 'error');
      if (j.success) { document.getElementById('itemdef-modal').style.display = 'none'; load(); }
    });
  }

  let inited = false;
  window.loadItemDefs = function () {
    if (!inited) { inited = true; initModal(); }
    load();
  };
})();
