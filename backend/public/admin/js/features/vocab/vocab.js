// modules/vocab.js — Vocabulary management functions

// ===================================
// 4. VOCABULARY MANAGEMENT FUNCTIONS (UPDATED)
// ===================================

function vocabLangQuery(prefix = '?') {
    return `${prefix}lang=${encodeURIComponent(vocabCurrentLang || 'en')}`;
}

function withVocabLang(url) {
    return `${url}${url.includes('?') ? '&' : '?'}lang=${encodeURIComponent(vocabCurrentLang || 'en')}`;
}

/**
 * [PHẦN LỌC DỮ LIỆU]
 * Tải danh sách từ vựng từ API, có hỗ trợ phân trang và lọc Part.
 */
async function loadVocabulary(page = vocabCurrentPage, part = vocabCurrentPart, source = vocabCurrentSource, type = vocabCurrentType) {
    const tbody = document.querySelector("#vocabulary-table tbody");
    const paginationControls = document.getElementById('vocabulary-pagination-controls');

    vocabCurrentPage = page;
    vocabCurrentPart = part;
    vocabCurrentSource = source;
    vocabCurrentType = type;

    tbody.innerHTML = `<tr><td colspan="7" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải từ vựng...</td></tr>`;
    if (paginationControls) paginationControls.innerHTML = '';

    try {
        const url = `${API_URL}/vocabulary?limit=${vocabCurrentLimit}&page=${page}&part=${part || ''}&source=${source || ''}&type=${encodeURIComponent(type || '')}&search=${encodeURIComponent(vocabSearchTerm)}&lang=${vocabCurrentLang}`;
        const res = await fetch(url); // <-- API call to filter
        const data = await res.json();

        if (data.success) {
            window._lastVocabData = data.data;
            displayVocabulary(data.data);
            updateLocalPartFilter(data.data);
            if (paginationControls) {
                renderVocabularyPagination(data.page, data.limit, data.total, data.count);
            }
        } else {
            const dangerColor = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim();
            tbody.innerHTML = `<tr><td colspan="7" class="loading" style="color: ${dangerColor}">Lỗi tải dữ liệu: ${data.message}</td></tr>`;
        }
    } catch (err) {
        console.error("Lỗi tải từ vựng:", err);
        const dangerColor = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim();
        tbody.innerHTML = `<tr><td colspan="7" class="loading" style="color: ${dangerColor}">Không thể kết nối đến API từ vựng.</td></tr>`;
    }
}

/**
 * Hiển thị danh sách từ vựng lên bảng
 */
