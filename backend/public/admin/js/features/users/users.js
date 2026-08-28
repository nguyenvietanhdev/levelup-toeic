// ===================================
// 5. USER MANAGEMENT FUNCTIONS
// ===================================

/**
 * Đồng bộ NHÃN + ví dụ của hai ô từ/nghĩa theo kho đang chọn.
 *
 * Dùng chung cho cả THÊM và SỬA — hai đường mở cùng một modal, mà chép rời thì
 * một bên sửa một bên quên (đã xảy ra thật: đường sửa vẫn thiếu kho song ngữ).
 *
 * Lỗi cũ: selector tìm `label[for="word-en"]` nhưng HTML không khai `for` nào,
 * nên biến nhãn luôn `null` và `if` nuốt luôn — nhãn kẹt ở "Tiếng Anh" ngay
 * trên ô có ví dụ chữ Hán, mà không có lỗi nào báo.
 */
const NHAN_O_TU = {
    en: { tu: 'Tiếng Anh', vd: 'ex: developer', nghia: 'Tiếng Việt', vdNghia: 'người cung cấp đồ ăn' },
    zh: { tu: 'Từ Tiếng Trung (ZH)', vd: 'vd: 男朋友', nghia: 'Tiếng Việt', vdNghia: 'bạn trai' },
    // Kho song ngữ học Trung ↔ Anh: ô thứ hai là nghĩa TIẾNG ANH, không phải
    // tiếng Việt. Để nhãn "Tiếng Việt" ở đó là người nhập gõ nhầm ngôn ngữ vào
    // đúng ô làm đáp án.
    bi: { tu: 'Từ Tiếng Trung (ZH)', vd: 'vd: 你好', nghia: 'Nghĩa Tiếng Anh', vdNghia: 'ex: hello' },
};

function dongBoNhanOTu(modal, lang) {
    const nhan = NHAN_O_TU[lang] || NHAN_O_TU.en;
    const batBuoc = ' <span style="color:#ef4444">*</span>';

    const oTu = modal.querySelector('label[for="word-en"]');
    if (oTu) oTu.innerHTML = nhan.tu + batBuoc;
    const inTu = document.getElementById('word-en');
    if (inTu) inTu.placeholder = nhan.vd;

    const oNghia = modal.querySelector('label[for="word-vn"]');
    if (oNghia) oNghia.innerHTML = nhan.nghia + batBuoc;
    const inNghia = document.getElementById('word-vn');
    if (inNghia) inNghia.placeholder = nhan.vdNghia;
}

/** Huy hiệu ngôn ngữ trên tiêu đề modal. Dùng chung THÊM và SỬA. */
function huyHieuNgonNgu(lang) {
    const ve = (nen, chu, vien, nhan) =>
        `<span style="margin-left:8px;font-size:11px;padding:2px 8px;border-radius:12px;background:${nen};color:${chu};border:1px solid ${vien};font-weight:700">${nhan}</span>`;
    if (lang === 'zh') return ve('#f0fdf4', '#16a34a', '#bbf7d0', '🇨🇳 Chinese');
    if (lang === 'bi') return ve('#faf5ff', '#7c3aed', '#e9d5ff', '🔀 Trung–Anh');
    return ve('#eff6ff', '#2563eb', '#bfdbfe', '🇬🇧 English');
}

let userEditMode = false;

function hideUsersModal() {
  document.getElementById("manage-users-modal").style.display = "none";
}

function hideUserFormModal() {
  document.getElementById("user-form-modal").style.display = "none";
}

