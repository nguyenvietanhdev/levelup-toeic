// ===================================================================
// TRÌNH DỰNG NHÓM CÂU HỎI (Part 3/4/6/7) — 1 ngữ cảnh, nhiều câu.
// Media chung (audio/ảnh) nhập MỘT LẦN; groupId + index do server tự sinh.
// Dùng chung các global: IMAGE_RULES, TOEIC_API_BASE, getToken, showToast,
// loadQuestions, loadTestSourceOptions (nạp sau toeic.js trong dashboard.html).
// ===================================================================
let groupImageUrls = [];        // ảnh chung của nhóm
let groupAudioUrl = '';         // audio chung của nhóm
let groupQCounter = 0;          // đảm bảo name radio duy nhất giữa các hàng
let editingGroupId = null;      // khác null = đang SỬA một màn có sẵn

/**
 * Mở trình dựng nhóm. Trước đây là popup, giờ là TAB DỌC riêng — nên chuyển
 * tab rồi mới dựng lại form. Giữ nguyên tên vì nút "+ Nhóm câu" đang gọi.
 * Truyền setId = sửa cả màn (nhiều câu một lượt) thay vì tạo mới.
 */
function openGroupModal(setId = null) {
    document.querySelector('.sidebar-link[data-main-tab="toeic-group"]')?.click();
    resetGroupBuilder();
    if (setId) fillGroupBuilder(setId);
}