function displayVocabulary(words) {
    const tbody = document.querySelector("#vocabulary-table tbody");
    tbody.innerHTML = '';

    // Reset select-all checkbox
    const selectAll = document.getElementById('vocab-select-all');
    if (selectAll) selectAll.checked = false;
    updateVocabBulkToolbar();

    if (words.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #999; padding: 40px;">Không có từ vựng nào được tìm thấy.</td></tr>`;
        return;
    }

    const visibleWords = words.filter((word) => (word.en || word.zh));

    if (visibleWords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #999; padding: 40px;">Không có từ vựng hợp lệ nào được tìm thấy.</td></tr>`;
        return;
    }

    tbody.innerHTML = visibleWords
        .map((word) => {
            const primaryWord = word.en || word.zh || '';
            const wordSafe = primaryWord.replace(/"/g, '&quot;');
            const vn = word.vn || '';
            const type = word.type || '';
            const part = word.part || '';
            const sources = Array.isArray(word.sources) && word.sources.length
                ? word.sources.map(s => `<span class="badge" style="background:#1e3a5f;color:#60a5fa;font-size:10px;">${s}</span>`).join(' ')
                : (word.source ? `<span class="badge" style="background:#1e3a5f;color:#60a5fa;font-size:10px;">${word.source}</span>` : '<span style="color:#666;font-size:11px;">—</span>');
            return `
        <tr>
            <td style="text-align:center;"><input type="checkbox" class="vocab-row-cb" data-word-en="${wordSafe}"></td>
            <td><strong>${primaryWord}</strong> <span style="color:#888;font-size:12px;">${word.phonetic || ''}</span></td>
            <td>${vn}</td>
            <td><span class="badge info">${type}</span></td>
            <td><span class="badge warning">${part}</span></td>
            <td style="white-space:nowrap;">${sources}</td>
            <td>
                <button class="btn btn-primary btn-sm btn-edit-word"
                    data-word='${JSON.stringify(word).replace(/'/g, "&#39;")}'>
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger btn-sm btn-delete-word"
                    data-word-en="${wordSafe}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`;
        })
        .join("");

    attachEditWordListeners();
    attachDeleteWordListeners();
    attachVocabCheckboxListeners();
}

/**
 * Khởi tạo dropdown lọc Part bằng danh sách Part đã quét (fetch) được.
 */
async function initializeVocabFilters() {
    const filterSelect = document.getElementById('vocab-part-filter');

    if (!filterSelect) return;

    // 1. Fetch parts dynamically (Quét Part)
    const uniqueParts = await fetchUniqueVocabParts();

    // 2. Clear and set default option
    filterSelect.innerHTML = '<option value="">-- Tất cả Part --</option>';

    // 3. Populate Options
    if (uniqueParts.length > 0) {
        uniqueParts.forEach(part => {
            const option = document.createElement('option');
            option.value = part;
            option.textContent = part; // Giá trị hiển thị là tên Part (vd: E2XA-P1)
            filterSelect.appendChild(option);
        });
    }

    // Giữ nguyên giá trị đang được chọn sau khi tải lại Options
    filterSelect.value = vocabCurrentPart;

    // 4. Re-attach Event Listener
    filterSelect.removeEventListener('change', handleVocabFilterChange);
    filterSelect.addEventListener('change', handleVocabFilterChange);
}


/**
 * Render thông tin số lượng từ vựng (giống TOEIC Questions tab)
 */
function renderVocabularyPagination(_currentPage, _limit, total, filteredCount) {
    const container = document.getElementById('vocabulary-pagination-controls');
    const clearBtn = document.getElementById('clear-vocab-filters');
    if (!container) return;

    const displayCount = filteredCount !== undefined ? filteredCount : total;
    const totalPages = Math.ceil(total / vocabCurrentLimit);
    const hasFilter = vocabCurrentPart || vocabSearchTerm || vocabCurrentSource || vocabCurrentType;

    // Nút "Xóa lọc" hiện thường trực (giống tab Câu hỏi TOEIC) — trước đây chỉ
    // hiện khi ĐANG lọc nên lúc cần tìm nó thì không thấy đâu. Mờ đi khi không
    // có gì để xoá, vẫn bấm được mà không gây hiểu nhầm là hỏng.
    if (clearBtn) {
        clearBtn.style.display = 'inline-block';
        clearBtn.style.opacity = hasFilter ? '1' : '0.5';
    }

    if (total === 0) {
        container.innerHTML = `<span style="color:#999;">Không có từ vựng nào.</span>`;
        return;
    }

    const from = (_currentPage - 1) * vocabCurrentLimit + 1;
    const to = Math.min(_currentPage * vocabCurrentLimit, total);

    if (totalPages <= 1) {
        container.innerHTML = `<span style="color:#94a3b8;font-size:13px;">${from}–${to} / <strong style="color:#e2e8f0;">${total}</strong> từ</span>`;
        return;
    }

    const maxBtns = 5;
    let startPage = Math.max(1, _currentPage - Math.floor(maxBtns / 2));
    let endPage = Math.min(totalPages, startPage + maxBtns - 1);
    if (endPage - startPage < maxBtns - 1) startPage = Math.max(1, endPage - maxBtns + 1);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:4px;flex-wrap:wrap;';

    const info = document.createElement('span');
    info.style.cssText = 'color:#94a3b8;font-size:13px;margin-right:6px;';
    info.innerHTML = `${from}–${to} / <strong style="color:#e2e8f0;">${total}</strong> từ`;
    wrap.appendChild(info);

    function makeBtn(label, page, disabled, active) {
        const btn = document.createElement('button');
        btn.innerHTML = label;
        btn.style.cssText = `padding:4px ${active ? '10' : '8'}px;border-radius:6px;border:1px solid ${active ? '#3b82f6' : '#334155'};background:${active ? '#3b82f6' : '#1e293b'};color:${active ? '#fff' : '#94a3b8'};cursor:pointer;font-size:12px;font-weight:${active ? '600' : '400'};${disabled ? 'opacity:.4;pointer-events:none;' : ''}`;
        if (!disabled) btn.addEventListener('click', () => loadVocabulary(page, vocabCurrentPart, vocabCurrentSource, vocabCurrentType));
        return btn;
    }

    wrap.appendChild(makeBtn('&laquo;', _currentPage - 1, _currentPage <= 1, false));
    for (let p = startPage; p <= endPage; p++) {
        wrap.appendChild(makeBtn(p, p, false, p === _currentPage));
    }
    wrap.appendChild(makeBtn('&raquo;', _currentPage + 1, _currentPage >= totalPages, false));

    container.innerHTML = '';
    container.appendChild(wrap);
}

/**
 * Xóa tất cả bộ lọc từ vựng
 */
function clearVocabFilters() {
    vocabCurrentPart = '';
    vocabCurrentSource = '';
    vocabCurrentType = '';
    vocabSearchTerm = '';

    const partFilter = document.getElementById('vocab-part-filter');
    const searchInput = document.getElementById('vocab-search');
    const pickerLabel = document.getElementById('vocab-file-picker-label');
    const sourceSelect = document.getElementById('vocab-filter-source');
    const typeSelect = document.getElementById('vocab-filter-type');

    if (partFilter) partFilter.value = '';
    if (searchInput) searchInput.value = '';
    if (pickerLabel) pickerLabel.textContent = 'Tất cả';
    if (sourceSelect) sourceSelect.value = '';
    if (typeSelect) typeSelect.value = '';

    // Bộ lọc Part là nhãn + pill (không phải select), trước đây không được dọn:
    // dữ liệu về hết nhưng nút vẫn ghi "Part 3" và pill vẫn sáng → tưởng chưa xoá.
    const partLabel = document.getElementById('part-filter-label');
    if (partLabel) partLabel.textContent = 'Tất cả Part';
    document.querySelectorAll('#part-filter-pills .part-pill')
        .forEach(b => b.classList.remove('part-pill--active'));
    const partDropdown = document.getElementById('part-filter-dropdown');
    if (partDropdown) partDropdown.style.display = 'none';

    // Reset active card
    document.querySelectorAll('.vocab-picker-card').forEach(c => c.classList.remove('active'));
    const allCard = document.querySelector('.vocab-picker-card[data-source=""]');
    if (allCard) allCard.classList.add('active');

    loadVocabulary(1, '', '', '');
}
// Expose to window for HTML onclick
window.clearVocabFilters = clearVocabFilters;

/**
 * Khởi tạo bộ lọc Source (fetch từ API) và Type (tĩnh) cho vocab tab.
 */
async function initVocabExtraFilters() {
    const sourceSelect = document.getElementById('vocab-filter-source');
    const typeSelect = document.getElementById('vocab-filter-type');

    // Populate source options from API
    if (sourceSelect && !sourceSelect.dataset.loaded) {
        try {
            const res = await fetch(`${API_URL}/vocabulary/sources${vocabLangQuery()}`);
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
                data.data.forEach(({ source, count }) => {
                    if (!source || source === 'unknown') return;
                    const opt = document.createElement('option');
                    opt.value = source;
                    opt.textContent = `${source} (${count})`;
                    sourceSelect.appendChild(opt);
                });
            }
        } catch (e) {
            console.warn('Could not load vocab sources:', e);
        }
        sourceSelect.dataset.loaded = '1';
    }

    // Wire up source select
    if (sourceSelect && !sourceSelect.dataset.bound) {
        sourceSelect.addEventListener('change', () => {
            vocabCurrentSource = sourceSelect.value;
            loadVocabulary(1, vocabCurrentPart, vocabCurrentSource, vocabCurrentType);
        });
        sourceSelect.dataset.bound = '1';
    }

    // Wire up type select
    if (typeSelect && !typeSelect.dataset.bound) {
        typeSelect.addEventListener('change', () => {
            vocabCurrentType = typeSelect.value;
            loadVocabulary(1, vocabCurrentPart, vocabCurrentSource, vocabCurrentType);
        });
        typeSelect.dataset.bound = '1';
    }

    // Wire up ô tìm kiếm (chế độ online/DB) — gọi lại API với từ khoá.
    const searchInput = document.getElementById('vocab-search');
    if (searchInput && !searchInput.dataset.boundOnline) {
        const run = debounce(() => {
            vocabSearchTerm = searchInput.value.trim();
            loadVocabulary(1, vocabCurrentPart, vocabCurrentSource, vocabCurrentType);
        }, 350);
        searchInput.addEventListener('input', run);
        searchInput.dataset.boundOnline = '1';
    }
}