function openUserFormModal(title, mode, userData = {}) {
  const userFormModal = document.getElementById("user-form-modal");
  const userModalTitle = userFormModal.querySelector("h3");
  const passwordInput = document.getElementById("user-password");

  userModalTitle.textContent = title;
  userEditMode = mode === "edit";

  document.getElementById("edit-user-id").value = userData.id || "";
  document.getElementById("user-username").value = userData.username || "";
  document.getElementById("user-email").value = userData.email || "";
  document.getElementById("user-role").value = userData.role || "user";
  document.getElementById("user-lock-status").value = userData.isLocked
    ? "true"
    : "false";
  document.getElementById("user-lock-row").style.display = userEditMode
    ? ""
    : "none";
  passwordInput.value = "";

  const passwordLabel = passwordInput.closest("div").querySelector("label");
  if (userEditMode) {
    passwordLabel.innerHTML =
      "Mat khau <small>(de trong neu khong doi)</small>";
    passwordInput.required = false;
  } else {
    passwordLabel.innerHTML = "Mat khau *";
    passwordInput.required = true;
  }

  userFormModal.style.display = "flex";
}

async function loadUsers() {
  const tbody = document.querySelector("#users-table tbody");
  tbody.innerHTML = `<tr><td colspan="8" class="loading"><i class="fas fa-spinner"></i> Dang tai danh sach tai khoan...</td></tr>`;

  try {
    const res = await fetch(`${API_URL}/users`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();

    if (data.success) {
      allUsers = data.data || [];
      displayUsers();
    } else {
      const dangerColor = getComputedStyle(document.documentElement)
        .getPropertyValue("--danger")
        .trim();
      tbody.innerHTML = `<tr><td colspan="7" class="loading" style="color: ${dangerColor}">Loi tai du lieu: ${esc(data.message)}</td></tr>`;
    }
  } catch (err) {
    console.error("Error loading users:", err);
    const dangerColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--danger")
      .trim();
    tbody.innerHTML = `<tr><td colspan="7" class="loading" style="color: ${dangerColor}">Loi ket noi API</td></tr>`;
  }
}

function displayUsers() {
  const tbody = document.querySelector("#users-table tbody");

  usersPagination.total = allUsers.length;
  usersPagination.totalPages = Math.ceil(
    allUsers.length / usersPagination.limit,
  );

  if (usersPagination.currentPage > usersPagination.totalPages) {
    usersPagination.currentPage = 1;
  }

  const start = (usersPagination.currentPage - 1) * usersPagination.limit;
  const end = start + usersPagination.limit;
  const paginatedUsers = allUsers.slice(start, end);

  if (!paginatedUsers || !paginatedUsers.length) {
    tbody.innerHTML =
      '<tr><td colspan="8" style="text-align:center;padding:30px;">Khong tim thay tai khoan nao</td></tr>';
    renderPager("users-modal-pagination", {
      page: usersPagination.currentPage,
      limit: usersPagination.limit,
      total: usersPagination.total,
      itemName: "tài khoản",
      onPage: (page) => {
        usersPagination.currentPage = page;
        displayUsers();
        document
          .querySelector("#users-table")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    });
    return;
  }

  tbody.innerHTML = paginatedUsers
    .map((u) => {
      const userId = u._id || u.id;
      const createdAt = new Date(u.createdAt).toLocaleDateString("vi-VN");
      const lockInfo =
        u.lockUntil && new Date(u.lockUntil) > new Date()
          ? ` <small style="font-size:10px;opacity:0.8">den ${new Date(u.lockUntil).toLocaleTimeString("vi-VN")}</small>`
          : "";
      const statusBadge = u.isLocked
        ? `<span class="badge danger">Locked (Admin)</span>`
        : u.lockUntil && new Date(u.lockUntil) > new Date()
          ? `<span class="badge warning">Locked (Tam thoi)${lockInfo}</span>`
          : u.isActive
            ? `<span class="badge success">Active</span>`
            : `<span class="badge danger">Inactive</span>`;
      const roleBadge =
        u.role === "admin"
          ? `<span class="badge danger">${u.role.toUpperCase()}</span>`
          : `<span class="badge info">${u.role.toUpperCase()}</span>`;
      const isTempLocked = u.lockUntil && new Date(u.lockUntil) > new Date();
      const lockBadge = u.isLocked
        ? `<span class="badge danger">Locked (Admin)</span>`
        : isTempLocked
          ? `<span class="badge warning">Locked (Tam thoi)</span>`
          : `<span class="badge success">Unlock</span>`;

      return `
          <tr>
            <td>${userId}</td>
            <td><strong>${esc(u.username)}</strong></td>
            <td>${esc(u.email || "-")}</td>
            <td>${roleBadge}</td>
            <td>${createdAt}</td>
            <td>${statusBadge}</td>
            <td>${lockBadge}</td>
            <td>
                <button class="btn btn-primary btn-sm btn-user-edit" data-id="${esc(userId)}" data-username="${esc(u.username)}" data-email="${esc(u.email)}" data-role="${esc(u.role)}" data-locked="${u.isLocked ? "true" : "false"}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-user-togglelock ${u.isLocked ? "btn-success" : "btn-warning"}"
                    data-id="${esc(userId)}" data-username="${esc(u.username)}" data-locked="${u.isLocked ? "true" : "false"}">
                    <i class="fas ${u.isLocked ? "fa-lock-open" : "fa-lock"}"></i>
                </button>
                <button class="btn btn-danger btn-sm btn-user-delete" data-id="${esc(userId)}" data-username="${esc(u.username)}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
          </tr>
        `;
    })
    .join("");

  attachUserListeners();
  renderPager("users-modal-pagination", {
    page: usersPagination.currentPage,
    limit: usersPagination.limit,
    total: usersPagination.total,
    itemName: "tài khoản",
    onPage: (page) => {
      usersPagination.currentPage = page;
      displayUsers();
      document
        .querySelector("#users-table")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  });
}

function attachUserListeners() {
  document.querySelectorAll(".btn-user-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      openUserFormModal("Sua thong tin tai khoan", "edit", {
        id: btn.dataset.id,
        username: btn.dataset.username,
        email: btn.dataset.email,
        role: btn.dataset.role,
        isLocked: btn.dataset.locked === "true",
      });
    });
  });

  document.querySelectorAll(".btn-user-togglelock").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const username = btn.dataset.username;
      const currentlyLocked = btn.dataset.locked === "true";
      const action = currentlyLocked ? "mo khoa" : "khoa";

      if (!confirm(`Ban co chac muon ${action} tai khoan "${username}"?`))
        return;

      btn.disabled = true;
      try {
        const res = await fetch(`${API_URL}/users/${id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ isLocked: !currentlyLocked }),
        });
        const data = await res.json();
        if (data.success) {
          await loadUsers();
        } else {
          alert("Loi: " + (data.message || "Khong the thuc hien."));
        }
      } catch {
        alert("Loi ket noi.");
      } finally {
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll(".btn-user-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const username = btn.dataset.username;
      if (
        !confirm(
          `Ban co chac chan muon XOA tai khoan "${username}" (ID: ${id})?`,
        )
      )
        return;

      try {
        const res = await fetch(`${API_URL}/users/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (data.success) {
          setTimeout(async () => {
            await loadUsers();
            await loadRecentActivities();
            alert("Tai khoan da duoc xoa thanh cong!");
          }, 200);
        } else {
          alert("Loi: " + (data.message || "Khong the xoa tai khoan."));
        }
      } catch (error) {
        alert("Loi ket noi: Khong the thuc hien thao tac xoa.");
      }
    });
  });
}