/** Đổ dữ liệu một màn có sẵn vào trình dựng để sửa cả loạt câu. */
async function fillGroupBuilder(setId) {
    // Ưu tiên dữ liệu bảng đang mở; không có (đổi trang, tải lại) thì hỏi server.
    let set = (currentQuestions || []).find(q => q._id === setId);
    if (!set) {
        try {
            const res = await fetch(`${TOEIC_API_BASE}/questions/${setId}`, {
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            set = data.data;
        } catch (e) {
            showToast(`Không tải được màn hỏi: ${e.message}`, 'error');
            return;
        }
    }

    editingGroupId = setId;
    groupAudioUrl = set.audioUrl || '';
    groupImageUrls = Array.isArray(set.imageUrls) ? [...set.imageUrls] : [];

    document.getElementById('group-part').value = String(set.part);
    document.getElementById('group-source').value = set.source || '';
    document.getElementById('group-passage-count').value = set.passageCount || '';

    if (groupAudioUrl) {
        document.getElementById('group-audio-player').src = groupAudioUrl;
        document.getElementById('group-audio-preview').style.display = 'block';
    }
    renderGroupImages();

    // Dựng lại đúng số hàng câu con, giữ nguyên số câu đã đánh.
    const container = document.getElementById('group-questions-container');
    container.innerHTML = '';
    (set.questions || []).forEach(q => container.appendChild(makeGroupQuestionRow(q)));
    if (!container.querySelectorAll('.group-q-row').length) container.appendChild(makeGroupQuestionRow());
    renumberGroupQuestions();

    groupUpdatePartVisibility();
    syncGroupEditMode();
}

/** Đổi nhãn tiêu đề + nút Lưu theo chế độ đang tạo mới hay đang sửa. */
function syncGroupEditMode() {
    const title = document.getElementById('group-builder-title');
    const btn = document.getElementById('btn-submit-group');
    const isEdit = !!editingGroupId;
    if (title) {
        title.innerHTML = isEdit
            ? '<i class="fas fa-pen-to-square"></i> Sửa nhóm câu (Part 3·4·6·7)'
            : '<i class="fas fa-layer-group"></i> Thêm nhóm câu (Part 3·4·6·7)';
    }
    if (btn) {
        btn.innerHTML = isEdit
            ? '<i class="fas fa-save"></i> Lưu thay đổi'
            : '<i class="fas fa-layer-group"></i> Tạo nhóm';
    }
}

/** "Xoá trắng": dựng lại trình dựng từ đầu thay vì đóng popup như trước. */
function closeGroupModal() {
    resetGroupBuilder();
}

function resetGroupBuilder() {
    groupImageUrls = [];
    groupAudioUrl = '';
    groupQCounter = 0;
    editingGroupId = null;
    syncGroupEditMode();
    document.getElementById('group-part').value = '3';
    document.getElementById('group-source').value = '';
    document.getElementById('group-audio-file').value = '';
    document.getElementById('group-audio-preview').style.display = 'none';
    document.getElementById('group-audio-player').src = '';
    document.getElementById('group-audio-status').style.display = 'none';
    document.getElementById('group-image-file').value = '';
    document.getElementById('group-image-status').style.display = 'none';
    document.getElementById('group-passage-count').value = '';
    renderGroupImages();

    // 2 câu con mặc định (nhóm cần tối thiểu 2).
    const container = document.getElementById('group-questions-container');
    container.innerHTML = '';
    container.appendChild(makeGroupQuestionRow());
    container.appendChild(makeGroupQuestionRow());
    renumberGroupQuestions();

    // Reset tab JSON
    const gj = document.getElementById('group-json-input');
    const gr = document.getElementById('group-json-result');
    if (gj) gj.value = '';
    if (gr) gr.style.display = 'none';
    const gjp = document.getElementById('group-json-part');
    const gjs = document.getElementById('group-json-source');
    if (gjp) gjp.value = '3';
    if (gjs) gjs.value = '';
    switchGroupTab('manual');

    if (typeof loadTestSourceOptions === 'function') loadTestSourceOptions();
    groupUpdatePartVisibility();
}

// Lần đầu vào tab mới dựng form; các lần sau giữ nguyên để không mất công gõ.
let _groupTabInited = false;
async function initToeicGroupTab() {
    if (typeof loadTestSourceOptions === 'function') loadTestSourceOptions();
    if (_groupTabInited) return;
    _groupTabInited = true;

    resetGroupBuilder();
    if (typeof ensurePromptsLoaded === 'function') await ensurePromptsLoaded();
    if (typeof initPromptEditor === 'function') initPromptEditor('group', ['3', '4', '6', '7']);
}
window.initToeicGroupTab = initToeicGroupTab;

// Chuyển tab Trình dựng / Nhập JSON trong modal nhóm.
function switchGroupTab(tab) {
    const manual = document.getElementById('group-manual-panel');
    const json = document.getElementById('group-json-panel');
    const tabManual = document.getElementById('group-tab-manual');
    const tabJson = document.getElementById('group-tab-json');
    const btnCreate = document.getElementById('btn-submit-group');
    const btnImport = document.getElementById('btn-group-submit-json');
    const on = { background: 'var(--primary)', color: '#fff' };
    const off = { background: '#f5f5f5', color: '#666' };
    const isJson = tab === 'json';
    manual.style.display = isJson ? 'none' : 'block';
    json.style.display = isJson ? 'block' : 'none';
    Object.assign(tabManual.style, isJson ? off : on);
    Object.assign(tabJson.style, isJson ? on : off);
    btnCreate.style.display = isJson ? 'none' : 'inline-block';
    btnImport.style.display = isJson ? 'inline-block' : 'none';
}

// Ẩn/hiện field media theo Part đang chọn trong modal nhóm.
function groupUpdatePartVisibility() {
    const part = parseInt(document.getElementById('group-part').value);
    const rule = IMAGE_RULES[part] || { min: 0, max: 0 };
    // Audio chỉ có ở Part nghe 3/4.
    const audioField = document.getElementById('group-audio-field');
    const imageField = document.getElementById('group-image-field');
    const hasAudio = (part === 3 || part === 4);
    audioField.style.display = hasAudio ? 'block' : 'none';
    // Part 3/4 hiện cả audio lẫn ảnh → xếp cạnh nhau; Part 6/7 chỉ ảnh → trọn hàng.
    audioField.style.gridColumn = hasAudio ? 'auto' : '1 / -1';
    imageField.style.gridColumn = hasAudio ? 'auto' : '1 / -1';
    // Ảnh: Part 6/7 bắt buộc, 3/4 tùy chọn.
    const hint = document.getElementById('group-image-hint');
    if (hint) hint.textContent = rule.max > 1
        ? `— tối đa ${rule.max} ảnh${rule.min > 0 ? ' (bắt buộc)' : ''}`
        : (rule.min > 0 ? '— 1 ảnh (bắt buộc)' : '— tối đa 1 ảnh (tùy chọn)');
    document.getElementById('group-passage-count-field').style.display = part === 7 ? 'block' : 'none';
    syncGroupQuestionTextVisibility(part);
}

// Part 6 (điền chỗ trống) KHÔNG có câu hỏi riêng — giống Part 1, chỉ 4 đáp án.
// Ẩn ô "Nội dung câu hỏi" ở mọi hàng khi Part = 6.
function syncGroupQuestionTextVisibility(part) {
    const hide = parseInt(part) === 6;
    document.querySelectorAll('#group-questions-container .gq-text').forEach(inp => {
        inp.style.display = hide ? 'none' : 'block';
        if (hide) inp.value = '';
    });
}

function renderGroupImages() {
    const box = document.getElementById('group-images-container');
    if (!box) return;
    box.innerHTML = groupImageUrls.map((url, i) => `
        <div style="position:relative;border:2px solid #e0e0e0;border-radius:8px;overflow:hidden">
            <img src="${url}" alt="" style="width:96px;height:70px;object-fit:cover;display:block"
                 onerror="this.style.display='none';this.parentNode.querySelector('.gimg-fb').style.display='flex'">
            <div class="gimg-fb" style="display:none;width:96px;height:70px;align-items:center;justify-content:center;color:#9ca3af;font-size:10px;text-align:center;padding:4px">${url.split('/').pop()}</div>
            <button type="button" data-gimg="${i}" title="Xóa ảnh"
                style="position:absolute;top:2px;right:2px;background:rgba(220,38,38,.9);color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;line-height:1">×</button>
        </div>`).join('');
    box.querySelectorAll('[data-gimg]').forEach(btn => {
        btn.onclick = () => { groupImageUrls.splice(parseInt(btn.dataset.gimg), 1); renderGroupImages(); };
    });
}

// Escape để giá trị nạp sẵn không phá thuộc tính HTML.
function _gqAttr(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// 1 hàng câu hỏi con: số câu + nội dung + 4 đáp án (radio chọn đúng) + giải thích + xóa.
// `data` (tùy chọn) là một câu con có sẵn — dùng khi SỬA cả nhóm.
function makeGroupQuestionRow(data = null) {
    const id = ++groupQCounter;
    const wrap = document.createElement('div');
    wrap.className = 'group-q-row';
    wrap.dataset.qid = id;
    wrap.style.cssText = 'border:1.5px solid var(--border-color,#e5e7eb);border-radius:10px;padding:12px;margin-bottom:10px;position:relative';

    const optText = (L) => (data?.options || []).find(o => o.label === L)?.text || '';
    const opt = (L) => `
        <div style="display:flex;gap:6px;align-items:center">
            <input type="radio" name="gq-correct-${id}" value="${L}" style="width:16px;height:16px;flex-shrink:0"
                title="Đáp án đúng" ${data?.correctAnswer === L ? 'checked' : ''}>
            <span style="width:16px;font-weight:600">${L}</span>
            <input type="text" class="gq-opt" data-label="${L}" placeholder="Đáp án ${L}${L === 'D' ? ' (tùy chọn)' : ''}"
                value="${_gqAttr(optText(L))}"
                style="flex:1;padding:7px;border:1px solid var(--border-color,#e0e0e0);border-radius:6px">
        </div>`;

    const expVal = data?.explanation && typeof data.explanation === 'object'
        ? JSON.stringify(data.explanation, null, 2)
        : (data?.explanation || '');

    wrap.innerHTML = `
        <button type="button" class="gq-del" title="Xóa câu này"
            style="position:absolute;top:8px;right:8px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;width:26px;height:26px;cursor:pointer">×</button>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span style="font-weight:600;color:#6366f1"><i class="fas fa-circle-question"></i> <span class="gq-num"></span></span>
            <label style="margin:0;color:var(--text-secondary)">Số câu</label>
            <input type="number" class="gq-number" min="1" max="200" value="${_gqAttr(data?.number ?? '')}"
                placeholder="tự đánh" title="Để trống = server tự đánh theo chuẩn Part"
                style="width:96px;padding:6px 8px;border:1px solid var(--border-color,#e0e0e0);border-radius:6px">
        </div>
        <input type="text" class="gq-text" placeholder="Nội dung câu hỏi..." value="${_gqAttr(data?.questionText)}"
            style="width:100%;padding:8px;border:1px solid var(--border-color,#e0e0e0);border-radius:6px;margin-bottom:8px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-bottom:8px">
            ${opt('A')}${opt('B')}${opt('C')}${opt('D')}
        </div>
        <textarea class="gq-exp" rows="5" placeholder='Giải thích (tùy chọn) — có thể dán JSON {"A":"...","B":"..."}'
            style="width:100%;padding:8px;border:1px solid var(--border-color,#e0e0e0);border-radius:6px;font-family:inherit;min-height:110px;resize:vertical">${_gqAttr(expVal)}</textarea>`;
    wrap.querySelector('.gq-del').onclick = () => {
        const container = document.getElementById('group-questions-container');
        // Tạo mới thì nhóm phải từ 2 câu; đang SỬA thì cho về 1 (màn cũ có thể 1 câu).
        const floor = editingGroupId ? 1 : 2;
        if (container.querySelectorAll('.group-q-row').length <= floor) {
            alert(`Cần giữ tối thiểu ${floor} câu.`);
            return;
        }
        wrap.remove();
        renumberGroupQuestions();
    };
    return wrap;
}

function renumberGroupQuestions() {
    document.querySelectorAll('#group-questions-container .group-q-row').forEach((row, i) => {
        const num = row.querySelector('.gq-num');
        if (num) num.textContent = `Câu ${i + 1}`;
    });
}

async function handleGroupAudioUpload(file) {
    const status = document.getElementById('group-audio-status');
    const preview = document.getElementById('group-audio-preview');
    const player = document.getElementById('group-audio-player');
    const fileInput = document.getElementById('group-audio-file');
    if (!file.type.startsWith('audio') && !file.name.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) {
        alert('Chỉ nhận file audio (MP3, WAV, OGG, M4A, AAC)!'); fileInput.value = ''; return;
    }
    if (file.size > 10 * 1024 * 1024) { alert('File audio tối đa 10MB!'); fileInput.value = ''; return; }
    status.style.display = 'block';
    try {
        const fd = new FormData(); fd.append('audio', file);
        const src = encodeURIComponent(document.getElementById('group-source')?.value.trim() || '');
        const res = await fetch(`${TOEIC_API_BASE}/upload/audio?source=${src}`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` }, body: fd,
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Upload failed');
        groupAudioUrl = data.audioUrl;
        player.src = data.audioUrl;
        preview.style.display = 'block';
    } catch (e) {
        alert('Tải audio lỗi: ' + e.message);
    } finally {
        status.style.display = 'none';
    }
}

async function handleGroupImageUpload(file) {
    const status = document.getElementById('group-image-status');
    const fileInput = document.getElementById('group-image-file');
    const part = parseInt(document.getElementById('group-part').value);
    const max = IMAGE_RULES[part]?.max || 0;
    if (groupImageUrls.length >= max) {
        alert(max === 0 ? `Part ${part} không dùng ảnh.` : `Part ${part} tối đa ${max} ảnh.`);
        fileInput.value = ''; return;
    }
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
        alert('Chỉ nhận file ảnh (JPEG, PNG, GIF, WEBP)!'); fileInput.value = ''; return;
    }
    if (file.size > 5 * 1024 * 1024) { alert('Ảnh tối đa 5MB!'); fileInput.value = ''; return; }
    status.style.display = 'block';
    try {
        const fd = new FormData(); fd.append('image', file);
        const src = encodeURIComponent(document.getElementById('group-source')?.value.trim() || '');
        const res = await fetch(`${TOEIC_API_BASE}/upload/part1-image?source=${src}`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` }, body: fd,
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Upload failed');
        groupImageUrls.push(data.imageUrl);
        renderGroupImages();
        fileInput.value = '';
    } catch (e) {
        alert('Tải ảnh lỗi: ' + e.message);
    } finally {
        status.style.display = 'none';
    }
}

function collectGroupQuestions() {
    return Array.from(document.querySelectorAll('#group-questions-container .group-q-row')).map(row => {
        const options = Array.from(row.querySelectorAll('.gq-opt'))
            .map(inp => ({ label: inp.dataset.label, text: inp.value.trim() }))
            .filter(o => o.text);
        const correctAnswer = row.querySelector('input[type="radio"]:checked')?.value || null;
        const expRaw = row.querySelector('.gq-exp').value.trim();
        let explanation;
        if (expRaw) { try { explanation = JSON.parse(expRaw); } catch { explanation = { note: expRaw }; } }
        // Để trống số câu → server tự đánh theo chuẩn Part của bộ đề đó.
        const numRaw = row.querySelector('.gq-number')?.value.trim();
        return {
            number: numRaw ? parseInt(numRaw) : undefined,
            questionText: row.querySelector('.gq-text').value.trim(),
            options,
            correctAnswer,
            explanation,
        };
    });
}

async function submitGroup() {
    const part = parseInt(document.getElementById('group-part').value);
    const source = document.getElementById('group-source').value.trim();
    if (!source) { alert('Vui lòng nhập Source (mã đề)!'); return; }

    const rule = IMAGE_RULES[part] || { min: 0, max: 0 };
    if (rule.min > 0 && groupImageUrls.length < rule.min) {
        alert(`Part ${part} cần ít nhất ${rule.min} ảnh chung.`); return;
    }
    if ((part === 3 || part === 4) && !groupAudioUrl) {
        alert(`Part ${part} cần file audio chung.`); return;
    }

    const questions = collectGroupQuestions();
    // Tạo mới: nhóm phải từ 2 câu. Sửa: cho phép màn 1 câu đã có sẵn trong DB.
    const minQ = editingGroupId ? 1 : 2;
    if (questions.length < minQ) { alert(`Nhóm cần tối thiểu ${minQ} câu.`); return; }
    for (let i = 0; i < questions.length; i++) {
        if (questions[i].options.length < 3) { alert(`Câu ${i + 1}: cần tối thiểu 3 đáp án.`); return; }
        if (!questions[i].correctAnswer) { alert(`Câu ${i + 1}: chưa chọn đáp án đúng.`); return; }
    }

    // Sửa màn có sẵn → PUT vào chính màn đó; tạo mới → POST đường tạo nhóm.
    const isEdit = !!editingGroupId;
    const url = isEdit ? `${TOEIC_API_BASE}/questions/${editingGroupId}` : `${TOEIC_API_BASE}/questions/group`;

    const btn = document.getElementById('btn-submit-group');
    btn.disabled = true; btn.textContent = isEdit ? 'Đang lưu...' : 'Đang tạo...';
    try {
        const res = await fetch(url, {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify({
                part, source,
                audioUrl: groupAudioUrl || undefined,
                imageUrls: groupImageUrls,
                passageCount: document.getElementById('group-passage-count').value || undefined,
                questions,
            }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Server error');
        showToast(data.message || (isEdit ? 'Đã lưu thay đổi' : 'Đã tạo nhóm'), 'success');
        if (isEdit) {
            // Sửa xong nhảy thẳng về bảng Câu hỏi TOEIC (tab đó tự loadQuestions).
            resetGroupBuilder();
            document.querySelector('.sidebar-link[data-main-tab="toeic-questions"]')?.click();
        } else {
            // Tạo xong dọn form để nhập nhóm kế tiếp, tải lại bảng ngầm.
            closeGroupModal();
            if (typeof loadQuestions === 'function') loadQuestions();
        }
    } catch (e) {
        alert((isEdit ? 'Lưu nhóm lỗi: ' : 'Tạo nhóm lỗi: ') + e.message);
    } finally {
        btn.disabled = false;
        syncGroupEditMode();
    }
}
