// modules/core.js — Offline mode helpers, core dashboard init, loadDashboard, refreshData

// ===================================
// 1.6 SIMPLE SEARCH SYSTEM
// ===================================
/**
 * Simple unified search - works with local data
 */
function initSimpleSearch() {
  let searchInput = document.getElementById("vocab-search");
  if (!searchInput) {
    console.warn("❌ Search input not found");
    return;
  }

  // Remove ALL existing listeners by replacing element
  const newInput = searchInput.cloneNode(true);
  searchInput.parentNode.replaceChild(newInput, searchInput);

  // Get the new element from DOM (important!)
  searchInput = document.getElementById("vocab-search");

  // Single simple handler for search
  searchInput.addEventListener(
    "input",
    debounce((e) => {
      vocabSearchTerm = e.target.value.trim();
      console.log(
        `🔍 Search: "${vocabSearchTerm}" in ${currentLocalFile} (${localVocabularyData.length} words)`,
      );

      if (localVocabularyData.length > 0) {
        displayLocalVocabulary();
      } else {
        console.warn("⚠️ No local data to search");
      }
    }, 300),
  );

  // Focus/blur styling (CSP-safe - no inline handlers)
  searchInput.addEventListener("focus", function () {
    this.style.borderColor = "#667eea";
    this.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.1)";
  });
  searchInput.addEventListener("blur", function () {
    this.style.borderColor = "#e0e0e0";
    this.style.boxShadow = "none";
  });
  // Prevent form submission on Enter
  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") e.preventDefault();
  });

  // Clear filters button (CSP-safe)
  let clearFiltersBtn = document.getElementById("clear-vocab-filters");
  if (clearFiltersBtn) {
    // Remove old listeners by cloning
    const newBtn = clearFiltersBtn.cloneNode(true);
    clearFiltersBtn.parentNode.replaceChild(newBtn, clearFiltersBtn);
    // Get new button from DOM
    clearFiltersBtn = document.getElementById("clear-vocab-filters");
    clearFiltersBtn.addEventListener("click", clearVocabFilters);
  }

  console.log("✅ Simple search initialized");
}

// LOCAL_VOCAB_FILES removed — file list is now dynamically fetched from /api/vocabulary/files

/**
 * Check if API is available
 */
async function checkApiAvailability() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(
      `${API_URL}/vocabulary/stats?lang=${encodeURIComponent(vocabCurrentLang || "en")}`,
      {
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);

    return res.ok;
  } catch (error) {
    console.warn("⚠️ API không khả dụng, chuyển sang chế độ offline");
    return false;
  }
}

/**
 * Load vocabulary from local JSON file
 */
async function loadLocalVocabulary(filename) {
  try {
    const cacheBuster = `?_t=${Date.now()}`;
    const res = await fetch(`../data/${filename}${cacheBuster}`);

    if (!res.ok) throw new Error(`Cannot load ${filename}`);

    const data = await res.json();
    localVocabularyData = Array.isArray(data) ? data : [];
    currentLocalFile = filename;

    console.log(
      `✅ Loaded ${localVocabularyData.length} words from local file: ${filename}`,
    );
    return localVocabularyData;
  } catch (error) {
    console.error(`❌ Error loading local file ${filename}:`, error);
    return [];
  }
}

/**
 * Search and filter local vocabulary
 */
function searchLocalVocabulary(searchTerm = "", part = "") {
  let filtered = [...localVocabularyData];

  // Filter by part
  if (part) {
    filtered = filtered.filter((w) => w.part === part);
  }

  // Filter by search term
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(
      (w) =>
        (w.en && w.en.toLowerCase().includes(term)) ||
        (w.vn && w.vn.toLowerCase().includes(term)) ||
        (w.zh && w.zh.toLowerCase().includes(term)) ||
        (w.pinyin && w.pinyin.toLowerCase().includes(term)),
    );
  }

  return filtered;
}

/**
 * Initialize offline mode UI
 */
