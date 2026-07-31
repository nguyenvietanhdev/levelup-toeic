// modules/channel-config-admin.js — widget CHỌN DANH MỤC hiển thị cho mỗi kênh.
// Gắn 1 container: <div class="channel-cat-picker" data-channel="shop|spin|quest|achievement"></div>
// rồi gọi window.initChannelCatPicker('shop') khi mở tab tương ứng.
(function () {
  let ITEM_CATS = null;

  async function loadItemCats() {
    if (!ITEM_CATS) {
      try { const r = await fetch(`${API_URL}/categories?domain=item`); const j = await r.json(); ITEM_CATS = j.success ? j.data : []; }
      catch (_) { ITEM_CATS = []; }
    }
    return ITEM_CATS;
  }

  const catLabel = (c) => `${(c.icon || '')} ${c.label}`;

  async function mount(el) {
    if (el.dataset.mounted === '1') return;
    el.dataset.mounted = '1';
    const channel = el.dataset.channel;
    const cats = await loadItemCats();
    let selected = [];
    try {
      const r = await fetch(`${API_URL}/admin/channel-config/${channel}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const j = await r.json();
      selected = j.success ? (j.data.categories || []) : [];
    } catch (_) {}

    const boxes = cats.length ? cats.map(c => `
      <label style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1.5px solid var(--border-color);border-radius:20px;cursor:pointer;font-size:13px;background:var(--bg-secondary,#fff)">
        <input type="checkbox" value="${c.key}" ${selected.includes(c.key) ? 'checked' : ''}> ${catLabel(c)}
      </label>`).join('') : '<em style="color:var(--text-secondary)">Chưa có danh mục vật phẩm. Tạo ở tab “Danh mục” (📦 Vật phẩm).</em>';

    el.innerHTML = `
      <div style="border:1.5px dashed var(--border-color);border-radius:12px;padding:14px 16px;margin-bottom:16px;background:var(--bg-tertiary,#f8fafc)">
        <div style="font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:8px">
          <i class="fas fa-filter"></i> Danh mục vật phẩm hiển thị ở kênh này
          <small style="font-weight:400;color:var(--text-secondary)">— tick danh mục → chỉ item <b>đã xuất bản</b> thuộc đó mới hiện ra giao diện</small>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">${boxes}</div>
        <button class="btn btn-success btn-sm ccp-save"><i class="fas fa-save"></i> Lưu danh mục hiển thị</button>
        <span class="ccp-status" style="margin-left:10px;font-size:12px;color:var(--text-secondary)"></span>
      </div>`;

    el.querySelector('.ccp-save').onclick = async () => {
      const chosen = [...el.querySelectorAll('input[type="checkbox"]:checked')].map(i => i.value);
      const status = el.querySelector('.ccp-status');
      status.textContent = 'Đang lưu...';
      try {
        const r = await fetch(`${API_URL}/admin/channel-config/${channel}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ categories: chosen }),
        });
        const j = await r.json();
        showToast(j.message || 'Đã lưu', j.success ? 'success' : 'error');
        status.textContent = j.success ? `Đã chọn ${chosen.length} danh mục` : '';
      } catch (e) { showToast(e.message, 'error'); status.textContent = ''; }
    };
  }

  window.initChannelCatPicker = function (channel) {
    document.querySelectorAll(`.channel-cat-picker[data-channel="${channel}"]`).forEach(mount);
  };
})();
