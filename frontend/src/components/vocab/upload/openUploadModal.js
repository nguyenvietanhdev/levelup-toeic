// ===================================
// UPLOAD VOCABULARY MODAL
// ===================================
// Self-contained imperative modal (DOM/innerHTML + Modal API). Relocated
// verbatim out of TopNav.jsx — it used no React state/props/hooks
// (useCallback deps were []), so this is a pure move. A proper React
// rewrite of this modal is a later, separate effort.

import { createElement } from 'react';
import { Modal } from '@ui/Modal.jsx';
import TabbedModalBody from './TabbedModalBody.jsx';
import { UploadVocabAPI } from '@api/uploadVocab.js';
import { normalizeVocabItem } from '@/services/vocabUpload.js';
import { downloadWords } from '@/services/vocabExport.js';

// Retention options (days) the user can pick when uploading private vocab.
const RETENTION_OPTIONS = [3, 7, 14, 30];
const DEFAULT_RETENTION = 30;

export function openUploadModal({ tab } = {}) {
        const TYPE1 = ['noun','verb','adjective','adverb','pronoun','preposition','conjunction','interjection','article','determiner','auxiliary'];
        const TYPE2 = ['noun phrase','verb phrase','adjective phrase','adverb phrase','prepositional phrase','participle phrase','gerund phrase','infinitive phrase'];
        const opts1 = ['<option value="">— Loại từ —</option>', ...TYPE1.map(t => `<option value="${t}">${t}</option>`)].join('');
        const opts2 = ['<option value="">— Cụm từ —</option>', ...TYPE2.map(t => `<option value="${t}">${t}</option>`)].join('');

        let _lastSource = '';
        let _lastPart = '';

        const resultHtml = (type, msg) => {
            const c = type === 'success'
                ? { bg:'#dcfce7', border:'#86efac', text:'#16a34a', icon:'fa-check-circle' }
                : { bg:'#fee2e2', border:'#fca5a5', text:'#dc2626', icon:'fa-exclamation-circle' };
            return `<div style="background:${c.bg};border:1px solid ${c.border};border-radius:6px;padding:10px 12px;margin-top:10px">
                <div style="color:${c.text};font-weight:600;font-size:13px;white-space:pre-line"><i class="fas ${c.icon}"></i> ${msg}</div></div>`;
        };

        const fieldHtml = (id, label, placeholder, required = false, transform = 'none') => `
            <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text-primary)">
                    ${label}${required ? ' <span style="color:#ef4444">*</span>' : ''}
                </label>
                <input type="text" id="vocab-${id}" placeholder="${placeholder}"
                    style="width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-tertiary,var(--bg-secondary));color:var(--text-primary);text-transform:${transform}">
            </div>`;

        const addTabHtml = () => `
            <p style="margin:0 0 14px;font-size:13px;color:var(--text-secondary)">
                Điền thông tin từ vựng. Các trường <span style="color:#ef4444">*</span> là bắt buộc.<br>
                <small>• <code>part</code> và <code>level</code> sẽ viết HOA. Các trường khác viết thường. <code>example</code> tự viết hoa chữ cái đầu.</small>
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
                ${fieldHtml('en', 'English', 'caterer', true, 'lowercase')}
                ${fieldHtml('vn', 'Vietnamese', 'người cung cấp đồ ăn', false, 'lowercase')}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
                ${fieldHtml('part', 'Part', 'ETS26T10-RC', true, 'uppercase')}
                ${fieldHtml('source', 'Source', 'ets2026', true, 'lowercase')}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
                <div>
                    <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text-primary)">Type (đơn)</label>
                    <select id="vocab-type1" style="width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-tertiary,var(--bg-secondary));color:var(--text-primary)">${opts1}</select>
                </div>
                <div>
                    <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text-primary)">Type (cụm)</label>
                    <select id="vocab-type2" style="width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-tertiary,var(--bg-secondary));color:var(--text-primary)">${opts2}</select>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
                ${fieldHtml('level', 'Level', 'B2', false, 'uppercase')}
                ${fieldHtml('phonetic', 'Phonetic', 'ˈkeɪtərər')}
            </div>
            <div style="margin-bottom:10px">${fieldHtml('example', 'Example', 'The caterer provided lunch for the entire staff.')}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
                ${fieldHtml('synonyms', 'Synonyms', 'food provider', false, 'lowercase')}
                ${fieldHtml('image', 'Image path', 'images/pages/ets26t10-rc/caterer.jpg', false, 'lowercase')}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;align-items:end">
                ${retentionFieldHtml('vocab-retention')}
                <div style="font-size:11px;color:var(--text-secondary);padding-bottom:9px">
                    <i class="fas fa-circle-info"></i> Hết hạn sẽ tự xóa — bạn sẽ bị nhắc xuất file trước 3 ngày.
                </div>
            </div>
            <div style="text-align:right;margin-bottom:10px">
                <button id="vocab-save-btn" class="btn btn-primary" style="min-width:100px"><i class="fas fa-save"></i> Lưu từ</button>
            </div>
            <div id="upload-form-result"></div>`;

        const manageTabHtml = () => `
            <div id="manage-container">
                <p style="font-size:13px;color:var(--text-secondary);margin:0 0 12px"><i class="fas fa-spinner fa-spin"></i> Đang tải danh sách...</p>
            </div>`;

        const jsonTabHtml = () => `
            <p style="margin:0 0 12px;font-size:13px;color:var(--text-secondary)">
                <i class="fas fa-robot"></i> Tạo prompt cho AI (ChatGPT / Claude...) để chuyển danh sách từ sang JSON đúng định dạng.
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
                <div>
                    <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text-primary)">Source <span style="color:#ef4444">*</span></label>
                    <input id="json-source" type="text" value="${_lastSource}" placeholder="ets2026"
                        style="width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-tertiary,var(--bg-secondary));color:var(--text-primary);text-transform:lowercase">
                </div>
                <div>
                    <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text-primary)">Part <span style="color:#ef4444">*</span></label>
                    <input id="json-part" type="text" value="${_lastPart}" placeholder="ETS26T10-RC"
                        style="width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-tertiary,var(--bg-secondary));color:var(--text-primary);text-transform:uppercase">
                </div>
            </div>
            <button id="json-copy-prompt-btn" class="btn btn-primary" style="width:100%;margin-bottom:14px;font-size:13px">
                <i class="fas fa-copy"></i> Copy Prompt cho AI
            </button>
            <div style="margin-bottom:12px;max-width:200px">
                ${retentionFieldHtml('json-retention')}
            </div>
            <div style="margin-bottom:6px;font-size:12px;font-weight:600;color:var(--text-primary)"><i class="fas fa-paste"></i> Dán JSON kết quả từ AI vào đây:</div>
            <textarea id="json-result-area" rows="8"
                placeholder='[{"en":"caterer","vn":"người cung cấp đồ ăn","phonetic":"ˈkeɪtərər","part":"ETS26T10-RC","synonyms":"food provider","type":"noun","image":"images/pages/ets26t10-rc/caterer.jpg","example":"The caterer provided lunch.","level":"B2","source":"ets2026"}]'
                style="width:100%;padding:10px;border:1px solid var(--border-color);border-radius:6px;font-size:12px;font-family:monospace;background:var(--bg-tertiary,var(--bg-secondary));color:var(--text-primary);resize:vertical;margin-bottom:10px"></textarea>
            <button id="json-submit-btn" class="btn btn-primary" style="width:100%"><i class="fas fa-upload"></i> Gửi JSON vào hệ thống</button>
            <div id="json-tab-result"></div>`;

        const saveAddTabState = () => {
            const src = document.getElementById('vocab-source')?.value.trim();
            const part = document.getElementById('vocab-part')?.value.trim();
            if (src) _lastSource = src.toLowerCase();
            if (part) _lastPart = part.toUpperCase();
        };
        const saveJsonTabState = () => {
            const src = document.getElementById('json-source')?.value.trim();
            const part = document.getElementById('json-part')?.value.trim();
            if (src) _lastSource = src.toLowerCase();
            if (part) _lastPart = part.toUpperCase();
        };

        const attachAddHandlers = () => {
            const t1 = document.getElementById('vocab-type1');
            const t2 = document.getElementById('vocab-type2');
            t1?.addEventListener('change', () => { if (t1.value) t2.value = ''; });
            t2?.addEventListener('change', () => { if (t2.value) t1.value = ''; });

            document.getElementById('vocab-save-btn')?.addEventListener('click', async () => {
                const en = document.getElementById('vocab-en')?.value.trim();
                const part = document.getElementById('vocab-part')?.value.trim();
                const source = document.getElementById('vocab-source')?.value.trim();
                const resultDiv = document.getElementById('upload-form-result');
                if (!en || !part || !source) {
                    resultDiv.innerHTML = resultHtml('error', 'English, Part và Source là bắt buộc');
                    return;
                }
                const type1 = t1?.value; const type2 = t2?.value;
                if (type1 && type2) { resultDiv.innerHTML = resultHtml('error', 'Chỉ chọn 1 trong 2 cột Type'); return; }
                const payload = normalizeVocabItem({ en, vn: document.getElementById('vocab-vn')?.value, part, source,
                    type: type1 || type2, level: document.getElementById('vocab-level')?.value,
                    phonetic: document.getElementById('vocab-phonetic')?.value,
                    example: document.getElementById('vocab-example')?.value,
                    synonyms: document.getElementById('vocab-synonyms')?.value,
                    image: document.getElementById('vocab-image')?.value });
                resultDiv.innerHTML = '<p style="color:var(--text-secondary);font-size:13px"><i class="fas fa-spinner fa-spin"></i> Đang lưu...</p>';
                try {
                    const res = await UploadVocabAPI.create({ ...payload, retentionDays: readRetention('vocab-retention') });
                    if (!res.success) throw new Error(res.message);
                    resultDiv.innerHTML = resultHtml('success', `Đã lưu "${payload.en}" vào source "${payload.source}"`);
                    ['vocab-en','vocab-vn','vocab-example','vocab-phonetic','vocab-synonyms','vocab-image'].forEach(id => {
                        const el = document.getElementById(id); if (el) el.value = '';
                    });
                    document.getElementById('vocab-en')?.focus();
                    saveAddTabState();
                } catch (err) { resultDiv.innerHTML = resultHtml('error', err.message); }
            });
        };

        const attachJsonHandlers = () => {
            document.getElementById('json-copy-prompt-btn')?.addEventListener('click', () => {
                const source = (document.getElementById('json-source')?.value.trim() || 'ets2026').toLowerCase();
                const part   = (document.getElementById('json-part')?.value.trim() || 'PART').toUpperCase();
                const prompt = `Chuyển danh sách từ vựng sau sang định dạng JSON. Trả về ĐÚNG một mảng JSON, không có giải thích thêm.

Mỗi từ có cấu trúc:
{
  "en": "từ tiếng anh (viết thường)",
  "vn": "nghĩa tiếng việt (viết thường)",
  "phonetic": "/phiên âm IPA/ (nếu không có thì để chuỗi rỗng)",
  "part": "${part}",
  "synonyms": "từ đồng nghĩa, cách nhau bằng dấu phẩy (viết thường, để trống nếu không có)",
  "type": "noun / verb / adjective / adverb / phrasal verb / noun phrase / ... (viết thường)",
  "image": "images/pages/${part.toLowerCase()}/ten_tu_viet_thuong_gach_duoi.jpg",
  "example": "Câu ví dụ bằng tiếng anh (viết hoa chữ cái đầu câu).",
  "level": "A1 / A2 / B1 / B2 / C1 / C2",
  "source": "${source}"
}

Quy tắc:
- "en", "vn", "phonetic", "synonyms", "type", "image", "source" → viết thường
- "part" → "${part}" (viết HOA, giữ nguyên)
- "level" → viết HOA (A1, B2, ...)
- "example" → viết hoa chữ cái đầu câu
- "image" → dùng định dạng: images/pages/${part.toLowerCase()}/ten_tu.jpg (gạch dưới thay khoảng trắng)
- Nếu không có dữ liệu, để chuỗi rỗng ""

Danh sách từ vựng cần chuyển:
[DÁN DANH SÁCH TỪ VÀO ĐÂY]`;

                navigator.clipboard.writeText(prompt).then(() => {
                    const btn = document.getElementById('json-copy-prompt-btn');
                    if (btn) { const orig = btn.innerHTML; btn.innerHTML = '<i class="fas fa-check"></i> Đã copy!'; btn.style.background = '#16a34a'; setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 2000); }
                }).catch(() => {});
                saveJsonTabState();
            });

            document.getElementById('json-submit-btn')?.addEventListener('click', async () => {
                const ta = document.getElementById('json-result-area');
                const raw = ta?.value.trim();
                const resultDiv = document.getElementById('json-tab-result');
                if (!raw) { resultDiv.innerHTML = resultHtml('error', 'Textarea JSON rỗng'); return; }
                let parsed; try { parsed = JSON.parse(raw); } catch (e) { resultDiv.innerHTML = resultHtml('error', `JSON không hợp lệ: ${e.message}`); return; }
                const items = Array.isArray(parsed) ? parsed : [parsed];
                const retentionDays = readRetention('json-retention');
                resultDiv.innerHTML = `<p style="color:var(--text-secondary);font-size:13px"><i class="fas fa-spinner fa-spin"></i> Đang lưu ${items.length} từ...</p>`;
                let ok = 0, failed = 0, errors = [];
                for (const raw of items) {
                    const item = normalizeVocabItem(raw);
                    if (!item.en || !item.part || !item.source) { failed++; errors.push(`Thiếu en/part/source: ${JSON.stringify(raw).slice(0,60)}`); continue; }
                    try {
                        const res = await UploadVocabAPI.create({ ...item, retentionDays });
                        if (!res.success) throw new Error(res.message);
                        ok++;
                    } catch (err) { failed++; errors.push(`${item.en}: ${err.message}`); }
                }
                const msg = `✓ ${ok} thành công, ✗ ${failed} lỗi` + (errors.length ? '\n' + errors.slice(0,3).join('\n') : '');
                resultDiv.innerHTML = resultHtml(failed === 0 ? 'success' : 'error', msg);
                if (failed === 0 && ta) ta.value = '';
                saveJsonTabState();
            });
        };

        const exportSource = async (source, fmt) => {
            try {
                const res = await UploadVocabAPI.myVocabulary(source);
                if (!res.success) throw new Error(res.message || 'Không tải được từ vựng');
                const n = downloadWords(source, res.data || [], fmt);
                if (n === 0) alert(`Nguồn "${source}" không có từ nào.`);
            } catch (err) {
                alert(`Lỗi xuất file: ${err.message}`);
            }
        };

        // HTML for the retention <select> reused across the upload tabs.
        const retentionFieldHtml = (id) => `
            <div>
                <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text-primary)">
                    Thời hạn lưu <span style="color:#ef4444">*</span>
                </label>
                <select id="${id}" style="width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-tertiary,var(--bg-secondary));color:var(--text-primary)">
                    ${RETENTION_OPTIONS.map(d => `<option value="${d}"${d === DEFAULT_RETENTION ? ' selected' : ''}>${d} ngày</option>`).join('')}
                </select>
            </div>`;

        const readRetention = (id) => {
            const v = parseInt(document.getElementById(id)?.value, 10);
            return RETENTION_OPTIONS.includes(v) ? v : DEFAULT_RETENTION;
        };

        const loadMyTopics = async () => {
            const container = document.getElementById('manage-container');
            if (!container) return;
            try {
                const res = await UploadVocabAPI.myTopics();
                if (!res.success) throw new Error(res.message);
                if (!res.data.length) {
                    container.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:24px 0;color:var(--text-secondary);font-size:13px">
                        <i class="fas fa-inbox" style="font-size:32px;margin-bottom:8px;opacity:0.4"></i>
                        Bạn chưa có từ vựng nào.<br>
                        <button id="switch-to-add-btn" class="btn btn-primary" style="margin-top:12px;font-size:12px"><i class="fas fa-plus"></i> Thêm từ mới</button>
                    </div>`;
                    document.getElementById('switch-to-add-btn')?.addEventListener('click', () => document.getElementById('upload-tab-add')?.click());
                    return;
                }
                container.innerHTML = `
                    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">${res.data.length} nguồn từ vựng — nhấn để xem từ</div>
                    <div id="topic-list">${res.data.map(t => {
                        const date = t.lastUpload ? new Date(t.lastUpload).toLocaleDateString('vi-VN') : '';
                        const soon = t.expiringSoon || 0;
                        // Số ngày còn lại tới hạn gần nhất (làm tròn lên).
                        const daysLeft = t.nearestExpiry
                            ? Math.max(0, Math.ceil((new Date(t.nearestExpiry).getTime() - Date.now()) / 86400000))
                            : null;
                        const expInfo = soon > 0
                            ? ` · <span style="color:#dc2626;font-weight:700"><i class="fas fa-triangle-exclamation"></i> ${soon} từ sắp hết hạn${daysLeft != null ? ` (còn ${daysLeft} ngày)` : ''}</span>`
                            : '';
                        return `<div class="topic-item" style="margin-bottom:6px">
                          <div class="topic-row${soon > 0 ? ' topic-row--expiring' : ''}" data-source="${t.source}" data-count="${t.wordCount}"
                            style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary)">
                            <div style="flex:1;min-width:0">
                                <div style="font-weight:600;font-size:13px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.source}</div>
                                <div style="font-size:11px;color:var(--text-secondary)">${t.wordCount} từ · ${date}${expInfo}</div>
                            </div>
                            <button class="topic-expand-btn btn btn-secondary" style="padding:4px 10px;font-size:12px;white-space:nowrap"><i class="fas fa-chevron-down"></i> Xem</button>
                            <button class="topic-export-json btn btn-secondary" title="Xuất JSON" style="padding:4px 10px;font-size:12px;white-space:nowrap"><i class="fas fa-file-code"></i> JSON</button>
                            <button class="topic-export-excel btn btn-secondary" title="Xuất Excel (CSV)" style="padding:4px 10px;font-size:12px;white-space:nowrap"><i class="fas fa-file-excel"></i> Excel</button>
                            <button class="topic-delete-all-btn btn" style="padding:4px 10px;font-size:12px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;white-space:nowrap"><i class="fas fa-trash"></i> Xóa tất</button>
                          </div>
                          <div class="topic-words" data-source="${t.source}" style="display:none;margin-top:4px"></div>
                        </div>`;
                    }).join('')}</div>`;

                container.querySelectorAll('.topic-row').forEach(row => {
                    row.querySelector('.topic-expand-btn')?.addEventListener('click', () => toggleWords(row));
                    row.querySelector('.topic-export-json')?.addEventListener('click', () => exportSource(row.dataset.source, 'json'));
                    row.querySelector('.topic-export-excel')?.addEventListener('click', () => exportSource(row.dataset.source, 'csv'));
                    row.querySelector('.topic-delete-all-btn')?.addEventListener('click', () => deleteSource(row.dataset.source, row.dataset.count));
                });
            } catch (err) { container.innerHTML = `<p style="color:#dc2626;font-size:13px">Lỗi: ${err.message}</p>`; }
        };

        // Mở/đóng danh sách từ ngay dưới nguồn (dropdown). Mở lần đầu mới tải.
        const toggleWords = (row) => {
            const item = row.closest('.topic-item');
            const panel = item?.querySelector('.topic-words');
            const icon = row.querySelector('.topic-expand-btn i');
            if (!panel) return;
            if (panel.dataset.open === '1') {
                panel.style.display = 'none';
                panel.innerHTML = '';
                delete panel.dataset.open;
                if (icon) icon.className = 'fas fa-chevron-down';
            } else {
                panel.style.display = '';
                panel.dataset.open = '1';
                if (icon) icon.className = 'fas fa-chevron-up';
                loadWords(row.dataset.source, panel);
            }
        };

        const loadWords = async (source, panel) => {
            if (!panel) return;
            panel.innerHTML = `<p style="font-size:13px;color:var(--text-secondary);padding:6px 0"><i class="fas fa-spinner fa-spin"></i> Đang tải "${source}"...</p>`;
            try {
                const res = await UploadVocabAPI.myVocabulary(source);
                if (!res.success) throw new Error(res.message);
                if (!res.data.length) { panel.innerHTML = `<p style="font-size:13px;color:var(--text-secondary);padding:8px 0">Không có từ nào trong "${source}".</p>`; return; }
                panel.innerHTML = `
                    <div style="max-height:260px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px">
                        <table style="width:100%;border-collapse:collapse;font-size:12px">
                            <thead><tr style="background:var(--bg-tertiary,var(--bg-secondary))">
                                <th style="padding:6px 8px;text-align:left;color:var(--text-secondary);font-weight:600;border-bottom:1px solid var(--border-color)">English</th>
                                <th style="padding:6px 8px;text-align:left;color:var(--text-secondary);font-weight:600;border-bottom:1px solid var(--border-color)">Vietnamese</th>
                                <th style="padding:6px 8px;text-align:left;color:var(--text-secondary);font-weight:600;border-bottom:1px solid var(--border-color)">Part</th>
                                <th style="padding:6px 8px;text-align:left;color:var(--text-secondary);font-weight:600;border-bottom:1px solid var(--border-color)">Ngày hết hạn</th>
                                <th style="padding:6px 8px;border-bottom:1px solid var(--border-color)"></th>
                            </tr></thead>
                            <tbody id="word-rows">
                                ${res.data.map(w => `
                                    <tr id="word-row-${w._id}" style="border-bottom:1px solid var(--border-color)">
                                        <td style="padding:6px 8px;color:var(--text-primary);font-weight:500">${w.en}</td>
                                        <td style="padding:6px 8px;color:var(--text-secondary)">${w.vn || '—'}</td>
                                        <td style="padding:6px 8px;color:var(--text-secondary)">${w.part || '—'}</td>
                                        <td style="padding:6px 8px;color:var(--text-secondary)">${w.expiresAt ? new Date(w.expiresAt).toLocaleDateString('vi-VN') : 'Không hết hạn'}</td>
                                        <td style="padding:6px 8px;text-align:right">
                                            <button class="word-delete-btn" data-id="${w._id}" data-en="${w.en}"
                                                style="padding:3px 8px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:4px;font-size:11px;cursor:pointer">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        </td>
                                    </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>`;
                panel.querySelectorAll('.word-delete-btn').forEach(btn => {
                    btn.addEventListener('click', () => deleteWord(btn.dataset.id, btn.dataset.en, source));
                });
            } catch (err) { panel.innerHTML = `<p style="color:#dc2626;font-size:13px">Lỗi: ${err.message}</p>`; }
        };

        const deleteWord = async (wordId, wordEn, source) => {
            if (!confirm(`Xóa từ "${wordEn}"?`)) return;
            try {
                const res = await UploadVocabAPI.deleteWord(wordId);
                if (!res.success) throw new Error(res.message);
                document.getElementById(`word-row-${wordId}`)?.remove();
                const topicRow = document.querySelector(`.topic-row[data-source="${source}"]`);
                if (topicRow) {
                    const newCount = parseInt(topicRow.dataset.count, 10) - 1;
                    topicRow.dataset.count = newCount;
                    topicRow.querySelector('div:first-child div:last-child').textContent = `${newCount} từ`;
                    if (newCount <= 0) (topicRow.closest('.topic-item') || topicRow).remove();
                }
            } catch (err) { alert(err.message); }
        };

        const deleteSource = async (source, count) => {
            if (!confirm(`Xóa toàn bộ ${count} từ trong "${source}"? Thao tác này không thể hoàn tác.`)) return;
            try {
                const res = await UploadVocabAPI.deleteSource(source);
                if (!res.success) throw new Error(res.message);
                const row = document.querySelector(`.topic-row[data-source="${source}"]`);
                (row?.closest('.topic-item') || row)?.remove();
                if (!document.querySelectorAll('.topic-row').length) loadMyTopics();
            } catch (err) { alert(err.message); }
        };

        // "Quản lý từ vựng" ở header → đổi tab qua sự kiện (component React lắng nghe).
        const manageBtnHtml = `<button type="button" id="upload-tab-manage" onclick="document.dispatchEvent(new CustomEvent('upload-set-tab',{detail:'manage'}))" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap"><i class="fas fa-list"></i> Quản lý từ vựng</button>`;

        const contentJsx = createElement(TabbedModalBody, {
            tabs: [
                { key: 'add', label: 'Thêm từ mới', icon: 'fa-plus' },
                { key: 'json', label: 'Thêm JSON', icon: 'fa-code' },
            ],
            initialTab: tab === 'manage' ? 'manage' : 'add',
            renderBody: (t) => (t === 'add' ? addTabHtml() : t === 'json' ? jsonTabHtml() : manageTabHtml()),
            onEnterTab: (t) => {
                if (t === 'add') attachAddHandlers();
                else if (t === 'json') attachJsonHandlers();
                else if (t === 'manage') loadMyTopics();
            },
            onLeaveTab: (t) => {
                if (t === 'add') saveAddTabState();
                else if (t === 'json') saveJsonTabState();
            },
        });

        Modal.show({ title: '☁️ Từ vựng riêng', contentJsx, headerActionHtml: manageBtnHtml, wide: true });
}