function initOfflineMode() {
  // Show offline banner
  const mainContent = document.querySelector(".main-content");
  if (mainContent) {
    const banner = document.createElement("div");
    banner.id = "offline-banner";
    banner.innerHTML = `
            <div style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 12px 20px;
                        border-radius: 8px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
                <i class="fas fa-wifi" style="font-size: 20px; opacity: 0.9;"></i>
                <div>
                    <strong>Chế độ Offline</strong> - Server không khả dụng. Đang xem từ file JSON local.
                    <br><small>Một số tính năng (thêm/sửa/xóa) sẽ không hoạt động.</small>
                </div>
            </div>
        `;
    mainContent.insertBefore(banner, mainContent.firstChild);
  }

  // Setup local file selector
  setupLocalFileSelector();
}

/**
 * Setup file selector — always fetches from API, even in offline/degraded mode
 */
async function setupLocalFileSelector() {
  // Delegate to the same dynamic loader
  await loadAvailableFiles();
}

/**
 * Handle file change in offline mode
 */
async function handleOfflineFileChange(e) {
  const filename = e.target.value;
  if (!filename) return;

  console.log(`📂 Switching to offline file: ${filename}`);

  const selector = e.target;
  selector.disabled = true;

  // Reset search and filter when switching files
  vocabSearchTerm = "";
  vocabCurrentPart = "";

  // Clear search input
  const searchInput = document.getElementById("vocab-search");
  if (searchInput) searchInput.value = "";

  // Reset part filter
  const partFilter = document.getElementById("vocab-part-filter");
  if (partFilter) partFilter.value = "";

  try {
    await loadLocalVocabulary(filename);

    // Update selector option text to reflect loaded word count
    const selectedOption = selector.querySelector(
      `option[value="${filename}"]`,
    );
    if (selectedOption) {
      // Preserve display name already set by loadAvailableFiles, just update count
      const currentText = selectedOption.textContent
        .replace(/\s*\(\d+ từ\)$/, "")
        .trim();
      selectedOption.textContent = `${currentText}  (${localVocabularyData.length} từ)`;
    }

    displayLocalVocabulary();
    updateLocalStats();
    updateLocalPartFilter();

    console.log(
      `✅ Switched to ${filename}: ${localVocabularyData.length} words`,
    );
  } catch (error) {
    console.error("Error switching file:", error);
    alert("❌ Không thể load file: " + filename);
  } finally {
    selector.disabled = false;
  }
}

/**
 * Display vocabulary in offline mode
 */
function displayLocalVocabulary() {
  const tbody = document.querySelector("#vocabulary-table tbody");
  if (!tbody) return;

  console.log(
    `📋 Offline search: term="${vocabSearchTerm}", part="${vocabCurrentPart}", file="${currentLocalFile}"`,
  );

  const filtered = searchLocalVocabulary(vocabSearchTerm, vocabCurrentPart);

  console.log(
    `✅ Found ${filtered.length} results from ${localVocabularyData.length} total words`,
  );

  // Update total vocabulary count
  document.getElementById("total-vocabulary").textContent =
    localVocabularyData.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #999; padding: 40px;">
            Không tìm thấy từ vựng nào với từ khóa "${vocabSearchTerm}".
        </td></tr>`;

    // Update count display
    updateLocalCountDisplay(0, localVocabularyData.length);
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (word) => `
        <tr>
            <td><strong>${word.en || ""}</strong> ${word.phonetic || ""}</td>
            <td>${word.vn || ""}</td>
            <td><span class="badge info">${word.type || "-"}</span></td>
            <td><span class="badge warning">${word.part || "-"}</span></td>
            <td>
                <button class="btn btn-warning btn-sm btn-edit-word" data-word='${JSON.stringify(word).replace(/'/g, "&#39;")}' title="Sửa từ vựng">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger btn-sm btn-delete-word" data-en="${word.en || ""}" title="Xóa từ vựng">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `,
    )
    .join("");

  // Attach event handlers for edit/delete buttons
  tbody.querySelectorAll(".btn-edit-word").forEach((btn) => {
    btn.addEventListener("click", () => {
      const word = JSON.parse(btn.dataset.word);
      openEditWordModal(word);
    });
  });

  tbody.querySelectorAll(".btn-delete-word").forEach((btn) => {
    btn.addEventListener("click", () => {
      const en = btn.dataset.en;
      if (confirm(`Bạn có chắc muốn xóa từ "${en}"?`)) {
        deleteWord(en);
      }
    });
  });

  // Update count display
  updateLocalCountDisplay(filtered.length, localVocabularyData.length);
}