document.getElementById("user-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("edit-user-id").value;
  const password = document.getElementById("user-password").value;

  const payload = {
    username: document.getElementById("user-username").value,
    email: document.getElementById("user-email").value,
    role: document.getElementById("user-role").value,
  };

  if (userEditMode) {
    payload.isLocked =
      document.getElementById("user-lock-status").value === "true";
  }

  if (password) {
    payload.password = password;
  } else if (!userEditMode) {
    alert("Vui long nhap mat khau cho tai khoan moi.");
    return;
  }

  const method = id ? "PUT" : "POST";
  const url = id ? `${API_URL}/users/${id}` : `${API_URL}/users`;

  try {
    const res = await fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.success) {
      hideUserFormModal();
      setTimeout(async () => {
        await Promise.all([
          loadUsers(),
          loadUsersInTab(),
          loadRecentActivities(),
        ]);
        alert(
          id
            ? "Thong tin tai khoan da duoc luu thanh cong!"
            : "Da them tai khoan moi thanh cong!",
        );
      }, 200);
    } else {
      alert("Loi: " + (data.message || "Khong the thuc hien thao tac."));
    }
  } catch (error) {
    alert("Loi ket noi: Khong the gui du lieu nguoi dung.");
  }
});

// ===================================
// 6. INITIALIZATION EVENT LISTENERS
// ===================================

