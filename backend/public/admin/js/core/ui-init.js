// ===================================
// UI INIT MODULE
// initMainTabs + TOEIC/practice history DOMContentLoaded event listeners
// ===================================

// Track which activity sub-panels have been loaded
const _activityLoaded = {};

function activateActivitySubtab(subtab) {
    document.querySelectorAll('.activity-subtab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.subtab === subtab);
    });
    document.querySelectorAll('.activity-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `activity-panel-${subtab}`);
    });

    if (_activityLoaded[subtab]) return;
    _activityLoaded[subtab] = true;

    if (subtab === 'user-stats') {
        loadUserStats();
    } else if (subtab === 'practice-history') {
        loadPracticeHistory12();
    } else if (subtab === 'toeic-history') {
        loadUsersListForHistory();
        loadPracticeHistory();
    } else if (subtab === 'user-achievements') {
        initUserAchievementsTab();
    }
}

function initMainTabs() {
    const TAB_TITLES = {
        overview:            'Dashboard',
        topics:              'Bộ đề từ vựng',
        vocabulary:          'Kho từ vựng TOEIC',
        users:               'Tài khoản người dùng',
        'toeic-questions':   'Ngân hàng câu hỏi TOEIC',
        'toeic-single':      'Tạo câu đơn TOEIC (Part 1·2·5)',
        'toeic-group':       'Tạo nhóm câu TOEIC (Part 3·4·6·7)',
        'toeic-tests':       'Đề thi TOEIC',
        activity:            'Hoạt động người dùng',
        reports:             'Báo cáo người dùng',
        achievements:        'Quản lý Thành tích',
        quests:              'Quản lý Nhiệm vụ',
        shop:                'Quản lý Cửa hàng',
        items:               'Catalog vật phẩm (item_definitions)',
        categories:          'Danh mục (Cửa hàng / Thành tích / Nhiệm vụ)',
        spin:                'Vòng quay — Phần thưởng & tỷ lệ',
        economy:             'Bảng kinh tế (faucet / sink)',
        'game-config':       'Hằng số game (tinh chỉnh cân bằng)',
        'feature-unlocks':   'Mở khoá theo Level',
        'answer-keys':       'Bộ đáp án đề thi',
        monitor:             'Giám sát hệ thống',
        broadcast:           'Gửi thông báo',
        'upload-management': 'Nội dung người dùng',
        'token-management':  'Chi phí AI',
        'db-manager':        'Quản lý Database',
        cloudinary:          'Kho ảnh/audio trên Cloudinary',
    };

    const sidebarLinks = document.querySelectorAll('.sidebar-link[data-main-tab]');

    function activateTab(tab) {
        sidebarLinks.forEach(l => l.classList.remove('active'));
        const activeLink = document.querySelector(`.sidebar-link[data-main-tab="${tab}"]`);
        if (activeLink) activeLink.classList.add('active');

        document.querySelectorAll('.main-tab-content').forEach(t => t.classList.remove('active'));
        const panel = document.getElementById(`main-tab-${tab}`);
        if (panel) panel.classList.add('active');

        const titleEl = document.getElementById('topbar-title');
        if (titleEl) titleEl.textContent = TAB_TITLES[tab] || tab;

        if (tab === 'topics') {
            loadTopicsTab();
        } else if (tab === 'vocabulary') {
            loadAvailableFiles();
        } else if (tab === 'users') {
            loadUsersInTab();
        } else if (tab === 'toeic-questions') {
            loadToeicStats();
            loadQuestions();
        } else if (tab === 'toeic-single') {
            window.initToeicSingleTab?.();
        } else if (tab === 'toeic-group') {
            window.initToeicGroupTab?.();
        } else if (tab === 'toeic-tests') {
            loadToeicStats();
            loadTests();
        } else if (tab === 'activity') {
            // Activate default sub-tab (Tổng quan) on first visit
            const activeBtn = document.querySelector('.activity-subtab-btn.active');
            const activeSub = activeBtn?.dataset.subtab || 'user-stats';
            activateActivitySubtab(activeSub);
        } else if (tab === 'reports') {
            loadReports();
            loadReportStats();
        } else if (tab === 'achievements') {
            loadAchievements();
            window.initChannelCatPicker?.('achievement');
        } else if (tab === 'quests') {
            loadQuests();
            window.initChannelCatPicker?.('quest');
        } else if (tab === 'shop') {
            window.initChannelCatPicker?.('shop');
        } else if (tab === 'spin') {
            window.initSpinAdmin?.();
            window.initChannelCatPicker?.('spin');
        } else if (tab === 'items') {
            window.loadItemDefs?.();
        } else if (tab === 'categories') {
            window.loadCategories?.();
        } else if (tab === 'economy') {
            window.loadEconomy?.();
        } else if (tab === 'game-config') {
            window.loadGameConfig?.();
        } else if (tab === 'feature-unlocks') {
            window.loadFeatureUnlocks?.();
        } else if (tab === 'answer-keys') {
            window.loadAnswerKeysTab?.();
        } else if (tab === 'monitor') {
            startMetricsPolling();
            initApiReference();
        } else if (tab === 'upload-management') {
            initUploadManagement();
        } else if (tab === 'token-management') {
            loadTokenStats();
        } else if (tab === 'broadcast') {
            loadNotifHistory();
        } else if (tab === 'db-manager') {
            initDbManager();
        } else if (tab === 'cloudinary') {
            window.loadCloudinaryTab?.();
        } else {
            stopMetricsPolling();
        }

        if (tab !== 'monitor') stopMetricsPolling();

        if (window.innerWidth <= 900) {
            collapseSidebar();
        }
    }

    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            activateTab(link.dataset.mainTab);
        });
    });

    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar   = document.getElementById('admin-sidebar');
    const overlay   = document.getElementById('sidebar-overlay');

    function collapseSidebar() {
        sidebar.classList.add('collapsed');
        if (overlay) overlay.classList.remove('visible');
    }
    function expandSidebar() {
        sidebar.classList.remove('collapsed');
        if (overlay && window.innerWidth <= 900) overlay.classList.add('visible');
    }

    // Expose collapseSidebar so activateTab can call it
    window.collapseSidebar = collapseSidebar;

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            if (sidebar.classList.contains('collapsed')) {
                expandSidebar();
            } else {
                collapseSidebar();
            }
        });
    }

    if (overlay) {
        overlay.addEventListener('click', collapseSidebar);
    }

    if (window.innerWidth > 900) {
        expandSidebar();
    }

    // Activity sub-tab click handlers
    document.querySelectorAll('.activity-subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => activateActivitySubtab(btn.dataset.subtab));
    });
}

