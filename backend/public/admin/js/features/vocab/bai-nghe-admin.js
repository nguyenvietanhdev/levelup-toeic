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
    tbody.innerHTML = '<tr><td colspan="8" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    try {
      const ds = await goi();
      if (!ds.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-secondary);padding:20px">Chưa có bài nghe nào.</td></tr>';
        return;
      }
      tbody.innerHTML = ds.map((b) => `<tr>
        <td>${anhNho(b)}</td>
        <td style="white-space:normal">${esc(b.tieuDe)}<br><small style="color:var(--text-secondary)">${esc(b.nguon)} · ${Number(b.soCau) || 0} câu</small></td>
        <td>${esc(TEN_LANG[b.lang] || b.lang)}</td>
        <td>${esc(TEN_CAP[b.capDo] || b.capDo)}</td>
        <td>${b.coHinh ? '<i class="fas fa-film" title="Có video"></i> ' : ''}${esc(gioPhut(b.thoiLuong))}</td>
        <td>${esc(mb(b.byte))}</td>
        <td>${b.an ? '<span style="color:var(--text-secondary)">Đang ẩn</span>' : '<span style="color:var(--success)">Đang hiện</span>'}</td>
        <td><button class="btn btn-primary btn-sm" data-sua="${esc(b.id)}"><i class="fas fa-pen"></i> Sửa</button>
          <button class="btn btn-secondary btn-sm" data-doi="${esc(b.id)}" data-an="${b.an ? '0' : '1'}">${b.an ? 'Hiện' : 'Ẩn'}</button>
          <button class="btn btn-danger btn-sm" data-xoa="${esc(b.id)}" data-ten="${esc(b.tieuDe)}"><i class="fas fa-trash"></i> Xoá hẳn</button></td>
      </tr>`).join('');
      tbody.querySelectorAll('[data-sua]').forEach((n) => n.addEventListener('click', () => moSua(n.dataset.sua)));
      tbody.querySelectorAll('[data-xem]').forEach((n) => n.addEventListener('click', () => moXem(n.dataset.xem, n.dataset.hinh === '1', n.dataset.ten)));
      tbody.querySelectorAll('[data-xoa]').forEach((n) => n.addEventListener('click', () => xoaBai(n.dataset.xoa, n.dataset.ten)));
      tbody.querySelectorAll('[data-doi]').forEach((n) => n.addEventListener('click', async () => {
        try {
          await goi(`/${encodeURIComponent(n.dataset.doi)}`, { method: 'PATCH', json: { an: n.dataset.an === '1' } });
          taiDs();
        } catch (e) { alert(e.message); }
      }));
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--danger)">${esc(e.message)}</td></tr>`;
    }
  }

  /**
   * Ảnh bìa nhỏ, bấm là mở POPUP nổi phát video/âm thanh ngay trên trang (không mở tab mới). Link do
   * server trả (Cloudinary): chỉ nhận https, vẫn escape trước khi vào HTML.
   */
  function anhNho(b) {
    const link = /^https:\/\//.test(b.mediaUrl || '') ? b.mediaUrl : '';
    const hinh = /^https:\/\//.test(b.anhBia || '')
      ? `<img src="${esc(b.anhBia)}" alt="" loading="lazy" style="width:112px;aspect-ratio:16/9;object-fit:cover;border-radius:6px;display:block">`
      : '<span style="display:flex;width:112px;aspect-ratio:16/9;border-radius:6px;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--primary),#6366f1);color:#fff"><i class="fas fa-headphones"></i></span>';
    if (!link) return hinh;
    return `<button type="button" data-xem="${esc(link)}" data-hinh="${b.coHinh ? '1' : '0'}" data-ten="${esc(b.tieuDe)}"
      title="Xem / nghe" style="position:relative;padding:0;border:0;background:none;cursor:pointer;display:block">${hinh}
      <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;text-shadow:0 1px 4px rgba(0,0,0,.6)"><i class="fas fa-circle-play"></i></span></button>`;
  }

  /** Popup nổi phát file của một bài. Đóng bằng nút X, bấm nền tối hoặc phím Esc; đóng là dừng phát. */
  function moXem(link, coHinh, ten) {
    const modal = document.getElementById('bn-xem-modal');
    if (!modal || !/^https:\/\//.test(link)) return;
    document.getElementById('bn-xem-ten').textContent = ten || '';
    document.getElementById('bn-xem-noi-dung').innerHTML = coHinh
      ? `<video src="${esc(link)}" controls autoplay playsinline style="width:100%;max-height:70vh;border-radius:10px;background:#000;display:block"></video>`
      : `<audio src="${esc(link)}" controls autoplay style="width:100%"></audio>`;
    modal.style.display = 'flex';
  }

  function dongXem() {
    const modal = document.getElementById('bn-xem-modal');
    if (!modal || modal.style.display === 'none') return;
    modal.querySelector('video, audio')?.pause();
    document.getElementById('bn-xem-noi-dung').innerHTML = '';
    modal.style.display = 'none';
  }

  /**
   * Xoá hẳn một bài (file video/âm thanh trên Cloudinary + script). Hỏi lại trước vì không lấy lại
   * được; chỉ muốn người học không thấy thì dùng "Ẩn". Trả true nếu đã xoá.
   */
  async function xoaBai(id, ten) {
    if (!confirm(`Xoá hẳn bài "${ten}"? File trên Cloudinary và script sẽ bị xoá, không lấy lại được. Chỉ muốn người học không thấy thì bấm "Ẩn".`)) return false;
    try {
      await goi(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
      taiDs();
      taiDungLuong();
      return true;
    } catch (e) {
      alert(e.message);
      return false;
    }
  }

  // ── Sửa bài: thông tin, và chữ từng câu script (giữ nguyên mốc thời gian) ──
  let dangSua = null;

  async function moSua(id) {
    const modal = document.getElementById('bn-sua-modal');
    const tt = document.getElementById('bn-sua-trang-thai');
    try {
      const b = await goi(`/${encodeURIComponent(id)}`);
      dangSua = b;
      document.getElementById('bn-sua-tieu-de').value = b.tieuDe || '';
      document.getElementById('bn-sua-cap-do').value = b.capDo || 'vua';
      document.getElementById('bn-sua-nguon').value = b.nguon || '';
      document.getElementById('bn-sua-nguon-url').value = b.nguonUrl || '';
      const xem = document.getElementById('bn-sua-xem');
      xem.innerHTML = /^https:\/\//.test(b.mediaUrl || '')
        ? (b.coHinh
          ? `<video src="${esc(b.mediaUrl)}" controls preload="metadata" style="width:100%;max-height:240px;border-radius:8px;background:#000"></video>`
          : `<audio src="${esc(b.mediaUrl)}" controls preload="metadata" style="width:100%"></audio>`)
        : '';
      document.getElementById('bn-sua-script').innerHTML = (b.cau || []).map((c, i) => `
        <div style="display:grid;grid-template-columns:56px 1fr;gap:8px;align-items:start;margin-bottom:6px">
          <button type="button" class="btn btn-secondary btn-sm" data-nghe="${Number(c.batDau)}" title="Nghe từ câu này">${esc(gioPhut(c.batDau))}</button>
          <textarea data-cau="${i}" rows="2" maxlength="600" style="width:100%;padding:6px 8px;border:1.5px solid var(--border-color);border-radius:6px;font:inherit;resize:vertical">${esc(c.text)}</textarea>
        </div>`).join('');
      document.querySelectorAll('#bn-sua-script [data-nghe]').forEach((n) => n.addEventListener('click', () => {
        const m = document.querySelector('#bn-sua-xem video, #bn-sua-xem audio');
        if (m) { m.currentTime = Number(n.dataset.nghe); m.play().catch(() => {}); }
      }));
      tt.textContent = '';
      modal.style.display = 'flex';
    } catch (e) {
      alert(e.message);
    }
  }

  function dongSua() {
    document.querySelector('#bn-sua-xem video, #bn-sua-xem audio')?.pause();
    document.getElementById('bn-sua-modal').style.display = 'none';
    dangSua = null;
  }

  async function luuSua(ev) {
    ev.preventDefault();
    if (!dangSua) return;
    const tt = document.getElementById('bn-sua-trang-thai');
    const nut = document.getElementById('bn-sua-luu');
    const cau = [...document.querySelectorAll('#bn-sua-script [data-cau]')]
      .sort((a, b) => Number(a.dataset.cau) - Number(b.dataset.cau)).map((t) => t.value);
    nut.disabled = true;
    tt.textContent = 'Đang lưu…';
    try {
      await goi(`/${encodeURIComponent(dangSua.id)}`, {
        method: 'PATCH',
        json: {
          tieuDe: document.getElementById('bn-sua-tieu-de').value,
          capDo: document.getElementById('bn-sua-cap-do').value,
          nguon: document.getElementById('bn-sua-nguon').value,
          nguonUrl: document.getElementById('bn-sua-nguon-url').value,
          cau,
        },
      });
      dongSua();
      taiDs();
    } catch (e) {
      tt.textContent = e.message;
    } finally {
      nut.disabled = false;
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
      const { bai: b } = await goi('', { method: 'POST', json: thongTin });
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
      document.getElementById('bn-sua-form')?.addEventListener('submit', luuSua);
      document.getElementById('bn-sua-huy')?.addEventListener('click', dongSua);
      document.getElementById('bn-sua-xoa')?.addEventListener('click', async () => {
        if (dangSua && await xoaBai(dangSua.id, dangSua.tieuDe)) dongSua();
      });
      document.getElementById('bn-sua-modal')?.addEventListener('click', (e) => { if (e.target.id === 'bn-sua-modal') dongSua(); });
      document.getElementById('bn-xem-modal')?.addEventListener('click', (e) => { if (e.target.id === 'bn-xem-modal') dongXem(); });
      document.getElementById('bn-xem-dong')?.addEventListener('click', dongXem);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dongXem(); });
    }
    taiDs();
    taiDungLuong();
  };
})();
