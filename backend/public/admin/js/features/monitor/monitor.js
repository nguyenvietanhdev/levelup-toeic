// ===================================
// MONITOR MODULE
// System Metrics, Reports, Growth Chart, Word Modal
// ===================================

function startMetricsPolling() {
    loadSystemMetrics();
    if (!metricsPollingTimer) {
        metricsPollingTimer = setInterval(loadSystemMetrics, 10000);
    }
}

function stopMetricsPolling() {
    if (metricsPollingTimer) {
        clearInterval(metricsPollingTimer);
        metricsPollingTimer = null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-refresh-metrics')?.addEventListener('click', loadSystemMetrics);
    document.getElementById('btn-seed-achievements')?.addEventListener('click', seedAchievements);
    document.getElementById('btn-seed-quests')?.addEventListener('click', seedQuests);
    document.getElementById('btn-reset-user-quests')?.addEventListener('click', resetUserQuests);

    // Broadcast tab
    document.getElementById('bc-send-btn')?.addEventListener('click', sendBroadcast);
    document.getElementById('bc-history-refresh-btn')?.addEventListener('click', loadNotifHistory);
    document.getElementById('bc-gift-items-add')?.addEventListener('click', async function () {
        if (typeof _loadQuestItemCatalog === 'function') { await _loadQuestItemCatalog(); _addItemRow('bc-gift-items-rows', '', 1); }
    });
    _initBcEmailSearch();

    // User Stats tab
    document.getElementById('us-search-btn')?.addEventListener('click', () => loadUserStats(1));
    document.getElementById('us-reset-btn')?.addEventListener('click', () => loadUserStats(1, ''));
    document.getElementById('us-search')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadUserStats(1); });

    // Practice History tab
    document.getElementById('ph-search-btn')?.addEventListener('click', () => loadPracticeHistory12());
    document.getElementById('ph-reset-btn')?.addEventListener('click', () => loadPracticeHistory12(1, '', ''));
    document.getElementById('ph-search')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadPracticeHistory12(); });
});

async function loadSystemMetrics() {
    try {
        const res = await fetch('/api/admin/metrics', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        renderMetrics(d);
    } catch (err) {
        console.error('Metrics fetch error:', err);
    }
}

function renderMetrics(d) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    set('m-avg-latency', d.latency.avg + ' ms');
    set('m-p95',  d.latency.p95 + ' ms');
    set('m-p99',  d.latency.p99 + ' ms');
    set('m-rpm',  d.requests.rpm);
    set('m-total-req', d.requests.total.toLocaleString());
    set('m-error-rate', d.errorRate + '%');
    set('m-4xx', d.statusCodes['4xx']);
    set('m-5xx', d.statusCodes['5xx']);
    set('m-uptime', formatUptime(d.uptime));
    set('m-cpu', d.cpu + '%');

    const errEl = document.getElementById('m-error-rate');
    if (errEl) {
        errEl.style.color = d.errorRate > 5
            ? 'var(--danger)'
            : d.errorRate > 1 ? 'var(--warning)' : 'var(--success)';
    }

    set('m-cpu-bar-val', d.cpu + '%');
    setBarWidth('m-cpu-bar', d.cpu);

    const heapPct = d.memory.heapTotal > 0
        ? Math.round((d.memory.heapUsed / d.memory.heapTotal) * 100)
        : 0;
    set('m-heap-used',  d.memory.heapUsed);
    set('m-heap-total', d.memory.heapTotal);
    setBarWidth('m-heap-bar', heapPct);

    const rssPct = Math.min(100, Math.round((d.memory.rss / 512) * 100));
    set('m-rss', d.memory.rss);
    setBarWidth('m-rss-bar', rssPct);

    set('m-2xx',     d.statusCodes['2xx'].toLocaleString());
    set('m-4xx-big', d.statusCodes['4xx'].toLocaleString());
    set('m-5xx-big', d.statusCodes['5xx'].toLocaleString());

    renderSparkline(d.requests.timeline);
    renderTopRoutes(d.topRoutes);
    renderSlowRequests(d.slowRequests);

    set('m-last-updated', new Date().toLocaleTimeString('vi-VN'));
}