/* =========================================================
    OLD WORD EDIT LOGIC
========================================================= */

function attachEditWordListeners() {
    document.querySelectorAll(".btn-edit-word").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            const wordData = JSON.parse(e.target.closest("button").dataset.word.replace(/&apos;/g, "'"));
            openEditWordModal(wordData);
        });
    });
}

function attachDeleteWordListeners() {
    document.querySelectorAll(".btn-delete-word").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            const button = e.target.closest("button");
            const wordEn = button.dataset.wordEn;
            const row = button.closest("tr"); // Lấy dòng chứa nút xóa

            if (!confirm(`Bạn có chắc chắn muốn XÓA từ vựng "${wordEn}"?`)) return;

            try {
                const res = await fetch(withVocabLang(`${API_URL}/vocabulary/${encodeURIComponent(wordEn)}`), {
                    method: "DELETE",
                });

                const data = await res.json();

                if (data.success) {
                    // ✅ Xóa dòng khỏi DOM thay vì reload toàn bộ bảng
                    if (row) {
                        row.style.transition = 'opacity 0.3s, transform 0.3s';
                        row.style.opacity = '0';
                        row.style.transform = 'translateX(-20px)';

                        setTimeout(() => {
                            row.remove();

                            // Cập nhật số lượng hiển thị
                            updateVocabCountAfterDelete();
                        }, 300);
                    }

                    // Reload stats và activities ở background (không ảnh hưởng scroll)
                    loadVocabularyStats();
                    loadRecentActivities();

                    // Thông báo nhẹ nhàng hơn (không dùng alert)
                    showToast(`✅ Đã xóa "${wordEn}"`, 'success');
                } else {
                    alert("❌ Lỗi: " + (data.message || "Không thể xóa từ vựng."));
                }
            } catch (error) {
                console.error("Error deleting word:", error);
                alert("❌ Lỗi kết nối: Không thể xóa từ vựng.");
            }
        });
    });
}

/**
 * Cập nhật số lượng từ vựng sau khi xóa (không reload)
 */
function updateVocabCountAfterDelete() {
    const container = document.getElementById('vocabulary-pagination-controls');
    if (!container) return;

    // Đếm số dòng còn lại trong bảng
    const tbody = document.querySelector("#vocabulary-table tbody");
    const rowCount = tbody ? tbody.querySelectorAll('tr').length : 0;

    // Cập nhật hiển thị
    const hasFilter = vocabCurrentPart || vocabSearchTerm || vocabCurrentSource || vocabCurrentType;
    if (hasFilter) {
        container.innerHTML = `<i class="fas fa-info-circle"></i> Hiển thị <strong>${rowCount}</strong> từ vựng`;
    } else {
        container.innerHTML = `<i class="fas fa-list"></i> Tổng cộng: <strong>${rowCount}</strong> từ vựng`;
    }
}

/**
 * Xóa từ vựng theo từ tiếng Anh
 */
async function deleteWord(wordEn) {
    try {
        const res = await fetch(withVocabLang(`${API_URL}/vocabulary/${encodeURIComponent(wordEn)}`), {
            method: "DELETE",
        });

        const data = await res.json();

        if (data.success) {
            // Xóa khỏi local data
            localVocabularyData = localVocabularyData.filter(w => w.en !== wordEn);

            // Refresh display
            displayLocalVocabulary();

            showToast(`✅ Đã xóa "${wordEn}"`, 'success');
        } else {
            alert("❌ Lỗi: " + (data.message || "Không thể xóa từ vựng."));
        }
    } catch (error) {
        console.error("Error deleting word:", error);
        alert("❌ Lỗi kết nối: Không thể xóa từ vựng.");
    }
}

// ===================================
// DUPLICATE VOCABULARY MANAGEMENT
// ===================================

/**
 * Tìm các từ vựng trùng lặp (cùng en + vn + part)
 */
function findDuplicateVocabulary() {
    if (!localVocabularyData || localVocabularyData.length === 0) {
        alert('⚠️ Chưa có dữ liệu từ vựng. Vui lòng chọn file JSON trước.');
        return [];
    }

    const seen = new Map();
    const duplicates = [];

    localVocabularyData.forEach((word, index) => {
        // Tạo key từ en + vn + part
        const key = `${(word.en || '').toLowerCase().trim()}|${(word.vn || '').toLowerCase().trim()}|${(word.part || '').toLowerCase().trim()}`;

        if (seen.has(key)) {
            // Đã thấy từ này trước đó -> trùng lặp
            const original = seen.get(key);
            duplicates.push({
                key,
                original: original,
                duplicate: { ...word, _index: index }
            });
        } else {
            seen.set(key, { ...word, _index: index });
        }
    });

    console.log(`🔍 Found ${duplicates.length} duplicate entries`);
    return duplicates;
}

/**
 * Quét từ vựng trùng lặp TRÊN DATABASE.
 * Tiêu chí trùng = key (source + part + en), không phải dữ liệu local.
 * Tôn trọng bộ lọc source/part đang chọn (hoặc điều kiện nhập tay).
 */
