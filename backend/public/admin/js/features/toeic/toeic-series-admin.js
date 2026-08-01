// features/toeic/toeic-series-admin.js — CRUD danh mục BỘ ĐỀ TOEIC.
//
// Danh mục này dựng thanh lọc bên Full Test của app. Trước đây thanh đó cắt
// regex từ tên đề, nên đặt tên lệch chuẩn là hỏng bộ lọc; nay lọc theo TIỀN TỐ
// source key do admin khai ở đây.
//
// Mọi giá trị nội suy vào HTML đều qua esc(): tên bộ do người dùng (admin) gõ,
// và bảng này dựng bằng innerHTML — xem utils.js/esc.
(function () {
  let inited = false;

  const keysCell = (keys) =>
    (Array.isArray(keys) ? keys : [])
      .map((k) => `<span class="badge info" style="font-family:monospace">${esc(k)}</span>`)
      .join(' ') || '<span style="color:var(--text-secondary)">—</span>';

  // Bộ khai từ khoá nhưng không vơ trúng đề nào = gõ sai tiền tố. Tô đỏ để
  // thấy ngay thay vì phải sang app bấm thử mới biết nút lọc rỗng.
  const countCell = (n) =>
    n > 0
      ? `<strong>${n}</strong>`
      : `<span style="color:var(--danger,#dc2626)" title="Không đề nào khớp — kiểm lại tiền tố">0 ⚠️</span>`;

  async function load() {
    const tbody = document.getElementById('ts-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    try {
      const r = await fetch(`${API_URL}/toeic-series/all`, { headers: adminHeaders() });
      const j = await r.json();
      const rows = j.success ? (j.data || []) : [];
      if (!tbody) return;

      tbody.innerHTML = rows.length
        ? rows.map((s) => `<tr>
            <td><strong>${esc(s.displayName)}</strong></td>
            <td>${keysCell(s.keys)}</td>
            <td>${countCell(s.testCount || 0)}</td>
            <td>${s.order || 0}</td>
            <td>${s.isActive !== false ? '<span class="badge success">Bật</span>' : '<span class="badge neutral">Tắt</span>'}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-secondary btn-sm ts-edit" data-id="${esc(s._id)}"><i class="fas fa-edit"></i></button>
              <button class="btn btn-sm ts-del" data-id="${esc(s._id)}" data-name="${esc(s.displayName)}" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`).join('')
        : '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:20px">Chưa có bộ đề nào — bấm "Gợi ý từ khoá" để lấy tiền tố có sẵn trong kho đề.</td></tr>';

      // Sửa: lấy thẳng từ `rows` đã nạp, không gọi lại API như bảng danh mục cũ.
      tbody.querySelectorAll('.ts-edit').forEach((b) => {
        b.onclick = () => {
          const s = rows.find((x) => String(x._id) === b.dataset.id);
          if (s) openModal(s);
        };
      });
      tbody.querySelectorAll('.ts-del').forEach((b) => {
        b.onclick = async () => {
          if (!confirm(`Xoá bộ đề "${b.dataset.name}"?\n\nĐề thi KHÔNG bị xoá — chỉ mất nút lọc này, đề rơi về nhóm "Khác".`)) return;
          const rr = await fetch(`${API_URL}/toeic-series/${b.dataset.id}`, { method: 'DELETE', headers: adminHeaders() });
          const jj = await rr.json();
          showToast(jj.message || 'Đã xoá', jj.success ? 'success' : 'error');
          if (jj.success) load();
        };
      });
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger)">${esc(e.message)}</td></tr>`;
    }
  }

  // Gợi ý tiền tố suy từ chính source đang có trong kho đề — admin khỏi phải tự
  // nhớ `ets26` hay `ets2026`. Bấm một gợi ý là điền thẳng vào form.
  async function loadSuggestions() {
    const box = document.getElementById('ts-suggest-box');
    if (!box) return;
    box.style.display = 'block';
    box.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang quét kho đề...';
    try {
      const r = await fetch(`${API_URL}/toeic-series/suggest`, { headers: adminHeaders() });
      const j = await r.json();
      const rows = j.success ? (j.data || []) : [];
      box.innerHTML = rows.length
        ? `<div style="margin-bottom:6px"><strong>Tiền tố tìm thấy trong kho đề</strong> — bấm để tạo bộ:</div>`
          + rows.map((s) => `<button type="button" class="btn btn-secondary btn-sm ts-sugg" data-key="${esc(s.key)}" style="margin:2px;font-family:monospace">${esc(s.key)} <span style="opacity:.7">(${s.testCount} đề)</span></button>`).join('')
        : 'Kho đề chưa có source nào để suy ra tiền tố.';

      box.querySelectorAll('.ts-sugg').forEach((b) => {
        b.onclick = () => {
          openModal({ keys: [b.dataset.key] });
          document.getElementById('ts-name')?.focus();
        };
      });
    } catch (e) {
      box.innerHTML = `<span style="color:var(--danger)">${esc(e.message)}</span>`;
    }
  }

  function openModal(s) {
    s = s || {};
    document.getElementById('ts-id').value = s._id || '';
    document.getElementById('ts-modal-title').textContent = s._id ? 'Sửa bộ đề' : 'Thêm bộ đề';
    document.getElementById('ts-name').value = s.displayName || '';
    document.getElementById('ts-keys').value = (Array.isArray(s.keys) ? s.keys : []).join(', ');
    document.getElementById('ts-order').value = s.order || 0;
    document.getElementById('ts-active').checked = s.isActive !== false;
    document.getElementById('ts-modal').style.display = 'flex';
  }

  function initModal() {
    document.getElementById('btn-add-ts')?.addEventListener('click', () => openModal());
    document.getElementById('btn-ts-suggest')?.addEventListener('click', loadSuggestions);
    document.getElementById('btn-ts-cancel')?.addEventListener('click', () => {
      document.getElementById('ts-modal').style.display = 'none';
    });
    document.getElementById('ts-form')?.addEventListener('submit', async function (e) {
      e.preventDefault();
      const id = document.getElementById('ts-id').value;
      const payload = {
        displayName: document.getElementById('ts-name').value.trim(),
        // Gửi nguyên chuỗi "a, b" — server tự tách/chuẩn hoá (utils/toeicSeries).
        keys: document.getElementById('ts-keys').value.trim(),
        order: Number(document.getElementById('ts-order').value) || 0,
        isActive: document.getElementById('ts-active').checked,
      };
      const url = id ? `${API_URL}/toeic-series/${id}` : `${API_URL}/toeic-series`;
      const r = await fetch(url, {
        method: id ? 'PUT' : 'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      showToast(j.message || (id ? 'Đã cập nhật' : 'Đã tạo'), j.success ? 'success' : 'error');
      if (j.success) {
        document.getElementById('ts-modal').style.display = 'none';
        load();
      }
    });
  }

  window.loadToeicSeries = function () {
    if (!inited) { inited = true; initModal(); }
    load();
  };
})();
