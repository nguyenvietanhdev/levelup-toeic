import { useState, useEffect, useCallback } from 'react';
import { Quest } from '@components/quest/quest.js';
import { calculateProgress } from '@components/achievements/achievementsProgress.js';
import { authHeaders } from '@/auth/token.js';
import { CheckinAPI } from '@api/checkin.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { shouldExportStats } from '@components/statistics/statsExportSignal.js';

export function countUnclaimedQuests() {
    let n = 0;
    for (const type of ['daily', 'weekly', 'monthly', 'special']) {
        const list = Quest.getQuests?.(type) || [];
        for (const q of list) if (q.completed && !q.claimedAt && !q.claimed) n++;
    }
    return n;
}

export function countClaimableAchievements() {
    const all = window.GameState?.state?.achievements || [];
    let n = 0;
    for (const ach of all) {
        if (ach.unlocked) continue;
        const { current } = calculateProgress(ach);
        if (current >= (ach.conditionValue || 1)) n++;
    }
    return n;
}

/**
 * @param {boolean} isLoggedIn
 * @param {{ listenEvents?: boolean }} opts
 *   listenEvents=true → re-compute on PRACTICE_COMPLETED / STATE_CHANGED / etc.
 *   Used by TopNav so the hamburger badge stays current without opening the menu.
 */
export function useMenuBadges(isLoggedIn, { listenEvents = false } = {}) {
    const [badges, setBadges] = useState({ quest: 0, achievement: 0, online: 0, shopDiscount: 0, statsExport: 0 });

    const refresh = useCallback(async (signal) => {
        const unclaimedQuests = countUnclaimedQuests();
        setBadges(b => ({
            ...b,
            quest: unclaimedQuests,
            achievement: countClaimableAchievements(),
            statsExport: shouldExportStats() ? 1 : 0,
        }));

        if (!isLoggedIn) return;

        CheckinAPI.get().then(res => {
            if (signal?.aborted || !res.success) return;
            const { currentDay, claimedDays } = res.data || {};
            const due = currentDay > 0 && !(claimedDays || []).includes(currentDay);
            if (due) setBadges(b => ({ ...b, quest: b.quest + 1 }));
        }).catch(() => {});

        fetch('/api/leaderboard/online-count', { headers: authHeaders(), signal })
            .then(r => r.json())
            .then(res => { if (res?.success) setBadges(b => ({ ...b, online: res.count || 0 })); })
            .catch(() => {});

        fetch('/api/shop/items', { headers: authHeaders(), signal })
            .then(r => r.json())
            .then(res => {
                const items = res?.items || res?.data || [];
                setBadges(b => ({ ...b, shopDiscount: items.filter(it => (it.discountPercent || 0) > 0).length }));
            })
            .catch(() => {});
    }, [isLoggedIn]);

    // Initial fetch + optional event subscriptions (for TopNav hamburger badge)
    useEffect(() => {
        const ctrl = new AbortController();
        refresh(ctrl.signal);

        if (!listenEvents) return () => ctrl.abort();

        const events = [
            GameEvents.PRACTICE_COMPLETED,
            GameEvents.STATE_CHANGED,
            GameEvents.USER_LEVEL_UP,
            GameEvents.USER_LOGIN,
            GameEvents.STREAK_UPDATED,
            GameEvents.QUEST_UPDATED,
            GameEvents.ACHIEVEMENT_UNLOCKED,
        ];
        const unsubs = events.map(ev => EventBus.on(ev, () => refresh()));
        return () => { ctrl.abort(); unsubs.forEach(fn => fn()); };
    }, [refresh, listenEvents]);

    return { badges, refresh };
}