function openScanDuplicatesDialog() {
    const existing = document.getElementById('scan-dup-dialog');
    if (existing) existing.remove();

    const pk = (vocabCurrentLang || 'en') === 'zh' ? 'zh' : 'en';
    const FIELDS = [
        { value: 'source', label: 'Nguồn (source)' },
        { value: 'part',   label: 'Part' },
        { value: 'type',   label: 'Loại từ (type)' },
        { value: 'level',  label: 'Cấp độ (level)' },
    ];
    const INPUT_STYLE = 'width:100%;padding:8px 10px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:14px;box-sizing:border-box;';
    const SEL_STYLE   = `${INPUT_STYLE}cursor:pointer;`;
    const fieldOptions = FIELDS.map(f => `<option value="${f.value}">${f.label}</option>`).join('');

    function makeRow(idx, defField = '', defVal = '') {
        return `
        <div class="sd-row" style="display:grid;grid-template-columns:1fr 1.5fr;gap:10px;margin-bottom:10px;">
            <select class="sd-field" data-idx="${idx}" style="${SEL_STYLE}">
                <option value="">-- Trường --</option>
                ${FIELDS.map(f => `<option value="${f.value}"${f.value===defField?' selected':''}>${f.label}</option>`).join('')}
            </select>
            <input class="sd-value" data-idx="${idx}" type="text" placeholder="Giá trị..." value="${defVal}" style="${INPUT_STYLE}">
        </div>`;
    }

    const modal = document.createElement('div');
    modal.id = 'scan-dup-dialog';
    modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;">
            <div style="background:#1e1e2e;border-radius:12px;max-width:520px;width:95%;padding:28px;box-shadow:0 10px 40px rgba(0,0,0,0.5);">
                <h3 style="margin:0 0 6px;color:#fff;"><i class="fas fa-search"></i> Quét từ trùng lặp</h3>
                <p style="color:#94a3b8;font-size:13px;margin:0 0 4px;">Tìm các từ trùng theo key <strong style="color:#60a5fa">source + part + ${pk}</strong>. Thỏa <strong>tất cả</strong> điều kiện (AND). Dòng trống bị bỏ qua.</p>
                <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:10px;margin-bottom:6px;padding:4px 0;">
                    <span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Trường</span>
                    <span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Giá trị</span>
                </div>
                <div id="sd-rows">
                    ${makeRow(0, 'source', vocabCurrentSource || '')}
                    ${makeRow(1, 'part',   vocabCurrentPart   || '')}
                    ${makeRow(2)}${makeRow(3)}
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px;">
                    <button id="sd-cancel" style="padding:9px 18px;background:#334155;color:#e2e8f0;border:none;border-radius:6px;cursor:pointer;">Hủy</button>
                    <button id="sd-ok" style="padding:9px 18px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">
                        <i class="fas fa-search"></i> Quét ngay
                    </button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const overlay = modal.querySelector('div');
    document.getElementById('sd-cancel').addEventListener('click', () => modal.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) modal.remove(); });

    document.getElementById('sd-ok').addEventListener('click', () => {
        const filters = {};
        modal.querySelectorAll('.sd-row').forEach(row => {
            const field = row.querySelector('.sd-field').value;
            const val   = row.querySelector('.sd-value').value.trim();
            if (field && val) filters[field] = val;
        });
        modal.remove();
        // Nếu không nhập gì → fallback về filter đang active trên bảng
        const src  = 'source' in filters ? filters.source : (vocabCurrentSource || '');
        const part = 'part'   in filters ? filters.part   : (vocabCurrentPart   || '');
        scanDuplicates(src, part, filters);
    });
}

