// modules/economy-admin.js — bảng kinh tế faucet/sink (đọc /admin/economy).
(function () {
  let inited = false;

  const fmt = (n) => (n || 0).toLocaleString('vi-VN');
  const SRC = { purchase: 'Cửa hàng', exchange: 'Đổi tiền', spin: 'Vòng quay', quest: 'Nhiệm vụ', achievement: 'Thành tích', gift: 'Quà thông báo', extend: 'Gia hạn từ vựng', practice: 'Luyện tập', checkin: 'Điểm danh', toeic: 'Bài TOEIC', other: 'Khác' };

  function card(title, cur, d) {
    const c = cur === 'coins' ? '🪙' : '💎';
    const netColor = d.net >= 0 ? '#22c55e' : '#ef4444';
    return `<div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:10px;padding:14px">
        <div style="font-size:12px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:.5px">${title}</div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:13px"><span style="color:#22c55e">▲ Thu (faucet)</span><b>${c} ${fmt(d.in)}</b></div>
        <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:13px"><span style="color:#ef4444">▼ Chi (sink)</span><b>${c} ${fmt(d.out)}</b></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;padding-top:6px;border-top:1px dashed var(--border-color);font-size:14px"><span>Net</span><b style="color:${netColor}">${d.net >= 0 ? '+' : ''}${fmt(d.net)}</b></div>
      </div>`;
  }

  async function load() {
    const days = document.getElementById('eco-days')?.value || 7;
    const rowsEl = document.getElementById('eco-rows');
    if (rowsEl) rowsEl.innerHTML = '<tr><td colspan="5" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    try {
      const r = await fetch(`${API_URL}/admin/economy?days=${days}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'Lỗi');

      const sum = document.getElementById('eco-summary');
      if (sum) sum.innerHTML =
        card(`Xu (${days} ngày)`, 'coins', j.currencies.coins) +
        card(`Đá quý (${days} ngày)`, 'gems', j.currencies.gems) +
        `<div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:10px;padding:14px">
            <div style="font-size:12px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:.5px">Đang lưu hành</div>
            <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:13px"><span>🪙 Tổng xu</span><b>${fmt(j.supply.coins)}</b></div>
            <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:13px"><span>💎 Tổng đá</span><b>${fmt(j.supply.gems)}</b></div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:6px">Tổng tiền toàn hệ thống hiện có</div>
          </div>`;

      if (rowsEl) {
        const rows = (j.bySource || []);
        rowsEl.innerHTML = rows.length ? rows.map(s => {
          const inOut = s.direction === 'in'
            ? '<span style="color:#22c55e">▲ Thu</span>'
            : '<span style="color:#ef4444">▼ Chi</span>';
          const c = s.currency === 'coins' ? '🪙' : '💎';
          return `<tr>
              <td>${SRC[s.type] || s.type}</td>
              <td>${inOut}</td>
              <td>${c} ${s.currency}</td>
              <td><b>${fmt(s.total)}</b></td>
              <td>${fmt(s.count)}</td>
            </tr>`;
        }).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:20px">Chưa có giao dịch trong kỳ</td></tr>';
      }
    } catch (e) {
      if (rowsEl) rowsEl.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger)">${e.message}</td></tr>`;
    }
  }

  window.loadEconomy = function () {
    if (!inited) {
      inited = true;
      document.getElementById('eco-refresh')?.addEventListener('click', load);
      document.getElementById('eco-days')?.addEventListener('change', load);
    }
    load();
  };
})();
