// Tab "Chung": MỤC TIÊU học tập + giao diện.
//
// Mục tiêu đứng đầu vì đó là thứ trả lời "tôi đang nhắm tới đâu" — câu hỏi định
// hướng cả việc học, và màn Phân tích lấy thẳng con số đó ra đối chiếu. Trước
// đây nó nằm lẫn giữa các cài đặt kỹ thuật trong tab Luyện tập.
// Presentational — state/handlers truyền từ SettingsScreen.
import { useState } from 'react';
import CommitNumberInput from './CommitNumberInput.jsx';

const GOAL_PRESETS = [10, 15, 30, 60, 90, 120, 180];
const TARGET_PRESETS = [0, 450, 600, 700, 800, 900];

/** Điểm TOEIC hợp lệ: bội của 5, trong 10–990. */
const clampTarget = (n) => Math.max(10, Math.min(990, Math.round(n / 5) * 5));

const COLOR_PRESETS = [
    { name: 'Hồng đỏ',    primary: '#E11D48', secondary: '#F97316' },
    { name: 'Tím hồng',   primary: '#7C3AED', secondary: '#EC4899' },
    { name: 'Xanh biển',  primary: '#0EA5E9', secondary: '#6366F1' },
    { name: 'Xanh lá',    primary: '#16A34A', secondary: '#0D9488' },
    { name: 'Cam vàng',   primary: '#F97316', secondary: '#EAB308' },
    { name: 'Tím đậm',    primary: '#9333EA', secondary: '#C026D3' },
    { name: 'Ngọc lam',   primary: '#0D9488', secondary: '#06B6D4' },
    { name: 'Đậm xanh',   primary: '#1D4ED8', secondary: '#7C3AED' },
];

export default function GeneralPanel({
    s,
    updateSetting,
    canCustomizeColor = true,
    handleTheme,
    colorPrimary,
    setColorPrimary,
    colorSecondary,
    setColorSecondary,
    handleColorPreset,
    handleCustomColor,
    savedColor,
}) {
    const goalVal = s.dailyStudyGoalMin ?? 15;
    const [goalCustom, setGoalCustom] = useState(false);
    const isGoalCustom = goalCustom || !GOAL_PRESETS.includes(goalVal);

    const targetVal = s.toeicTargetScore ?? 0;
    const [targetCustom, setTargetCustom] = useState(false);
    const isTargetCustom = targetCustom || !TARGET_PRESETS.includes(targetVal);

    return (
        <>
            <div className="settings-section">
                <h3>Mục tiêu</h3>
                <div className="setting-item">
                    <div className="setting-info">
                        <h4>Mục tiêu điểm TOEIC</h4>
                        <p>Phân tích sẽ đối chiếu điểm ước lượng của bạn với mốc này</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                            value={isTargetCustom ? 'custom' : targetVal}
                            onChange={e => {
                                if (e.target.value === 'custom') { setTargetCustom(true); }
                                else { setTargetCustom(false); updateSetting('toeicTargetScore', parseInt(e.target.value)); }
                            }}
                        >
                            <option value={0}>Chưa đặt</option>
                            <option value={450}>450 — Đầu ra phổ biến</option>
                            <option value={600}>600 — Tuyển dụng cơ bản ⭐</option>
                            <option value={700}>700 — Khá</option>
                            <option value={800}>800 — Giỏi</option>
                            <option value={900}>900 — Xuất sắc</option>
                            <option value="custom">⚙️ Tùy chỉnh…</option>
                        </select>
                        {isTargetCustom && (
                            <CommitNumberInput
                                min={10} max={990} step={5}
                                value={targetVal}
                                clamp={clampTarget}
                                onCommit={v => updateSetting('toeicTargetScore', v)}
                                style={{ width: 90 }}
                                placeholder="điểm"
                            />
                        )}
                        {isTargetCustom && <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>/ 990</span>}
                    </div>
                </div>
                <div className="setting-item">
                    <div className="setting-info">
                        <h4>Mục tiêu thời gian học mỗi ngày</h4>
                        <p>Vòng tiến độ ở trang chủ tính theo mốc này</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                            value={isGoalCustom ? 'custom' : goalVal}
                            onChange={e => {
                                if (e.target.value === 'custom') { setGoalCustom(true); }
                                else { setGoalCustom(false); updateSetting('dailyStudyGoalMin', parseInt(e.target.value)); }
                            }}
                        >
                            <option value={10}>10 phút — Nhẹ nhàng</option>
                            <option value={15}>15 phút — Khuyên dùng ⭐</option>
                            <option value={30}>30 phút — Chăm chỉ</option>
                            <option value={60}>60 phút — Cường độ cao</option>
                            <option value={90}>90 phút — Bứt phá</option>
                            <option value={120}>120 phút — Cày cuốc</option>
                            <option value={180}>180 phút — Khổ luyện</option>
                            <option value="custom">⚙️ Tùy chỉnh…</option>
                        </select>
                        {isGoalCustom && (
                            <CommitNumberInput
                                min={5} max={600}
                                value={goalVal}
                                clamp={v => Math.max(5, Math.min(600, v))}
                                onCommit={v => updateSetting('dailyStudyGoalMin', v || 15)}
                                style={{ width: 90 }}
                                placeholder="phút"
                            />
                        )}
                        {isGoalCustom && <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>phút</span>}
                    </div>
                </div>
            </div>

            <div className="settings-section">
                <h3>Giao diện</h3>
                <div className="setting-item">
                    <label>Chế độ màu sắc</label>
                    <select value={s.theme || 'dark'} onChange={e => handleTheme(e.target.value)}>
                        <option value="dark">🌙 Tối</option>
                        <option value="light">☀️ Sáng</option>
                        <option value="auto">🔄 Tự động</option>
                    </select>
                </div>
            </div>

            <div className="settings-section">
                <h3>Màu chủ đề</h3>
                {!canCustomizeColor && (
                    <div className="settings-locked-note">
                        <i className="fas fa-lock"></i> Đăng nhập để tùy chỉnh màu sắc. Khách dùng màu mặc định.
                    </div>
                )}
                <div
                    className="setting-item-block"
                    style={!canCustomizeColor ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
                >
                    <div id="color-presets-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        {COLOR_PRESETS.map((p, i) => {
                            const isActive = savedColor
                                ? savedColor.primary === p.primary && savedColor.secondary === p.secondary
                                : i === 0;
                            return (
                                <button key={i} className={`color-swatch${isActive ? ' active' : ''}`}
                                    title={p.name}
                                    style={{ background: `linear-gradient(135deg,${p.primary},${p.secondary})` }}
                                    onClick={() => handleColorPreset(p.primary, p.secondary)} />
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <label style={{ fontSize: '0.82em', color: 'var(--text-secondary)' }}>Chính</label>
                            <input type="color" value={colorPrimary} onChange={e => setColorPrimary(e.target.value)} style={{ width: 36, height: 30, border: 'none', borderRadius: 6, cursor: 'pointer' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <label style={{ fontSize: '0.82em', color: 'var(--text-secondary)' }}>Phụ</label>
                            <input type="color" value={colorSecondary} onChange={e => setColorSecondary(e.target.value)} style={{ width: 36, height: 30, border: 'none', borderRadius: 6, cursor: 'pointer' }} />
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={handleCustomColor}>Áp dụng</button>
                    </div>
                </div>
            </div>
        </>
    );
}