async function scanDuplicates(filterSource, filterPart, extraFilters) {
    const src  = filterSource !== undefined ? filterSource : (vocabCurrentSource || '');
    const part = filterPart  !== undefined ? filterPart  : (vocabCurrentPart  || '');

    const btn = document.getElementById('btn-scan-duplicates');
    const original = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang quét...';
    }
    try {
        const params = new URLSearchParams();
        if (src)  params.set('source', src);
        if (part) params.set('part', part);
        if (extraFilters) {
            Object.entries(extraFilters).forEach(([k, v]) => {
                if (k !== 'source' && k !== 'part' && v) params.set(k, v);
            });
        }

        params.set('lang', vocabCurrentLang || 'en');
        const res = await fetch(`${API_URL}/vocabulary/duplicates?${params.toString()}`);
        const data = await res.json();

        if (!data.success) {
            alert(`❌ Lỗi quét trùng: ${data.message || 'không xác định'}`);
            return;
        }

        const groups = data.data || [];
        if (groups.length === 0) {
            const scope = src || part
                ? `(lọc: ${[src, part].filter(Boolean).join(' / ')})`
                : '(toàn bộ database)';
            const pk = (vocabCurrentLang||'en') === 'zh' ? 'zh' : 'en';
            alert(`✅ Không tìm thấy từ trùng lặp ${scope} theo key source + part + ${pk}!`);
            return;
        }

        showDbDuplicateModal(groups, data, src, part);
    } catch (error) {
        console.error('Error scanning duplicates:', error);
        alert(`❌ Lỗi kết nối server khi quét trùng: ${error.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    }
}

/**
 * Modal hiển thị các nhóm trùng lặp lấy từ database.
 * @param {Array} groups - [{ en, part, source, count, docs:[{_id,en,vn,part,source}] }]
 * @param {object} summary - { duplicateGroups, totalDuplicates }
 */
function showDbDuplicateModal(groups, summary, filterSrc, filterPart) {
    const existingModal = document.getElementById('duplicate-modal');
    if (existingModal) existingModal.remove();

    const src  = filterSrc  || vocabCurrentSource || '';
    const part = filterPart || vocabCurrentPart   || '';
    const scopeLabel = src || part
        ? [src, part].filter(Boolean).join(' / ')
        : 'Toàn bộ database';
    const removeScope = src || 'all';

    const rows = groups.map((g, i) => `
        <tr style="border-bottom: 1px solid #333;">
            <td style="padding: 10px; color: #888;">${i + 1}</td>
            <td style="padding: 10px; color: #fff;"><strong>${g.en || '-'}</strong></td>
            <td style="padding: 10px; color: #ccc;">${(g.docs[0] && g.docs[0].vn) || '-'}</td>
            <td style="padding: 10px;"><span style="background: #f39c12; color: #000; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${g.part || '-'}</span></td>
            <td style="padding: 10px;"><span style="background: #1e3a5f; color: #60a5fa; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${g.source || '-'}</span></td>
            <td style="padding: 10px; color: #e74c3c; font-weight: bold;">${g.count} bản (thừa ${g.count - 1})</td>
        </tr>
    `).join('');

    const modal = document.createElement('div');
    modal.id = 'duplicate-modal';
    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center;">
            <div style="background: #1e1e2e; border-radius: 12px; max-width: 950px; width: 95%; max-height: 80vh; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
                <div style="padding: 20px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: #fff;">
                        <i class="fas fa-copy"></i> Trùng lặp trên DB — ${scopeLabel}
                        <span style="display:block;font-size:12px;color:#888;font-weight:normal;margin-top:4px;">Key: source + part + en</span>
                    </h3>
                    <span style="background: #e74c3c; color: white; padding: 5px 15px; border-radius: 20px; font-weight: bold;">
                        ${summary.duplicateGroups} nhóm · ${summary.totalDuplicates} bản thừa
                    </span>
                </div>

                <div style="max-height: 50vh; overflow-y: auto; padding: 15px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <thead>
                            <tr style="background: #2d2d3d; color: #aaa;">
                                <th style="padding: 10px; text-align: left;">#</th>
                                <th style="padding: 10px; text-align: left;">English</th>
                                <th style="padding: 10px; text-align: left;">Vietnamese</th>
                                <th style="padding: 10px; text-align: left;">Part</th>
                                <th style="padding: 10px; text-align: left;">Source</th>
                                <th style="padding: 10px; text-align: left;">Số bản</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>

                <div style="padding: 20px; border-top: 1px solid #333; display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
                    <button id="btn-close-duplicate-modal" style="padding: 10px 20px; background: #666; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        <i class="fas fa-times"></i> Đóng
                    </button>
                    <button id="btn-delete-duplicates-db" style="padding: 10px 20px; background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
                        <i class="fas fa-trash"></i> Xóa ${summary.totalDuplicates} bản thừa (giữ 1/nhóm)
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('btn-close-duplicate-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal.firstElementChild) modal.remove();
    });

    document.getElementById('btn-delete-duplicates-db').addEventListener('click', async () => {
        if (!confirm(`Xóa ${summary.totalDuplicates} bản trùng thừa (mỗi nhóm giữ lại 1)?\n\nPhạm vi: ${scopeLabel}\n⚠️ Thao tác này XÓA VĨNH VIỄN trong database!`)) {
            return;
        }
        const delBtn = document.getElementById('btn-delete-duplicates-db');
        delBtn.disabled = true;
        delBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xóa...';
        try {
            const response = await fetch(withVocabLang(`/api/vocabulary/remove-duplicates/${encodeURIComponent(removeScope)}`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const result = await response.json();
            if (result.success) {
                showToast(`✅ Đã xóa ${result.removed} bản trùng (${result.duplicateGroups} nhóm)!`, 'success');
                modal.remove();
                await loadVocabulary();
            } else {
                showToast(`❌ Lỗi: ${result.message}`, 'error');
                delBtn.disabled = false;
                delBtn.innerHTML = `<i class="fas fa-trash"></i> Xóa ${summary.totalDuplicates} bản thừa (giữ 1/nhóm)`;
            }
        } catch (error) {
            console.error('Error removing duplicates:', error);
            showToast(`❌ Lỗi kết nối server: ${error.message}`, 'error');
            delBtn.disabled = false;
            delBtn.innerHTML = `<i class="fas fa-trash"></i> Xóa ${summary.totalDuplicates} bản thừa (giữ 1/nhóm)`;
        }
    });
}

/**
 * Hiển thị modal danh sách từ trùng lặp
 */
function showDuplicateModal(duplicates) {
    // Xóa modal cũ nếu có
    const existingModal = document.getElementById('duplicate-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'duplicate-modal';
    modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center;">
            <div style="background: #1e1e2e; border-radius: 12px; max-width: 900px; width: 95%; max-height: 80vh; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
                <div style="padding: 20px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: #fff;">
                        <i class="fas fa-copy"></i> Từ vựng trùng lặp trong ${currentLocalFile}
                    </h3>
                    <span style="background: #e74c3c; color: white; padding: 5px 15px; border-radius: 20px; font-weight: bold;">
                        ${duplicates.length} từ trùng
                    </span>
                </div>

                <div style="max-height: 50vh; overflow-y: auto; padding: 15px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <thead>
                            <tr style="background: #2d2d3d; color: #aaa;">
                                <th style="padding: 10px; text-align: left;">#</th>
                                <th style="padding: 10px; text-align: left;">English</th>
                                <th style="padding: 10px; text-align: left;">Vietnamese</th>
                                <th style="padding: 10px; text-align: left;">Part</th>
                                <th style="padding: 10px; text-align: left;">Trạng thái</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${duplicates.map((dup, i) => `
                                <tr style="border-bottom: 1px solid #333;">
                                    <td style="padding: 10px; color: #888;">${i + 1}</td>
                                    <td style="padding: 10px; color: #fff;"><strong>${dup.original.en || '-'}</strong></td>
                                    <td style="padding: 10px; color: #ccc;">${dup.original.vn || '-'}</td>
                                    <td style="padding: 10px;"><span style="background: #f39c12; color: #000; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${dup.original.part || '-'}</span></td>
                                    <td style="padding: 10px; color: #e74c3c;"><i class="fas fa-exclamation-triangle"></i> Trùng lặp</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div style="padding: 20px; border-top: 1px solid #333; display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
                    <button id="btn-close-duplicate-modal" style="padding: 10px 20px; background: #666; color: white; border: none; border-radius: 6px; cursor: pointer;">
                        <i class="fas fa-times"></i> Đóng
                    </button>
                    <button id="btn-delete-duplicates-local" style="padding: 10px 20px; background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
                        <i class="fas fa-trash"></i> Xóa vĩnh viễn ${duplicates.length} từ trùng
                    </button>
                    <button id="btn-export-clean-json" style="padding: 10px 20px; background: linear-gradient(135deg, #27ae60, #2ecc71); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
                        <i class="fas fa-download"></i> Xuất file đã làm sạch
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Event handlers
    document.getElementById('btn-close-duplicate-modal').addEventListener('click', () => modal.remove());

    // Xóa trùng lặp và lưu vào file JSON thực sự
    document.getElementById('btn-delete-duplicates-local').addEventListener('click', async () => {
        if (confirm(`Bạn có chắc muốn xóa ${duplicates.length} từ vựng trùng lặp?\n\n⚠️ Thao tác này sẽ XÓA VĨNH VIỄN các từ trùng lặp trong file "${currentLocalFile}"!`)) {
            try {
                // Gọi API để xóa duplicates trong file JSON thực sự
                const response = await fetch(withVocabLang(`/api/vocabulary/remove-duplicates/${encodeURIComponent(currentLocalFile)}`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                const result = await response.json();

                if (result.success) {
                    // Reload dữ liệu từ file đã được làm sạch
                    await loadLocalVocabulary(currentLocalFile);
                    modal.remove();
                    showToast(`✅ ${result.message}`, 'success');
                } else {
                    showToast(`❌ Lỗi: ${result.message}`, 'error');
                }
            } catch (error) {
                console.error('Error removing duplicates:', error);
                showToast(`❌ Lỗi kết nối server: ${error.message}`, 'error');
            }
        }
    });

    // Xuất file JSON đã làm sạch
    document.getElementById('btn-export-clean-json').addEventListener('click', () => {
        // Tạo bản sao và xóa trùng
        const cleanData = removeDuplicatesFromArray([...localVocabularyData]);

        // Xuất file
        const blob = new Blob([JSON.stringify(cleanData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentLocalFile.replace('.json', '')}-clean-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`✅ Đã xuất file! Từ ${localVocabularyData.length} → ${cleanData.length} từ (xóa ${duplicates.length} trùng)`, 'success');
    });

    // Click outside to close
    modal.querySelector('div').addEventListener('click', (e) => {
        if (e.target === modal.querySelector('div')) modal.remove();
    });
}

/**
 * Xóa trùng lặp từ một mảng (trả về mảng mới)
 */
function removeDuplicatesFromArray(arr) {
    const seen = new Map();
    const result = [];

    arr.forEach(word => {
        const key = `${(word.en || '').toLowerCase().trim()}|${(word.vn || '').toLowerCase().trim()}|${(word.part || '').toLowerCase().trim()}`;
        if (!seen.has(key)) {
            seen.set(key, true);
            result.push(word);
        }
    });

    return result;
}

/**
 * Xóa các từ vựng trùng lặp (giữ lại bản gốc)
 */
async function removeDuplicates(duplicates) {
    if (!duplicates || duplicates.length === 0) {
        alert('Không có từ trùng lặp để xóa.');
        return;
    }

    let deletedCount = 0;
    let errorCount = 0;

    // Tạo progress indicator
    const progressDiv = document.createElement('div');
    progressDiv.id = 'delete-progress';
    progressDiv.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 10001; display: flex; align-items: center; justify-content: center;">
            <div style="background: #1e1e2e; padding: 30px; border-radius: 12px; text-align: center; min-width: 300px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 40px; color: #667eea; margin-bottom: 15px;"></i>
                <h3 style="color: #fff; margin: 0 0 10px 0;">Đang xóa từ trùng lặp...</h3>
                <p id="delete-progress-text" style="color: #aaa; margin: 0;">0 / ${duplicates.length}</p>
            </div>
        </div>
    `;
    document.body.appendChild(progressDiv);

    // Xóa từng từ trùng
    for (let i = 0; i < duplicates.length; i++) {
        const dup = duplicates[i];
        document.getElementById('delete-progress-text').textContent = `${i + 1} / ${duplicates.length}`;

        try {
            const res = await fetch(withVocabLang(`${API_URL}/vocabulary/${encodeURIComponent(dup.duplicate.en)}`), {
                method: 'DELETE'
            });
            const data = await res.json();

            if (data.success) {
                deletedCount++;
                // Xóa khỏi local data
                localVocabularyData = localVocabularyData.filter((_w, idx) => idx !== dup.duplicate._index);
            } else {
                errorCount++;
            }
        } catch (error) {
            console.error('Error deleting duplicate:', error);
            errorCount++;
        }

        // Delay nhỏ để tránh quá tải server
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Xóa progress
    progressDiv.remove();

    // Reload local data và hiển thị
    await loadLocalVocabulary(currentLocalFile);
    displayLocalVocabulary();

    // Thông báo kết quả
    if (errorCount === 0) {
        showToast(`✅ Đã xóa ${deletedCount} từ trùng lặp thành công!`, 'success');
    } else {
        alert(`⚠️ Đã xóa ${deletedCount} từ.\n❌ Lỗi: ${errorCount} từ không xóa được (có thể do API offline).`);
    }
}

/**
 * Xóa trùng lặp trực tiếp trong local data (không cần API)
 */
function removeDuplicatesLocal() {
    const duplicates = findDuplicateVocabulary();

    if (duplicates.length === 0) {
        alert(`✅ Không tìm thấy từ vựng trùng lặp trong file ${currentLocalFile}!`);
        return;
    }

    if (!confirm(`Tìm thấy ${duplicates.length} từ trùng lặp.\n\nBạn có muốn xóa chúng khỏi danh sách hiển thị?\n\n(Lưu ý: Chỉ xóa trong bộ nhớ, không ảnh hưởng file gốc)`)) {
        return;
    }

    // Lấy danh sách index cần xóa (từ cao xuống thấp để không ảnh hưởng index)
    const indexesToRemove = duplicates.map(d => d.duplicate._index).sort((a, b) => b - a);

    // Xóa từ local data
    indexesToRemove.forEach(idx => {
        localVocabularyData.splice(idx, 1);
    });

    // Refresh display
    displayLocalVocabulary();

    showToast(`✅ Đã xóa ${duplicates.length} từ trùng lặp khỏi danh sách!`, 'success');
}

/**
 * Hiển thị toast notification nhẹ
 */
function showToast(message, type = 'info') {
    // Tạo toast element
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(toast);

    // Tự động xóa sau 3 giây
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===================================
// BULK DELETE LOGIC
// ===================================

function getSelectedVocabEns() {
    return Array.from(document.querySelectorAll('.vocab-row-cb:checked'))
        .map(cb => cb.dataset.wordEn);
}

function updateVocabBulkToolbar() {
    const toolbar = document.getElementById('vocab-bulk-toolbar');
    const countEl = document.getElementById('vocab-bulk-count');
    if (!toolbar) return;
    const selected = document.querySelectorAll('.vocab-row-cb:checked').length;
    if (selected > 0) {
        toolbar.style.display = 'flex';
        if (countEl) countEl.textContent = `${selected} đã chọn`;
    } else {
        toolbar.style.display = 'none';
    }
}

function attachVocabCheckboxListeners() {
    // Individual row checkboxes
    document.querySelectorAll('.vocab-row-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            updateVocabBulkToolbar();
            // Sync select-all state
            const all = document.querySelectorAll('.vocab-row-cb');
            const checked = document.querySelectorAll('.vocab-row-cb:checked');
            const selectAll = document.getElementById('vocab-select-all');
            if (selectAll) {
                selectAll.checked = all.length > 0 && checked.length === all.length;
                selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
            }
        });
    });

    // Select-all checkbox
    const selectAll = document.getElementById('vocab-select-all');
    if (selectAll) {
        // Replace listener (in case of re-render)
        const newSelectAll = selectAll.cloneNode(true);
        selectAll.parentNode.replaceChild(newSelectAll, selectAll);
        newSelectAll.addEventListener('change', () => {
            document.querySelectorAll('.vocab-row-cb').forEach(cb => {
                cb.checked = newSelectAll.checked;
            });
            updateVocabBulkToolbar();
        });
    }

    // Bulk toolbar buttons
    const deleteSelectedBtn = document.getElementById('btn-delete-selected-vocab');
    if (deleteSelectedBtn && !deleteSelectedBtn._bulkBound) {
        deleteSelectedBtn._bulkBound = true;
        deleteSelectedBtn.addEventListener('click', deleteSelectedVocab);
    }
    const deselectBtn = document.getElementById('btn-deselect-all-vocab');
    if (deselectBtn && !deselectBtn._bulkBound) {
        deselectBtn._bulkBound = true;
        deselectBtn.addEventListener('click', () => {
            document.querySelectorAll('.vocab-row-cb').forEach(cb => cb.checked = false);
            const sa = document.getElementById('vocab-select-all');
            if (sa) { sa.checked = false; sa.indeterminate = false; }
            updateVocabBulkToolbar();
        });
    }
}

async function deleteSelectedVocab() {
    const ens = getSelectedVocabEns();
    if (ens.length === 0) return;
    if (!confirm(`Xóa ${ens.length} từ đã chọn?\n\n⚠️ Thao tác này XÓA VĨNH VIỄN trong database!`)) return;

    const btn = document.getElementById('btn-delete-selected-vocab');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xóa...'; }

    try {
        const res = await fetch(withVocabLang(`${API_URL}/vocabulary/bulk`), {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ens }),
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✅ Đã xóa ${data.deleted} từ vựng`, 'success');
            await loadVocabulary();
            loadVocabularyStats();
            loadRecentActivities();
        } else {
            showToast(`❌ Lỗi: ${data.message}`, 'error');
        }
    } catch (err) {
        showToast(`❌ Lỗi kết nối: ${err.message}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash"></i> Xóa đã chọn'; }
    }
}

function showFilterDeleteVocabModal() {
    const existing = document.getElementById('filter-delete-vocab-modal');
    if (existing) existing.remove();

    const FIELDS = [
        { value: 'part',          label: 'Part' },
        { value: 'type',          label: 'Loại từ (type)' },
        { value: 'source',        label: 'Nguồn (source)' },
        { value: 'level',         label: 'Cấp độ (level)' },
        { value: 'en',            label: 'Từ tiếng Anh (en)' },
        { value: 'uploadBatchId', label: 'Batch ID' },
        { value: 'image',         label: 'Đường dẫn ảnh (image)' },
    ];
    const fieldOptions = FIELDS.map(f => `<option value="${f.value}">${f.label}</option>`).join('');

    const INPUT_STYLE = 'width:100%;padding:8px 10px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#e2e8f0;font-size:14px;box-sizing:border-box;';
    const SEL_STYLE   = `${INPUT_STYLE}cursor:pointer;`;

    function makeRow(idx) {
        return `
        <div class="fd-row" style="display:grid;grid-template-columns:1fr 1.5fr;gap:10px;margin-bottom:10px;">
            <select class="fd-field" data-idx="${idx}" style="${SEL_STYLE}">
                <option value="">-- Trường --</option>
                ${fieldOptions}
            </select>
            <input class="fd-value" data-idx="${idx}" type="text" placeholder="Giá trị..." style="${INPUT_STYLE}">
        </div>`;
    }

    const modal = document.createElement('div');
    modal.id = 'filter-delete-vocab-modal';
    modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;">
            <div style="background:#1e1e2e;border-radius:12px;max-width:520px;width:95%;padding:28px;box-shadow:0 10px 40px rgba(0,0,0,0.5);">
                <h3 style="margin:0 0 6px;color:#fff;"><i class="fas fa-filter"></i> Xóa từ vựng theo điều kiện</h3>
                <p style="color:#94a3b8;font-size:13px;margin:0 0 4px;">Xóa tất cả từ vựng thỏa <strong>tất cả</strong> điều kiện bên dưới (AND). Dòng trống sẽ bị bỏ qua.</p>
                <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:10px;margin-bottom:6px;padding:0 0 4px;">
                    <span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Trường</span>
                    <span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;">Giá trị</span>
                </div>
                <div id="fd-rows">
                    ${makeRow(0)}${makeRow(1)}${makeRow(2)}${makeRow(3)}${makeRow(4)}
                </div>
                <div id="fd-preview" style="font-size:13px;color:#94a3b8;min-height:20px;margin-bottom:16px;"></div>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button id="fd-cancel" style="padding:9px 18px;background:#334155;color:#e2e8f0;border:none;border-radius:6px;cursor:pointer;">Hủy</button>
                    <button id="fd-confirm" style="padding:9px 18px;background:linear-gradient(135deg,#e74c3c,#c0392b);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">
                        <i class="fas fa-trash"></i> Xóa
                    </button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const overlay = modal.querySelector('div');
    document.getElementById('fd-cancel').addEventListener('click', () => modal.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) modal.remove(); });

    document.getElementById('fd-confirm').addEventListener('click', async () => {
        const filters = Array.from(modal.querySelectorAll('.fd-row')).map(row => ({
            field: row.querySelector('.fd-field').value,
            value: row.querySelector('.fd-value').value.trim(),
        })).filter(p => p.field && p.value);

        if (filters.length === 0) {
            document.getElementById('fd-preview').innerHTML = '<span style="color:#f87171;">⚠️ Nhập ít nhất 1 điều kiện</span>';
            return;
        }

        const condStr = filters.map(p => `${p.field} = "${p.value}"`).join(' AND ');
        if (!confirm(`Xóa TẤT CẢ từ vựng thỏa:\n${condStr}\n\n⚠️ Thao tác này XÓA VĨNH VIỄN trong database!`)) return;

        const confirmBtn = document.getElementById('fd-confirm');
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xóa...';

        try {
            const res = await fetch(withVocabLang(`${API_URL}/vocabulary/filter-delete`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filters }),
            });
            const data = await res.json();
            if (data.success) {
                showToast(`✅ Đã xóa ${data.deleted} từ vựng (${condStr})`, 'success');
                modal.remove();
                await loadVocabulary();
                loadVocabularyStats();
                loadRecentActivities();
            } else {
                document.getElementById('fd-preview').innerHTML = `<span style="color:#f87171;">❌ ${data.message}</span>`;
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fas fa-trash"></i> Xóa';
            }
        } catch (err) {
            showToast(`❌ Lỗi kết nối: ${err.message}`, 'error');
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-trash"></i> Xóa';
        }
    });
}
window.showFilterDeleteVocabModal = showFilterDeleteVocabModal;

const DELETE_ALL_KEYWORD = 'XOA TAT CA';

function deleteAllVocabulary() {
    const existing = document.getElementById('delete-all-vocab-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'delete-all-vocab-modal';
    modal.innerHTML = `
        <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:10000;display:flex;align-items:center;justify-content:center;">
            <div style="background:#1e1e2e;border-radius:12px;max-width:440px;width:95%;padding:28px;box-shadow:0 10px 40px rgba(0,0,0,0.6);">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                    <span style="font-size:28px;">⚠️</span>
                    <h3 style="margin:0;color:#f87171;">Xóa toàn bộ từ vựng</h3>
                </div>
                <p style="color:#94a3b8;font-size:14px;margin:0 0 18px;line-height:1.6;">
                    Thao tác này sẽ <strong style="color:#f87171;">XÓA VĨNH VIỄN</strong> toàn bộ từ vựng trong database và <strong>không thể hoàn tác</strong>.<br><br>
                    Gõ <code style="background:#0f172a;padding:2px 8px;border-radius:4px;color:#fb923c;letter-spacing:1px;">${DELETE_ALL_KEYWORD}</code> để xác nhận:
                </p>
                <input id="da-confirm-input" type="text" autocomplete="off" placeholder="Gõ lệnh xác nhận..." style="width:100%;padding:10px 12px;background:#0f172a;border:2px solid #334155;border-radius:8px;color:#e2e8f0;font-size:15px;box-sizing:border-box;letter-spacing:1px;transition:border-color .2s;">
                <div id="da-error" style="min-height:18px;font-size:12px;color:#f87171;margin:8px 0 16px;"></div>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button id="da-cancel" style="padding:9px 18px;background:#334155;color:#e2e8f0;border:none;border-radius:6px;cursor:pointer;">Hủy</button>
                    <button id="da-confirm" disabled style="padding:9px 20px;background:#475569;color:#94a3b8;border:none;border-radius:6px;cursor:not-allowed;font-weight:bold;transition:background .2s,color .2s;">
                        <i class="fas fa-database"></i> Xóa tất cả
                    </button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const input = document.getElementById('da-confirm-input');
    const confirmBtn = document.getElementById('da-confirm');
    const errorEl = document.getElementById('da-error');

    input.focus();
    input.addEventListener('input', () => {
        const match = input.value.trim().toUpperCase() === DELETE_ALL_KEYWORD;
        confirmBtn.disabled = !match;
        confirmBtn.style.background = match ? 'linear-gradient(135deg,#e74c3c,#c0392b)' : '#475569';
        confirmBtn.style.color = match ? '#fff' : '#94a3b8';
        confirmBtn.style.cursor = match ? 'pointer' : 'not-allowed';
        input.style.borderColor = input.value ? (match ? '#ef4444' : '#334155') : '#334155';
        errorEl.textContent = '';
    });

    document.getElementById('da-cancel').addEventListener('click', () => modal.remove());
    modal.querySelector('div').addEventListener('click', e => { if (e.target === modal.querySelector('div')) modal.remove(); });

    confirmBtn.addEventListener('click', async () => {
        if (input.value.trim().toUpperCase() !== DELETE_ALL_KEYWORD) {
            errorEl.textContent = '⚠️ Lệnh không khớp';
            return;
        }
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xóa...';
        try {
            const res = await fetch(withVocabLang(`${API_URL}/vocabulary/all`), { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showToast(`✅ Đã xóa ${data.deleted} từ vựng khỏi database`, 'success');
                modal.remove();
                await loadVocabulary();
                loadVocabularyStats();
                loadRecentActivities();
            } else {
                errorEl.textContent = `❌ ${data.message}`;
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fas fa-database"></i> Xóa tất cả';
            }
        } catch (err) {
            showToast(`❌ Lỗi kết nối: ${err.message}`, 'error');
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-database"></i> Xóa tất cả';
        }
    });
}
window.deleteAllVocabulary = deleteAllVocabulary;

function openEditWordModal(wordData) {
    const modal = document.getElementById("add-word-modal");
    const modalTitle = modal.querySelector("h3");
    const submitBtn = modal.querySelector('button[type="submit"]');
    const currentLang = typeof vocabCurrentLang !== 'undefined' ? vocabCurrentLang : 'en';

    const langBadge = currentLang === 'zh'
        ? '<span style="margin-left:8px;font-size:11px;padding:2px 8px;border-radius:12px;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;font-weight:700">🇨🇳 Chinese</span>'
        : '<span style="margin-left:8px;font-size:11px;padding:2px 8px;border-radius:12px;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;font-weight:700">🇬🇧 English</span>';
    modalTitle.innerHTML = '✏️ Edit Word ' + langBadge;
    submitBtn.textContent = 'Update Word';

    // Cập nhật nhãn input chính
    const wordLabel = modal.querySelector('label[for="word-en"]');
    if (wordLabel) {
        wordLabel.innerHTML = currentLang === 'zh' ? 'Từ Tiếng Trung (ZH) <span style="color:#ef4444">*</span>' : 'English Word (EN) <span style="color:#ef4444">*</span>';
    }

    // Điền dữ liệu vào form
    document.getElementById("word-en").value = wordData.en || wordData.zh || '';
    document.getElementById("word-vn").value = wordData.vn || '';
    document.getElementById("word-phonetic").value = wordData.phonetic || '';
    document.getElementById("word-part").value = wordData.part || '';
    // Type: try single first, then phrase
    const sel1 = document.getElementById("word-type");
    const sel2 = document.getElementById("word-type-phrase");
    if (sel1) sel1.value = '';
    if (sel2) sel2.value = '';
    if (wordData.type) {
        const t = wordData.type.toLowerCase().trim();
        if (sel1 && Array.from(sel1.options).some(o => o.value === t)) sel1.value = t;
        else if (sel2 && Array.from(sel2.options).some(o => o.value === t)) sel2.value = t;
        else if (sel1) sel1.value = t;
    }
    if (document.getElementById("word-level")) document.getElementById("word-level").value = wordData.level || '';
    document.getElementById("word-synonyms").value = wordData.synonyms || '';
    // Fix đường dẫn ảnh cũ sang format mới
    const rawImage = wordData.image || '';
    const fixedImage = rawImage.replace(/^assets\/images\/pages\//, 'images/pages/');
    document.getElementById("word-image").value = fixedImage;
    document.getElementById("word-example").value = wordData.example || '';
    const sourcesField = document.getElementById("word-sources");
    if (sourcesField) sourcesField.value = wordData.source || '';

    // Lưu trạng thái edit mode
    modal.dataset.editMode = 'true';
    modal.dataset.originalEn = wordData.en || wordData.zh;

    // Hiển thị modal
    modal.style.display = "flex";
}