/**
 * Update count display for offline mode
 */
function updateLocalCountDisplay(displayCount, total) {
  // Try to find and update any count container
  const hasFilter = vocabCurrentPart || vocabSearchTerm;

  // Update vocabulary pagination info bar specifically
  const paginationContainer = document.getElementById(
    "vocabulary-pagination-controls",
  );
  if (paginationContainer) {
    if (hasFilter) {
      paginationContainer.innerHTML = `<i class="fas fa-info-circle"></i> Hiển thị <strong>${displayCount}</strong> / <strong>${total}</strong> từ vựng`;
    } else {
      paginationContainer.innerHTML = `<i class="fas fa-list"></i> Tổng cộng: <strong>${total}</strong> từ vựng`;
    }
  }
}

/**
 * Update statistics in offline mode
 */
function updateLocalStats() {
  const container = document.getElementById("vocab-stats-container");
  if (!container) return;

  // Calculate stats from local data
  const totalWords = localVocabularyData.length;
  const parts = [
    ...new Set(localVocabularyData.map((w) => w.part).filter(Boolean)),
  ];
  const types = [
    ...new Set(localVocabularyData.map((w) => w.type).filter(Boolean)),
  ];

  container.innerHTML = `
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px;">
            <div class="stat-item" style="text-align: center; padding: 15px; background: var(--card-bg); border-radius: 8px;">
                <div style="font-size: 24px; font-weight: bold; color: var(--primary);">${totalWords}</div>
                <div style="color: var(--text-secondary); font-size: 12px;">Tổng từ vựng</div>
            </div>
            <div class="stat-item" style="text-align: center; padding: 15px; background: var(--card-bg); border-radius: 8px;">
                <div style="font-size: 24px; font-weight: bold; color: var(--success);">${parts.length}</div>
                <div style="color: var(--text-secondary); font-size: 12px;">Số Parts</div>
            </div>
            <div class="stat-item" style="text-align: center; padding: 15px; background: var(--card-bg); border-radius: 8px;">
                <div style="font-size: 24px; font-weight: bold; color: var(--warning);">${types.length}</div>
                <div style="color: var(--text-secondary); font-size: 12px;">Loại từ</div>
            </div>
            <div class="stat-item" style="text-align: center; padding: 15px; background: var(--card-bg); border-radius: 8px;">
                <div style="font-size: 14px; font-weight: bold; color: var(--info);">${currentLocalFile}</div>
                <div style="color: var(--text-secondary); font-size: 12px;">File hiện tại</div>
            </div>
        </div>
    `;
}

/**
 * Update part filter dropdown in offline mode
 */
/**
 * Render the part filter (hidden <select> + pills).
 * @param {Array<{part:string,count:number}>} partList full list (DB or local)
 */
function renderPartFilter(partList) {
  const select = document.getElementById("vocab-part-filter");
  const pills = document.getElementById("part-filter-pills");
  if (!select && !pills) return;

  const currentVal = vocabCurrentPart || "";

  if (select) {
    select.innerHTML = '<option value="">-- Tất cả Parts --</option>';
    partList.forEach(({ part }) => {
      const opt = document.createElement("option");
      opt.value = part;
      opt.textContent = part;
      select.appendChild(opt);
    });
    select.value = currentVal;
  }

  if (!pills) return;
  pills.innerHTML = "";

  const allPill = document.createElement("button");
  allPill.type = "button";
  allPill.textContent = "Tất cả";
  allPill.dataset.part = "";
  allPill.className = "part-pill" + (!currentVal ? " part-pill--active" : "");
  pills.appendChild(allPill);

  partList.forEach(({ part, count }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.part = part;
    btn.className =
      "part-pill" + (currentVal === part ? " part-pill--active" : "");
    const countHtml =
      typeof count === "number"
        ? ` <span style="opacity:.55;font-size:10px;">${count}</span>`
        : "";
    btn.innerHTML = `${part}${countHtml}`;
    pills.appendChild(btn);
  });

  pills.querySelectorAll(".part-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.part;
      document.getElementById("part-filter-label").textContent =
        val || "Tất cả Part";
      document.getElementById("part-filter-dropdown").style.display = "none";
      pills
        .querySelectorAll(".part-pill")
        .forEach((b) => b.classList.remove("part-pill--active"));
      btn.classList.add("part-pill--active");
      loadVocabulary(1, val, vocabCurrentSource);
    });
  });
}

