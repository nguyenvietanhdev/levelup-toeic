// ============================================================
// NAV GROUP TOGGLE (collapsible sidebar sections)
// ============================================================
function initNavGroups() {
    document.querySelectorAll('.nav-group-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const group = toggle.dataset.group;
            const items = document.getElementById('nav-group-' + group);
            const isOpen = toggle.classList.contains('open');
            toggle.classList.toggle('open', !isOpen);
            items.classList.toggle('open', !isOpen);
        });
    });
}

function openGroupForTab(tab) {
    const link = document.querySelector('.sidebar-link[data-main-tab="' + tab + '"]');
    if (!link) return;
    const items = link.closest('.nav-group-items');
    if (!items) return;
    items.classList.add('open');
    const toggle = items.previousElementSibling;
    if (toggle) toggle.classList.add('open');
}

// ============================================================
// ACHIEVEMENT DEFINITIONS CRUD
// ============================================================
var _achData = [];
async function loadAchievements() {
    const tbody = document.getElementById('achievements-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    try {
        const res = await fetch(API_URL + '/admin/achievements', { headers: { Authorization: 'Bearer ' + getToken() } });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        _achData = data.data || [];
        _renderAchievements(_achData);
        _setupAchSearch();
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--danger)">' + err.message + '</td></tr>';
    }
}

// ── Nút "Xuất bản" (bật/tắt isActive ngay ở dòng) — dùng chung 3 bảng ─────
function _publishBtnHtml(kind, id, active) {
    return '<button class="btn btn-sm btn-publish" data-kind="' + kind + '" data-id="' + id + '" data-active="' + (active ? 1 : 0) + '"' +
        ' title="' + (active ? 'Đang hiển thị trên giao diện — bấm để ẩn' : 'Đang ẩn — bấm để xuất bản') + '"' +
        ' style="background:' + (active ? '#dcfce7' : '#f1f5f9') + ';color:' + (active ? '#16a34a' : '#64748b') + ';border:1px solid ' + (active ? '#86efac' : '#cbd5e1') + ';border-radius:6px;padding:4px 9px;margin-right:4px">' +
        '<i class="fas ' + (active ? 'fa-eye' : 'fa-eye-slash') + '"></i></button>';
}
function _bindPublishButtons() {
    document.querySelectorAll('.btn-publish').forEach(function (btn) {
        btn.onclick = async function () {
            var kind = btn.dataset.kind, id = btn.dataset.id, next = btn.dataset.active !== '1';
            var res = await fetch(API_URL + '/admin/' + kind + '/' + id, {
                method: 'PUT', headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: next }),
            });
            var j = await res.json();
            showToast(j.success ? (next ? 'Đã xuất bản (hiện trên giao diện)' : 'Đã ẩn khỏi giao diện') : (j.message || 'Lỗi'), j.success ? 'success' : 'error');
            if (j.success) { if (kind === 'quests') loadQuests(); else if (kind === 'achievements') loadAchievements(); }
        };
    });
}

function _renderAchievements(defs) {
    const tbody = document.getElementById('achievements-tbody');
    if (!defs.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-secondary)">Không có kết quả phù hợp.</td></tr>';
        return;
    }
    tbody.innerHTML = defs.map(d =>
        '<tr>' +
        '<td style="font-size:20px;text-align:center">' + (d.icon || '🏆') + '</td>' +
        '<td><strong>' + d.name + '</strong><br><small style="color:var(--text-secondary)">' + d.code + '</small></td>' +
        '<td><span class="badge neutral">' + d.category + '</span></td>' +
        '<td style="font-size:12px">' + d.conditionType + ' &ge; ' + d.conditionValue + (d.conditionMode ? ' [' + d.conditionMode + ']' : '') + '</td>' +
        '<td style="font-size:12px">XP:' + (d.rewardXp||0) + ' 🪙' + (d.rewardCoins||0) + ' 💎' + (d.rewardGems||0) + '</td>' +
        '<td>' + (d.isActive ? '<span class="badge success">Bật</span>' : '<span class="badge neutral">Tắt</span>') + '</td>' +
        '<td>' +
          _publishBtnHtml('achievements', d._id, d.isActive) +
          '<button class="btn btn-ghost btn-sm btn-ach-edit" data-id="' + d._id + '" title="Sửa"><i class="fas fa-edit"></i></button> ' +
          '<button class="btn btn-danger btn-sm btn-ach-delete" data-id="' + d._id + '" data-name="' + d.name + '" title="Xóa"><i class="fas fa-trash"></i></button>' +
        '</td></tr>'
    ).join('');
    attachAchievementListeners();
}

function _setupAchSearch() {
    const inp = document.getElementById('ach-search');
    const sel = document.getElementById('ach-filter-cat');
    if (!inp || inp.dataset.bound) return;
    inp.dataset.bound = '1';
    
    function filter() {
        const q = inp.value.trim().toLowerCase();
        const cat = sel ? sel.value : '';
        let result = _achData;
        if (cat) result = result.filter(d => d.category === cat);
        if (q) result = result.filter(d => (d.name + d.code + d.category).toLowerCase().includes(q));
        _renderAchievements(result);
    }
    
    inp.addEventListener('input', filter);
    if (sel) sel.addEventListener('change', filter);
}

async function openAchievementModal(data) {
    data = data || {};
    document.getElementById('ach-id').value = data._id || '';
    document.getElementById('ach-modal-title').textContent = data._id ? 'Sửa thành tích' : 'Thêm thành tích';
    document.getElementById('ach-name').value = data.name || '';
    document.getElementById('ach-code').value = data.code || '';
    document.getElementById('ach-icon').value = data.icon || '';
    document.getElementById('ach-desc').value = data.description || '';
    document.getElementById('ach-category').value = data.category || 'learning';
    // Chuẩn hoá conditionType cũ (underscore / alias) sang khoá kebab
    // để select chọn đúng option. Xem ACHIEVEMENT_METRICS ở frontend.
    (function () {
        var raw = (data.conditionType || '').toLowerCase().replace(/_/g, '-');
        var alias = {
            'total-sessions': 'sessions', 'total-answers': 'correct-answers',
            'total-questions': 'questions-answered', 'longest-streak': 'streak-longest',
            'xp': 'total-xp', 'xp-total': 'total-xp', 'score': 'highest-score',
            'playtime': 'play-time', 'time': 'play-time'
        };
        document.getElementById('ach-cond-type').value = alias[raw] || raw;
    })();
    document.getElementById('ach-cond-value').value = data.conditionValue || 0;
    document.getElementById('ach-cond-mode').value = data.conditionMode || '';
    document.getElementById('ach-xp').value = data.rewardXp || 0;
    document.getElementById('ach-coins').value = data.rewardCoins || 0;
    document.getElementById('ach-gems').value = data.rewardGems || 0;
    document.getElementById('ach-order').value = data.order || 0;
    document.getElementById('ach-active').checked = data.isActive !== false;
    await _loadRewardCatalog('achievement');
    _renderItemRows('ach-items-rows', data.rewardItems || []);
    document.getElementById('achievement-modal').style.display = 'flex';
}

