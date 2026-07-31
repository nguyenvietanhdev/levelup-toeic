// modules/utils.js — Utility functions

// ===================================
// 2. UTILITY FUNCTIONS
// ===================================

const debounce = (func, delay) => {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

/**
 * Truncate string to specified length
 */
function truncate(str, maxLength) {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
}

/**
 * Chuẩn hóa object từ vựng theo 9 keys bắt buộc
 */
function normalizeVocabularyObject(item) {
    const REQUIRED_KEYS = ['en', 'vn', 'phonetic', 'part', 'synonyms', 'type', 'image'];
    const normalized = {};

    for (const key of REQUIRED_KEYS) {
        if (key in item && item[key] !== undefined && item[key] !== '') {
            normalized[key] = item[key];
        } else {
            // Giá trị mặc định cho các keys thiếu
            normalized[key] = null;
        }
    }

    return normalized;
}

/**
 * [PHẦN QUÉT DỮ LIỆU ĐỘNG]
 * Lấy danh sách duy nhất các Part có trong database/file vocabulary.json.
 * Yêu cầu API backend phải có endpoint /api/vocabulary/parts trả về mảng chuỗi ['N', 'V', 'ADJ', 'E2XA-P1', ...].
 */
async function fetchUniqueVocabParts() {
    try {
        // Gọi API để quét toàn bộ data và chỉ trả về danh sách các Part duy nhất
        const res = await fetch(`${API_URL}/vocabulary/parts?lang=${encodeURIComponent(vocabCurrentLang || 'en')}`);
        const data = await res.json();

        if (data.success && Array.isArray(data.data)) {
            return data.data.sort((a, b) => a.localeCompare(b));
        }
    } catch (error) {
        console.error("Lỗi khi quét danh sách Parts duy nhất từ API:", error);
    }
    // Fallback: Trả về một danh sách Parts tiêu chuẩn nếu API bị lỗi.
    return ['N', 'V', 'ADJ', 'ADV', 'PHR', 'OTHERS', 'E2XA-P1', 'E2XA-P2'];
}

// Hàm xử lý sự kiện change cho Filter Part
function handleVocabFilterChange(e) {
    const newPart = e.target.value;
    vocabCurrentPart = newPart;

    console.log(`🏷️ Part filter changed: "${newPart}", localData=${localVocabularyData.length}`);

    // Use local filter if we have local data loaded
    if (localVocabularyData && localVocabularyData.length > 0) {
        console.log(`📋 Using LOCAL filter`);
        displayLocalVocabulary();
    } else {
        console.log(`🌐 Using API filter`);
        // Reset về trang 1 và gọi hàm loadVocabulary để thực hiện LỌC
        loadVocabulary(1, newPart);
    }
}

// ===================================================================
// PHÂN TRANG DÙNG CHUNG
// Một kiểu nav cho mọi bảng: "1–50 / 7826 từ  « 1 2 3 4 5 »".
// Trước đây mỗi bảng tự vẽ một kiểu (bảng từ vựng gọn thế này, TOEIC lại
// là một khối xám to đùng), nhìn như hai sản phẩm khác nhau.
// ===================================================================

/**
 * @param {string} containerId  id thẻ chứa
 * @param {object} opts  { page, limit, total, itemName, onPage, maxButtons }
 *        onPage(page) — gọi khi bấm số trang.
 * Chỉ có 1 trang thì vẫn hiện dòng "x–y / tổng" để biết đang xem bao nhiêu.
 */
function renderPager(containerId, { page, limit, total, itemName = 'mục', onPage, maxButtons = 5 }) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (!total) {
        container.innerHTML = `<span class="pager-info">Không có ${itemName} nào.</span>`;
        return;
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));
    const current = Math.min(Math.max(1, page), totalPages);
    const from = (current - 1) * limit + 1;
    const to = Math.min(current * limit, total);

    const wrap = document.createElement('div');
    wrap.className = 'pager';

    const info = document.createElement('span');
    info.className = 'pager-info';
    info.innerHTML = `${from}–${to} / <strong>${total}</strong> ${itemName}`;
    wrap.appendChild(info);

    if (totalPages > 1) {
        // Cửa sổ số trang trượt quanh trang hiện tại, luôn đủ maxButtons nút.
        let start = Math.max(1, current - Math.floor(maxButtons / 2));
        let end = Math.min(totalPages, start + maxButtons - 1);
        if (end - start < maxButtons - 1) start = Math.max(1, end - maxButtons + 1);

        const makeBtn = (label, target, disabled, active) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pager-btn' + (active ? ' active' : '');
            b.innerHTML = label;
            b.disabled = !!disabled;
            if (!disabled && !active) b.addEventListener('click', () => onPage?.(target));
            return b;
        };

        wrap.appendChild(makeBtn('&laquo;', current - 1, current <= 1, false));
        for (let p = start; p <= end; p++) wrap.appendChild(makeBtn(p, p, false, p === current));
        wrap.appendChild(makeBtn('&raquo;', current + 1, current >= totalPages, false));
    }

    container.appendChild(wrap);
}
