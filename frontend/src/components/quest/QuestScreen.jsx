import { useState, useEffect, useCallback, useRef } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { Notification } from '@ui/Toaster.jsx';
import { Quest } from '@components/quest/quest.js';
import { QuestsAPI } from '@api/quests.js';
import { Utils } from '@lib/utils.js';
import { Config } from '@game/config.js';
import { GameState } from '@game/state.js';
import CheckinModal from '@components/checkin/CheckinModal.jsx';
import { CheckinAPI } from '@api/checkin.js';
import { showRewardPopup } from '@ui/RewardPopup.jsx';
import ItemThumb from '@ui/ItemThumb.jsx';
import { InventoryAPI } from '@api/inventory.js';

// Nhãn hiển thị cho vật phẩm thưởng (itemId → emoji + tên). Thêm item mới thì
// bổ sung 1 dòng ở đây (khớp item_definitions.itemId).
const ITEM_REWARD_META = {
    'spin-ticket': { icon: '🎟️', label: 'Vé quay' },
    'hint': { icon: '💡', label: 'Gợi ý' },
    'shield': { icon: '🛡️', label: 'Khiên' },
    'time-freeze': { icon: '⏸️', label: 'Dừng giờ' },
    'bg-vip-week': { icon: '👑', label: 'Nền VIP' },
};

const TABS = [
    { type: 'daily',   label: 'Hàng ngày',  icon: 'fa-sun' },
    { type: 'weekly',  label: 'Hàng tuần',  icon: 'fa-calendar-week' },
    { type: 'monthly', label: 'Hàng tháng', icon: 'fa-calendar-alt' },
    { type: 'special', label: 'Đặc biệt',   icon: 'fa-star' },
];

function formatCountdown(ms) {
    if (!ms || ms <= 0) return '--:--:--';
    const s = Math.floor(ms / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
}

function getTimeUntilReset(type) {
    if (Quest?.getNextReset) {
        const nextReset = Quest.getNextReset(type);
        if (nextReset) return Math.max(0, new Date(nextReset) - Date.now());
    }
    const now = new Date();
    if (type === 'daily') {
        const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
        return midnight - now;
    }
    if (type === 'weekly') {
        // Next Monday midnight
        const next = new Date(now);
        const day = now.getDay(); // 0=Sun
        const daysUntilMonday = day === 0 ? 1 : (8 - day) % 7 || 7;
        next.setDate(now.getDate() + daysUntilMonday);
        next.setHours(0, 0, 0, 0);
        return next - now;
    }
    if (type === 'monthly') {
        // Same day of month next month
        const next = new Date(now);
        const dayOfMonth = now.getDate();
        next.setMonth(now.getMonth() + 1);
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, maxDay));
        next.setHours(0, 0, 0, 0);
        return next - now;
    }
    return 0;
}