function attachAchievementListeners() {
    _bindPublishButtons();
    document.querySelectorAll('.btn-ach-edit').forEach(function(btn) {
        btn.onclick = async function() {
            const res = await fetch(API_URL + '/admin/achievements/' + btn.dataset.id, { headers: { Authorization: 'Bearer ' + getToken() } });
            const data = await res.json();
            if (data.success) openAchievementModal(data.data);
        };
    });
    document.querySelectorAll('.btn-ach-delete').forEach(function(btn) {
        btn.onclick = async function() {
            if (!confirm('Xóa thành tích "' + btn.dataset.name + '"?')) return;
            const res = await fetch(API_URL + '/admin/achievements/' + btn.dataset.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + getToken() } });
            const data = await res.json();
            showToast(data.message || 'Đã xóa', data.success ? 'success' : 'error');
            if (data.success) loadAchievements();
        };
    });
}

function initAchievementModal() {
    const btnAdd = document.getElementById('btn-add-achievement');
    if (btnAdd) btnAdd.addEventListener('click', function() { openAchievementModal(); });

    const btnCancel = document.getElementById('btn-ach-cancel');
    if (btnCancel) btnCancel.addEventListener('click', function() { document.getElementById('achievement-modal').style.display = 'none'; });

    const btnAddItem = document.getElementById('ach-items-add');
    if (btnAddItem) btnAddItem.addEventListener('click', async function() { await _loadRewardCatalog('achievement'); _addItemRow('ach-items-rows', '', 1); });

    const form = document.getElementById('achievement-form');
    if (form) form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const id = document.getElementById('ach-id').value;
        const payload = {
            name: document.getElementById('ach-name').value,
            code: document.getElementById('ach-code').value,
            icon: document.getElementById('ach-icon').value,
            description: document.getElementById('ach-desc').value,
            category: document.getElementById('ach-category').value,
            conditionType: document.getElementById('ach-cond-type').value,
            conditionValue: Number(document.getElementById('ach-cond-value').value),
            conditionMode: document.getElementById('ach-cond-mode').value || undefined,
            rewardXp: Number(document.getElementById('ach-xp').value),
            rewardCoins: Number(document.getElementById('ach-coins').value),
            rewardGems: Number(document.getElementById('ach-gems').value),
            rewardItems: _collectItemRows('ach-items-rows'),
            order: Number(document.getElementById('ach-order').value),
            isActive: document.getElementById('ach-active').checked,
        };
        const url = id ? API_URL + '/admin/achievements/' + id : API_URL + '/admin/achievements';
        const res = await fetch(url, { method: id ? 'PUT' : 'POST', headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        showToast(data.message || (id ? 'Đã cập nhật' : 'Đã tạo'), data.success ? 'success' : 'error');
        if (data.success) { document.getElementById('achievement-modal').style.display = 'none'; loadAchievements(); }
    });
}

// ============================================================
// QUEST DEFINITIONS CRUD
// ============================================================
var _questData = [];
async function loadQuests() {
    const tbody = document.getElementById('quests-tbody');
    tbody.innerHTML = '<tr><td colspan="8" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
    try {
        const res = await fetch(API_URL + '/admin/quests', { headers: { Authorization: 'Bearer ' + getToken() } });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        _questData = data.data || [];
        _renderQuests(_questData);
        _setupQuestSearch();
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--danger)">' + err.message + '</td></tr>';
    }
}

function _renderQuests(defs) {
    const tbody = document.getElementById('quests-tbody');
    if (!defs.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-secondary)">Không có kết quả phù hợp.</td></tr>';
        return;
    }
    tbody.innerHTML = defs.map(d =>
        '<tr>' +
        '<td style="font-size:20px;text-align:center">' + (d.icon || '⚔️') + '</td>' +
        '<td><strong>' + d.name + '</strong><br><small style="color:var(--text-secondary)">' + d.code + '</small></td>' +
        '<td><span class="badge ' + (d.type === 'daily' ? 'success' : 'neutral') + '">' + d.type + '</span></td>' +
        '<td>' + (d.mode || 'any') + '</td>' +
        '<td>' + d.target + '</td>' +
        '<td style="font-size:12px">XP:' + (d.rewardXp||0) + ' 🪙' + (d.rewardCoins||0) +
          ((d.rewardItems && d.rewardItems.length) ? ' 🎁' + d.rewardItems.map(function(i){return i.itemId+'×'+(i.quantity||1);}).join(',') : '') + '</td>' +
        '<td>' + (d.isActive ? '<span class="badge success">Bật</span>' : '<span class="badge neutral">Tắt</span>') + '</td>' +
        '<td>' +
          _publishBtnHtml('quests', d._id, d.isActive) +
          '<button class="btn btn-ghost btn-sm btn-quest-edit" data-id="' + d._id + '" title="Sửa"><i class="fas fa-edit"></i></button> ' +
          '<button class="btn btn-danger btn-sm btn-quest-delete" data-id="' + d._id + '" data-name="' + d.name + '" title="Xóa"><i class="fas fa-trash"></i></button>' +
        '</td></tr>'
    ).join('');
    attachQuestListeners();
}

function _setupQuestSearch() {
    const inp = document.getElementById('quest-search');
    const sel = document.getElementById('quest-filter-type');
    const selMode = document.getElementById('quest-filter-mode');
    if (!inp || inp.dataset.bound) return;
    inp.dataset.bound = '1';

    function filter() {
        const q = inp.value.trim().toLowerCase();
        const type = sel ? sel.value : '';
        const mode = selMode ? selMode.value : '';
        let result = _questData;
        if (type) result = result.filter(d => d.type === type);
        if (mode) result = result.filter(d => (d.mode || d.gameMode || '') === mode);
        if (q) result = result.filter(d => (d.name + d.code + (d.type||'')).toLowerCase().includes(q));
        _renderQuests(result);
    }

    inp.addEventListener('input', filter);
    if (sel) sel.addEventListener('change', filter);
    if (selMode) selMode.addEventListener('change', filter);
}

