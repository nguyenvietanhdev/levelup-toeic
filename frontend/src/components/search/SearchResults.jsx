import { useState, useEffect, useRef, useCallback } from 'react';
import { Utils } from '@lib/utils.js';
import { Modal } from '@ui/Modal.jsx';
import { GameLogic } from '@game/gameLogic.js';
import { TopicSelector } from '@components/vocab/topic/topicSelector.js';
import { VocabularyAPI } from '@api/vocabulary.js';
import { FavoritesAPI } from '@api/favorites.js';

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

export default function SearchResults() {
    const [results, setResults] = useState([]);
    const [query, setQuery] = useState('');
    const [visible, setVisible] = useState(false);
    const [favorites, setFavorites] = useState(new Set());
    const ref = useRef(null);

    useEffect(() => {
        const input = document.getElementById('search-input');
        if (!input) return;

        const handleInput = Utils.debounce(async (e) => {
            const q = e.target.value.trim();
            setQuery(q);
            if (!q) { setVisible(false); setResults([]); return; }

            const res = await VocabularyAPI.search(q, 20);
            if (res.success) {
                setResults(res.data || []);
                setVisible(true);
            }
        }, 300);

        input.addEventListener('input', handleInput);
        return () => input.removeEventListener('input', handleInput);
    }, []);

    useEffect(() => {
        const handleClick = (e) => {
            if (ref.current && !ref.current.contains(e.target) && e.target.id !== 'search-input') {
                setVisible(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    useEffect(() => {
        window._reactClearSearch = () => { setVisible(false); setResults([]); };
        return () => { delete window._reactClearSearch; };
    }, []);

    useEffect(() => {
        FavoritesAPI.list().then(res => {
            if (res.success && res.data) {
                setFavorites(new Set(res.data.map(w => w.en?.toLowerCase())));
            }
        });
    }, []);

    const toggleFavorite = useCallback(async (e, word) => {
        e.stopPropagation();
        const key = word.en?.toLowerCase();
        const isFav = favorites.has(key);
        setFavorites(prev => {
            const next = new Set(prev);
            isFav ? next.delete(key) : next.add(key);
            return next;
        });
        if (isFav) {
            await FavoritesAPI.remove(word.en);
        } else {
            await FavoritesAPI.add(word);
        }
    }, [favorites]);

    if (!visible || results.length === 0) {
        return <div id="search-results" className="search-results"></div>;
    }

    const highlight = (text, q) => {
        if (!q || !text) return text;
        const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    };

    const speak = (e, en) => {
        e.stopPropagation();
        if (en) GameLogic.speakWord(en, 'en-US');
    };

    const showWordDetail = (word) => {
        setVisible(false);
        const input = document.getElementById('search-input');
        if (input) input.value = '';
        window._reactClearSearch?.();

        Modal.show({
            title: word.en,
            content: `
                <div class="word-detail">
                    ${word.image ? `
                        <img src="${escapeHtml(word.image)}" class="word-detail-image" alt="${escapeHtml(word.en)}"
                             onerror="this.style.display='none'">
                    ` : ''}

                    <div class="word-detail-phonetic">${escapeHtml(word.phonetic || '')}</div>

                    <div class="word-detail-type">
                        ${word.type ? `<span class="badge">${escapeHtml(word.type)}</span>` : ''}
                        ${word.part ? `<span class="badge">${escapeHtml(word.part)}</span>` : ''}
                        ${word.source ? `<span class="badge badge-source"><i class="fas fa-folder"></i> ${escapeHtml(word.source)}</span>` : ''}
                    </div>

                    <div class="word-detail-meaning">
                        <h4>Nghĩa tiếng Việt:</h4>
                        <p>${escapeHtml(word.vn || '')}</p>
                    </div>

                    ${word.synonyms ? `
                        <div class="word-detail-synonyms">
                            <h4>Từ đồng nghĩa:</h4>
                            <p>${escapeHtml(word.synonyms)}</p>
                        </div>
                    ` : ''}

                    <button class="btn btn-primary btn-block" id="play-pronunciation-btn">
                        <i class="fas fa-volume-up"></i> Phát âm
                    </button>
                </div>
            `,
            buttons: [
                { text: 'Đóng', className: 'btn-secondary', onClick: () => Modal.close() },
            ],
        });

        setTimeout(() => {
            document.getElementById('play-pronunciation-btn')
                ?.addEventListener('click', () => GameLogic.speakWord(word.en, 'en-US'));
        }, 100);
    };

    const topicName = TopicSelector?.getCurrentTopic?.()?.name || 'Từ vựng';

    return (
        <div id="search-results" className="search-results active" ref={ref}>
            <div className="search-results-header">
                <span className="search-topic-badge">
                    <i className="fas fa-book"></i> {topicName}
                </span>
                <span className="search-count">{results.length} kết quả</span>
            </div>

            {results.map((word, i) => {
                const isFav = favorites.has(word.en?.toLowerCase());
                return (
                    <div key={i} className="search-result-item" onClick={() => showWordDetail(word)}>
                        <div className="search-result-word">
                            <span className="search-result-en" dangerouslySetInnerHTML={{ __html: highlight(word.en, query) }} />
                            {word.phonetic && <span className="search-result-phonetic">{word.phonetic}</span>}
                        </div>
                        <div className="search-result-vn" dangerouslySetInnerHTML={{ __html: highlight(word.vn, query) }} />
                        <div className="search-result-meta">
                            {word.type && <span className="search-result-type">{word.type}</span>}
                            {word.part && <span className="search-result-part">{word.part}</span>}
                            {word.source && <span className="search-result-source"><i className="fas fa-folder"></i> {word.source}</span>}
                        </div>
                        <div className="search-result-actions">
                            <button
                                className={`search-result-fav-btn${isFav ? ' active' : ''}`}
                                title={isFav ? 'Bỏ yêu thích' : 'Yêu thích'}
                                onClick={(e) => toggleFavorite(e, word)}
                            >
                                <i className={isFav ? 'fas fa-star' : 'far fa-star'}></i>
                            </button>
                            <button
                                className="search-result-speak-btn"
                                title="Phát âm"
                                onClick={(e) => speak(e, word.en)}
                            >
                                <i className="fas fa-volume-up"></i>
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
