import { useEffect, useMemo, useState } from 'react';
import { useEscapeToClose } from '@lib/useEscapeToClose.js';
import { wordLang, ttsLangOf } from '@lib/wordLang.js';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { useFavorites } from './useFavorites.js';

// `lang` phải truyền vào, KHÔNG cứng 'en-US': danh sách yêu thích cũng trộn
// Anh–Trung như bộ từ vựng riêng, và đọc `你好` bằng giọng Anh ra một tràng vô
// nghĩa mà không có lỗi nào.
function speak(text, lang = 'en-US') {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
}

export default function FavoritesModal({ open, onClose }) {
    useEscapeToClose(onClose, open);
    const { isLoggedIn } = useAuth();
    const { words, loading, remove, removeAll, reload } = useFavorites(isLoggedIn);
    const [query, setQuery] = useState('');
    const [langFilter, setLangFilter] = useState('all');   // all | en | zh

    useEffect(() => {
        if (open) reload();
    }, [open, reload]);

    // Mở lại thì về trạng thái sạch — giữ bộ lọc cũ khiến lần sau mở ra thấy
    // danh sách trống mà không hiểu vì sao.
    useEffect(() => {
        if (open) { setQuery(''); setLangFilter('all'); }
    }, [open]);

    // Chỉ hiện bộ lọc ngôn ngữ khi danh sách thực sự có cả hai.
    const hasMixedLang = useMemo(() => {
        let en = false, zh = false;
        for (const w of words) {
            if (wordLang({ en: w.en || w.word, lang: w.lang }) === 'zh') zh = true;
            else en = true;
            if (en && zh) return true;
        }
        return false;
    }, [words]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return words.filter(w => {
            const en = String(w.en || w.word || '');
            if (langFilter !== 'all' && wordLang({ en, lang: w.lang }) !== langFilter) return false;
            if (!q) return true;
            // Tìm cả trong nghĩa và phiên âm — nhớ nghĩa mà quên mặt chữ là
            // trường hợp thường gặp nhất khi lục lại từ đã lưu.
            return `${en} ${w.vn || ''} ${w.phonetic || ''} ${w.synonyms || ''}`
                .toLowerCase().includes(q);
        });
    }, [words, query, langFilter]);

    if (!open) return null;

    async function handleClearAll() {
        if (words.length === 0) return;
        // Nói rõ là xoá TẤT CẢ chứ không phải phần đang lọc — đang lọc còn 3 từ
        // mà bấm nút này thì mất cả 16, không hoàn tác được.
        const filtering = shown.length !== words.length;
        const msg = filtering
            ? `Xoá TOÀN BỘ ${words.length} từ yêu thích (không chỉ ${shown.length} từ đang hiện)?`
            : `Xoá toàn bộ ${words.length} từ yêu thích?`;
        if (!window.confirm(msg)) return;
        await removeAll();
    }

    return (
        <div id="modal-container" className="active">
            <div className="modal-backdrop" onClick={onClose}></div>
            <div className="modal favorites-modal">
                <div className="favorites-header">
                    <h3><i className="fas fa-star"></i> Từ vựng yêu thích</h3>
                    <button className="icon-btn favorites-close-btn" onClick={onClose}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <div className="favorites-toolbar">
                    <div className="fav-search">
                        <i className="fas fa-search"></i>
                        <input
                            type="text"
                            placeholder="Tìm trong danh sách..."
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            /* Esc ở đây xoá ô tìm TRƯỚC, không đóng luôn modal:
                               đang lọc mà Esc đóng cả bảng thì mất chỗ đang xem.
                               Chỉ khi ô đã rỗng mới để Esc nổi lên cho hook đóng. */
                            onKeyDown={e => {
                                if (e.key === 'Escape' && query) {
                                    e.stopPropagation();
                                    setQuery('');
                                }
                            }}
                        />
                        {query && (
                            <button className="fav-search-clear" onClick={() => setQuery('')} title="Xoá tìm kiếm">
                                <i className="fas fa-times"></i>
                            </button>
                        )}
                    </div>

                    {/* Bộ lọc ngôn ngữ chỉ hiện khi danh sách THỰC SỰ trộn Anh–Trung.
                        Người chỉ học tiếng Anh không cần thấy một nút không dùng tới. */}
                    {hasMixedLang && (
                        <div className="fav-langs">
                            {[
                                { id: 'all', label: 'Tất cả' },
                                { id: 'en', label: 'EN' },
                                { id: 'zh', label: '中' },
                            ].map(t => (
                                <button
                                    key={t.id}
                                    className={`fav-lang-btn${langFilter === t.id ? ' is-active' : ''}`}
                                    onClick={() => setLangFilter(t.id)}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    )}

                    <span className="favorites-count">
                        {shown.length === words.length
                            ? `${words.length} từ`
                            : `${shown.length}/${words.length} từ`}
                    </span>

                    <button
                        className="favorites-clear-btn"
                        onClick={handleClearAll}
                        disabled={words.length === 0}
                    >
                        <i className="fas fa-trash"></i> Xoá tất cả
                    </button>
                </div>

                <div className="favorites-body">
                    {loading ? (
                        <div className="favorites-empty">
                            <i className="fas fa-spinner fa-spin"></i> Đang tải...
                        </div>
                    ) : words.length === 0 ? (
                        <div className="favorites-empty">
                            <i className="fas fa-star" style={{ fontSize: 36, opacity: 0.4, display: 'block', margin: '0 auto 8px' }}></i>
                            Chưa có từ yêu thích nào
                        </div>
                    ) : shown.length === 0 ? (
                        /* Lọc ra 0 kết quả KHÁC với chưa có từ nào. Để bảng trống
                           không giải thích thì người dùng tưởng danh sách đã mất. */
                        <div className="favorites-empty">
                            <i className="fas fa-filter" style={{ fontSize: 32, opacity: 0.4, display: 'block', margin: '0 auto 8px' }}></i>
                            Không có từ nào khớp bộ lọc
                            <button
                                className="fav-reset-btn"
                                onClick={() => { setQuery(''); setLangFilter('all'); }}
                            >
                                Xoá bộ lọc
                            </button>
                        </div>
                    ) : (
                        <table className="favorites-table">
                            <thead>
                                <tr>
                                    <th>Tiếng Anh</th>
                                    <th>Tiếng Việt</th>
                                    <th>Đồng nghĩa</th>
                                    <th>Phiên âm</th>
                                    <th className="favorites-actions-col"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((w, i) => {
                                    const en = w.en || w.word || '';
                                    const isZh = wordLang({ en, lang: w.lang }) === 'zh';
                                    return (
                                        <tr key={`${en}-${i}`}>
                                            <td className={`favorites-en${isZh ? ' is-zh' : ''}`}>{en}</td>
                                            <td className="favorites-vn">{w.vn || '—'}</td>
                                            <td className="favorites-syn">{w.synonyms || '—'}</td>
                                            <td className="favorites-ph">{w.phonetic ? `/${w.phonetic.replace(/^\/|\/$/g, '')}/` : '—'}</td>
                                            <td className="favorites-actions">
                                                <button
                                                    className="favorites-speak-btn"
                                                    onClick={() => speak(en, ttsLangOf({ en, lang: w.lang }))}
                                                    title="Phát âm"
                                                >
                                                    <i className="fas fa-volume-up"></i>
                                                </button>
                                                <button
                                                    className="favorites-del-btn"
                                                    onClick={() => remove(en)}
                                                    title="Xoá khỏi yêu thích"
                                                >
                                                    <i className="fas fa-times"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
