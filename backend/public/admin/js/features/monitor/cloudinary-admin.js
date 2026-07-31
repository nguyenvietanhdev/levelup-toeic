// Quản lý Cloudinary: trạng thái/hạn mức · kiểm kê ảnh-audio · đẩy lô lên cloud
// · duyệt và xoá file · dọn file mồ côi.
(function () {
    const API = '/api/admin/cloudinary';
    let inited = false;
    let browseCursor = null;      // phân trang của Cloudinary đi bằng cursor, không phải số trang
    let browseItems = [];         // gộp dồn qua các lần "Xem thêm"
    let autoRunning = false;      // đang chạy chuỗi lô liên tiếp

    const auth = () => ({ Authorization: `Bearer ${getToken()}` });
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    ));
    const $ = (id) => document.getElementById(id);

    function bytes(n) {
        if (!n && n !== 0) return '—';
        const u = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0, v = Number(n);
        while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
        return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
    }

    async function api(path, options = {}) {
        const r = await fetch(`${API}${path}`, {
            ...options,
            headers: { ...auth(), ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
        });
        const j = await r.json().catch(() => ({ success: false, message: `HTTP ${r.status}` }));
        if (!j.success) throw new Error(j.message || `HTTP ${r.status}`);
        return j;
    }

    const stat = (label, value, sub, color) =>
        `<div style="flex:1;min-width:130px;padding:12px;border-radius:10px;background:var(--bg-secondary)">
           <div style="font-size:20px;font-weight:700;color:${color || 'var(--text-primary)'}">${value}</div>
           <div style="font-size:12px;color:var(--text-secondary)">${label}</div>
           ${sub ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${sub}</div>` : ''}
         </div>`;

    // ── Trạng thái & hạn mức ────────────────────────────────────────────────
    async function loadStatus() {
        const box = $('cld-status');
        if (!box) return;
        try {
            const { data: d } = await api('/status');

            if (!d.configured) {
                box.innerHTML = `
                  <div style="padding:14px;border-radius:10px;background:var(--bg-secondary);border-left:4px solid var(--warning,#f59e0b)">
                    <div style="font-weight:600;margin-bottom:6px">
                      <i class="fas fa-triangle-exclamation"></i> Chưa cấu hình Cloudinary
                    </div>
                    <div style="font-size:13px;color:var(--text-secondary)">
                      Ảnh/audio upload mới đang ghi xuống <code>public/assets/</code> — deploy lại là mất.
                      Đặt 3 biến <code>CLOUDINARY_CLOUD_NAME</code>, <code>CLOUDINARY_API_KEY</code>,
                      <code>CLOUDINARY_API_SECRET</code> trong <code>.env</code> rồi khởi động lại server.
                      Phần kiểm kê bên dưới vẫn xem được.
                    </div>
                  </div>`;
                return;
            }

            const u = d.usage;
            box.innerHTML = `
              <div style="display:flex;gap:10px;flex-wrap:wrap">
                ${stat('Cloud name', esc(d.cloudName), u?.plan ? `gói ${esc(u.plan)}` : '', 'var(--success,#16a34a)')}
                ${u ? stat('Dung lượng đang dùng', bytes(u.storageBytes), `${u.resources ?? '—'} file`) : ''}
                ${u ? stat('Băng thông tháng này', bytes(u.bandwidthBytes), '') : ''}
                ${u?.credits ? stat('Credits', `${(u.credits.usage ?? 0).toFixed(2)}/${u.credits.limit ?? '—'}`,
                    `${(u.credits.used_percent ?? 0).toFixed(1)}% đã dùng`,
                    (u.credits.used_percent ?? 0) > 80 ? 'var(--danger,#dc2626)' : undefined) : ''}
              </div>
              ${d.usageError ? `<div style="margin-top:10px;font-size:12px;color:var(--danger,#dc2626)">
                <i class="fas fa-circle-exclamation"></i> Không đọc được hạn mức: ${esc(d.usageError)}
                (key sai quyền hoặc hết lượt gọi Admin API — phần duyệt file vẫn có thể chạy)
              </div>` : ''}`;
        } catch (e) {
            box.innerHTML = `<div style="color:var(--danger)">${esc(e.message)}</div>`;
        }
    }

    // ── Kiểm kê ảnh/audio theo tham chiếu trong DB ──────────────────────────
    async function loadInventory() {
        const box = $('cld-inventory');
        if (!box) return;
        try {
            const { data: d } = await api('/inventory');
            const pending = d.pending;
            const missing = d.images.missing + d.audio.missing;

            box.innerHTML = `
              <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
                ${stat('Đã trên cloud', d.images.cloud + d.audio.cloud,
                    `${d.images.cloud} ảnh · ${d.audio.cloud} audio`, 'var(--success,#16a34a)')}
                ${stat('Còn nằm đĩa', pending,
                    `${bytes(d.images.localBytes + d.audio.localBytes)} · sẽ mất khi deploy`,
                    pending ? 'var(--warning,#f59e0b)' : 'var(--text-secondary)')}
                ${stat('Mất file', missing, 'DB trỏ tới file không còn',
                    missing ? 'var(--danger,#dc2626)' : 'var(--text-secondary)')}
                ${stat('Tổng tham chiếu', d.totalRefs, 'ảnh + audio trong mọi màn hỏi')}
              </div>
              ${d.bySource.length ? `
                <div class="table-container" style="max-height:260px;overflow:auto">
                  <table class="data-table">
                    <thead><tr>
                      <th>Mã đề</th><th style="width:90px">Ảnh</th><th style="width:90px">Audio</th>
                      <th style="width:110px">Mất file</th><th style="width:110px">Dung lượng</th>
                    </tr></thead>
                    <tbody>
                      ${d.bySource.map(s => `<tr>
                        <td><strong>${esc(s.source)}</strong></td>
                        <td>${s.images || '—'}</td>
                        <td>${s.audio || '—'}</td>
                        <td>${s.missing ? `<span class="badge" style="background:#fee2e2;color:#dc2626">${s.missing}</span>` : '—'}</td>
                        <td>${bytes(s.bytes)}</td>
                      </tr>`).join('')}
                    </tbody>
                  </table>
                </div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:6px">
                  Chỉ liệt kê đề còn file dưới đĩa hoặc mất file. Đề đã lên cloud hết thì không hiện ở đây.
                </div>`
                : '<div style="padding:14px;text-align:center;color:var(--success,#16a34a)"><i class="fas fa-circle-check"></i> Mọi ảnh/audio đều đã nằm trên Cloudinary</div>'}`;

            return d;
        } catch (e) {
            box.innerHTML = `<div style="color:var(--danger)">${esc(e.message)}</div>`;
        }
    }

    // ── Đẩy lô lên cloud ────────────────────────────────────────────────────
    async function migrate(apply) {
        const log = $('cld-migrate-log');
        const limit = Math.max(1, Math.min(100, parseInt($('cld-batch')?.value, 10) || 20));
        const btn = apply ? $('btn-cld-migrate') : $('btn-cld-preview');
        const original = btn.innerHTML;

        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${apply ? 'Đang đẩy...' : 'Đang xem...'}`;
        try {
            const j = await api('/migrate', { method: 'POST', body: JSON.stringify({ limit, apply }) });
            const d = j.data;
            showToast(j.message, 'success');

            if (log) {
                log.innerHTML = `
                  <div style="font-size:13px;margin-bottom:8px">
                    <b>${apply ? 'Đã đẩy' : 'Sẽ đẩy'}: ${d.batch} file</b> · còn lại <b>${d.remaining}</b>
                    ${d.failed.length ? ` · <span style="color:var(--danger)">lỗi ${d.failed.length}</span>` : ''}
                    ${d.missingCount ? ` · <span style="color:var(--warning,#f59e0b)">mất file ${d.missingCount}</span>` : ''}
                  </div>
                  <div class="table-container" style="max-height:220px;overflow:auto">
                    <table class="data-table">
                      <thead><tr><th style="width:110px">Mã đề</th><th>File</th><th style="width:90px">Kết quả</th></tr></thead>
                      <tbody>
                        ${d.details.map(x => `<tr>
                          <td>${esc(x.source)}</td>
                          <td style="font-size:12px;word-break:break-all">${esc(x.from)}</td>
                          <td><span class="badge ${apply ? 'success' : 'neutral'}">${apply ? 'đã đẩy' : 'chờ'}</span></td>
                        </tr>`).join('')}
                        ${d.failed.map(x => `<tr>
                          <td>${esc(x.source)}</td>
                          <td style="font-size:12px;word-break:break-all">${esc(x.url)}<br>
                            <span style="color:var(--danger)">${esc(x.error)}</span></td>
                          <td><span class="badge" style="background:#fee2e2;color:#dc2626">lỗi</span></td>
                        </tr>`).join('')}
                      </tbody>
                    </table>
                  </div>`;
            }

            if (apply) {
                await loadInventory();
                // Tự chạy tiếp: chỉ khi lô vừa rồi thực sự đẩy được file, để lỗi
                // lặp lại không quay vòng vô tận.
                if ($('cld-auto')?.checked && d.remaining > 0 && d.uploaded > 0) {
                    autoRunning = true;
                    btn.disabled = false;
                    btn.innerHTML = original;
                    return migrate(true);
                }
                autoRunning = false;
            }
            return d;
        } catch (e) {
            autoRunning = false;
            showToast(e.message, 'error');
        } finally {
            if (!autoRunning) {
                btn.disabled = false;
                btn.innerHTML = original;
            }
        }
    }

    // ── Duyệt file / mồ côi ─────────────────────────────────────────────────
    const currentType = () => ($('cld-type')?.value === 'video' ? 'video' : 'image');

    async function browse(more = false) {
        const btn = $('btn-cld-browse');
        const prefix = $('cld-prefix')?.value.trim() || '';
        if (!more) { browseCursor = null; browseItems = []; }

        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải...';
        try {
            const q = new URLSearchParams({ prefix, resourceType: currentType(), max: '30' });
            if (browseCursor) q.set('cursor', browseCursor);
            const { data } = await api(`/resources?${q}`);
            browseItems = browseItems.concat(data.items);
            browseCursor = data.nextCursor;
            renderFiles(browseItems, { mode: 'browse' });
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    }

    async function findOrphans() {
        const btn = $('btn-cld-orphans');
        const prefix = $('cld-prefix')?.value.trim() || '';
        const original = btn.innerHTML;

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang dò...';
        try {
            const q = new URLSearchParams({ prefix, resourceType: currentType() });
            const { data } = await api(`/orphans?${q}`);
            browseCursor = null;
            browseItems = data.items;
            renderFiles(data.items, { mode: 'orphan', meta: data });
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    }

    function renderFiles(items, { mode, meta } = {}) {
        const box = $('cld-browser');
        if (!box) return;

        if (!items.length) {
            box.innerHTML = mode === 'orphan'
                ? `<div style="padding:14px;text-align:center;color:var(--success,#16a34a)">
                     <i class="fas fa-circle-check"></i> Không có file mồ côi
                     ${meta ? ` (đã quét ${meta.scanned} file, DB đang dùng ${meta.referencedInDb})` : ''}
                   </div>`
                : '<div style="padding:14px;text-align:center;color:var(--text-secondary)">Không có file nào trong thư mục này</div>';
            return;
        }

        const isAudio = currentType() === 'video';
        box.innerHTML = `
          ${mode === 'orphan' ? `
            <div style="padding:10px;border-radius:10px;background:var(--bg-secondary);margin-bottom:10px;font-size:13px">
              <i class="fas fa-ghost"></i> <b>${items.length} file mồ côi</b> — tổng ${bytes(meta?.totalBytes)}.
              Đã quét ${meta?.scanned} file, DB đang dùng ${meta?.referencedInDb} file.
              ${meta?.truncated ? '<br><span style="color:var(--warning,#f59e0b)">Mới quét tới giới hạn 2000 file — xoá bớt rồi dò lại để thấy phần còn lại.</span>' : ''}
            </div>` : ''}

          <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px">
              <input type="checkbox" id="cld-check-all" /> Chọn tất cả
            </label>
            <button class="btn btn-sm" id="btn-cld-delete"
              style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5">
              <i class="fas fa-trash"></i> Xoá file đã chọn
            </button>
            <span style="font-size:12px;color:var(--text-secondary)">
              ${items.length} file${browseCursor ? ' (còn nữa)' : ''}
            </span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px">
            ${items.map(f => `
              <div style="border:1px solid var(--border-color,#e5e7eb);border-radius:10px;padding:8px">
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:6px">
                  <input type="checkbox" class="cld-pick" value="${esc(f.publicId)}" ${f.inUse ? 'data-inuse="1"' : ''} />
                  ${f.inUse ? '<span class="badge success">đang dùng</span>' : '<span class="badge neutral">rảnh</span>'}
                </label>
                ${isAudio
                    ? `<audio controls preload="none" src="${esc(f.url)}" style="width:100%"></audio>`
                    : `<a href="${esc(f.url)}" target="_blank" rel="noopener">
                         <img src="${esc(f.url)}" alt="" loading="lazy"
                           style="width:100%;height:110px;object-fit:cover;border-radius:8px;background:var(--bg-secondary)" />
                       </a>`}
                <div style="font-size:11px;word-break:break-all;margin-top:6px">${esc(f.publicId)}</div>
                <div style="font-size:11px;color:var(--text-secondary)">
                  ${esc(f.format || '')} · ${bytes(f.bytes)}
                  ${f.width ? ` · ${f.width}×${f.height}` : ''}
                </div>
              </div>`).join('')}
          </div>

          ${browseCursor ? `<div style="text-align:center;margin-top:12px">
            <button class="btn btn-secondary btn-sm" id="btn-cld-more"><i class="fas fa-chevron-down"></i> Xem thêm</button>
          </div>` : ''}`;

        $('cld-check-all')?.addEventListener('change', (e) => {
            box.querySelectorAll('.cld-pick').forEach(cb => { cb.checked = e.target.checked; });
        });
        $('btn-cld-delete')?.addEventListener('click', (e) => removeSelected(e.currentTarget, box));
        $('btn-cld-more')?.addEventListener('click', () => browse(true));
    }

    async function removeSelected(btn, box) {
        const picked = [...box.querySelectorAll('.cld-pick:checked')];
        if (!picked.length) return showToast('Chưa chọn file nào', 'error');

        const inUse = picked.filter(cb => cb.dataset.inuse === '1').map(cb => cb.value);
        const publicIds = picked.map(cb => cb.value);

        if (!confirm(`Xoá vĩnh viễn ${publicIds.length} file khỏi Cloudinary?\nKhông khôi phục lại được.`)) return;

        // Xác nhận lần hai cho file đang được đề dùng — xoá là ảnh/audio trong đề
        // thi hỏng ngay, không có đường lùi.
        let force = false;
        if (inUse.length) {
            const ok = confirm(
                `CẢNH BÁO: ${inUse.length} file đang được đề thi sử dụng.\n`
                + 'Xoá thì màn hỏi tương ứng sẽ mất ảnh/audio.\n\n'
                + 'OK = xoá cả file đang dùng · Cancel = chỉ xoá file rảnh',
            );
            force = ok;
        }

        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xoá...';
        try {
            const j = await api('/delete', {
                method: 'POST',
                body: JSON.stringify({ publicIds, resourceType: currentType(), force }),
            });
            showToast(j.message, 'success');

            const gone = new Set(j.data.deleted);
            browseItems = browseItems.filter(f => !gone.has(f.publicId));
            renderFiles(browseItems, { mode: 'browse' });
            loadStatus();
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    }

    // Gợi ý thư mục có thật để khỏi gõ sai prefix.
    async function loadFolderHints() {
        try {
            const { data: roots } = await api('/folders');
            const subs = await Promise.all(
                roots.map(r => api(`/folders?prefix=${encodeURIComponent(r.path)}`)
                    .then(x => x.data).catch(() => [])),
            );
            const all = [...roots, ...subs.flat()];
            const dl = $('cld-folder-list');
            if (dl) dl.innerHTML = all.map(f => `<option value="${esc(f.path)}"></option>`).join('');
        } catch (_) { /* chưa cấu hình cloud thì gõ tay vẫn được */ }
    }

    window.loadCloudinaryTab = function () {
        if (!inited) {
            inited = true;
            $('btn-cld-reload')?.addEventListener('click', () => { loadStatus(); loadInventory(); });
            $('btn-cld-preview')?.addEventListener('click', () => migrate(false));
            $('btn-cld-migrate')?.addEventListener('click', () => migrate(true));
            $('btn-cld-browse')?.addEventListener('click', () => browse(false));
            $('btn-cld-orphans')?.addEventListener('click', findOrphans);
            $('cld-type')?.addEventListener('change', () => { browseItems = []; browseCursor = null; $('cld-browser').innerHTML = ''; });
            loadFolderHints();
        }
        loadStatus();
        loadInventory();
    };
})();
