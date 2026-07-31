// ===================================
// TABS MODULE
// Topics, Upload, Token, User Stats, Achievements, Broadcast, Practice 12 Modes, Seeds
// ===================================

// Dùng rgba alpha 0.15 cho bg để badge đọc tốt trên cả nền sáng và tối
// (light/dark mode) — tránh tình trạng badge trắng tinh trên nền tối.
let _notifData = [];
let _notifSrc = "";

const NOTIF_TYPE_META = {
  system: {
    label: "Hệ thống",
    color: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.15)",
  },
  reminder: {
    label: "Nhắc nhở",
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.15)",
  },
  achievement: {
    label: "Thành tích",
    color: "#8b5cf6",
    bg: "rgba(139, 92, 246, 0.15)",
  },
  quest: {
    label: "Nhiệm vụ",
    color: "#10b981",
    bg: "rgba(16, 185, 129, 0.15)",
  },
  level_up: {
    label: "Lên cấp",
    color: "#06b6d4",
    bg: "rgba(6, 182, 212, 0.15)",
  },
  test_result: {
    label: "Kết quả thi",
    color: "#6366f1",
    bg: "rgba(99, 102, 241, 0.15)",
  },
  violation: {
    label: "Vi phạm",
    color: "#ef4444",
    bg: "rgba(239, 68, 68, 0.15)",
  },
};

const MODE_LABELS = {
  "multiple-choice": "Multiple Choice",
  "fill-blank": "Fill Blank",
  listening: "Listening",
  matching: "Matching",
  "speed-quiz": "Speed Quiz",
  flashcard: "Flashcard",
  "synonym-check": "Synonym Check",
  "word-type-check": "Word Type",
  "word-scramble": "Word Scramble",
  "example-fill-blank": "Example Fill",
  "review-mistakes": "Review Mistakes",
  "sentence-builder": "Sentence Builder",
  pronunciation: "Pronunciation",
  "context-learning": "Context Learning",
  dictation: "Dictation",
  "sentence-listening": "Sentence Listening",
  "phonetic-quiz": "Phonetic Quiz",
};

// ---- TOPICS TAB ----

let _topicsData = [];
// Phân trang phía client — danh sách đề nhỏ, tải một lần rồi cắt trang tại chỗ.
let _topicsFiltered = [];
const _topicsPage = { current: 1, limit: 15 };

