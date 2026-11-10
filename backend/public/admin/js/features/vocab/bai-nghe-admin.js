// features/vocab/bai-nghe-admin.js — thêm bài nghe có script (VOA Learning English), ẩn/hiện.
//
// Tiêu đề, nguồn do admin nhập: LUÔN qua `esc()` trước khi vào innerHTML. Xem adminEscaping.test.js.
(function () {
  const TEN_CAP = { de: 'Dễ', vua: 'Vừa', kho: 'Khó' };
  const TEN_LANG = { en: 'Tiếng Anh', zh: 'Tiếng Trung' };
  const gioPhut = (s) => { const n = Math.round(Number(s) || 0); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
  const mb = (b) => `${(Number(b || 0) / 1048576).toFixed(1)} MB`;

  /** Thanh mức dùng Cloudinary: credit dùng chung cho lưu trữ, băng thông xem và xử lý. */
  async function taiDungLuong() {
    const el = document.getElementById('bn-dung-luong');
    if (!el) return;
    try {
      const d = await goi('/dung-luong');
      const c = d.cloudinary || {};
      const bn = d.baiNghe || {};
      const thuVien = `Thư viện bài nghe: <b>${Number(bn.soBai) || 0}</b> bài (${Number(bn.soVideo) || 0} video), chiếm <b>${esc(mb(bn.byte))}</b> file gốc.`;
      if (c.loi || c.phanTram === null || c.phanTram === undefined) {
        el.innerHTML = `${thuVien}<br><span style="color:var(--text-secondary)">Chưa đọc được mức dùng Cloudinary${c.loi ? `: ${esc(c.loi)}` : ''}.</span>`;
        return;
      }
      const pt = Number(c.phanTram);
      const mau = pt >= Number(c.nguong) ? 'var(--danger)' : pt >= Number(c.nguong) - 15 ? 'var(--warning)' : 'var(--success)';
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span>Đã dùng <b>${pt}%</b> credit tháng này (${Number(c.daDung).toFixed(2)} / ${Number(c.hanMuc)})</span>
          <span style="color:var(--text-secondary)">Ngưỡng dừng nhận file mới: ${Number(c.nguong)}%</span>
        </div>
        <div style="height:8px;border-radius:4px;background:var(--border-color);overflow:hidden">
          <div style="height:100%;width:${Math.min(100, pt)}%;background:${mau}"></div>
        </div>
        <div style="margin-top:6px;color:var(--text-secondary)">Lưu trữ ${esc(mb(c.luuTruByte))} · Băng thông tháng ${esc(mb(c.bangThongByte))}. ${thuVien}</div>
        ${pt >= Number(c.nguong) ? '<div style="margin-top:6px;color:var(--danger)">Đã chạm ngưỡng: tạm không nhận bài mới. Xoá bớt bài ít dùng hoặc chờ sang tháng.</div>' : ''}`;
    } catch (e) {
      el.textContent = e.message;
    }
  }

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
    tbody.innerHTML = '<tr><td colspan="7" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    try {
      const ds = await goi();
      if (!ds.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:20px">Chưa có bài nghe nào.</td></tr>';
        return;
      }
      tbody.innerHTML = ds.map((b) => `<tr>
        <td style="white-space:normal">${esc(b.tieuDe)}<br><small style="color:var(--text-secondary)">${esc(b.nguon)} · ${Number(b.soCau) || 0} câu</small></td>
        <td>${esc(TEN_LANG[b.lang] || b.lang)}</td>
        <td>${esc(TEN_CAP[b.capDo] || b.capDo)}</td>
        <td>${b.coHinh ? '<i class="fas fa-film" title="Có video"></i> ' : ''}${esc(gioPhut(b.thoiLuong))}</td>
        <td>${esc(mb(b.byte))}</td>
        <td>${b.an ? '<span style="color:var(--text-secondary)">Đang ẩn</span>' : '<span style="color:var(--success)">Đang hiện</span>'}</td>
        <td><button class="btn btn-secondary btn-sm" data-doi="${esc(b.id)}" data-an="${b.an ? '0' : '1'}">${b.an ? 'Hiện' : 'Ẩn'}</button>
          <button class="btn btn-danger btn-sm" data-xoa="${esc(b.id)}" data-ten="${esc(b.tieuDe)}"><i class="fas fa-trash"></i> Xoá hẳn</button></td>
      </tr>`).join('');
      tbody.querySelectorAll('[data-xoa]').forEach((n) => n.addEventListener('click', async () => {
        if (!confirm(`Xoá hẳn bài "${n.dataset.ten}"? File trên Cloudinary và script sẽ bị xoá, không lấy lại được. Chỉ muốn người học không thấy thì bấm "Ẩn".`)) return;
        try {
          await goi(`/${encodeURIComponent(n.dataset.xoa)}`, { method: 'DELETE' });
          taiDs();
          taiDungLuong();
        } catch (e) { alert(e.message); }
      }));
      tbody.querySelectorAll('[data-doi]').forEach((n) => n.addEventListener('click', async () => {
        try {
          await goi(`/${encodeURIComponent(n.dataset.doi)}`, { method: 'PATCH', json: { an: n.dataset.an === '1' } });
          taiDs();
        } catch (e) { alert(e.message); }
      }));
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--danger)">${esc(e.message)}</td></tr>`;
    }
  }

  /** Tải file lên Cloudinary bằng chữ ký server cấp, báo tiến độ; trả `public_id`. */
  function taiLenCloudinary(file, ck, baoTienDo) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('api_key', ck.apiKey);
      fd.append('timestamp', ck.timestamp);
      fd.append('signature', ck.signature);
      fd.append('folder', ck.folder);
      const xhr = new XMLHttpRequest();
      // Âm thanh và video đều thuộc nhóm `video` của Cloudinary.
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(ck.cloudName)}/video/upload`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) baoTienDo(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        let j = {};
        try { j = JSON.parse(xhr.responseText); } catch (_) { /* phản hồi lạ */ }
        if (xhr.status >= 200 && xhr.status < 300 && j.public_id) resolve(j.public_id);
        else reject(new Error(j.error?.message || `Tải lên Cloudinary thất bại (HTTP ${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error('Mất kết nối khi tải file lên Cloudinary.'));
      xhr.send(fd);
    });
  }

  async function them(ev) {
    ev.preventDefault();
    const nut = document.getElementById('bn-gui');
    const tt = document.getElementById('bn-trang-thai');
    const file = document.getElementById('bn-file').files[0];
    const url = document.getElementById('bn-url').value.trim();
    if (!file && !url) { tt.textContent = 'Hãy chọn file (MP3 hoặc MP4) hoặc dán link.'; return; }
    const thongTin = {
      tieuDe: document.getElementById('bn-tieu-de').value,
      lang: document.getElementById('bn-lang').value,
      capDo: document.getElementById('bn-cap-do').value,
      nguon: document.getElementById('bn-nguon').value,
      nguonUrl: document.getElementById('bn-nguon-url').value,
    };
    nut.disabled = true;
    try {
      if (file) {
        // Tải THẲNG lên Cloudinary (file không đi qua server), rồi chỉ gửi mã file cho server.
        const ck = await goi('/chu-ky');
        if (file.size > ck.toiDaByte) throw new Error(`File ${Math.round(file.size / 1048576)} MB, tối đa ${Math.round(ck.toiDaByte / 1048576)} MB.`);
        thongTin.cloudinaryId = await taiLenCloudinary(file, ck, (pt) => { tt.textContent = `Đang tải file lên… ${pt}%`; });
      } else {
        thongTin.url = url;
      }
      tt.textContent = 'Đang chép lời và chia câu… (có thể mất vài phút, đừng đóng trang)';
      const b = await goi('', { method: 'POST', json: thongTin });
      tt.textContent = `Đã thêm "${b.tieuDe}"${b.coHinh ? ' (có video)' : ''}: ${b.soCau} câu, ${gioPhut(b.thoiLuong)}.`;
      document.getElementById('bn-form').reset();
      taiDs();
      taiDungLuong();
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
      document.getElementById('btn-bn-reload')?.addEventListener('click', () => { taiDs(); taiDungLuong(); });
    }
    taiDs();
    taiDungLuong();
  };
})();