export default function QuestScreen({ active }) {
    const { showScreen, syncFromState } = useGame();
    const [activeTab, setActiveTab] = useState('daily');
    const [quests, setQuests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [timer, setTimer] = useState('--:--:--');
    const [claimedCodes, setClaimedCodes] = useState(new Set());
    const [checkinOpen, setCheckinOpen] = useState(false);
    const [checkinDue, setCheckinDue] = useState(false);
    const [claimingAll, setClaimingAll] = useState(false);
    const [defMap, setDefMap] = useState({}); // itemId → catalog def (ảnh vật phẩm thưởng)

    useEffect(() => {
        InventoryAPI.items().then(res => {
            const map = {};
            (res.data || []).forEach(d => { map[d.itemId] = d; });
            setDefMap(map);
        });
    }, []);

    // Gắn ảnh/tên/icon từ catalog vào danh sách vật phẩm thưởng (dùng cho popup).
    const enrichItems = (arr) => (arr || []).map(it => {
        const d = defMap[it.itemId];
        return d ? { ...it, name: d.name, icon: d.icon, image: d.image } : it;
    });

    const readFromQuestModule = useCallback((type) => {
        const data = Quest?.getQuests?.(type);
        if (data?.length > 0) { setQuests([...data]); return true; }
        const gsQuests = window.GameState?.state?.quests?.[type];
        if (gsQuests?.length > 0) { setQuests([...gsQuests]); return true; }
        return false;
    }, []);

    const loadQuests = useCallback(async (type) => {
        if (readFromQuestModule(type)) {
            setLoading(false);
            return;
        }

        setLoading(true);
        if (Quest?.loadType) {
            try {
                await Quest.loadType(type);
                readFromQuestModule(type);
                setLoading(false);
                return;
            } catch {}
        }

        const res = await QuestsAPI.list(type);
        setQuests(res.success ? (res.data?.quests || []) : []);
        setLoading(false);
    }, [readFromQuestModule]);

    useEffect(() => {
        if (active) loadQuests(activeTab);
    }, [active, activeTab, loadQuests]);

    useEffect(() => {
        if (!active) return;
        CheckinAPI.get().then(res => {
            if (!res.success) return;
            const { currentDay, claimedDays } = res.data || {};
            setCheckinDue(currentDay > 0 && !(claimedDays || []).includes(currentDay));
        });
    }, [active, checkinOpen]);

    useEffect(() => {
        const unsub = EventBus.on(GameEvents.QUEST_UPDATED, ({ type }) => {
            if (!type || type === activeTab) readFromQuestModule(activeTab);
        });
        return unsub;
    }, [activeTab, readFromQuestModule]);

    useEffect(() => {
        if (!active) return;
        const tick = () => setTimer(formatCountdown(getTimeUntilReset(activeTab)));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [active, activeTab]);

    const claimingRef = useRef(new Set());
    async function handleClaim(type, quest) {
        const code = quest.code || quest.id;
        // Chặn double-click đồng bộ (state React chưa commit kịp giữa 2 click).
        if (!code || claimedCodes.has(code) || claimingRef.current.has(code)) return;
        claimingRef.current.add(code);

        const items = enrichItems(quest.rewardItems || quest.reward?.items);
        const reward = {
            coins: quest.rewardCoins || quest.reward?.coins || 0,
            xp:    quest.rewardXp    || quest.reward?.xp    || 0,
            gems:  quest.rewardGems  || quest.reward?.gems  || 0,
        };

        // OPTIMISTIC: phản hồi NGAY (nút "Đã nhận" + thưởng + âm thanh + popup),
        // không đợi 3 round-trip mạng (save → flush → claim) → hết delay.
        setClaimedCodes(prev => new Set([...prev, code]));
        GameState.creditServerRewards(reward);
        Utils.playSound(Config.sounds.quest, 0.6, { ignoreSettings: true });
        showRewardPopup({ subtitle: quest.name || quest.title, rewards: { ...reward, items } });
        syncFromState();

        // Đồng bộ server chạy nền; nếu thất bại thì HOÀN TÁC.
        let ok = false;
        try {
            if (Quest?.claimReward) ok = (await Quest.claimReward(type, code)) != null;
            else ok = !!(await QuestsAPI.claim({ type, code })).success;
        } catch { ok = false; }

        if (!ok) {
            GameState.creditServerRewards({ coins: -reward.coins, xp: -reward.xp, gems: -reward.gems });
            setClaimedCodes(prev => { const s = new Set(prev); s.delete(code); return s; });
            Notification.error('Không thể nhận thưởng, vui lòng thử lại');
        }
        claimingRef.current.delete(code);
        loadQuests(type);
        syncFromState();
    }

    // Danh sách quest đã hoàn thành nhưng chưa nhận — gom MỌI loại (ngày/tuần/
    // tháng/đặc biệt). KHÔNG bao gồm điểm danh (check-in tách riêng).
    function collectClaimableQuests() {
        const out = [];
        for (const tab of TABS) {
            const list = Quest.getQuests?.(tab.type) || [];
            for (const q of list) {
                const code = q.code || q.id;
                if (q.completed && !q.claimedAt && !q.claimed && !claimedCodes.has(code)) {
                    out.push({
                        type: tab.type,
                        code,
                        reward: {
                            coins: q.rewardCoins || q.reward?.coins || 0,
                            xp:    q.rewardXp    || q.reward?.xp    || 0,
                            gems:  q.rewardGems  || q.reward?.gems  || 0,
                            items: q.rewardItems || q.reward?.items || [],
                        },
                    });
                }
            }
        }
        return out;
    }

    async function handleClaimAll() {
        if (claimingAll) return;
        const toClaim = collectClaimableQuests();
        if (toClaim.length === 0) return;

        setClaimingAll(true);

        // GOM TỔNG thưởng + đánh dấu TẤT CẢ đã nhận → cập nhật giao diện CHỈ 1 LẦN
        // (thay vì credit + render mỗi quest → hết delay nhảy số nhiều lần).
        const total = toClaim.reduce((s, q) => ({
            coins: s.coins + q.reward.coins,
            xp:    s.xp    + q.reward.xp,
            gems:  s.gems  + q.reward.gems,
        }), { coins: 0, xp: 0, gems: 0 });
        // Gom vật phẩm theo itemId (cộng dồn số lượng) để hiện 1 popup tổng.
        const itemMap = new Map();
        toClaim.forEach(q => (q.reward.items || []).forEach(it => {
            const prev = itemMap.get(it.itemId) || { ...it, quantity: 0 };
            itemMap.set(it.itemId, { ...prev, quantity: prev.quantity + (it.quantity || 1) });
        }));
        const totalItems = enrichItems([...itemMap.values()]);
        const codes = toClaim.map(q => q.code);

        setClaimedCodes(prev => new Set([...prev, ...codes]));
        GameState.creditServerRewards(total);
        Utils.playSound(Config.sounds.quest, 0.6, { ignoreSettings: true });
        showRewardPopup({ subtitle: `Đã nhận ${toClaim.length} nhiệm vụ`, rewards: { ...total, items: totalItems } });
        syncFromState();

        // Đồng bộ server chạy NỀN (tuần tự để tránh đụng save/flush). Quest nào
        // lỗi → hoàn tác phần thưởng + bỏ đánh dấu của riêng nó.
        const failed = [];
        for (const { type, code, reward } of toClaim) {
            let ok = false;
            try {
                if (Quest?.claimReward) ok = (await Quest.claimReward(type, code)) != null;
                else ok = !!(await QuestsAPI.claim({ type, code })).success;
            } catch { ok = false; }
            if (!ok) failed.push({ code, reward });
        }

        if (failed.length > 0) {
            const back = failed.reduce((s, f) => ({
                coins: s.coins - f.reward.coins,
                xp:    s.xp    - f.reward.xp,
                gems:  s.gems  - f.reward.gems,
            }), { coins: 0, xp: 0, gems: 0 });
            GameState.creditServerRewards(back);
            setClaimedCodes(prev => { const s = new Set(prev); failed.forEach(f => s.delete(f.code)); return s; });
            Notification.error(`${failed.length} nhiệm vụ nhận thất bại, đã hoàn lại`);
        }

        loadQuests(activeTab);
        syncFromState();
        setClaimingAll(false);
    }

    const claimableCount = collectClaimableQuests().length;

    return (
        <div id="quest-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-tasks"></i> Nhiệm vụ</h2>
                {claimableCount > 0 && (
                    <button
                        className="btn btn-primary btn-sm"
                        style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
                        disabled={claimingAll}
                        onClick={handleClaimAll}
                        title="Nhận thưởng tất cả nhiệm vụ đã hoàn thành (không gồm điểm danh)"
                    >
                        <i className={`fas ${claimingAll ? 'fa-spinner fa-spin' : 'fa-gift'}`}></i> Nhận tất cả ({claimableCount})
                    </button>
                )}
                <button
                    className="checkin-trigger-btn"
                    style={{ marginLeft: claimableCount > 0 ? 8 : 'auto' }}
                    onClick={() => setCheckinOpen(true)}
                    title="Điểm danh hằng tuần"
                >
                    <i className="fas fa-calendar-check"></i> Điểm danh
                    {checkinDue && <span className="checkin-trigger-dot" />}
                </button>
                <button className="icon-btn" title="Làm mới" onClick={() => loadQuests(activeTab)}>
                    <i className="fas fa-rotate-right"></i>
                </button>
            </div>
            <div className="quest-screen-body">
                <div className="quest-tabs">
                    {TABS.map(tab => {
                        // Đếm quest đã hoàn thành nhưng chưa claim cho từng loại
                        // (Quest.init đã nạp cả 4 type vào cache nên đọc nhanh).
                        const list = Quest.getQuests?.(tab.type) || [];
                        const pending = list.filter(q => q.completed && !q.claimedAt && !q.claimed).length;
                        return (
                            <button
                                key={tab.type}
                                className={`quest-tab ${activeTab === tab.type ? 'active' : ''}`}
                                data-quest-type={tab.type}
                                onClick={() => { setActiveTab(tab.type); setClaimedCodes(new Set()); }}
                            >
                                <i className={`fas ${tab.icon}`}></i> {tab.label}
                                {pending > 0 && <span className="tab-badge">{pending > 99 ? '99+' : pending}</span>}
                            </button>
                        );
                    })}
                </div>
                <div className="quest-reset-info">
                    <span id="quest-screen-timer-label">Làm mới sau:</span>
                    <span id="quest-screen-timer" className="quest-timer-value">{timer}</span>
                </div>
                <div id="quest-screen-list" className="quests-container">
                    {loading ? (
                        <div className="quest-loading"><i className="fas fa-spinner fa-spin"></i> Đang tải...</div>
                    ) : quests.length === 0 ? (
                        <div className="quest-empty">Không có nhiệm vụ nào</div>
                    ) : [...quests].sort((a, b) => {
                        const claimable = q => (q.completed && !q.claimedAt && !q.claimed) ? 0 : q.completed ? 1 : 2;
                        return claimable(a) - claimable(b);
                    }).map((quest, i) => {
                        const progress = quest.progress ?? quest.current ?? 0;
                        const target = quest.target || 1;
                        const pct = Math.min(100, Math.round((progress / target) * 100));
                        const isClaimed = !!(quest.claimedAt || quest.claimed) || claimedCodes.has(quest.code || quest.id);
                        const name = (quest.name || '').replace('{target}', target);
                        return (
                            <div key={quest.code || quest.id || i} className={`quest-card${quest.completed ? ' completed' : ''}${isClaimed ? ' claimed' : ''}`}>
                                <div className="quest-header">
                                    <div className="quest-title">
                                        <div className="quest-icon">{quest.icon || '🎯'}</div>
                                        <span>{name}</span>
                                    </div>
                                    <div className="quest-reward">
                                        {quest.rewardCoins > 0 && <span><i className="fas fa-coins"></i> {quest.rewardCoins}</span>}
                                        {quest.rewardXp > 0 && <span><i className="fas fa-star"></i> {quest.rewardXp} XP</span>}
                                        {quest.rewardGems > 0 && <span><i className="fas fa-gem"></i> {quest.rewardGems}</span>}
                                        {!quest.rewardCoins && quest.reward?.coins > 0 && <span><i className="fas fa-coins"></i> {quest.reward.coins}</span>}
                                        {!quest.rewardXp && quest.reward?.xp > 0 && <span><i className="fas fa-star"></i> {quest.reward.xp} XP</span>}
                                        {!quest.rewardGems && quest.reward?.gems > 0 && <span><i className="fas fa-gem"></i> {quest.reward.gems}</span>}
                                        {Array.isArray(quest.rewardItems) && quest.rewardItems.map((it, k) => {
                                            const def = defMap[it.itemId] || {};
                                            const m = ITEM_REWARD_META[it.itemId] || { icon: '🎁', label: it.itemId };
                                            const iconNode = (def.icon || m.icon || '').startsWith('fa-')
                                                ? <i className={`fas ${def.icon || m.icon}`}></i>
                                                : <span>{m.icon}</span>;
                                            return (
                                                <span key={k} className="quest-reward-item">
                                                    <ItemThumb image={def.image} imgClassName="quest-reward-img">{iconNode}</ItemThumb>
                                                    {(it.quantity > 1 ? it.quantity + ' ' : '') + (def.name || m.label)}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                                {quest.description && <div className="quest-description">{quest.description}</div>}
                                <div className="quest-progress">
                                    <div className="quest-progress-bar">
                                        <div className="quest-progress-fill" style={{ width: `${pct}%` }}></div>
                                    </div>
                                    <div className="quest-progress-text">{progress} / {target}</div>
                                </div>
                                {quest.completed
                                    ? (isClaimed
                                        ? <div className="quest-claimed-badge"><i className="fas fa-check-circle"></i> Đã nhận thưởng</div>
                                        : <button className="quest-claim-btn btn btn-primary btn-sm" onClick={() => handleClaim(activeTab, quest)}>Nhận thưởng</button>)
                                    : <div className="quest-pending-badge"><i className="fas fa-hourglass-half"></i> Chưa đạt</div>
                                }
                            </div>
                        );
                    })}
                </div>
            </div>
            <CheckinModal open={checkinOpen} onClose={() => setCheckinOpen(false)} />
        </div>
    );
}
