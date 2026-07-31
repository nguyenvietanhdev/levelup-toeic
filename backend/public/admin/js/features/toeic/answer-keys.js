// Nạp bộ đáp án dạng JSON → đối chiếu → sửa đáp án câu hỏi. Không gọi AI ở server.
(function () {
    let inited = false;
    let lastCompare = null;   // kết quả đối chiếu gần nhất { source, comparison }
    const auth = () => ({ Authorization: `Bearer ${getToken()}` });
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    ));

    // ── Danh sách bộ đáp án đã lưu ──────────────────────────────────────────
    async function loadKeys() {
        const tbody = document.getElementById('ak-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
        try {
            const r = await fetch(`${TOEIC_API_BASE}/answer-keys`, { headers: auth() });
            const j = await r.json();
            renderKeys(j.success ? (j.data || []) : []);
        } catch (e) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger)">${esc(e.message)}</td></tr>`;
        }
    }

    function renderKeys(list) {
        const tbody = document.getElementById('ak-tbody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:20px">Chưa nạp bộ đáp án nào</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(k => `<tr>
            <td><strong>${esc(k.source)}</strong></td>
            <td><span class="badge neutral">${k.count} câu</span></td>
            <td><small style="color:var(--text-secondary)">${esc((k.scannedRanges || []).join(', ') || '—')}</small></td>
            <td><small>${k.updatedAt ? new Date(k.updatedAt).toLocaleString('vi-VN') : '—'}</small></td>
            <td style="white-space:nowrap">
              <button class="btn btn-secondary btn-sm ak-compare" data-src="${esc(k.source)}"><i class="fas fa-code-compare"></i> Đối chiếu</button>
              <button class="btn btn-sm ak-del" data-src="${esc(k.source)}"
                style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`).join('');

        tbody.querySelectorAll('.ak-compare').forEach(b => b.onclick = () => compareSource(b.dataset.src));
        tbody.querySelectorAll('.ak-del').forEach(b => b.onclick = async () => {
            if (!confirm(`Xoá bộ đáp án của "${b.dataset.src}"? (Câu hỏi giữ nguyên, chỉ xoá bộ đáp án đã nạp)`)) return;
            const r = await fetch(`${TOEIC_API_BASE}/answer-keys/${encodeURIComponent(b.dataset.src)}`, {
                method: 'DELETE', headers: auth(),
            });
            const j = await r.json();
            showToast(j.message || 'Đã xoá', j.success ? 'success' : 'error');
            if (j.success) loadKeys();
        });
    }

    const target = () => ({
        source: document.getElementById('ak-source')?.value.trim() || '',
        range: document.getElementById('ak-range')?.value.trim() || '',
    });

    function onLoaded(j) {
        showToast(j.message, 'success');
        lastCompare = { source: j.data.source, ...j.data };
        renderResult(j.data);
        loadKeys();
        // Nhập xong thì dọn ô nhập: nạp tiếp phần sau (101-200) khỏi phải tự xoá,
        // và tránh bấm nhầm lần hai với đúng bộ vừa nhập. Chỉ xoá khi THÀNH CÔNG
        // — lỗi mà mất nội dung vừa dán thì phải đi copy lại từ đầu.
        const ta = document.getElementById('ak-json');
        if (ta) ta.value = '';
    }

    /** Khoá nút + hiện trạng thái trong lúc chờ, luôn trả lại nguyên trạng. */
    async function withBusy(btn, label, fn) {
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${label}`;
        try { await fn(); } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    }

    // ── Nhập đáp án đã dán ──────────────────────────────────────────────────
    async function importJson(btn) {
        const { source, range } = target();
        const text = document.getElementById('ak-json')?.value.trim();

        if (!source) return showToast('Nhập mã đề trước đã', 'error');
        if (!text) return showToast('Dán đáp án vào ô JSON đã', 'error');

        await withBusy(btn, 'Đang nhập...', async () => {
            try {
                const r = await fetch(`${TOEIC_API_BASE}/answer-keys/import`, {
                    method: 'POST',
                    headers: { ...auth(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ source, range: range || undefined, answers: text }),
                });
                const j = await r.json();
                if (!j.success) return showToast(j.message || 'Nhập lỗi', 'error');
                onLoaded(j);
            } catch (e) {
                showToast(`Nhập lỗi: ${e.message}`, 'error');
            }
        });
    }

    // ── Prompt để admin tự nhờ chat AI đọc ảnh ──────────────────────────────
    // Server KHÔNG gọi AI nữa: admin dán ảnh vào DeepSeek/ChatGPT kèm prompt này
    // rồi mang JSON về. Prompt phải ép ra JSON thuần vì dán thẳng vào ô nhập.
    function buildPrompt() {
        const { range } = target();
        const rangeLine = range
            ? `\n- Chỉ lấy các câu trong khoảng ${range}. Câu ngoài khoảng thì BỎ QUA.`
            : '';

        return `Bạn đang đọc BẢNG ĐÁP ÁN của một đề thi TOEIC trong ảnh tôi gửi kèm.
Nhiệm vụ: đọc TOÀN BỘ cặp "số câu → đáp án" nhìn thấy trong ảnh.

QUY TẮC:
- Trả về DUY NHẤT một object JSON, key là số câu (chuỗi số), value là "A"/"B"/"C"/"D".
- KHÔNG bọc trong khối markdown, KHÔNG giải thích, KHÔNG viết thêm chữ nào ngoài JSON.
- Giữ nguyên số câu in trên đề, tuyệt đối không tự đánh số lại từ 1.
- Chỉ đọc thứ NHÌN THẤY RÕ. Ô nào mờ hoặc không chắc thì BỎ QUA, không được đoán.
- Part 2 của TOEIC chỉ có A/B/C — không bịa ra D.
- Đọc hết ảnh, không được dừng giữa chừng hay tóm tắt kiểu "...".${rangeLine}

Ví dụ định dạng kết quả: {"101":"A","102":"C","103":"B"}`;
    }

    /** Clipboard API cần https/localhost — có fallback để admin chạy IP nội bộ vẫn copy được. */
    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        }
    }

    async function copyPrompt() {
        const { range } = target();
        const ok = await copyText(buildPrompt());
        if (!ok) return showToast('Trình duyệt chặn copy — bấm "Xem prompt" rồi copy tay', 'error');
        showToast(
            range
                ? `Đã copy prompt (kèm khoảng ${range}). Dán vào chat AI cùng với ảnh.`
                : 'Đã copy prompt. Dán vào chat AI cùng với ảnh.',
            'success',
        );
    }

    // Xem trước để biết prompt đang kèm khoảng nào, và để copy tay khi cần.
    function togglePrompt(btn) {
        const box = document.getElementById('ak-prompt-preview');
        if (!box) return;
        const showing = box.style.display !== 'none';
        box.style.display = showing ? 'none' : 'block';
        box.textContent = showing ? '' : buildPrompt();
        btn.innerHTML = showing
            ? '<i class="fas fa-eye"></i> Xem prompt'
            : '<i class="fas fa-eye-slash"></i> Ẩn prompt';
    }

    async function compareSource(source) {
        try {
            const r = await fetch(`${TOEIC_API_BASE}/answer-keys/${encodeURIComponent(source)}/compare`, { headers: auth() });
            const j = await r.json();
            if (!j.success) return showToast(j.message || 'Không đối chiếu được', 'error');
            lastCompare = { source, ...j.data };
            renderResult(j.data);
            document.getElementById('ak-result')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {
            showToast(`Đối chiếu lỗi: ${e.message}`, 'error');
        }
    }

    // ── Bảng kết quả đối chiếu ──────────────────────────────────────────────
    function renderResult(d) {
        const box = document.getElementById('ak-result');
        if (!box) return;
        const c = d.comparison || {};
        const mism = c.mismatched || [];

        const stat = (label, n, color) =>
            `<div style="flex:1;min-width:120px;padding:10px;border-radius:10px;background:var(--bg-secondary);text-align:center">
               <div style="font-size:20px;font-weight:700;color:${color}">${n}</div>
               <div style="font-size:12px;color:var(--text-secondary)">${label}</div>
             </div>`;

        box.innerHTML = `
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
            ${stat('Khớp', (c.matched || []).length, 'var(--success, #16a34a)')}
            ${stat('LỆCH — cần sửa', mism.length, 'var(--danger, #dc2626)')}
            ${stat('Đề chưa có câu này', (c.notInTest || []).length, 'var(--text-secondary)')}
            ${stat('Câu chưa có đáp án', (c.notInKey || []).length, 'var(--text-secondary)')}
          </div>
          ${(d.skipped || []).length ? `<div style="font-size:12px;color:var(--warning,#f59e0b);margin-bottom:10px">
            <i class="fas fa-triangle-exclamation"></i> Bỏ qua ${d.skipped.length} mục không hợp lệ hoặc ngoài dải.
          </div>` : ''}
          ${mism.length ? `
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
              <button class="btn btn-primary btn-sm" id="ak-apply-all">
                <i class="fas fa-bolt"></i> Áp dụng tất cả (${mism.length} câu)
              </button>
              <button class="btn btn-secondary btn-sm" id="ak-apply-selected">
                <i class="fas fa-check"></i> Chỉ áp dụng câu đã tick
              </button>
              <span style="font-size:12px;color:var(--text-secondary)">
                Tick từng câu nếu muốn sửa tay thay vì sửa hàng loạt.
              </span>
            </div>
            <div class="table-container">
              <table class="data-table">
                <thead><tr>
                  <th style="width:40px"><input type="checkbox" id="ak-check-all" /></th>
                  <th style="width:90px">Số câu</th><th style="width:80px">Part</th>
                  <th style="width:130px">Đang lưu</th><th style="width:130px">Theo bảng đáp án</th>
                </tr></thead>
                <tbody>
                  ${mism.map(m => `<tr>
                    <td><input type="checkbox" class="ak-row" value="${m.number}" /></td>
                    <td><strong>${m.number}</strong></td>
                    <td>Part ${m.part}</td>
                    <td><span class="badge neutral">${esc(m.current || '—')}</span></td>
                    <td><span class="badge success">${esc(m.expected)}</span></td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>`
            : '<div style="padding:14px;text-align:center;color:var(--success,#16a34a)"><i class="fas fa-circle-check"></i> Mọi câu đã khớp bảng đáp án</div>'}
        `;

        document.getElementById('ak-check-all')?.addEventListener('change', (e) => {
            box.querySelectorAll('.ak-row').forEach(cb => { cb.checked = e.target.checked; });
        });
        document.getElementById('ak-apply-all')?.addEventListener('click', (e) => apply(e.currentTarget, null));
        document.getElementById('ak-apply-selected')?.addEventListener('click', (e) => {
            const nums = [...box.querySelectorAll('.ak-row:checked')].map(cb => Number(cb.value));
            if (!nums.length) return showToast('Chưa tick câu nào', 'error');
            apply(e.currentTarget, nums);
        });
    }

    async function apply(btn, numbers) {
        const source = lastCompare?.source;
        if (!source) return;
        const label = numbers ? `${numbers.length} câu đã tick` : 'TẤT CẢ câu đang lệch';
        if (!confirm(`Ghi đè đáp án cho ${label} của đề "${source}"?\nThao tác này sửa thẳng ngân hàng câu hỏi.`)) return;

        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang sửa...';
        try {
            const r = await fetch(`${TOEIC_API_BASE}/answer-keys/${encodeURIComponent(source)}/apply`, {
                method: 'POST',
                headers: { ...auth(), 'Content-Type': 'application/json' },
                body: JSON.stringify(numbers ? { numbers } : {}),
            });
            const j = await r.json();
            showToast(j.message || 'Xong', j.success ? 'success' : 'error');
            if (j.success) compareSource(source); // vẽ lại để thấy còn lệch gì không
        } catch (e) {
            showToast(`Sửa lỗi: ${e.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    }

    // Gợi ý mã đề có thật, khỏi gõ sai.
    async function loadSourceHints() {
        try {
            const r = await fetch(`${TOEIC_API_BASE}/questions/sources`, { headers: auth() });
            const j = await r.json();
            const dl = document.getElementById('ak-source-list');
            if (dl && j.success) dl.innerHTML = (j.data || []).map(s => `<option value="${esc(s)}"></option>`).join('');
        } catch (_) { /* gõ tay vẫn được */ }
    }

    window.loadAnswerKeysTab = function () {
        if (!inited) {
            inited = true;
            // Hai bộ nút "Nhập / Xoá" (trên header + ngay dưới ô nhập) dùng chung
            // một hành động, chỉ khác id — dán xong bấm cái nào gần tay hơn.
            ['btn-ak-import', 'btn-ak-import-bottom'].forEach(id => {
                document.getElementById(id)?.addEventListener('click', (e) => importJson(e.currentTarget));
            });
            ['btn-ak-json-clear', 'btn-ak-json-clear-bottom'].forEach(id => {
                document.getElementById(id)?.addEventListener('click', () => {
                    const ta = document.getElementById('ak-json');
                    if (ta) { ta.value = ''; ta.focus(); }
                });
            });
            document.getElementById('btn-ak-copy-prompt')?.addEventListener('click', copyPrompt);
            document.getElementById('btn-ak-toggle-prompt')?.addEventListener('click', (e) => togglePrompt(e.currentTarget));
            // Đổi khoảng số câu thì prompt đang mở phải đổi theo, không thì copy nhầm dải cũ.
            document.getElementById('ak-range')?.addEventListener('input', () => {
                const box = document.getElementById('ak-prompt-preview');
                if (box && box.style.display !== 'none') box.textContent = buildPrompt();
            });
            document.getElementById('btn-ak-reload')?.addEventListener('click', loadKeys);
            loadSourceHints();
        }
        loadKeys();
    };
})();