async function openQuestModal(data) {
    data = data || {};
    document.getElementById('quest-id').value = data._id || '';
    document.getElementById('quest-modal-title').textContent = data._id ? 'Sửa nhiệm vụ' : 'Thêm nhiệm vụ';
    document.getElementById('quest-name').value = data.name || '';
    document.getElementById('quest-code').value = data.code || '';
    document.getElementById('quest-icon').value = data.icon || '';
    document.getElementById('quest-desc').value = data.description || '';
    document.getElementById('quest-type').value = data.type || 'daily';
    document.getElementById('quest-mode').value = data.mode || 'any';
    document.getElementById('quest-metric').value = data.metric || '';
    document.getElementById('quest-source').value = data.source || 'computed';
    var paramsEl = document.getElementById('quest-params');
    if (paramsEl) {
        var p = data.params;
        paramsEl.value = (p && Object.keys(p).length) ? JSON.stringify(p) : '';
    }
    document.getElementById('quest-target').value = data.target || 3;
    document.getElementById('quest-weight').value = data.weight || 1;
    document.getElementById('quest-xp').value = data.rewardXp || 0;
    document.getElementById('quest-coins').value = data.rewardCoins || 0;
    document.getElementById('quest-active').checked = data.isActive !== false;
    await _loadRewardCatalog('quest');
    _renderItemRows('quest-items-rows', data.rewardItems || []);
    document.getElementById('quest-modal').style.display = 'flex';
}

// ── Builder thưởng vật phẩm (chọn từ catalog thay vì gõ tay) ──────
var QUEST_ITEM_CATALOG = null; // [{itemId,name}]
async function _loadQuestItemCatalog() {
    if (QUEST_ITEM_CATALOG) return QUEST_ITEM_CATALOG;
    try {
        var r = await fetch(API_URL + '/inventory/items');
        var j = await r.json();
        QUEST_ITEM_CATALOG = (j.success ? j.data : []).map(function (d) { return { itemId: d.itemId, name: d.name, type: d.type }; });
    } catch (_) { QUEST_ITEM_CATALOG = []; }
    return QUEST_ITEM_CATALOG;
}
// Catalog phần thưởng LỌC THEO KÊNH: chỉ item đã xuất bản & thuộc danh mục mà
// kênh (quest/achievement) đã tick. Dùng /categories/channel/:channel.
var _rewardCatalogByChannel = {};
var _activeRewardCatalog = [];
async function _loadRewardCatalog(channel) {
    if (!_rewardCatalogByChannel[channel]) {
        try {
            var r = await fetch(API_URL + '/categories/channel/' + channel);
            var j = await r.json();
            var items = (j.success && j.data ? j.data.items : []) || [];
            _rewardCatalogByChannel[channel] = items.map(function (d) { return { itemId: d.itemId, name: d.name }; });
        } catch (_) { _rewardCatalogByChannel[channel] = []; }
    }
    _activeRewardCatalog = _rewardCatalogByChannel[channel];
    return _activeRewardCatalog;
}
function _questItemOptions(selected) {
    var opts = '<option value="">— chọn vật phẩm —</option>';
    var found = false;
    (_activeRewardCatalog || []).forEach(function (c) {
        var sel = c.itemId === selected;
        if (sel) found = true;
        opts += '<option value="' + c.itemId + '"' + (sel ? ' selected' : '') + '>' + c.name + ' (' + c.itemId + ')</option>';
    });
    // Item đã lưu nhưng nay không thuộc danh mục kênh → vẫn giữ để không mất dữ liệu.
    if (selected && !found) opts += '<option value="' + selected + '" selected>' + selected + ' (ngoài danh mục)</option>';
    return opts;
}
// Builder chung (dùng cho Nhiệm vụ + Thành tích): wrapId là id của container dòng.
function _addItemRow(wrapId, itemId, qty) {
    var wrap = document.getElementById(wrapId);
    if (!wrap) return;
    var row = document.createElement('div');
    row.className = 'reward-item-row';
    row.style.cssText = 'display:flex;gap:6px;align-items:center';
    row.innerHTML =
        '<select class="qi-item" style="flex:1;padding:8px;border:1.5px solid var(--border-color);border-radius:8px;background:var(--bg-primary,#fff);color:var(--text-primary)">' + _questItemOptions(itemId || '') + '</select>' +
        '<input class="qi-qty" type="number" min="1" value="' + (qty || 1) + '" title="Số lượng" style="width:80px;padding:8px;border:1.5px solid var(--border-color);border-radius:8px">' +
        '<button type="button" class="qi-del" title="Xóa" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;padding:7px 10px;cursor:pointer"><i class="fas fa-times"></i></button>';
    row.querySelector('.qi-del').onclick = function () { row.remove(); };
    wrap.appendChild(row);
}
function _renderItemRows(wrapId, items) {
    var wrap = document.getElementById(wrapId);
    if (!wrap) return;
    wrap.innerHTML = '';
    (items || []).forEach(function (i) { _addItemRow(wrapId, i.itemId, i.quantity || 1); });
}
function _collectItemRows(wrapId) {
    var out = [];
    document.querySelectorAll('#' + wrapId + ' .reward-item-row').forEach(function (row) {
        var itemId = row.querySelector('.qi-item').value.trim();
        if (!itemId) return;
        var qty = Math.max(1, parseInt(row.querySelector('.qi-qty').value, 10) || 1);
        out.push({ itemId: itemId, quantity: qty });
    });
    return out;
}

function attachQuestListeners() {
    _bindPublishButtons();
    document.querySelectorAll('.btn-quest-edit').forEach(function(btn) {
        btn.onclick = async function() {
            const res = await fetch(API_URL + '/admin/quests/' + btn.dataset.id, { headers: { Authorization: 'Bearer ' + getToken() } });
            const data = await res.json();
            if (data.success) openQuestModal(data.data);
        };
    });
    document.querySelectorAll('.btn-quest-delete').forEach(function(btn) {
        btn.onclick = async function() {
            if (!confirm('Xóa nhiệm vụ "' + btn.dataset.name + '"?')) return;
            const res = await fetch(API_URL + '/admin/quests/' + btn.dataset.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + getToken() } });
            const data = await res.json();
            showToast(data.message || 'Đã xóa', data.success ? 'success' : 'error');
            if (data.success) loadQuests();
        };
    });
}

function initQuestModal() {
    const btnAdd = document.getElementById('btn-add-quest');
    if (btnAdd) btnAdd.addEventListener('click', function() { openQuestModal(); });

    const btnCancel = document.getElementById('btn-quest-cancel');
    if (btnCancel) btnCancel.addEventListener('click', function() { document.getElementById('quest-modal').style.display = 'none'; });

    const btnAddItem = document.getElementById('quest-items-add');
    if (btnAddItem) btnAddItem.addEventListener('click', async function() { await _loadRewardCatalog('quest'); _addItemRow('quest-items-rows', '', 1); });

    const form = document.getElementById('quest-form');
    if (form) form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const id = document.getElementById('quest-id').value;
        const payload = {
            name: document.getElementById('quest-name').value,
            code: document.getElementById('quest-code').value,
            icon: document.getElementById('quest-icon').value,
            description: document.getElementById('quest-desc').value,
            type: document.getElementById('quest-type').value,
            mode: document.getElementById('quest-mode').value,
            metric: document.getElementById('quest-metric').value,
            source: document.getElementById('quest-source').value,
            params: (function () {
                var raw = (document.getElementById('quest-params').value || '').trim();
                if (!raw) return {};
                try { return JSON.parse(raw); }
                catch (_) { showToast('Params không phải JSON hợp lệ — bỏ qua', 'error'); return {}; }
            })(),
            target: Number(document.getElementById('quest-target').value),
            weight: Number(document.getElementById('quest-weight').value),
            rewardXp: Number(document.getElementById('quest-xp').value),
            rewardCoins: Number(document.getElementById('quest-coins').value),
            rewardItems: _collectItemRows('quest-items-rows'),
            isActive: document.getElementById('quest-active').checked,
        };
        const url = id ? API_URL + '/admin/quests/' + id : API_URL + '/admin/quests';
        const res = await fetch(url, { method: id ? 'PUT' : 'POST', headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        showToast(data.message || (id ? 'Đã cập nhật' : 'Đã tạo'), data.success ? 'success' : 'error');
        if (data.success) { document.getElementById('quest-modal').style.display = 'none'; loadQuests(); }
    });
}