/**
 * Populate the part filter from the DATABASE (all parts, correct counts,
 * scoped to the selected source). Falls back to deriving from local/loaded
 * data only if the API is unreachable (offline mode).
 */
async function updateLocalPartFilter(vocabData) {
  try {
    const params = new URLSearchParams({ lang: vocabCurrentLang || "en" });
    if (vocabCurrentSource) params.set("source", vocabCurrentSource);
    const res = await fetch(`${API_URL}/vocabulary/parts?${params.toString()}`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.data)) {
      const counts = data.counts || {};
      renderPartFilter(
        data.data.map((part) => ({ part, count: counts[part] })),
      );
      return;
    }
    throw new Error("Bad parts response");
  } catch (err) {
    // Offline / API down → best-effort from whatever data we have.
    console.warn("Part filter: falling back to local data —", err.message);
    const localSource =
      vocabData || window._lastVocabData || localVocabularyData || [];
    const parts = [
      ...new Set(localSource.map((w) => w.part).filter(Boolean)),
    ].sort();
    renderPartFilter(
      parts.map((part) => ({
        part,
        count:
          (localVocabularyData || []).filter((w) => w.part === part).length ||
          undefined,
      })),
    );
  }
}

function initPartFilterDropdown() {
  const btn = document.getElementById("part-filter-btn");
  const dropdown = document.getElementById("part-filter-dropdown");
  if (!btn || !dropdown) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = dropdown.style.display !== "none";
    dropdown.style.display = isOpen ? "none" : "block";
  });

  document.addEventListener("click", (e) => {
    if (!document.getElementById("part-filter-wrapper")?.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });
}

// ===================================
// 3. CORE DASHBOARD FUNCTIONS
// ===================================

