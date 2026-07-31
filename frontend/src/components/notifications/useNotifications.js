import { useState, useEffect, useCallback } from 'react';
import { NotificationsAPI } from '@api/notifications.js';

// Notif BROADCAST (userId=null trên server) dùng chung cho mọi user; khi
// user xoá ở client thì KHÔNG xoá doc server (user khác còn dùng). Thay
// vào đó lưu id vào localStorage để lần fetch sau frontend ẩn đi.
const HIDDEN_KEY = 'notif_hidden_broadcast_ids';
// Broadcast không có "read" per-user trên server → track ở localStorage:
// click vào card broadcast = đã đọc (chỉ với user này).
const SEEN_KEY = 'notif_seen_broadcast_ids';

function loadSet(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr : []);
    } catch {
        return new Set();
    }
}
function saveSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify([...set])); } catch {}
}
const loadHiddenIds = () => loadSet(HIDDEN_KEY);
const saveHiddenIds = (s) => saveSet(HIDDEN_KEY, s);
const loadSeenIds   = () => loadSet(SEEN_KEY);
const saveSeenIds   = (s) => saveSet(SEEN_KEY, s);

// Bản đồ type → tab — đồng bộ với TAB_TYPES ở backend.
const TYPE_TO_TAB = {
    system: 'system', reminder: 'system', reward: 'system',
    achievement: 'achievement', quest: 'achievement', level_up: 'achievement', test_result: 'achievement',
    violation: 'violation',
};

const EMPTY_UNREAD = () => ({ all: 0, system: 0, achievement: 0, violation: 0 });

/** Tính unread theo từng tab từ items + seenIds (broadcast). */
function computeUnreadCounts(items, seenIds) {
    const c = EMPTY_UNREAD();
    for (const n of items) {
        const id = String(n._id || n.id);
        const unread = n.isGlobal ? !seenIds.has(id) : !n.read;
        if (!unread) continue;
        c.all++;
        const t = TYPE_TO_TAB[n.type];
        if (t) c[t]++;
    }
    return c;
}

