// Static "About" panel — no props. Content moved verbatim from SettingsScreen.
const ABOUT_ROWS = [
    { icon: 'fa-code-branch', label: 'Phiên bản', value: 'v2.0.0' },
    { icon: 'fa-layer-group', label: 'Chế độ luyện tập', value: '16 chế độ' },
    { icon: 'fa-book', label: 'Từ vựng', value: 'ETS TOEIC chuẩn quốc tế' },
    { icon: 'fa-trophy', label: 'Gamification', value: 'XP • Coins • Gems • Streaks' },
    { icon: 'fa-graduation-cap', label: 'Bài thi TOEIC', value: 'Full Test • Mini Test • Đọc lẻ' },
];

export default function AboutPanel() {
    return (
        <div className="settings-section">
            <h3>LevelUp TOEIC</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {ABOUT_ROWS.map(({ icon, label, value }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                        <i className={`fas ${icon}`} style={{ width: 20, color: 'var(--primary-color)' }}></i>
                        <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{label}</span>
                        <span style={{ fontWeight: 600 }}>{value}</span>
                    </div>
                ))}
            </div>
            <p style={{ marginTop: 16, fontSize: '0.85em', color: 'var(--text-secondary)', textAlign: 'center' }}>
                Nền tảng học từ vựng TOEIC theo phong cách gamification.<br />
                Học mọi lúc, mọi nơi — tiến bộ từng ngày.
            </p>
        </div>
    );
}
