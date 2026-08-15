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
import { GameLogic } from '@game/gameLogic.js';
import { wordLang, ttsLangOf } from '@lib/wordLang.js';
import { getVocabLang } from '@api/vocabulary.js';
import { Notification } from '@ui/Toaster.jsx';

// Tên hiển thị cho các nguồn do hệ thống tạo. Nguồn người dùng tự đặt thì giữ
// nguyên tên họ gõ — đổi tên của họ là làm họ mất dấu bộ từ của mình.
const SOURCE_LABELS = {
    'dich-nhanh-en': 'Dịch nhanh · Tiếng Anh',
    'dich-nhanh-zh': 'Dịch nhanh · Tiếng Trung',
    // Tên cũ trước khi tách theo ngôn ngữ. Giữ lại phòng còn bản ghi sót — mất
    // nhãn thì nó hiện ra dưới dạng chuỗi kỹ thuật chứ không phải biến mất.
    'dich-nhanh': 'Dịch nhanh (cũ)',
};
function sourceLabel(source) {
    return SOURCE_LABELS[source] || source;
}

/** Escape trước khi vào innerHTML — `en`/`vn` là chữ người dùng tự nhập. */
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Retention options (days) the user can pick when uploading private vocab.
const RETENTION_OPTIONS = [3, 7, 14, 30];
const DEFAULT_RETENTION = 30;

/**
 * Dựng nội dung màn "Từ vựng riêng" (tabs + toàn bộ handler).
 *
 * Tách khỏi phần MỞ MODAL để dùng được ở hai nơi: modal (lối cũ, còn giữ cho
 * popup Dịch nhanh gọi sang tab Quản lý) và MÀN HÌNH riêng trong sidebar.
 * Toàn bộ ~1000 dòng ruột giữ nguyên — chỉ lớp bọc ngoài đổi.
 *
 * @returns {{ contentJsx, headerActionHtml, dispose }} `dispose` PHẢI được gọi
 *   khi tháo: nó gỡ listener uỷ quyền ở document, mà listener đó giữ closure của
 *   lần dựng này. Không gỡ thì lần dựng sau có hai listener cùng chạy, cái cũ
 *   trỏ vào DOM đã bị vứt.
 */