// ============================================================
// API REFERENCE
// ============================================================
var API_ENDPOINTS = [
    // Auth
    { method:'POST', path:'/api/auth/login',               desc:'Đăng nhập',                         group:'auth', auth:false },
    { method:'POST', path:'/api/auth/register',            desc:'Đăng ký trực tiếp',                  group:'auth', auth:false },
    { method:'POST', path:'/api/auth/send-register-otp',   desc:'Gửi OTP đăng ký',                    group:'auth', auth:false },
    { method:'POST', path:'/api/auth/verify-register-otp', desc:'Xác minh OTP và tạo tài khoản',      group:'auth', auth:false },
    { method:'POST', path:'/api/auth/forgot-password',     desc:'Quên mật khẩu — gửi OTP',            group:'auth', auth:false },
    { method:'POST', path:'/api/auth/reset-password',      desc:'Đặt lại mật khẩu',                   group:'auth', auth:false },
    { method:'POST', path:'/api/auth/check-lock',          desc:'Kiểm tra khóa tài khoản',             group:'auth', auth:false },
    { method:'GET',  path:'/api/auth/me',                  desc:'Lấy thông tin user hiện tại',         group:'auth', auth:true  },
    { method:'PUT',  path:'/api/auth/profile',             desc:'Cập nhật profile',                    group:'auth', auth:true  },
    { method:'PUT',  path:'/api/auth/change-password',     desc:'Đổi mật khẩu',                        group:'auth', auth:true  },
    { method:'POST', path:'/api/auth/logout',              desc:'Đăng xuất',                           group:'auth', auth:true  },
    { method:'POST', path:'/api/auth/sync-progress',       desc:'Đồng bộ tiến trình từ client',        group:'auth', auth:true  },
    // User state
    { method:'GET',  path:'/api/user-state/state',         desc:'Lấy toàn bộ game state',              group:'game', auth:true  },
    { method:'POST', path:'/api/user-state/state',         desc:'Lưu game state',                      group:'game', auth:true  },
    { method:'PATCH',path:'/api/user-state/resources',     desc:'Cập nhật resources',                  group:'game', auth:true  },
    { method:'PATCH',path:'/api/user-state/progress',      desc:'Cập nhật progress',                   group:'game', auth:true  },
    { method:'PATCH',path:'/api/user-state/quests',        desc:'Cập nhật quests hôm nay',             group:'game', auth:true  },
    { method:'POST', path:'/api/user-state/xp',            desc:'Thêm XP',                             group:'game', auth:true  },
    { method:'POST', path:'/api/user-state/achievement',   desc:'Unlock thành tích',                   group:'game', auth:true  },
    { method:'POST', path:'/api/user-state/purchase',      desc:'Mua item shop',                       group:'game', auth:true  },
    { method:'GET',  path:'/api/user-state/shop',          desc:'Danh sách shop items',                group:'game', auth:true  },
    { method:'POST', path:'/api/user-state/heartbeat',     desc:'Cập nhật lastLoginAt (online)',       group:'game', auth:true  },
    // Practice
    { method:'POST', path:'/api/practice/start',           desc:'Bắt đầu session (trừ energy)',        group:'game', auth:true  },
    { method:'POST', path:'/api/practice/submit',          desc:'Nộp kết quả session',                 group:'game', auth:true  },
    { method:'GET',  path:'/api/practice/history',         desc:'Lịch sử luyện tập',                   group:'game', auth:true  },
    { method:'GET',  path:'/api/practice/stats',           desc:'Thống kê tổng hợp',                   group:'game', auth:true  },
    { method:'GET',  path:'/api/practice/recent',          desc:'Sessions gần đây',                    group:'game', auth:true  },
    { method:'GET',  path:'/api/practice/:id',             desc:'Chi tiết 1 session',                  group:'game', auth:true  },
    // TOEIC
    { method:'GET',  path:'/api/toeic/tests',              desc:'Danh sách bài thi',                   group:'toeic', auth:true },
    { method:'GET',  path:'/api/toeic/tests/:id',          desc:'Chi tiết bài thi',                    group:'toeic', auth:true },
    { method:'POST', path:'/api/toeic/attempts/start',     desc:'Bắt đầu lượt thi',                    group:'toeic', auth:true },
    { method:'PUT',  path:'/api/toeic/attempts/:id/save',  desc:'Lưu tiến trình thi',                  group:'toeic', auth:true },
    { method:'POST', path:'/api/toeic/attempts/:id/submit',desc:'Nộp bài thi',                         group:'toeic', auth:true },
    { method:'GET',  path:'/api/toeic/attempts',           desc:'Lịch sử thi của user',                group:'toeic', auth:true },
    { method:'GET',  path:'/api/toeic/attempts/:id',       desc:'Chi tiết lượt thi',                   group:'toeic', auth:true },
    // Vocabulary
    { method:'GET',  path:'/api/vocabulary',               desc:'Danh sách từ vựng',                   group:'vocab', auth:false },
    { method:'POST', path:'/api/vocabulary',               desc:'Thêm từ vựng mới',                    group:'vocab', auth:true  },
    { method:'PUT',  path:'/api/vocabulary/:id',           desc:'Sửa từ vựng',                         group:'vocab', auth:true  },
    { method:'DELETE',path:'/api/vocabulary/:id',          desc:'Xóa từ vựng',                         group:'vocab', auth:true  },
    { method:'GET',  path:'/api/upload/check',             desc:'Kiểm tra quyền upload',               group:'vocab', auth:true  },
    { method:'POST', path:'/api/upload/vocabulary',        desc:'Upload 1 từ vựng private',            group:'vocab', auth:true  },
    { method:'GET',  path:'/api/upload/my-topics',         desc:'Danh sách source của user',           group:'vocab', auth:true  },
    { method:'GET',  path:'/api/upload/my-vocabulary/:src',desc:'Từ vựng private theo source',         group:'vocab', auth:true  },
    // Wrong words
    { method:'GET',  path:'/api/wrong-words',              desc:'Từ sai của user',                     group:'game', auth:true  },
    { method:'POST', path:'/api/wrong-words',              desc:'Thêm từ sai',                         group:'game', auth:true  },
    { method:'DELETE',path:'/api/wrong-words/:id',         desc:'Xóa từ sai',                          group:'game', auth:true  },
    // Leaderboard
    { method:'GET',  path:'/api/leaderboard/:period?',     desc:'Bảng xếp hạng',                       group:'game', auth:false },
    { method:'GET',  path:'/api/leaderboard/rank/:userId', desc:'Xếp hạng của 1 user',                group:'game', auth:false },
    { method:'GET',  path:'/api/leaderboard/stats',        desc:'Thống kê tổng hợp leaderboard',       group:'game', auth:false },
    // Admin — users
    { method:'GET',  path:'/api/users',                    desc:'Danh sách tất cả user',               group:'admin', auth:true },
    { method:'GET',  path:'/api/users/:id',                desc:'Chi tiết 1 user',                     group:'admin', auth:true },
    { method:'POST', path:'/api/users',                    desc:'Tạo user mới',                        group:'admin', auth:true },
    { method:'PUT',  path:'/api/users/:id',                desc:'Cập nhật user',                       group:'admin', auth:true },
    { method:'DELETE',path:'/api/users/:id',               desc:'Xóa user',                            group:'admin', auth:true },
    // Admin — achievements / quests
    { method:'GET',  path:'/api/admin/achievements',       desc:'Danh sách achievement definitions',   group:'admin', auth:true },
    { method:'POST', path:'/api/admin/achievements',       desc:'Tạo achievement definition',          group:'admin', auth:true },
    { method:'GET',  path:'/api/admin/achievements/:id',   desc:'Chi tiết achievement',                group:'admin', auth:true },
    { method:'PUT',  path:'/api/admin/achievements/:id',   desc:'Cập nhật achievement',                group:'admin', auth:true },
    { method:'DELETE',path:'/api/admin/achievements/:id',  desc:'Xóa achievement',                     group:'admin', auth:true },
    { method:'GET',  path:'/api/admin/quests',             desc:'Danh sách quest definitions',         group:'admin', auth:true },
    { method:'POST', path:'/api/admin/quests',             desc:'Tạo quest definition',                group:'admin', auth:true },
    { method:'GET',  path:'/api/admin/quests/:id',         desc:'Chi tiết quest',                      group:'admin', auth:true },
    { method:'PUT',  path:'/api/admin/quests/:id',         desc:'Cập nhật quest',                      group:'admin', auth:true },
    { method:'DELETE',path:'/api/admin/quests/:id',        desc:'Xóa quest',                           group:'admin', auth:true },
    // Admin — toeic
    { method:'GET',  path:'/api/toeic/admin/questions',    desc:'Tất cả câu hỏi TOEIC',               group:'admin', auth:true },
    { method:'POST', path:'/api/toeic/admin/questions',    desc:'Thêm câu hỏi TOEIC',                 group:'admin', auth:true },
    { method:'PUT',  path:'/api/toeic/admin/questions/:id',desc:'Sửa câu hỏi TOEIC',                  group:'admin', auth:true },
    { method:'DELETE',path:'/api/toeic/admin/questions/:id',desc:'Xóa câu hỏi TOEIC',                group:'admin', auth:true },
    { method:'POST', path:'/api/toeic/admin/tests',        desc:'Tạo bài thi TOEIC',                  group:'admin', auth:true },
    { method:'PUT',  path:'/api/toeic/admin/tests/:id/publish',desc:'Publish bài thi',               group:'admin', auth:true },
    { method:'DELETE',path:'/api/toeic/admin/tests/:id',   desc:'Xóa bài thi',                        group:'admin', auth:true },
    { method:'GET',  path:'/api/toeic/admin/practice-history',desc:'Lịch sử thi tất cả user',        group:'admin', auth:true },
    { method:'GET',  path:'/api/toeic/admin/users-list',   desc:'User có lịch sử thi',                group:'admin', auth:true },
    // Admin — upload / reports / topics
    { method:'GET',  path:'/api/admin/upload/monitoring',  desc:'Giám sát uploads',                    group:'admin', auth:true },
    { method:'GET',  path:'/api/admin/upload/stats',       desc:'Thống kê uploads',                    group:'admin', auth:true },
    { method:'POST', path:'/api/reports',                  desc:'Gửi báo cáo',                         group:'user',  auth:false },
    { method:'GET',  path:'/api/reports',                  desc:'Danh sách báo cáo (admin)',            group:'admin', auth:true },
    { method:'GET',  path:'/api/topics',                   desc:'Danh sách chủ đề từ vựng',            group:'vocab', auth:false },
    { method:'POST', path:'/api/topics',                   desc:'Thêm chủ đề',                         group:'vocab', auth:true  },
    { method:'PUT',  path:'/api/topics/:id',               desc:'Sửa chủ đề',                          group:'vocab', auth:true  },
    { method:'DELETE',path:'/api/topics/:id',              desc:'Xóa chủ đề',                          group:'vocab', auth:true  },
];

