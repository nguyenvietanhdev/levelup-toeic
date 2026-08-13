import { useEffect, useRef, useState } from 'react';
import { useEscapeToClose } from '@lib/useEscapeToClose.js';
import { isSpeechSupported, speechLangFor, createSpeechInput } from '@lib/speechInput.js';
import { createHoldGesture } from '@lib/holdGesture.js';
import { GameState } from '@game/state.js';
import { getVocabLang } from '@api/vocabulary.js';
import { FavoritesAPI } from '@api/favorites.js';
import { UploadVocabAPI } from '@api/uploadVocab.js';
import { openUploadModal } from '@components/vocab/upload/openUploadModal.js';
import { Notification } from '@ui/Toaster.jsx';

// Ngôn ngữ học của hệ thống (en/zh) → mã đích ưu tiên khi dịch.
const studyTargetLang = () => (getVocabLang() === 'zh' ? 'zh-CN' : 'en');
// Chuẩn hoá so sánh: 'zh-CN'→'zh', 'en'→'en', 'vi'→'vi'.
const baseLang = (code) => String(code || '').split('-')[0];

// Mã ngôn ngữ → tên tiếng Việt (hiện nguồn phát hiện được).
const LANG_NAMES = {
    en: 'Tiếng Anh', vi: 'Tiếng Việt', zh: 'Tiếng Trung', 'zh-CN': 'Tiếng Trung',
    ja: 'Tiếng Nhật', ko: 'Tiếng Hàn', fr: 'Tiếng Pháp', de: 'Tiếng Đức',
    es: 'Tiếng Tây Ban Nha', ru: 'Tiếng Nga', th: 'Tiếng Thái',
};

// Mã ngôn ngữ → BCP-47 cho TTS (phát âm).
const SPEAK_LANG = {
    en: 'en-US', vi: 'vi-VN', zh: 'zh-CN', 'zh-CN': 'zh-CN',
    ja: 'ja-JP', ko: 'ko-KR', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', ru: 'ru-RU', th: 'th-TH',
};
const speakLangOf = (code) => SPEAK_LANG[code] || (code ? `${code}` : 'en-US');

// Phát âm ĐÚNG ngôn ngữ (vi/en/zh...) — không dùng giọng en/zh của luyện tập.
// Ưu tiên Google Translate TTS (giọng bản ngữ), lỗi thì dùng giọng hệ thống đúng lang.
function fallbackSpeak(text, code) {
    try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = speakLangOf(code);
        const base = String(code || '').split('-')[0];
        const v = (window.speechSynthesis.getVoices() || []).find(x => x.lang.toLowerCase().startsWith(base));
        if (v) u.voice = v;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
    } catch { /* no-op */ }
}

