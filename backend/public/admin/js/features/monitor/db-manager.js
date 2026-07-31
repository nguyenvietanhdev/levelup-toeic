// ===================================
// DB MANAGER MODULE
// MongoDB collection browser + CRUD
// ===================================

const _db = {
    currentCollection: null,
    currentPage: 1,
    currentSearch: '',
    totalPages: 1,
    initialized: false,
};

// ── API helpers ──────────────────────────────────────────────
function dbFetch(url, options = {}) {
    return fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${getToken()}`,
            ...(options.headers || {}),
        },
    });
}

// ── Init ─────────────────────────────────────────────────────
function initDbManager() {
    if (_db.initialized) {
        loadDbCollections();
        return;
    }
    _db.initialized = true;

    document.getElementById('db-refresh-btn')?.addEventListener('click', loadDbCollections);
    document.getElementById('db-export-all-btn')?.addEventListener('click', exportAllCollections);
    document.getElementById('db-backup-btn')?.addEventListener('click', backupDatabase);
    document.getElementById('db-restore-btn')?.addEventListener('click', () => {
        document.getElementById('db-restore-input')?.click();
    });
    document.getElementById('db-restore-input')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // reset để chọn lại cùng file vẫn kích hoạt
        if (file) restoreDatabase(file);
    });

    // Event delegation cho collection list (tránh inline onclick)
    document.getElementById('db-col-list')?.addEventListener('click', (e) => {
        const item = e.target.closest('.db-col-item');
        if (item) selectDbCollection(item.dataset.col);
    });

    document.getElementById('db-search-btn')?.addEventListener('click', () => {
        _db.currentSearch = document.getElementById('db-search')?.value.trim() || '';
        loadDbDocuments(1);
    });
    document.getElementById('db-search-clear')?.addEventListener('click', () => {
        const inp = document.getElementById('db-search');
        if (inp) inp.value = '';
        _db.currentSearch = '';
        loadDbDocuments(1);
    });
    document.getElementById('db-search')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            _db.currentSearch = e.target.value.trim();
            loadDbDocuments(1);
        }
    });
    document.getElementById('db-btn-insert')?.addEventListener('click', openDbInsertModal);
    document.getElementById('db-btn-clear')?.addEventListener('click', clearCurrentCollection);
    document.getElementById('db-btn-drop')?.addEventListener('click', dropCurrentCollection);

    loadDbCollections();
}

// ── Collections list ─────────────────────────────────────────
async function loadDbCollections() {
    const list = document.getElementById('db-col-list');
    if (!list) return;
    list.innerHTML = '<div class="db-col-empty"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';

    try {
        const res = await dbFetch('/api/admin/db/collections');
        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        if (!json.data.length) {
            list.innerHTML = '<div class="db-col-empty">Không có collection nào</div>';
            return;
        }

        list.innerHTML = json.data.map(col => `
            <div class="db-col-item${_db.currentCollection === col.name ? ' active' : ''}"
                 data-col="${col.name}" style="cursor:pointer">
                <span class="db-col-name">${col.name}</span>
                <span class="db-col-count-badge">${col.count.toLocaleString()}</span>
            </div>
        `).join('');
    } catch (err) {
        list.innerHTML = `<div class="db-col-empty" style="color:var(--danger)"><i class="fas fa-exclamation-circle"></i> ${err.message}</div>`;
    }
}

// ── Export tất cả collections thành các file JSON riêng ──────
async function exportAllCollections() {
    const btn = document.getElementById('db-export-all-btn');
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const res = await dbFetch('/api/admin/db/collections');
        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        const collections = json.data.map(c => c.name);
        let done = 0;

        for (const name of collections) {
            // Lấy tất cả docs (limit lớn)
            const r = await dbFetch(`/api/admin/db/collections/${encodeURIComponent(name)}?page=1&limit=100000`);
            const d = await r.json();
            if (!d.success) continue;

            const docs = d.data || [];
            const blob = new Blob([JSON.stringify(docs, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name}.json`;
            a.click();
            URL.revokeObjectURL(url);
            done++;

            // Delay nhỏ để trình duyệt không block download
            await new Promise(r => setTimeout(r, 300));
        }

        showToast(`Đã xuất ${done} / ${collections.length} collections`, 'success');
    } catch (err) {
        showToast('Lỗi xuất dữ liệu: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
    }
}