export function useNotifications(isLoggedIn) {
    const [badge, setBadge] = useState(0);
    const [items, setItems] = useState([]);
    const [tab, setTab] = useState('all');
    const [loading, setLoading] = useState(false);
    // Đếm unread theo tab — phải fetch tab='all' để có đủ items mới chuẩn;
    // trong các tab khác chỉ tính trên items hiện tại (đỡ phải gọi 4 lần).
    const [unreadByTab, setUnreadByTab] = useState(EMPTY_UNREAD);
    const [seenIds, setSeenIds] = useState(() => loadSeenIds());

    /**
     * Tải full danh sách thông báo (tab='all') để tính badge chuông CHÍNH XÁC
     * gồm cả broadcast chưa-seen. unreadCount endpoint cũ chỉ đếm notif cá
     * nhân → chuông luôn 0 dù có broadcast mới → user không biết.
     */
    const loadBadge = useCallback(async () => {
        if (!isLoggedIn) { setBadge(0); setItems([]); setUnreadByTab(EMPTY_UNREAD()); return; }
        const res = await NotificationsAPI.list('all');
        if (!res.success) { setBadge(0); return; }
        const hidden = loadHiddenIds();
        const seen = loadSeenIds();
        const visible = (res.data || []).filter(
            n => !(n.isGlobal && hidden.has(String(n._id || n.id)))
        );
        setItems(visible);
        const counts = computeUnreadCounts(visible, seen);
        setUnreadByTab(counts);
        setBadge(counts.all);
    }, [isLoggedIn]);

    const fetchItems = useCallback(async (forTab) => {
        setLoading(true);
        const res = await NotificationsAPI.list(forTab);
        if (res.success) {
            const hidden = loadHiddenIds();
            const seen = loadSeenIds();
            const visible = (res.data || []).filter(
                n => !(n.isGlobal && hidden.has(String(n._id || n.id)))
            );
            setItems(visible);
            // Nếu fetch tab='all' thì computeUnreadCounts ra đủ; tab khác
            // chỉ phản ánh subset — vẫn dùng để cập nhật ô tương ứng.
            if (!forTab || forTab === 'all') {
                setUnreadByTab(computeUnreadCounts(visible, seen));
            }
        }
        setLoading(false);
    }, []);

    /** Đánh dấu 1 notif là đã đọc — broadcast lưu localStorage, personal gọi API. */
    const markRead = useCallback(async (id) => {
        const target = items.find(n => String(n._id || n.id) === String(id));
        if (!target) return;
        const sid = String(id);
        if (target.isGlobal) {
            if (seenIds.has(sid)) return;
            const next = new Set(seenIds); next.add(sid); saveSeenIds(next); setSeenIds(next);
        } else {
            if (target.read) return;
            // Fire-and-forget; cập nhật local trước cho UI nhạy.
            fetch('/api/notifications/' + encodeURIComponent(sid) + '/read', {
                method: 'PUT',
                headers: { Authorization: 'Bearer ' + (JSON.parse(localStorage.getItem('authToken') || '{}').token || localStorage.getItem('authToken') || '') },
            }).catch(() => {});
            setItems(prev => prev.map(n => (String(n._id || n.id) === sid ? { ...n, read: true } : n)));
            setBadge(b => Math.max(0, b - 1));
        }
        // Cập nhật unreadByTab
        setUnreadByTab(prev => {
            const t = TYPE_TO_TAB[target.type];
            const next = { ...prev };
            if (next.all > 0) next.all--;
            if (t && next[t] > 0) next[t]--;
            return next;
        });
    }, [items, seenIds]);

    const changeTab = useCallback(async (nextTab) => {
        setTab(nextTab);
        await fetchItems(nextTab);
    }, [fetchItems]);

    const markAllRead = useCallback(async () => {
        await NotificationsAPI.markAllRead();
        setBadge(0);
        setItems(prev => prev.map(n => ({ ...n, read: true })));
        // Đánh dấu seen cho mọi broadcast đang trong list.
        const next = new Set(seenIds);
        items.filter(n => n.isGlobal).forEach(n => next.add(String(n._id || n.id)));
        saveSeenIds(next); setSeenIds(next);
        setUnreadByTab(EMPTY_UNREAD());
    }, [items, seenIds]);

    const deleteAll = useCallback(async () => {
        // Personal: server xoá. Broadcast: lưu id vào localStorage để ẩn.
        const broadcastIds = items
            .filter(n => n.isGlobal)
            .map(n => String(n._id || n.id));
        if (broadcastIds.length) {
            const hidden = loadHiddenIds();
            broadcastIds.forEach(id => hidden.add(id));
            saveHiddenIds(hidden);
        }
        const res = await NotificationsAPI.deleteAll(); // xoá notif cá nhân server-side
        if (res.success || broadcastIds.length) {
            setItems([]);
            setBadge(0);
        }
        return { success: true };
    }, [items]);

    const deleteOne = useCallback(async (id) => {
        const target = items.find(n => String(n._id || n.id) === String(id));
        if (!target) return { success: false };
        if (target.isGlobal) {
            // Broadcast → ẩn local, không gọi DELETE server.
            const hidden = loadHiddenIds();
            hidden.add(String(id));
            saveHiddenIds(hidden);
            setItems(prev => prev.filter(n => String(n._id || n.id) !== String(id)));
            return { success: true, localHidden: true };
        }
        const res = await NotificationsAPI.deleteOne(id);
        if (res.success) {
            setItems(prev => prev.filter(n => String(n._id || n.id) !== String(id)));
            // unread badge có thể giảm — refetch nhẹ
            if (!target.read) setBadge(b => Math.max(0, b - 1));
        }
        return res;
    }, [items]);

    useEffect(() => { loadBadge(); }, [loadBadge]);

    // Sync badge chuông = tổng unread (cả broadcast). Mọi action update
    // unreadByTab tự động chảy về badge — đỡ phải nhớ decrement thủ công.
    useEffect(() => { setBadge(unreadByTab.all || 0); }, [unreadByTab.all]);

    return {
        badge, items, tab, loading,
        unreadByTab, seenIds,
        loadBadge, fetchItems, changeTab,
        markAllRead, deleteAll, deleteOne, markRead,
        setBadge,
    };
}
