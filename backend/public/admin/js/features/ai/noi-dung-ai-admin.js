// features/ai/noi-dung-ai-admin.js — quản lý mọi nội dung AI đã lưu trong DB (xem, thêm, sửa, xoá/ẩn).
//
// Một bảng và một form dùng chung cho mọi loại: server mô tả cột (`cot`) và ô nhập (`truong`) của
// từng loại, ở đây chỉ dựng theo. Nội dung do AI soạn hoặc người dùng nhập nên LUÔN qua `esc()`
// trước khi vào innerHTML (xem adminEscaping.test.js). Ô nhập điền giá trị bằng `.value`, không
// nối chuỗi.
(function () {
  let dsLoai = [];
  let loai = '';
  let trang = 1;
  let dangSua = null; // { id, giaTri, chiXem } | null
  let henTim = null;

  const ngay = (d) => (d ? new Date(d).toLocaleString('vi-VN') : '');
  const loaiHienTai = () => dsLoai.find((l) => l.key === loai);

  async function goi(url = '', { method = 'GET', json } = {}) {
    const r = await fetch(`${API_URL}/admin/noi-dung-ai${url}`, {
      method,
      headers: { Authorization: `Bearer ${getToken()}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
      body: json ? JSON.stringify(json) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!j.success) throw new Error(j.message || 'Thao tác thất bại');
    return j.data;
  }

  function dungSelect() {
    const sel = document.getElementById('nda-loai');
    if (!sel) return;
    const nhom = [...new Set(dsLoai.map((l) => l.nhom))];
    sel.innerHTML = nhom.map((n) => `<optgroup label="${esc(n)}">${dsLoai.filter((l) => l.nhom === n)
      .map((l) => `<option value="${esc(l.key)}">${esc(l.ten)}</option>`).join('')}</optgroup>`).join('');
    sel.value = loai;
  }

  /** Tô mục sidebar đúng loại đang xem (đổi loại bằng dropdown trong tab cũng tô theo). */
  function toSidebar() {
    const link = document.querySelector(`.sidebar-link[data-main-tab="noi-dung-ai"][data-ai-loai="${CSS.escape(loai)}"]`);
    if (!link) return;
    document.querySelectorAll('.sidebar-link[data-main-tab]').forEach((l) => l.classList.remove('active'));
    link.classList.add('active');
  }

  function phanTrang(soTrang) {
    const el = document.getElementById('nda-trang');
    if (!el) return;
    if (soTrang <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = `<button class="btn btn-secondary btn-sm" data-trang="${trang - 1}" ${trang <= 1 ? 'disabled' : ''}>‹ Trước</button>
      <span style="margin:0 8px">Trang ${Number(trang)}/${Number(soTrang)}</span>
      <button class="btn btn-secondary btn-sm" data-trang="${trang + 1}" ${trang >= soTrang ? 'disabled' : ''}>Sau ›</button>`;
    el.querySelectorAll('button[data-trang]').forEach((b) => b.addEventListener('click', () => { trang = Number(b.dataset.trang); tai(); }));
  }

  function nutThaoTac(l, h) {
    const id = esc(h.id);
    const nut = [`<button class="btn btn-secondary btn-sm" data-sua="${id}"><i class="fas ${l.suaDuoc ? 'fa-pen' : 'fa-eye'}"></i> ${l.suaDuoc ? 'Sửa' : 'Xem'}</button>`];
    if (l.xoa === 'an') {
      nut.push(h.an
        ? `<button class="btn btn-secondary btn-sm" data-hien="${id}"><i class="fas fa-eye"></i> Hiện lại</button>`
        : `<button class="btn btn-danger btn-sm" data-an="${id}"><i class="fas fa-eye-slash"></i> Ẩn</button>`);
    } else if (l.xoa) {
      nut.push(`<button class="btn btn-danger btn-sm" data-xoa="${id}"><i class="fas fa-trash"></i> Xoá</button>`);
    }
    return nut.join(' ');
  }

  let hangHienTai = [];

  async function tai() {
    const l = loaiHienTai();
    const tbody = document.getElementById('nda-ds');
    const dau = document.getElementById('nda-dau');
    if (!l || !tbody || !dau) return;
    const soCot = l.cot.length + 1;
    document.getElementById('nda-mo-ta').textContent = l.moTa || '';
    document.getElementById('btn-nda-them').style.display = l.themDuoc ? '' : 'none';
    document.getElementById('nda-lang-nhan').style.display = l.locLang ? '' : 'none';
    dau.innerHTML = l.cot.map((c) => `<th>${esc(c.ten)}</th>`).join('') + '<th style="width:190px">Thao tác</th>';
    tbody.innerHTML = `<tr><td colspan="${soCot}" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>`;
    const q = new URLSearchParams({ trang: String(trang) });
    const tim = document.getElementById('nda-q')?.value.trim();
    const lang = l.locLang ? document.getElementById('nda-lang')?.value : '';
    if (tim) q.set('q', tim);
    if (lang) q.set('lang', lang);
    const cua = loai;
    try {
      const d = await goi(`/${encodeURIComponent(l.key)}?${q}`);
      if (cua !== loai) return; // đã đổi loại trong lúc chờ
      hangHienTai = d.ds || [];
      document.getElementById('nda-tong').innerHTML = `Có <b>${Number(d.tong || 0)}</b> mục.`;
      if (!hangHienTai.length) {
        tbody.innerHTML = `<tr><td colspan="${soCot}" style="text-align:center;color:var(--text-secondary);padding:20px">Chưa có nội dung nào.</td></tr>`;
      } else {
        tbody.innerHTML = hangHienTai.map((h) => `<tr${h.an ? ' style="opacity:.55"' : ''}>
          ${l.cot.map((c) => `<td style="white-space:normal;max-width:360px">${esc(c.kieu === 'ngay' ? ngay(h.cot[c.key]) : h.cot[c.key])}</td>`).join('')}
          <td>${nutThaoTac(l, h)}</td>
        </tr>`).join('');
        tbody.querySelectorAll('[data-sua]').forEach((n) => n.addEventListener('click', () => moForm(n.dataset.sua)));
        tbody.querySelectorAll('[data-xoa]').forEach((n) => n.addEventListener('click', () => xoa(n.dataset.xoa)));
        tbody.querySelectorAll('[data-an]').forEach((n) => n.addEventListener('click', () => datAn(n.dataset.an, true)));
        tbody.querySelectorAll('[data-hien]').forEach((n) => n.addEventListener('click', () => datAn(n.dataset.hien, false)));
      }
      phanTrang(Number(d.soTrang) || 1);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="${soCot}" style="text-align:center;color:var(--danger)">${esc(e.message)}</td></tr>`;
    }
  }

  async function xoa(id) {
    const l = loaiHienTai();
    const h = hangHienTai.find((x) => x.id === id);
    const ten = h ? Object.values(h.cot)[0] : '';
    const loiNhan = l.xoa === 'an-muc'
      ? `Ẩn chủ điểm "${ten}" khỏi thư viện? Khôi phục được ở tab Báo cáo AI sai.`
      : `Xoá hẳn mục "${ten}"? Không hoàn tác được (lần sau AI sẽ soạn lại nếu cần).`;
    if (!confirm(loiNhan)) return;
    try {
      await goi(`/${encodeURIComponent(loai)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      tai();
    } catch (e) { alert(e.message); }
  }

  async function datAn(id, an) {
    try {
      await goi(`/${encodeURIComponent(loai)}/${encodeURIComponent(id)}/an`, { method: 'POST', json: { an } });
      tai();
    } catch (e) { alert(e.message); }
  }

  // ---------- Form thêm / sửa / xem ----------

  /** Ô nào chỉ áp cho một số dạng câu (câu luyện ngữ pháp) thì ẩn khi không hợp dạng. */
  function apDang() {
    const dang = document.querySelector('#nda-truong [data-key="loai"]')?.value;
    document.querySelectorAll('#nda-truong [data-dang]').forEach((o) => {
      o.style.display = !dang || o.dataset.dang.split(',').includes(dang) ? '' : 'none';
    });
  }

  function dungTruong(truong, giaTri, { chiXem, tao }) {
    const khung = document.getElementById('nda-truong');
    khung.innerHTML = truong.map((t, i) => {
      const id = `nda-o-${i}`;
      const khoa = chiXem || (!tao && t.chiKhiTao);
      const thuocTinh = `id="${id}" data-key="${esc(t.key)}" class="form-control" style="width:100%" ${khoa ? 'disabled' : ''} ${t.goiY ? `placeholder="${esc(t.goiY)}"` : ''}`;
      let o;
      if (t.kieu === 'select') {
        o = `<select ${thuocTinh}>${(t.tuyChon || []).map((x) => `<option value="${esc(x.v)}">${esc(x.t)}</option>`).join('')}</select>`;
      } else if (t.kieu === 'textarea' || t.kieu === 'dong') {
        o = `<textarea ${thuocTinh} rows="${t.kieu === 'dong' ? 5 : 3}"></textarea>`;
      } else {
        o = `<input ${thuocTinh} maxlength="400">`;
      }
      return `<label style="display:grid;gap:4px;font-weight:500"${t.dang ? ` data-dang="${esc(t.dang.join(','))}"` : ''}>${esc(t.ten)}${t.batBuoc && !chiXem ? ' *' : ''} ${o}</label>`;
    }).join('');
    // Điền giá trị bằng .value: an toàn với mọi ký tự, không nối chuỗi vào HTML.
    truong.forEach((t, i) => {
      const el = document.getElementById(`nda-o-${i}`);
      if (el && giaTri && giaTri[t.key] != null) el.value = String(giaTri[t.key]);
    });
    khung.querySelector('[data-key="loai"]')?.addEventListener('change', apDang);
    apDang();
  }

  async function moForm(id) {
    const l = loaiHienTai();
    const h = id ? hangHienTai.find((x) => x.id === id) : null;
    const chiXem = !!h && !l.suaDuoc;
    dangSua = { id: h ? h.id : null, chiXem };
    document.getElementById('nda-modal-tieu-de').textContent = `${h ? (chiXem ? 'Xem' : 'Sửa') : 'Thêm'} · ${l.ten}`;
    document.getElementById('nda-trang-thai').textContent = '';
    document.getElementById('nda-luu').style.display = chiXem ? 'none' : '';
    document.getElementById('nda-truong').innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';
    document.getElementById('nda-modal').style.display = 'flex';
    try {
      const { truong } = await goi(`/${encodeURIComponent(l.key)}/truong`);
      dungTruong(truong, h ? h.giaTri : {}, { chiXem, tao: !h });
    } catch (e) {
      document.getElementById('nda-truong').textContent = e.message;
    }
  }

  function dongForm() {
    document.getElementById('nda-modal').style.display = 'none';
    dangSua = null;
  }

  async function luu(e) {
    e.preventDefault();
    if (!dangSua || dangSua.chiXem) return;
    const du = {};
    document.querySelectorAll('#nda-truong [data-key]').forEach((el) => { if (!el.disabled) du[el.dataset.key] = el.value; });
    const tt = document.getElementById('nda-trang-thai');
    const nut = document.getElementById('nda-luu');
    tt.textContent = 'Đang lưu…';
    nut.disabled = true;
    try {
      const url = dangSua.id ? `/${encodeURIComponent(loai)}/${encodeURIComponent(dangSua.id)}` : `/${encodeURIComponent(loai)}`;
      await goi(url, { method: dangSua.id ? 'PATCH' : 'POST', json: du });
      dongForm();
      tai();
    } catch (err) {
      tt.innerHTML = `<span style="color:var(--danger)">${esc(err.message)}</span>`;
    } finally {
      nut.disabled = false;
    }
  }

  let daGan = false;
  function ganSuKien() {
    if (daGan) return;
    daGan = true;
    document.getElementById('nda-loai')?.addEventListener('change', (e) => { loai = e.target.value; trang = 1; toSidebar(); tai(); });
    document.getElementById('nda-lang')?.addEventListener('change', () => { trang = 1; tai(); });
    document.getElementById('nda-q')?.addEventListener('input', () => {
      clearTimeout(henTim);
      henTim = setTimeout(() => { trang = 1; tai(); }, 300);
    });
    document.getElementById('btn-nda-reload')?.addEventListener('click', tai);
    document.getElementById('btn-nda-them')?.addEventListener('click', () => moForm(null));
    document.getElementById('nda-form')?.addEventListener('submit', luu);
    document.getElementById('nda-huy')?.addEventListener('click', dongForm);
    document.getElementById('nda-modal')?.addEventListener('click', (e) => { if (e.target.id === 'nda-modal') dongForm(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dangSua) dongForm(); });
  }

  /** Mở tab; `key` là loại được chọn từ sidebar (bỏ trống thì giữ loại đang xem). */
  window.loadNoiDungAi = async function (key) {
    ganSuKien();
    try {
      if (!dsLoai.length) dsLoai = await goi('');
    } catch (e) {
      const tbody = document.getElementById('nda-ds');
      if (tbody) tbody.innerHTML = `<tr><td style="text-align:center;color:var(--danger)">${esc(e.message)}</td></tr>`;
      return;
    }
    const moi = key && dsLoai.some((l) => l.key === key) ? key : loai || dsLoai[0]?.key;
    if (moi !== loai) { loai = moi; trang = 1; }
    dungSelect();
    tai();
  };
})();
