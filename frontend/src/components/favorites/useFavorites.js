import { useState, useEffect, useCallback } from 'react';
import { GameState } from '@game/state.js';
import { FavoritesAPI } from '@api/favorites.js';

function readLocalFavorites() {
    return GameState.state?.progress?.favoriteWords || [];
}

function writeLocalFavorites(words) {
    if (!GameState.state.progress) GameState.state.progress = {};
    GameState.state.progress.favoriteWords = words;
    GameState.save?.();
}

export function useFavorites(isLoggedIn) {
    const [words, setWords] = useState(() => readLocalFavorites());
    const [loading, setLoading] = useState(false);

    const reload = useCallback(async () => {
        if (!isLoggedIn) {
            setWords(readLocalFavorites());
            return;
        }
        setLoading(true);
        const res = await FavoritesAPI.list();
        if (res.success) {
            const list = res.data || [];
            setWords(list);
            writeLocalFavorites(list);
        }
        setLoading(false);
    }, [isLoggedIn]);

    const isFavorite = useCallback((en) => {
        if (!en) return false;
        return words.some(w => (w.en || w.word) === en);
    }, [words]);

    const add = useCallback(async (word) => {
        if (!word?.en) return;
        const entry = {
            en: word.en,
            vn: word.vn || '',
            phonetic: word.phonetic || '',
            synonyms: word.synonyms || '',
            part: word.part || '',
        };
        const next = [...words.filter(w => (w.en || w.word) !== entry.en), entry];
        setWords(next);
        writeLocalFavorites(next);
        if (isLoggedIn) {
            const res = await FavoritesAPI.add(entry);
            // Bị chặn (đạt giới hạn) → hoàn lại trạng thái local + báo.
            if (res && res.success === false && res.limitReached) {
                const reverted = words.filter(w => (w.en || w.word) !== entry.en);
                setWords(reverted);
                writeLocalFavorites(reverted);
                window._reactNotification?.error?.(res.message || 'Đã đạt giới hạn từ yêu thích');
            }
        }
    }, [words, isLoggedIn]);

    const remove = useCallback(async (en) => {
        if (!en) return;
        const next = words.filter(w => (w.en || w.word) !== en);
        setWords(next);
        writeLocalFavorites(next);
        if (isLoggedIn) {
            await FavoritesAPI.remove(en);
        }
    }, [words, isLoggedIn]);

    const toggle = useCallback(async (word) => {
        if (!word?.en) return;
        if (isFavorite(word.en)) await remove(word.en);
        else await add(word);
    }, [isFavorite, add, remove]);

    const removeAll = useCallback(async () => {
        setWords([]);
        writeLocalFavorites([]);
        if (isLoggedIn) {
            await FavoritesAPI.removeAll();
        }
    }, [isLoggedIn]);

    useEffect(() => { reload(); }, [reload]);

    return { words, loading, isFavorite, add, remove, removeAll, toggle, reload };
}