async function loadTopicsTab() {
  const tbody = document.getElementById("topics-tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="loading"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>`;

  try {
    const res = await fetch(`${API_URL}/topics/all`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    _topicsData = data.data;
    _setupTopicsSearch();
    _applyTopicsFilter();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:#ef4444;text-align:center;padding:20px;">${err.message}</td></tr>`;
  }
}

function _applyTopicsFilter() {
  const q = (document.getElementById("topics-search")?.value || "")
    .trim()
    .toLowerCase();
  const words = document.getElementById("topics-filter-words")?.value || "";
  const visible = document.getElementById("topics-filter-visible")?.value || "";
  const lang = document.getElementById("topics-filter-lang")?.value || "";

  let data = _topicsData;
  if (q)
    data = data.filter((t) =>
      (t.displayName + (t.sourceKeys || []).join(","))
        .toLowerCase()
        .includes(q),
    );
  if (visible)
    data = data.filter((t) => (visible === "1" ? t.isPublic : !t.isPublic));
  if (lang) data = data.filter((t) => (t.lang || "en") === lang);
  if (words) {
    const [lo, hi] = words
      .split("-")
      .map((v) => (v === "" ? Infinity : Number(v)));
    data = data.filter((t) => {
      const w = t.wordCount || 0;
      return w >= lo && (hi === Infinity ? true : w <= hi);
    });
  }

  _topicsFiltered = data;
  _renderTopicsPage();
}

/** Cắt trang từ danh sách đã lọc rồi vẽ bảng + thanh phân trang. */
function _renderTopicsPage() {
  const totalPages = Math.max(1, Math.ceil(_topicsFiltered.length / _topicsPage.limit));
  if (_topicsPage.current > totalPages) _topicsPage.current = 1;

  const start = (_topicsPage.current - 1) * _topicsPage.limit;
  renderTopicsTable(_topicsFiltered.slice(start, start + _topicsPage.limit));

  renderPager("topics-pagination", {
    page: _topicsPage.current,
    limit: _topicsPage.limit,
    total: _topicsFiltered.length,
    itemName: "đề",
    onPage: (p) => {
      _topicsPage.current = p;
      _renderTopicsPage();
      document.getElementById("topics-table")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  });
  refreshTopicsPublishBtn();
}

function _setupTopicsSearch() {
  const search = document.getElementById("topics-search");
  if (!search || search.dataset.topicsFiltersBound) return;
  search.dataset.topicsFiltersBound = "1";

  // Đổi bộ lọc thì về trang 1; còn tải lại sau khi xuất bản thì GIỮ trang đang
  // xem, đỡ phải lật lại từ đầu mỗi lần bấm.
  const refilter = () => {
    _topicsPage.current = 1;
    _applyTopicsFilter();
  };

  search.addEventListener("input", refilter);
  document
    .getElementById("topics-filter-words")
    ?.addEventListener("change", refilter);
  document
    .getElementById("topics-filter-visible")
    ?.addEventListener("change", refilter);
  document
    .getElementById("topics-filter-lang")
    ?.addEventListener("change", refilter);
  document
    .getElementById("topics-filter-clear")
    ?.addEventListener("click", () => {
      const s = document.getElementById("topics-search");
      const w = document.getElementById("topics-filter-words");
      const v = document.getElementById("topics-filter-visible");
      const l = document.getElementById("topics-filter-lang");
      if (s) s.value = "";
      if (w) w.value = "";
      if (v) v.value = "";
      if (l) l.value = "";
      refilter();
    });
}

function renderTopicsTable(topics) {
  const tbody = document.getElementById("topics-tbody");
  if (!topics.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:30px;">Chưa có đề nào. Nhấn "+ Thêm đề" để tạo.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  topics.forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>
                <strong>${t.displayName}</strong>
                ${t.description ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">${t.description}</div>` : ""}
            </td>
            <td><span class="badge info" style="font-family:monospace;">${Array.isArray(t.sourceKeys) ? t.sourceKeys.join(", ") : t.sourceKeys}</span></td>
            <td><strong>${(t.wordCount || 0).toLocaleString()}</strong> từ</td>
            <td style="text-align:center;">${t.order}</td>
            <td style="text-align:center;">
                <span class="badge" style="background:${(t.lang || "en") === "zh" ? "#dc2626" : "#2563eb"};color:#fff;">
                    ${(t.lang || "en") === "zh" ? "🇨🇳 ZH" : "🇬🇧 EN"}
                </span>
            </td>
            <td style="text-align:center;">
                <span class="badge ${t.isPublic ? "success" : ""}" style="${!t.isPublic ? "background:#374151;color:#9ca3af;" : ""}">
                    ${t.isPublic ? "Hiện" : "Ẩn"}
                </span>
            </td>
            <td style="white-space:nowrap">
                <button class="btn ${t.isPublic ? "btn-warning" : "btn-success"} btn-sm topic-btn-publish"
                    title="${t.isPublic ? "Gỡ xuất bản — ẩn đề với người dùng" : "Xuất bản — hiện đề cho người dùng"}">
                    <i class="fas ${t.isPublic ? "fa-eye-slash" : "fa-upload"}"></i>
                </button>
                <button class="btn btn-primary btn-sm topic-btn-edit" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-sm topic-btn-delete" title="Xoá"><i class="fas fa-trash"></i></button>
            </td>`;

    tr.querySelector(".topic-btn-publish").addEventListener("click", () =>
      publishTopic(t._id, !t.isPublic),
    );
    tr.querySelector(".topic-btn-edit").addEventListener("click", () =>
      showTopicModal(t),
    );
    tr.querySelector(".topic-btn-delete").addEventListener("click", () =>
      deleteTopicConfirm(t._id, t.displayName),
    );
    tbody.appendChild(tr);
  });
}

function showTopicModal(topic) {
  const isEdit = !!topic;
  const existing = document.getElementById("topic-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "topic-modal";
  modal.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;";
  modal.innerHTML = `
        <div style="background:#1e293b;border:1px solid #334155;border-radius:14px;width:560px;max-width:95vw;padding:26px;">
            <h3 style="margin:0 0 20px;font-size:17px;">${isEdit ? "Sửa đề" : "Thêm đề mới"}</h3>
            <div style="display:grid;gap:14px;">
                <div>
                    <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:5px;">SOURCE KEYS <span style="color:#ef4444">*</span></label>
                    <input id="ti-sourceKey" value="${(Array.isArray(topic?.sourceKeys) ? topic.sourceKeys : [topic?.sourceKeys || ""]).filter(Boolean).join(", ")}"
                        placeholder="vd: ets2024, 600words" style="width:100%;padding:9px 12px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-family:monospace;">
                    <div style="font-size:11px;color:#64748b;margin-top:4px;">Nhiều giá trị cách nhau bằng dấu phẩy. Phải khớp với sources trong vocabulary.</div>
                </div>
                <div>
                    <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:5px;">TÊN HIỂN THỊ <span style="color:#ef4444">*</span></label>
                    <input id="ti-displayName" value="${topic?.displayName || ""}" placeholder="vd: ETS 2024"
                        style="width:100%;padding:9px 12px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;">
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                        <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:5px;">ICON (emoji)</label>
                        <input id="ti-icon" value="${topic?.icon || "📚"}" style="width:100%;padding:9px 12px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;font-size:18px;">
                    </div>
                    <div>
                        <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:5px;">MÀU</label>
                        <input type="color" id="ti-color" value="${topic?.color || "#3b82f6"}" style="width:100%;height:38px;padding:2px;background:#0f172a;border:1px solid #334155;border-radius:8px;cursor:pointer;">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div>
                        <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:5px;">THỨ TỰ</label>
                        <input type="number" id="ti-order" value="${topic?.order ?? (_topicsData.length > 0 ? Math.max(..._topicsData.map((t) => t.order ?? 0)) + 1 : 0)}" style="width:100%;padding:9px 12px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;">
                    </div>
                    <div>
                        <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:5px;">NGÔN NGỮ</label>
                        <select id="ti-lang" style="width:100%;padding:9px 12px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;">
                            <option value="en" ${(topic?.lang || "en") === "en" ? "selected" : ""}>🇬🇧 Tiếng Anh (EN)</option>
                            <option value="zh" ${topic?.lang === "zh" ? "selected" : ""}>🇨🇳 Tiếng Trung (ZH)</option>
                        </select>
                    </div>
                </div>
                <div style="display:flex;align-items:center;padding-bottom:2px;">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#e2e8f0;">
                        <input type="checkbox" id="ti-isPublic" ${topic?.isPublic !== false ? "checked" : ""}
                            style="width:16px;height:16px;accent-color:#3b82f6;"> Hiển thị cho người dùng
                    </label>
                </div>
                <div>
                    <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:5px;">MÔ TẢ</label>
                    <input id="ti-description" value="${topic?.description || ""}" placeholder="Mô tả ngắn về đề này..."
                        style="width:100%;padding:9px 12px;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#e2e8f0;">
                </div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:24px;">
                <button id="ti-btn-cancel" class="btn btn-ghost">Hủy</button>
                <button id="ti-btn-save" class="btn btn-success">
                    <i class="fas fa-save"></i> ${isEdit ? "Lưu" : "Tạo"}
                </button>
            </div>
        </div>`;

  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  modal
    .querySelector("#ti-btn-cancel")
    .addEventListener("click", () => modal.remove());
  modal
    .querySelector("#ti-btn-save")
    .addEventListener("click", () => saveTopicModal(topic?._id || "", modal));
}

async function saveTopicModal(id, modal) {
  const sourceKeysRaw = document.getElementById("ti-sourceKey")?.value || "";
  const sourceKeysArray = sourceKeysRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const body = {
    sourceKeys: sourceKeysArray,
    displayName: document.getElementById("ti-displayName")?.value.trim(),
    icon: document.getElementById("ti-icon")?.value.trim(),
    color: document.getElementById("ti-color")?.value,
    order: parseInt(document.getElementById("ti-order")?.value) || 0,
    isPublic: document.getElementById("ti-isPublic")?.checked,
    description: document.getElementById("ti-description")?.value.trim(),
    lang: document.getElementById("ti-lang")?.value || "en",
  };

  if (!body.displayName)
    return showToast("Vui lòng nhập tên hiển thị", "warning");
  if (!id && body.sourceKeys.length === 0)
    return showToast("Vui lòng nhập sourceKeys", "warning");

  const isEdit = !!id;
  const url = isEdit ? `${API_URL}/topics/${id}` : `${API_URL}/topics`;
  const method = isEdit ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    (modal || document.getElementById("topic-modal"))?.remove();
    showToast(isEdit ? "Đã cập nhật đề" : "Đã tạo đề mới", "success");
    loadTopicsTab();
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, "error");
  }
}

/**
 * Bật/tắt xuất bản HÀNG LOẠT. publish=true: hiện mọi đề đang ẩn (có từ); bỏ qua
 * đề 0 từ (hiện đề rỗng thì người dùng bấm vào chỉ thấy trống). publish=false:
 * ẩn mọi đề đang hiện.
 */
async function _bulkPublishTopics(publish) {
  let targets, skipMsg = "";
  if (publish) {
    const hidden = (_topicsData || []).filter((t) => !t.isPublic);
    targets = hidden.filter((t) => (t.wordCount || 0) > 0);
    const empty = hidden.length - targets.length;
    if (!targets.length) {
      showToast(
        hidden.length
          ? `${hidden.length} đề đang ẩn nhưng chưa có từ nào — sync hoặc thêm từ trước đã.`
          : "Mọi đề đều đã xuất bản.",
        "info",
      );
      return;
    }
    if (empty) skipMsg = `\n(Bỏ qua ${empty} đề chưa có từ nào.)`;
  } else {
    targets = (_topicsData || []).filter((t) => t.isPublic);
    if (!targets.length) {
      showToast("Không có đề nào đang hiển thị để ẩn.", "info");
      return;
    }
  }

  const verb = publish ? "xuất bản" : "ẩn";
  if (!confirm(`${publish ? "Xuất bản" : "Ẩn"} ${targets.length} đề?` + skipMsg)) return;

  let ok = 0;
  const errors = [];
  for (const t of targets) {
    try {
      const res = await fetch(`${API_URL}/topics/${t._id}/publish`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ isPublic: publish }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "lỗi");
      ok++;
    } catch (err) {
      errors.push(`${t.displayName || t._id}: ${err.message}`);
    }
  }

  alert(
    `✅ Đã ${verb} ${ok}/${targets.length} đề.` +
      (errors.length ? `\n\n❌ Lỗi:\n${errors.slice(0, 5).join("\n")}` : ""),
  );
  loadTopicsTab();
}

// Nút tự đổi: còn đề ẩn (có từ) → xuất bản; hết đề ẩn nhưng còn đề hiện → ẩn.
function refreshTopicsPublishBtn() {
  const btn = document.getElementById("btn-toggle-publish-all-topics");
  if (!btn) return;
  const hasHiddenReady = (_topicsData || []).some((t) => !t.isPublic && (t.wordCount || 0) > 0);
  const hasPublic = (_topicsData || []).some((t) => t.isPublic);

  const publishMode = hasHiddenReady || !hasPublic;
  btn.dataset.publish = publishMode ? "1" : "0";
  btn.className = `btn btn-sm ${publishMode ? "btn-success" : "btn-warning"}`;
  btn.innerHTML = publishMode
    ? '<i class="fas fa-upload"></i> Xuất bản tất cả'
    : '<i class="fas fa-eye-slash"></i> Ngưng xuất bản tất cả';
  btn.title = publishMode
    ? "Xuất bản mọi đề đang ẩn (bỏ qua đề 0 từ)"
    : "Ẩn mọi đề đang hiển thị";
  btn.disabled = !hasHiddenReady && !hasPublic;
}

function toggleBulkPublishTopics() {
  const btn = document.getElementById("btn-toggle-publish-all-topics");
  return _bulkPublishTopics(btn?.dataset.publish !== "0");
}

// Xuất bản / gỡ xuất bản một đề. Gửi trạng thái MONG MUỐN để bấm nhanh hai lần
// vẫn ra đúng kết quả (server không tự đảo).
async function publishTopic(id, isPublic) {
  try {
    const res = await fetch(`${API_URL}/topics/${id}/publish`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ isPublic }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    showToast(data.message, "success");
    loadTopicsTab();
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, "error");
  }
}

async function deleteTopicConfirm(id, name) {
  if (!confirm(`Xóa đề "${name}"?\nTừ vựng trong DB không bị xóa.`)) return;
  try {
    const res = await fetch(`${API_URL}/topics/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    showToast("Đã xóa đề", "success");
    loadTopicsTab();
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, "error");
  }
}

// ---- UPLOAD MANAGEMENT TAB ----

let _uploadsData = [];

function initUploadManagement() {
  document
    .getElementById("btn-refresh-uploads")
    ?.addEventListener("click", loadUploadMonitoring);
  document
    .getElementById("btn-clear-upload-filters")
    ?.addEventListener("click", () => {
      const s = document.getElementById("upload-search");
      if (s) s.value = "";
      const w = document.getElementById("upload-filter-words");
      if (w) w.value = "";
      const st = document.getElementById("upload-filter-status");
      if (st) st.value = "";
      _applyUploadsFilter();
    });
  loadUploadMonitoring();
}

function _renderUploads(data) {
  const tbody = document.getElementById("upload-monitoring-tbody");
  if (!tbody) return;

  const countEl = document.getElementById("upload-filter-count");
  if (countEl)
    countEl.textContent = `${data.length} / ${_uploadsData.length} bản ghi`;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:40px;text-align:center;color:var(--text-secondary)"><i class="fas fa-inbox" style="font-size:32px;opacity:.3;display:block;margin-bottom:10px"></i>Không có kết quả</td></tr>`;
    return;
  }

  tbody.innerHTML = data
    .map((u) => {
      const isActive = u.status === "active";
      const statusColor = isActive ? "#10b981" : "#ef4444";
      const statusLabel = isActive ? "✓ Cho phép" : "✗ Chặn";
      const statusBg = isActive
        ? "rgba(16,185,129,.12)"
        : "rgba(239,68,68,.12)";
      const preview = (u.contentPreview || []).slice(0, 3).join(", ");
      const more = u.wordCount > 3 ? ` +${u.wordCount - 3}` : "";
      return `<tr>
            <td style="padding:12px;font-weight:500">${u.email}</td>
            <td style="padding:12px;font-size:13px"><code style="background:var(--bg-tertiary);padding:2px 8px;border-radius:4px;font-size:12px">${u.source}</code></td>
            <td style="padding:12px;font-size:13px;color:var(--text-secondary);max-width:260px;overflow:hidden;text-overflow:ellipsis"><span title="${(u.contentPreview || []).join(", ")}">${preview}${more}</span></td>
            <td style="padding:12px;text-align:right;font-family:monospace;font-weight:600">${u.wordCount}</td>
            <td style="padding:12px;text-align:center"><span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;background:${statusBg};color:${statusColor}">${statusLabel}</span></td>
            <td style="padding:12px;text-align:center;font-size:12px;color:var(--text-secondary)">${new Date(u.createdAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}</td>
        </tr>`;
    })
    .join("");
}

function _applyUploadsFilter() {
  const q = (document.getElementById("upload-search")?.value || "")
    .trim()
    .toLowerCase();
  const words = document.getElementById("upload-filter-words")?.value || "";
  const status = document.getElementById("upload-filter-status")?.value || "";

  let data = _uploadsData;
  if (q)
    data = data.filter((u) => (u.email + u.source).toLowerCase().includes(q));
  if (status) data = data.filter((u) => u.status === status);
  if (words) {
    const [lo, hi] = words
      .split("-")
      .map((v) => (v === "" ? Infinity : Number(v)));
    data = data.filter((u) => {
      const w = u.wordCount || 0;
      return w >= lo && (hi === Infinity ? true : w <= hi);
    });
  }
  _renderUploads(data);
}

function _setupUploadsFilters() {
  const search = document.getElementById("upload-search");
  if (!search || search.dataset.bound) return;
  search.dataset.bound = "1";
  search.addEventListener("input", _applyUploadsFilter);
  document
    .getElementById("upload-filter-words")
    ?.addEventListener("change", _applyUploadsFilter);
  document
    .getElementById("upload-filter-status")
    ?.addEventListener("change", _applyUploadsFilter);
}

async function loadUploadMonitoring() {
  const tbody = document.getElementById("upload-monitoring-tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="padding:30px;text-align:center;color:var(--text-secondary)"><i class="fas fa-spinner fa-spin"></i> Đang tải dữ liệu...</td></tr>`;

  try {
    const res = await fetch("/api/upload/admin/monitoring", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    _uploadsData = result.data || [];
    _setupUploadsFilters();
    _applyUploadsFilter();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:#ef4444">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
  }
}

// ---- TOKEN MANAGEMENT TAB ----

// Map nhãn feature → tên hiển thị tiếng Việt. Feature lạ giữ nguyên key.
const AI_FEATURE_LABELS = {
  "vocab-ai-fill": "✍️ AI Fill từ vựng",
  "explain-word": "📖 Giải thích từ",
  "word-questions-generate": "❓ Sinh câu hỏi từ vựng",
  "toeic-question-generate": "🎓 AI Generate câu hỏi TOEIC",
  "toeic-reading-generate": "📚 AI Generate đoạn đọc TOEIC",
  "analyze-mistakes": "🔍 Phân tích lỗi",
  "study-plan": "📅 Kế hoạch học",
  "chat-tutor": "💬 Chat tutor",
  "generate-examples": "✏️ Sinh câu ví dụ",
  "check-grammar": "✓ Kiểm tra ngữ pháp",
  "related-words": "🔗 Từ liên quan",
  "generate-flashcards": "🎴 Sinh flashcard",
  "translate-sentence": "🌐 Dịch câu",
  unknown: "❔ Khác / chưa gắn nhãn",
};

// Danh mục nhà cung cấp + lựa chọn hiện tại, nạp cùng lúc với thống kê.
let _aiProviders = [];

/** Dựng 2 ô chọn (hãng → model) và nút Lưu. Hãng chưa có key thì khoá lại. */
function renderProviderPicker(providers) {
  _aiProviders = providers;
  const pSel = document.getElementById("ai-provider-select");
  const mSel = document.getElementById("ai-model-select");
  const hint = document.getElementById("ai-provider-hint");
  if (!pSel || !mSel) return;

  fetch("/api/admin/ai-config", {
    headers: { Authorization: `Bearer ${authToken}` },
  })
    .then((r) => r.json())
    .then((j) => {
      if (!j.success) return;
      const cur = j.data;
      pSel.innerHTML = providers
        .map(
          (p) =>
            `<option value="${p.id}" ${p.configured ? "" : "disabled"} ${p.id === cur.provider ? "selected" : ""}>${p.label}${p.configured ? "" : " (chưa có key)"}</option>`,
        )
        .join("");

      const fillModels = () => {
        const p = providers.find((x) => x.id === pSel.value);
        if (!p) return;
        mSel.innerHTML = p.models
          .map(
            (m) =>
              `<option value="${m}" ${m === cur.model && p.id === cur.provider ? "selected" : ""}>${m}${m === p.defaultModel ? " (mặc định)" : ""}</option>`,
          )
          .join("");
        // Model không đọc được ảnh thì nói trước, đừng để lỗi lúc quét đáp án.
        if (hint) {
          hint.innerHTML = p.vision.length
            ? `<i class="fas fa-image"></i> Đọc được ảnh: ${p.vision.join(", ")}`
            : '<i class="fas fa-triangle-exclamation"></i> Hãng này chưa đọc được ảnh — không dùng cho quét đáp án.';
        }
      };
      fillModels();
      pSel.onchange = fillModels;
    })
    .catch(() => {});
}

async function saveAiProvider(btn) {
  const provider = document.getElementById("ai-provider-select")?.value;
  const model = document.getElementById("ai-model-select")?.value;
  if (!provider) return;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
  try {
    const r = await fetch("/api/admin/ai-config", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider, model }),
    });
    const j = await r.json();
    showToast(j.message || "Đã lưu", j.success ? "success" : "error");
  } catch (e) {
    showToast(`Lưu lỗi: ${e.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

let _aiPickerInited = false;

async function loadTokenStats() {
  // Gắn listener MỘT lần cho cả vòng đời trang: loadTokenStats chạy lại mỗi lần
  // mở tab, dùng { once: true } thì bấm Lưu lần hai trong cùng phiên sẽ không ăn.
  if (!_aiPickerInited) {
    _aiPickerInited = true;
    document
      .getElementById("btn-ai-provider-save")
      ?.addEventListener("click", (e) => saveAiProvider(e.currentTarget));
  }
  try {
    const days =
      parseInt(document.getElementById("ai-usage-days")?.value || "7", 10) || 7;
    const response = await fetch("/api/admin/ai-usage?days=" + days, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    const d = result.data;

    // 4 cards
    const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");
    const usd = (n) => "$" + Number(n || 0).toFixed(4);
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    set("ai-total-tokens", fmt(d.totalTokens));
    set(
      "ai-token-split",
      `prompt ${fmt(d.promptTokens)} · completion ${fmt(d.completionTokens)}`,
    );
    set("ai-total-cost", usd(d.totalCost));
    set("ai-cost-all", "All-time: " + usd(d.allTime?.totalCost));
    set("ai-total-calls", fmt(d.calls));
    set("ai-calls-all", "All-time: " + fmt(d.allTime?.calls));
    set("ai-total-users", fmt(d.users));

    // Bảng chi phí theo NHÀ CUNG CẤP — tỉ trọng vẽ theo COST (không phải token)
    // vì cùng số token nhưng khác hãng thì tiền chênh nhau cả chục lần.
    const pTb = document.getElementById("ai-provider-tbody");
    if (pTb) {
      const rows = d.byProvider || [];
      if (!rows.length) {
        pTb.innerHTML =
          '<tr><td colspan="5" style="padding:18px;text-align:center;color:var(--text-secondary)">Chưa có lượt gọi AI nào trong khoảng này.</td></tr>';
      } else {
        const maxCost = Math.max(...rows.map((p) => p.cost || 0), 1e-9);
        pTb.innerHTML = rows
          .map((p) => {
            const pct = Math.round((p.cost / maxCost) * 100);
            const key = p.configured
              ? ""
              : ' <span class="badge neutral" title="Chưa có API key trong .env">chưa cấu hình</span>';
            return `
                        <tr style="border-bottom:1px solid var(--border-color)">
                            <td style="padding:10px"><b>${p.label || p._id}</b>${key}</td>
                            <td style="padding:10px;text-align:right">${fmt(p.calls)}</td>
                            <td style="padding:10px;text-align:right;font-family:monospace">${fmt(p.tokens)}</td>
                            <td style="padding:10px;text-align:right;font-family:monospace">${usd(p.cost)}</td>
                            <td style="padding:10px">
                                <div style="background:var(--bg-tertiary);border-radius:4px;height:8px;overflow:hidden">
                                    <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#f59e0b,#dc2626)"></div>
                                </div>
                            </td>
                        </tr>`;
          })
          .join("");
      }
    }

    // Bảng chi phí theo MODEL
    const mTb = document.getElementById("ai-model-tbody");
    if (mTb) {
      const rows = d.byModel || [];
      mTb.innerHTML = rows.length
        ? rows
            .map(
              (m) => `
                    <tr style="border-bottom:1px solid var(--border-color)">
                        <td style="padding:10px;font-family:monospace;font-size:12px">${m.model || "—"}</td>
                        <td style="padding:10px;font-size:12px;color:var(--text-secondary)">${m.provider}</td>
                        <td style="padding:10px;text-align:right">${fmt(m.calls)}</td>
                        <td style="padding:10px;text-align:right;font-family:monospace">${fmt(m.tokens)}</td>
                        <td style="padding:10px;text-align:right;font-family:monospace">${usd(m.cost)}</td>
                    </tr>`,
            )
            .join("")
        : '<tr><td colspan="5" style="padding:18px;text-align:center;color:var(--text-secondary)">Chưa có dữ liệu.</td></tr>';
    }

    // Ô chọn nhà cung cấp — dựng từ danh mục server trả về, không hardcode.
    renderProviderPicker(d.providers || []);

    // Bảng phân bổ theo feature
    const fTb = document.getElementById("ai-feature-tbody");
    if (fTb) {
      if (!d.byFeature?.length) {
        fTb.innerHTML =
          '<tr><td colspan="5" style="padding:18px;text-align:center;color:var(--text-secondary)">Chưa có lượt gọi AI nào trong khoảng này.</td></tr>';
      } else {
        const maxTokens = Math.max(...d.byFeature.map((f) => f.tokens || 0), 1);
        fTb.innerHTML = d.byFeature
          .map((f) => {
            const label = AI_FEATURE_LABELS[f._id] || f._id;
            const pct = Math.round((f.tokens / maxTokens) * 100);
            return `
                        <tr style="border-bottom:1px solid var(--border-color)">
                            <td style="padding:10px"><b>${label}</b></td>
                            <td style="padding:10px;text-align:right">${fmt(f.calls)}</td>
                            <td style="padding:10px;text-align:right;font-family:monospace">${fmt(f.tokens)}</td>
                            <td style="padding:10px;text-align:right;font-family:monospace">${usd(f.cost)}</td>
                            <td style="padding:10px">
                                <div style="background:var(--bg-tertiary);border-radius:4px;height:8px;overflow:hidden">
                                    <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#667eea,#764ba2)"></div>
                                </div>
                            </td>
                        </tr>`;
          })
          .join("");
      }
    }

    // Bảng recent calls
    const rTb = document.getElementById("ai-recent-tbody");
    if (rTb) {
      if (!d.recent?.length) {
        rTb.innerHTML =
          '<tr><td colspan="6" style="padding:18px;text-align:center;color:var(--text-secondary)">Chưa có lịch sử.</td></tr>';
      } else {
        rTb.innerHTML = d.recent
          .map(
            (r) => `
                    <tr style="border-bottom:1px solid var(--border-color)">
                        <td style="padding:8px 10px;font-size:12px;color:var(--text-secondary);white-space:nowrap">${new Date(r.createdAt).toLocaleString("vi-VN")}</td>
                        <td style="padding:8px 10px;font-size:13px">${AI_FEATURE_LABELS[r.feature] || r.feature}</td>
                        <td style="padding:8px 10px;font-family:monospace;font-size:12px;color:var(--text-secondary)">${r.model || "—"}</td>
                        <td style="padding:8px 10px;font-size:12px">${r.email || "—"}</td>
                        <td style="padding:8px 10px;text-align:right;font-family:monospace">${fmt(r.totalTokens)}</td>
                        <td style="padding:8px 10px;text-align:right;font-family:monospace">${usd(r.costUsd)}</td>
                    </tr>
                `,
          )
          .join("");
      }
    }
  } catch (err) {
    console.error("Error loading AI usage:", err);
    showToast(`Lỗi tải AI usage: ${err.message}`, "error");
  }
}

// Reload khi đổi khoảng ngày
document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("ai-usage-days")
    ?.addEventListener("change", loadTokenStats);
});

// ---- USER STATS TAB ----

async function loadUserStats(page = 1, search = null) {
  usPage = page;
  if (search !== null) usSearch = search;
  else usSearch = document.getElementById("us-search")?.value.trim() || "";
  const tbody = document.getElementById("us-tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:20px">Đang tải...</td></tr>`;

  try {
    const params = new URLSearchParams({ page, limit: 30, search: usSearch });
    const res = await fetch(`/api/admin/users-stats?${params}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    const { data, pagination } = result;
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:20px;color:var(--text-secondary)">Không có dữ liệu</td></tr>`;
      document.getElementById("us-pagination")?.replaceChildren();
      return;
    }

    const totalEl = document.getElementById("us-total");
    if (totalEl) totalEl.textContent = `Tổng: ${pagination.total} người dùng`;

    tbody.innerHTML = data
      .map(
        (u) => `
            <tr>
                <td>${u.email}</td>
                <td>${u.username || "-"}</td>
                <td style="text-align:center">${u.level}</td>
                <td style="text-align:right">${(u.xp || 0).toLocaleString()}</td>
                <td style="text-align:right">${(u.coins || 0).toLocaleString()}</td>
                <td style="text-align:right">${(u.gems || 0).toLocaleString()}</td>
                <td style="text-align:center">${u.streakCurrent}</td>
                <td style="text-align:center">${u.totalSessions}</td>
                <td style="text-align:center">${u.totalCorrect}</td>
                <td><span class="badge ${u.role === "admin" ? "badge-danger" : "badge-success"}">${u.role}</span></td>
                <td style="font-size:12px;color:var(--text-secondary)">${u.createdAt ? new Date(u.createdAt).toLocaleDateString("vi-VN") : "-"}</td>
                <td>
                    <button class="btn btn-sm btn-outline us-ach-btn"
                        data-uid="${u._id}" data-email="${u.email.replace(/"/g, "&quot;")}">
                        <i class="fas fa-trophy"></i>
                    </button>
                </td>
            </tr>
        `,
      )
      .join("");

    tbody.querySelectorAll(".us-ach-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        openUserAchievementsFor(btn.dataset.uid, btn.dataset.email),
      );
    });

    renderUsPagination(pagination);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:20px;color:var(--danger-color)">Lỗi: ${err.message}</td></tr>`;
  }
}

function renderUsPagination(pg) {
  const wrap = document.getElementById("us-pagination");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (pg.pages <= 1) return;

  const makeBtn = (label, p, disabled = false) => {
    const b = document.createElement("button");
    b.className =
      "btn btn-sm " + (p === pg.page ? "btn-primary" : "btn-outline");
    b.textContent = label;
    b.disabled = disabled;
    if (!disabled) b.onclick = () => loadUserStats(p, usSearch);
    return b;
  };

  wrap.appendChild(makeBtn("«", 1, pg.page === 1));
  wrap.appendChild(makeBtn("‹", pg.page - 1, pg.page === 1));

  const start = Math.max(1, pg.page - 2);
  const end = Math.min(pg.pages, pg.page + 2);
  for (let i = start; i <= end; i++) wrap.appendChild(makeBtn(i, i));

  wrap.appendChild(makeBtn("›", pg.page + 1, pg.page === pg.pages));
  wrap.appendChild(makeBtn("»", pg.pages, pg.page === pg.pages));
}

// ---- USER ACHIEVEMENTS TAB ----

function initUserAchievementsTab() {
  const input = document.getElementById("ua-search-input");
  if (!input || input.dataset.uaInited) return;
  input.dataset.uaInited = "1";

  input.addEventListener("input", () => {
    clearTimeout(_uaSearchTimer);
    _uaSearchTimer = setTimeout(() => loadUaUsers(1, input.value.trim()), 280);
  });

  loadUaUsers(1);
}

async function loadUaUsers(page = 1, search = null) {
  _uaPage = page;
  if (search !== null) _uaSearch = search;
  const tbody = document.getElementById("ua-tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>`;

  try {
    const params = new URLSearchParams({
      page: _uaPage,
      limit: 20,
      search: _uaSearch,
    });
    const res = await fetch(`/api/admin/users-stats?${params}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    const { data, pagination } = result;
    const totalEl = document.getElementById("ua-total");
    if (totalEl) totalEl.textContent = `${pagination.total} người dùng`;

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:32px 0">Không tìm thấy người dùng nào.</td></tr>`;
      renderUaPagination(pagination);
      return;
    }

    const offset = (_uaPage - 1) * 20;
    tbody.innerHTML = data
      .map(
        (u, idx) => `
            <tr class="ua-user-row" data-uid="${u._id}" style="cursor:pointer">
                <td style="color:var(--text-secondary)">${offset + idx + 1}</td>
                <td style="font-weight:600">${u.username || "—"}</td>
                <td>${u.email}</td>
                <td style="font-size:13px;color:var(--text-secondary)">${u.createdAt ? new Date(u.createdAt).toLocaleDateString("vi-VN") : "—"}</td>
                <td style="text-align:center"><i class="fas fa-chevron-down ua-chevron" style="transition:transform .2s;color:var(--text-secondary)"></i></td>
            </tr>
            <tr class="ua-expand-row" data-for="${u._id}" style="display:none">
                <td colspan="5" style="padding:0;background:var(--bg-secondary)">
                    <div class="ua-ach-panel" style="padding:12px 24px 16px">
                        <p style="color:var(--text-secondary);font-size:13px;margin:0"><i class="fas fa-spinner fa-spin"></i> Đang tải...</p>
                    </div>
                </td>
            </tr>
        `,
      )
      .join("");

    tbody.querySelectorAll(".ua-user-row").forEach((row) => {
      row.addEventListener("click", () => _toggleUaRow(row));
    });

    renderUaPagination(pagination);

    if (_uaAutoExpandId) {
      const targetRow = document.querySelector(
        `.ua-user-row[data-uid="${_uaAutoExpandId}"]`,
      );
      if (targetRow) {
        _uaAutoExpandId = null;
        targetRow.scrollIntoView({ behavior: "smooth", block: "center" });
        _toggleUaRow(targetRow);
      }
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger-color);padding:24px">Lỗi: ${err.message}</td></tr>`;
  }
}

function _toggleUaRow(row) {
  const uid = row.dataset.uid;
  const expandRow = row.nextElementSibling;
  if (!expandRow || !expandRow.classList.contains("ua-expand-row")) return;
  const chevron = row.querySelector(".ua-chevron");

  const isOpen = expandRow.style.display === "table-row";
  if (isOpen) {
    expandRow.style.display = "none";
    if (chevron) chevron.style.transform = "";
  } else {
    expandRow.style.display = "table-row";
    if (chevron) chevron.style.transform = "rotate(180deg)";
    if (!row.dataset.loaded) {
      row.dataset.loaded = "1";
      _loadUaAchievements(uid, expandRow.querySelector(".ua-ach-panel"));
    }
  }
}

async function _loadUaAchievements(uid, panel) {
  if (!panel) return;
  try {
    const res = await fetch(`/api/admin/user-achievements?userId=${uid}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    if (!result.data.length) {
      panel.innerHTML = `<p style="color:var(--text-secondary);font-size:13px;margin:0">Chưa có thành tích nào.</p>`;
      return;
    }

    panel.innerHTML = `
            <table style="width:100%;border-collapse:collapse;font-size:13px">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color)">
                        <th style="padding:6px 8px;text-align:left;color:var(--text-secondary);font-weight:600;width:32px">#</th>
                        <th style="padding:6px 8px;width:40px"></th>
                        <th style="padding:6px 8px;text-align:left;color:var(--text-secondary);font-weight:600">Tên thành tích</th>
                        <th style="padding:6px 8px;text-align:left;color:var(--text-secondary);font-weight:600">Mô tả</th>
                        <th style="padding:6px 8px;text-align:left;color:var(--text-secondary);font-weight:600;width:110px">Ngày đạt</th>
                        <th style="padding:6px 8px;text-align:left;color:var(--text-secondary);font-weight:600;width:190px">Phần thưởng</th>
                    </tr>
                </thead>
                <tbody>
                    ${result.data
                      .map((a, i) => {
                        const rewards = [];
                        if (a.rewardXp)
                          rewards.push(
                            `<span class="badge info">+${a.rewardXp} XP</span>`,
                          );
                        if (a.rewardCoins)
                          rewards.push(
                            `<span class="badge warning">+${a.rewardCoins} coins</span>`,
                          );
                        if (a.rewardGems)
                          rewards.push(
                            `<span class="badge success">+${a.rewardGems} gems</span>`,
                          );
                        return `<tr style="border-bottom:1px solid var(--border-color)">
                            <td style="padding:8px">${i + 1}</td>
                            <td style="padding:8px;font-size:18px;text-align:center">${a.icon || "🏆"}</td>
                            <td style="padding:8px;font-weight:600">${a.name || "—"}</td>
                            <td style="padding:8px;color:var(--text-secondary)">${a.description || ""}</td>
                            <td style="padding:8px">${new Date(a.unlockedAt).toLocaleDateString("vi-VN")}</td>
                            <td style="padding:8px">${rewards.length ? rewards.join(" ") : '<span style="color:var(--text-secondary)">—</span>'}</td>
                        </tr>`;
                      })
                      .join("")}
                </tbody>
            </table>`;
  } catch (err) {
    panel.innerHTML = `<p style="color:var(--danger-color);font-size:13px;margin:0">Lỗi: ${err.message}</p>`;
  }
}

function renderUaPagination(pagination) {
  const container = document.getElementById("ua-pagination");
  if (!container) return;
  if (!pagination || pagination.pages <= 1) {
    container.innerHTML = "";
    return;
  }
  const { page, pages } = pagination;
  let html = "";
  if (page > 1)
    html += `<button class="btn btn-sm btn-ghost" onclick="loadUaUsers(${page - 1})">‹</button>`;
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) {
    html += `<button class="btn btn-sm ${p === page ? "btn-primary" : "btn-ghost"}" onclick="loadUaUsers(${p})">${p}</button>`;
  }
  if (page < pages)
    html += `<button class="btn btn-sm btn-ghost" onclick="loadUaUsers(${page + 1})">›</button>`;
  container.innerHTML = html;
}

function openUserAchievementsFor(userId, email) {
  _uaAutoExpandId = userId;
  // Navigate to Activity tab, then switch to Thành tích sub-tab
  document.querySelector('.sidebar-link[data-main-tab="activity"]')?.click();
  setTimeout(() => {
    if (typeof activateActivitySubtab === "function") {
      activateActivitySubtab("user-achievements");
    }
    const input = document.getElementById("ua-search-input");
    if (input) input.value = email;
    loadUaUsers(1, email);
  }, 80);
}

// ---- BROADCAST TAB ----

function _initBcEmailSearch() {
  const input = document.getElementById("bc-user-email");
  const suggestions = document.getElementById("bc-user-suggestions");
  const hiddenId = document.getElementById("bc-user-id");
  const selectedLabel = document.getElementById("bc-user-selected");

  // Radio toggle: Tất cả / Người cụ thể
  document.querySelectorAll('[name="bc-target"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const isOne = radio.value === "one";
      const row = document.getElementById("bc-user-row");
      if (row) row.style.display = isOne ? "" : "none";
      document.getElementById("bc-target-all-lbl").style.borderColor = isOne
        ? "var(--border-color)"
        : "var(--primary-color)";
      document.getElementById("bc-target-one-lbl").style.borderColor = isOne
        ? "var(--primary-color)"
        : "var(--border-color)";
    });
  });

  // Filter dropdown
  document
    .getElementById("bc-filter-type")
    ?.addEventListener("change", _renderNotifList);

  // Refresh button
  document
    .getElementById("bc-history-refresh-btn")
    ?.addEventListener("click", loadNotifHistory);

  // Source filter pills (guard against double-bind)
  const pillContainer = document.querySelector(".notif-src-btn")?.parentElement;
  if (pillContainer && !pillContainer.dataset.srcBound) {
    pillContainer.dataset.srcBound = "1";
    pillContainer.addEventListener("click", (e) => {
      const btn = e.target.closest(".notif-src-btn");
      if (!btn) return;
      _notifSrc = btn.dataset.src;
      pillContainer.querySelectorAll(".notif-src-btn").forEach((b) => {
        const active = b === btn;
        b.style.background = active ? "var(--primary-color)" : "transparent";
        b.style.color = active ? "#fff" : "var(--text-secondary)";
        b.style.borderColor = active
          ? "var(--primary-color)"
          : "var(--border-color)";
        b.classList.toggle("active", active);
      });
      _updateNotifTypeOptions();
      _renderNotifList();
    });
  }

  if (!input) return;
  input.addEventListener("input", () => {
    if (hiddenId) hiddenId.value = "";
    if (selectedLabel) selectedLabel.style.display = "none";
    clearTimeout(_bcSearchTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      if (suggestions) suggestions.style.display = "none";
      return;
    }
    _bcSearchTimer = setTimeout(() => _bcSearchUsers(q), 300);
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (suggestions) suggestions.style.display = "none";
    }, 200);
  });
}

async function _bcSearchUsers(q) {
  const suggestions = document.getElementById("bc-user-suggestions");
  if (!suggestions) return;
  try {
    const res = await fetch(
      `/api/admin/users-stats?search=${encodeURIComponent(q)}&limit=6`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    );
    const result = await res.json();
    const users = result.data || [];
    if (!users.length) {
      suggestions.style.display = "none";
      return;
    }

    suggestions.innerHTML = users
      .map(
        (u) => `
            <div class="bc-suggest-item" data-id="${u._id}" data-email="${u.email}"
              style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border-color);">
              <div style="font-weight:600;color:var(--text-primary)">${u.email}</div>
              ${u.displayName || u.username ? `<div style="font-size:11px;color:var(--text-secondary)">${u.displayName || u.username}</div>` : ""}
            </div>
        `,
      )
      .join("");
    suggestions.style.display = "block";

    suggestions.querySelectorAll(".bc-suggest-item").forEach((item) => {
      item.addEventListener("mouseenter", () => {
        item.style.background = "var(--bg-secondary)";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "";
      });
      item.addEventListener("mousedown", () => {
        const id = item.dataset.id;
        const email = item.dataset.email;
        document.getElementById("bc-user-id").value = id;
        document.getElementById("bc-user-email").value = email;
        const label = document.getElementById("bc-user-selected");
        if (label) {
          label.textContent = `✓ Đã chọn: ${email}`;
          label.style.display = "block";
        }
        suggestions.style.display = "none";
      });
    });
  } catch (_) {
    suggestions.style.display = "none";
  }
}

async function sendBroadcast() {
  const title = document.getElementById("bc-title")?.value.trim();
  const body = document.getElementById("bc-body")?.value.trim();
  const type = document.getElementById("bc-type")?.value || "system";
  const target =
    document.querySelector('[name="bc-target"]:checked')?.value || "all";
  const userId = document.getElementById("bc-user-id")?.value || "";
  const userEmail =
    document.getElementById("bc-user-email")?.value.trim() || "";
  const btn = document.getElementById("bc-send-btn");

  if (!title) {
    showToast("Tiêu đề không được trống", "error");
    return;
  }
  if (target === "one" && !userEmail) {
    showToast("Vui lòng chọn người dùng cụ thể", "error");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi...';
  }

  try {
    const giftCoins =
      parseInt(document.getElementById("bc-gift-coins")?.value) || 0;
    const giftGems =
      parseInt(document.getElementById("bc-gift-gems")?.value) || 0;
    const giftXp = parseInt(document.getElementById("bc-gift-xp")?.value) || 0;
    const giftItems = (typeof _collectItemRows === "function") ? _collectItemRows("bc-gift-items-rows") : [];

    const payload = { title, body, type };
    if (target === "one") {
      if (userId) payload.userId = userId;
      if (userEmail) payload.userEmail = userEmail;
    }
    if (giftCoins || giftGems || giftXp || giftItems.length)
      payload.gift = { coins: giftCoins, gems: giftGems, xp: giftXp, items: giftItems };

    const res = await fetch("/api/admin/notifications/broadcast", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    const sentTo = target === "all" ? "tất cả người dùng" : userEmail;
    showToast(`Đã gửi thành công → ${sentTo}`, "success");

    document.getElementById("bc-title").value = "";
    document.getElementById("bc-body").value = "";
    document.getElementById("bc-user-email").value = "";
    document.getElementById("bc-user-id").value = "";
    ["bc-gift-coins", "bc-gift-gems", "bc-gift-xp"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    if (typeof _renderItemRows === "function") _renderItemRows("bc-gift-items-rows", []);
    const lbl = document.getElementById("bc-user-selected");
    if (lbl) lbl.style.display = "none";
    loadNotifHistory();
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Gửi thông báo';
    }
  }
}

const ADMIN_NOTIF_TYPES = new Set([
  "system",
  "reward",
  "reminder",
  "violation",
]);
const AUTO_NOTIF_TYPES = new Set(["achievement", "quest"]);

function _updateNotifTypeOptions() {
  const sel = document.getElementById("bc-filter-type");
  if (!sel) return;
  sel.querySelectorAll("option").forEach((opt) => {
    if (!opt.value) return; // "Tất cả loại" — always visible
    const isAdmin = ADMIN_NOTIF_TYPES.has(opt.value);
    const isAuto = AUTO_NOTIF_TYPES.has(opt.value);
    if (_notifSrc === "admin") opt.style.display = isAdmin ? "" : "none";
    else if (_notifSrc === "auto") opt.style.display = isAuto ? "" : "none";
    else opt.style.display = "";
  });
  // Reset selection if current value is hidden
  const cur = sel.value;
  if (
    cur &&
    ((_notifSrc === "admin" && !ADMIN_NOTIF_TYPES.has(cur)) ||
      (_notifSrc === "auto" && !AUTO_NOTIF_TYPES.has(cur)))
  ) {
    sel.value = "";
  }
}

function _renderNotifList() {
  const list = document.getElementById("bc-history");
  if (!list) return;

  const filterType = document.getElementById("bc-filter-type")?.value || "";

  let data = _notifData;
  if (_notifSrc === "admin")
    data = data.filter((n) => ADMIN_NOTIF_TYPES.has(n.type));
  else if (_notifSrc === "auto")
    data = data.filter((n) => AUTO_NOTIF_TYPES.has(n.type));
  if (filterType) data = data.filter((n) => n.type === filterType);

  if (!data.length) {
    list.innerHTML =
      '<p style="color:var(--text-secondary);font-size:13px;padding:20px;text-align:center">Không có thông báo nào.</p>';
    return;
  }

  list.innerHTML = data
    .map((n) => {
      const meta = NOTIF_TYPE_META[n.type] || {
        label: n.type,
        color: "#6b7280",
        bg: "rgba(107,114,128,.15)",
      };
      const isGlobal = !n.userId;
      const recipientHtml = isGlobal
        ? '<span style="color:#3b82f6;font-weight:600">👥 Tất cả người dùng</span>'
        : `<span>${n.userId?.email || "?"}</span>`;
      const readHtml = !isGlobal
        ? n.read
          ? ' · <span style="color:#10b981">✓ Đã đọc</span>'
          : ' · <span style="color:#f59e0b">Chưa đọc</span>'
        : "";
      const g = n.gift || {};
      const gItems = Array.isArray(g.items) ? g.items : [];
      const hasGift = g.coins > 0 || g.gems > 0 || g.xp > 0 || gItems.length > 0;
      const giftHtml = hasGift
        ? `
            <div style="display:flex;gap:10px;margin-top:6px;font-size:12px;flex-wrap:wrap">
                ${g.coins > 0 ? `<span>🪙 <b>${g.coins}</b> coins</span>` : ""}
                ${g.gems > 0 ? `<span>💎 <b>${g.gems}</b> gems</span>` : ""}
                ${g.xp > 0 ? `<span>⭐ <b>${g.xp}</b> XP</span>` : ""}
                ${gItems.map(function(i){return '<span>📦 <b>'+i.itemId+'</b>×'+(i.quantity||1)+'</span>';}).join("")}
            </div>`
        : "";
      return `
        <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:12px 14px" id="nhi-${n._id}">
            <div style="display:flex;align-items:center;gap:8px">
                <span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:${meta.bg};color:${meta.color};border:1px solid ${meta.color}33;white-space:nowrap">${meta.label}</span>
                <span style="color:var(--text-secondary);font-size:12px">${new Date(n.createdAt).toLocaleString("vi-VN")}</span>
                <button class="btn btn-sm nhi-del-btn" data-id="${n._id}" style="margin-left:auto;background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.3);padding:2px 8px;font-size:11px;border-radius:6px"><i class="fas fa-trash"></i></button>
            </div>
            <div style="font-weight:600;margin-top:7px;font-size:14px">${n.title}</div>
            ${n.body ? `<div style="color:var(--text-secondary);font-size:13px;margin-top:2px">${n.body}</div>` : ""}
            <div style="font-size:12px;color:var(--text-secondary);margin-top:5px">${recipientHtml}${readHtml}</div>
            ${giftHtml}
        </div>`;
    })
    .join("");

  list.querySelectorAll(".nhi-del-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteNotif(btn.dataset.id, btn));
  });
}

async function loadNotifHistory() {
  const list = document.getElementById("bc-history");
  if (!list) return;
  list.innerHTML =
    '<p style="color:var(--text-secondary);padding:20px;text-align:center"><i class="fas fa-spinner fa-spin"></i> Đang tải...</p>';

  try {
    const res = await fetch("/api/admin/notifications?limit=50", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);
    _notifData = result.data || [];
    _renderNotifList();
  } catch (err) {
    list.innerHTML = `<p style="color:var(--danger-color);padding:16px">Lỗi: ${err.message}</p>`;
  }
}

async function deleteNotif(id, btn) {
  if (!confirm("Xóa thông báo này?")) return;
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`/api/admin/notifications/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);
    document.getElementById(`nhi-${id}`)?.remove();
    _notifData = _notifData.filter((n) => n._id !== id);
    showToast("Đã xóa", "success");
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, "error");
    if (btn) btn.disabled = false;
  }
}

