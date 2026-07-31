import { useState, useEffect, useRef } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { GameState } from '@game/state.js';
import { RankingsAPI } from '@api/rankings.js';
import { bgKeyForUser, bgStyle } from '@game/backgrounds.js';
import { useCosmetics } from '@game/cosmeticsStore.js';
import { frameStyle, frameOverlayUrl } from '@game/frames.js';
import { resolveAvatarSrc } from '@game/avatars.js';
import { authHeaders } from '@/auth/token.js';

export default function LeaderboardScreen({ active }) {
    useCosmetics(); // vẽ lại khi ảnh nền cosmetic từ catalog nạp xong
    const { showScreen } = useGame();
    const [period, setPeriod] = useState('daily');
    const [board, setBoard] = useState('vocab');     // 'vocab' | 'toeic'
    const [part, setPart] = useState(1);             // Part 1..7 khi board = 'toeic'
    const [sortBy, setSortBy] = useState('totalXp'); // tiêu chí xếp hạng
    const [order, setOrder] = useState('desc');       // thứ tự tăng/giảm
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [fallbackNotice, setFallbackNotice] = useState('');
    const [selected, setSelected] = useState(null);  // entry để hiện popup chi tiết
    const [likeInfo, setLikeInfo] = useState({ liked: false, count: 0, busy: false });

    // ESC để đóng popup
    useEffect(() => {
        if (!selected) return;
        const onKey = (e) => { if (e.key === 'Escape') setSelected(null); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [selected]);

    // Lấy trạng thái like khi mở popup người chơi.
    useEffect(() => {
        if (!selected) return;
        const targetId = selected.id || selected.userId;
        if (!targetId) return;
        let alive = true;
        setLikeInfo({ liked: false, count: 0, busy: false });
        fetch(`/api/user/like/${targetId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { if (alive && res.success) setLikeInfo({ liked: !!res.liked, count: res.likeCount || 0, busy: false }); })
            .catch(() => {});
        return () => { alive = false; };
    }, [selected]);

    async function toggleLike(targetId) {
        if (!targetId || likeInfo.busy) return;
        setLikeInfo(li => ({ ...li, busy: true }));
        try {
            const res = await fetch(`/api/user/like/${targetId}`, { method: 'POST', headers: authHeaders() }).then(r => r.json());
            if (res.success) {
                setLikeInfo(li => ({
                    liked: !!res.liked,
                    count: typeof res.likeCount === 'number' ? res.likeCount : Math.max(0, li.count + (res.liked ? 1 : -1)),
                    busy: false,
                }));
            } else setLikeInfo(li => ({ ...li, busy: false }));
        } catch { setLikeInfo(li => ({ ...li, busy: false })); }
    }

    async function copyId(id) {
        if (!id) return;
        try {
            await navigator.clipboard.writeText(String(id));
            window._reactNotification?.success?.('Đã sao chép ID');
        } catch {
            window._reactNotification?.error?.('Không sao chép được');
        }
    }

    useEffect(() => {
        if (active) loadLeaderboard(period);
    }, [active, period, sortBy, order, board, part]);

    async function loadLeaderboard(p) {
        setLoading(true);
        setFallbackNotice('');

        // Bảng "Test TOEIC" — xếp theo Part, dùng endpoint riêng.
        if (board === 'toeic') {
            const r = await fetch(`/api/leaderboard/toeic/part/${part}`).then(x => x.json()).catch(() => null);
            const rows = r?.success ? (r.data || []) : [];
            setEntries(rows);
            if (rows.length === 0) setFallbackNotice(`Chưa có ai hoàn thành bài thi có Part ${part}`);
            setLoading(false);
            return;
        }

        const opts = { sortBy, order };
        const res = await RankingsAPI.byPeriod(p, opts);
        const data = res.success ? (res.data || []) : [];

        // If daily/weekly returns empty, auto-fallback to all-time
        if (data.length === 0 && p !== 'all-time') {
            const fallback = await RankingsAPI.byPeriod('all-time', opts);
            const fallbackData = fallback.success ? (fallback.data || []) : [];
            setEntries(fallbackData);
            if (fallbackData.length > 0) {
                setFallbackNotice(p === 'daily' ? 'Chưa có hoạt động hôm nay — hiển thị xếp hạng toàn thời gian' : 'Chưa có hoạt động tuần này — hiển thị xếp hạng toàn thời gian');
            }
        } else {
            setEntries(data);
        }
        setLoading(false);
    }

    const filtered = entries.filter(e => {
        if (!search) return true;
        const kw = search.trim().toLowerCase();
        if (!kw) return true;
        // Backend trả về field `id` (= userId), không có `userId`. Trước
        // đây chỉ check `e.userId` nên copy ID từ popup vào ô tìm là tịt.
        const id = String(e.id || e.userId || '').toLowerCase();
        const name = String(e.username || '').toLowerCase();
        return name.includes(kw) || id.includes(kw);
    });
    const onlineCount = entries.filter(e => e.isOnline).length;
    const totalCount = entries.length;

    // Thông tin metric theo tiêu chí đang chọn (dùng để hiện đúng giá trị ở mỗi dòng).
    const fmtDur = (s) => {
        s = s || 0; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };
    const METRICS = {
        totalXp:  { label: 'XP',            get: e => e.totalXp || 0,   fmt: v => `${v.toLocaleString()} XP` },
        streak:   { label: 'Streak',        get: e => e.streak || 0,    fmt: v => `${v} 🔥` },
        accuracy: { label: 'Tỷ lệ đúng',    get: e => e.accuracy || 0,  fmt: v => `${v}%` },
        playtime: { label: 'Thời gian học', get: e => e.studyTime || 0, fmt: v => fmtDur(v) },
    };
    // Chế độ "Test TOEIC": xếp theo Part, chỉ số hiển thị là số câu đúng + %.
    const PART_METRIC = {
        label: 'Điểm Part',
        get: e => e.partCorrect || 0,
        fmt: (v, e) => `${v}/${e?.partTotal || 0} · ${e?.partAccuracy || 0}%`,
    };
    const metric = board === 'toeic' ? PART_METRIC : (METRICS[sortBy] || METRICS.totalXp);

    // Nhận diện dòng của chính mình (backend trả `id`; giữ `userId`/username làm dự phòng).
    const isMeEntry = (e) => {
        const myId = GameState.state.user?.id || GameState.state.user?._id;
        const myName = GameState.state.user?.username;
        if (myId && (String(e.id) === String(myId) || String(e.userId) === String(myId))) return true;
        return !!(myName && e.username === myName);
    };
    // Tìm trong `entries` (không phải `filtered`) để ô tìm kiếm không làm mất dòng ghim.
    const myEntry = entries.find(isMeEntry);

    // Chỉ ghim khi dòng thật của mình ĐÃ CUỘN KHUẤT — đang nhìn thấy thì không
    // hiện bản sao ở chân trang (tránh trùng lặp như khi danh sách còn ngắn).
    const meRowRef = useRef(null);
    const [meVisible, setMeVisible] = useState(true);
    useEffect(() => {
        const el = meRowRef.current;
        if (!el) { setMeVisible(false); return; } // dòng thật bị lọc/ngoài trang → cứ ghim
        const io = new IntersectionObserver(
            ([e]) => setMeVisible(e.isIntersecting),
            { threshold: 0.6 }, // thấy >60% mới coi là "đang nhìn thấy"
        );
        io.observe(el);
        return () => io.disconnect();
    }, [filtered.length, myEntry?.id, board, part, period, sortBy, loading]);
    // Cùng kiểu với ô tìm kiếm (pill + viền box-shadow) để 3 control đồng bộ, cùng chiều cao.
    const selStyle = {
        padding: '8px 12px', border: '2px solid transparent', borderRadius: 20,
        boxShadow: '0 0 0 1.5px var(--border-color)', background: 'var(--card-bg, var(--bg-primary, #fff))',
        color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', cursor: 'pointer', outline: 'none',
    };

    return (
        <div id="leaderboard-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-trophy"></i> Bảng xếp hạng</h2>
                {!loading && totalCount > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: '0.82em', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e' }} />
                        <span><strong style={{ color: '#22c55e' }}>{onlineCount}</strong> / {totalCount} trực tuyến</span>
                    </span>
                )}
                <button id="refresh-leaderboard-btn" className="icon-btn" title="Làm mới" onClick={() => loadLeaderboard(period)}>
                    <i className="fas fa-rotate-right"></i>
                </button>
            </div>
            <div className="leaderboard-tabs">
                {[['daily', 'Hôm nay'], ['weekly', 'Tuần này'], ['all-time', 'Mọi lúc']].map(([p, label]) => (
                    <button key={p} className={`tab-btn ${period === p ? 'active' : ''}`} data-period={p} onClick={() => setPeriod(p)}>
                        {label}
                    </button>
                ))}
            </div>
            <div style={{ display: 'flex', gap: 8, margin: '0 0 var(--spacing-md)', flexWrap: 'wrap', alignItems: 'center' }}>
                <div className="search-bar" style={{ margin: 0, flex: 1, minWidth: 180, maxWidth: 'none' }}>
                    <i className="fas fa-search"></i>
                    <input
                        type="text"
                        id="leaderboard-search-input"
                        placeholder="Tìm theo tên hoặc ID người chơi..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                {/* Chọn bảng: Từ vựng TOEIC (theo XP/Streak…) hay Test TOEIC (theo Part). */}
                <select value={board} onChange={e => setBoard(e.target.value)} style={selStyle} title="Bảng xếp hạng">
                    <option value="vocab">📚 Từ vựng TOEIC</option>
                    <option value="toeic">📝 Test TOEIC</option>
                </select>
                {board === 'toeic' ? (
                    <select value={part} onChange={e => setPart(Number(e.target.value))} style={selStyle} title="Chọn Part">
                        {[1, 2, 3, 4, 5, 6, 7].map(p => (
                            <option key={p} value={p}>📄 Part {p}</option>
                        ))}
                    </select>
                ) : (
                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={selStyle} title="Xếp hạng theo">
                        <option value="totalXp">🏆 XP</option>
                        <option value="streak">🔥 Streak</option>
                        <option value="accuracy">🎯 Tỷ lệ đúng</option>
                        <option value="playtime">⏱️ Thời gian học</option>
                    </select>
                )}
                <select value={order} onChange={e => setOrder(e.target.value)} style={selStyle} title="Thứ tự">
                    <option value="desc">↓ Giảm dần</option>
                    <option value="asc">↑ Tăng dần</option>
                </select>
            </div>
            {fallbackNotice && (
                <div style={{ textAlign: 'center', padding: '8px 16px', color: 'var(--text-secondary)', fontSize: '0.85em', fontStyle: 'italic' }}>
                    <i className="fas fa-info-circle"></i> {fallbackNotice}
                </div>
            )}
            <div id="leaderboard-content" className="leaderboard-content">
                {loading ? (
                    <div className="loading-state"><i className="fas fa-spinner fa-spin"></i> Đang tải...</div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">Chưa có dữ liệu</div>
                ) : filtered.map((entry, i) => {
                    const rank = entry.rank || i + 1;
                    const isMe = isMeEntry(entry);
                    const myVip = GameState.state?.vip;
                    const myVipActive = !!(myVip?.active && myVip.expiresAt && Date.now() < myVip.expiresAt);
                    const rowVip = entry.isVip || (isMe && myVipActive);
                    const bgKey = bgKeyForUser({ isVip: rowVip, background: entry.background });
                    const rowStyle = { cursor: 'pointer', ...(bgStyle(bgKey) || {}) };
                    return (
                        <div
                            key={i}
                            ref={isMe ? meRowRef : undefined}
                            className={`leaderboard-item${isMe ? ' leaderboard-item--me' : ''}${bgKey ? ' leaderboard-item--custom-bg' : ''}${rowVip ? ' leaderboard-item--vip' : ''}`}
                            onClick={() => setSelected(entry)}
                            style={rowStyle}
                        >
                            <div className="leaderboard-rank">{rank}</div>
                            <div className="leaderboard-avatar-wrap">
                                <div className="leaderboard-avatar" style={frameStyle(entry.frame) || undefined}>
                                    {resolveAvatarSrc(entry.avatarImage, entry.avatar)
                                        ? <img src={resolveAvatarSrc(entry.avatarImage, entry.avatar)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                                        : (entry.username?.charAt(0)?.toUpperCase() || 'P')
                                    }
                                    {frameOverlayUrl(entry.frame) && <span className="frame-overlay" style={{ backgroundImage: `url("${frameOverlayUrl(entry.frame)}")` }} aria-hidden="true" />}
                                </div>
                                {entry.isOnline && <span className="online-dot online-dot--on" />}
                            </div>
                            <div className="leaderboard-info">
                                <div className="leaderboard-name">
                                    {entry.username || 'Ẩn danh'}
                                    {rowVip && <span className="leaderboard-vip-badge">👑 VIP</span>}
                                    {isMe && <span className="leaderboard-you-badge">Bạn</span>}
                                </div>
                                <div className="leaderboard-level">
                                    <i className="fas fa-star"></i> Level {entry.level || 1}
                                    <span className="leaderboard-gems" title="Số tim (đá quý)">
                                        <i className="fas fa-heart"></i> {(entry.gems || 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                            <span className="leaderboard-score">{metric.fmt(metric.get(entry), entry)}</span>
                        </div>
                    );
                })}
            </div>

            {/* Dòng của CHÍNH MÌNH — ghim đáy màn hình để khỏi phải cuộn đi tìm. */}
            {!loading && myEntry && !meVisible && (
                <div className="leaderboard-me-pinned" onClick={() => setSelected(myEntry)} title="Vị trí của bạn">
                    <div className="leaderboard-rank">{myEntry.rank || '—'}</div>
                    <div className="leaderboard-avatar-wrap">
                        <div className="leaderboard-avatar" style={frameStyle(myEntry.frame) || undefined}>
                            {resolveAvatarSrc(myEntry.avatarImage, myEntry.avatar)
                                ? <img src={resolveAvatarSrc(myEntry.avatarImage, myEntry.avatar)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                                : (myEntry.username?.charAt(0)?.toUpperCase() || 'P')}
                            {frameOverlayUrl(myEntry.frame) && <span className="frame-overlay" style={{ backgroundImage: `url("${frameOverlayUrl(myEntry.frame)}")` }} aria-hidden="true" />}
                        </div>
                    </div>
                    <div className="leaderboard-info">
                        <div className="leaderboard-name">
                            {myEntry.username}
                            <span className="leaderboard-you-badge">Bạn</span>
                        </div>
                        <div className="leaderboard-level">
                            <i className="fas fa-star"></i> Level {myEntry.level || 1}
                            <span className="leaderboard-gems" title="Số tim (đá quý)">
                                <i className="fas fa-heart"></i> {(myEntry.gems || 0).toLocaleString()}
                            </span>
                        </div>
                    </div>
                    <span className="leaderboard-score">{metric.fmt(metric.get(myEntry), myEntry)}</span>
                </div>
            )}

            {selected && (
                <div className="player-popup-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
                    <div className="player-popup">
                        <button className="player-popup-close" onClick={() => setSelected(null)} title="Đóng (Esc)">
                            <i className="fas fa-times"></i>
                        </button>
                        <div className="player-popup-avatar" style={frameStyle(selected.frame) || undefined}>
                            {resolveAvatarSrc(selected.avatarImage, selected.avatar)
                                ? <img src={resolveAvatarSrc(selected.avatarImage, selected.avatar)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                                : (selected.username?.[0]?.toUpperCase() || '?')
                            }
                            {frameOverlayUrl(selected.frame) && <span className="frame-overlay" style={{ backgroundImage: `url("${frameOverlayUrl(selected.frame)}")` }} aria-hidden="true" />}
                        </div>
                        <h3 className="player-popup-name">{selected.username || 'Ẩn danh'}</h3>
                        <div className="player-popup-id">
                            <span>ID: {String(selected.id || selected.userId || '—').slice(0, 24)}</span>
                            <button className="player-popup-copy" onClick={() => copyId(selected.id || selected.userId)} title="Sao chép ID">
                                <i className="fas fa-copy"></i>
                            </button>
                            {String(selected.id || selected.userId) !== String(GameState.state.user?.id || GameState.state.user?._id) && (
                                <button
                                    className="player-popup-copy player-popup-like"
                                    onClick={() => toggleLike(selected.id || selected.userId)}
                                    disabled={likeInfo.busy}
                                    title={likeInfo.liked ? 'Bỏ thích' : 'Thích'}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: likeInfo.liked ? '#ef4444' : undefined }}
                                >
                                    <i className="fas fa-heart"></i>
                                    <span style={{ fontSize: '0.8em', fontWeight: 700 }}>{likeInfo.count}</span>
                                </button>
                            )}
                        </div>
                        <div className="player-popup-stats">
                            <div className="player-stat">
                                <div className="player-stat-value">Level {selected.level || 1}</div>
                                <div className="player-stat-label">Cấp độ</div>
                            </div>
                            <div className="player-stat">
                                <div className="player-stat-value">{(selected.totalXp || selected.xp || selected.score || 0).toLocaleString()}</div>
                                <div className="player-stat-label">Điểm số</div>
                            </div>
                            {selected.streak != null && (
                                <div className="player-stat">
                                    <div className="player-stat-value">🔥 {selected.streak}</div>
                                    <div className="player-stat-label">Chuỗi ngày</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
