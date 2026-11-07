// features/vocab/ngu-phap-ai-admin.js — nội dung ngữ pháp do AI tạo: báo cáo sai và thư viện.
//
// Mọi chuỗi ở đây đều do AI soạn hoặc do người dùng nhập (email, câu tra), nên LUÔN qua `esc()`
// trước khi vào innerHTML. Xem adminEscaping.test.js.
(function () {
  let trangBaoCao = 1;
  let trangThuVien = 1;

  const ngay = (d) => (d ? new Date(d).toLocaleString('vi-VN') : '');

  async function goi(url, method = 'GET') {
    const r = await fetch(`${API_URL}/admin/ngu-phap${url}`, { method, headers: { Authorization: `Bearer ${getToken()}` } });
    const j = await r.json();
    if (!j.success) throw new Error(j.message || 'Thao tác thất bại');
    return j.data;
  }

  /** Nút chuyển trang; `so` là số nguyên do server trả nên không cần escape. */
  function phanTrang(el, trang, soTrang, chuyen) {
    if (!el) return;
    if (soTrang <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = `<button class="btn btn-secondary btn-sm" data-trang="${trang - 1}" ${trang <= 1 ? 'disabled' : ''}>‹ Trước</button>
      <span style="margin:0 8px">Trang ${Number(trang)}/${Number(soTrang)}</span>
      <button class="btn btn-secondary btn-sm" data-trang="${trang + 1}" ${trang >= soTrang ? 'disabled' : ''}>Sau ›</button>`;
    el.querySelectorAll('button[data-trang]').forEach((b) => b.addEventListener('click', () => chuyen(Number(b.dataset.trang))));
  }

  async function taiBaoCao() {
    const tbody = document.getElementById('npai-bao-cao');
    const trangThai = document.getElementById('npai-trang-thai')?.value || 'cho-xu-ly';
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    try {
      const d = await goi(`/bao-sai?trangThai=${encodeURIComponent(trangThai)}&trang=${trangBaoCao}`);
      const tk = d.thongKe || {};
      const elTk = document.getElementById('npai-thong-ke');
      if (elTk) {
        elTk.innerHTML = `Chờ xử lý: <b>${Number(tk['cho-xu-ly'] || 0)}</b> · Đã xác nhận sai: <b>${Number(tk['da-xac-nhan'] || 0)}</b> · Đã khôi phục: <b>${Number(tk['da-khoi-phuc'] || 0)}</b>`;
      }
      if (!d.baoCao.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:20px">Không có báo cáo nào.</td></tr>';
      } else {
        tbody.innerHTML = d.baoCao.map((b) => `<tr>
          <td>${esc(b.congThuc)}<br><small style="color:var(--text-secondary)">${b.loai === 'muc' ? 'Cả mục' : 'Câu luyện'}</small></td>
          <td style="white-space:normal">${esc(b.noiDung)}</td>
          <td>${esc(b.nguoiBao)}</td>
          <td>${esc(ngay(b.luc))}</td>
          <td>${b.daKhoiPhuc ? '<span style="color:var(--success)">Đã khôi phục</span>' : `
            <button class="btn btn-secondary btn-sm" data-khoi-phuc="${esc(b.id)}"><i class="fas fa-rotate-left"></i> Khôi phục</button>
            ${b.daXuLy ? '' : `<button class="btn btn-danger btn-sm" data-xac-nhan="${esc(b.id)}"><i class="fas fa-check"></i> Xác nhận sai</button>`}`}
          </td>
        </tr>`).join('');
        tbody.querySelectorAll('[data-khoi-phuc]').forEach((n) => n.addEventListener('click', () => xuLy(n.dataset.khoiPhuc, 'khoi-phuc')));
        tbody.querySelectorAll('[data-xac-nhan]').forEach((n) => n.addEventListener('click', () => xuLy(n.dataset.xacNhan, 'xac-nhan')));
      }
      phanTrang(document.getElementById('npai-trang-bao-cao'), d.trang, d.soTrang, (so) => { trangBaoCao = so; taiBaoCao(); });
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger)">${esc(e.message)}</td></tr>`;
    }
  }

  async function xuLy(id, hanhDong) {
    try {
      await goi(`/bao-sai/${encodeURIComponent(id)}/${hanhDong}`, 'POST');
      await Promise.all([taiBaoCao(), taiThuVien()]);
    } catch (e) {
      alert(e.message);
    }
  }

  async function taiThuVien() {
    const tbody = document.getElementById('npai-thu-vien');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    try {
      const d = await goi(`/thu-vien?trang=${trangThuVien}`);
      if (!d.muc.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:20px">Thư viện chưa có mục nào do AI tạo.</td></tr>';
      } else {
        tbody.innerHTML = d.muc.map((m) => `<tr>
          <td>${esc(m.ten)}</td>
          <td>${esc(m.cauTra)}</td>
          <td>${Number(m.soCongThuc)} / ${Number(m.soViDu)}</td>
          <td>${esc(ngay(m.luc))}</td>
          <td><button class="btn btn-danger btn-sm" data-an="${esc(m.id)}"><i class="fas fa-eye-slash"></i> Ẩn</button></td>
        </tr>`).join('');
        tbody.querySelectorAll('[data-an]').forEach((n) => n.addEventListener('click', async () => {
          if (!confirm('Ẩn mục này khỏi thư viện cho mọi người? Có thể khôi phục ở danh sách báo cáo.')) return;
          try {
            await goi(`/thu-vien/${encodeURIComponent(n.dataset.an)}/an`, 'POST');
            await Promise.all([taiBaoCao(), taiThuVien()]);
          } catch (e) {
            alert(e.message);
          }
        }));
      }
      phanTrang(document.getElementById('npai-trang-thu-vien'), d.trang, d.soTrang, (so) => { trangThuVien = so; taiThuVien(); });
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger)">${esc(e.message)}</td></tr>`;
    }
  }

  let daNoi = false;

  window.loadNguPhapAi = function () {
    // Nối listener MỘT lần, ở lần mở tab đầu tiên — giống các tab khác.
    if (!daNoi) {
      daNoi = true;
      document.getElementById('btn-npai-reload')?.addEventListener('click', () => { taiBaoCao(); taiThuVien(); });
      document.getElementById('npai-trang-thai')?.addEventListener('change', () => { trangBaoCao = 1; taiBaoCao(); });
    }
    taiBaoCao();
    taiThuVien();
  };
})();