// ---- PRACTICE HISTORY 12 MODES TAB ----

async function loadPracticeHistory12(page = 1, search = null, mode = null) {
  phPage = page;
  if (search === null)
    search = document.getElementById("ph-search")?.value.trim() || "";
  if (mode === null) mode = document.getElementById("ph-mode")?.value || "";

  const tbody = document.getElementById("ph-tbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:20px">Đang tải...</td></tr>`;

  try {
    const params = new URLSearchParams({ page, limit: 20, search, mode });
    const res = await fetch(`/api/practice/admin/history?${params}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);

    const { data, pagination } = result;
    const totalEl = document.getElementById("ph-total");
    if (totalEl) totalEl.textContent = `Tổng: ${pagination.total} phiên`;

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--text-secondary)">Không có dữ liệu</td></tr>`;
      document.getElementById("ph-pagination")?.replaceChildren();
      return;
    }

    tbody.innerHTML = data
      .map((s) => {
        const dur = s.duration
          ? `${Math.floor(s.duration / 60)}p${s.duration % 60}s`
          : "-";
        const date = s.completedAt
          ? new Date(s.completedAt).toLocaleDateString("vi-VN")
          : "-";
        const acc =
          s.questionsCount > 0
            ? Math.round((s.correctAnswers / s.questionsCount) * 100)
            : 0;
        return `<tr>
                <td>${s.user?.email || "-"}</td>
                <td><span class="badge badge-info">${MODE_LABELS[s.mode] || s.mode}</span></td>
                <td style="text-align:right">${s.score || 0}</td>
                <td style="text-align:center;color:var(--success-color)">${s.correctAnswers || 0}</td>
                <td style="text-align:center;color:var(--danger-color)">${s.wrongAnswers || 0}</td>
                <td style="text-align:right">${s.xpEarned || 0}</td>
                <td style="text-align:right">${s.coinsEarned || 0}</td>
                <td>${dur}</td>
                <td style="font-size:12px;color:var(--text-secondary)">${date}</td>
                <td>
                    <button class="btn btn-sm btn-danger ph-del-btn" data-id="${s._id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
      })
      .join("");

    tbody.querySelectorAll(".ph-del-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        deletePracticeSession12(btn.dataset.id, btn),
      );
    });

    renderPhPagination(pagination);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--danger-color)">Lỗi: ${err.message}</td></tr>`;
  }
}

