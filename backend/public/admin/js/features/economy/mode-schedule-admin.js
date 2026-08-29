// modules/mode-schedule-admin.js — khung giờ được phép chạy của từng chế độ.
//
// Mỗi chế độ đúng MỘT dòng, sửa tại chỗ rồi bấm Lưu — không có popup thêm/xoá.
// Danh sách chế độ do SERVER trả về (`PRACTICE_COSTS`), không khai lại ở đây:
// chép tay thì thêm chế độ mới là bảng này thiếu một dòng mà không ai biết.
(function () {
  let MODES = [];
  let LICH = {};        // mode → bản ghi
  let TRANG_THAI = {};  // mode → đang mở (server tính)

  const THU = [
    { d: 1, t: 'T2' }, { d: 2, t: 'T3' }, { d: 3, t: 'T4' }, { d: 4, t: 'T5' },
    { d: 5, t: 'T6' }, { d: 6, t: 'T7' }, { d: 0, t: 'CN' },
  ];

  /** Phút từ nửa đêm → "HH:MM" cho `<input type="time">`. */
  const phutSangGio = (p) => {
    const n = Math.min(1440, Math.max(0, Number(p) || 0));
    // 1440 = nửa đêm cuối ngày. `<input type="time">` không nhận "24:00" nên
    // hiện "23:59"; giá trị lưu vẫn là 1440 nếu admin không đụng vào ô đó.
    if (n >= 1440) return '23:59';
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  };

  /** "HH:MM" → phút từ nửa đêm. */
  const gioSangPhut = (v) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim());
    if (!m) return null;
    return Math.min(1440, Number(m[1]) * 60 + Number(m[2]));
  };

  async function load() {
    const tbody = document.getElementById('sched-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    try {
      const r = await fetch(`${API_URL}/admin/mode-schedules`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Tải thất bại');
      MODES = j.modes || [];
      TRANG_THAI = j.trangThai || {};
      LICH = {};
      for (const l of (j.data || [])) LICH[l.mode] = l;
      render();
    } catch (e) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger)">${esc(e.message)}</td></tr>`;
    }
  }

  function render() {
    const tbody = document.getElementById('sched-tbody');
    if (!tbody) return;
    if (!MODES.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:20px">Không có chế độ nào</td></tr>';
      return;
    }

    tbody.innerHTML = MODES.map(mode => {
      const l = LICH[mode] || {};
      const days = Array.isArray(l.days) ? l.days : [];
      // Mặc định TICK kể cả khi chưa có bản ghi.
      //
      // Ô này nghĩa là "áp dụng khung giờ bên cạnh". Bỏ tick sẵn thì admin điền
      // giờ, bấm Lưu, và lưu luôn `isActive: false` — tức là vừa đặt giờ vừa
      // tắt nó, không hiểu vì sao không ăn. Mà tick sẵn cũng không hại: mặc
      // định là cả ngày / mọi thứ, nên chưa thu hẹp thì chưa chặn ai.
      const bat = l.isActive !== false;
      const mo = TRANG_THAI[mode] !== false;

      return `<tr data-mode="${esc(mode)}">
        <td>
          <strong style="font-family:monospace;font-size:13px">${esc(mode)}</strong>
          ${l.note ? `<br><small style="color:var(--text-secondary)">${esc(l.note)}</small>` : ''}
        </td>
        <td>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${THU.map(x => `
              <label style="display:inline-flex;align-items:center;gap:3px;font-size:12px;cursor:pointer">
                <input type="checkbox" class="sched-day" data-d="${x.d}" ${days.includes(x.d) ? 'checked' : ''}>
                ${x.t}
              </label>`).join('')}
          </div>
          <small style="color:var(--text-secondary)">Bỏ trống = mọi ngày</small>
        </td>
        <td style="white-space:nowrap">
          <input type="time" class="sched-start" value="${phutSangGio(l.start ?? 0)}" style="width:88px">
          <span style="color:var(--text-secondary)">→</span>
          <input type="time" class="sched-end" value="${phutSangGio(l.end ?? 1440)}" style="width:88px">
        </td>
        <td>
          ${mo
            ? '<span class="badge success">Đang mở</span>'
            : '<span class="badge neutral">Ngoài giờ</span>'}
        </td>
        <td style="text-align:center">
          <input type="checkbox" class="sched-active" ${bat ? 'checked' : ''} title="Tắt = bỏ giới hạn">
        </td>
        <td style="white-space:nowrap">
          <button class="btn btn-success btn-sm sched-save"><i class="fas fa-save"></i></button>
          <button class="btn btn-sm sched-clear" title="Bỏ giới hạn"
                  style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5"><i class="fas fa-eraser"></i></button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.sched-save').forEach(b => {
      b.onclick = () => luu(b.closest('tr'));
    });
    tbody.querySelectorAll('.sched-clear').forEach(b => {
      b.onclick = () => xoa(b.closest('tr')?.dataset.mode);
    });
  }

  async function luu(tr) {
    if (!tr) return;
    const mode = tr.dataset.mode;
    const start = gioSangPhut(tr.querySelector('.sched-start')?.value);
    const end = gioSangPhut(tr.querySelector('.sched-end')?.value);

    if (start === null || end === null) {
      alert('Giờ không hợp lệ');
      return;
    }
    // Cảnh báo TRƯỚC khi lưu, không chặn: `start === end` là cách hợp lệ để nói
    // "chặn hẳn chế độ này", nhưng cũng rất giống gõ nhầm.
    if (start === end && !confirm(
      `Giờ bắt đầu trùng giờ kết thúc → chế độ "${mode}" sẽ KHÔNG bao giờ mở.\n\nBạn có chắc không?`)) {
      return;
    }

    const days = [...tr.querySelectorAll('.sched-day')]
      .filter(c => c.checked).map(c => Number(c.dataset.d));

    const body = {
      days,
      start,
      end,
      isActive: tr.querySelector('.sched-active')?.checked !== false,
    };

    try {
      const r = await fetch(`${API_URL}/admin/mode-schedules/${encodeURIComponent(mode)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Lưu thất bại');
      // Nạp lại để cột "Đang mở?" phản ánh lịch VỪA lưu — tính lại ở client là
      // chép luật, mà máy admin có thể khác múi giờ với server.
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function xoa(mode) {
    if (!mode) return;
    if (!confirm(`Bỏ khung giờ của "${mode}"? Chế độ sẽ chạy mọi lúc.`)) return;
    try {
      const r = await fetch(`${API_URL}/admin/mode-schedules/${encodeURIComponent(mode)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Xoá thất bại');
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  let daNoi = false;

  window.loadModeSchedules = function () {
    // Nối listener MỘT lần, ở lần mở tab đầu tiên — giống các tab khác. Nối ở
    // thân IIFE thì file này phải nạp sau khi phần HTML của tab đã vào DOM, một
    // ràng buộc ngầm mà thứ tự thẻ <script> đổi một cái là hỏng im lặng.
    if (!daNoi) {
      daNoi = true;
      document.getElementById('btn-sched-reload')?.addEventListener('click', load);
    }
    load();
  };
})();