// ── Sao lưu toàn bộ DB → 1 file (Extended JSON, phục hồi được) ─
async function backupDatabase() {
    const btn = document.getElementById('db-backup-btn');
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        const res = await dbFetch('/api/admin/db/export');
        if (!res.ok) {
            let msg = `HTTP ${res.status}`;
            try { msg = (await res.json()).message || msg; } catch {}
            throw new Error(msg);
        }
        const text = await res.text();
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        a.href = url;
        a.download = `backup-${stamp}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Đã tải file sao lưu toàn bộ DB', 'success');
    } catch (err) {
        showToast('Lỗi sao lưu: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
    }
}

// ── Phục hồi DB từ file sao lưu ───────────────────────────────
async function restoreDatabase(file) {
    const merge = confirm(
        `Phục hồi từ "${file.name}"?\n\n` +
        `• OK  = GỘP (giữ dữ liệu hiện có, ghi đè theo _id trùng)\n` +
        `• Cancel = sẽ hỏi tiếp chế độ THAY THẾ (xoá sạch rồi nạp lại)`
    );
    let mode = 'merge';
    if (!merge) {
        const replace = confirm(
            '⚠️ Chế độ THAY THẾ sẽ XOÁ SẠCH mọi collection có trong file rồi nạp lại ' +
            '(kể cả tài khoản người dùng). Bạn có thể bị đăng xuất nếu file từ DB khác.\n\n' +
            'OK = THAY THẾ · Cancel = huỷ phục hồi'
        );
        if (!replace) { showToast('Đã huỷ phục hồi', 'info'); return; }
        mode = 'replace';
    }

    const btn = document.getElementById('db-restore-btn');
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        const text = await file.text();
        const res = await dbFetch(`/api/admin/db/import?mode=${mode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' }, // tránh limit 2mb của express.json
            body: text,
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        const totalDocs = (json.report || []).reduce((n, r) => n + (r.written || 0), 0);
        showToast(`Phục hồi xong (${mode}): ${json.report.length} collection, ${totalDocs} bản ghi`, 'success');
        loadDbCollections();
        if (_db.currentCollection) loadDbDocuments(1);
    } catch (err) {
        showToast('Lỗi phục hồi: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
    }
}

// ── Select collection ─────────────────────────────────────────
function selectDbCollection(name) {
    _db.currentCollection = name;
    _db.currentPage = 1;
    _db.currentSearch = '';

    document.querySelectorAll('.db-col-item').forEach(el => {
        el.classList.toggle('active', el.dataset.col === name);
    });

    const inp = document.getElementById('db-search');
    if (inp) inp.value = '';

    document.getElementById('db-doc-empty').style.display = 'none';
    document.getElementById('db-doc-content').style.display = 'block';
    document.getElementById('db-col-title').textContent = name;

    loadDbDocuments(1);
}

// Expose for inline onclick
window.selectDbCollection = selectDbCollection;

// ── Documents list ────────────────────────────────────────────
async function loadDbDocuments(page = 1) {
    if (!_db.currentCollection) return;
    _db.currentPage = page;

    const list = document.getElementById('db-doc-list');
    if (list) list.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';

    try {
        const params = new URLSearchParams({
            page,
            limit: 20,
            search: _db.currentSearch,
        });
        const res = await dbFetch(`/api/admin/db/collections/${encodeURIComponent(_db.currentCollection)}?${params}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        _db.totalPages = json.pagination.pages;

        document.getElementById('db-col-count').textContent = `${json.pagination.total.toLocaleString()} docs`;

        renderDbDocs(json.data);
        renderDbPagination(json.pagination);
    } catch (err) {
        if (list) list.innerHTML = `<div class="loading" style="color:var(--danger)">${err.message}</div>`;
    }
}

// ── Document render (kiểu JSON như Mongo Compass) ──────────────
function renderDbDocs(docs) {
    const list = document.getElementById('db-doc-list');
    if (!list) return;

    if (!docs.length) {
        list.innerHTML = '<div class="loading">Không có dữ liệu</div>';
        return;
    }

    list.innerHTML = docs.map(doc =>
        `<div class="db-doc-card">${renderDocFields(doc)}</div>`
    ).join('');
}

// Render các trường top-level của 1 document
function renderDocFields(obj) {
    return Object.keys(obj).map(k =>
        `<div class="db-field"><span class="db-key">${escapeHtml(k)}</span><span class="db-colon">:</span> ${renderDbValue(obj[k], k)}</div>`
    ).join('');
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

function renderDbValue(val, key) {
    if (val === null || val === undefined) return '<span class="dbv-null">null</span>';

    if (Array.isArray(val)) {
        if (val.length === 0) return '<span class="dbv-meta">Array (empty)</span>';
        const json = escapeHtml(JSON.stringify(val, null, 2));
        return `<details class="dbv-tree"><summary class="dbv-meta">Array (${val.length})</summary><pre class="dbv-pre">${json}</pre></details>`;
    }
    if (typeof val === 'object') {
        const n = Object.keys(val).length;
        const json = escapeHtml(JSON.stringify(val, null, 2));
        return `<details class="dbv-tree"><summary class="dbv-meta">Object {${n}}</summary><pre class="dbv-pre">${json}</pre></details>`;
    }
    if (typeof val === 'boolean') return `<span class="dbv-bool">${val}</span>`;
    if (typeof val === 'number') return `<span class="dbv-num">${val}</span>`;

    // string
    const s = String(val);
    if (key === '_id' || OBJECT_ID_RE.test(s)) return `<span class="dbv-oid">ObjectId('${escapeHtml(s)}')</span>`;
    if (ISO_DATE_RE.test(s)) return `<span class="dbv-date">${escapeHtml(s)}</span>`;
    return `<span class="dbv-str">"${escapeHtml(s)}"</span>`;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
    return str.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

// ── Pagination ────────────────────────────────────────────────
function renderDbPagination(pagination) {
    const el = document.getElementById('db-doc-pagination');
    if (!el) return;

    const { page, pages, total, limit } = pagination;
    if (pages <= 1) { el.innerHTML = ''; return; }

    const from = (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);

    let html = `<span class="pagination-info">${from}–${to} / ${total.toLocaleString()}</span><div class="pagination-btns">`;

    html += `<button class="btn btn-ghost btn-sm" onclick="loadDbDocuments(1)" ${page === 1 ? 'disabled' : ''}><i class="fas fa-angle-double-left"></i></button>`;
    html += `<button class="btn btn-ghost btn-sm" onclick="loadDbDocuments(${page - 1})" ${page === 1 ? 'disabled' : ''}><i class="fas fa-angle-left"></i></button>`;

    const start = Math.max(1, page - 2);
    const end   = Math.min(pages, page + 2);
    for (let p = start; p <= end; p++) {
        html += `<button class="btn ${p === page ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="loadDbDocuments(${p})">${p}</button>`;
    }

    html += `<button class="btn btn-ghost btn-sm" onclick="loadDbDocuments(${page + 1})" ${page === pages ? 'disabled' : ''}><i class="fas fa-angle-right"></i></button>`;
    html += `<button class="btn btn-ghost btn-sm" onclick="loadDbDocuments(${pages})" ${page === pages ? 'disabled' : ''}><i class="fas fa-angle-double-right"></i></button>`;
    html += '</div>';

    el.innerHTML = html;
}

// ── JSON modal (shared for insert + edit) ────────────────────
function openDbJsonModal({ title, json, onSave }) {
    let modal = document.getElementById('db-json-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'db-json-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:640px;width:95%">
                <div class="modal-header">
                    <h3 id="db-modal-title">Document</h3>
                    <button class="btn btn-ghost btn-sm" onclick="closeDbJsonModal()"><i class="fas fa-times"></i></button>
                </div>
                <div style="padding:16px">
                    <textarea id="db-modal-textarea" style="width:100%;min-height:320px;font-family:monospace;font-size:13px;border:1px solid var(--border);border-radius:6px;padding:10px;background:var(--bg-secondary);color:var(--text-primary);resize:vertical"></textarea>
                    <div id="db-modal-error" style="color:var(--danger);font-size:12px;margin-top:6px;display:none"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-ghost" onclick="closeDbJsonModal()">Hủy</button>
                    <button class="btn btn-primary" id="db-modal-save">Lưu</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    document.getElementById('db-modal-title').textContent = title;
    document.getElementById('db-modal-textarea').value = JSON.stringify(json, null, 2);
    document.getElementById('db-modal-error').style.display = 'none';
    modal.style.display = 'flex';

    const saveBtn = document.getElementById('db-modal-save');
    saveBtn.onclick = async () => {
        const errEl = document.getElementById('db-modal-error');
        errEl.style.display = 'none';
        let parsed;
        try {
            parsed = JSON.parse(document.getElementById('db-modal-textarea').value);
        } catch {
            errEl.textContent = 'JSON không hợp lệ';
            errEl.style.display = 'block';
            return;
        }
        saveBtn.disabled = true;
        try {
            await onSave(parsed);
            closeDbJsonModal();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.style.display = 'block';
        } finally {
            saveBtn.disabled = false;
        }
    };
}

window.closeDbJsonModal = function () {
    const modal = document.getElementById('db-json-modal');
    if (modal) modal.style.display = 'none';
};

// ── Insert document ───────────────────────────────────────────
function openDbInsertModal() {
    openDbJsonModal({
        title: `Thêm document vào "${_db.currentCollection}"`,
        json: {},
        onSave: async (doc) => {
            const res = await dbFetch(`/api/admin/db/collections/${encodeURIComponent(_db.currentCollection)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(doc),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message);
            showToast('Đã thêm document', 'success');
            loadDbDocuments(_db.currentPage);
            loadDbCollections();
        },
    });
}

// ── Edit document ─────────────────────────────────────────────
function openDbEditModal(doc) {
    const id = doc._id;
    openDbJsonModal({
        title: `Sửa document`,
        json: doc,
        onSave: async (updated) => {
            const res = await dbFetch(`/api/admin/db/collections/${encodeURIComponent(_db.currentCollection)}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message);
            showToast('Đã cập nhật document', 'success');
            loadDbDocuments(_db.currentPage);
        },
    });
}

window.openDbEditModal = openDbEditModal;

// ── Delete document ───────────────────────────────────────────
async function deleteDbDocument(id) {
    if (!confirm(`Xóa document này?`)) return;
    try {
        const res = await dbFetch(`/api/admin/db/collections/${encodeURIComponent(_db.currentCollection)}/${id}`, {
            method: 'DELETE',
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        showToast('Đã xóa document', 'success');
        loadDbDocuments(_db.currentPage);
        loadDbCollections();
    } catch (err) {
        showToast(`Lỗi: ${err.message}`, 'error');
    }
}

window.deleteDbDocument = deleteDbDocument;

// ── Clear collection (Xóa toàn bộ data) ──────────────────────────
async function clearCurrentCollection() {
    const name = _db.currentCollection;
    if (!name) return;
    if (!confirm(`Xóa TOÀN BỘ dữ liệu của collection "${name}"? Hành động này không thể hoàn tác.`)) return;
    try {
        const res = await dbFetch(`/api/admin/db/collections/${encodeURIComponent(name)}/all`, {
            method: 'DELETE',
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        showToast(json.message || `Đã xóa toàn bộ dữ liệu của "${name}"`, 'success');
        loadDbDocuments(1);
        loadDbCollections();
    } catch (err) {
        showToast(`Lỗi: ${err.message}`, 'error');
    }
}

// ── Drop collection ───────────────────────────────────────────
async function dropCurrentCollection() {
    const name = _db.currentCollection;
    if (!name) return;
    const input = prompt(`CẢNH BÁO: Bạn sắp xóa toàn bộ collection "${name}" bao gồm cả dữ liệu và index.\nHành động này không thể hoàn tác.\nVui lòng nhập chính xác tên collection "${name}" để xác nhận:`);
    if (input !== name) {
        if (input !== null) showToast('Tên collection không khớp, đã hủy thao tác.', 'error');
        return;
    }
    try {
        const res = await dbFetch(`/api/admin/db/collections/${encodeURIComponent(name)}`, {
            method: 'DELETE',
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        showToast(`Đã drop "${name}"`, 'success');
        _db.currentCollection = null;
        document.getElementById('db-doc-empty').style.display = '';
        document.getElementById('db-doc-content').style.display = 'none';
        loadDbCollections();
    } catch (err) {
        showToast(`Lỗi: ${err.message}`, 'error');
    }
}