var _apiRefInited = false;
function initApiReference() {
    if (_apiRefInited) return;
    _apiRefInited = true;

    var countEl = document.getElementById('api-ref-count');
    if (countEl) countEl.textContent = API_ENDPOINTS.length + ' endpoints';

    function render(group) {
        var list = document.getElementById('api-ref-list');
        var items = group === 'all' ? API_ENDPOINTS : API_ENDPOINTS.filter(function(e) { return e.group === group; });
        list.innerHTML = items.map(function(e) {
            return '<div class="api-ref-row">' +
                '<span class="api-method ' + e.method + '">' + e.method + '</span>' +
                '<span class="api-ref-path">' + e.path + '</span>' +
                '<span class="api-ref-desc">' + e.desc + '</span>' +
                (e.auth ? '<span class="api-ref-auth">Auth</span>' : '') +
                '</div>';
        }).join('');
    }

    render('all');

    document.querySelectorAll('.api-filter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.api-filter-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            render(btn.dataset.group);
        });
    });
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    initNavGroups();
    initAchievementModal();
    initQuestModal();
    initAiGenModal();
    initCopyJsonButtons();
    initDeleteAllButtons();

    // Auto-open group for current active tab
    var activeLink = document.querySelector('.sidebar-link.active[data-main-tab]');
    if (activeLink) openGroupForTab(activeLink.dataset.mainTab);
});

