function typeLabel(testType, fillBlankMode) {
    if (testType === 'full-test') return 'Full Test';
    const m = /mini-part(\d)/.exec(testType || '');
    const part = m ? ` · Part ${m[1]}` : '';
    if (fillBlankMode) return `Nghe Đục Lỗ${part}`;
    return `Mini Test${part}`;
}

function fmtDuration(sec) {
    if (!sec || sec <= 0) return '—';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return m > 0 ? `${m}p ${s}s` : `${s}s`;
}

export default function HistoryItem({ attempt, onView }) {
    const date = new Date(attempt.completedAt).toLocaleDateString('vi-VN');
    const isFull = attempt.testType === 'full-test';
    const correct = attempt.correctAnswers ?? 0;
    const totalQ = attempt.totalQuestions ?? 0;
    const acc = attempt.accuracy ?? (totalQ ? Math.round((correct / totalQ) * 100) : 0);
    // Màu theo độ chính xác (đúng cho cả full lẫn mini, thay vì lấy mốc điểm /990).
    const levelClass = acc >= 70 ? 'success' : acc >= 40 ? 'warning' : 'error';

    return (
        <div className="toeic-history-item" data-attempt-id={attempt._id}>
            <div className="history-left">
                <div className="history-title-row">
                    <h4>{attempt.testName}</h4>
                    <span className="history-type-badge">{typeLabel(attempt.testType, attempt.fillBlankMode)}</span>
                </div>
                <div className="history-meta">
                    <span><i className="fas fa-calendar"></i> {date}</span>
                    <span><i className="fas fa-clock"></i> {fmtDuration(attempt.duration)}</span>
                    <span><i className="fas fa-list-ol"></i> {totalQ} câu</span>
                </div>
            </div>
            <div className="history-right">
                <div className={`history-percent ${levelClass}`}>
                    <span className="percent-value">{acc}%</span>
                </div>
                <div className="history-score">
                    {isFull ? (
                        <span className="score-value">{attempt.totalScore} <small>/ 990</small></span>
                    ) : (
                        // Mỗi part: điểm tối đa = số câu × 5 (TOEIC ~5đ/câu) → khác nhau theo part.
                        <span className="score-value">{correct * 5} <small>/ {totalQ * 5}</small></span>
                    )}
                </div>
                <button
                    className="toeic-action-btn view-result-btn"
                    onClick={() => onView?.(attempt._id)}
                >
                    <i className="fas fa-eye"></i> Xem
                </button>
            </div>
        </div>
    );
}