function renderPhPagination(pg) {
  const wrap = document.getElementById("ph-pagination");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (pg.pages <= 1) return;

  const makeBtn = (label, p, disabled = false) => {
    const b = document.createElement("button");
    b.className =
      "btn btn-sm " + (p === pg.page ? "btn-primary" : "btn-outline");
    b.textContent = label;
    b.disabled = disabled;
    if (!disabled) b.onclick = () => loadPracticeHistory12(p);
    return b;
  };

  wrap.appendChild(makeBtn("«", 1, pg.page === 1));
  wrap.appendChild(makeBtn("‹", pg.page - 1, pg.page === 1));
  const start = Math.max(1, pg.page - 2);
  const end = Math.min(pg.pages, pg.page + 2);
  for (let i = start; i <= end; i++) wrap.appendChild(makeBtn(i, i));
  wrap.appendChild(makeBtn("›", pg.page + 1, pg.page === pg.pages));
  wrap.appendChild(makeBtn("»", pg.pages, pg.page === pg.pages));
}

async function deletePracticeSession12(id, btn) {
  if (!confirm("Xóa phiên luyện tập này?")) return;
  btn.disabled = true;
  try {
    const res = await fetch(`/api/practice/admin/session/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);
    btn.closest("tr").remove();
    showToast("Đã xóa", "success");
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, "error");
    btn.disabled = false;
  }
}

// ---- SEED FUNCTIONS ----

async function seedAchievements() {
  if (
    !confirm(
      "Seed dữ liệu thành tích mặc định vào DB? Sẽ bỏ qua những cái đã có.",
    )
  )
    return;
  try {
    const res = await fetch("/api/admin/seed-achievements", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);
    showToast(result.message, "success");
    loadAchievements();
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, "error");
  }
}

async function seedQuests() {
  if (
    !confirm(
      "Seed dữ liệu nhiệm vụ mặc định vào DB? Sẽ bỏ qua những cái đã có.",
    )
  )
    return;
  try {
    const res = await fetch("/api/admin/seed-quests", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);
    showToast(result.message, "success");
    loadQuests();
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, "error");
  }
}

// Phase B: xoá toàn bộ user_quests để sang period kế tiếp sinh lại với
// startSnapshot mới. Dùng 1 lần sau khi đổi sang source='computed'.
async function resetUserQuests() {
  if (
    !confirm(
      "XOÁ TOÀN BỘ user_quests của MỌI user?\nMất tiến độ period hiện tại nhưng quest sẽ tự sinh lại sạch (kèm snapshot baseline) ở period kế tiếp.",
    )
  )
    return;
  try {
    const res = await fetch("/api/quests/reset-user-quests", {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message);
    showToast(result.message, "success");
  } catch (err) {
    showToast(`Lỗi: ${err.message}`, "error");
  }
}

// ---- STUBS for tabs not yet implemented ----

function loadAchievements() {
  console.warn("loadAchievements: not implemented");
}
function loadQuests() {
  console.warn("loadQuests: not implemented");
}