document.addEventListener("DOMContentLoaded", () => {
  // #btn-refresh do ui-init.js nối. Trước đây CẢ HAI file cùng nối vào id này,
  // nhưng nút chưa tồn tại trong HTML nên không ai thấy. Từ lúc nút được thêm vào
  // tab Tổng quan, đăng ký trùng nghĩa là mỗi lần bấm chạy refreshData hai lần —
  // gấp đôi request lên một server có khi đang ngủ đông.

  const usersModal = document.getElementById("manage-users-modal");

  document.getElementById("btn-manage-users")?.addEventListener("click", () => {
    if (usersModal) {
      usersModal.style.display = "flex";
      loadUsers();
    }
  });

  document
    .getElementById("close-users-modal")
    ?.addEventListener("click", hideUsersModal);
  document
    .getElementById("btn-add-user")
    ?.addEventListener("click", () =>
      openUserFormModal("Them tai khoan moi", "add"),
    );
  document
    .getElementById("cancel-user-form")
    ?.addEventListener("click", hideUserFormModal);

  document
    .getElementById("btn-add-vocabulary")
    ?.addEventListener("click", () => {
      const modal = document.getElementById("add-word-modal");
      if (modal) {
        document.getElementById("add-word-form").reset();
        delete modal.dataset.editMode;
        delete modal.dataset.originalEn;
        const lang = typeof vocabCurrentLang !== "undefined" ? vocabCurrentLang : "en";
        modal.querySelector("h3").innerHTML = "+ Add New Word " + huyHieuNgonNgu(lang);
        modal.querySelector('button[type="submit"]').textContent = "Add Word";
        if (typeof switchWordModalTab === "function")
          switchWordModalTab("manual");

        dongBoNhanOTu(modal, lang);

        modal.style.display = "flex";
      }
    });

  document
    .getElementById("btn-scan-duplicates")
    ?.addEventListener("click", () => {
      if (typeof openScanDuplicatesDialog === "function") openScanDuplicatesDialog();
      else scanDuplicates();
    });
  document
    .getElementById("btn-filter-delete-vocab")
    ?.addEventListener("click", () => {
      if (typeof showFilterDeleteVocabModal === "function")
        showFilterDeleteVocabModal();
    });
  document
    .getElementById("btn-delete-all-vocab")
    ?.addEventListener("click", () => {
      if (typeof deleteAllVocabulary === "function") deleteAllVocabulary();
    });

  document.getElementById("btn-close-modal")?.addEventListener("click", () => {
    if (typeof closeWordModal === "function") closeWordModal();
  });
  document
    .getElementById("btn-close-modal-json")
    ?.addEventListener("click", () => {
      if (typeof closeWordModal === "function") closeWordModal();
    });
  document.getElementById("btn-submit-json")?.addEventListener("click", () => {
    if (typeof submitJsonImport === "function") submitJsonImport();
  });

  document.getElementById("tab-manual")?.addEventListener("click", () => {
    if (typeof switchWordModalTab === "function") switchWordModalTab("manual");
  });
  document.getElementById("tab-json")?.addEventListener("click", () => {
    if (typeof switchWordModalTab === "function") switchWordModalTab("json");
  });

  if (typeof initPartFilterDropdown === "function") initPartFilterDropdown();

  // Type mutual-exclusion (chọn đơn thì xóa cụm và ngược lại)
  document.getElementById("word-type")?.addEventListener("change", function () {
    if (this.value) document.getElementById("word-type-phrase").value = "";
  });
  document
    .getElementById("word-type-phrase")
    ?.addEventListener("change", function () {
      if (this.value) document.getElementById("word-type").value = "";
    });

  document
    .getElementById("btn-ai-fill")
    ?.addEventListener("click", async () => {
      const wordInput = document.getElementById("word-en");
      const word = wordInput?.value.trim();
      if (!word) {
        showToast("Vui long nhap tu tieng Anh truoc!", "warning");
        wordInput?.focus();
        return;
      }

      const btn = document.getElementById("btn-ai-fill");
      const originalText = btn.innerHTML;
      try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Dang tra...';
        btn.disabled = true;
        const response = await fetch(`${API_URL}/ai/lookup-word`, {
          method: "POST",
          headers: adminHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ word }),
        });
        const result = await response.json();
        if (result.success && result.data) {
          const data = result.data;
          if (data.vn) document.getElementById("word-vn").value = data.vn;
          if (data.phonetic)
            document.getElementById("word-phonetic").value = data.phonetic;
          if (data.synonyms)
            document.getElementById("word-synonyms").value = data.synonyms;
          if (data.example)
            document.getElementById("word-example").value = data.example;
          if (data.level) {
            const lv = document.getElementById("word-level");
            if (lv) lv.value = data.level.toUpperCase();
          }
          if (data.type) {
            const normalizedType = data.type.toLowerCase().trim();
            const sel1 = document.getElementById("word-type");
            const sel2 = document.getElementById("word-type-phrase");
            sel1.value = "";
            sel2.value = "";
            if (
              sel1 &&
              Array.from(sel1.options).some((o) => o.value === normalizedType)
            ) {
              sel1.value = normalizedType;
            } else if (
              sel2 &&
              Array.from(sel2.options).some((o) => o.value === normalizedType)
            ) {
              sel2.value = normalizedType;
            }
          }
          showToast(`Da dien thong tin cho "${word}" bang AI!`, "success");
        } else {
          showToast(`${result.message || "Khong the tra cuu tu nay"}`, "error");
        }
      } catch (error) {
        showToast(`Loi ket noi: ${error.message}`, "error");
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });

  document
    .getElementById("btn-copy-word-prompt")
    ?.addEventListener("click", () => {
      const lang = typeof vocabCurrentLang !== "undefined" ? vocabCurrentLang : "en";
      const wordVal = document.getElementById("word-en")?.value.trim();
      const partVal = document.getElementById("word-part")?.value.trim();
      const sourceVal = document.getElementById("word-sources")?.value.trim();

      let prompt;
      if (lang === "bi") {
        // Kho song ngữ: KHÔNG có key `vn`. Học Trung ↔ Anh thì `en` chính là
        // đáp án, nên prompt phải nói rõ — để AI tự thêm `vn` thì Mongoose
        // lặng lẽ vứt đi (schema không khai) và người nhập không biết.
        const hint = wordVal ? `Từ tiếng Trung: "${wordVal}". ` : "";
        prompt = `${hint}Hãy tạo 5 object JSON từ vựng SONG NGỮ Trung–Anh theo định dạng sau.

QUAN TRỌNG: Kho này học Trung ↔ Anh, KHÔNG qua tiếng Việt. TUYỆT ĐỐI không thêm key "vn".
[
  {
    "zh": "汉字",
    "en": "english meaning",
    "phoneticZh": "pīnyīn có dấu thanh",
    "phoneticEn": "/IPA/",
    "synonymsZh": "同义词1, 同义词2",
    "synonymsEn": "synonym1, synonym2",
    "exampleZh": "Câu ví dụ bằng tiếng Trung.",
    "exampleEn": "English example sentence.",
    "part": "${partVal || 'Chào hỏi'}",
    "type": "名词",
    "level": "HSK1",
    "source": "${sourceVal || 'song_ngu'}"
  }
]
Quy tắc:
- "zh" → chữ Hán giản thể, giữ nguyên, KHÔNG phiên âm sang chữ Latin
- "en" → nghĩa tiếng Anh (viết thường), đây là ĐÁP ÁN khi luyện tập
- "phoneticZh" → pinyin CÓ DẤU THANH (nǐ hǎo), KHÔNG phải IPA
- "phoneticEn" → phiên âm IPA của từ tiếng Anh
- "level" → khung HSK (HSK1…HSK6, HSK7-9), KHÔNG dùng A1/B2
- "synonymsZh" → đồng nghĩa BẰNG CHỮ HÁN; "synonymsEn" → đồng nghĩa tiếng Anh.
  Tách đôi vì đồng nghĩa phải cùng ngôn ngữ với mặt đang học. Không có thì để ""
- KHÔNG có key "vn", KHÔNG có key "phonetic", "example", "synonyms" (dùng bản tách đôi)
Chỉ trả về JSON array, không giải thích thêm.`;
      } else if (lang === "zh") {
        const hint = wordVal ? `Từ tiếng Trung: "${wordVal}". ` : "";
        prompt = `${hint}Hãy tạo 5 object JSON từ vựng tiếng Trung theo định dạng sau (KHÔNG có key "en", key "vn" là nghĩa tiếng Việt):
[
  {
    "zh": "汉字",
    "vn": "nghĩa tiếng việt",
    "phonetic": "pīnyīn",
    "part": "${partVal || 'HSK1'}",
    "type": "名词",
    "level": "A1",
    "synonyms": "từ đồng nghĩa 1, từ đồng nghĩa 2",
    "image": "images/pages/hsk1/tu.jpg",
    "example": "Câu ví dụ bằng tiếng Trung.",
    "source": "${sourceVal || 'hsk1'}"
  }
]
Chỉ trả về JSON array, không giải thích thêm.`;
      } else {
        const hint = wordVal ? `Word: "${wordVal}". ` : "";
        prompt = `${hint}Hãy tạo 5 object JSON từ vựng tiếng Anh theo định dạng sau:
[
  {
    "en": "word",
    "vn": "nghĩa tiếng việt",
    "phonetic": "/fəˈnɛtɪk/",
    "part": "${partVal || 'ETS2026'}",
    "type": "noun",
    "level": "B1",
    "synonyms": "synonym1, synonym2",
    "image": "images/pages/part/word.jpg",
    "example": "Example sentence using the word.",
    "source": "${sourceVal || 'ets2026'}"
  }
]
Chỉ trả về JSON array, không giải thích thêm.`;
      }

      navigator.clipboard.writeText(prompt).then(() => {
        const copyBtn = document.getElementById("btn-copy-word-prompt");
        if (copyBtn) {
          const orig = copyBtn.innerHTML;
          copyBtn.innerHTML = '<i class="fas fa-check"></i> Đã copy!';
          copyBtn.style.background = "var(--success, #22c55e)";
          copyBtn.style.color = "#fff";
          copyBtn.style.borderColor = "transparent";
          setTimeout(() => {
            copyBtn.innerHTML = orig;
            copyBtn.style.background = "";
            copyBtn.style.color = "";
            copyBtn.style.borderColor = "";
          }, 2000);
        }
        showToast("Đã copy prompt! Dán vào ChatGPT hoặc Claude để lấy JSON.", "success");
      }).catch(() => {
        showToast("Không copy được, thử lại!", "error");
      });
    });

  document
    .getElementById("add-word-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const modal = document.getElementById("add-word-modal");
      const editMode = modal.dataset.editMode === "true";
      const originalWord = modal.dataset.originalEn; // Đây là từ gốc (EN hoặc ZH)
      const currentLang =
        typeof vocabCurrentLang !== "undefined" ? vocabCurrentLang : "en";

      const wordData = {
        [currentLang]: document
          .getElementById("word-en")
          .value.trim()
          .toLowerCase(),
        vn: document.getElementById("word-vn").value.trim().toLowerCase(),
        phonetic: document.getElementById("word-phonetic").value.trim(),
        part: document.getElementById("word-part").value.trim().toUpperCase(),
        type:
          document.getElementById("word-type").value ||
          document.getElementById("word-type-phrase").value,
        level:
          document.getElementById("word-level")?.value.trim().toUpperCase() ||
          "",
        synonyms: document
          .getElementById("word-synonyms")
          .value.trim()
          .toLowerCase(),
        image: document.getElementById("word-image").value.trim().toLowerCase(),
        example: document.getElementById("word-example").value.trim(),
        source: (
          document.getElementById("word-sources")?.value.trim() || "custom"
        ).toLowerCase(),
      };
      if (!wordData[currentLang] || !wordData.vn || !wordData.part || !wordData.type) {
        showToast("Vui long dien day du thong tin bat buoc", "error");
        return;
      }
      try {
        let res, data;
        if (editMode) {
          res = await fetch(
            withVocabLang(
              `${API_URL}/vocabulary/${encodeURIComponent(originalWord)}`,
            ),
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${getToken()}`,
              },
              body: JSON.stringify(wordData),
            },
          );
        } else {
          res = await fetch(withVocabLang(`${API_URL}/vocabulary`), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getToken()}`,
            },
            body: JSON.stringify(wordData),
          });
        }
        data = await res.json();
        if (data.success) {
          modal.style.display = "none";
          document.getElementById("add-word-form").reset();
          delete modal.dataset.editMode;
          delete modal.dataset.originalEn;
          modal.querySelector("h3").innerHTML = "+ Add New Word";
          modal.querySelector('button[type="submit"]').textContent = "Add Word";
          setTimeout(async () => {
            if (editMode) {
              await loadVocabulary(vocabCurrentPage, vocabCurrentPart);
            } else {
              vocabCurrentPage = 1;
              vocabCurrentPart = "";
              await loadVocabulary(1, "");
            }
            await loadVocabularyStats();
            await loadRecentActivities();
            alert(
              editMode
                ? "Tu vung da duoc cap nhat thanh cong!"
                : "Tu vung da duoc them thanh cong!",
            );
          }, 200);
        } else {
          alert(
            "Loi: " +
              (data.message ||
                `Khong the ${editMode ? "cap nhat" : "them"} tu vung.`),
          );
        }
      } catch (error) {
        alert(
          `Loi ket noi: Khong the ${editMode ? "cap nhat" : "them"} tu vung.`,
        );
      }
    });

  document
    .getElementById("action-btn-export-vocab")
    ?.addEventListener("click", async () => {
      try {
        const res = await fetch(
          `${API_URL}/vocabulary?limit=10000&lang=${encodeURIComponent(vocabCurrentLang || "en")}&raw=1`,
        );
        const data = await res.json();
        if (data.success) {
          const blob = new Blob([JSON.stringify(data.data, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `vocabulary-export-${new Date().toISOString().split("T")[0]}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          alert("Da xuat file vocabulary thanh cong!");
        }
      } catch (error) {
        alert("Loi khi xuat file: " + error.message);
      }
    });

  document
    .getElementById("action-btn-backup-db")
    ?.addEventListener("click", async () => {
      try {
        const vocabRes = await fetch(
          `${API_URL}/vocabulary?limit=10000&lang=${encodeURIComponent(vocabCurrentLang || "en")}&raw=1`,
        );
        const vocabData = await vocabRes.json();
        const usersRes = await fetch(`${API_URL}/users`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const usersData = await usersRes.json();
        const backup = {
          timestamp: new Date().toISOString(),
          vocabulary: vocabData.data || [],
          users: usersData.data || [],
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `backup-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert("Da backup database thanh cong!");
      } catch (error) {
        alert("Loi khi backup: " + error.message);
      }
    });

  document
    .getElementById("action-btn-view-users")
    ?.addEventListener("click", () => {
      document.getElementById("btn-manage-users")?.click();
    });

  document
    .getElementById("action-btn-reload-cache")
    ?.addEventListener("click", async () => {
      if (confirm("Ban co chac muon tai lai du lieu tu file?")) {
        try {
          await fetch("/health");
          alert("Da reload cache thanh cong!");
          loadDashboard();
        } catch (error) {
          alert("Loi khi reload cache: " + error.message);
        }
      }
    });

  document
    .getElementById("action-btn-quick-delete")
    ?.addEventListener("click", async () => {
      if (!confirm("Ban co muon bat dau quet va xoa nhanh tu vung?")) return;
      await startQuickDelete();
    });

  document
    .getElementById("btn-quick-delete-close")
    ?.addEventListener("click", () => stopQuickDelete());
});
