export default function Timer({ display, warning, isUnlimited, sectionLabel }) {
    const className = `toeic-timer${warning ? ' warning' : ''}`;
    const style = isUnlimited ? { color: 'var(--success-color)' } : undefined;

    return (
        <div className={className} id="toeic-timer" style={style}>
            <i className="fas fa-clock"></i>
            {/* Full Test có 2 đồng hồ nối tiếp (Nghe 45' → Đọc 75') nên phải nói
                rõ đang đếm cho chặng nào, không thì tưởng đồng hồ bị nhảy lại. */}
            {sectionLabel && <span className="toeic-timer-section">{sectionLabel}</span>}
            <span id="timer-display">{display}</span>
        </div>
    );
}