// Expose activateActivitySubtab for external callers (e.g. openUserAchievementsFor)
window.activateActivitySubtab = activateActivitySubtab;

// DOMContentLoaded: TOEIC events + practice history events
// (user/vocab/quick-delete events are registered in users.js)
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-refresh")?.addEventListener("click", refreshData);

    // --- TOEIC QUESTION EVENTS ---
    document.getElementById('filter-part')?.addEventListener('change', (e) => {
        loadQuestions(e.target.value, 1);
    });

    document.getElementById('btn-ai-generate-questions')?.addEventListener('click', openAIGenerateModal);

    document.getElementById('btn-add-question')?.addEventListener('click', () => {
        openQuestionModal();
    });

    document.getElementById('btn-delete-all-questions')?.addEventListener('click', deleteAllQuestions);
    document.getElementById('btn-close-question-modal')?.addEventListener('click', closeQuestionModal);

    document.getElementById('question-form')?.addEventListener('submit', handleQuestionSubmit);
    document.getElementById('question-part')?.addEventListener('change', updatePartVisibility);

    // Question modal: Nhập tay / Nhập JSON + Copy prompt
    document.getElementById('q-tab-manual')?.addEventListener('click', () => switchQuestionModalTab('manual'));
    document.getElementById('q-tab-json')?.addEventListener('click', () => switchQuestionModalTab('json'));
    document.getElementById('btn-copy-q-prompt')?.addEventListener('click', () => {
        // Truyền Source đang nhập để prompt ép AI dùng đúng mã đề (giống bên nhóm).
        copyQuestionPrompt(
            document.getElementById('q-prompt-part')?.value,
            document.getElementById('q-json-source')?.value
        );
    });
    // Đổi Part → placeholder ô JSON cập nhật theo Part đó
    const qPromptPartSel = document.getElementById('q-prompt-part');
    if (qPromptPartSel) {
        qPromptPartSel.addEventListener('change', updateQuestionJsonPlaceholder);
        updateQuestionJsonPlaceholder(); // set theo Part mặc định khi tải trang
    }
    document.getElementById('btn-submit-q-json')?.addEventListener('click', () => submitQuestionJsonImport());
    document.getElementById('btn-close-q-json')?.addEventListener('click', clearQuestionJson);

    document.getElementById('question-image-file')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) handleImageUpload(file);
    });

    document.getElementById('question-audio-file')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) handleAudioUpload(file);
    });

    // --- TOEIC GROUP BUILDER (nhóm câu hỏi Part 3/4/6/7) ---
    document.getElementById('btn-add-group')?.addEventListener('click', openGroupModal);
    document.getElementById('btn-close-group-modal')?.addEventListener('click', closeGroupModal);
    document.getElementById('btn-submit-group')?.addEventListener('click', submitGroup);
    document.getElementById('group-part')?.addEventListener('change', groupUpdatePartVisibility);
    document.getElementById('btn-group-add-q')?.addEventListener('click', () => {
        document.getElementById('group-questions-container')?.appendChild(makeGroupQuestionRow());
        renumberGroupQuestions();
        syncGroupQuestionTextVisibility(document.getElementById('group-part')?.value);
    });
    document.getElementById('group-audio-file')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) handleGroupAudioUpload(file);
    });
    document.getElementById('group-image-file')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) handleGroupImageUpload(file);
    });
    // Group modal: tab Trình dựng / Nhập JSON + copy prompt + import
    document.getElementById('group-tab-manual')?.addEventListener('click', () => switchGroupTab('manual'));
    document.getElementById('group-tab-json')?.addEventListener('click', () => switchGroupTab('json'));
    document.getElementById('btn-group-copy-prompt')?.addEventListener('click', () => {
        copyQuestionPrompt(
            document.getElementById('group-json-part').value,
            document.getElementById('group-json-source').value
        );
    });
    document.getElementById('btn-group-submit-json')?.addEventListener('click', () => {
        submitQuestionJsonImport('group-json-input', 'group-json-result', 'btn-group-submit-json');
    });

    // --- TOEIC TEST EVENTS ---
    document.getElementById('btn-create-test')?.addEventListener('click', () => openTestModal());
    document.getElementById('btn-generate-test')?.addEventListener('click', generateTest);
    document.getElementById('btn-toggle-publish-all')?.addEventListener('click', toggleBulkPublish);
    document.getElementById('btn-delete-all-tests')?.addEventListener('click', deleteAllTests);
    document.getElementById('btn-close-test-modal')?.addEventListener('click', closeTestModal);
    document.getElementById('test-form')?.addEventListener('submit', handleTestSubmit);

    // --- PRACTICE HISTORY (TOEIC) EVENTS ---
    document.getElementById("btn-refresh-history")?.addEventListener("click", () => {
        const filters = getHistoryFilters();
        loadPracticeHistory(1, filters.userId, filters.search);
    });

    document.getElementById("history-filter-user")?.addEventListener("change", () => {
        const filters = getHistoryFilters();
        loadPracticeHistory(1, filters.userId, filters.search);

        const deleteBtn = document.getElementById('btn-delete-user-history');
        if (deleteBtn) {
            deleteBtn.style.display = filters.userId ? 'inline-block' : 'none';
        }
    });

    document.getElementById("history-search")?.addEventListener("input", () => {
        const filters = getHistoryFilters();
        clearTimeout(window.historySearchTimeout);
        window.historySearchTimeout = setTimeout(() => {
            loadPracticeHistory(1, filters.userId, filters.search);
        }, 500);
    });

    document.getElementById("btn-delete-user-history")?.addEventListener("click", deleteAllUserHistory);
    document.getElementById("btn-delete-all-history")?.addEventListener("click", deleteAllHistory);

    // --- IMAGE PATH GENERATOR ---
    document.getElementById("btn-gen-image-path")?.addEventListener("click", () => {
        const en = document.getElementById("word-en")?.value.trim();
        const part = document.getElementById("word-part")?.value.trim().toUpperCase();
        if (!en || !part) {
            alert("Vui lòng nhập từ tiếng Anh và Part trước.");
            return;
        }
        const safeFileName = en.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        document.getElementById("word-image").value = `images/pages/${part}/${safeFileName}.jpg`;
    });
});