// ============================================================
// COPY ALL AS JSON — xuất toàn bộ Thành tích / Nhiệm vụ ra JSON
// (dùng làm backup hoặc đưa vào AI để sinh thêm theo style cũ).
// ============================================================
async function copyAllJson(kind) {
    var endpoint = kind === 'quest' ? '/admin/quests' : '/admin/achievements';
    try {
        var res = await fetch(API_URL + endpoint, {
            headers: { Authorization: 'Bearer ' + getToken() },
        });
        var data = await res.json();
        if (!data.success) throw new Error(data.message || 'Lỗi tải dữ liệu');
        var arr = data.data || [];
        // Strip các field nội bộ Mongoose để JSON gọn + import lại được sạch.
        var STRIP = { _id: 1, __v: 1, createdAt: 1, updatedAt: 1 };
        var cleaned = arr.map(function (d) {
            var o = {};
            Object.keys(d).forEach(function (k) { if (!STRIP[k]) o[k] = d[k]; });
            return o;
        });
        var text = JSON.stringify(cleaned, null, 2);

        var done = function () { showToast('Đã copy ' + cleaned.length + ' ' + (kind === 'quest' ? 'nhiệm vụ' : 'thành tích') + ' (JSON)', 'success'); };
        var fail = function () { showToast('Không copy được', 'error'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(fail);
        } else {
            var ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); done(); } catch (_) { fail(); }
            document.body.removeChild(ta);
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function initCopyJsonButtons() {
    document.getElementById('btn-copy-achievement-json')?.addEventListener('click', function () { copyAllJson('achievement'); });
    document.getElementById('btn-copy-quest-json')?.addEventListener('click', function () { copyAllJson('quest'); });
}

function initDeleteAllButtons() {
    document.getElementById('btn-delete-all-achievements')?.addEventListener('click', async function () {
        if (!confirm('Xóa TẤT CẢ thành tích? Hành động này không thể hoàn tác!')) return;
        try {
            const res = await fetch(API_URL + '/admin/achievements/delete-all', {
                method: 'DELETE',
                headers: { Authorization: 'Bearer ' + getToken() }
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            showToast('Đã xóa ' + (data.deletedCount || 0) + ' thành tích', 'success');
            loadAchievements();
        } catch (err) { showToast(err.message, 'error'); }
    });

    document.getElementById('btn-delete-all-quests')?.addEventListener('click', async function () {
        if (!confirm('Xóa TẤT CẢ nhiệm vụ? Hành động này không thể hoàn tác!')) return;
        try {
            const res = await fetch(API_URL + '/admin/quests/delete-all', {
                method: 'DELETE',
                headers: { Authorization: 'Bearer ' + getToken() }
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            showToast('Đã xóa ' + (data.deletedCount || 0) + ' nhiệm vụ', 'success');
            loadQuests();
        } catch (err) { showToast(err.message, 'error'); }
    });
}

// ============================================================
// AI GENERATE — chung cho Thành tích + Nhiệm vụ
// User copy prompt → đưa vào ChatGPT/Claude → dán JSON về → import
// hàng loạt qua /admin/{achievements|quests} (mỗi entry 1 POST).
// ============================================================
var AI_GEN_MODE = 'achievement';

// 16 chế độ luyện tập của hệ thống — dùng cho cả achievement (conditionMode
// khi conditionType='mode-plays') và quest (params.mode khi metric='play-mode',
// hoặc field mode top-level cho lọc).
var GAME_MODES_LIST = [
    'flashcard          — học từ bằng thẻ ghi nhớ',
    'multiple-choice    — chọn nghĩa đúng (trắc nghiệm)',
    'matching           — nối từ với nghĩa',
    'word-type-check    — xác định từ loại (noun/verb/...)',
    'listening          — nghe và chọn',
    'pronunciation      — luyện phát âm (mic)',
    'dictation          — chép chính tả',
    'sentence-listening — nghe chuỗi từ',
    'fill-blank         — điền từ vào chỗ trống',
    'example-fill-blank — điền vào câu ví dụ',
    'sentence-builder   — xếp câu',
    'phonetic-quiz      — đọc phiên âm IPA',
    'context-learning   — hiểu qua câu',
    'synonym-check      — chọn từ đồng nghĩa',
    'speed-quiz         — trả lời tốc độ',
    'review-mistakes    — ôn lại từ sai',
];

function aiGenPrompt(mode, count) {
    var n = count || 10;
    if (mode === 'achievement') {
        return [
            'Bạn là designer hệ thống game-hoá cho một app học tiếng Anh TOEIC.',
            'Hệ thống đã có: 16 chế độ luyện tập, theo dõi từ đã học / từ đã thuộc / streak ngày / level / XP / coins / gems / điểm số / thời gian chơi / độ chính xác / lượt chơi từng chế độ. Mỗi thành tích có 1 điều kiện duy nhất; khi user đạt thì nhận thưởng (coins/xp/gems).',
            '',
            'Hãy sinh ' + n + ' THÀNH TÍCH dưới dạng MẢNG JSON theo schema BẮT BUỘC:',
            '',
            '[',
            '  {',
            '    "code":           "snake_case_unique",   // string unique, không dấu, ASCII',
            '    "name":           "Tên hiển thị (tiếng Việt, ngắn gọn)",',
            '    "description":    "Mô tả ngắn 1 dòng",',
            '    "icon":           "🏆",                  // CHÍNH XÁC 1 emoji',
            '    "category":       "learning",           // PHẢI là 1 trong 6:',
            '         // learning  — học từ vựng (words-learned, words-mastered…)  → tab "Học tập"',
            '         // practice  — luyện tập tổng (sessions, games-played…)       → tab "Luyện tập"',
            '         // skill     — kỹ năng (accuracy, perfect-rounds, level, total-xp) → tab "Luyện tập"',
            '         // speed     — tốc độ (mode-plays speed-quiz, highest-score)  → tab "Luyện tập"',
            '         // social    — xã hội/cộng đồng (leaderboard, …)              → tab "Xã hội"',
            '         // streak    — chuỗi ngày (streak, streak-longest)            → tab "Đặc biệt"',
            '    "conditionType":  "words-learned",      // PHẢI là 1 trong 18 metric (xem bảng dưới)',
            '    "conditionValue": 10,                    // ngưỡng số — đối chiếu metric',
            '    "conditionMode":  "",                    // BẮT BUỘC "" với mọi metric TRỪ "mode-plays"',
            '                                              // với "mode-plays" phải là 1 trong 16 mode (xem bảng dưới)',
            '    "rewardCoins":    100,                   // ≥ 0',
            '    "rewardXp":       50,                    // ≥ 0',
            '    "rewardGems":     0,                     // ≥ 0',
            '    "isActive":       true,',
            '    "order":          1                      // số thứ tự hiển thị',
            '  }',
            ']',
            '',
            '═══ DANH MỤC METRIC (conditionType) ═══',
            '┌────────────────────┬─────────────────────────────────────────────┬───────────────┐',
            '│ key                │ ý nghĩa                                     │ ngưỡng gợi ý  │',
            '├────────────────────┼─────────────────────────────────────────────┼───────────────┤',
            '│ words-learned      │ Tổng số từ đã học (đã trả lời đúng ≥1 lần)  │ 10/50/200/500 │',
            '│ words-mastered     │ Tổng số từ đã thuộc (qua nhiều lần)         │ 20/100/500    │',
            '│ sessions           │ Tổng số session đã hoàn thành               │ 5/50/200      │',
            '│ games-played       │ Tổng số lượt chơi (gồm cả không xong)       │ 10/100/500    │',
            '│ perfect-rounds     │ Số vòng đúng 100%                           │ 1/10/50/100   │',
            '│ correct-answers    │ Tổng câu trả lời đúng                       │ 50/500/5000   │',
            '│ wrong-answers      │ Tổng câu trả lời sai (cho thành tích kiểu  │ 50/500        │',
            '│                    │   "kiên trì" — sai nhiều mà vẫn cày)        │               │',
            '│ questions-answered │ Tổng câu đã trả lời (đúng + sai)            │ 100/1000      │',
            '│ streak             │ Streak HIỆN TẠI (ngày liên tiếp)            │ 3/7/30/100    │',
            '│ streak-longest     │ Streak DÀI NHẤT từng đạt                    │ 7/30/100      │',
            '│ level              │ Cấp độ user                                 │ 5/10/30/50    │',
            '│ total-xp           │ Tổng XP cộng dồn từ trước đến nay           │ 1000/10000    │',
            '│ coins              │ Số coins đang sở hữu (snapshot hiện tại)    │ 1000/10000    │',
            '│ gems               │ Số gems đang sở hữu                         │ 50/200/500    │',
            '│ highest-score      │ Điểm cao nhất 1 session                     │ 500/2000      │',
            '│ play-time          │ Tổng thời gian chơi (GIÂY)                  │ 3600/36000    │',
            '│ accuracy           │ Độ chính xác tổng thể (%)                   │ 70/85/95      │',
            '│ mode-plays         │ Số lượt chơi 1 chế độ CỤ THỂ                │ 10/50/200     │',
            '│                    │   → CẦN set conditionMode = mode key        │               │',
            '└────────────────────┴─────────────────────────────────────────────┴───────────────┘',
            '',
            '═══ 16 CHẾ ĐỘ GAME (conditionMode khi metric="mode-plays") ═══',
            GAME_MODES_LIST.map(function (m) { return '  • ' + m; }).join('\n'),
            '',
            '═══ MỨC THƯỞNG GỢI Ý ═══',
            '  Dễ  (ngưỡng nhỏ):  coins  50-150,  xp  25-75,   gems  0',
            '  Vừa (ngưỡng vừa):  coins 200-500,  xp 100-250,  gems  5-10',
            '  Khó (ngưỡng cao):  coins 700-1500, xp 350-750,  gems 15-30',
            '  Cực khó (top):     coins 2000+,    xp 1000+,    gems 50+',
            '',
            '═══ QUY TẮC ═══',
            '1. Trả về DUY NHẤT mảng JSON hợp lệ (bắt đầu [, kết thúc ]). KHÔNG markdown, KHÔNG ```.',
            '2. "code" duy nhất, snake_case, không dấu, dùng prefix mô tả category (vd "learn_100_words", "speed_demon_30", "perfect_streak_7").',
            '3. "conditionType" PHẢI nằm trong 18 metric ở bảng. Sai = backend reject.',
            '4. "category" PHẢI là 1 trong 6: learning, practice, streak, skill, speed, social. KHÔNG được đặt giá trị khác.',
            '5. Mức ngưỡng + reward đa dạng: có dễ, vừa, khó, cực khó (xem gợi ý). Trộn category để không trùng thể loại.',
            '6. Nếu chọn metric "mode-plays" → BẮT BUỘC conditionMode = key của 1 trong 16 chế độ. Các metric khác conditionMode = "".',
            '7. "icon" = 1 emoji liên quan ngữ nghĩa (📚 cho từ vựng, 🔥 cho streak, ⚡ cho tốc độ, 🎯 cho chính xác, 👑/🏆 cho top tier…).',
            '8. "order" tăng dần theo độ khó trong cùng category để UI sort đẹp.',
        ].join('\n');
    }
    // quest
    return [
        'Bạn là designer hệ thống game-hoá cho một app học tiếng Anh TOEIC.',
        'Quest = nhiệm vụ theo PERIOD (daily/weekly/monthly/special). Mỗi user mỗi period được bốc thăm theo weight từ pool; làm đạt target → claim nhận coins/xp/gems. Tiến độ tính SERVER-SIDE từ UserStats với metric chuẩn.',
        '',
        'Hãy sinh ' + n + ' NHIỆM VỤ dưới dạng MẢNG JSON theo schema BẮT BUỘC:',
        '',
        '[',
        '  {',
        '    "code":        "snake_case_unique",      // unique, không dấu',
        '    "name":        "Tên (có thể chứa {target} — sẽ được thay khi hiển thị)",',
        '    "description": "Mô tả ngắn 1 dòng",',
        '    "icon":        "🎮",                     // 1 emoji',
        '    "type":        "daily",                  // PHẢI là 1 trong:',
        '                                              //   daily   — reset 00:00 mỗi ngày',
        '                                              //   weekly  — reset thứ 2 mỗi tuần',
        '                                              //   monthly — reset ngày 1 mỗi tháng',
        '                                              //   special — không reset, mục tiêu lớn',
        '    "mode":        "any",                    // "any" cho mọi chế độ; hoặc 1 key trong 16 mode',
        '    "metric":      "complete-games",         // PHẢI là 1 trong 9 metric (xem bảng dưới)',
        '    "source":      "computed",               // LUÔN để "computed" (server tự tính từ UserStats)',
        '    "params":      {},                       // {"mode":"speed-quiz"} CHỈ khi metric="play-mode"',
        '    "target":      5,                        // ngưỡng đạt',
        '    "rewardCoins": 50,                       // ≥ 0',
        '    "rewardXp":    25,                       // ≥ 0',
        '    "rewardGems":  0,                        // ≥ 0; daily ít, monthly/special nhiều',
        '    "weight":      3,                        // 1-5, càng cao càng dễ trúng khi bốc daily',
        '    "isActive":    true',
        '  }',
        ']',
        '',
        '═══ DANH MỤC METRIC (chỉ 9 cái này hợp lệ) ═══',
        '┌──────────────────┬───────────────────────────────────────────────┬────────────────┐',
        '│ key              │ tăng khi nào (server tự đo, không client emit)│ target gợi ý   │',
        '├──────────────────┼───────────────────────────────────────────────┼────────────────┤',
        '│ complete-games   │ Mỗi lần hoàn thành 1 session bất kỳ           │ daily 3-10     │',
        '│ correct-answers  │ Mỗi câu trả lời đúng                          │ daily 10-40    │',
        '│ learn-words      │ Mỗi từ MỚI được học (chưa có trong list)      │ daily 5-30     │',
        '│ earn-xp          │ Tổng XP kiếm được trong period                │ daily 100-500  │',
        '│ daily-streak     │ Streak hiện tại (giá trị tuyệt đối)           │ 1/7/14/30      │',
        '│ perfect-rounds   │ Vòng đúng 100%                                │ daily 1-5      │',
        '│ play-mode        │ Lượt chơi 1 CHẾ ĐỘ cụ thể (cần params.mode)   │ daily 2-5      │',
        '│ complete-toeic   │ Hoàn thành bài thi TOEIC (full hoặc mini)     │ 1-3            │',
        '│ login-today      │ Đăng nhập app hôm nay (tự tick khi mở)        │ 1 (target=1)   │',
        '└──────────────────┴───────────────────────────────────────────────┴────────────────┘',
        '',
        '═══ 16 CHẾ ĐỘ GAME (mode + params.mode khi cần) ═══',
        GAME_MODES_LIST.map(function (m) { return '  • ' + m; }).join('\n'),
        '',
        '═══ MỨC THƯỞNG THEO TYPE ═══',
        '  daily   : coins  30-200,  xp  15-120,  gems  0',
        '  weekly  : coins 250-500,  xp 100-200,  gems  3-10',
        '  monthly : coins 800-1500, xp 400-800,  gems 12-30',
        '  special : coins 500-2000, xp 300-1000, gems 10-50',
        '',
        '═══ QUY TẮC ═══',
        '1. Trả về DUY NHẤT mảng JSON hợp lệ (bắt đầu [, kết thúc ]). KHÔNG markdown, KHÔNG ```.',
        '2. "code" duy nhất, snake_case, prefix theo type (vd "daily_correct_30", "weekly_streak_7", "monthly_perfect_20", "special_first_toeic").',
        '3. "metric" PHẢI nằm trong 9 metric ở bảng. Sai = quest không bao giờ tick.',
        '4. "source" LUÔN là "computed" (đừng để "event" cho quest mới).',
        '5. Nếu metric = "play-mode" → BẮT BUỘC params = {"mode":"<key chế độ>"} và đặt mode top-level cùng giá trị; KHÔNG để "any".',
        '6. target phải hợp lý theo type: daily nhỏ, weekly trung bình (×5-7), monthly to (×20-30), special là cột mốc lớn.',
        '7. weight 1-5: quest "phổ thông" weight 3-5, quest "đặc thù/khó" weight 1-2. Tổng pool nên có cả dễ và khó.',
        '8. "icon" emoji liên quan: 🎮 game, ✅ đúng, 📚 từ vựng, 🔥 streak, ⚡ tốc độ, ⭐ hoàn hảo, 🎯 mục tiêu, 🎓 TOEIC, 👋 login.',
    ].join('\n');
}

function openAiGenModal(mode) {
    AI_GEN_MODE = mode;
    var title = document.getElementById('ai-gen-title');
    if (title) title.textContent = mode === 'quest' ? 'Tạo Nhiệm vụ bằng AI' : 'Tạo Thành tích bằng AI';
    var ta = document.getElementById('ai-gen-json'); if (ta) ta.value = '';
    var rs = document.getElementById('ai-gen-result'); if (rs) rs.style.display = 'none';
    document.getElementById('ai-gen-modal').style.display = 'flex';
}

function copyAiGenPrompt() {
    var count = parseInt(document.getElementById('ai-gen-count')?.value || '10', 10) || 10;
    var prompt = aiGenPrompt(AI_GEN_MODE, count);
    var done = function () { showToast('Đã copy prompt — dán vào ChatGPT/Claude rồi lấy JSON về', 'success'); };
    var fail = function () { showToast('Không copy được, hãy chọn và copy thủ công', 'error'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(prompt).then(done).catch(fail);
    } else {
        var t = document.createElement('textarea');
        t.value = prompt; t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); done(); } catch (_) { fail(); }
        document.body.removeChild(t);
    }
}

async function importAiGenJson() {
    var raw = (document.getElementById('ai-gen-json').value || '').trim();
    var resultDiv = document.getElementById('ai-gen-result');
    if (!raw) { showToast('Vui lòng dán JSON', 'error'); return; }

    var arr;
    try {
        var parsed = JSON.parse(raw);
        arr = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) { showToast('JSON không hợp lệ: ' + e.message, 'error'); return; }
    if (arr.length === 0) { showToast('Mảng JSON trống', 'error'); return; }

    var endpoint = AI_GEN_MODE === 'quest' ? '/admin/quests' : '/admin/achievements';
    var btn = document.getElementById('btn-ai-gen-import');
    btn.disabled = true;
    var origLabel = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang import...';
    resultDiv.style.display = 'none';

    var ok = 0, errors = [];
    for (var i = 0; i < arr.length; i++) {
        try {
            var res = await fetch(API_URL + endpoint, {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
                body: JSON.stringify(arr[i]),
            });
            var data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.message || 'Server error');
            ok++;
        } catch (e) {
            errors.push('#' + (i + 1) + ' ' + (arr[i]?.code || arr[i]?.name || '') + ': ' + e.message);
        }
    }

    btn.disabled = false;
    btn.innerHTML = origLabel;

    resultDiv.style.display = 'block';
    resultDiv.style.background = errors.length === arr.length ? '#fef2f2' : errors.length === 0 ? '#f0fdf4' : '#fffbeb';
    resultDiv.style.border = '1px solid ' + (errors.length === arr.length ? '#fca5a5' : errors.length === 0 ? '#86efac' : '#fcd34d');
    resultDiv.style.color = '#111';
    resultDiv.innerHTML = '<b>' + arr.length + '</b> bản ghi — ✅ ' + ok + ' tạo mới · ❌ ' + errors.length + ' lỗi'
        + (errors.length ? '<ul style="margin:8px 0 0;padding-left:18px;color:#dc2626">' + errors.map(function (e) { return '<li>' + e + '</li>'; }).join('') + '</ul>' : '');

    // Reload bảng tương ứng
    if (ok > 0) {
        if (AI_GEN_MODE === 'quest' && typeof loadQuests === 'function') loadQuests();
        else if (typeof loadAchievements === 'function') loadAchievements();
    }
}

function initAiGenModal() {
    document.getElementById('btn-ai-gen-achievement')?.addEventListener('click', function () { openAiGenModal('achievement'); });
    document.getElementById('btn-ai-gen-quest')?.addEventListener('click', function () { openAiGenModal('quest'); });
    document.getElementById('btn-ai-gen-copy')?.addEventListener('click', copyAiGenPrompt);
    document.getElementById('btn-ai-gen-import')?.addEventListener('click', importAiGenJson);
    document.getElementById('btn-ai-gen-close')?.addEventListener('click', function () {
        document.getElementById('ai-gen-modal').style.display = 'none';
    });
}
