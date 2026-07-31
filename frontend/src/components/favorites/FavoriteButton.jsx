import { useEffect, useRef, useCallback } from 'react';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { useFavorites } from './useFavorites.js';

/**
 * Renders the per-word favorite star INLINE inside the practice content,
 * next to the word's phonetic (falling back to the word display) — matching
 * the original UX. The practice content is injected by vanilla JS via
 * innerHTML and is recreated every question, so the star is (re)injected
 * imperatively whenever the current word changes or the DOM mutates.
 */
export default function FavoriteButton() {
    const { isLoggedIn } = useAuth();
    const { isFavorite, toggle } = useFavorites(isLoggedIn);

    const wordRef = useRef(null);
    const isFavRef = useRef(isFavorite);
    const toggleRef = useRef(toggle);

    useEffect(() => { isFavRef.current = isFavorite; }, [isFavorite]);
    useEffect(() => { toggleRef.current = toggle; }, [toggle]);

    const removeInline = useCallback(() => {
        document.querySelectorAll('#practice-content .fav-inline-star')
            .forEach(el => el.remove());
    }, []);

    const syncInlineStar = useCallback(() => {
        const word = wordRef.current;
        const container = document.getElementById('practice-content');
        if (!word?.en || !container) { removeInline(); return; }

        // Ưu tiên gắn sao CẠNH badge loại từ (.word-type) → "bên phải của type".
        // Fallback: phonetic rồi tới word display (mode không có word-type).
        const anchor = container.querySelector('.word-type')
            || container.querySelector('.word-phonetic')
            || container.querySelector('.word-display');
        if (!anchor) return;

        let btn = container.querySelector('.fav-inline-star');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fav-inline-star';
            btn.innerHTML = '<i class="fas fa-star"></i>';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const w = wordRef.current;
                if (!w?.en) return;
                toggleRef.current(w);
                // Optimistic UI; useFavorites state update will re-sync too.
                const nowActive = !isFavRef.current(w.en);
                btn.classList.toggle('fav-star-active', nowActive);
                btn.title = nowActive ? 'Bỏ khỏi yêu thích' : 'Thêm vào yêu thích';
            });
            if (anchor.classList.contains('word-type')) {
                // Đặt sao làm anh em LIỀN SAU badge (không nhét vào trong pill).
                btn.style.marginLeft = '8px';
                btn.style.verticalAlign = 'middle';
                anchor.insertAdjacentElement('afterend', btn);
            } else {
                if (anchor.classList.contains('word-phonetic')) {
                    anchor.style.display = 'inline-flex';
                    anchor.style.alignItems = 'center';
                    anchor.style.gap = '6px';
                }
                anchor.appendChild(btn);
            }
        }

        const active = isFavRef.current(word.en);
        btn.classList.toggle('fav-star-active', active);
        btn.title = active ? 'Bỏ khỏi yêu thích' : 'Thêm vào yêu thích';
    }, [removeInline]);

    // Re-sync the active state whenever the favorites list changes.
    useEffect(() => { syncInlineStar(); }, [isFavorite, syncInlineStar]);

    useEffect(() => {
        const schedule = () => setTimeout(syncInlineStar, 60);

        const unsubRender = EventBus.on(GameEvents.QUESTION_RENDERED, ({ word }) => {
            wordRef.current = word || null;
            schedule();
        });
        const clear = () => { wordRef.current = null; removeInline(); };
        const unsubDone = EventBus.on(GameEvents.PRACTICE_COMPLETED, clear);
        const unsubExit = EventBus.on(GameEvents.PRACTICE_EXITED, clear);

        // The vanilla practice modes rebuild #practice-content via innerHTML
        // every question — re-inject the star after each mutation.
        const container = document.getElementById('practice-content');
        let observer;
        if (container) {
            observer = new MutationObserver(schedule);
            observer.observe(container, { childList: true, subtree: true });
        }

        return () => {
            unsubRender(); unsubDone(); unsubExit();
            observer?.disconnect();
            removeInline();
        };
    }, [syncInlineStar, removeInline]);

    return null;
}
