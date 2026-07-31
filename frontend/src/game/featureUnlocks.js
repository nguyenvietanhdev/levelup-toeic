// Mốc mở khoá theo Level — nạp 1 lần, dùng chung nhiều màn.
// Server MỚI là chốt chặn thật; đây chỉ để vẽ ổ khoá cho đẹp/rõ.
import { authHeaders } from '@/auth/token.js';

let _cache = null;      // { level, unlocks: [{key,label,requiredLevel,icon,unlocked}] }
let _promise = null;

/** Nạp (memoize). force=true để nạp lại sau khi lên level. */
export function loadUnlocks(force = false) {
    if (force) { _cache = null; _promise = null; }
    if (_cache) return Promise.resolve(_cache);
    if (!_promise) {
        _promise = fetch('/api/features/unlocks', { headers: authHeaders() })
            .then(r => r.json())
            .then(j => {
                _cache = j?.success ? j.data : { level: 1, unlocks: [] };
                return _cache;
            })
            .catch(() => ({ level: 1, unlocks: [] }));
    }
    return _promise;
}

/** Dữ liệu đã nạp (đồng bộ) — null nếu chưa nạp xong. */
export function getUnlocks() { return _cache; }

/** Mốc của 1 key: { locked, requiredLevel } — chưa nạp thì coi như mở. */
export function lockInfo(key) {
    const u = _cache?.unlocks?.find(x => x.key === key);
    if (!u) return { locked: false, requiredLevel: 0 };
    return { locked: !u.unlocked, requiredLevel: u.requiredLevel };
}

/** Các mốc vừa mở khi lên từ `fromLevel` → `toLevel` (để hiện popup). */
export function unlockedBetween(fromLevel, toLevel) {
    return (_cache?.unlocks || []).filter(
        u => u.requiredLevel > fromLevel && u.requiredLevel <= toLevel,
    );
}