function speakText(text, code) {
    if (!text) return;
    const tl = code === 'zh-CN' || code === 'zh' ? 'zh-CN' : String(code || 'en').split('-')[0];
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(tl)}&client=tw-ob&q=${encodeURIComponent(text.slice(0, 200))}`;
    let fell = false;
    const fb = () => { if (!fell) { fell = true; fallbackSpeak(text, code); } };
    try {
        const audio = new Audio(url);
        audio.onerror = fb;
        audio.play().catch(fb);
    } catch { fb(); }
}

// Ngôn ngữ đích chọn được.
const TARGETS = [
    { code: 'vi', label: 'Tiếng Việt' },
    { code: 'en', label: 'English' },
    { code: 'zh-CN', label: '中文' },
];

// Danh sách ngôn ngữ cho 2 select kiểu Google Dịch.
const SELECT_LANGS = [
    { code: 'en', label: 'English' },
    { code: 'vi', label: 'Tiếng Việt' },
    { code: 'zh-CN', label: '中文' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'es', label: 'Español' },
    { code: 'ru', label: 'Русский' },
    { code: 'th', label: 'ไทย' },
];

function isAlreadyFavorite(en) {
    const favs = GameState.state?.progress?.favoriteWords || [];
    return favs.some(w => (w.en || w.word || '').toLowerCase() === (en || '').toLowerCase());
}

/**
 * Popup dịch trong app — gọi API công khai của Google Translate (không cần key).
 * Hỗ trợ phát âm, đổi ngôn ngữ đích (gồm tiếng Trung) và dịch đảo ngược.
 */
/**
 * @param {object|null} editWord  Bản ghi từ vựng riêng đang SỬA. Có nó thì modal
 *   chạy ở chế độ sửa: nút lưu thành "Cập nhật" và gọi PUT thay vì tạo bản ghi
 *   mới. Không có thì đây là popup dịch bình thường như trước.
 */
export default function TranslateModal({ text, onClose, onOpenFavorites, editWord = null, onSaved }) {
    const isEditing = !!editWord?._id;
    const [inputText, setInputText] = useState(text);
    // Mặc định dịch sang ngôn ngữ hệ thống đang học (Anh/Trung); nếu nguồn trùng
    // ngôn ngữ này thì sẽ tự đổi sang Tiếng Việt (xử lý sau khi phát hiện nguồn).
    const [targetLang, setTargetLang] = useState(studyTargetLang);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null); // { translated, sourceLang, part, synonyms, phonetic }
    const [saved, setSaved] = useState(() => isAlreadyFavorite(text));
    const [savedVocab, setSavedVocab] = useState(false);
    const [srcDraft, setSrcDraft] = useState(text);   // ô GỐC sửa được
    const [editedVn, setEditedVn] = useState('');      // ô bản dịch sửa được
    const [srcLang, setSrcLang] = useState('auto');    // ngôn ngữ nguồn (auto = tự phát hiện)

    useEscapeToClose(onClose);

    // Con trỏ về CUỐI chữ, không bôi đen cả ô.
    //
    // `autoFocus` trên input có sẵn nội dung sẽ chọn hết chữ ở một số trình
    // duyệt — gõ thêm một ký tự là mất sạch từ vừa đọc được. Đặt lại vùng chọn
    // về cuối để sửa tiếp được ngay.
    useEffect(() => {
        const el = document.getElementById('translate-src-input');
        if (!el) return;
        const n = el.value.length;
        try { el.setSelectionRange(n, n); } catch { /* input type không hỗ trợ */ }
    }, []);

    // ── Giữ Shift để nói NGAY TRONG popup ────────────────────────────────────
    //
    // Xung đột phải giải: thanh nav cũng bắt phím Shift để nói vào ô tìm kiếm.
    // Hai listener cùng nghe một phím thì popup đang mở mà giữ Shift là chữ chui
    // vào ô tìm kiếm sau lưng — đúng thứ vừa xảy ra trên màn hình.
    //
    // Cách giải KHÔNG phải là thêm điều kiện ở mỗi bên (rồi bên thứ ba lại quên),
    // mà là NHƯỜNG QUYỀN: popup đăng ký `window._speechOwner` khi mở, nav thấy có
    // chủ khác thì đứng im. Ai mở sau thì chiếm, đóng thì trả lại.
    const speechRef = useRef(null);
    const [listening, setListening] = useState(false);
    const heardRef = useRef('');

    useEffect(() => {
        if (!isSpeechSupported()) return;

        const s = createSpeechInput({
            lang: speechLangFor(getVocabLang()),
            onText: (t) => { heardRef.current = t; setSrcDraft(t); },
            onStateChange: (on) => {
                setListening(on);
                if (on) { heardRef.current = ''; return; }
                // Nói xong thì dịch luôn nội dung mới — không bắt bấm thêm.
                const t = heardRef.current.trim();
                heardRef.current = '';
                if (t) setInputText(t);
            },
            onError: () => Notification.show({
                type: 'warning', title: '🎤 Không nghe được',
                message: 'Thử lại hoặc gõ tay.', duration: 3000,
            }),
        });
        speechRef.current = s;

        const gesture = createHoldGesture({
            thresholdMs: 350,
            onStart: () => { setSrcDraft(''); s.start(); },   // xoá chữ cũ trước khi nghe
            onStop: () => s.stop(),
        });

        // Đang gõ trong một ô của chính popup thì đừng cướp phím.
        // Ô GỐC là ngoại lệ — đó chính là nơi chữ sẽ hiện ra, nên giữ Shift ở đó
        // phải nói được. Không trừ nó ra thì việc tự focus (ngay bên dưới) tự
        // phá chính mình: con trỏ vào ô, `typing()` thành true, phím tắt chết.
        //
        // Các ô còn lại (bản dịch sửa được, ô tìm trong danh sách…) vẫn chặn:
        // đang gõ mà Shift giật micro là rất khó chịu.
        const typing = () => {
            const el = document.activeElement;
            if (!el) return false;
            if (el.id === 'translate-src-input') return false;
            return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || !!el.isContentEditable;
        };

        const onKeyDown = (e) => {
            if (e.key === 'Shift') { if (!typing()) gesture.keyDown({ repeat: e.repeat }); }
            else gesture.otherKeyDown();
        };
        const onKeyUp = (e) => { if (e.key === 'Shift') gesture.keyUp(); };
        const onBlur = () => { gesture.reset(); s.stop(); };

        // Chiếm quyền. Nav đọc cờ này để tự đứng im.
        const prevOwner = window._speechOwner;
        window._speechOwner = 'translate-modal';

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
            gesture.reset();
            s.destroy();
            speechRef.current = null;
            // Trả quyền về đúng chủ trước đó, không xoá trắng — lồng hai popup
            // thì cái trong đóng phải trả lại cho cái ngoài, không phải cho nav.
            window._speechOwner = prevOwner;
        };
    }, []);

    // Số từ yêu thích đọc thẳng từ GameState — có sẵn tại chỗ, không tốn request.
    // Đặt trong state để còn tăng lên ngay khi bấm Thêm (xem hai handler bên dưới).
    const [favCount, setFavCount] = useState(
        () => (GameState.state?.progress?.favoriteWords || []).length
    );
    // Từ vựng riêng phải hỏi server: tổng = cộng wordCount của mọi nguồn.
    const [vocabCount, setVocabCount] = useState(null);   // null = chưa biết

    useEffect(() => {
        let alive = true;
        UploadVocabAPI.myTopics()
            .then(res => {
                if (!alive || !res?.success || !Array.isArray(res.data)) return;
                setVocabCount(res.data.reduce((n, t) => n + (t.wordCount || 0), 0));
            })
            // Hỏng thì để null — nút chỉ không hiện số, chứ không hiện "0" sai sự thật.
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    const fullUrl = `https://translate.google.com.vn/?sl=${srcLang}&tl=${targetLang}&text=${encodeURIComponent(inputText)}&op=translate`;

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(''); setResult(null);
        setSaved(isAlreadyFavorite(inputText));
        setSavedVocab(false);
        (async () => {
            try {
                const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${srcLang}&tl=${targetLang}&dt=t&dt=bd&dt=rm&q=${encodeURIComponent(inputText)}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error('Không dịch được');
                const data = await res.json();
                if (cancelled) return;

                const sourceLang = data[2] || 'auto';

                // Không dịch sang cùng ngôn ngữ với nguồn → tự đổi đích.
                if (sourceLang !== 'auto' && baseLang(sourceLang) === baseLang(targetLang)) {
                    const study = studyTargetLang();
                    const next = baseLang(study) !== baseLang(sourceLang) ? study : 'vi';
                    if (!cancelled) setTargetLang(next); // effect chạy lại với đích mới
                    return;
                }

                const translated = (data[0] || []).map(seg => seg[0]).filter(Boolean).join('');
                const phonetic = (data[0] || []).map(seg => seg[3]).filter(Boolean).join(' ');
                const dict = Array.isArray(data[1]) ? data[1] : [];
                const part = dict[0]?.[0] || '';
                const synonyms = dict.flatMap(d => d[1] || []).slice(0, 6).join(', ');

                setResult({ translated, sourceLang, part, synonyms, phonetic });
            } catch {
                if (!cancelled) setError('Không kết nối được dịch vụ dịch. Hãy mở Google Dịch đầy đủ.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [inputText, targetLang, srcLang]);

    // Đồng bộ ô GỐC khi nguồn đổi (đảo ngược / chọn lại); ô bản dịch theo kết quả.
    useEffect(() => { setSrcDraft(inputText); }, [inputText]);
    useEffect(() => { if (result?.translated) setEditedVn(result.translated); }, [result]);

    // Gõ ở ô GỐC → tự dịch lại sau 450ms (ô dưới cập nhật theo).
    useEffect(() => {
        const v = srcDraft.trim();
        if (!v || v === inputText) return;
        const id = setTimeout(() => setInputText(v), 450);
        return () => clearTimeout(id);
    }, [srcDraft, inputText]);

    const speak = (txt, langCode) => speakText(txt, langCode);

    // Dịch đảo ngược: lấy bản dịch làm đầu vào, đổi đích về ngôn ngữ nguồn vừa phát hiện.
    const handleReverse = () => {
        if (!result?.translated) return;
        const detected = result.sourceLang && result.sourceLang !== 'auto' ? result.sourceLang : 'en';
        setSrcLang(targetLang);        // nguồn mới = đích cũ
        setTargetLang(detected);       // đích mới = ngôn ngữ nguồn vừa phát hiện
        setInputText(result.translated);
    };

    const handleSaveFavorite = () => {
        if (!result?.translated || saved) return;
        // Lưu theo shape {en, vn}: ưu tiên gán đúng phía Anh/Việt (dùng bản dịch đã sửa).
        const vnText = editedVn.trim() || result.translated;
        let en = inputText.trim();
        let vn = vnText;
        if (result.sourceLang === 'vi') { en = vnText; vn = inputText.trim(); }

        const entry = { en, vn, phonetic: result.phonetic || '', synonyms: result.synonyms || '', part: result.part || '' };
        if (!GameState.state.progress) GameState.state.progress = {};
        const favs = GameState.state.progress.favoriteWords || [];
        if (!isAlreadyFavorite(en)) {
            GameState.state.progress.favoriteWords = [...favs, entry];
            FavoritesAPI.add(entry).catch(() => {});
            GameState.save?.();
        }
        setSaved(true);
        // Tăng ngay để số trên nút khớp với việc vừa làm. Không cập nhật thì bấm
        // Thêm xong vẫn thấy số cũ, người dùng tưởng lưu hỏng và bấm lại.
        setFavCount(n => n + 1);
        Notification.show({ type: 'success', message: `Đã lưu "${en}" vào từ vựng yêu thích`, duration: 1800 });
    };

    // Chế độ SỬA: cập nhật bản ghi có sẵn thay vì tạo mới.
    //
    // Chỉ gửi nội dung, KHÔNG gửi source/part — từ đang nằm ở kho nào thì ở
    // nguyên đó. Sửa nội dung mà từ nhảy sang kho khác là điều không ai chờ đợi,
    // và backend cũng từ chối đổi hai trường đó qua route này.
    const handleUpdateWord = async () => {
        const vnText = editedVn.trim() || result?.translated || editWord.vn || '';
        const enText = srcDraft.trim() || editWord.en;
        if (!enText) return;

        try {
            const res = await UploadVocabAPI.updateWord(editWord._id, {
                en: enText,
                vn: vnText,
                phonetic: result?.phonetic || editWord.phonetic || '',
                synonyms: result?.synonyms || editWord.synonyms || '',
            });
            if (res?.success) {
                Notification.show({ type: 'success', message: `Đã cập nhật "${enText}"`, duration: 1800 });
                onSaved?.();
                onClose?.();
            } else {
                // 409 = trùng tên trong cùng kho. Thông báo của server đã nói rõ,
                // nên hiện nguyên văn thay vì nuốt đi rồi báo chung chung.
                Notification.error(res?.message || 'Cập nhật thất bại');
            }
        } catch {
            Notification.error('Không kết nối được máy chủ');
        }
    };

    // Lưu vào "Từ vựng riêng" (user upload) — gom vào source "dich-nhanh".
    const handleSaveVocab = async () => {
        if (!result?.translated || savedVocab) return;
        const vnText = editedVn.trim() || result.translated;
        let en = inputText.trim();
        let vn = vnText;
        if (result.sourceLang === 'vi') { en = vnText; vn = inputText.trim(); }

        try {
            // Ghi lại NGÔN NGỮ của từ được lưu. Bộ từ vựng riêng trộn Anh–Trung:
            // gõ `你会吗` rồi lưu là chữ Hán nằm trong trường `en` cạnh từ tiếng
            // Anh thật. Không có cờ này thì nút phát âm đọc `你会吗` bằng giọng
            // Anh — ra một tràng vô nghĩa mà không có lỗi nào.
            // Trường `en` chứa BẢN DỊCH khi người dùng gõ tiếng Việt (xem dòng
            // hoán đổi ngay trên), nên ngôn ngữ của nó là ngôn ngữ ĐÍCH; còn lại
            // thì là ngôn ngữ NGUỒN. `targetLang` là state riêng, không nằm trong
            // `result` — dùng result.targetLang là undefined và mọi từ Trung bị
            // ghi nhầm thành 'en'.
            // baseLang() vì Google trả 'zh-CN'/'zh-TW', không phải 'zh'.
            const langOfEn = result.sourceLang === 'vi' ? targetLang : result.sourceLang;
            const savedLang = baseLang(langOfEn) === 'zh' ? 'zh' : 'en';

            // Tách kho theo NGÔN NGỮ, không dồn chung một chỗ.
            //
            // Trước đây mọi từ đều vào source 'dich-nhanh' / part 'DICH-NHANH'.
            // Mà luyện tập lọc theo `part` (practiceManager.js:76), nên chọn Part
            // đó lúc đang học tiếng Anh sẽ ra lẫn chữ Hán — và ngược lại. Trường
            // `lang` thêm ở commit trước chỉ chọn được GIỌNG ĐỌC, không tách được
            // kho, vì bộ lọc không nhìn tới nó.
            //
            // Cả hai kho đều mang hậu tố ngôn ngữ — 'dich-nhanh' trơ trọi không
            // nói được nó chứa thứ tiếng gì, mà giờ có tới hai kho. Bản ghi cũ
            // trong 'dich-nhanh' đã chuyển hết bằng scripts/splitDichNhanhByLang.js.
            const isZhWord = savedLang === 'zh';
            const source = isZhWord ? 'dich-nhanh-zh' : 'dich-nhanh-en';
            const part = isZhWord ? 'DICH-NHANH-ZH' : 'DICH-NHANH-EN';

            const res = await UploadVocabAPI.create({
                en, vn, lang: savedLang,
                source,
                part,
                type: result.part || '',
                phonetic: result.phonetic || '',
                synonyms: result.synonyms || '',
                retentionDays: 30,
            });
            if (res?.success) {
                setSavedVocab(true);
                setVocabCount(n => (n === null ? null : n + 1));
                Notification.show({ type: 'success', message: `Đã lưu "${en}" vào từ vựng riêng`, duration: 1800 });
            } else {
                Notification.error(res?.message || 'Lưu thất bại (cần đăng nhập?)');
            }
        } catch {
            Notification.error('Lỗi kết nối');
        }
    };

    const targetName = LANG_NAMES[targetLang] || targetLang;

    return (
        <div id="modal-container" className="active translate-layer">
            <div className="modal-backdrop" onClick={onClose}></div>
            <div className="modal translate-modal" style={{ maxWidth: 480, width: '92vw' }}>
                <div className="modal-header">
                    <h3>
                        <i className={`fas ${isEditing ? 'fa-pen' : 'fa-language'}`}></i>
                        {isEditing ? ' Sửa từ' : ' Dịch nhanh'}
                    </h3>
                    <button className="icon-btn modal-close-btn" onClick={onClose}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div className="modal-body" style={{ padding: 20 }}>
                    {/* Chọn ngôn ngữ đích — ẩn tab trùng ngôn ngữ nguồn (chỉ dịch 2 tiếng) */}
                    <div className="translate-targets">
                        <span className="translate-targets-label">Dịch sang:</span>
                        {TARGETS
                            .filter(t => !result?.sourceLang || result.sourceLang === 'auto'
                                || baseLang(t.code) !== baseLang(result.sourceLang))
                            .map(t => (
                                <button
                                    key={t.code}
                                    className={`translate-lang-btn${targetLang === t.code ? ' active' : ''}`}
                                    onClick={() => setTargetLang(t.code)}
                                >
                                    {t.label}
                                </button>
                            ))}
                        <a className="btn btn-secondary btn-sm translate-gg-link" href={fullUrl} target="_blank" rel="noopener noreferrer">
                            <i className="fas fa-external-link-alt"></i> Google Dịch
                        </a>
                    </div>

                    {/* 2 select chọn ngôn ngữ kiểu Google Dịch */}
                    <div className="translate-lang-selects">
                        <select
                            className="translate-lang-select"
                            value={srcLang}
                            onChange={e => setSrcLang(e.target.value)}
                        >
                            <option value="auto">Tự động phát hiện</option>
                            {SELECT_LANGS.map(l => (
                                <option key={l.code} value={l.code}>{l.label}</option>
                            ))}
                        </select>
                        <button className="translate-lang-swap" title="Hoán đổi ngôn ngữ" onClick={handleReverse} disabled={loading || !result}>
                            <i className="fas fa-exchange-alt"></i>
                        </button>
                        <select
                            className="translate-lang-select"
                            value={targetLang}
                            onChange={e => setTargetLang(e.target.value)}
                        >
                            {SELECT_LANGS.map(l => (
                                <option key={l.code} value={l.code}>{l.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="translate-source">
                        <div className="translate-label">
                            FROM
                            {result?.sourceLang && result.sourceLang !== 'auto' && (
                                <span className="translate-detected"> · {LANG_NAMES[result.sourceLang] || result.sourceLang}</span>
                            )}
                        </div>
                        <div className="translate-row">
                            <input
                                id="translate-src-input"
                                className="translate-input"
                                /* Focus ngay khi popup mở: nói xong ở thanh nav là
                                   popup hiện lên, con trỏ phải sẵn ở đây để giữ
                                   Shift nói tiếp được luôn — không phải bấm chuột
                                   vào form trước. Ô này là ngoại lệ của `typing()`
                                   nên phím tắt vẫn ăn khi con trỏ nằm trong nó. */
                                autoFocus
                                value={srcDraft}
                                onChange={e => setSrcDraft(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && srcDraft.trim()) setInputText(srcDraft.trim()); }}
                                onBlur={() => { const v = srcDraft.trim(); if (v && v !== inputText) setInputText(v); }}
                                placeholder="Nhập từ cần dịch..."
                            />
                            <button className="translate-speak" title="Phát âm" onClick={() => speak(srcDraft, result?.sourceLang || 'en')}>
                                <i className="fas fa-volume-up"></i>
                            </button>
                        </div>
                    </div>

                    <div className="translate-arrow">
                        {/* Chế độ SỬA: chỉ có Cập nhật / Huỷ. Hai nút "Thêm vào..."
                            ở đây sẽ tạo bản ghi THỨ HAI thay vì sửa cái đang mở —
                            đúng thứ người dùng không chờ đợi khi đang bấm Sửa. */}
                        {isEditing ? (
                            <>
                                <button
                                    className="translate-save-btn"
                                    onClick={handleUpdateWord}
                                    disabled={!srcDraft.trim()}
                                >
                                    <i className="fas fa-check"></i> Cập nhật
                                </button>
                                <button className="translate-save-btn" onClick={onClose}>
                                    <i className="fas fa-times"></i> Huỷ
                                </button>
                            </>
                        ) : (
                        <>
                        <button
                            className={`translate-save-btn${saved ? ' saved' : ''}`}
                            title={saved ? 'Từ này đã có trong danh sách từ yêu thích' : 'Đánh dấu từ này để ôn lại sau'}
                            onClick={handleSaveFavorite}
                            disabled={loading || !!error || saved}
                        >
                            {/* Ghi rõ hành động sẽ xảy ra, và khi đã lưu thì nói rõ
                                lưu vào ĐÂU — hai nút cùng hiện "Đã lưu" thì không
                                phân biệt được cái nào đã bấm. */}
                            <i className="fas fa-star"></i>
                            {saved ? ' Đã ở từ yêu thích' : ' Thêm vào từ yêu thích'}
                        </button>
                        <button
                            className={`translate-save-btn${savedVocab ? ' saved' : ''}`}
                            title={savedVocab ? 'Từ này đã có trong bộ từ vựng riêng' : 'Thêm vào bộ từ vựng riêng để đưa vào bài luyện tập'}
                            onClick={handleSaveVocab}
                            disabled={loading || !!error || savedVocab}
                        >
                            <i className="fas fa-cloud-arrow-up"></i>
                            {savedVocab ? ' Đã ở từ vựng riêng' : ' Thêm vào từ vựng riêng'}
                        </button>
                        </>
                        )}
                    </div>

                    <div className="translate-target">
                        <div className="translate-label">
                            TO
                            <span className="translate-detected"> · {targetName}</span>
                            {result?.part && <span className="translate-detected"> · {result.part}</span>}
                        </div>
                        {loading && (
                            <div className="translate-text muted"><i className="fas fa-spinner fa-spin"></i> Đang dịch...</div>
                        )}
                        {!loading && error && <div className="translate-text error">{error}</div>}
                        {!loading && result && (
                            <div className="translate-row">
                                <input
                                    className="translate-input result"
                                    value={editedVn}
                                    onChange={e => setEditedVn(e.target.value)}
                                    placeholder="Bản dịch (sửa được)..."
                                />
                                <button className="translate-speak" title="Phát âm" onClick={() => speak(editedVn, targetLang)}>
                                    <i className="fas fa-volume-up"></i>
                                </button>
                            </div>
                        )}
                        {!loading && result?.synonyms && (
                            <div className="translate-syn">Nghĩa khác: {result.synonyms}</div>
                        )}
                    </div>

                    {/* Đang sửa thì ẩn hai nút "Xem ..." — bấm vào là mở modal khác
                        đè lên, mất luôn nội dung đang sửa dở. */}
                    <div className="translate-actions" style={isEditing ? { display: 'none' } : undefined}>
                        {onOpenFavorites && (
                            <button className="btn btn-primary btn-sm" onClick={onOpenFavorites}>
                                {/* "Xem" để phân biệt với nút THÊM ở trên — hai
                                    hàng nút cùng chữ "Yêu thích" dễ bấm nhầm. */}
                                {/* Số hiện trong badge riêng, không nhét vào chuỗi:
                                    chưa biết số (API chưa trả / lỗi) thì KHÔNG hiện
                                    gì, chứ không hiện "0" — 0 là một khẳng định sai. */}
                                <i className="fas fa-star"></i> Xem từ yêu thích
                                <span className="tm-count">{favCount}</span>
                            </button>
                        )}
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openUploadModal({ tab: 'manage' })}
                        >
                            <i className="fas fa-cloud"></i> Xem từ vựng riêng
                            {vocabCount !== null && <span className="tm-count">{vocabCount}</span>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
