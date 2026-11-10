// features/vocab/bai-nghe-admin.js — thêm bài nghe có script (VOA Learning English), ẩn/hiện.
//
// Tiêu đề, nguồn do admin nhập: LUÔN qua `esc()` trước khi vào innerHTML. Xem adminEscaping.test.js.
(function () {
  const TEN_CAP = { de: 'Dễ', vua: 'Vừa', kho: 'Khó' };
  const TEN_LANG = { en: 'Tiếng Anh', zh: 'Tiếng Trung' };
  const gioPhut = (s) => { const n = Math.round(Number(s) || 0); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };

  async function goi(url = '', opts = {}) {
    const r = await fetch(`${API_URL}/admin/bai-nghe${url}`, {
      method: opts.method || 'GET',
      headers: { Authorization: `Bearer ${getToken()}`, ...(opts.json ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.json ? JSON.stringify(opts.json) : opts.body,
    });
    const j = await r.json();
    if (!j.success) throw new Error(j.message || 'Thao tác thất bại');
    return j.data;
  }

  async function taiDs() {
    const tbody = document.getElementById('bn-ds');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    try {
      const ds = await goi();
      if (!ds.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:20px">Chưa có bài nghe nào.</td></tr>';
        return;
      }
      tbody.innerHTML = ds.map((b) => `<tr>
        <td style="white-space:normal">${esc(b.tieuDe)}<br><small style="color:var(--text-secondary)">${esc(b.nguon)} · ${Number(b.soCau) || 0} câu</small></td>
        <td>${esc(TEN_LANG[b.lang] || b.lang)}</td>
        <td>${esc(TEN_CAP[b.capDo] || b.capDo)}</td>
        <td>${esc(gioPhut(b.thoiLuong))}</td>
        <td>${b.an ? '<span style="color:var(--text-secondary)">Đang ẩn</span>' : '<span style="color:var(--success)">Đang hiện</span>'}</td>
        <td><button class="btn btn-secondary btn-sm" data-doi="${esc(b.id)}" data-an="${b.an ? '0' : '1'}">${b.an ? 'Hiện' : 'Ẩn'}</button></td>
      </tr>`).join('');
      tbody.querySelectorAll('[data-doi]').forEach((n) => n.addEventListener('click', async () => {
        try {
          await goi(`/${encodeURIComponent(n.dataset.doi)}`, { method: 'PATCH', json: { an: n.dataset.an === '1' } });
          taiDs();
        } catch (e) { alert(e.message); }
      }));
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger)">${esc(e.message)}</td></tr>`;
    }
  }

  async function them(ev) {
    ev.preventDefault();
    const nut = document.getElementById('bn-gui');
    const tt = document.getElementById('bn-trang-thai');
    const file = document.getElementById('bn-file').files[0];
    const url = document.getElementById('bn-url').value.trim();
    if (!file && !url) { tt.textContent = 'Hãy chọn file âm thanh hoặc dán link.'; return; }
    const fd = new FormData();
    fd.append('tieuDe', document.getElementById('bn-tieu-de').value);
    fd.append('lang', document.getElementById('bn-lang').value);
    fd.append('capDo', document.getElementById('bn-cap-do').value);
    fd.append('nguon', document.getElementById('bn-nguon').value);
    fd.append('nguonUrl', document.getElementById('bn-nguon-url').value);
    if (file) fd.append('audio', file); else fd.append('url', url);
    nut.disabled = true;
    tt.textContent = 'Đang lưu âm thanh và chép lời… (có thể mất vài phút, đừng đóng trang)';
    try {
      const b = await goi('', { method: 'POST', body: fd });
      tt.textContent = `Đã thêm "${b.tieuDe}": ${b.soCau} câu, ${gioPhut(b.thoiLuong)}.`;
      document.getElementById('bn-form').reset();
      taiDs();
    } catch (e) {
      tt.textContent = e.message;
    } finally {
      nut.disabled = false;
    }
  }

  let daNoi = false;

  window.loadBaiNghe = function () {
    // Nối listener MỘT lần, ở lần mở tab đầu tiên — giống các tab khác.
    if (!daNoi) {
      daNoi = true;
      document.getElementById('bn-form')?.addEventListener('submit', them);
      document.getElementById('btn-bn-reload')?.addEventListener('click', taiDs);
    }
    taiDs();
  };
})();