export function buildUploadContent({ tab } = {}) {
        const TYPE1 = ['noun','verb','adjective','adverb','pronoun','preposition','conjunction','interjection','article','determiner','auxiliary'];
        const TYPE2 = ['noun phrase','verb phrase','adjective phrase','adverb phrase','prepositional phrase','participle phrase','gerund phrase','infinitive phrase'];
        const opts1 = ['<option value="">— Loại từ —</option>', ...TYPE1.map(t => `<option value="${t}">${t}</option>`)].join('');
        const opts2 = ['<option value="">— Cụm từ —</option>', ...TYPE2.map(t => `<option value="${t}">${t}</option>`)].join('');

        let _lastSource = '';
        let _lastPart = '';
        // Từ đang SỬA (null = đang thêm mới). Form "Thêm từ mới" dùng lại cho cả
        // hai việc: nó có đủ 9 trường, còn popup Dịch nhanh chỉ có 4 — sửa `type`,
        // `level`, `example` hay `image` thì phải có form này.
        let _editing = null;
        // Tải lại bảng đang mở sau khi sửa xong.
        let _onEditSaved = null;
        // Tab đang mở — nút Đồng bộ ở header nằm NGOÀI thân tab nên phải tự biết
        // đang cần làm mới cái gì.
        let _currentTab = tab === 'manage' ? 'manage' : (tab === 'share' ? 'share' : 'add');

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
            <div id="vocab-edit-bar" style="display:none;align-items:center;gap:8px;margin-bottom:10px;padding:6px 10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary)"></div>
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
            <div style="margin-bottom:14px;font-size:11px;color:var(--text-secondary)">
                <i class="fas fa-circle-info"></i> Thời hạn lưu chọn ở góc trên. Hết hạn sẽ tự xóa — bạn sẽ bị nhắc xuất file trước 3 ngày.
            </div>
            <div style="text-align:right;margin-bottom:10px">
                <button id="vocab-save-btn" class="btn btn-primary" style="min-width:100px"><i class="fas fa-save"></i> Lưu từ</button>
            </div>
            <div id="upload-form-result"></div>`;

        const manageTabHtml = () => `
            <div id="manage-container">
                <p style="font-size:13px;color:var(--text-secondary);margin:0 0 12px"><i class="fas fa-spinner fa-spin"></i> Đang tải danh sách...</p>
            </div>`;

        // Tab CHIA SẺ riêng. Trước đây phần này nằm trong panel xổ ra của từng
        // hàng nguồn ở tab Quản lý — chật, và muốn xem đã chia sẻ những gì thì
        // phải mở lần lượt từng bộ.
        const shareTabHtml = () => `
            <div id="share-container">
                <p style="font-size:13px;color:var(--text-secondary);margin:0 0 12px">
                    <i class="fas fa-spinner fa-spin"></i> Đang tải danh sách bộ từ...
                </p>
            </div>`;

        // Tab ĐƯỢC CHIA SẺ — tách khỏi tab Chia sẻ.
        //
        // Hai việc ngược chiều nhau: tab Chia sẻ là "tôi cho ai", tab này là "ai
        // cho tôi". Gộp một chỗ thì phải cuộn qua phần cấp quyền mới tới được
        // lời mời của mình, mà lời mời mới là thứ cần xử lý ngay.
        const receivedTabHtml = () => `
            <div id="share-inbox"></div>
            <div id="share-accepted" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-color)"></div>`;

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
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;color:var(--text-secondary);cursor:pointer">
                <input type="checkbox" id="json-with-image" style="width:15px;height:15px;cursor:pointer;accent-color:var(--primary-color)">
                <span>Kèm đường dẫn ảnh minh hoạ
                    <span style="color:var(--text-tertiary,#94a3b8)">— bỏ chọn thì <code>image</code> để trống, tránh AI bịa đường dẫn không tồn tại</span>
                </span>
            </label>
            <button id="json-copy-prompt-btn" class="btn btn-primary" style="width:100%;margin-bottom:14px;font-size:13px">
                <i class="fas fa-copy"></i> Copy Prompt cho AI
            </button>
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

        // ── Sửa từ bằng chính form "Thêm từ mới" ────────────────────────────
        //
        // Trước đây nút bút chì mở popup Dịch nhanh. Popup đó chỉ có 4 trường
        // (en/vn/phonetic/synonyms) nên không sửa được `type`, `level`,
        // `example`, `image` — mà đó mới là những thứ hay phải sửa sau khi nhập
        // hàng loạt bằng JSON. Form này có đủ 9 trường.

        /** Đổ dữ liệu từ đang sửa vào form. */
        const fillEditForm = () => {
            if (!_editing) return;
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
            set('vocab-en', _editing.en);
            set('vocab-vn', _editing.vn);
            set('vocab-part', _editing.part);
            set('vocab-source', _editing.source);
            set('vocab-level', _editing.level);
            set('vocab-phonetic', _editing.phonetic);
            set('vocab-example', _editing.example);
            set('vocab-synonyms', _editing.synonyms);
            set('vocab-image', _editing.image);

            // `type` nằm ở MỘT trong HAI select (từ đơn / cụm từ) — điền nhầm ô là
            // giá trị biến mất khỏi form và lưu lại thành rỗng.
            const t1 = document.getElementById('vocab-type1');
            const t2 = document.getElementById('vocab-type2');
            if (t1) t1.value = '';
            if (t2) t2.value = '';
            const t = (_editing.type || '').toLowerCase();
            if (t) {
                if (TYPE1.includes(t) && t1) t1.value = t;
                else if (TYPE2.includes(t) && t2) t2.value = t;
            }

            // Source/Part khoá lại: đổi chúng ở đây không chuyển được từ sang kho
            // khác (route sửa cố ý không nhận hai trường đó), nên cho sửa là hứa
            // suông. Muốn chuyển kho thì xoá rồi thêm lại.
            const lock = (id) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.readOnly = true;
                el.style.opacity = '0.6';
                el.title = 'Không đổi được khi sửa — muốn chuyển kho thì xoá rồi thêm lại';
            };
            lock('vocab-source');
            lock('vocab-part');

            const btn = document.getElementById('vocab-save-btn');
            if (btn) btn.innerHTML = '<i class="fas fa-check"></i> Cập nhật';

            const bar = document.getElementById('vocab-edit-bar');
            if (bar) {
                bar.style.display = 'flex';   // về '' là rơi lại 'block' của div, mất căn hàng ngang
                bar.innerHTML = `
                    <span style="flex:1;min-width:0;font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                        <i class="fas fa-pen"></i> Đang sửa: <b>${esc(_editing.en)}</b>
                    </span>
                    <button type="button" id="vocab-cancel-edit"
                        style="padding:3px 10px;font-size:11px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer">Huỷ</button>`;
                bar.querySelector('#vocab-cancel-edit')?.addEventListener('click', () => exitEditMode());
            }
            document.getElementById('vocab-en')?.focus();
        };

        /** Rời chế độ sửa, trả form về trạng thái thêm mới. */
        const exitEditMode = () => {
            _editing = null;
            _onEditSaved = null;
            ['vocab-en','vocab-vn','vocab-level','vocab-phonetic','vocab-example','vocab-synonyms','vocab-image']
                .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            ['vocab-source','vocab-part'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                el.readOnly = false;
                el.style.opacity = '';
                el.title = '';
            });
            const btn = document.getElementById('vocab-save-btn');
            if (btn) btn.innerHTML = '<i class="fas fa-save"></i> Lưu từ';
            const bar = document.getElementById('vocab-edit-bar');
            if (bar) { bar.style.display = 'none'; bar.innerHTML = ''; }
        };

        /** Mở form ở chế độ sửa cho một từ. */
        const startEdit = (word, onSaved) => {
            _editing = word;
            _onEditSaved = onSaved;
            document.dispatchEvent(new CustomEvent('upload-set-tab', { detail: 'add' }));
            // Tab dựng DOM bất đồng bộ; fillEditForm chạy lại trong attachAddHandlers.
        };

        const attachAddHandlers = () => {
            const t1 = document.getElementById('vocab-type1');
            const t2 = document.getElementById('vocab-type2');
            t1?.addEventListener('change', () => { if (t1.value) t2.value = ''; });
            t2?.addEventListener('change', () => { if (t2.value) t1.value = ''; });

            // Đang ở chế độ sửa thì đổ dữ liệu vào form. Chạy trong attachAddHandlers
            // vì tab chỉ dựng DOM lúc được mở — điền trước đó là điền vào hư không.
            if (_editing) fillEditForm();

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
                    if (_editing) {
                        // SỬA: phải dùng updateWord, KHÔNG dùng create.
                        //
                        // `create` là upsert theo (ownerEmail, source, en) — đổi `en`
                        // rồi gọi nó là tạo bản ghi THỨ HAI, bản cũ vẫn nằm đó. Người
                        // dùng tưởng đã đổi tên từ, thực tế nhân đôi nó.
                        const res = await UploadVocabAPI.updateWord(_editing._id, payload);
                        if (!res.success) throw new Error(res.message);
                        resultDiv.innerHTML = resultHtml('success', `Đã cập nhật "${payload.en}"`);
                        const done = _onEditSaved;
                        exitEditMode();
                        done?.();
                        return;
                    }

                    const res = await UploadVocabAPI.create({ ...payload, retentionDays: readRetention() });
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
                const isZh = getVocabLang() === 'zh';
                const withImage = document.getElementById('json-with-image')?.checked;

                // Prompt phải theo ĐÚNG ngôn ngữ đang học.
                //
                // Bản cũ cứng tiếng Anh ("từ tiếng anh", "phiên âm IPA", "câu ví
                // dụ bằng tiếng anh"). Người học tiếng Trung dán danh sách chữ Hán
                // vào thì AI trả về JSON có `phonetic` là IPA và ví dụ tiếng Anh —
                // sai kiểu dữ liệu ngay từ nguồn, mà chỉ phát hiện ra sau khi đã
                // nhập cả trăm từ.
                //
                // `lang` cũng phải nằm trong prompt: nó quyết định giọng đọc
                // (models/UserUpload.js). Thiếu thì mọi từ Hán mặc định 'en' và
                // đọc bằng giọng Anh — ra một tràng vô nghĩa, không có lỗi nào.
                const wordLabel = isZh ? 'từ tiếng Trung (chữ Hán giản thể)' : 'từ tiếng anh (viết thường)';
                const phoneticLabel = isZh
                    ? 'pinyin CÓ DẤU THANH, vd: nǐ hǎo (bắt buộc, không để trống)'
                    : '/phiên âm IPA/ (nếu không có thì để chuỗi rỗng)';
                const exampleLabel = isZh
                    ? 'Câu ví dụ bằng tiếng Trung.'
                    : 'Câu ví dụ bằng tiếng anh (viết hoa chữ cái đầu câu).';
                // Mỗi ngôn ngữ một khung riêng: tiếng Trung dùng HSK (đúng cách
                // tiếng Trung được dạy và phân cấp), tiếng Anh dùng CEFR.
                // Toàn bộ kho zh đã chuyển sang HSK, nên prompt phải sinh ra
                // đúng khung đó — AI thường mặc định trả A1/B2 cho MỌI ngôn ngữ
                // nếu không dặn rõ.
                const levelLabel = isZh
                    ? 'HSK1 / HSK2 / HSK3 / HSK4 / HSK5 / HSK6 / HSK7-9'
                    : 'A1 / A2 / B1 / B2 / C1 / C2';
                const langValue = isZh ? 'zh' : 'en';

                // TỪ LOẠI cũng theo ngôn ngữ. Kho tiếng Trung lưu `名词`/`动词`
                // (11.783/12.266 từ), không phải `noun`/`verb` — để AI trả nhãn
                // tiếng Anh thì từ mới nằm riêng một mục, lọc `名词` bỏ sót.
                const typeLabel = isZh
                    ? '名词 / 动词 / 形容词 / 副词 / 代词 / 量词 / 数词 / 介词 / 连词 / 助词 / 叹词 / 成语 / 短语 …'
                    : 'noun / verb / adjective / adverb / phrasal verb / noun phrase / … (viết thường)';

                // ĐỒNG NGHĨA phải cùng ngôn ngữ với từ. Trước đây chỉ ghi "viết
                // thường" — vô nghĩa với chữ Hán, và không nói rõ phải viết bằng
                // gì, nên AI hay trả nghĩa tiếng Việt hoặc phiên âm.
                const synonymsLabel = isZh
                    ? 'từ đồng nghĩa BẰNG CHỮ HÁN, cách nhau bằng dấu phẩy (để trống nếu không có)'
                    : 'từ đồng nghĩa, cách nhau bằng dấu phẩy (viết thường, để trống nếu không có)';

                const imageLine = withImage
                    ? `\n  "image": "images/pages/${part.toLowerCase()}/ten_tu_viet_thuong_gach_duoi.jpg",`
                    : `\n  "image": "",`;
                const imageRule = withImage
                    ? `\n- "image" → dùng định dạng: images/pages/${part.toLowerCase()}/ten_tu.jpg (gạch dưới thay khoảng trắng)`
                    : `\n- "image" → LUÔN để chuỗi rỗng "" (không tự bịa đường dẫn ảnh)`;

                const prompt = `Chuyển danh sách từ vựng sau sang định dạng JSON. Trả về ĐÚNG một mảng JSON, không có giải thích thêm.

Mỗi từ có cấu trúc:
{
  "en": "${wordLabel}",
  "vn": "nghĩa tiếng việt (viết thường)",
  "phonetic": "${phoneticLabel}",
  "part": "${part}",
  "synonyms": "${synonymsLabel}",
  "type": "${typeLabel}",${imageLine}
  "example": "${exampleLabel}",
  "level": "${levelLabel}",
  "lang": "${langValue}",
  "source": "${source}"
}

Quy tắc:
- "vn", "source" → viết thường${isZh
    ? '\n- "en" → giữ nguyên chữ Hán, KHÔNG phiên âm sang chữ Latin'
      + '\n- "phonetic" → pinyin có dấu thanh (nǐ hǎo), KHÔNG phải IPA'
      + '\n- "synonyms" → viết BẰNG CHỮ HÁN (vd: 否, 不是), KHÔNG dùng pinyin hay tiếng Việt'
      + '\n- "type" → viết BẰNG CHỮ HÁN (名词, 动词, 形容词…), KHÔNG dùng noun/verb.'
      + ' Từ mang nhiều loại thì nối bằng "/" không có khoảng trắng: 名词/动词'
    : '\n- "en", "phonetic" → viết thường'
      + '\n- "synonyms", "type" → viết thường'}
- "part" → "${part}" (viết HOA, giữ nguyên)
- "level" → viết HOA. ${isZh
    ? 'BẮT BUỘC dùng khung HSK (HSK1…HSK6, HSK7-9), KHÔNG dùng A1/B2/C1 — '
      + 'từ vựng tiếng Trung phân cấp theo HSK. Nếu bạn chỉ biết mức theo khung '
      + 'châu Âu thì quy đổi: A1→HSK1, A2→HSK2, B1→HSK3, B2→HSK4, C1→HSK5 hoặc '
      + 'HSK6, C2→HSK7-9.'
    : 'Dùng khung CEFR (A1, A2, B1, B2, C1, C2).'}
- "lang" → LUÔN là "${langValue}"
- "example" → ${isZh ? 'câu ví dụ bằng tiếng Trung' : 'viết hoa chữ cái đầu câu'}${imageRule}
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
                const retentionDays = readRetention();
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
        // Một ô DUY NHẤT trên header, không truyền id nữa. Trước đây hai tab có
        // hai ô riêng — cùng một khái niệm mà hai giá trị độc lập.
        const readRetention = () => {
            const v = parseInt(document.getElementById('upload-retention')?.value, 10);
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
                                <div style="font-weight:600;font-size:13px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sourceLabel(t.source))}</div>
                                <div style="font-size:11px;color:var(--text-secondary)">${t.wordCount} từ · ${date}${expInfo}</div>
                            </div>
                            <button class="topic-export-json btn btn-secondary" title="Xuất JSON" style="padding:4px 10px;font-size:12px;white-space:nowrap"><i class="fas fa-file-code"></i> JSON</button>
                            <button class="topic-export-excel btn btn-secondary" title="Xuất Excel (CSV)" style="padding:4px 10px;font-size:12px;white-space:nowrap"><i class="fas fa-file-excel"></i> Excel</button>
                            <button class="topic-delete-all-btn btn" style="padding:4px 10px;font-size:12px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;white-space:nowrap"><i class="fas fa-trash"></i> Xóa tất</button>
                            <button class="topic-expand-btn btn btn-secondary" style="padding:4px 10px;font-size:12px;white-space:nowrap"><i class="fas fa-chevron-down"></i> Xem</button>
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

        // ── Tab CHIA SẺ ──────────────────────────────────────────────────────
        //
        // Chọn một bộ từ → hiện ai đang được xem + ô nhập ID để cấp thêm.
        // Không gọi `listSharees` cho MỌI bộ cùng lúc: 5 bộ là 5 request ngay khi
        // mở tab, mà người dùng thường chỉ quan tâm một bộ.
        let _shareSource = null;

        const loadShareTab = async () => {
            const box = document.getElementById('share-container');
            if (!box) return;
            try {
                const res = await UploadVocabAPI.myTopics();
                const topics = res?.success ? (res.data || []) : [];
                if (topics.length === 0) {
                    // Người mới chưa có bộ nào của mình vẫn có thể ĐƯỢC người khác
                    // chia sẻ — chỉ nói "chưa có gì" rồi thôi là họ tưởng tính năng
                    // này không dùng được, nên chỉ luôn sang tab bên cạnh.
                    box.innerHTML = `
                        <p style="font-size:13px;color:var(--text-secondary);margin:0">
                            Bạn chưa có bộ từ nào để chia sẻ.<br>
                            <span style="font-size:12px;color:var(--text-tertiary,#94a3b8)">
                                Bộ người khác chia sẻ cho bạn nằm ở tab <b>Được chia sẻ</b>.
                            </span>
                        </p>`;
                    return;
                }

                // Giữ lựa chọn cũ nếu bộ đó còn; không thì lấy bộ đầu.
                if (!topics.some(t => t.source === _shareSource)) _shareSource = topics[0].source;

                box.innerHTML = `
                    <div style="margin-bottom:10px">
                        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text-primary)">Bộ từ muốn chia sẻ</label>
                        <select id="share-source-select"
                            style="width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:8px;font-size:13px;background:var(--bg-tertiary,var(--bg-secondary));color:var(--text-primary)">
                            ${topics.map(t => `<option value="${esc(t.source)}"${t.source === _shareSource ? ' selected' : ''}>${esc(sourceLabel(t.source))} — ${t.wordCount} từ</option>`).join('')}
                        </select>
                    </div>
                    <div style="display:flex;gap:6px;margin-bottom:8px">
                        <input class="share-id-input" type="text" placeholder="Dán ID người chơi…"
                            style="flex:1;min-width:0;padding:8px 10px;font-size:13px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-primary);color:var(--text-primary)">
                        <button class="share-add-btn btn btn-primary" style="padding:6px 14px;font-size:13px;white-space:nowrap">Chia sẻ</button>
                    </div>
                    <div style="font-size:11px;color:var(--text-tertiary,#94a3b8);margin-bottom:12px">
                        Lấy ID ở <b>Bảng xếp hạng</b> → bấm vào người chơi → nút <i class="fas fa-copy"></i>.
                        Người nhận LUYỆN TẬP và sao chép được, không sửa/xoá được bộ của bạn.
                    </div>
                    <div id="share-people"></div>`;

                const sel = box.querySelector('#share-source-select');
                sel?.addEventListener('change', () => { _shareSource = sel.value; loadSharePeople(); });

                const input = box.querySelector('.share-id-input');
                const submit = async () => {
                    const id = input.value.trim();
                    if (!id) return;
                    const r = await UploadVocabAPI.shareSource(_shareSource, id);
                    if (r?.success) {
                        Notification.show({ type: 'success', message: r.message, duration: 2200 });
                        input.value = '';
                        loadSharePeople();
                    } else {
                        Notification.error(r?.message || 'Chia sẻ thất bại');
                    }
                };
                box.querySelector('.share-add-btn')?.addEventListener('click', submit);
                input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

                loadSharePeople();
            } catch (err) {
                box.innerHTML = `<p style="color:#dc2626;font-size:13px">Lỗi: ${esc(err.message)}</p>`;
            }
        };

        /** Lời mời chia sẻ CHỜ duyệt — tích chọn rồi bấm Nhận. */
        const loadShareInbox = async () => {
            const box = document.getElementById('share-inbox');
            if (!box) return;
            try {
                const res = await UploadVocabAPI.pendingShares();
                const rows = res?.success ? (res.data || []) : [];
                if (rows.length === 0) {
                    box.innerHTML = `
                        <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:6px">
                            Lời mời chờ duyệt
                        </div>
                        <p style="font-size:12px;color:var(--text-tertiary,#94a3b8);margin:0">
                            Không có lời mời nào đang chờ.
                        </p>`;
                    return;
                }

                box.innerHTML = `
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                        <div style="flex:1;font-size:12px;font-weight:600;color:var(--text-primary)">
                            Lời mời chờ duyệt
                            <span style="color:var(--text-tertiary,#94a3b8);font-weight:400">— tích chọn rồi bấm Nhận</span>
                        </div>
                        <button class="inbox-accept-btn btn btn-primary" style="padding:4px 12px;font-size:12px;white-space:nowrap" disabled>
                            Nhận (0)
                        </button>
                    </div>
                    ${rows.map(r => `
                        <label class="inbox-row" style="display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:6px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);cursor:${r.expired ? 'not-allowed' : 'pointer'};opacity:${r.expired ? '0.55' : '1'}">
                            <input type="checkbox" class="inbox-check"
                                data-owner="${esc(r.ownerEmail)}" data-source="${esc(r.source)}"
                                ${r.expired ? 'disabled' : ''}
                                style="width:15px;height:15px;cursor:inherit;accent-color:var(--primary-color)">
                            <div style="flex:1;min-width:0">
                                <div style="font-size:13px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                                    ${esc(sourceLabel(r.source))}
                                    <span style="font-weight:400;color:var(--text-tertiary,#94a3b8)">
                                        ${r.expired ? '— đã hết hạn' : `— ${r.wordCount} từ`}
                                    </span>
                                </div>
                                <div style="font-size:11px;color:var(--text-tertiary,#94a3b8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                                    <i class="fas fa-user"></i> ${esc(r.ownerName)}
                                </div>
                            </div>
                            <button class="inbox-reject-btn" data-owner="${esc(r.ownerEmail)}" data-source="${esc(r.source)}"
                                title="Bỏ qua lời mời này"
                                style="padding:4px 10px;font-size:12px;background:var(--bg-primary);color:var(--text-secondary);border:1px solid var(--border-color);border-radius:6px;cursor:pointer;white-space:nowrap">Bỏ qua</button>
                        </label>`).join('')}`;

                const btn = box.querySelector('.inbox-accept-btn');
                const checks = [...box.querySelectorAll('.inbox-check')];

                // Nút Nhận hiện SỐ đang chọn và tắt khi chưa chọn gì — bấm một nút
                // không làm gì mà không nói vì sao là kiểu hỏng im lặng.
                const sync = () => {
                    const n = checks.filter(c => c.checked).length;
                    btn.textContent = `Nhận (${n})`;
                    btn.disabled = n === 0;
                };
                checks.forEach(c => c.addEventListener('change', sync));

                btn?.addEventListener('click', async () => {
                    const items = checks.filter(c => c.checked)
                        .map(c => ({ ownerEmail: c.dataset.owner, source: c.dataset.source }));
                    if (items.length === 0) return;
                    const r = await UploadVocabAPI.acceptShares(items);
                    if (r?.success) {
                        Notification.show({ type: 'success', message: r.message, duration: 2200 });
                        loadShareInbox();
                    } else {
                        Notification.error(r?.message || 'Nhận thất bại');
                    }
                });

                box.querySelectorAll('.inbox-reject-btn').forEach(b => {
                    b.addEventListener('click', async (e) => {
                        // Nút nằm trong <label>: không chặn thì bấm nó cũng tích luôn ô.
                        e.preventDefault();
                        e.stopPropagation();
                        if (!window.confirm('Bỏ qua lời mời này? Chủ bộ từ vẫn chia sẻ lại được.')) return;
                        const r = await UploadVocabAPI.rejectShare(b.dataset.owner, b.dataset.source);
                        if (r?.success) {
                            Notification.show({ type: 'success', message: r.message, duration: 2000 });
                            loadShareInbox();
                        } else {
                            Notification.error(r?.message || 'Bỏ qua thất bại');
                        }
                    });
                });
            } catch (err) {
                box.innerHTML = `<p style="color:#dc2626;font-size:12px">Lỗi: ${esc(err.message)}</p>`;
            }
        };

        /**
         * Bộ ĐÃ NHẬN — xem tên bộ, đồng bộ lại, sao chép về kho riêng.
         *
         * Dùng lại `sharedTopics` (đã chỉ trả bộ `accepted`) thay vì thêm endpoint:
         * nó tính sẵn `ownerName`, `wordCount`, `nearestExpiry` và `expired`.
         */
        const loadAcceptedShares = async () => {
            const box = document.getElementById('share-accepted');
            if (!box) return;
            try {
                const res = await UploadVocabAPI.sharedTopics();
                const rows = res?.success ? (res.data || []) : [];

                // Không có nút Đồng bộ riêng ở đây — nút chung nằm trên header,
                // cạnh nút đóng, và làm mới cả tab.
                const head = `
                    <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:8px">
                        Bộ từ đã nhận
                        <span style="color:var(--text-tertiary,#94a3b8);font-weight:400">— ${rows.length}</span>
                    </div>`;

                if (rows.length === 0) {
                    box.innerHTML = head
                        + `<p style="font-size:12px;color:var(--text-tertiary,#94a3b8);margin:0">Chưa nhận bộ từ nào.</p>`;
                } else {
                    box.innerHTML = head + rows.map(r => `
                        <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:6px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);opacity:${r.expired ? '0.55' : '1'}">
                            <i class="fas fa-handshake" style="font-size:12px;color:var(--text-tertiary,#94a3b8)"></i>
                            <div style="flex:1;min-width:0">
                                <div style="font-size:13px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                                    ${esc(sourceLabel(r.source))}
                                    <span style="font-weight:400;color:var(--text-tertiary,#94a3b8)">
                                        ${r.expired ? '— đã hết hạn' : `— ${r.wordCount} từ`}
                                    </span>
                                </div>
                                <div style="font-size:11px;color:var(--text-tertiary,#94a3b8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                                    <i class="fas fa-user"></i> ${esc(r.ownerName || 'Người chơi')}
                                    ${r.expiringSoon > 0 && !r.expired
                                        ? ` · <span style="color:#f59e0b">sắp hết hạn — nên sao chép</span>` : ''}
                                </div>
                            </div>
                            ${r.expired ? '' : `
                            <button class="accepted-copy-btn" data-owner="${esc(r.ownerEmail)}" data-source="${esc(r.source)}"
                                title="Sao chép về kho của tôi — bộ gốc hết hạn thì bản sao vẫn còn"
                                style="padding:4px 10px;font-size:12px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);cursor:pointer;white-space:nowrap">
                                <i class="fas fa-copy"></i> Sao chép
                            </button>`}
                        </div>`).join('');
                }

                // Gắn listener SAU KHI đã ghi innerHTML ở cả hai nhánh rỗng/có dữ
                // liệu — gắn bên trong một nhánh là dễ sót nhánh kia.
                box.querySelectorAll('.accepted-copy-btn').forEach(b => {
                    b.addEventListener('click', async () => {
                        // Khoá nút trong lúc chạy: chép cả bộ mất vài giây, bấm dồn là
                        // gửi nhiều request và sinh thêm bản `-copy`.
                        b.disabled = true;
                        const orig = b.innerHTML;
                        b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang chép…';
                        try {
                            const r = await UploadVocabAPI.copySharedSource(b.dataset.owner, b.dataset.source);
                            if (r?.success) {
                                Notification.show({ type: 'success', message: r.message, duration: 2600 });
                                // Bản sao là bộ MỚI của mình → làm mới danh sách bộ riêng.
                                loadMyTopics();
                            } else {
                                // Server nói rõ lý do (vượt hạn mức, bộ hết hạn…).
                                Notification.error(r?.message || 'Sao chép thất bại');
                            }
                        } catch {
                            Notification.error('Không kết nối được máy chủ');
                        } finally {
                            b.disabled = false;
                            b.innerHTML = orig;
                        }
                    });
                });
            } catch (err) {
                box.innerHTML = `<p style="color:#dc2626;font-size:12px">Lỗi: ${esc(err.message)}</p>`;
            }
        };

        /** Danh sách người đang được xem bộ `_shareSource` — hiện TÊN + ID. */
        const loadSharePeople = async () => {
            const box = document.getElementById('share-people');
            if (!box || !_shareSource) return;
            box.innerHTML = '<p style="font-size:12px;color:var(--text-secondary)">Đang tải…</p>';
            try {
                const res = await UploadVocabAPI.listSharees(_shareSource);
                const rows = res?.success ? (res.data || []) : [];
                if (rows.length === 0) {
                    box.innerHTML = '<p style="font-size:12px;color:var(--text-tertiary,#94a3b8)">Chưa chia sẻ bộ này cho ai.</p>';
                    return;
                }
                box.innerHTML = `
                    <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:6px">
                        Đang được xem bởi ${rows.length} người
                    </div>
                    ${rows.map(r => `
                        <div class="share-row" style="display:flex;align-items:center;gap:10px;padding:8px 10px;margin-bottom:6px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary)">
                            <i class="fas fa-user" style="font-size:12px;color:var(--text-tertiary,#94a3b8)"></i>
                            <div style="flex:1;min-width:0">
                                <div style="font-size:13px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</div>
                                <div style="font-size:11px;color:var(--text-tertiary,#94a3b8);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.granteeId || '—')}</div>
                            </div>
                            <button class="share-revoke-btn" data-id="${esc(r.granteeId || '')}" data-name="${esc(r.name)}"
                                style="padding:4px 10px;font-size:12px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:6px;cursor:pointer;white-space:nowrap">Thu hồi</button>
                        </div>`).join('')}`;

                box.querySelectorAll('.share-revoke-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const id = btn.dataset.id;
                        if (!id) return;
                        if (!window.confirm(`Thu hồi quyền xem "${_shareSource}" của ${btn.dataset.name}?`)) return;
                        const r = await UploadVocabAPI.unshareSource(_shareSource, id);
                        if (r?.success) {
                            Notification.show({ type: 'success', message: r.message, duration: 2000 });
                            loadSharePeople();
                        } else {
                            Notification.error(r?.message || 'Thu hồi thất bại');
                        }
                    });
                });
            } catch (err) {
                box.innerHTML = `<p style="color:#dc2626;font-size:12px">Lỗi: ${esc(err.message)}</p>`;
            }
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

                // Gom các Part có mặt + đếm số từ mỗi Part. Trước đây muốn bỏ
                // trọn một Part (nhập nhầm cả buổi) thì chỉ có hai đường: bấm ×
                // từng từ mấy chục lần, hoặc xóa sạch cả nguồn rồi nhập lại.
                const partCount = new Map();
                for (const w of res.data) {
                    const p = (w.part || '').trim();
                    if (!p) continue;
                    partCount.set(p, (partCount.get(p) || 0) + 1);
                }
                const parts = [...partCount.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi'));

                // Một nút mở popup lọc, thay cho hàng nút Part của bản trước.
                //
                // Nút-mỗi-Part chỉ giải quyết được đúng một tiêu chí. Muốn bỏ
                // "mọi danh từ mức HSK1 trong BUỔI 3" thì lại phải bấm × từng
                // dòng. Popup lọc theo nhiều điều kiện (AND) — cùng kiểu "Xóa
                // chọn lọc" bên admin — phủ được cả hai nhu cầu, mà hàng nút
                // cũng không còn dài ra theo số Part.
                const partBarHtml = `
                    <div class="uv-part-bar">
                        <button type="button" class="uv-filter-del-btn">
                            <i class="fas fa-filter"></i> Xóa chọn lọc
                        </button>
                        <span class="uv-part-bar-hint">${parts.length} Part · ${res.data.length} từ</span>
                    </div>`;

                panel.innerHTML = `
                    ${partBarHtml}
                    <div style="max-height:260px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px">
                        <table style="width:100%;border-collapse:collapse;font-size:12px">
                            <thead><tr style="background:var(--bg-tertiary,var(--bg-secondary))">
                                <th class="uv-th">English</th>
                                <th class="uv-th">Vietnamese</th>
                                <th class="uv-th">Part</th>
                                <th class="uv-th">Ngày hết hạn</th>
                                <th class="uv-th"></th>
                            </tr></thead>
                            <tbody id="word-rows">
                                ${res.data.map(w => {
                                    // `en` và `vn` là dữ liệu người dùng nhập, phải escape
                                    // trước khi vào innerHTML — trước đây nhét thẳng.
                                    const en = esc(w.en);
                                    const isZh = wordLang(w) === 'zh';
                                    return `
                                    <tr class="uv-row" id="word-row-${w._id}">
                                        <td class="uv-word ${isZh ? 'is-zh' : ''}">
                                            ${en}
                                            ${w.phonetic ? `<span class="uv-phonetic">${esc(w.phonetic)}</span>` : ''}
                                        </td>
                                        <td class="uv-vn">${esc(w.vn) || '—'}</td>
                                        <td><span class="uv-part">${esc(w.part) || '—'}</span></td>
                                        <td class="uv-exp">${w.expiresAt ? new Date(w.expiresAt).toLocaleDateString('vi-VN') : 'Không hết hạn'}</td>
                                        <td class="uv-actions">
                                            <button class="uv-btn uv-speak-btn" title="Nghe phát âm"
                                                data-text="${en}" data-lang="${ttsLangOf(w)}">
                                                <i class="fas fa-volume-up"></i>
                                            </button>
                                            <button class="uv-btn uv-edit-btn" title="Sửa từ này"
                                                data-id="${w._id}">
                                                <i class="fas fa-pen"></i>
                                            </button>
                                            <button class="uv-btn uv-del-btn word-delete-btn" title="Xoá từ này"
                                                data-id="${w._id}" data-en="${en}">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>`;
                panel.querySelectorAll('.word-delete-btn').forEach(btn => {
                    btn.addEventListener('click', () => deleteWord(btn.dataset.id, btn.dataset.en, source));
                });

                panel.querySelector('.uv-filter-del-btn')?.addEventListener('click', () => {
                    // Truyền cả `res.data` để popup gợi ý sẵn các giá trị CÓ THẬT
                    // trong nguồn — người dùng chọn từ danh sách thay vì gõ tay
                    // rồi trượt vì sai một chữ.
                    showFilterDeleteModal(source, res.data, panel);
                });

                // Nghe phát âm. `data-lang` đã tính sẵn theo từng từ (xem wordLang):
                // bộ này trộn Anh–Trung nên đọc cả bảng bằng một giọng là sai.
                panel.querySelectorAll('.uv-speak-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        GameLogic.speakWord(btn.dataset.text, btn.dataset.lang || 'en-US');
                    });
                });

                // Sửa từ — tái dùng chính popup Dịch nhanh ở chế độ sửa, thay vì
                // dựng một form riêng: nó đã có sẵn ô sửa cả từ lẫn nghĩa, nút
                // phát âm và tra nghĩa. Truyền nguyên bản ghi lấy từ res.data,
                // không dựng lại từ DOM — đọc ngược từ HTML là mất `lang`,
                // `source` và mọi trường không hiển thị.
                panel.querySelectorAll('.uv-edit-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const w = res.data.find(x => String(x._id) === btn.dataset.id);
                        if (!w) return;
                        // Sửa bằng chính form "Thêm từ mới", KHÔNG mở popup Dịch
                        // nhanh: popup đó chỉ có 4 trường nên không sửa được
                        // `type`/`level`/`example`/`image`, mà đó mới là những thứ
                        // hay phải chỉnh sau khi nhập hàng loạt bằng JSON.
                        // Cũng không phải gọi API dịch cho một từ đã có sẵn nghĩa.
                        // Sau khi cập nhật thì QUAY LẠI tab quản lý, không gọi
                        // loadWords(source, panel): chuyển tab làm onEnterTab
                        // dựng lại toàn bộ danh sách, nên `panel` đang cầm đã bị
                        // gỡ khỏi DOM — ghi vào đó là ghi vào hư không.
                        startEdit(w, () => {
                            document.dispatchEvent(new CustomEvent('upload-set-tab', { detail: 'manage' }));
                        });
                    });
                });
            } catch (err) { panel.innerHTML = `<p style="color:#dc2626;font-size:13px">Lỗi: ${err.message}</p>`; }
        };

        /**
         * Popup "Xóa chọn lọc" — lọc theo nhiều điều kiện AND rồi xóa hàng loạt.
         *
         * Dựng theo đúng kiểu popup cùng tên bên admin, nhưng khác một điểm quan
         * trọng: ô GIÁ TRỊ là <select> chứa các giá trị CÓ THẬT trong nguồn, chứ
         * không phải ô gõ tự do. Gõ tay thì sai một chữ ("buoi 3" vs "BUỔI 3") là
         * khớp 0 từ — báo thành công mà chẳng xóa gì.
         */
        const FILTER_FIELDS = [
            { value: 'part',  label: 'Part' },
            { value: 'level', label: 'Cấp độ (level)' },
            { value: 'type',  label: 'Loại từ (type)' },
        ];

        const showFilterDeleteModal = (source, words, panel) => {
            document.getElementById('uv-filter-delete-modal')?.remove();

            // Các giá trị CÓ THẬT của từng trường, kèm số từ — để người dùng thấy
            // trước mình sắp xoá bao nhiêu.
            const valuesOf = (field) => {
                const m = new Map();
                for (const w of words) {
                    const v = String(w[field] || '').trim();
                    if (!v) continue;
                    m.set(v, (m.get(v) || 0) + 1);
                }
                return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi'));
            };

            const rowHtml = (idx) => {
                const fieldOpts = FILTER_FIELDS
                    .map(f => `<option value="${f.value}">${f.label}</option>`).join('');
                return `
                    <div class="uv-fd-row" data-idx="${idx}">
                        <select class="uv-fd-field">
                            <option value="">— Trường —</option>
                            ${fieldOpts}
                        </select>
                        <select class="uv-fd-value" disabled>
                            <option value="">— Giá trị —</option>
                        </select>
                    </div>`;
            };

            const modal = document.createElement('div');
            modal.id = 'uv-filter-delete-modal';
            modal.className = 'uv-fd-overlay';
            modal.innerHTML = `
                <div class="uv-fd-box" role="dialog" aria-modal="true" aria-label="Xóa chọn lọc">
                    <h3 class="uv-fd-title"><i class="fas fa-filter"></i> Xóa chọn lọc</h3>
                    <p class="uv-fd-desc">
                        Xóa mọi từ trong <strong>${esc(source)}</strong> thỏa <strong>tất cả</strong>
                        điều kiện bên dưới. Dòng để trống được bỏ qua.
                    </p>
                    <div class="uv-fd-head"><span>TRƯỜNG</span><span>GIÁ TRỊ</span></div>
                    <div class="uv-fd-rows">${rowHtml(0)}${rowHtml(1)}${rowHtml(2)}</div>
                    <p class="uv-fd-preview"></p>
                    <div class="uv-fd-actions">
                        <button type="button" class="uv-fd-cancel">Hủy</button>
                        <button type="button" class="uv-fd-confirm"><i class="fas fa-trash"></i> Xóa</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);

            const preview = modal.querySelector('.uv-fd-preview');
            const close = () => modal.remove();

            /** Điều kiện đang chọn (bỏ dòng trống). */
            const readFilters = () => [...modal.querySelectorAll('.uv-fd-row')]
                .map(r => ({
                    field: r.querySelector('.uv-fd-field').value,
                    value: r.querySelector('.uv-fd-value').value,
                }))
                .filter(p => p.field && p.value);

            /** Đếm TRƯỚC ở client để hiện "sẽ xóa N từ" — không phải gọi server. */
            const updatePreview = () => {
                const filters = readFilters();
                if (!filters.length) { preview.textContent = ''; return; }
                const n = words.filter(w =>
                    filters.every(f => String(w[f.field] || '').trim() === f.value)).length;
                const cond = filters.map(f => `${f.field} = "${f.value}"`).join(' VÀ ');
                preview.innerHTML = n
                    ? `Sẽ xóa <strong>${n}</strong> từ — ${esc(cond)}`
                    : `<span class="uv-fd-warn">Không từ nào khớp — ${esc(cond)}</span>`;
            };

            // Chọn trường thì đổ danh sách giá trị tương ứng.
            modal.querySelectorAll('.uv-fd-field').forEach(sel => {
                sel.addEventListener('change', () => {
                    const valSel = sel.closest('.uv-fd-row').querySelector('.uv-fd-value');
                    const field = sel.value;
                    if (!field) {
                        valSel.innerHTML = '<option value="">— Giá trị —</option>';
                        valSel.disabled = true;
                    } else {
                        const opts = valuesOf(field)
                            .map(([v, n]) => `<option value="${esc(v)}">${esc(v)} (${n})</option>`).join('');
                        valSel.innerHTML = `<option value="">— Giá trị —</option>${opts}`;
                        valSel.disabled = false;
                    }
                    updatePreview();
                });
            });
            modal.querySelectorAll('.uv-fd-value').forEach(sel => {
                sel.addEventListener('change', updatePreview);
            });

            modal.querySelector('.uv-fd-cancel').addEventListener('click', close);
            // Bấm ra nền ngoài thì đóng — nhưng chỉ khi bấm ĐÚNG lớp phủ, không
            // phải khi bấm bên trong hộp rồi thả chuột ra ngoài.
            modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

            const confirmBtn = modal.querySelector('.uv-fd-confirm');
            confirmBtn.addEventListener('click', async () => {
                const filters = readFilters();
                if (!filters.length) {
                    preview.innerHTML = '<span class="uv-fd-warn">Chọn ít nhất một điều kiện.</span>';
                    return;
                }
                const cond = filters.map(f => `${f.field} = "${f.value}"`).join(' VÀ ');
                if (!confirm(`Xóa mọi từ thỏa:\n${cond}\n\nKhông thể hoàn tác.`)) return;

                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xóa...';
                try {
                    const res = await UploadVocabAPI.filterDeleteSource(source, filters);
                    if (!res.success) throw new Error(res.message);
                    close();

                    const topicRow = document.querySelector(`.topic-row[data-source="${source}"]`);
                    // Xóa sạch nguồn → thẻ nguồn biến mất; dựng lại bảng lúc này
                    // là ghi vào một thẻ sắp bị gỡ khỏi DOM.
                    if (res.sourceGone) {
                        if (topicRow) (topicRow.closest('.topic-item') || topicRow).remove();
                        Notification.success(res.message);
                        return;
                    }
                    if (topicRow) {
                        const newCount = Math.max(0, parseInt(topicRow.dataset.count, 10) - (res.deletedCount || 0));
                        topicRow.dataset.count = newCount;
                        topicRow.querySelector('div:first-child div:last-child').textContent = `${newCount} từ`;
                    }
                    loadWords(source, panel);
                    Notification.success(res.message);
                } catch (err) {
                    preview.innerHTML = `<span class="uv-fd-warn">${esc(err.message || 'Không xóa được')}</span>`;
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = '<i class="fas fa-trash"></i> Xóa';
                }
            });
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
        //
        // KHÔNG dùng inline onclick: CSP production đặt `script-src-attr 'none'`
        // nên trình duyệt chặn thẳng, bấm nút không có gì xảy ra và không có lỗi
        // nào ngoài một dòng trong console. Nút vẫn hiện, vẫn đổi màu khi rê
        // chuột — nhìn như đang hoạt động. Đây là lần thứ hai inline handler
        // chết vì CSP (lần trước là nút X đóng sidebar bên admin).
        //
        // Nút được chèn bằng dangerouslySetInnerHTML nên không gắn listener
        // trực tiếp lúc tạo chuỗi được. Uỷ quyền ở document là cách không phụ
        // thuộc thời điểm nút xuất hiện trong DOM.
        // Thời hạn lưu đưa lên HEADER, dùng CHUNG cho cả hai tab.
        //
        // Trước đây mỗi tab có ô riêng (`vocab-retention`, `json-retention`) nằm
        // lọt giữa form — vừa chiếm chỗ, vừa là hai giá trị độc lập cho cùng một
        // khái niệm: đặt 7 ngày ở tab "Thêm từ mới" rồi sang tab JSON vẫn thấy
        // 30 ngày, không có gì báo là hai ô khác nhau.
        //
        // Nút Đồng bộ ở HEADER, không nằm trong mục "Bộ từ đã nhận": nó làm mới
        // cả ba mục (bộ của mình, lời mời, bộ đã nhận) chứ không riêng mục nào.
        const manageBtnHtml = `
            <div style="display:flex;align-items:center;gap:8px">
                <select id="upload-retention" title="Thời hạn lưu — hết hạn sẽ tự xoá"
                    style="padding:6px 10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-size:12px;font-weight:600;cursor:pointer">
                    ${RETENTION_OPTIONS.map(d => `<option value="${d}"${d === DEFAULT_RETENTION ? ' selected' : ''}>${d} ngày</option>`).join('')}
                </select>
                <button type="button" id="upload-tab-manage" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap"><i class="fas fa-list"></i> Quản lý từ vựng</button>
                <button type="button" id="upload-sync" title="Đồng bộ — tải lại toàn bộ từ máy chủ"
                    aria-label="Đồng bộ"
                    style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-size:14px"><i class="fas fa-rotate-right"></i></button>
            </div>`;

        if (!document._uploadManageBound) {
            document._uploadManageBound = true;
            document.addEventListener('click', (e) => {
                if (e.target?.closest?.('#upload-tab-manage')) {
                    document.dispatchEvent(new CustomEvent('upload-set-tab', { detail: 'manage' }));
                }
            });
        }

        const contentJsx = createElement(TabbedModalBody, {
            tabs: [
                { key: 'add', label: 'Thêm từ mới', icon: 'fa-plus' },
                { key: 'json', label: 'Thêm JSON', icon: 'fa-code' },
                { key: 'share', label: 'Chia sẻ', icon: 'fa-user-plus' },
                { key: 'received', label: 'Được chia sẻ', icon: 'fa-handshake' },
                // "Quản lý" KHÔNG nằm trên thanh tab — vào bằng nút "Quản lý từ
                // vựng" ở header (nút đó hiện ở MỌI khổ màn hình, xem
                // responsive.css). Trạng thái `manage` vẫn còn nguyên: nút
                // header và luồng "sửa xong thì quay lại" đều phát
                // `upload-set-tab` → 'manage'.
            ],
            initialTab: tab === 'manage' ? 'manage' : (tab === 'share' ? 'share' : (tab === 'received' ? 'received' : 'add')),
            renderBody: (t) => (
                t === 'add' ? addTabHtml()
                : t === 'json' ? jsonTabHtml()
                : t === 'share' ? shareTabHtml()
                : t === 'received' ? receivedTabHtml()
                : manageTabHtml()
            ),
            onEnterTab: (t) => {
                _currentTab = t;
                if (t === 'add') attachAddHandlers();
                else if (t === 'json') attachJsonHandlers();
                else if (t === 'share') loadShareTab();
                else if (t === 'received') { loadShareInbox(); loadAcceptedShares(); }
                else if (t === 'manage') loadMyTopics();
            },
            onLeaveTab: (t) => {
                if (t === 'add') saveAddTabState();
                else if (t === 'json') saveJsonTabState();
            },
        });

        // Nút Đồng bộ: uỷ quyền ở document vì nút do React chèn, chưa có trong DOM
        // lúc này. Nhưng KHÁC nút "Quản lý" ở trên — cái đó chỉ phát một sự kiện
        // nên gắn một lần vĩnh viễn là được, còn cái này gọi các hàm `load*` là
        // closure của LẦN MỞ NÀY. Không gỡ khi đóng thì mở lại lần hai là hai
        // listener cùng chạy, cái cũ trỏ vào DOM đã bị vứt.
        const onSyncClick = (e) => {
            if (!e.target?.closest?.('#upload-sync')) return;
            // Làm mới TẤT CẢ, không chỉ tab đang mở.
            //
            // Bản trước chỉ tải lại đúng tab hiện tại — nhưng bốn tab này đọc
            // cùng một kho: thêm từ ở tab "Thêm từ mới" thì danh sách bên "Quản
            // lý" và ô chọn bộ bên "Chia sẻ" đều cũ. Người dùng bấm Đồng bộ là
            // muốn mọi thứ khớp lại, không phải khớp riêng chỗ đang nhìn.
            //
            // Các hàm này tự kiểm phần tử đích có trong DOM chưa (`if (!box)
            // return`), nên gọi hết là an toàn kể cả khi tab kia chưa dựng.
            loadMyTopics();
            loadShareTab();
            loadShareInbox();
            loadAcceptedShares();
            Notification.show({ type: 'success', message: 'Đã đồng bộ', duration: 1400 });
        };
        document.addEventListener('click', onSyncClick);

        return {
            contentJsx,
            headerActionHtml: manageBtnHtml,
            dispose: () => document.removeEventListener('click', onSyncClick),
        };
}

/**
 * Mở "Từ vựng riêng" dạng POPUP.
 *
 * Vẫn giữ vì popup Dịch nhanh cần mở thẳng sang tab Quản lý mà không rời màn
 * đang xem — bắt người dùng chuyển màn giữa lúc đang dịch dở là cướp thao tác.
 */
export function openUploadModal({ tab } = {}) {
    const { contentJsx, headerActionHtml, dispose } = buildUploadContent({ tab });
    Modal.show({
        title: '☁️ Từ vựng riêng',
        contentJsx,
        headerActionHtml,
        wide: true,
        onClose: dispose,
    });
}
