import { useState, useEffect, useCallback } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { API } from '@api/http.js';
import { SeasonAPI } from '@api/season.js';
import { GameState } from '@game/state.js';
import { Notification } from '@ui/Toaster.jsx';
import { Utils } from '@lib/utils.js';
import { bgKeyForUser, bgStyle } from '@game/backgrounds.js';
import { useCosmetics } from '@game/cosmeticsStore.js';
import { frameStyle, frameOverlayUrl } from '@game/frames.js';
import { resolveAvatarSrc } from '@game/avatars.js';

export default function ProfileScreen({ active }) {
    const { showScreen, user, resources, streak, syncFromState } = useGame();
    const { isLoggedIn, setAuthModal } = useAuth();
    const [editing, setEditing] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [stats, setStats] = useState(null);
    const [achievements, setAchievements] = useState([]);
    const [showAllAchievements, setShowAllAchievements] = useState(false);
    const [seasons, setSeasons] = useState([]); // hành trình các mùa đã kết thúc

    useEffect(() => {
        // API không có .get() ở cấp gốc — chỉ có các nhóm (auth/user/shop/...).
        // Gọi API.get() ở đây từng ném TypeError làm sập cả màn Hồ sơ.
        SeasonAPI.myHistory()
            .then(res => { if (res?.success) setSeasons(res.data || []); })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (active) {
            setStats(GameState.getStatistics());
            setAchievements(GameState.state.achievements || []);
        }
    }, [active]);

    // Giới hạn đổi tên: 1 lần / 30 ngày (đồng bộ với backend). null = đang được phép đổi.
    const USERNAME_MAX = 20;
    const USERNAME_MIN = 3;
    const usernameCooldown = (() => {
        if (!user?.usernameChangedAt) return null;
        const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
        const elapsed = Date.now() - new Date(user.usernameChangedAt).getTime();
        const remain = COOLDOWN_MS - elapsed;
        if (remain <= 0) return null;
        return {
            daysLeft: Math.ceil(remain / (24 * 60 * 60 * 1000)),
            nextDate: new Date(new Date(user.usernameChangedAt).getTime() + COOLDOWN_MS),
        };
    })();

    async function handleSaveUsername() {
        const name = newUsername.trim();
        if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
            Notification.error(`Tên phải từ ${USERNAME_MIN} đến ${USERNAME_MAX} ký tự`);
            return;
        }
        // Nghiêm cấm tên mạo danh admin/quản trị (đồng bộ backend).
        const reserved = name.toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
            .replace(/[^a-z0-9]/g, '');
        if (/admin|administrator|quantri|quanly|moderator/.test(reserved)) {
            Notification.error('Tên không được chứa từ liên quan đến admin/quản trị');
            return;
        }
        if (name === user?.username) { setEditing(false); return; }
        const res = await API.auth.updateProfile({ username: name });
        if (res.success) {
            Notification.success('Cập nhật tên thành công!');
            setEditing(false);
            syncFromState();
        } else {
            Notification.error(res.error || 'Cập nhật thất bại');
        }
    }

    const handleCopyId = useCallback(() => {
        const id = user?.id || user?._id || '';
        if (!id) return;
        navigator.clipboard?.writeText(id).then(() => {
            Notification.success('Đã sao chép ID!');
        });
    }, [user]);

    const level = user?.level || 1;
    const xp = user?.xp || 0;
    const totalXp = user?.totalXp ?? xp;
    const neededXp = Utils.getXpForLevel(level) || 100;
    const xpPercent = neededXp > 0 ? Math.min(100, Math.round((xp / neededXp) * 100)) : 100;
    const levelTitle = Utils.getLevelTitle(level);
    const userId = user?.id || user?._id || '—';

    const vip = GameState.state?.vip;
    const vipActive = !!(vip?.active && vip.expiresAt && Date.now() < vip.expiresAt);
    const boosts = GameState.state?.boosts || {};
    const boostOn = (bx) => !!(bx?.active && bx.expiresAt && new Date(bx.expiresAt).getTime() > Date.now());
    const xpBoostOn = boostOn(boosts.xp);
    const coinsBoostOn = boostOn(boosts.coins);
    useCosmetics(); // vẽ lại khi ảnh nền/khung từ catalog nạp xong
    const bgKey = bgKeyForUser({ isVip: vipActive, background: GameState.state?.equipped?.background });
    const headerStyle = bgStyle(bgKey);
    const avatarFrameStyle = frameStyle(GameState.state?.equipped?.frame);
    const avatarFrameImg = frameOverlayUrl(GameState.state?.equipped?.frame);
    const avatarSrc = resolveAvatarSrc(GameState.state?.equippedImages?.avatar, user?.avatar);

    const unlockedCount = achievements.filter(a => a.unlocked).length;

    if (!isLoggedIn) {
        return (
            <div id="profile-screen" className={`screen ${active ? 'active' : ''}`}>
                <div className="screen-header">
                    <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <h2><i className="fas fa-user"></i> Hồ sơ</h2>
                </div>
                <div id="profile-content" className="profile-content">
                    <div className="not-logged-in">
                        <i className="fas fa-user-circle fa-5x"></i>
                        <p>Đăng nhập để xem hồ sơ của bạn</p>
                        <button className="btn btn-primary" onClick={() => setAuthModal('login')}>Đăng nhập</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div id="profile-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-user"></i> Hồ sơ</h2>
                <button
                    className="profile-leaderboard-btn"
                    style={{ marginLeft: 'auto' }}
                    title="Xem bảng xếp hạng"
                    onClick={() => showScreen('leaderboard-screen')}
                >
                    <i className="fas fa-trophy"></i> Bảng xếp hạng
                </button>
                <button className="icon-btn" title="Làm mới" onClick={() => { setStats(GameState.getStatistics()); setAchievements(GameState.state.achievements || []); syncFromState(); }}>
                    <i className="fas fa-rotate-right"></i>
                </button>
            </div>
            <div id="profile-content" className="profile-content">

                <div
                    className={`profile-header${bgKey ? ' profile-header--custom-bg' : ''}${vipActive ? ' profile-header--vip' : ''}`}
                    style={headerStyle || undefined}
                >
                    <div
                        className="profile-avatar"
                        title="Đổi ảnh đại diện trong Túi đồ"
                        style={avatarFrameStyle || undefined}
                    >
                        {avatarSrc
                            ? <img src={avatarSrc} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            : (user?.avatar || 'P')
                        }
                        {avatarFrameImg && <span className="frame-overlay" style={{ backgroundImage: `url("${avatarFrameImg}")` }} aria-hidden="true" />}
                    </div>

                    <div className="profile-details">
                        {editing ? (
                            <div className="edit-username" style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 140, position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <input value={newUsername} onChange={e => setNewUsername(e.target.value.slice(0, USERNAME_MAX))}
                                        maxLength={USERNAME_MAX} placeholder="Tên mới..."
                                        style={{ flex: 1, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, padding: '4px 44px 4px 10px', color: '#fff', outline: 'none', width: '100%' }} />
                                    <span style={{ position: 'absolute', right: 8, fontSize: '0.7em', color: newUsername.trim().length < USERNAME_MIN ? '#fecaca' : 'rgba(255,255,255,0.7)', pointerEvents: 'none' }}>
                                        {newUsername.length}/{USERNAME_MAX}
                                    </span>
                                </div>
                                <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', padding: '4px 12px' }} onClick={handleSaveUsername}>Lưu</button>
                                <button className="btn btn-sm" style={{ background: 'rgba(0,0,0,0.2)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', padding: '4px 12px' }} onClick={() => setEditing(false)}>Hủy</button>
                            </div>
                        ) : (
                            <div style={{ fontWeight: 700, fontSize: '1.15em', color: '#fff', marginBottom: 4 }}>
                                {user?.username || 'Player'}
                            </div>
                        )}

                        <div className="profile-info-row">
                            <i className="fas fa-envelope"></i>
                            <span>{user?.email || '—'}</span>
                        </div>

                        <div className="profile-info-row">
                            <i className="fas fa-fingerprint"></i>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.8em' }}>{userId}</span>
                            <button className="btn-copy-id" onClick={handleCopyId} title="Sao chép ID">
                                <i className="fas fa-copy"></i>
                            </button>
                        </div>

                        <div className="profile-info-row">
                            <i className="fas fa-star" style={{ color: '#fbbf24' }}></i>
                            <span style={{ fontWeight: 600 }}>Level {level}</span>
                            <span style={{ fontSize: '0.8em', background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '2px 10px', borderRadius: 10, fontWeight: 600 }}>
                                {levelTitle.full}
                            </span>
                            <span style={{ fontSize: '0.8em', background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '2px 10px', borderRadius: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Tổng XP đã tích lũy">
                                <i className="fas fa-bolt" style={{ color: '#fde047' }}></i>
                                {totalXp.toLocaleString('vi-VN')} XP
                            </span>
                            {xpBoostOn && (
                                <span className="profile-boost-badge" title="Đang nhân đôi XP">
                                    <i className="fas fa-bolt"></i> x2 XP
                                </span>
                            )}
                            {coinsBoostOn && (
                                <span className="profile-boost-badge coins" title="Đang nhân đôi Coins">
                                    <i className="fas fa-coins"></i> x2 Coins
                                </span>
                            )}
                            {user?.role === 'admin' && (
                                <span style={{ fontSize: '0.75em', background: '#ef4444', color: '#fff', padding: '1px 8px', borderRadius: 10, fontWeight: 600 }}>Admin</span>
                            )}
                            {!editing && (
                                usernameCooldown ? (
                                    <button className="btn-copy-id" disabled
                                        title={`Có thể đổi tên lại sau ${usernameCooldown.daysLeft} ngày (ngày ${usernameCooldown.nextDate.toLocaleDateString('vi-VN')})`}
                                        style={{ marginLeft: 'auto', opacity: 0.5, cursor: 'not-allowed' }}>
                                        <i className="fas fa-lock"></i> Đổi sau {usernameCooldown.daysLeft} ngày
                                    </button>
                                ) : (
                                    <button className="btn-copy-id" onClick={() => { setEditing(true); setNewUsername(user?.username || ''); }}
                                        title="Đổi tên (mỗi 30 ngày 1 lần)" style={{ marginLeft: 'auto' }}>
                                        <i className="fas fa-edit"></i> Đổi tên
                                    </button>
                                )
                            )}
                        </div>

                        <div style={{ marginTop: 6 }}>
                            <div className="xp-bar">
                                <div className="xp-progress" style={{ width: `${xpPercent}%` }}></div>
                            </div>
                            <div className="xp-text" style={{ marginTop: 4 }}>{xp.toLocaleString()} / {neededXp.toLocaleString()} XP</div>
                        </div>
                    </div>
                </div>

                <section className="profile-section">
                    <h3><i className="fas fa-wallet"></i> Tài nguyên</h3>
                    <div className="resources-grid">
                        <div className="resource-card">
                            <div className="resource-icon energy">⚡</div>
                            <div className="resource-value">{resources.energy}</div>
                            <div className="resource-label">Năng lượng</div>
                            <small className="resource-max">Max: {resources.maxEnergy}</small>
                        </div>
                        <div className="resource-card">
                            <div className="resource-icon coins">🪙</div>
                            <div className="resource-value">{resources.coins?.toLocaleString()}</div>
                            <div className="resource-label">Coins</div>
                        </div>
                        <div className="resource-card">
                            <div className="resource-icon gems">💎</div>
                            <div className="resource-value">{resources.gems?.toLocaleString()}</div>
                            <div className="resource-label">Gems</div>
                        </div>
                        <div className="resource-card">
                            <div className="resource-icon hints">💡</div>
                            <div className="resource-value">{resources.hints || 0}</div>
                            <div className="resource-label">Gợi ý</div>
                        </div>
                    </div>
                </section>

                {stats && (
                    <section className="profile-section">
                        <h3><i className="fas fa-chart-bar"></i> Thống kê</h3>
                        <div className="profile-stats">
                            <div className="profile-stat-card">
                                <div className="stat-icon">📚</div>
                                <div className="profile-stat-value">{stats.wordsLearned}</div>
                                <div className="profile-stat-label">Từ đã học</div>
                            </div>
                            <div className="profile-stat-card">
                                <div className="stat-icon">🎮</div>
                                <div className="profile-stat-value">{stats.totalGamesPlayed}</div>
                                <div className="profile-stat-label">Lượt chơi</div>
                            </div>
                            <div className="profile-stat-card">
                                <div className="stat-icon">🎯</div>
                                <div className="profile-stat-value">{stats.accuracy}%</div>
                                <div className="profile-stat-label">Độ chính xác</div>
                            </div>
                            <div className="profile-stat-card">
                                <div className="stat-icon">⭐</div>
                                <div className="profile-stat-value">{stats.perfectRounds}</div>
                                <div className="profile-stat-label">Vòng hoàn hảo</div>
                            </div>
                            <div className="profile-stat-card">
                                <div className="stat-icon">🏆</div>
                                <div className="profile-stat-value">{stats.highestScore?.toLocaleString()}</div>
                                <div className="profile-stat-label">Điểm cao nhất</div>
                            </div>
                            <div className="profile-stat-card">
                                <div className="stat-icon">🔥</div>
                                <div className="profile-stat-value">{streak.current}</div>
                                <div className="profile-stat-label">Streak hiện tại</div>
                                <small>Dài nhất: {streak.longest}</small>
                            </div>
                        </div>
                    </section>
                )}

                {seasons.length > 0 && (
                    <section className="profile-section">
                        <h3><i className="fas fa-flag-checkered"></i> Hành trình các mùa</h3>
                        <div className="season-history">
                            {seasons.map(s => (
                                <div key={s.seasonNumber} className="season-row">
                                    <div className="season-badge">
                                        <i className="fas fa-medal"></i>
                                        <span>Mùa {s.seasonNumber}</span>
                                    </div>
                                    <div className="season-figures">
                                        <span title="Cấp độ cuối mùa"><b>Lv.{s.level}</b></span>
                                        {s.rank ? <span title="Hạng theo tổng XP">#{s.rank}</span> : null}
                                        <span title="Tổng XP">{(s.totalXp || 0).toLocaleString()} XP</span>
                                        <span title="Số từ đã học">{s.wordsLearned} từ</span>
                                        <span title="Độ chính xác">{s.accuracy}%</span>
                                        <span title="Thành tích mở khoá">🏆 {s.achievementsUnlocked}</span>
                                    </div>
                                    <small className="season-date">
                                        Kết thúc {new Date(s.endedAt).toLocaleDateString('vi-VN')}
                                    </small>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {achievements.length > 0 && (
                    <section className="profile-section">
                        <h3>
                            <i className="fas fa-medal"></i> Thành tích
                            <span className="achievement-count"> ({unlockedCount}/{achievements.length})</span>
                        </h3>
                        {!showAllAchievements ? (
                            <>
                                <div className="achievements-preview">
                                    {achievements.slice(0, 6).map((a, i) => (
                                        <div key={i} className={`achievement-badge ${a.unlocked ? 'unlocked' : 'locked'}`}>
                                            <div className="achievement-icon">{a.icon}</div>
                                            <div className="achievement-name">{a.name}</div>
                                        </div>
                                    ))}
                                </div>
                                <button className="btn btn-secondary btn-block" onClick={() => setShowAllAchievements(true)}>
                                    Xem tất cả thành tích
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="all-achievements">
                                    {achievements.map((a, i) => (
                                        <div key={i} className={`achievement-item ${a.unlocked ? 'unlocked' : 'locked'}`}>
                                            <div className="achievement-icon-large">{a.icon}</div>
                                            <div className="achievement-details">
                                                <h4>{a.name}</h4>
                                                <p>{a.description}</p>
                                                {a.unlocked ? (
                                                    <div className="achievement-unlocked-date">
                                                        <i className="fas fa-check-circle"></i>
                                                        Mở khóa: {new Date(a.unlockedAt).toLocaleDateString('vi-VN')}
                                                    </div>
                                                ) : (
                                                    <div className="achievement-locked-message">
                                                        <i className="fas fa-lock"></i> Chưa mở khóa
                                                    </div>
                                                )}
                                                {(a.reward?.coins || a.reward?.xp || a.reward?.gems) && (
                                                    <div className="achievement-rewards">
                                                        {a.reward.coins ? <span><i className="fas fa-coins"></i> {a.reward.coins}</span> : null}
                                                        {a.reward.xp ? <span><i className="fas fa-star"></i> {a.reward.xp} XP</span> : null}
                                                        {a.reward.gems ? <span><i className="fas fa-gem"></i> {a.reward.gems}</span> : null}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button className="btn btn-secondary btn-block" onClick={() => setShowAllAchievements(false)}>
                                    Thu gọn
                                </button>
                            </>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
}
