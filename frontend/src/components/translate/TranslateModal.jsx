import { useEffect, useState } from 'react';
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
export default function TranslateModal({ text, onClose, onOpenFavorites }) {
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
        Notification.show({ type: 'success', message: `Đã lưu "${en}" vào từ vựng yêu thích`, duration: 1800 });
    };

    // Lưu vào "Từ vựng riêng" (user upload) — gom vào source "dich-nhanh".
    const handleSaveVocab = async () => {
        if (!result?.translated || savedVocab) return;
        const vnText = editedVn.trim() || result.translated;
        let en = inputText.trim();
        let vn = vnText;
        if (result.sourceLang === 'vi') { en = vnText; vn = inputText.trim(); }

        try {
            const res = await UploadVocabAPI.create({
                en, vn,
                source: 'dich-nhanh',
                part: 'DICH-NHANH',
                type: result.part || '',
                phonetic: result.phonetic || '',
                synonyms: result.synonyms || '',
                retentionDays: 30,
            });
            if (res?.success) {
                setSavedVocab(true);
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
                    <h3><i className="fas fa-language"></i> Dịch nhanh</h3>
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
                                className="translate-input"
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
                        <button
                            className={`translate-save-btn${saved ? ' saved' : ''}`}
                            title={saved ? 'Đã lưu yêu thích' : 'Lưu yêu thích'}
                            onClick={handleSaveFavorite}
                            disabled={loading || !!error || saved}
                        >
                            <i className="fas fa-star"></i>
                            {saved ? ' Đã lưu' : ' Yêu thích'}
                        </button>
                        <button
                            className={`translate-save-btn${savedVocab ? ' saved' : ''}`}
                            title={savedVocab ? 'Đã lưu vào từ vựng riêng' : 'Lưu vào từ vựng riêng'}
                            onClick={handleSaveVocab}
                            disabled={loading || !!error || savedVocab}
                        >
                            <i className="fas fa-cloud-arrow-up"></i>
                            {savedVocab ? ' Đã lưu' : ' Từ vựng riêng'}
                        </button>
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

                    <div className="translate-actions">
                        {onOpenFavorites && (
                            <button className="btn btn-primary btn-sm" onClick={onOpenFavorites}>
                                <i className="fas fa-star"></i> DS Yêu thích
                            </button>
                        )}
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openUploadModal({ tab: 'manage' })}
                        >
                            <i className="fas fa-cloud"></i> DS Từ riêng
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
