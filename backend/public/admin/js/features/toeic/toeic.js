// ===================================
// TOEIC ADMIN MODULE
// Questions, Tests, Users Tab, Practice History
// ===================================

async function loadToeicStats() {
    try {
        const [testsRes, questionsRes] = await Promise.all([
            fetch(`${TOEIC_API_BASE}/tests`,     { headers: { 'Authorization': `Bearer ${getToken()}` } }),
            fetch(`${TOEIC_API_BASE}/questions`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
        ]);

        const testsData = await testsRes.json();
        const questionsData = await questionsRes.json();

        const testsEl = document.getElementById('toeic-tests-count');
        if (testsEl) {
            testsEl.textContent = testsData.data?.length ?? testsData.count ?? '-';
        }
        const questionsEl = document.getElementById('total-sessions');
        if (questionsEl) {
            questionsEl.textContent = questionsData.total ?? questionsData.count ?? questionsData.data?.length ?? '-';
        }
    } catch (error) {
        console.error('Error loading TOEIC stats:', error);
    }
}

async function loadQuestions(filterPart = '', page = 1) {
    try {
        questionsPagination.filterPart = filterPart;
        if (filterPart) searchFilters.part = filterPart;
        questionsPagination.currentPage = page;

        // LỌC/PHÂN TRANG Ở SERVER. Trước đây tải cứng 1000 màn rồi lọc tại chỗ:
        // kho có 1800+ màn nên phần dôi ra không bao giờ tải về — lọc theo Part
        // ra thiếu, và màn vừa thêm của đề có mã đứng cuối bảng chữ cái thì
        // không bao giờ hiện.
        const params = new URLSearchParams({
            page: questionsPagination.currentPage,
            limit: questionsPagination.limit,
            sort: searchFilters.sortBy || 'newest',
        });
        if (searchFilters.part) params.set('part', searchFilters.part);
        if (searchFilters.source) params.set('source', searchFilters.source);
        if (searchFilters.searchText) params.set('search', searchFilters.searchText);

        const res = await fetch(`${TOEIC_API_BASE}/questions?${params}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const data = await res.json();

        if (!data.success) {
            throw new Error(data.message || 'Failed to load questions');
        }

        allQuestions = data.data || [];
        currentQuestions = [...allQuestions];
        questionsPagination.total = data.total || 0;
        questionsPagination.totalPages = data.pages || 1;

        if (!window.searchFiltersInitialized) {
            initSearchAndFilters();
            window.searchFiltersInitialized = true;
        }

        await populateSourceFilter();
        renderQuestionsAndPager();

    } catch (error) {
        console.error('Error loading questions:', error);
        const tbody = document.querySelector('#questions-table tbody');
        if (tbody) tbody.innerHTML = `
            <tr><td colspan="8" class="loading" style="color: red;">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading questions</p>
            </td></tr>
        `;
    }
}

function renderQuestionsTable() {
    const tbody = document.querySelector('#questions-table tbody');

    if (currentQuestions.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8" class="loading">
                <i class="fas fa-inbox"></i>
                <p>No questions found</p>
            </td></tr>
        `;
        return;
    }

    tbody.innerHTML = currentQuestions.map(q => {
        let imageDisplay = '-';
        const firstImage = q.imageUrls?.[0];
        if (firstImage) {
            const imagePath = firstImage.replace('/assets/images/', '');
            imageDisplay = `<span style="color: #3498db; font-size: 0.85em; font-family: monospace;" title="${firstImage}">${truncate(imagePath, 20)}</span>`;
        }

        let audioDisplay = '-';
        if (q.audioUrl) {
            const audioPath = q.audioUrl.replace('/assets/audio/', '');
            audioDisplay = `<span style="color: #e67e22; font-size: 0.85em; font-family: monospace;" title="${q.audioUrl}">${truncate(audioPath, 20)}</span>`;
        }

        let keywordsDisplay = '-';
        let keywordsTitle = '';
        if (q.questionKeyword || q.answerKeyword || q.audioKeyword) {
            const keywords = [];
            const keywordsTitleParts = [];
            if (q.questionKeyword) {
                keywords.push(`<span style="color: #667eea;">Q: ${truncate(q.questionKeyword, 10)}</span>`);
                keywordsTitleParts.push(`Question: ${q.questionKeyword}`);
            }
            if (q.answerKeyword) {
                keywords.push(`<span style="color: #10b981;">A: ${truncate(q.answerKeyword, 10)}</span>`);
                keywordsTitleParts.push(`Answer: ${q.answerKeyword}`);
            }
            if (q.audioKeyword) {
                keywords.push(`<span style="color: #764ba2;">Au: ${truncate(q.audioKeyword, 10)}</span>`);
                keywordsTitleParts.push(`Audio: ${q.audioKeyword}`);
            }
            keywordsDisplay = keywords.join('<br>');
            keywordsTitle = keywordsTitleParts.join(' | ');
        }

        // Dữ liệu giờ là MỘT MÀN: Part 1/2/5 có 1 câu, Part 3/4/6/7 có nhiều câu.
        const subs = Array.isArray(q.questions) ? q.questions : [];
        const nums = subs.map(x => x.number).filter(Number.isFinite);
        const numLabel = nums.length
            ? (nums.length === 1 ? String(nums[0]) : `${Math.min(...nums)}–${Math.max(...nums)}`)
            : '-';
        // "Mới thêm" = tạo trong 2 giờ qua → hàng có viền + nhãn để dễ tìm câu vừa nhập.
        const isNew = q.createdAt && (Date.now() - new Date(q.createdAt).getTime()) < 2 * 3600 * 1000;
        const newBadge = isNew ? '<br><small class="q-new-badge">MỚI</small>' : '';
        const numDisplay = `<span style="font-weight:700;color:#e11d48">${numLabel}</span>` +
            (subs.length > 1 ? `<br><small style="color:var(--text-secondary)">${subs.length} câu</small>` : '')
            + newBadge;

        // Cột nội dung: câu đơn hiện đề bài; màn nhiều câu liệt kê số câu.
        const questionTextFull = subs.length > 1
            ? subs.map(x => `${x.number ?? '?'}. ${x.correctAnswer}`).join('  ·  ')
            : (subs[0]?.questionText || 'N/A');
        const answerDisplay = subs.length > 1
            ? `<small style="color:var(--text-secondary)">${subs.length} đáp án</small>`
            : (subs[0]?.correctAnswer || '-');

        const sourceFull = q.source || '';
        const sourceDisplay = sourceFull
            ? `<span style="color: #16a34a; font-size: 0.85em; font-family: monospace;" title="${sourceFull.replace(/"/g, '&quot;')}">${truncate(sourceFull, 18)}</span>`
            : '<span style="color: var(--text-secondary)">-</span>';

        return `
            <tr class="${isNew ? 'q-row-new' : ''}">
                <td><span class="part-badge">Part ${q.part}</span></td>
                <td style="text-align: center;">${numDisplay}</td>
                <td title="${questionTextFull.replace(/"/g, '&quot;')}">${truncate(questionTextFull, 50)}</td>
                <td style="text-align: center;">${sourceDisplay}</td>
                <td style="text-align: center; font-weight: 600; color: #667eea;">${answerDisplay}</td>
                <td style="text-align: center;" title="${firstImage || ''}">${imageDisplay}</td>
                <td style="text-align: center;" title="${q.audioUrl || ''}">${audioDisplay}</td>
                <td style="white-space: nowrap">
                    <button class="btn btn-primary btn-sm btn-edit-question" data-question-id="${q._id}" title="Sửa">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm btn-delete-question" data-question-id="${q._id}" title="Xoá">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-edit-question').forEach(btn => {
        btn.addEventListener('click', () => {
            highlightQuestionRow(btn);
            editQuestion(btn.getAttribute('data-question-id'));
        });
    });

    tbody.querySelectorAll('.btn-delete-question').forEach(btn => {
        btn.addEventListener('click', () => {
            deleteQuestion(btn.getAttribute('data-question-id'));
        });
    });

    restoreHighlights();
}

function highlightQuestionRow(button) {
    const questionId = button.getAttribute('data-question-id');

    if (highlightedQuestionId && highlightedQuestionId !== questionId) {
        previouslyViewedQuestionIds.add(highlightedQuestionId);
    }

    highlightedQuestionId = questionId;
    restoreHighlights();
}

function restoreHighlights() {
    document.querySelectorAll('#questions-tbody tr').forEach(row => {
        row.classList.remove('row-highlighted', 'row-previously-viewed');
    });

    previouslyViewedQuestionIds.forEach(id => {
        const button = document.querySelector(`[data-question-id="${id}"]`);
        const row = button?.closest('tr');
        if (row) row.classList.add('row-previously-viewed');
    });

    if (highlightedQuestionId) {
        const button = document.querySelector(`[data-question-id="${highlightedQuestionId}"]`);
        const row = button?.closest('tr');
        if (row) {
            row.classList.remove('row-previously-viewed');
            row.classList.add('row-highlighted');
        }
    }
}

// Đổ danh sách nguồn (source) vào select lọc. Lấy DISTINCT TỪ SERVER — suy ra
// từ dữ liệu đã tải chỉ cho ra các nguồn có mặt trong trang hiện tại, thiếu hẳn
// những đề còn lại trong kho.
let _sourceOptionsLoaded = false;
let _allSources = [];
async function populateSourceFilter() {
    if (_sourceOptionsLoaded) return;
    try {
        const res = await fetch(`${TOEIC_API_BASE}/questions/sources`, {
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        const data = await res.json();
        _allSources = data.success ? (data.data || []) : [];
        renderSourceOptions();
        _sourceOptionsLoaded = true;
    } catch (_) { /* để nguyên "Tất cả nguồn" nếu tải hỏng */ }
}

// Vẽ danh sách mã đề trong dropdown, lọc theo chữ đang gõ ở ô tìm của dropdown.
function renderSourceOptions(keyword = '') {
    const list = document.getElementById('source-filter-list');
    if (!list) return;
    const kw = keyword.trim().toLowerCase();
    const shown = kw ? _allSources.filter(s => s.toLowerCase().includes(kw)) : _allSources;
    const cur = searchFilters.source || '';

    const row = (val, text) => `
        <button type="button" class="source-opt${cur === val ? ' active' : ''}" data-val="${val}">${text}</button>`;

    list.innerHTML = row('', 'Tất cả nguồn')
        + (shown.length
            ? shown.map(s => row(s, s)).join('')
            : '<div style="padding:8px;font-size:12px;color:var(--text-secondary)">Không có mã đề khớp</div>');

    list.querySelectorAll('.source-opt').forEach(btn => {
        btn.onclick = () => {
            searchFilters.source = btn.dataset.val;
            const label = document.getElementById('source-filter-label');
            if (label) label.textContent = btn.dataset.val || 'Tất cả nguồn';
            closeSourceDropdown();
            applyFiltersAndSort();
        };
    });
}

function closeSourceDropdown() {
    const dd = document.getElementById('source-filter-dropdown');
    if (dd) dd.style.display = 'none';
}

function initSearchAndFilters() {
    const searchInput = document.getElementById('question-search');
    const filterPart = document.getElementById('filter-part');
    const sortBy = document.getElementById('sort-by');
    const clearFiltersBtn = document.getElementById('clear-filters');

    // Dropdown nguồn tự dựng: mở/đóng + ô lọc nhanh bên trong.
    const srcBtn = document.getElementById('source-filter-btn');
    const srcDropdown = document.getElementById('source-filter-dropdown');
    const srcSearch = document.getElementById('source-filter-search');
    if (srcBtn && srcDropdown) {
        srcBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = srcDropdown.style.display === 'block';
            srcDropdown.style.display = open ? 'none' : 'block';
            if (!open) {
                if (srcSearch) { srcSearch.value = ''; srcSearch.focus(); }
                renderSourceOptions();
            }
        });
        srcDropdown.addEventListener('click', (e) => e.stopPropagation());
        // Bấm ra ngoài thì đóng — dropdown tự dựng không tự tắt như <select>.
        document.addEventListener('click', closeSourceDropdown);
        srcSearch?.addEventListener('input', (e) => renderSourceOptions(e.target.value));
    }

    let searchTimeout;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchFilters.searchText = e.target.value.toLowerCase();
                applyFiltersAndSort();
            }, 300);
        });
    }

    if (filterPart) {
        filterPart.addEventListener('change', (e) => {
            searchFilters.part = e.target.value;
            applyFiltersAndSort();
        });
    }

    if (sortBy) {
        sortBy.addEventListener('change', (e) => {
            searchFilters.sortBy = e.target.value;
            applyFiltersAndSort();
        });
    }

    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            searchFilters = { searchText: '', part: '', source: '', sortBy: 'newest' };
            if (searchInput) searchInput.value = '';
            if (filterPart) filterPart.value = '';
            if (sortBy) sortBy.value = 'newest';
            // Nguồn là dropdown tự dựng → phải tự trả nhãn về mặc định.
            const srcLabel = document.getElementById('source-filter-label');
            if (srcLabel) srcLabel.textContent = 'Tất cả nguồn';
            closeSourceDropdown();
            applyFiltersAndSort();
        });
    }
}

// Đổi bộ lọc → luôn về trang 1 rồi hỏi lại server (lọc/sắp/phân trang đều ở
// server nên kết quả tính trên TOÀN BỘ kho, không phải phần đã tải).
function applyFiltersAndSort() {
    loadQuestions(searchFilters.part || '', 1);
}

// Vẽ bảng + thanh phân trang từ trang server vừa trả về.
function renderQuestionsAndPager() {
    renderQuestionsTable();
    renderPager('questions-pagination', {
        page: questionsPagination.currentPage,
        limit: questionsPagination.limit,
        total: questionsPagination.total,
        itemName: 'màn',
        onPage: (page) => {
            loadQuestions(searchFilters.part || '', page);
            document.querySelector('#questions-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
    });
}

function initUserSearchAndFilters() {
    const searchInput = document.getElementById('user-search');
    const filterRole = document.getElementById('filter-user-role');
    const filterStatus = document.getElementById('filter-user-status');
    const clearFiltersBtn = document.getElementById('clear-user-filters');

    let searchTimeout;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                userFilters.searchText = e.target.value.toLowerCase();
                applyUserFilters();
            }, 300);
        });
    }

    if (filterRole) {
        filterRole.addEventListener('change', (e) => {
            userFilters.role = e.target.value;
            applyUserFilters();
        });
    }

    if (filterStatus) {
        filterStatus.addEventListener('change', (e) => {
            userFilters.status = e.target.value;
            applyUserFilters();
        });
    }

    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            userFilters = { searchText: '', role: '', status: '' };
            if (searchInput) searchInput.value = '';
            if (filterRole) filterRole.value = '';
            if (filterStatus) filterStatus.value = '';
            applyUserFilters();
        });
    }
}

function applyUserFilters() {
    let filtered = [...allUsers];

    if (userFilters.searchText) {
        filtered = filtered.filter(u => {
            const searchText = userFilters.searchText;
            return (
                (u.username && u.username.toLowerCase().includes(searchText)) ||
                (u.email && u.email.toLowerCase().includes(searchText))
            );
        });
    }

    if (userFilters.role) {
        filtered = filtered.filter(u => u.role === userFilters.role);
    }

    if (userFilters.status) {
        const isActive = userFilters.status === 'active';
        filtered = filtered.filter(u => u.isActive === isActive);
    }

    currentUsers = filtered;
    usersTabPage.current = 1; // đổi bộ lọc thì về trang đầu
    displayUsersInTab(currentUsers);
}

function initTestSearchAndFilters() {
    const searchInput = document.getElementById('test-search');
    const filterType = document.getElementById('filter-test-type');
    const filterLevel = document.getElementById('filter-test-level');
    const sortBy = document.getElementById('test-sort-by');
    const clearFiltersBtn = document.getElementById('clear-test-filters');
    const pageSizeSelect = document.getElementById('test-page-size');

    if (pageSizeSelect) {
        pageSizeSelect.addEventListener('change', (e) => {
            testsPagination.limit = parseInt(e.target.value);
            testsPagination.currentPage = 1;
            applyTestFilters();
        });
    }

    let searchTimeout;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                testFilters.searchText = e.target.value.toLowerCase();
                testsPagination.currentPage = 1;
                applyTestFilters();
            }, 300);
        });
    }

    if (filterType) {
        filterType.addEventListener('change', (e) => {
            testFilters.type = e.target.value;
            testsPagination.currentPage = 1;
            applyTestFilters();
        });
    }

    if (filterLevel) {
        filterLevel.addEventListener('change', (e) => {
            testFilters.level = e.target.value;
            testsPagination.currentPage = 1;
            applyTestFilters();
        });
    }

    if (sortBy) {
        sortBy.addEventListener('change', (e) => {
            testFilters.sortBy = e.target.value;
            testsPagination.currentPage = 1;
            applyTestFilters();
        });
    }

    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            testFilters = { searchText: '', type: '', level: '', sortBy: 'newest' };
            testsPagination.currentPage = 1;
            if (searchInput) searchInput.value = '';
            if (filterType) filterType.value = '';
            if (filterLevel) filterLevel.value = '';
            if (sortBy) sortBy.value = 'newest';
            if (pageSizeSelect) {
                pageSizeSelect.value = '15';
                testsPagination.limit = 15;
            }
            applyTestFilters();
        });
    }
}

function applyTestFilters() {
    let filtered = [...allTests];

    if (testFilters.searchText) {
        filtered = filtered.filter(t =>
            (t.testName && t.testName.toLowerCase().includes(testFilters.searchText)) ||
            (t.source && t.source.toLowerCase().includes(testFilters.searchText))
        );
    }

    if (testFilters.type) {
        if (testFilters.type === 'mini') {
            filtered = filtered.filter(t => t.testType && t.testType.startsWith('mini-'));
        } else {
            filtered = filtered.filter(t => t.testType === testFilters.type);
        }
    }

    if (testFilters.level) {
        filtered = filtered.filter(t => t.level === testFilters.level);
    }

    switch (testFilters.sortBy) {
        case 'newest': filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)); break;
        case 'oldest': filtered.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)); break;
        case 'most-attempts': filtered.sort((a, b) => (b.timesAttempted || 0) - (a.timesAttempted || 0)); break;
        case 'highest-score': filtered.sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0)); break;
        case 'lowest-score': filtered.sort((a, b) => (a.averageScore || 0) - (b.averageScore || 0)); break;
    }

    testsPagination.total = filtered.length;
    testsPagination.totalPages = Math.ceil(filtered.length / testsPagination.limit);

    if (testsPagination.currentPage > testsPagination.totalPages) {
        testsPagination.currentPage = 1;
    }

    const start = (testsPagination.currentPage - 1) * testsPagination.limit;
    const end = start + testsPagination.limit;
    currentTests = filtered.slice(start, end);

    renderTestsTable();
    renderPager('tests-pagination', {
        page: testsPagination.currentPage,
        limit: testsPagination.limit,
        total: testsPagination.total,
        itemName: 'đề',
        onPage: (page) => {
            testsPagination.currentPage = page;
            applyTestFilters();
            document.querySelector('#tests-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
    });
    refreshBulkPublishBtn();
}

async function loadTests() {
    try {
        const res = await fetch(`${TOEIC_API_BASE}/tests`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const data = await res.json();

        if (!data.success) throw new Error(data.message || 'Failed to load tests');

        allTests = data.data || [];
        currentTests = [...allTests];

        if (!window.testFiltersInitialized) {
            initTestSearchAndFilters();
            window.testFiltersInitialized = true;
        }

        applyTestFilters();
    } catch (error) {
        console.error('Error loading tests:', error);
        const tbody = document.querySelector('#tests-table tbody');
        if (tbody) tbody.innerHTML = `
            <tr><td colspan="8" class="loading" style="color: red;">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading tests</p>
            </td></tr>
        `;
    }
}

function renderTestsTable() {
    const tbody = document.querySelector('#tests-table tbody');

    if (currentTests.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8" class="loading">
                <i class="fas fa-inbox"></i>
                <p>Không tìm thấy đề thi nào</p>
            </td></tr>
        `;
        return;
    }

    const levelLabel = { beginner: '🟢 Cơ bản', intermediate: '🟡 Trung cấp', advanced: '🔴 Nâng cao' };

    tbody.innerHTML = currentTests.map(t => {
        const isPublished = t.isPublished;
        const hasQuestions = t.totalQuestions > 0;
        const statusBadge = isPublished
            ? '<span class="badge success">Đã đăng</span>'
            : '<span class="badge" style="background: #ffc107; color: #000;">Nháp</span>';
        const questionWarning = !hasQuestions
            ? '<span style="color: #ff6b6b; font-size: 11px;"><i class="fas fa-exclamation-triangle"></i> Chưa có câu hỏi</span>'
            : '';
        const sourceTag = t.source
            ? `<span style="font-size:11px;color:#6366f1;background:#ede9fe;padding:1px 6px;border-radius:4px;margin-left:4px;">${t.source}</span>`
            : '';
        const lvl = t.level ? `<span style="font-size:11px;color:#555;">${levelLabel[t.level] || t.level}</span>` : '';

        return `
        <tr>
            <td>
                <div style="font-weight:500">${t.testName}${sourceTag}</div>
                <div style="margin-top:3px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                    ${statusBadge} ${lvl} ${questionWarning}
                </div>
            </td>
            <td><span class="badge">${formatTestType(t.testType)}</span></td>
            <td style="text-align: center;">
                <strong>${t.totalQuestions}</strong>
                ${hasQuestions ? '' : '<br><small style="color: #ff6b6b;">Trống</small>'}
            </td>
            <td style="text-align: center;">${Math.round(t.totalTime / 60)}</td>
            <td style="text-align: center;">${t.timesAttempted || 0}</td>
            <td style="text-align: center;">${t.averageScore ? Math.round(t.averageScore) : '-'}</td>
            <td style="white-space: nowrap">
                ${!isPublished && hasQuestions ? `
                    <button class="btn btn-success btn-sm btn-publish-test" data-test-id="${t._id}" title="Xuất bản" style="margin-right: 5px;">
                        <i class="fas fa-upload"></i>
                    </button>
                ` : ''}
                ${isPublished ? `
                    <button class="btn btn-warning btn-sm btn-unpublish-test" data-test-id="${t._id}" title="Gỡ xuất bản" style="margin-right: 5px;">
                        <i class="fas fa-eye-slash"></i>
                    </button>
                ` : ''}
                <!-- fa-file-import: bản FontAwesome FREE không có fa-arrow-down-to-line
                     (icon Pro) — dùng nó thì nút hiện ra ô trống. -->
                <button class="btn btn-secondary btn-sm btn-refill-test" data-test-id="${t._id}"
                    title="Nạp thêm câu mới trong kho vào đề này (cùng source + Part)" style="margin-right: 5px;">
                    <i class="fas fa-file-import"></i>
                </button>
                <button class="btn btn-primary btn-sm btn-edit-test" data-test-id="${t._id}" title="Chỉnh sửa" style="margin-right: 5px;">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger btn-sm btn-delete-test" data-test-id="${t._id}" title="Xóa">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-edit-test').forEach(btn => {
        btn.addEventListener('click', () => editTest(btn.getAttribute('data-test-id')));
    });
    tbody.querySelectorAll('.btn-refill-test').forEach(btn => {
        btn.addEventListener('click', () => refillTest(btn.getAttribute('data-test-id'), btn));
    });
    tbody.querySelectorAll('.btn-publish-test').forEach(btn => {
        btn.addEventListener('click', () => publishTest(btn.getAttribute('data-test-id'), true));
    });
    tbody.querySelectorAll('.btn-unpublish-test').forEach(btn => {
        btn.addEventListener('click', () => publishTest(btn.getAttribute('data-test-id'), false));
    });
    tbody.querySelectorAll('.btn-delete-test').forEach(btn => {
        btn.addEventListener('click', () => deleteTest(btn.getAttribute('data-test-id')));
    });
}

function formatTestType(type) {
    const types = {
        'full-test': 'Full Test',
        'mini-part1': 'Part 1 Mini', 'mini-part2': 'Part 2 Mini',
        'mini-part3': 'Part 3 Mini', 'mini-part4': 'Part 4 Mini',
        'mini-part5': 'Part 5 Mini', 'mini-part6': 'Part 6 Mini',
        'mini-part7': 'Part 7 Mini',
    };
    return types[type] || type;
}

// Quy tắc ẢNH theo Part (khớp cách nội dung TOEIC thực tế được dựng):
//   Part 1: đúng 1 ảnh (bắt buộc) · Part 3/4: 0–1 ảnh (chỉ câu có biểu đồ) ·
//   Part 6: 1 ảnh (bắt buộc) · Part 7: 1–3 ảnh (bản scan đoạn đọc, tối đa 3).
//   Phần Nghe phát file audio thật (không nhập text); phần Đọc dùng ẢNH thay vì gõ đoạn văn.
const IMAGE_RULES = {
    1: { min: 1, max: 1 },
    3: { min: 0, max: 1 },
    4: { min: 0, max: 1 },
    6: { min: 1, max: 1 },
    7: { min: 1, max: 3 },
};

function updatePartVisibility() {
    const part = parseInt(document.getElementById('question-part').value);

    // Part 6 (điền chỗ trống) KHÔNG có câu hỏi riêng — giống Part 1.
    const questionTextField = document.getElementById('question-text-field');
    if (questionTextField) questionTextField.style.display = (part >= 2 && part !== 6) ? 'block' : 'none';

    // Nghe (Part 1-4) chỉ upload file audio thật — không còn ô "Nội dung audio".
    const audioFileField = document.getElementById('audio-file-field');
    if (audioFileField) audioFileField.style.display = (part >= 1 && part <= 4) ? 'block' : 'none';

    // Ảnh: hiện theo IMAGE_RULES; dấu * khi bắt buộc (min > 0).
    const rule = IMAGE_RULES[part];
    const imageField = document.getElementById('image-url-field');
    if (imageField) imageField.style.display = rule ? 'block' : 'none';
    const imageStar = document.getElementById('image-required-star');
    if (imageStar) imageStar.style.display = (rule && rule.min > 0) ? 'inline' : 'none';
    const hint = document.getElementById('image-hint-text');
    if (hint && rule) {
        hint.textContent = rule.max === 1
            ? `Chọn file để tự upload. Part ${part} cần ${rule.min > 0 ? 'đúng 1 ảnh' : 'tối đa 1 ảnh (tùy chọn)'}.`
            : `Chọn file để tự upload. Part ${part} cần ${rule.min}–${rule.max} ảnh (bản scan đoạn đọc).`;
    }
    const passageCountField = document.getElementById('passage-count-field');
    if (passageCountField) passageCountField.style.display = part === 7 ? 'block' : 'none';

    const keywordFieldPart12 = document.getElementById('keyword-field-part12');
    const keywordFieldPart34 = document.getElementById('keyword-field-part34');
    if (keywordFieldPart12) keywordFieldPart12.style.display = (part === 1 || part === 2) ? 'block' : 'none';
    if (keywordFieldPart34) keywordFieldPart34.style.display = (part === 3 || part === 4) ? 'block' : 'none';

    orderQuestionFields(part);
}

// Sắp lại THỨ TỰ audio / ảnh / nội dung câu hỏi theo Part (form là grid 2 cột).
//   Part 3/4: [audio | ảnh] cùng hàng, "Nội dung câu hỏi" xuống dưới.
//   Part 6/7: ảnh LÊN TRÊN "Nội dung câu hỏi".
//   Part 1: [audio | ảnh] cùng hàng · Part 2: audio → câu hỏi · Part 5: chỉ câu hỏi.
function orderQuestionFields(part) {
    const grid = document.querySelector('#question-form .question-form-grid');
    const anchor = document.getElementById('options-section'); // mốc: chèn field media TRƯỚC phần đáp án
    const audio = document.getElementById('audio-file-field');
    const qtext = document.getElementById('question-text-field');
    const image = document.getElementById('image-url-field');
    if (!grid || !anchor) return;

    let seq;
    if (part === 3 || part === 4) seq = [audio, image, qtext];
    else if (part === 6 || part === 7) seq = [image, qtext];
    else if (part === 1) seq = [audio, image];
    else if (part === 2) seq = [audio, qtext];
    else seq = [qtext]; // Part 5

    // Mặc định mỗi field chiếm trọn 1 hàng; Part 1/3/4 cho audio & ảnh nửa hàng (cạnh nhau).
    [audio, qtext, image].forEach(el => { if (el) el.style.gridColumn = '1 / -1'; });
    if (part === 1 || part === 3 || part === 4) {
        if (audio) audio.style.gridColumn = 'auto';
        if (image) image.style.gridColumn = 'auto';
    }

    // Di chuyển đúng thứ tự mong muốn ra ngay trước phần đáp án.
    seq.forEach(el => { if (el) grid.insertBefore(el, anchor); });
}

// ===================================
// ĐA ẢNH (Part 1/3/4/6/7) — danh sách thumbnail + xóa
// ===================================
function renderImageList() {
    const box = document.getElementById('images-container');
    if (!box) return;
    box.innerHTML = currentImageUrls.map((url, i) => `
        <div style="position:relative;border:2px solid #e0e0e0;border-radius:8px;overflow:hidden">
            <img src="${url}" alt="" style="width:110px;height:80px;object-fit:cover;display:block"
                 onerror="this.style.display='none';this.parentNode.querySelector('.img-fallback').style.display='flex'">
            <div class="img-fallback" style="display:none;width:110px;height:80px;align-items:center;justify-content:center;color:#9ca3af;font-size:11px;text-align:center;padding:4px">${url.split('/').pop()}</div>
            <button type="button" data-img-idx="${i}" title="Xóa ảnh"
                style="position:absolute;top:2px;right:2px;background:rgba(220,38,38,.9);color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;line-height:1">×</button>
        </div>`).join('');
    box.querySelectorAll('[data-img-idx]').forEach(btn => {
        btn.onclick = () => {
            currentImageUrls.splice(parseInt(btn.dataset.imgIdx), 1);
            renderImageList();
        };
    });
}

// Câu ĐƠN chỉ dùng cho Part 1/2/5; Part nhóm 3/4/6/7 tạo bằng nút "Thêm nhóm".
// Khi SỬA câu nhóm cũ thì vẫn hiện đủ 7 Part để dropdown không lệch.
function setPartOptionsMode(editMode) {
    const sel = document.getElementById('question-part');
    if (!sel) return;
    Array.from(sel.options).forEach(o => {
        const grouped = [3, 4, 6, 7].includes(parseInt(o.value));
        const hide = grouped && !editMode;
        o.hidden = hide;
        o.disabled = hide;
    });
    const hint = document.getElementById('question-part-hint');
    if (hint) hint.style.display = editMode ? 'none' : 'block';
}

/**
 * Mở form câu đơn. Trước đây là popup, giờ là TAB DỌC riêng — nên hàm này
 * chuyển tab rồi mới nạp dữ liệu. Giữ nguyên tên vì nhiều nơi đang gọi
 * (nút "+ Câu đơn", nút Sửa ở bảng câu hỏi).
 */
function openQuestionModal(questionId = null) {
    document.querySelector('.sidebar-link[data-main-tab="toeic-single"]')?.click();
    fillQuestionForm(questionId);
}

/** "Xoá trắng": về lại chế độ thêm mới thay vì đóng popup như trước. */
function closeQuestionModal() {
    fillQuestionForm(null);
}

/** Xoá trắng riêng ô JSON — ở lại tab JSON, không nhảy về tab Nhập tay. */
function clearQuestionJson() {
    const input = document.getElementById('question-json-input');
    const result = document.getElementById('question-json-result');
    if (input) input.value = '';
    if (result) result.style.display = 'none';
}

function fillQuestionForm(questionId = null) {
    const form = document.getElementById('question-form');
    const title = document.getElementById('question-modal-title');
    const audioPreview = document.getElementById('audio-preview');
    const previewAudio = document.getElementById('preview-audio');

    form.reset();
    document.getElementById('question-id').value = '';
    audioPreview.style.display = 'none';
    previewAudio.src = '';
    currentImageUrls = [];
    setPartOptionsMode(!!questionId);

    if (questionId) {
        title.textContent = 'Sửa câu đơn';
        const question = currentQuestions.find(q => q._id === questionId);
        if (question) {
            // `question` giờ là một MÀN. Ngữ cảnh (ảnh/audio/source) ở cấp màn,
            // còn đề bài/đáp án nằm trong questions[]. Form đơn sửa CÂU ĐẦU.
            const sub = question.questions?.[0] || {};

            document.getElementById('question-id').value = question._id;
            document.getElementById('question-part').value = question.part;
            document.getElementById('question-text').value = sub.questionText || '';
            currentImageUrls = Array.isArray(question.imageUrls) ? [...question.imageUrls] : [];
            document.getElementById('question-audio-url').value = question.audioUrl || '';
            const expVal = typeof sub.explanation === 'object'
                ? JSON.stringify(sub.explanation, null, 2)
                : (sub.explanation || '');
            document.getElementById('question-explanation').value = expVal;
            document.getElementById('question-passage-count').value = question.passageCount || '';
            const numEl = document.getElementById('question-number');
            if (numEl) numEl.value = sub.number ?? '';
            const srcEl = document.getElementById('question-source');
            if (srcEl) srcEl.value = question.source || '';
            document.getElementById('question-audio-translate').value = question.audioTranslate || '';
            document.getElementById('question-text-translate').value = sub.questionTranslate || '';

            if (question.audioUrl) {
                previewAudio.src = question.audioUrl;
                audioPreview.style.display = 'block';
            }

            // Màn nhiều câu không sửa được bằng form đơn — báo rõ thay vì sửa nhầm.
            if ((question.questions?.length || 0) > 1) {
                alert(`Màn này có ${question.questions.length} câu (Part ${question.part}).
` +
                      'Form câu đơn chỉ sửa được câu đầu. Hãy xoá rồi tạo lại ở tab "Tạo nhóm câu".');
            }

            (sub.options || []).forEach((opt, idx) => {
                const label = String.fromCharCode(65 + idx);
                document.getElementById(`option-${label}`).value = opt.text;
                if (opt.label === sub.correctAnswer) {
                    document.getElementById(`correct-${label}`).checked = true;
                }
            });

            updatePartVisibility();
        }
    } else {
        title.textContent = 'Thêm câu đơn (Part 1·2·5)';
        // Chỉ nhớ lại Part nếu là câu đơn (1/2/5); Part nhóm cũ thì mặc định về Part 1.
        const def = [1, 2, 5].includes(lastSelectedPart) ? lastSelectedPart : 1;
        document.getElementById('question-part').value = def;
        updatePartVisibility();
    }

    renderImageList();

    // Reset về tab "Nhập tay" mỗi lần mở; xoá JSON cũ
    const qJsonInput = document.getElementById('question-json-input');
    const qJsonResult = document.getElementById('question-json-result');
    if (qJsonInput) qJsonInput.value = '';
    if (qJsonResult) qJsonResult.style.display = 'none';
    switchQuestionModalTab('manual');
}

// ===================================
// QUESTION MODAL — JSON IMPORT + COPY PROMPT
// ===================================

function switchQuestionModalTab(tab) {
    const manualForm = document.getElementById('question-form');
    const jsonPanel  = document.getElementById('question-json-panel');
    const tabManual  = document.getElementById('q-tab-manual');
    const tabJson    = document.getElementById('q-tab-json');
    if (!manualForm || !jsonPanel || !tabManual || !tabJson) return;

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
}

// Quy tắc chung + chỗ dán, nối vào cuối mỗi prompt riêng của từng Part.
const _Q_FOOTER = `

=== QUY TẮC CHUNG ===
- Trả về DUY NHẤT một mảng JSON hợp lệ [ ... ], KHÔNG markdown, KHÔNG bọc trong khối code, KHÔNG giải thích thừa.
- Mỗi phần tử của mảng là MỘT MÀN HỎI. Part 1/2/5: "questions" có ĐÚNG 1 phần tử. Part 3/4/6/7: nhiều phần tử dùng chung ngữ cảnh.
- Ngữ cảnh chung (audioUrl / imageUrls / passageCount) đặt ở CẤP MÀN, KHÔNG lặp vào từng câu.
- "number" = SỐ CÂU thật theo chuẩn TOEIC: P1 1-6 · P2 7-31 · P3 32-70 · P4 71-100 · P5 101-130 · P6 131-146 · P7 147-200.
- "source" = MÃ ĐỀ (vd official_2024) — hệ thống gom màn thành đề thi THEO "source"; cùng một đề phải CÙNG "source".
- "correctAnswer" phải khớp đúng 1 "label" trong "options". "explanation" viết tiếng Việt, giữ nguyên tiếng Anh ở questionText/options.

Nội dung câu hỏi của tôi:
<<< DÁN NỘI DUNG CÂU HỎI CỦA BẠN VÀO ĐÂY >>>`;

// Khung dữ liệu chung: 1 phần tử của mảng = 1 MÀN HỎI.
const _SET_SHAPE = `{
  "part": <số>,
  "source": "<mã đề — BẮT BUỘC>",
  "audioUrl": "<mp3 — chỉ Part 1-4; để trống nếu admin tự upload>",
  "imageUrls": ["<ảnh — để [] nếu admin tự upload>"],
  "questions": [
    { "number": <số câu>, "questionText": "<câu hỏi>",
      "options": [{"label":"A","text":"..."}, {"label":"B","text":"..."}, {"label":"C","text":"..."}, {"label":"D","text":"..."}],
      "correctAnswer": "A|B|C|D",
      "explanation": { "A": "...", "B": "...", "C": "...", "D": "..." } }
  ]
}`;

const PART_PROMPTS = {
    '1': `Bạn là trợ lý tạo câu hỏi TOEIC PART 1 (Mô tả tranh). Mỗi câu là MỘT MÀN có đúng 1 câu:
${_SET_SHAPE}
=== LƯU Ý PART 1 (câu 1-6) ===
- KHÔNG có "questionText" — 4 đáp án là 4 câu mô tả tranh.
- Mỗi màn: đúng 1 ảnh trong "imageUrls" + 1 "audioUrl".
=== VÍ DỤ ===
[
  { "part": 1, "source": "ets26t1",
    "imageUrls": ["/assets/images/ets26t1/ets26t1-01.png"],
    "audioUrl": "/assets/audio/ets26t1/ets26t1-01.mp3",
    "questions": [ { "number": 1,
      "options": [{"label":"A","text":"The man is reading a newspaper."},{"label":"B","text":"The man is typing on a laptop."},{"label":"C","text":"The man is talking on the phone."},{"label":"D","text":"The man is drinking coffee."}],
      "correctAnswer": "B",
      "explanation": { "A": "❌ Không cầm báo.", "B": "✅ Đúng: đang gõ laptop.", "C": "❌ Không gọi điện.", "D": "❌ Không uống cà phê." } } ] }
]` + _Q_FOOTER,

    '2': `Bạn là trợ lý tạo câu hỏi TOEIC PART 2 (Hỏi & đáp). Mỗi câu là MỘT MÀN có đúng 1 câu:
${_SET_SHAPE}
=== LƯU Ý PART 2 (câu 7-31) ===
- CHỈ 3 đáp án A/B/C — KHÔNG có D. Không ảnh.
- "questionText" = câu được nói (tùy chọn). Mỗi màn 1 "audioUrl".
=== VÍ DỤ ===
[
  { "part": 2, "source": "ets26t1", "audioUrl": "/assets/audio/ets26t1/ets26t1-07.mp3",
    "questions": [ { "number": 7, "questionText": "Where can I find the meeting room?",
      "options": [{"label":"A","text":"It's on the third floor."},{"label":"B","text":"The meeting was great."},{"label":"C","text":"At 10 a.m."}],
      "correctAnswer": "A",
      "explanation": { "A": "✅ Đúng: trả lời nơi chốn.", "B": "❌ Lạc đề.", "C": "❌ Trả lời thời gian." } } ] }
]` + _Q_FOOTER,

    '3': `Bạn là trợ lý tạo câu hỏi TOEIC PART 3 (Hội thoại). MỘT MÀN = 1 đoạn hội thoại + nhiều câu:
${_SET_SHAPE}
=== LƯU Ý PART 3 (câu 32-70 — thường 3 câu/đoạn) ===
- "audioUrl" đặt ở CẤP MÀN (dùng chung cho mọi câu), tên theo dải số: nhóm 32-34 → ets26t1-32-34.mp3.
- "imageUrls" LUÔN để rỗng []. TUYỆT ĐỐI KHÔNG tự bịa đường dẫn ảnh — Part 3 nghe là chính; nếu đoạn có biểu đồ/bảng thì admin tự upload ở tab "Trình dựng".
=== VÍ DỤ (màn 2 câu) ===
[
  { "part": 3, "source": "ets26t1", "audioUrl": "/assets/audio/ets26t1/ets26t1-32-34.mp3", "imageUrls": [],
    "questions": [
      { "number": 32, "questionText": "What is the man doing?",
        "options": [{"label":"A","text":"Finishing a report"},{"label":"B","text":"Checking some figures"},{"label":"C","text":"Sending an email"},{"label":"D","text":"Attending a meeting"}],
        "correctAnswer": "B",
        "explanation": { "A": "❌ Chưa xong.", "B": "✅ Đúng: cần kiểm tra số liệu.", "C": "❌ Không đề cập.", "D": "❌ Không đề cập." } },
      { "number": 33, "questionText": "When does the manager want the report?",
        "options": [{"label":"A","text":"By noon"},{"label":"B","text":"By 3 PM"},{"label":"C","text":"Tomorrow"},{"label":"D","text":"Next week"}],
        "correctAnswer": "A",
        "explanation": { "A": "✅ Đúng: wants it by noon.", "B": "❌ Sai.", "C": "❌ Sai.", "D": "❌ Sai." } } ] }
]` + _Q_FOOTER,

    '4': `Bạn là trợ lý tạo câu hỏi TOEIC PART 4 (Bài nói). MỘT MÀN = 1 bài nói + nhiều câu:
${_SET_SHAPE}
=== LƯU Ý PART 4 (câu 71-100 — thường 3 câu/bài) ===
- "audioUrl" ở CẤP MÀN, tên theo dải số: nhóm 71-73 → ets26t1-71-73.mp3.
- "imageUrls" LUÔN để rỗng []. TUYỆT ĐỐI KHÔNG tự bịa đường dẫn ảnh — Part 4 nghe là chính; nếu bài có biểu đồ/bảng thì admin tự upload ở tab "Trình dựng".
=== VÍ DỤ (màn 2 câu) ===
[
  { "part": 4, "source": "ets26t1", "audioUrl": "/assets/audio/ets26t1/ets26t1-71-73.mp3", "imageUrls": [],
    "questions": [
      { "number": 71, "questionText": "What is the announcement about?",
        "options": [{"label":"A","text":"A store closing soon"},{"label":"B","text":"A sale event"},{"label":"C","text":"A lost item"},{"label":"D","text":"A new product"}],
        "correctAnswer": "A",
        "explanation": { "A": "✅ Đúng: cửa hàng sắp đóng cửa.", "B": "❌ Sai.", "C": "❌ Sai.", "D": "❌ Sai." } },
      { "number": 72, "questionText": "What are listeners asked to do?",
        "options": [{"label":"A","text":"Go to the checkout"},{"label":"B","text":"Leave immediately"},{"label":"C","text":"Call a manager"},{"label":"D","text":"Wait outside"}],
        "correctAnswer": "A",
        "explanation": { "A": "✅ Đúng: bring items to the checkout.", "B": "❌ Sai.", "C": "❌ Sai.", "D": "❌ Sai." } } ] }
]` + _Q_FOOTER,

    '5': `Bạn là trợ lý tạo câu hỏi TOEIC PART 5 (Hoàn thành câu). Mỗi câu là MỘT MÀN có đúng 1 câu:
${_SET_SHAPE}
=== LƯU Ý PART 5 (câu 101-130) ===
- KHÔNG audio/ảnh. "questionText" là câu có chỗ trống _____.
=== VÍ DỤ ===
[
  { "part": 5, "source": "ets26t1",
    "questions": [ { "number": 101, "questionText": "The new policy will _____ next month.",
      "options": [{"label":"A","text":"take effect"},{"label":"B","text":"took effect"},{"label":"C","text":"taking effect"},{"label":"D","text":"effected"}],
      "correctAnswer": "A",
      "explanation": { "A": "✅ Đúng: will + V nguyên thể.", "B": "❌ Quá khứ.", "C": "❌ V-ing.", "D": "❌ Sai nghĩa." } } ] }
]` + _Q_FOOTER,

    '6': `Bạn là trợ lý tạo câu hỏi TOEIC PART 6 (Hoàn thành đoạn). MỘT MÀN = 1 đoạn văn + 4 chỗ trống:
${_SET_SHAPE}
=== LƯU Ý PART 6 (câu 131-146 — 4 câu/đoạn) ===
- Đoạn văn dùng ẢNH scan ở CẤP MÀN (đúng 1 ảnh), tên theo dải số: 131-134 → ets26t1-131-134.png.
- KHÔNG có "questionText" (giống Part 1) — mỗi câu chỉ là 1 chỗ trống với 4 đáp án; thứ tự chỗ trống theo "number".
=== VÍ DỤ (màn 2 câu) ===
[
  { "part": 6, "source": "ets26t1", "imageUrls": ["/assets/images/ets26t1/ets26t1-131-134.png"],
    "questions": [
      { "number": 131,
        "options": [{"label":"A","text":"arrive"},{"label":"B","text":"arrives"},{"label":"C","text":"arrived"},{"label":"D","text":"arriving"}],
        "correctAnswer": "A",
        "explanation": { "A": "✅ Đúng: will + V nguyên thể.", "B": "❌ Sai chia.", "C": "❌ Quá khứ.", "D": "❌ V-ing." } },
      { "number": 132,
        "options": [{"label":"A","text":"contact"},{"label":"B","text":"contacts"},{"label":"C","text":"contacted"},{"label":"D","text":"contacting"}],
        "correctAnswer": "A",
        "explanation": { "A": "✅ Đúng: please + V nguyên thể.", "B": "❌ Sai.", "C": "❌ Sai.", "D": "❌ Sai." } } ] }
]` + _Q_FOOTER,

    '7': `Bạn là trợ lý tạo câu hỏi TOEIC PART 7 (Đọc hiểu). MỘT MÀN = 1-3 đoạn đọc + nhiều câu:
${_SET_SHAPE}
=== LƯU Ý PART 7 (câu 147-200) ===
- Thêm "passageCount": 1 | 2 | 3 ở CẤP MÀN. SỐ ẢNH trong "imageUrls" = passageCount (tối đa 3).
- Đọc bằng ẢNH scan — KHÔNG gõ đoạn văn dạng text.
=== VÍ DỤ ===
[
  { "part": 7, "source": "ets26t1", "passageCount": 1,
    "imageUrls": ["/assets/images/ets26t1/ets26t1-147-148.png"],
    "questions": [ { "number": 147, "questionText": "Why will the library be closed?",
      "options": [{"label":"A","text":"For a holiday"},{"label":"B","text":"For repairs"},{"label":"C","text":"For an event"},{"label":"D","text":"For cleaning"}],
      "correctAnswer": "A",
      "explanation": { "A": "✅ Đúng: closed for the national holiday.", "B": "❌ Không đề cập.", "C": "❌ Không đề cập.", "D": "❌ Không đề cập." } } ] }
]` + _Q_FOOTER,

    // Prompt tổng: dùng khi không chốt trước Part. Nằm chung PART_PROMPTS để
    // admin sửa/khôi phục nó y hệt prompt của từng Part.
    'all': `Bạn là trợ lý tạo câu hỏi TOEIC. Chuyển nội dung tôi cung cấp thành MẢNG JSON,
mỗi phần tử là MỘT MÀN HỎI đúng khung sau:
${_SET_SHAPE}
=== SỐ CÂU & SỐ CÂU MỖI MÀN THEO PART ===
- Part 1 (1-6): 1 câu/màn · 1 ảnh + 1 audio · KHÔNG có "questionText"
- Part 2 (7-31): 1 câu/màn · 1 audio · CHỈ 3 đáp án A/B/C
- Part 3 (32-70): ~3 câu/màn · audio chung ở cấp màn · "imageUrls" LUÔN [] (không bịa đường dẫn ảnh)
- Part 4 (71-100): ~3 câu/màn · audio chung ở cấp màn · "imageUrls" LUÔN [] (không bịa đường dẫn ảnh)
- Part 5 (101-130): 1 câu/màn · không audio/ảnh
- Part 6 (131-146): 4 câu/màn · 1 ảnh đoạn văn · KHÔNG có "questionText"
- Part 7 (147-200): nhiều câu/màn · thêm "passageCount" 1-3, số ảnh = passageCount` + _Q_FOOTER,
};

// Nhãn hiển thị trong ô chọn prompt.
const PROMPT_KEY_LABELS = {
    '1': 'Part 1 — Mô tả tranh',
    '2': 'Part 2 — Hỏi & đáp',
    '3': 'Part 3 — Hội thoại',
    '4': 'Part 4 — Bài nói',
    '5': 'Part 5 — Hoàn thành câu',
    '6': 'Part 6 — Hoàn thành đoạn',
    '7': 'Part 7 — Đọc hiểu',
    'all': 'Tất cả Part (prompt tổng)',
};

// Trích phần "=== VÍ DỤ === [...]" trong prompt của 1 Part để làm placeholder ô JSON.
let _defaultJsonPlaceholder = null;
function partExampleJson(part) {
    const prompt = PART_PROMPTS[part];
    if (!prompt) return null;
    const m = prompt.match(/=== VÍ DỤ[^=]*===\s*([\s\S]*?)\s*\n\n=== QUY TẮC CHUNG/);
    return m ? m[1].trim() : null;
}

// Đổi placeholder ô nhập JSON theo Part đang chọn (Tất cả → mẫu mặc định nhiều part).
function updateQuestionJsonPlaceholder() {
    const ta = document.getElementById('question-json-input');
    const sel = document.getElementById('q-prompt-part');
    if (!ta || !sel) return;
    if (_defaultJsonPlaceholder === null) _defaultJsonPlaceholder = ta.placeholder;
    const ex = sel.value === 'all' ? null : partExampleJson(sel.value);
    ta.placeholder = ex || _defaultJsonPlaceholder;
}

// Bản GHI ĐÈ prompt do admin sửa (nạp từ DB). Rỗng = đang dùng mặc định trong code.
let PROMPT_OVERRIDES = {};

async function loadPromptOverrides() {
    try {
        const res = await fetch(`${TOEIC_API_BASE}/prompts`, {
            headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (data.success) PROMPT_OVERRIDES = data.data || {};
    } catch (e) {
        console.error('Không tải được prompt đã sửa:', e);
    }
    return PROMPT_OVERRIDES;
}

/** Prompt đang có hiệu lực cho một key: bản admin sửa, không có thì lấy mặc định. */
function getEffectivePrompt(key) {
    return PROMPT_OVERRIDES[key] || PART_PROMPTS[key] || '';
}

/** Prompt gốc trong code — dùng cho nút "Khôi phục mặc định". */
function getDefaultPrompt(key) {
    return PART_PROMPTS[key] || '';
}

async function savePromptOverride(key, content) {
    const res = await fetch(`${TOEIC_API_BASE}/prompts/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Lưu prompt lỗi');
    PROMPT_OVERRIDES[key] = content;
    return data;
}

async function resetPromptOverride(key) {
    const res = await fetch(`${TOEIC_API_BASE}/prompts/${key}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Khôi phục lỗi');
    delete PROMPT_OVERRIDES[key];
    return data;
}

// Chỉ gọi API prompts MỘT lần cho cả hai tab (cùng dùng chung PROMPT_OVERRIDES).
let _promptsLoading = null;
function ensurePromptsLoaded() {
    if (!_promptsLoading) _promptsLoading = loadPromptOverrides();
    return _promptsLoading;
}

// ===================================
// TRÌNH SOẠN PROMPT (dùng chung cho tab Câu đơn và tab Nhóm câu)
// prefix = 'single' | 'group' → id: {prefix}-prompt-key/-text/-save/-reset/-copy/-status
// ===================================

function _promptEl(prefix, name) {
    return document.getElementById(`${prefix}-prompt-${name}`);
}

/** Đổ prompt đang có hiệu lực của key đang chọn vào ô soạn thảo. */
function refreshPromptEditor(prefix) {
    const sel = _promptEl(prefix, 'key');
    const ta = _promptEl(prefix, 'text');
    const status = _promptEl(prefix, 'status');
    if (!sel || !ta) return;

    const key = sel.value;
    ta.value = getEffectivePrompt(key);
    if (!status) return;

    const edited = Object.prototype.hasOwnProperty.call(PROMPT_OVERRIDES, key);
    status.innerHTML = edited
        ? '<i class="fas fa-pen-to-square" style="color:#f59e0b"></i> Đang dùng <strong>bản đã sửa</strong> (lưu trong DB). Bấm “Về mặc định” để xoá bản sửa.'
        : '<i class="fas fa-box" style="color:#10b981"></i> Đang dùng <strong>bản mặc định</strong> trong code. Sửa rồi bấm “Lưu” để ghi đè.';
}

function initPromptEditor(prefix, keys) {
    const sel = _promptEl(prefix, 'key');
    const ta = _promptEl(prefix, 'text');
    if (!sel || !ta || sel.dataset.bound) return;
    sel.dataset.bound = '1';

    sel.innerHTML = keys
        .map(k => `<option value="${k}">${PROMPT_KEY_LABELS[k] || `Part ${k}`}</option>`)
        .join('');

    // Đổi Part khi đang sửa dở → hỏi trước, tránh mất công gõ.
    sel.addEventListener('change', () => {
        if (ta.dataset.dirty === '1' && !confirm('Prompt đang sửa chưa lưu sẽ mất. Vẫn đổi Part?')) {
            sel.value = sel.dataset.lastKey;
            return;
        }
        ta.dataset.dirty = '';
        sel.dataset.lastKey = sel.value;
        refreshPromptEditor(prefix);
    });
    ta.addEventListener('input', () => { ta.dataset.dirty = '1'; });

    _promptEl(prefix, 'save')?.addEventListener('click', async () => {
        const key = sel.value;
        try {
            await savePromptOverride(key, ta.value);
            ta.dataset.dirty = '';
            refreshPromptEditor(prefix);
            showToast(`Đã lưu prompt ${PROMPT_KEY_LABELS[key] || key}`, 'success');
        } catch (e) {
            showToast(`Lưu prompt lỗi: ${e.message}`, 'error');
        }
    });

    _promptEl(prefix, 'reset')?.addEventListener('click', async () => {
        const key = sel.value;
        if (!Object.prototype.hasOwnProperty.call(PROMPT_OVERRIDES, key)) {
            showToast('Prompt này đang là bản mặc định rồi', 'info');
            return;
        }
        if (!confirm(`Xoá bản sửa của "${PROMPT_KEY_LABELS[key] || key}" và quay về mặc định?`)) return;
        try {
            await resetPromptOverride(key);
            ta.dataset.dirty = '';
            refreshPromptEditor(prefix);
            showToast('Đã khôi phục prompt mặc định', 'success');
        } catch (e) {
            showToast(`Khôi phục lỗi: ${e.message}`, 'error');
        }
    });

    _promptEl(prefix, 'copy')?.addEventListener('click', () => {
        navigator.clipboard?.writeText(ta.value)
            .then(() => showToast('Đã copy prompt', 'success'))
            .catch(() => showToast('Không copy được, hãy bôi đen và copy tay', 'error'));
    });

    sel.dataset.lastKey = sel.value;
    refreshPromptEditor(prefix);
}

// ===================================
// TAB "TẠO CÂU ĐƠN" (Part 1·2·5)
// ===================================

let _singleTabInited = false;
async function initToeicSingleTab() {
    // Gợi ý mã đề luôn mới (admin có thể vừa tạo đề ở tab khác).
    if (typeof loadTestSourceOptions === 'function') loadTestSourceOptions();
    if (_singleTabInited) return;
    _singleTabInited = true;

    // Form trống lần đầu vào tab; các lần sau giữ nguyên để không mất công gõ.
    fillQuestionForm(null);
    await ensurePromptsLoaded();
    initPromptEditor('single', ['1', '2', '5', 'all']);
}
window.initToeicSingleTab = initToeicSingleTab;

function copyQuestionPrompt(forcedPart, forcedSource) {
    // forcedPart/forcedSource: modal NHÓM truyền Part + mã đề đang chọn để prompt sát hơn.
    const partSel = document.getElementById('q-prompt-part');
    const part = (forcedPart && typeof forcedPart === 'string') ? forcedPart : (partSel ? partSel.value : 'all');
    // Chọn 1 Part cụ thể → prompt RIÊNG, gọn. Không chọn → prompt tổng.
    // Ưu tiên bản admin đã sửa; chưa sửa thì dùng mặc định trong code.
    let prompt = getEffectivePrompt(part) || getEffectivePrompt('all');

    // Có Source → ép AI dùng đúng mã đề cho MỌI câu (khỏi gõ lệch source).
    const src = (typeof forcedSource === 'string') ? forcedSource.trim() : '';
    if (src) {
        prompt = prompt.replace(
            'Nội dung câu hỏi của tôi:',
            `BẮT BUỘC: mọi câu dùng "source": "${src}".\n\nNội dung câu hỏi của tôi:`
        );
    }

    const done = () => showToast('Đã copy prompt — dán vào ChatGPT/AI rồi lấy JSON về', 'success');
    const fail = () => showToast('Không copy được, hãy chọn và copy thủ công', 'error');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(prompt).then(done).catch(fail);
    } else {
        const ta = document.createElement('textarea');
        ta.value = prompt;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { fail(); }
        document.body.removeChild(ta);
    }
}

// Kiểm tra ĐỊNH DẠNG một MÀN HỎI import. Trả mảng lỗi (rỗng nếu hợp lệ).
function validateImportedQuestion(set, i) {
    const n = `Màn #${i + 1}`;
    const errs = [];
    if (!set || typeof set !== 'object' || Array.isArray(set)) return [`${n}: phải là một object JSON`];

    const part = parseInt(set.part);
    if (!part || part < 1 || part > 7) return [`${n}: thiếu/sai "part" (số 1-7)`];
    if (!set.source || !String(set.source).trim()) errs.push(`${n}: thiếu "source" (mã đề — bắt buộc)`);

    if (!Array.isArray(set.questions) || !set.questions.length) {
        return [...errs, `${n}: thiếu "questions" (mảng câu hỏi của màn)`];
    }
    // Part câu đơn chỉ được 1 câu/màn; Part nhóm cần từ 2 câu trở lên.
    const grouped = [3, 4, 6, 7].includes(part);
    if (!grouped && set.questions.length !== 1) {
        errs.push(`${n}: Part ${part} là câu đơn — mỗi màn đúng 1 câu (đang có ${set.questions.length})`);
    }

    // Dải số câu chuẩn TOEIC, để bắt sớm số sai thay vì lưu rồi mới lệch.
    const RANGE = { 1: [1, 6], 2: [7, 31], 3: [32, 70], 4: [71, 100], 5: [101, 130], 6: [131, 146], 7: [147, 200] };
    const [lo, hi] = RANGE[part];

    set.questions.forEach((q, k) => {
        const qn = `${n} câu ${k + 1}`;
        const num = Number(q?.number);
        if (!Number.isFinite(num)) errs.push(`${qn}: thiếu "number" (số câu)`);
        else if (num < lo || num > hi) errs.push(`${qn}: "number" ${num} ngoài dải Part ${part} (${lo}-${hi})`);

        const opts = Array.isArray(q?.options) ? q.options : null;
        if (!opts) { errs.push(`${qn}: thiếu "options"`); return; }
        const withText = opts
            .map((o, idx) => ({ label: (o && o.label) || String.fromCharCode(65 + idx), text: String(o?.text ?? '').trim() }))
            .filter(o => o.text);
        const expected = part === 2 ? 3 : 4;
        if (withText.length !== expected) errs.push(`${qn}: Part ${part} cần đúng ${expected} đáp án (đang có ${withText.length})`);
        if (!q.correctAnswer || !/^[A-D]$/.test(String(q.correctAnswer))) {
            errs.push(`${qn}: "correctAnswer" phải là A/B/C/D`);
        } else if (!withText.some(o => o.label === q.correctAnswer)) {
            errs.push(`${qn}: "correctAnswer" (${q.correctAnswer}) không khớp đáp án nào`);
        }
        // Part 1 và 6 không có câu hỏi riêng (chỉ tranh / chỗ trống + đáp án).
        if ([3, 4, 7].includes(part) && !String(q?.questionText || '').trim()) {
            errs.push(`${qn}: Part ${part} cần "questionText"`);
        }
    });

    if (set.imageUrls != null && !Array.isArray(set.imageUrls)) errs.push(`${n}: "imageUrls" phải là mảng`);
    if (set.audioUrl != null && typeof set.audioUrl !== 'string') errs.push(`${n}: "audioUrl" phải là chuỗi`);
    return errs;
}

/**
 * Tự vá dấu " lọt giữa chuỗi mà AI hay quên escape.
 * VD: "...she says, "it's cold"?" → "...she says, \"it's cold\"?"
 * Cách phân biệt: một dấu " ĐANG TRONG chuỗi là ĐÓNG chuỗi nếu ký tự kế tiếp
 * (bỏ khoảng trắng) là , } ] : hoặc hết chuỗi; ngược lại là dấu lọt → escape.
 */
function sanitizeStrayQuotes(src) {
    let out = '', inStr = false, esc = false;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (!inStr) { out += ch; if (ch === '"') inStr = true; continue; }
        if (esc) { out += ch; esc = false; continue; }
        if (ch === '\\') { out += ch; esc = true; continue; }
        if (ch === '"') {
            let j = i + 1;
            while (j < src.length && /\s/.test(src[j])) j++;
            const nxt = src[j];
            if (nxt === undefined || nxt === ',' || nxt === '}' || nxt === ']' || nxt === ':') {
                out += '"'; inStr = false;   // đóng chuỗi thật
            } else {
                out += '\\"';                // dấu " lọt → escape
            }
            continue;
        }
        out += ch;
    }
    return out;
}

async function submitQuestionJsonImport(inputId = 'question-json-input', resultId = 'question-json-result', btnId = 'btn-submit-q-json') {
    // inputId/resultId/btnId cho phép dùng lại cho tab JSON của modal NHÓM.
    const raw = document.getElementById(inputId).value.trim();
    const resultDiv = document.getElementById(resultId);
    if (!raw) { showToast('Vui lòng nhập JSON', 'error'); return; }

    let sets, autofixed = false;
    try {
        const parsed = JSON.parse(raw);
        sets = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e1) {
        // Parse hỏng → thử tự escape các dấu " lọt rồi parse lại.
        try {
            const parsed = JSON.parse(sanitizeStrayQuotes(raw));
            sets = Array.isArray(parsed) ? parsed : [parsed];
            autofixed = true;
        } catch (e2) {
            showToast('JSON không hợp lệ: ' + e1.message, 'error');
            return;
        }
    }
    if (autofixed) showToast('Đã tự sửa dấu " lọt trong JSON', 'info');
    if (!sets.length) { showToast('Không có màn hỏi nào trong JSON', 'error'); return; }

    // PRE-VALIDATE TOÀN BỘ — sai định dạng thì KHÔNG lưu gì cả (import nguyên khối).
    const preErrors = [];
    sets.forEach((s, i) => { preErrors.push(...validateImportedQuestion(s, i)); });
    if (preErrors.length) {
        resultDiv.style.display = 'block';
        resultDiv.style.background = '#fef2f2';
        resultDiv.style.border = '1px solid #fca5a5';
        resultDiv.style.color = '#1f2937';
        resultDiv.innerHTML = `
            <b>❌ Không lưu — JSON sai định dạng (${preErrors.length} lỗi)</b>
            <ul style="margin:8px 0 0;padding-left:18px;color:#dc2626">${preErrors.map(e => `<li>${e}</li>`).join('')}</ul>
        `;
        showToast('JSON sai định dạng — đã hủy import (không lưu màn nào)', 'error');
        return;
    }

    const btn = document.getElementById(btnId);
    btn.disabled = true;
    btn.textContent = 'Đang import...';
    resultDiv.style.display = 'none';

    let ok = 0;
    let savedQuestions = 0;
    const errors = [];
    const skipped = []; // màn bị bỏ qua vì TRÙNG (409) — không phải lỗi

    for (let i = 0; i < sets.length; i++) {
        const s = sets[i] || {};
        try {
            // Gửi nguyên hình dạng MÀN — server (buildSetPayload) nhận thẳng.
            const payload = {
                part: parseInt(s.part),
                source: String(s.source).trim(),
                audioUrl: s.audioUrl || undefined,
                audioText: s.audioText || undefined,
                imageUrls: Array.isArray(s.imageUrls) ? s.imageUrls.filter(Boolean) : [],
                passages: Array.isArray(s.passages) ? s.passages.filter(Boolean) : [],
                passageCount: s.passageCount || undefined,
                questions: s.questions.map(q => ({
                    number: Number(q.number),
                    questionText: q.questionText || undefined,
                    questionTranslate: q.questionTranslate || undefined,
                    options: (q.options || []).map((o, idx) => ({
                        label: o.label || String.fromCharCode(65 + idx),
                        text: String(o.text ?? '').trim(),
                    })).filter(o => o.text),
                    correctAnswer: q.correctAnswer,
                    explanation: q.explanation || {},
                })),
            };

            const res = await fetch(`${TOEIC_API_BASE}/questions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (res.status === 409) { skipped.push(`Màn #${i + 1}: ${data.message}`); continue; }
            if (!res.ok || !data.success) throw new Error(data.message || 'Server error');
            ok++;
            savedQuestions += payload.questions.length;
        } catch (e) {
            errors.push(`Màn #${i + 1}: ${e.message}`);
        }
    }

    btn.disabled = false;
    btn.textContent = 'Import JSON';

    const total = sets.length;
    const clean = errors.length === 0; // trùng (skipped) không tính là lỗi
    resultDiv.style.display = 'block';
    resultDiv.style.background = errors.length === total ? '#fef2f2' : clean ? '#f0fdf4' : '#fffbeb';
    resultDiv.style.border = `1px solid ${errors.length === total ? '#fca5a5' : clean ? '#86efac' : '#fcd34d'}`;
    resultDiv.style.color = '#1f2937';
    resultDiv.innerHTML = `
        <b>${total} màn</b> — ✅ ${ok} thêm mới (${savedQuestions} câu)`
        + (skipped.length ? ` · ⏭️ ${skipped.length} bỏ qua (trùng)` : '')
        + (errors.length ? ` · ❌ ${errors.length} lỗi` : '')
        + (skipped.length ? '<ul style="margin:8px 0 0;padding-left:18px;color:#b45309">' + skipped.map(e => `<li>${e}</li>`).join('') + '</ul>' : '')
        + (errors.length ? '<ul style="margin:8px 0 0;padding-left:18px;color:#dc2626">' + errors.map(e => `<li>${e}</li>`).join('') + '</ul>' : '');

    if (ok > 0 && typeof loadQuestions === 'function') loadQuestions();
    if (ok > 0) {
        const ta = document.getElementById(inputId);
        if (ta) ta.value = '';
    }
}

async function handleImageUpload(file) {
    const uploadStatus = document.getElementById('image-upload-status');
    const fileInput = document.getElementById('question-image-file');

    // Chặn vượt số ảnh tối đa của Part (vd Part 7 tối đa 3, Part 1 chỉ 1).
    const part = parseInt(document.getElementById('question-part').value);
    const max = IMAGE_RULES[part]?.max || 0;
    if (currentImageUrls.length >= max) {
        alert(max === 0
            ? `Part ${part} không dùng hình ảnh.`
            : `Part ${part} tối đa ${max} ảnh — hãy xóa bớt ảnh trước khi thêm.`);
        fileInput.value = '';
        return;
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        alert('Only image files (JPEG, PNG, GIF, WEBP) are allowed!');
        fileInput.value = '';
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB!');
        fileInput.value = '';
        return;
    }

    uploadStatus.style.display = 'block';

    try {
        const formData = new FormData();
        formData.append('image', file);

        // Gửi Source đang chọn → server lưu vào đúng thư mục bộ đề (thay vì đoán từ tên file).
        const src = encodeURIComponent(document.getElementById('question-source')?.value.trim() || '');
        const res = await fetch(`${TOEIC_API_BASE}/upload/part1-image?source=${src}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: formData
        });

        const data = await res.json();

        if (!data.success) throw new Error(data.message || 'Upload failed');

        // Thêm ảnh vào danh sách (hỗ trợ nhiều ảnh) thay vì ghi đè 1 ảnh duy nhất.
        currentImageUrls.push(data.imageUrl);
        renderImageList();
        uploadStatus.style.display = 'none';
        fileInput.value = ''; // cho phép chọn tiếp ảnh khác
    } catch (error) {
        console.error('Error uploading image:', error);
        alert('Failed to upload image: ' + error.message);
        uploadStatus.style.display = 'none';
        fileInput.value = '';
    }
}

async function handleAudioUpload(file) {
    const uploadStatus = document.getElementById('audio-upload-status');
    const audioPreview = document.getElementById('audio-preview');
    const previewAudio = document.getElementById('preview-audio');
    const hiddenUrlInput = document.getElementById('question-audio-url');
    const fileInput = document.getElementById('question-audio-file');

    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/aac', 'audio/x-m4a'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) {
        alert('Only audio files (MP3, WAV, OGG, M4A, AAC) are allowed!');
        fileInput.value = '';
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB!');
        fileInput.value = '';
        return;
    }

    audioPreview.style.display = 'none';
    uploadStatus.style.display = 'block';

    try {
        const formData = new FormData();
        formData.append('audio', file);

        // Gửi Source đang chọn → server lưu vào đúng thư mục bộ đề (thay vì đoán từ tên file).
        const src = encodeURIComponent(document.getElementById('question-source')?.value.trim() || '');
        const res = await fetch(`${TOEIC_API_BASE}/upload/audio?source=${src}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: formData
        });

        const data = await res.json();

        if (!data.success) throw new Error(data.message || 'Upload failed');

        hiddenUrlInput.value = data.audioUrl;
        previewAudio.src = data.audioUrl;
        uploadStatus.style.display = 'none';
        audioPreview.style.display = 'block';
    } catch (error) {
        console.error('Error uploading audio:', error);
        alert('Failed to upload audio: ' + error.message);
        uploadStatus.style.display = 'none';
        fileInput.value = '';
    }
}

async function handleQuestionSubmit(e) {
    e.preventDefault();

    const questionId = document.getElementById('question-id').value;
    const part = parseInt(document.getElementById('question-part').value);
    const questionText = document.getElementById('question-text').value.trim();
    const imageUrls = currentImageUrls.slice();   // nhiều ảnh (Part 1/3/4/6/7)
    const audioUrl = document.getElementById('question-audio-url').value.trim();
    const explanationRaw = document.getElementById('question-explanation').value.trim();
    const passageCountRaw = document.getElementById('question-passage-count').value;
    const audioTranslateRaw = document.getElementById('question-audio-translate').value.trim();
    const questionTranslateRaw = document.getElementById('question-text-translate').value.trim();
    const sourceRaw = document.getElementById('question-source')?.value.trim() || '';
    const numberRaw = document.getElementById('question-number')?.value.trim() || '';

    const correctAnswer = document.querySelector('input[name="correct-answer"]:checked')?.value;
    if (!correctAnswer) {
        alert('Please select the correct answer!');
        return;
    }

    const options = ['A', 'B', 'C', 'D'].map(label => ({
        label,
        text: document.getElementById(`option-${label}`).value.trim()
    })).filter(opt => opt.text);

    if (options.length < 3) {
        alert('Vui lòng điền vào ít nhất 3 đáp án!');
        return;
    }

    // Ảnh: bắt buộc/giới hạn theo Part (IMAGE_RULES). Phần Đọc (6/7) dùng ảnh scan.
    const rule = IMAGE_RULES[part];
    if (rule && rule.min > 0 && imageUrls.length < rule.min) {
        alert(`Part ${part} cần ít nhất ${rule.min} ảnh. Hãy chọn file (tự upload).`);
        return;
    }
    if (rule && imageUrls.length > rule.max) {
        alert(`Part ${part} tối đa ${rule.max} ảnh.`);
        return;
    }

    // Nghe (Part 2-4) phải có file audio thật (không còn nhập text audio).
    if (part >= 2 && part <= 4 && !audioUrl) {
        alert(`Part ${part} cần file audio! Hãy chọn file audio (tự upload).`);
        return;
    }

    const questionData = { part, correctAnswer, options };

    if (questionText && part >= 2) questionData.questionText = questionText;
    // Luôn gửi mảng ảnh (kể cả rỗng) để việc xóa bớt ảnh khi sửa được lưu lại.
    questionData.imageUrls = imageUrls;
    if (audioUrl) questionData.audioUrl = audioUrl;
    if (explanationRaw) {
        try { questionData.explanation = JSON.parse(explanationRaw); }
        catch { questionData.explanation = { note: explanationRaw }; }
    }
    if (passageCountRaw) questionData.passageCount = parseInt(passageCountRaw);
    if (audioTranslateRaw) questionData.audioTranslate = audioTranslateRaw;
    if (questionTranslateRaw) questionData.questionTranslate = questionTranslateRaw;
    if (sourceRaw) questionData.source = sourceRaw;
    // Để trống → server tự đánh theo chuẩn TOEIC của Part trong bộ đề đó.
    if (numberRaw) questionData.questionNumber = parseInt(numberRaw);

    try {
        const url = questionId ? `${TOEIC_API_BASE}/questions/${questionId}` : `${TOEIC_API_BASE}/questions`;
        const method = questionId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(questionData)
        });

        const data = await res.json();

        if (!data.success) throw new Error(data.message || 'Failed to save question');

        const isEditMode = !!questionId;

        if (isEditMode) {
            showToast('Đã lưu thay đổi câu hỏi', 'success');
            closeQuestionModal();
            // Sửa xong nhảy thẳng về bảng Câu hỏi TOEIC (đỡ tự chuyển tay).
            document.querySelector('.sidebar-link[data-main-tab="toeic-questions"]')?.click();
        } else {
            alert('✅ Question created successfully! Form is ready for next question.');

            lastSelectedPart = part;

            const form = document.getElementById('question-form');
            const currentPart = document.getElementById('question-part').value;

            form.reset();
            document.getElementById('question-part').value = currentPart;
            updatePartVisibility();

            // Dọn media để nhập câu tiếp theo.
            currentImageUrls = [];
            renderImageList();
            document.getElementById('audio-preview').style.display = 'none';
            document.getElementById('preview-audio').src = '';
            document.getElementById('question-audio-url').value = '';

            const firstInput = document.getElementById('question-text');
            if (firstInput && firstInput.offsetParent !== null) {
                firstInput.focus();
            } else {
                document.getElementById('option-A')?.focus();
            }

            loadQuestions();
        }
    } catch (error) {
        console.error('Error saving question:', error);
        alert('❌ Failed to save question: ' + error.message);
    }
}

async function deleteQuestion(questionId) {
    if (!confirm('Are you sure you want to delete this question?')) return;

    try {
        const res = await fetch(`${TOEIC_API_BASE}/questions/${questionId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const data = await res.json();

        if (!data.success) throw new Error(data.message || 'Failed to delete question');

        alert('✅ Question deleted successfully!');
        loadQuestions();
    } catch (error) {
        console.error('Error deleting question:', error);
        alert('❌ Failed to delete question: ' + error.message);
    }
}

async function deleteAllQuestions() {
    const confirmed1 = confirm('⚠️ WARNING: Bạn sắp xóa TẤT CẢ câu hỏi TOEIC!\n\nHành động này KHÔNG THỂ HOÀN TÁC!\n\nBạn có chắc chắn muốn tiếp tục?');
    if (!confirmed1) return;

    const typeConfirm = prompt('Để xác nhận xóa TẤT CẢ câu hỏi, vui lòng nhập chữ "DELETE ALL" (viết hoa):');
    if (typeConfirm !== 'DELETE ALL') {
        alert('❌ Xác nhận không đúng. Hủy thao tác xóa.');
        return;
    }

    try {
        const loadingMsg = document.createElement('div');
        loadingMsg.id = 'delete-all-loading';
        loadingMsg.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: white; padding: 30px; border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3); z-index: 10000; text-align: center;
        `;
        loadingMsg.innerHTML = `
            <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: #ff6b6b; margin-bottom: 20px;"></i>
            <h3 style="margin: 0; color: #333;">Đang xóa tất cả câu hỏi...</h3>
            <p style="color: #666; margin-top: 10px;">Vui lòng chờ, đừng tắt trang này.</p>
        `;
        document.body.appendChild(loadingMsg);

        const res = await fetch(`${TOEIC_API_BASE}/questions/delete-all`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' }
        });

        const data = await res.json();
        document.getElementById('delete-all-loading')?.remove();

        if (!data.success) throw new Error(data.message || 'Failed to delete all questions');

        alert(`✅ Đã xóa thành công ${data.deletedCount || 'tất cả'} câu hỏi TOEIC!`);
        loadQuestions();
    } catch (error) {
        document.getElementById('delete-all-loading')?.remove();
        console.error('Error deleting all questions:', error);
        alert('❌ Lỗi khi xóa câu hỏi: ' + error.message);
    }
}

function openAIGenerateModal() {
    const part = prompt('Enter Part number (1-7) to generate questions for:');
    if (!part || part < 1 || part > 7) {
        alert('Invalid part number. Must be between 1 and 7.');
        return;
    }

    const count = prompt('How many questions to generate? (1-50):', '5');
    if (!count || count < 1 || count > 50) {
        alert('Invalid count. Must be between 1 and 50.');
        return;
    }

    handleAIGenerate(parseInt(part), parseInt(count));
}

async function handleAIGenerate(part, count) {
    if (!confirm(`Generate ${count} AI questions for Part ${part}?\n\nThis will use OpenAI API and may take a moment.`)) return;

    try {
        const res = await fetch(`${TOEIC_API_BASE}/questions/ai-generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify({ part, count, autoSave: true })
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Server error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();

        if (!data.success) throw new Error(data.message || 'Failed to generate questions');

        alert(`✅ Successfully generated ${data.metadata.count} questions!\n\n` +
              `Part: ${data.metadata.part}\n` +
              `Auto-saved: ${data.metadata.autoSaved ? 'Yes' : 'No'}\n` +
              `Needs review: ${data.metadata.needsReview ? 'Yes (unpublished)' : 'No'}\n\n` +
              `Questions have been saved as UNPUBLISHED. Please review and publish them.`);

        loadQuestions();
    } catch (error) {
        console.error('AI Generation error:', error);
        alert('❌ Failed to generate questions: ' + error.message);
    }
}

/**
 * Sửa một màn: màn NHIỀU câu (hoặc Part nhóm) mở trình dựng nhóm để sửa cả
 * loạt một lượt; màn 1 câu mở form câu đơn. Trước đây mọi thứ đổ vào form đơn
 * nên màn nhiều câu chỉ sửa được câu đầu.
 */
window.editQuestion = (questionId) => {
    const set = currentQuestions.find(q => q._id === questionId);
    const isGroup = (set?.questions?.length || 0) > 1 || [3, 4, 6, 7].includes(Number(set?.part));
    if (isGroup && typeof openGroupModal === 'function') openGroupModal(questionId);
    else openQuestionModal(questionId);
};
window.deleteQuestion = deleteQuestion;

// Ba ô chọn nguồn — thứ tự chỉ để nhìn, backend tự bỏ trùng và bỏ rỗng.
const TEST_SOURCE_IDS = ['test-source-1', 'test-source-2', 'test-source-3'];

/** Nguồn đang chọn, đã bỏ rỗng và bỏ trùng (giữ thứ tự chọn). */
function getSelectedSources() {
    const out = [];
    for (const id of TEST_SOURCE_IDS) {
        const v = document.getElementById(id)?.value.trim();
        if (v && !out.includes(v)) out.push(v);
    }
    return out;
}

// Nói rõ đang trộn mấy nguồn — chọn 3 ô mà 2 ô trùng nhau thì dễ tưởng là 3.
function syncTestSourceSummary() {
    const el = document.getElementById('test-source-summary');
    if (!el) return;
    const list = getSelectedSources();
    if (!list.length) {
        el.style.color = 'var(--text-secondary)';
        el.textContent = 'Đang lấy: toàn bộ kho câu hỏi';
    } else {
        el.style.color = 'var(--primary-color, #e11d48)';
        el.textContent = `Đang trộn ${list.length} nguồn: ${list.join(' + ')}`;
    }
}

// Nạp danh sách nguồn (distinct từ câu hỏi) vào 3 ô chọn của modal đề thi VÀ
// datalist dùng chung — các ô nhập nguồn ở tab "Tạo câu đơn"/"Tạo nhóm câu"
// đều trỏ tới datalist#test-source-list này.
let _sourceLoadSeq = 0;

async function loadTestSourceOptions(selected = []) {
    const boxes = TEST_SOURCE_IDS.map(id => document.getElementById(id)).filter(Boolean);
    const dl = document.getElementById('test-source-list');
    if (!boxes.length && !dl) return;

    // Sửa đề gọi hàm này hai lần (mở modal → rỗng, rồi nạp nguồn của đề). Hai
    // fetch không đảm bảo thứ tự về, nên chỉ lượt GỌI SAU CÙNG được phép ghi
    // giá trị — không thì lượt rỗng về muộn sẽ xoá trắng nguồn vừa nạp.
    const seq = ++_sourceLoadSeq;
    try {
        const res = await fetch(`${TOEIC_API_BASE}/questions/sources`, {
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (!data.success) return;

        const esc = (s) => String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
        const list = data.data || [];
        if (dl) dl.innerHTML = list.map(s => `<option value="${esc(s)}"></option>`).join('');

        const opts = '<option value="">— không chọn —</option>'
            + list.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');

        if (seq !== _sourceLoadSeq) return; // đã có lượt gọi mới hơn
        boxes.forEach((box, i) => {
            box.innerHTML = opts;
            box.value = selected[i] || '';
            if (!box.dataset.bound) {
                box.dataset.bound = '1';
                box.addEventListener('change', syncTestSourceSummary);
            }
        });
        syncTestSourceSummary();
    } catch (e) {
        console.error('Không tải được danh sách nguồn:', e);
    }
}

// Ô giá xu chỉ có nghĩa với đề premium → ẩn khi đề đang miễn phí.
function syncTestCoinsField() {
    const free = document.getElementById('test-is-free');
    const field = document.getElementById('test-coins-field');
    if (!free || !field) return;
    field.style.display = free.checked ? 'none' : 'block';
    if (!free.dataset.bound) {
        free.dataset.bound = '1';
        free.addEventListener('change', syncTestCoinsField);
    }
}

function openTestModal(testId = null) {
    const modal = document.getElementById('test-modal');
    const form = document.getElementById('test-form');
    const modalTitle = modal.querySelector('h3');
    const submitBtn = form.querySelector('button[type="submit"]');

    form.reset();
    document.getElementById('test-name').value = '';
    document.getElementById('test-type').value = 'full-test';
    document.getElementById('test-duration').value = '120';
    document.getElementById('test-description').value = '';
    document.getElementById('test-level').value = 'intermediate';
    loadTestSourceOptions();
    document.getElementById('test-is-free').checked = true;
    document.getElementById('test-required-coins').value = '0';
    document.getElementById('test-required-level').value = '1';
    syncTestCoinsField();
    const defMode = document.querySelector('input[name="q-select-mode"][value="default"]');
    if (defMode) defMode.checked = true;

    modal.dataset.testId = testId || '';
    modal.dataset.editMode = testId ? 'true' : 'false';

    if (testId) {
        modalTitle.innerHTML = '<i class="fas fa-edit"></i> Chỉnh sửa đề thi';
        submitBtn.textContent = 'Cập nhật';
    } else {
        modalTitle.innerHTML = '<i class="fas fa-file-alt"></i> Tạo đề thi mới';
        submitBtn.textContent = 'Tạo đề thi';
    }

    modal.style.display = 'flex';

    const testTypeSelect = document.getElementById('test-type');

    const testTypeTimes = {
        'full-test': 120, 'mini-part1': 4, 'mini-part2': 10,
        'mini-part3': 17, 'mini-part4': 15, 'mini-part5': 12,
        'mini-part6': 8, 'mini-part7': 34,
    };

    // Replace listener by cloning node to avoid stacking listeners on reopen
    const freshSelect = testTypeSelect.cloneNode(true);
    testTypeSelect.parentNode.replaceChild(freshSelect, testTypeSelect);
    freshSelect.addEventListener('change', function () {
        syncTestTypeFields(this.value);
        const suggested = testTypeTimes[this.value];
        if (suggested) document.getElementById('test-duration').value = suggested;
    });

    syncTestTypeFields(freshSelect.value);
}

/**
 * Ẩn/hiện phần phụ thuộc loại đề. Full Test lấy đủ 7 part theo cấu hình cố định
 * nên không có gì để đảo — trước đây khối này vẫn hiện kèm chú thích "không áp
 * dụng Full Test", đọc xong vẫn không biết nó có tác dụng hay không.
 */
function syncTestTypeFields(testType) {
    const box = document.getElementById('q-select-mode-box');
    if (!box) return;
    const isFullTest = testType === 'full-test';
    box.style.display = isFullTest ? 'none' : 'block';
    if (isFullTest) {
        const def = document.querySelector('input[name="q-select-mode"][value="default"]');
        if (def) def.checked = true;
    }
}

function closeTestModal() {
    const modal = document.getElementById('test-modal');
    const form = document.getElementById('test-form');

    modal.style.display = 'none';
    form.reset();
    document.getElementById('test-name').value = '';
    document.getElementById('test-type').value = 'full-test';
    document.getElementById('test-duration').value = '';
    document.getElementById('test-description').value = '';
    document.getElementById('test-level').value = 'intermediate';
    const defMode = document.querySelector('input[name="q-select-mode"][value="default"]');
    if (defMode) defMode.checked = true;

    modal.dataset.testId = '';
    modal.dataset.editMode = 'false';
}

async function editTest(testId) {
    try {
        const res = await fetch(`${TOEIC_API_BASE}/tests/${testId}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const data = await res.json();

        if (!data.success) {
            alert('Failed to load test details: ' + data.message);
            return;
        }

        const test = data.data;

        if (test.isPublished) {
            alert('⚠️ Cannot Edit Published Test\n\nThis test is currently published. Please unpublish it first before making any changes.');
            return;
        }

        openTestModal(testId);

        document.getElementById('test-name').value = test.testName || '';
        document.getElementById('test-type').value = test.testType || '';
        document.getElementById('test-description').value = test.description || '';
        // Đề cũ chỉ có  (một nguồn) → coi như danh sách 1 phần tử.
        loadTestSourceOptions(test.sources && test.sources.length ? test.sources : (test.source ? [test.source] : []));
        document.getElementById('test-level').value = test.level || 'intermediate';
        document.getElementById('test-duration').value = Math.round(test.totalTime / 60) || '';
        document.getElementById('test-is-free').checked = test.isFree !== false;
        document.getElementById('test-required-coins').value = test.requiredCoins || 0;
        document.getElementById('test-required-level').value = test.requiredLevel || 1;
        syncTestCoinsField();

        // openTestModal đã set theo loại đề mặc định; gọi lại theo loại đề THẬT.
        syncTestTypeFields(test.testType);

        const mode = test.questionSelectMode || 'default';
        const modeRadio = document.querySelector(`input[name="q-select-mode"][value="${mode}"]`);
        if (modeRadio) modeRadio.checked = true;

    } catch (error) {
        console.error('Error loading test:', error);
        alert('Error loading test details. Please try again.');
    }
}

async function handleTestSubmit(e) {
    e.preventDefault();

    const modal = document.getElementById('test-modal');
    const isEditMode = modal.dataset.editMode === 'true';
    const testId = modal.dataset.testId;

    const testName = document.getElementById('test-name').value.trim();
    const testType = document.getElementById('test-type').value;
    const description = document.getElementById('test-description').value.trim();
    const sources = getSelectedSources();
    const level = document.getElementById('test-level').value;
    const duration = parseInt(document.getElementById('test-duration').value);

    if (!testName || !testType || !duration) {
        alert('Vui lòng điền đầy đủ: tên đề, loại đề và thời gian!');
        return;
    }

    if (duration < 1) {
        alert('Thời gian phải ít nhất 1 phút!');
        return;
    }

    // Luôn gửi `sources` (kể cả mảng rỗng) để bỏ hết nguồn ở chế độ sửa cũng có
    // hiệu lực — gửi kiểu "chỉ khi có giá trị" thì xoá nguồn sẽ không lưu được.
    const testData = { testName, testType, description, totalTime: duration * 60, level, sources };

    // Điều kiện vào bài — đề free thì ép giá xu về 0 để không sót giá cũ.
    testData.isFree = document.getElementById('test-is-free').checked;
    testData.requiredCoins = testData.isFree
        ? 0
        : Math.max(0, parseInt(document.getElementById('test-required-coins').value) || 0);
    testData.requiredLevel = Math.max(1, parseInt(document.getElementById('test-required-level').value) || 1);

    if (!testData.isFree && testData.requiredCoins < 1) {
        alert('Đề premium phải có giá xu lớn hơn 0!');
        return;
    }

    // Chế độ chọn câu hỏi (chỉ Mini Test): default | shuffle-same | shuffle-cross
    const selectMode = document.querySelector('input[name="q-select-mode"]:checked')?.value || 'default';
    testData.questionSelectMode = selectMode;

    try {
        const url = isEditMode ? `${TOEIC_API_BASE}/tests/${testId}` : `${TOEIC_API_BASE}/tests`;
        const method = isEditMode ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify(testData)
        });

        const data = await res.json();

        if (!data.success) {
            if (data.insufficientParts && data.insufficientParts.length > 0) {
                let errorMsg = '⚠️ Cannot Create Test: Insufficient Questions\n\n';
                errorMsg += 'The following parts do not have enough questions:\n\n';
                data.insufficientParts.forEach(p => {
                    errorMsg += `• Part ${p.part}:\n  Required: ${p.required} | Available: ${p.available} | Missing: ${p.missing}\n\n`;
                });
                errorMsg += '💡 Please add more questions to these parts using:\n   - "Add Question" button\n   - "AI Generate" feature';
                alert(errorMsg);
            } else {
                throw new Error(data.message || 'Failed to create test');
            }
            return;
        }

        alert(data.message || (isEditMode ? '✅ Test updated successfully!' : '✅ Test created successfully!'));
        closeTestModal();
        loadTests();
    } catch (error) {
        console.error(isEditMode ? 'Error updating test:' : 'Error creating test:', error);
        alert('❌ Error:\n\n' + (error.message || (isEditMode ? 'Failed to update test' : 'Failed to create test')));
    }
}

async function generateTest() {
    if (!confirm('Generate a full TOEIC test automatically? This will create a 200-question test with random questions from all parts.')) return;

    try {
        const timestamp = new Date().toISOString().split('T')[0];
        const testNumber = Math.floor(Math.random() * 1000);

        const testData = {
            testName: `Auto-Generated Test #${testNumber}`,
            description: `Automatically generated full TOEIC test on ${timestamp}`
        };

        const res = await fetch(`${TOEIC_API_BASE}/tests/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify(testData)
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Server error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();

        if (!data.success) {
            if (data.insufficientParts && data.insufficientParts.length > 0) {
                let errorMsg = '⚠️ Cannot Generate Full Test: Insufficient Questions\n\n';
                data.insufficientParts.forEach(p => {
                    errorMsg += `• Part ${p.part} (${p.partName}):\n  Required: ${p.required} | Available: ${p.available} | Missing: ${p.missing}\n\n`;
                });
                errorMsg += '💡 Please add more questions to these parts using:\n   - "Add Question" button\n   - "AI Generate" feature';
                alert(errorMsg);
            } else {
                throw new Error(data.message || 'Failed to generate test');
            }
            return;
        }

        alert('✅ Test generated successfully!');
        loadTests();
    } catch (error) {
        console.error('Error generating test:', error);
        alert('❌ Error:\n\n' + (error.message || 'Failed to generate test'));
    }
}

/**
 * Soi ngân hàng câu hỏi + tải lại bảng. Khác đề thi, ở đây không có số liệu nào
 * để đồng bộ — cái đáng lo là số câu TRÙNG / LỌT dải Part / màn THIẾU media,
 * nhìn bảng không ra. Chỉ báo cáo, không tự sửa: số câu phải khớp ảnh đề scan
 * nên tự đánh lại là hỏng dữ liệu thật.
 */
async function checkQuestionsHealth(btn) {
    const original = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Đang soi...';
    }
    try {
        const res = await fetch(`${TOEIC_API_BASE}/questions/health`, {
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Server error');

        showToast(data.message, data.issues ? 'error' : 'success');
        if (data.issues) {
            console.group('🔎 Ngân hàng câu hỏi TOEIC — chỗ cần xem lại');
            if (data.duplicates.length) { console.warn('Số câu TRÙNG trong cùng bộ đề:'); console.table(data.duplicates); }
            if (data.outOfRange.length) { console.warn('Số câu LỌT ngoài dải Part:'); console.table(data.outOfRange); }
            if (data.missingMedia.length) { console.warn('Màn THIẾU media bắt buộc:'); console.table(data.missingMedia); }
            console.groupEnd();
        }
        await loadQuestions(questionsPagination.filterPart || '');
    } catch (err) {
        showToast(`Soi lỗi: ${err.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    }
}

/**
 * Nạp thêm câu MỚI trong kho vào một đề.
 *
 * Khác "Sync số câu": sync chỉ đếm lại những màn đề đang trỏ tới, nên thêm câu
 * vào kho xong bấm sync thì số vẫn y nguyên — đề thi là danh sách chọn CỐ ĐỊNH.
 * Nút này mới là cái kéo câu mới vào đề.
 */
async function refillTest(testId, btn) {
    const test = (allTests || []).find(t => t._id === testId);
    if (!confirm(`Quét kho theo source "${test?.source || '(không có)'}" và nạp thêm câu mới vào đề "${test?.testName || ''}"?\n\n`
        + 'Câu đang có giữ nguyên thứ tự, câu mới nối vào cuối.')) return;

    const original = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
        const res = await fetch(`${TOEIC_API_BASE}/tests/${testId}/refill`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Server error');
        showToast(data.message, data.added ? 'success' : 'info');
        if (data.added) console.table(data.perPart);
        loadTests();
    } catch (err) {
        showToast(`Nạp câu lỗi: ${err.message}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
}

/**
 * Tải lại bảng câu hỏi từ server, GIỮ NGUYÊN bộ lọc/trang đang xem — dùng khi
 * vừa thêm/sửa màn ở tab khác (hoặc máy khác) và muốn thấy ngay, khỏi F5 cả
 * trang. Cũng nạp lại danh sách nguồn vì đề mới sinh ra mã nguồn mới.
 */
async function reloadQuestionsTable(btn) {
    const original = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-rotate fa-spin"></i> Đang tải...';
    }
    try {
        _sourceOptionsLoaded = false; // ép lấy lại danh sách nguồn
        await loadQuestions(searchFilters.part || '', questionsPagination.currentPage || 1);
        showToast(`Đã tải lại — ${questionsPagination.total} màn`, 'success');
    } catch (err) {
        showToast(`Tải lại lỗi: ${err.message}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
}

/**
 * Đồng bộ THẬT: bắt server đọc lại số câu từ ngân hàng câu hỏi và dọn tham
 * chiếu trỏ vào màn hỏi đã xoá. Trước đây nút này chỉ gọi loadTests() — tải
 * lại danh sách chứ không sửa gì, nên số câu lệch vẫn nguyên số lệch.
 */
async function syncAllTests(btn) {
    const original = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Đang đồng bộ...';
    }
    try {
        const res = await fetch(`${TOEIC_API_BASE}/tests/sync-all`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Server error');

        showToast(data.message, data.changed ? 'success' : 'info');
        // Có sửa gì thì in chi tiết ra console để đối chiếu, khỏi phải đoán.
        if (data.changed) console.table(data.details);
        loadTests();
    } catch (err) {
        showToast(`Đồng bộ lỗi: ${err.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    }
}

// Bật/tắt xuất bản một đề. Không hỏi xác nhận: thao tác đảo lại được ngay bằng
// chính nút đó, hỏi mỗi lần chỉ tổ vướng. Báo bằng toast như bên Đề từ vựng.
async function publishTest(testId, shouldPublish) {
    const action = shouldPublish ? 'xuất bản' : 'gỡ xuất bản';

    try {
        const res = await fetch(`${TOEIC_API_BASE}/tests/${testId}/publish`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify({ isPublished: shouldPublish })
        });

        const data = await res.json();

        if (!data.success) throw new Error(data.message || `Không ${action} được đề`);

        showToast(`Đã ${action} đề thi`, 'success');
        loadTests();
    } catch (error) {
        console.error(`Lỗi khi ${action} đề:`, error);
        showToast(`Không ${action} được: ${error.message}`, 'error');
    }
}

// Xuất bản HÀNG LOẠT: đăng tất cả đề đang "Nháp" mà đã có câu hỏi.
// Bật/tắt xuất bản HÀNG LOẠT. shouldPublish=true: đăng mọi đề Nháp đã có câu;
// false: gỡ mọi đề đang hiển thị.
async function _bulkPublishTests(shouldPublish) {
    const targets = shouldPublish
        ? (allTests || []).filter(t => !t.isPublished && (t.totalQuestions || 0) > 0)
        : (allTests || []).filter(t => t.isPublished);

    const verb = shouldPublish ? 'xuất bản' : 'gỡ xuất bản';
    if (targets.length === 0) {
        showToast(shouldPublish
            ? 'Không có đề Nháp nào (đã có câu hỏi) để xuất bản.'
            : 'Không có đề nào đang hiển thị để gỡ.', 'info');
        return;
    }
    if (!confirm(`${shouldPublish ? 'Xuất bản' : 'Gỡ xuất bản'} ${targets.length} đề?`)) return;

    let ok = 0;
    const errors = [];
    for (const t of targets) {
        try {
            const res = await fetch(`${TOEIC_API_BASE}/tests/${t._id}/publish`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ isPublished: shouldPublish }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.message || 'lỗi');
            ok++;
        } catch (err) {
            errors.push(`${t.testName || t._id}: ${err.message}`);
        }
    }

    alert(`✅ Đã ${verb} ${ok}/${targets.length} đề.` + (errors.length ? `\n\n❌ Lỗi:\n${errors.slice(0, 5).join('\n')}` : ''));
    loadTests();
}

function publishAllDrafts() { return _bulkPublishTests(true); }
function unpublishAllTests() { return _bulkPublishTests(false); }

/**
 * Cập nhật nút xuất-bản-hàng-loạt theo trạng thái danh sách. Còn đề Nháp (đã có
 * câu) thì ưu tiên MỜI xuất bản; hết Nháp mà còn đề đã đăng thì chuyển sang gỡ.
 * Trả trạng thái mong muốn để click xử lý mà không phải đoán lại.
 */
function refreshBulkPublishBtn() {
    const btn = document.getElementById('btn-toggle-publish-all');
    if (!btn) return;
    const hasDraft = (allTests || []).some(t => !t.isPublished && (t.totalQuestions || 0) > 0);
    const hasPublished = (allTests || []).some(t => t.isPublished);

    // Còn Nháp → xuất bản. Không còn Nháp nhưng có đề đã đăng → gỡ.
    const publishMode = hasDraft || !hasPublished;
    btn.dataset.publish = publishMode ? '1' : '0';
    btn.className = `btn btn-sm ${publishMode ? 'btn-success' : 'btn-warning'}`;
    btn.innerHTML = publishMode
        ? '<i class="fas fa-upload"></i> Xuất bản tất cả'
        : '<i class="fas fa-eye-slash"></i> Ngưng xuất bản tất cả';
    btn.title = publishMode
        ? 'Xuất bản mọi đề đang Nháp (đã có câu hỏi)'
        : 'Gỡ xuất bản mọi đề đang hiển thị';
    // Không còn gì để thao tác (chưa có đề nào) → mờ đi.
    btn.disabled = !hasDraft && !hasPublished;
}

function toggleBulkPublish() {
    const btn = document.getElementById('btn-toggle-publish-all');
    return _bulkPublishTests(btn?.dataset.publish !== '0');
}

async function deleteTest(testId) {
    if (!confirm('Are you sure you want to delete this test? All associated attempts will remain but the test will be unavailable.')) return;

    try {
        const res = await fetch(`${TOEIC_API_BASE}/tests/${testId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const data = await res.json();

        if (!data.success) throw new Error(data.message || 'Failed to delete test');

        alert('✅ Test deleted successfully!');
        loadTests();
    } catch (error) {
        console.error('Error deleting test:', error);
        alert('❌ Failed to delete test: ' + error.message);
    }
}

window.publishTest = publishTest;
window.deleteTest = deleteTest;

async function deleteAllTests() {
    const confirmText = prompt('⚠️ CẢNH BÁO: Hành động này sẽ xóa TẤT CẢ bài test!\n\nNhập "XOA TAT CA" để xác nhận:');

    if (confirmText !== 'XOA TAT CA') {
        alert('Đã hủy. Nhập đúng "XOA TAT CA" để xác nhận xóa.');
        return;
    }

    try {
        const res = await fetch(`${TOEIC_API_BASE}/tests/delete-all`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const data = await res.json();

        if (!data.success) throw new Error(data.message || 'Failed to delete all tests');

        alert(`✅ Đã xóa ${data.deletedCount || 'tất cả'} bài test!`);
        loadTests();
    } catch (error) {
        console.error('Error deleting all tests:', error);
        alert('❌ Lỗi khi xóa: ' + error.message);
    }
}


async function loadUsersInTab() {
    const tbody = document.querySelector("#users-table-tab tbody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" class="loading"><i class="fas fa-spinner"></i> Đang tải danh sách tài khoản...</td></tr>`;

    try {
        const res = await fetch(`${API_URL}/users`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();

        if (data.success) {
            allUsers = data.data || [];
            currentUsers = [...allUsers];

            if (!window.userFiltersInitialized) {
                initUserSearchAndFilters();
                window.userFiltersInitialized = true;
            }

            applyUserFilters();
        } else {
            const dangerColor = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim();
            tbody.innerHTML = `<tr><td colspan="8" class="loading" style="color: ${dangerColor}">Lỗi tải dữ liệu: ${data.message}</td></tr>`;
        }
    } catch (err) {
        console.error("Error loading users:", err);
        const dangerColor = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim();
        tbody.innerHTML = `<tr><td colspan="8" class="loading" style="color: ${dangerColor}">Lỗi kết nối API: Không thể tải danh sách tài khoản</td></tr>`;
    }
}

// Phân trang phía client cho bảng tài khoản trong TAB (khác bảng trong modal
// quản lý — modal có thanh phân trang riêng #users-modal-pagination).
const usersTabPage = { current: 1, limit: 15 };

function displayUsersInTab(users) {
    const tbody = document.querySelector("#users-table-tab tbody");
    const all = users || [];

    const totalPages = Math.max(1, Math.ceil(all.length / usersTabPage.limit));
    if (usersTabPage.current > totalPages) usersTabPage.current = 1;

    renderPager('users-pagination', {
        page: usersTabPage.current,
        limit: usersTabPage.limit,
        total: all.length,
        itemName: 'tài khoản',
        onPage: (page) => {
            usersTabPage.current = page;
            displayUsersInTab(all);
            document.querySelector('#users-table-tab')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
    });

    if (!all.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;">Không tìm thấy tài khoản nào</td></tr>';
        return;
    }

    const start = (usersTabPage.current - 1) * usersTabPage.limit;
    tbody.innerHTML = all.slice(start, start + usersTabPage.limit).map((u) => {
        const userId = u._id || u.id;
        const createdAt = new Date(u.createdAt).toLocaleDateString('vi-VN');
        const statusBadge = u.isActive
            ? `<span class="badge success">Active</span>`
            : `<span class="badge danger">Inactive</span>`;
        const roleBadge = u.role === 'admin'
            ? `<span class="badge danger">${u.role.toUpperCase()}</span>`
            : `<span class="badge info">${u.role.toUpperCase()}</span>`;
        const isTempLocked = u.lockUntil && new Date(u.lockUntil) > new Date();
        const lockBadge = u.isLocked
            ? `<span class="badge danger">🔒 Locked (Admin)</span>`
            : isTempLocked
                ? `<span class="badge warning">⏳ Locked (Tạm thời)</span>`
                : `<span class="badge success">🔓 Unlock</span>`;

        const shortId = userId ? userId.toString().slice(-8) : '?';
        return `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:5px;" title="${userId}">
                <span style="font-size:12px;font-family:monospace;color:var(--text-secondary);">…${shortId}</span>
                <button class="btn-copy-user-id" data-copy-id="${userId}" title="Copy full ID"
                  style="background:none;border:none;cursor:pointer;color:#aaa;font-size:11px;padding:2px 4px;border-radius:4px;flex-shrink:0;">
                  <i class="fas fa-copy"></i>
                </button>
              </div>
            </td>
            <td><strong>${u.username}</strong></td>
            <td>${u.email || "-"}</td>
            <td>${lockBadge}</td>
            <td>${roleBadge}</td>
            <td>${createdAt}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-primary btn-sm btn-user-edit-tab" data-id="${userId}" data-username="${u.username}" data-email="${u.email}" data-role="${u.role}" data-locked="${u.isLocked ? 'true' : 'false'}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger btn-sm btn-user-delete-tab" data-id="${userId}" data-username="${u.username}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
          </tr>
        `;
    }).join("");

    attachUserTabListeners();
}

function attachUserTabListeners() {
    document.querySelectorAll(".btn-user-edit-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
            openUserFormModal("Sửa thông tin tài khoản", "edit", {
                id: btn.dataset.id,
                username: btn.dataset.username,
                email: btn.dataset.email,
                role: btn.dataset.role,
                isLocked: btn.dataset.locked === 'true',
            });
        });
    });

    document.querySelectorAll(".btn-copy-user-id").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.copyId;
            navigator.clipboard.writeText(id).then(() => {
                btn.innerHTML = '<i class="fas fa-check"></i>';
                btn.style.color = '#27ae60';
                setTimeout(() => {
                    btn.innerHTML = '<i class="fas fa-copy"></i>';
                    btn.style.color = '#aaa';
                }, 1200);
            });
        });
    });

    document.querySelectorAll(".btn-toggle-pwd").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = document.getElementById(btn.dataset.target);
            const icon = btn.querySelector("i");
            if (!target) return;
            if (target.textContent.startsWith('•')) {
                target.textContent = btn.dataset.pwd;
                icon.className = "fas fa-eye-slash";
            } else {
                target.textContent = "••••••••";
                icon.className = "fas fa-eye";
            }
        });
    });

    document.querySelectorAll(".btn-user-delete-tab").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const id = btn.dataset.id;
            const username = btn.dataset.username;
            if (!confirm(`Bạn có chắc chắn muốn XÓA tài khoản "${username}" (ID: ${id})?`)) return;

            try {
                const res = await fetch(`${API_URL}/users/${id}`, {
                    method: "DELETE",
                    headers: { 'Authorization': `Bearer ${getToken()}` },
                });

                const data = await res.json();

                if (data.success) {
                    setTimeout(async () => {
                        await loadUsersInTab();
                        await loadRecentActivities();
                        alert("✅ Tài khoản đã được xóa thành công!");
                    }, 200);
                } else {
                    alert("❌ Lỗi: " + (data.message || "Không thể xóa tài khoản."));
                }
            } catch (error) {
                alert("Lỗi kết nối: Không thể thực hiện thao tác xóa.");
            }
        });
    });
}

async function loadPracticeHistory(page = 1, userId = '', search = '') {
    try {
        practiceHistoryPage = page;
        const params = new URLSearchParams({ page, limit: practiceHistoryLimit });

        if (userId) params.append('userId', userId);
        if (search) params.append('search', search);

        const response = await fetch(`${API_URL}/toeic/admin/practice-history?${params}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const result = await response.json();

        if (result.success) {
            practiceHistoryData = result.data;
            renderPracticeHistoryTable(result.data);
            renderPager('history-pagination', {
                page: result.page,
                limit: practiceHistoryLimit,
                total: result.total || result.data.length,
                itemName: 'lượt thi',
                onPage: (page) => {
                    const filters = getHistoryFilters();
                    loadPracticeHistory(page, filters.userId, filters.search);
                    document.querySelector('#history-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                },
            });
        } else {
            console.error('Failed to load practice history:', result.message);
            document.getElementById('history-table-body').innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; padding: 20px; color: var(--danger);">
                        Failed to load practice history: ${result.message || 'Unknown error'}
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('Error loading practice history:', error);
        document.getElementById('history-table-body').innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; padding: 20px; color: var(--danger);">
                    Error loading practice history. Please try again.
                </td>
            </tr>
        `;
    }
}

function renderPracticeHistoryTable(data) {
    const tbody = document.getElementById('history-table-body');

    if (!data || data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" style="text-align: center; padding: 20px;">
                    No practice history found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = data.map((attempt, index) => {
        const num = (practiceHistoryPage - 1) * practiceHistoryLimit + index + 1;
        const completedDate = new Date(attempt.completedAt);
        const formattedDate = completedDate.toLocaleDateString('vi-VN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });

        const durationMinutes = Math.floor(attempt.duration / 60);
        const durationSeconds = attempt.duration % 60;
        const formattedDuration = `${durationMinutes}m ${durationSeconds}s`;

        return `
            <tr>
                <td>${num}</td>
                <td>
                    <div style="font-weight: 600;">${attempt.user.username}</div>
                    <div style="font-size: 0.85em; color: var(--text-light);">${attempt.user.email}</div>
                </td>
                <td>
                    <span class="badge badge-${attempt.test.type === 'full' ? 'primary' : 'info'}">
                        ${attempt.test.type === 'full' ? 'Full Test' : 'Practice'}
                    </span>
                </td>
                <td style="font-weight: 600; color: var(--primary);">${attempt.totalScore}</td>
                <td>${attempt.listeningScore}</td>
                <td>${attempt.readingScore}</td>
                <td>
                    <span class="badge badge-${attempt.accuracy >= 80 ? 'success' : attempt.accuracy >= 60 ? 'warning' : 'danger'}">
                        ${attempt.accuracy}%
                    </span>
                </td>
                <td>${formattedDate}</td>
                <td>${formattedDuration}</td>
                <td>
                    <button class="btn-icon history-view-btn" data-attempt-id="${attempt._id}" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon history-delete-btn" data-attempt-id="${attempt._id}" title="Delete" style="color: var(--danger);">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    setTimeout(() => {
        document.querySelectorAll('.history-view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                viewPracticeDetails(btn.getAttribute('data-attempt-id'));
            });
        });

        document.querySelectorAll('.history-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                deleteSingleHistory(btn.getAttribute('data-attempt-id'));
            });
        });
    }, 0);
}

function getHistoryFilters() {
    return {
        userId: document.getElementById('history-filter-user')?.value || '',
        search: document.getElementById('history-search')?.value || ''
    };
}

async function viewPracticeDetails(attemptId) {
    try {
        const response = await fetch(`${API_URL}/toeic/attempts/${attemptId}/review`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const result = await response.json();

        if (result.success) {
            showPracticeDetailsModal(result.data);
        } else {
            alert('Failed to load practice details: ' + result.message);
        }
    } catch (error) {
        console.error('Error loading practice details:', error);
        alert('Error loading practice details. Please try again.');
    }
}

function showPracticeDetailsModal(data) {
    const modal = document.createElement('div');
    modal.id = 'practice-details-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.5); display: flex;
        align-items: center; justify-content: center; z-index: 10000;
    `;

    modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 30px; max-width: 900px; max-height: 80vh; overflow-y: auto; width: 90%;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0;">Practice Details</h2>
                <button id="close-practice-modal-btn" style="background: none; border: none; font-size: 24px; cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px;">
                <div class="stat-card">
                    <div class="stat-label">Total Score</div>
                    <div class="stat-value" style="color: var(--primary);">${data.scores.total}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Accuracy</div>
                    <div class="stat-value">${data.stats ? ((data.stats.correct / data.stats.total) * 100).toFixed(1) : 0}%</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Listening Score</div>
                    <div class="stat-value">${data.scores.listening}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Reading Score</div>
                    <div class="stat-value">${data.scores.reading}</div>
                </div>
            </div>

            <div style="background: var(--bg-secondary); padding: 15px; border-radius: 8px;">
                <h3 style="margin-top: 0;">Statistics</h3>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                    <div><strong>Total Questions:</strong> ${data.stats.total}</div>
                    <div style="color: var(--success);"><strong>Correct:</strong> ${data.stats.correct}</div>
                    <div style="color: var(--danger);"><strong>Incorrect:</strong> ${data.stats.incorrect}</div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.getElementById('close-practice-modal-btn')?.addEventListener('click', closePracticeDetailsModal);
}

function closePracticeDetailsModal() {
    const modal = document.getElementById('practice-details-modal');
    if (modal) modal.remove();
}

async function loadUsersListForHistory() {
    try {
        const response = await fetch(`${API_URL}/toeic/admin/users-list`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const result = await response.json();

        if (result.success) {
            const select = document.getElementById('history-filter-user');
            if (select) {
                select.innerHTML = '<option value="">-- Tất cả --</option>' +
                    result.data.map(user => `
                        <option value="${user._id}">${user.username} (${user.email})</option>
                    `).join('');
            }
        }
    } catch (error) {
        console.error('Error loading users list:', error);
    }
}

async function deleteSingleHistory(attemptId) {
    if (!confirm('Are you sure you want to delete this practice history entry?')) return;

    try {
        const response = await fetch(`${API_URL}/toeic/admin/practice-history/${attemptId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const result = await response.json();

        if (result.success) {
            alert('Practice history deleted successfully!');
            const filters = getHistoryFilters();
            loadPracticeHistory(practiceHistoryPage, filters.userId, filters.search);
        } else {
            alert('Failed to delete practice history: ' + result.message);
        }
    } catch (error) {
        console.error('Error deleting practice history:', error);
        alert('Error deleting practice history. Please try again.');
    }
}

async function deleteAllUserHistory() {
    const userId = document.getElementById('history-filter-user')?.value;

    if (!userId) {
        alert('Please select a user first!');
        return;
    }

    const userSelect = document.getElementById('history-filter-user');
    const selectedOption = userSelect.options[userSelect.selectedIndex];
    const username = selectedOption.text;

    if (!confirm(`Are you sure you want to delete ALL practice history for ${username}?\n\nThis action cannot be undone!`)) return;

    try {
        const response = await fetch(`${API_URL}/toeic/admin/practice-history/user/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const result = await response.json();

        if (result.success) {
            alert(result.message);
            loadPracticeHistory(1, '', '');
            document.getElementById('history-filter-user').value = '';
            document.getElementById('btn-delete-user-history').style.display = 'none';
        } else {
            alert('Failed to delete user history: ' + result.message);
        }
    } catch (error) {
        console.error('Error deleting user history:', error);
        alert('Error deleting user history. Please try again.');
    }
}

async function deleteAllHistory() {
    if (!confirm('⚠️ WARNING: Are you sure you want to delete ALL practice history from ALL users?\n\nThis will permanently delete EVERYTHING and CANNOT be undone!')) return;
    if (!confirm('⚠️ FINAL WARNING: This will delete ALL practice history entries from the database.\n\nType confirmation: Click OK to proceed with deletion.')) return;

    try {
        const response = await fetch(`${API_URL}/toeic/admin/practice-history/all`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        const result = await response.json();

        if (result.success) {
            alert(`✅ ${result.message}`);
            loadPracticeHistory(1, '', '');
            document.getElementById('history-filter-user').value = '';
            document.getElementById('btn-delete-user-history').style.display = 'none';
        } else {
            alert('❌ Failed to delete all history: ' + result.message);
        }
    } catch (error) {
        console.error('Error deleting all history:', error);
        alert('❌ Error deleting all history. Please try again.');
    }
}