async function initDashboard() {
  if (dashboardInitialized) return;
  dashboardInitialized = true;
  await loadDashboard();
  initMainTabs();
  loadRecentUsers();
  loadGrowthChart(30);
  if (typeof window.refreshSeasonAdmin === 'function') window.refreshSeasonAdmin();
  if (typeof window.initSpinAdmin === 'function') window.initSpinAdmin();
  loadReportStats(); // load badge count on startup
  // Poll for new reports every 60s so the badge stays current
  setInterval(loadReportStats, 60_000);

  // Topics tab buttons
  document
    .getElementById("btn-add-topic")
    ?.addEventListener("click", () => showTopicModal());

  document
    .getElementById("btn-toggle-publish-all-topics")
    ?.addEventListener("click", () => toggleBulkPublishTopics());

  document
    .getElementById("btn-sync-all-topics")
    ?.addEventListener("click", async () => {
      try {
        // Đồng bộ cả 2 ngôn ngữ để đảm bảo wordCount chính xác cho mọi đề
        const syncs = ['en', 'zh'].map(lang => 
          fetch(`${API_URL}/topics/sync-all?lang=${lang}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${getToken()}` },
          }).then(r => r.json())
        );
        
        await Promise.all(syncs);
        showToast("Đã sync wordCount cho tất cả đề (EN & ZH)", "success");
        loadTopicsTab();
      } catch (err) {
        showToast(`Lỗi: ${err.message}`, "error");
      }
    });

  document
    .getElementById("btn-sync-all-vocab")
    ?.addEventListener("click", () => {
      loadVocabulary(1);
      showToast("Đã tải lại dữ liệu từ vựng", "success");
    });

  // Vocab lang sub-tabs (EN / ZH)
  document.querySelectorAll("[data-vocab-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("[data-vocab-lang]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      vocabCurrentLang = btn.dataset.vocabLang;
      vocabCurrentPage = 1;
      vocabCurrentPart = "";
      vocabCurrentSource = "";
      vocabCurrentType = "";
      vocabSearchTerm = "";
      const searchInput = document.getElementById("vocab-search");
      const sourceSelect = document.getElementById("vocab-filter-source");
      const typeSelect = document.getElementById("vocab-filter-type");
      if (searchInput) searchInput.value = "";
      if (sourceSelect) {
        sourceSelect.innerHTML = '<option value="">Tất cả Source</option>';
        delete sourceSelect.dataset.loaded;
      }
      if (typeSelect) typeSelect.value = "";
      loadAvailableFiles();
      initVocabExtraFilters();
      loadVocabulary(1);
    });
  });

  document
    .getElementById("btn-reload-questions")
    ?.addEventListener("click", (e) => reloadQuestionsTable(e.currentTarget));

  document
    .getElementById("btn-sync-all-questions")
    ?.addEventListener("click", (e) => checkQuestionsHealth(e.currentTarget));

  document
    .getElementById("btn-sync-all-tests")
    ?.addEventListener("click", (e) => syncAllTests(e.currentTarget));

  document
    .getElementById("btn-sync-all-uploads")
    ?.addEventListener("click", () => {
      loadUploadMonitoring();
      showToast("Đã tải lại nội dung người dùng", "success");
    });

  document
    .getElementById("btn-sync-all-users")
    ?.addEventListener("click", () => {
      loadUsersInTab();
      showToast("Đã tải lại danh sách người dùng", "success");
    });

  // "Xem tất cả" in Recent Users → switch to Users tab
  document
    .getElementById("action-btn-view-users")
    ?.addEventListener("click", () => {
      document.querySelector('.sidebar-link[data-main-tab="users"]')?.click();
    });

  // Growth chart period selector
  document.getElementById("growth-period")?.addEventListener("change", (e) => {
    loadGrowthChart(parseInt(e.target.value) || 30);
  });

  // Reports filter
  document
    .getElementById("rpt-filter-status")
    ?.addEventListener("change", () => loadReports(1));
  document
    .getElementById("btn-refresh-reports")
    ?.addEventListener("click", () => {
      loadReports(reportsPage);
      loadReportStats();
    });

  document
    .getElementById("btn-delete-all-reports")
    ?.addEventListener("click", async () => {
      if (!confirm("Xóa toàn bộ báo cáo? Hành động này không thể hoàn tác."))
        return;
      try {
        const res = await fetch(`${API_URL}/reports/all`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (data.success) {
          loadReports(1);
          loadReportStats();
        } else {
          alert("❌ " + (data.message || "Xóa thất bại"));
        }
      } catch (err) {
        alert("❌ Lỗi kết nối: " + err.message);
      }
    });

  // Quick action links (data-main-tab-link)
  document.querySelectorAll("[data-main-tab-link]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.mainTabLink;
      document.querySelector(`.sidebar-link[data-main-tab="${tab}"]`)?.click();
    });
  });
}

