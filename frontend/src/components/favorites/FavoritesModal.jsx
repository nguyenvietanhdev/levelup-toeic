import { useEffect } from 'react';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { useFavorites } from './useFavorites.js';

function speak(text) {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
}

export default function FavoritesModal({ open, onClose }) {
    const { isLoggedIn } = useAuth();
    const { words, loading, remove, removeAll, reload } = useFavorites(isLoggedIn);

    useEffect(() => {
        if (open) reload();
    }, [open, reload]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    async function handleClearAll() {
        if (words.length === 0) return;
        if (!window.confirm(`Xoá toàn bộ ${words.length} từ yêu thích?`)) return;
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
                    <span className="favorites-count">{words.length} từ</span>
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
                                {words.map((w, i) => {
                                    const en = w.en || w.word || '';
                                    return (
                                        <tr key={`${en}-${i}`}>
                                            <td className="favorites-en">{en}</td>
                                            <td className="favorites-vn">{w.vn || '—'}</td>
                                            <td className="favorites-syn">{w.synonyms || '—'}</td>
                                            <td className="favorites-ph">{w.phonetic ? `/${w.phonetic.replace(/^\/|\/$/g, '')}/` : '—'}</td>
                                            <td className="favorites-actions">
                                                <button
                                                    className="favorites-speak-btn"
                                                    onClick={() => speak(en)}
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