function setBarWidth(id, pct) {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.min(100, Math.max(0, pct)) + '%';
}

function formatUptime(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function renderSparkline(timeline) {
    const line = document.getElementById('m-sparkline-line');
    const fill = document.getElementById('m-sparkline-fill');
    if (!line || !fill || !timeline?.length) return;

    const W = 300, H = 60;
    const max = Math.max(...timeline, 1);
    const pts = timeline.map((v, i) => {
        const x = (i / (timeline.length - 1)) * W;
        const y = H - (v / max) * (H - 6);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    line.setAttribute('points', pts.join(' '));
    fill.setAttribute('points', [`0,${H}`, ...pts, `${W},${H}`].join(' '));
}

function renderTopRoutes(routes) {
    const el = document.getElementById('m-top-routes');
    if (!el) return;

    if (!routes?.length) {
        el.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>Chưa có request nào</p></div>`;
        return;
    }

    const maxCount = routes[0].count || 1;
    el.innerHTML = routes.map(r => {
        const [method, ...pathParts] = r.route.split(' ');
        const path = pathParts.join(' ');
        const msClass = r.avgMs < 100 ? 'ms-fast' : r.avgMs < 400 ? 'ms-medium' : 'ms-slow';
        const barW = Math.round((r.count / maxCount) * 100);
        return `
        <div class="monitor-route-row">
          <span class="monitor-route-method method-${method}">${method}</span>
          <div style="flex:1; min-width:0;">
            <div class="monitor-route-path">${path}</div>
            <div class="monitor-bar-track" style="height:3px; margin-top:4px;">
              <div class="monitor-bar-fill cpu" style="width:${barW}%; transition: width 0.4s;"></div>
            </div>
          </div>
          <div class="monitor-route-stats">
            <span class="monitor-route-count">${r.count}</span>
            <span class="monitor-route-ms ${msClass}">${r.avgMs}ms</span>
          </div>
        </div>`;
    }).join('');
}

function renderSlowRequests(slow) {
    const el = document.getElementById('m-slow-requests');
    if (!el) return;

    if (!slow?.length) {
        el.innerHTML = `<div class="empty-state">
            <i class="fas fa-check-circle" style="color: var(--success); opacity: 0.6;"></i>
            <div class="empty-state-title">No slow requests</div>
            <p>Tất cả requests đều nhanh</p>
        </div>`;
        return;
    }

    el.innerHTML = slow.map(r => {
        const timeStr = new Date(r.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const statusClass = r.status >= 500 ? 'danger' : r.status >= 400 ? 'warning' : 'success';
        return `
        <div class="monitor-slow-row">
          <span class="monitor-route-method method-${r.method}">${r.method}</span>
          <span class="badge ${statusClass}" style="flex-shrink:0;">${r.status}</span>
          <span class="monitor-slow-path">${r.path}</span>
          <span class="monitor-slow-ms">${r.ms}ms</span>
          <span class="monitor-slow-time">${timeStr}</span>
        </div>`;
    }).join('');
}

async function loadRecentUsers() {
    const container = document.getElementById('recent-users-container');
    if (!container) return;

    try {
        const res = await fetch(`${API_URL}/admin/users-stats?limit=8`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        const users = data.users || data.data || [];

        if (!users.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>Chưa có người dùng nào</p>
                </div>`;
            return;
        }

        container.innerHTML = users.map(u => {
            const name    = u.username || u.email || 'Unknown';
            const initials = name.slice(0, 2).toUpperCase();
            const date    = u.createdAt
                ? new Date(u.createdAt).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' })
                : '-';
            const role    = u.role === 'admin' ? 'Admin' : 'User';
            const isAdmin = u.role === 'admin';
            return `
                <div class="recent-user-item">
                    <div class="recent-user-avatar" style="${isAdmin ? 'background: linear-gradient(135deg,#E11D48,#F97316)' : ''}">
                        ${initials}
                    </div>
                    <div class="recent-user-info">
                        <div class="recent-user-name">${name}</div>
                        <div class="recent-user-date">${date}</div>
                    </div>
                    <span class="recent-user-badge ${isAdmin ? 'badge danger' : ''}">${role}</span>
                </div>`;
        }).join('');
    } catch (err) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Không thể tải dữ liệu</p>
            </div>`;
    }
}

async function loadReportStats() {
    try {
        const res = await fetch(`${API_URL}/reports/stats`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (!data.success) return;
        const s = data.data;
        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '–'; };
        setText('rpt-pending',  s.pending);
        setText('rpt-reviewed', s.reviewed);
        setText('rpt-resolved', s.resolved);
        setText('rpt-total',    s.total);

        const badge = document.getElementById('sidebar-report-badge');
        if (badge) {
            if (s.pending > 0) {
                badge.textContent = s.pending > 99 ? '99+' : s.pending;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (_) {}
}

async function loadReports(page = 1) {
    reportsPage = page;
    const tbody = document.getElementById('reports-table-body');
    const statusFilter = document.getElementById('rpt-filter-status')?.value || '';
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>`;

    try {
        const params = new URLSearchParams({ page, limit: reportsLimit });
        if (statusFilter) params.set('status', statusFilter);
        const res  = await fetch(`${API_URL}/reports?${params}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        const reports = data.data;
        if (!reports.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-secondary);">Không có báo cáo nào</td></tr>`;
            document.getElementById('reports-pagination').innerHTML = '';
            return;
        }

        const STATUS_LABELS = {
            pending:   ['Chờ xử lý',    'pending'],
            reviewed:  ['Đã xem',        'reviewed'],
            resolved:  ['Đã giải quyết', 'resolved'],
            dismissed: ['Bỏ qua',        'dismissed'],
        };

        tbody.innerHTML = reports.map(r => {
            const [label, cls] = STATUS_LABELS[r.status] || [r.status, ''];
            const date = new Date(r.createdAt).toLocaleString('vi-VN', {
                day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
            });
            const imgHtml = r.imageUrl
                ? `<img class="rpt-image-thumb" src="${r.imageUrl}" alt="ảnh" data-lightbox="${r.imageUrl}" style="cursor:zoom-in;" />`
                : '<span style="color:var(--text-secondary);font-size:12px;">–</span>';
            const shortContent = r.content.length > 120 ? r.content.slice(0, 120) + '…' : r.content;
            return `<tr data-report-id="${r._id}">
                <td><span style="font-weight:600;">${r.username}</span></td>
                <td title="${r.content.replace(/"/g, '&quot;')}" style="max-width:280px;white-space:normal;word-break:break-word;font-size:13px;">${shortContent}</td>
                <td>${imgHtml}</td>
                <td><span class="rpt-badge ${cls}">${label}</span></td>
                <td style="font-size:12px;color:var(--text-secondary);">${date}</td>
                <td>
                    <select class="filter-select rpt-status-select" data-id="${r._id}" style="width:auto;font-size:11px;padding:3px 6px;">
                        <option value="pending"   ${r.status==='pending'   ? 'selected':''}>Chờ xử lý</option>
                        <option value="reviewed"  ${r.status==='reviewed'  ? 'selected':''}>Đã xem</option>
                        <option value="resolved"  ${r.status==='resolved'  ? 'selected':''}>Giải quyết</option>
                        <option value="dismissed" ${r.status==='dismissed' ? 'selected':''}>Bỏ qua</option>
                    </select>
                    <button class="btn btn-danger btn-sm rpt-delete-btn" data-id="${r._id}" style="margin-top:4px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('[data-lightbox]').forEach(img => {
            img.addEventListener('click', () => openRptLightbox(img.dataset.lightbox));
        });
        tbody.querySelectorAll('.rpt-status-select').forEach(sel => {
            sel.addEventListener('change', () => updateReportStatus(sel.dataset.id, sel.value));
        });
        tbody.querySelectorAll('.rpt-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteReport(btn.dataset.id));
        });

        const { total, pages } = data.pagination;
        renderReportsPagination(page, pages, total);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--danger);">❌ ${err.message}</td></tr>`;
    }
}

function renderReportsPagination(current, total, count) {
    const pag = document.getElementById('reports-pagination');
    if (!pag) return;
    if (total <= 1) { pag.innerHTML = ''; return; }
    pag.innerHTML = `<span class="filter-results-text"><strong>${count}</strong> báo cáo</span><div style="display:flex;gap:4px;"></div>`;
    const btnWrap = pag.querySelector('div');
    for (let i = 1; i <= total; i++) {
        const btn = document.createElement('button');
        btn.className = `btn btn-ghost btn-sm${i === current ? ' btn-primary' : ''}`;
        btn.textContent = i;
        btn.addEventListener('click', () => loadReports(i));
        btnWrap.appendChild(btn);
    }
}

async function updateReportStatus(id, status) {
    try {
        await fetch(`${API_URL}/reports/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify({ status }),
        });
        await loadReportStats();
    } catch (_) {}
}

async function deleteReport(id) {
    if (!confirm('Xóa báo cáo này?')) return;
    try {
        await fetch(`${API_URL}/reports/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        loadReports(reportsPage);
        loadReportStats();
    } catch (_) {}
}

function openRptLightbox(src) {
    document.getElementById('rpt-lightbox')?.remove();

    const lb = document.createElement('div');
    lb.id = 'rpt-lightbox';
    lb.innerHTML = `<img src="${src}" alt="Report image" />`;
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
}

async function loadGrowthChart(days = 30) {
    const wrap  = document.getElementById('growth-chart-inner');
    const empty = document.getElementById('growth-chart-empty');
    const bars  = document.getElementById('growth-chart-bars');
    if (!wrap || !bars) return;

    if (empty) { empty.style.display = 'flex'; wrap.style.display = 'none'; }

    try {
        const res  = await fetch(`${API_URL}/admin/stats/growth?days=${days}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (!data.success || !data.data?.length) throw new Error('no data');

        const pts  = data.data;
        const max  = Math.max(...pts.map(p => p.count), 1);
        const total = pts.reduce((s, p) => s + p.count, 0);

        bars.innerHTML = pts.map(p => {
            const pct = Math.round((p.count / max) * 100);
            const label = new Date(p.date).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' });
            return `<div class="growth-bar-wrap" title="${label}: ${p.count} người dùng">
                <div class="growth-tooltip">${label}: <strong>${p.count}</strong></div>
                <div class="growth-bar" style="height:${Math.max(pct, p.count>0?4:1)}px;"></div>
            </div>`;
        }).join('');

        const first = new Date(pts[0].date).toLocaleDateString('vi-VN', {day:'2-digit',month:'2-digit'});
        const last  = new Date(pts[pts.length-1].date).toLocaleDateString('vi-VN', {day:'2-digit',month:'2-digit'});
        document.getElementById('growth-label-start') && (document.getElementById('growth-label-start').textContent = first);
        document.getElementById('growth-label-end')   && (document.getElementById('growth-label-end').textContent   = last);
        document.getElementById('growth-label-total') && (document.getElementById('growth-label-total').textContent = `+${total} tài khoản mới`);

        if (empty) empty.style.display = 'none';
        wrap.style.display = 'block';
    } catch (err) {
        if (empty) {
            empty.innerHTML = '<i class="fas fa-chart-bar" style="opacity:0.3;"></i><p>Chưa có dữ liệu</p>';
            empty.style.display = 'flex';
        }
    }
}

function closeWordModal() {
    const modal = document.getElementById("add-word-modal");
    if (!modal) return;
    modal.style.display = "none";
    document.getElementById("add-word-form")?.reset();
    delete modal.dataset.editMode;
    delete modal.dataset.originalEn;
    modal.querySelector("h3").innerHTML = '➕ Add New Word';
    modal.querySelector('button[type="submit"]').textContent = 'Add Word';
    document.getElementById("word-json-input").value = '';
    document.getElementById("word-json-result").style.display = 'none';
    switchWordModalTab('manual');
}

function switchWordModalTab(tab) {
    const manualForm = document.getElementById("add-word-form");
    const jsonPanel  = document.getElementById("word-json-panel");
    const tabManual  = document.getElementById("tab-manual");
    const tabJson    = document.getElementById("tab-json");

    const activeStyle   = { background: 'var(--primary)', color: '#fff' };
    const inactiveStyle = { background: '#f5f5f5', color: '#666' };

    if (tab === 'json') {
        manualForm.style.display = 'none';
        jsonPanel.style.display  = 'block';
        Object.assign(tabJson.style,   activeStyle);
        Object.assign(tabManual.style, inactiveStyle);
    } else {
        manualForm.style.display = 'block';
        jsonPanel.style.display  = 'none';
        Object.assign(tabManual.style, activeStyle);
        Object.assign(tabJson.style,   inactiveStyle);
    }

    // Update keys hint + placeholder theo lang hiện tại
    const lang = typeof vocabCurrentLang !== 'undefined' ? vocabCurrentLang : 'en';
    const hint = document.getElementById('json-keys-hint');
    const ta   = document.getElementById('word-json-input');
    if (lang === 'zh') {
        if (hint) hint.textContent = 'zh, vn, phonetic, part, type, level, synonyms, image, example, source';
        if (ta && !ta.value) ta.placeholder = `[
  {
    "zh": "汉字",
    "vn": "nghĩa tiếng việt",
    "phonetic": "pīnyīn",
    "part": "HSK1",
    "type": "名词",
    "level": "A1",
    "synonyms": "同义词1, 同义词2",
    "image": "images/pages/hsk1/tu.jpg",
    "example": "Câu ví dụ bằng tiếng Trung.",
    "source": "hsk1"
  }
]`;
    } else {
        if (hint) hint.textContent = 'en, vn, phonetic, part, type, level, synonyms, image, example, source';
        if (ta && !ta.value) ta.placeholder = `[
  {
    "en": "arrange",
    "vn": "sắp xếp",
    "phonetic": "/əˈreɪndʒ/",
    "part": "ETS24T01-LC",
    "type": "verb",
    "image": "images/pages/ETS24T01-LC/arrange.jpg",
    "level": "B1",
    "synonyms": "organize, set up",
    "example": "Please arrange the chairs.",
    "source": "ets2024"
  }
]`;
    }
}

async function submitJsonImport() {
    const raw = document.getElementById("word-json-input").value.trim();
    const resultDiv = document.getElementById("word-json-result");

    if (!raw) { showToast('Vui lòng nhập JSON', 'error'); return; }

    let words;
    try {
        const parsed = JSON.parse(raw);
        words = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
        showToast('JSON không hợp lệ: ' + e.message, 'error');
        return;
    }

    if (words.length === 0) { showToast('Không có từ nào trong JSON', 'error'); return; }

    const btn = document.getElementById("btn-submit-json");
    btn.disabled = true;
    btn.textContent = 'Đang import...';
    resultDiv.style.display = 'none';

    let inserted = 0, updated = 0, errors = [];

    try {
        const res = await fetch(withVocabLang(`${API_URL}/vocabulary/upsert`), {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${getToken()}` 
            },
            body: JSON.stringify(words),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Server error');
        inserted = data.inserted || 0;
        updated  = data.updated  || 0;
        errors   = (data.errors  || []).map(e => `"${e.en}": ${e.message}`);
    } catch (e) {
        showToast('Lỗi import: ' + e.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Import JSON';
        return;
    }

    btn.disabled = false;
    btn.textContent = 'Import JSON';

    const total = words.length;
    const ok = inserted + updated;
    resultDiv.style.display = 'block';
    resultDiv.style.background = errors.length === total ? '#fef2f2' : ok === total ? '#f0fdf4' : '#fffbeb';
    resultDiv.style.border = `1px solid ${errors.length === total ? '#fca5a5' : ok === total ? '#86efac' : '#fcd34d'}`;
    // Background is always light → pin dark text so the summary line stays
    // readable in dark mode (it inherits near-white text otherwise → invisible).
    resultDiv.style.color = '#1f2937';
    resultDiv.innerHTML = `
        <b>${total} từ</b> — ✅ ${inserted} thêm mới · 🔄 ${updated} cập nhật · ❌ ${errors.length} lỗi
        ${errors.length ? '<ul style="margin:8px 0 0;padding-left:18px;color:#dc2626">' + errors.map(e => `<li>${e}</li>`).join('') + '</ul>' : ''}
    `;

    if (ok > 0) {
        await loadLocalVocabulary(currentLocalFile);
        displayLocalVocabulary();
        updateLocalPartFilter();
        document.getElementById("word-json-input").value = '';
    }
}

function initApiReference() { /* stub */ }