async function loadDashboard() {
  console.log("🚀 Initializing dashboard...");

  try {
    // Check API availability first
    const apiAvailable = await checkApiAvailability();

    if (!apiAvailable) {
      // Switch to offline mode
      console.log("🔌 Switching to offline mode...");
      isOfflineMode = true;
      initOfflineMode();

      // Load local vocabulary
      await loadLocalVocabulary("vocabulary.json");
      displayLocalVocabulary();
      updateLocalStats();
      updateLocalPartFilter();

      // Setup simple search
      initSimpleSearch();

      // Update server info to show offline
      document.getElementById("total-users").textContent = "-";
      document.getElementById("total-vocabulary").textContent =
        localVocabularyData.length;
      document.getElementById("server-uptime").textContent = "Offline";
      document.getElementById("total-sessions").textContent = "-";
      document.getElementById("toeic-tests-count").textContent = "-";
      // Mark topbar status dot as offline
      const dotEl = document.getElementById("topbar-server-status");
      if (dotEl) {
        dotEl.textContent = "Offline";
        dotEl.className = "status-dot offline";
      }
      const mongoEl = document.getElementById("server-mongo-status");
      if (mongoEl) {
        mongoEl.textContent = "-";
        mongoEl.style.color = "var(--danger)";
      }

      return;
    }

    // Online mode - original code
    const healthRes = await fetch("http://localhost:5000/health");
    const health = await healthRes.json();

    document.getElementById("total-users").textContent = health.usersCount ?? 0;
    document.getElementById("total-vocabulary").textContent =
      health.vocabularyCount || 0;

    // Format uptime thân thiện hơn
    const uptime = Math.floor(health.uptime);
    let uptimeText = "";
    if (uptime < 60) {
      uptimeText = uptime + "s";
    } else if (uptime < 3600) {
      uptimeText = Math.floor(uptime / 60) + "m " + (uptime % 60) + "s";
    } else if (uptime < 86400) {
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      uptimeText = hours + "h " + minutes + "m";
    } else {
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      uptimeText = days + "d " + hours + "h";
    }
    document.getElementById("server-uptime").textContent = uptimeText;

    document.getElementById("total-sessions").textContent = "-";
    // toeic-tests-count is populated by loadToeicStats() called separately

    // Update topbar status dot & compact server info
    const dotEl = document.getElementById("topbar-server-status");
    if (dotEl) {
      dotEl.textContent = "Online";
      dotEl.className = "status-dot online";
    }

    const mongoEl = document.getElementById("server-mongo-status");
    if (mongoEl) {
      const isOk = health.mongodb === "connected";
      mongoEl.textContent = health.mongodb || "-";
      mongoEl.style.color = isOk ? "var(--success)" : "var(--danger)";
    }

    // Load TOEIC tests count for the stat card
    await loadToeicStats();

    // 1. Tải danh sách file JSON có sẵn
    await loadAvailableFiles();
    // 2. Khởi tạo bộ lọc (Quét Part) + Source/Type filters
    await initializeVocabFilters();
    if (typeof initVocabExtraFilters === "function")
      await initVocabExtraFilters();
    // 3. Tải dữ liệu từ vựng ban đầu (Lọc Part theo mặc định là Tất cả)
    await loadVocabulary();

    await loadUsers();

    // 3. Load statistics and info for right panel
    await loadVocabularyStats();
    await loadRecentActivities();
  } catch (error) {
    console.error("Error loading dashboard:", error);

    // Fallback to offline mode on error
    if (!isOfflineMode) {
      console.log("🔌 Error connecting, switching to offline mode...");
      isOfflineMode = true;
      initOfflineMode();
      await loadLocalVocabulary("vocabulary.json");
      displayLocalVocabulary();
      updateLocalStats();
      updateLocalPartFilter();
      initSimpleSearch();
    }
  }
}

/**
 * Setup search handler for offline mode
 */
function setupOfflineSearchHandler() {
  // Guard to prevent multiple registrations
  if (searchHandlerRegistered) {
    console.log("⚠️ Search handler already registered, skipping...");
    return;
  }
  searchHandlerRegistered = true;
  console.log("🔧 Setting up offline search handler...");

  // Search input - ID is "vocab-search" (not "vocab-search-input")
  const searchInput = document.getElementById("vocab-search");
  const partFilter = document.getElementById("vocab-part-filter");

  if (searchInput) {
    console.log("✅ Found search input, attaching offline handler");

    // Remove old listeners by cloning
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);

    newSearchInput.addEventListener(
      "input",
      debounce((e) => {
        vocabSearchTerm = e.target.value.trim();
        console.log(
          `🔍 Offline search: "${vocabSearchTerm}" in ${currentLocalFile}`,
        );
        displayLocalVocabulary();
      }, 300),
    );
  } else {
    console.warn("⚠️ Search input not found");
  }

  if (partFilter) {
    console.log("✅ Found part filter, attaching offline handler");

    // Remove old listeners by cloning
    const newPartFilter = partFilter.cloneNode(true);
    partFilter.parentNode.replaceChild(newPartFilter, partFilter);

    newPartFilter.addEventListener("change", (e) => {
      vocabCurrentPart = e.target.value;
      console.log(`🏷️ Offline filter by part: "${vocabCurrentPart}"`);
      displayLocalVocabulary();
    });

    // Re-populate options
    updateLocalPartFilter();
  } else {
    console.warn("⚠️ Part filter not found");
  }

  console.log("✅ Offline search handler ready");
}

function refreshData() {
  // Allow re-initialization on explicit refresh
  dashboardInitialized = false;
  loadDashboard();
}
