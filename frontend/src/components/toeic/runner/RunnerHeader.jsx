import Timer from './Timer.jsx';
import QuestionNav from './QuestionNav.jsx';

export default function RunnerHeader({
    testName, timer, isMarked, nav, pace, hidden = false, timerSectionLabel,
    onBack, onToggleNav, onToggleMark, onPause, onSubmit,
}) {
    // Thanh nhịp của câu hiện tại dán vào MÉP DƯỚI header: cùng khối với đồng
    // hồ tổng nên đọc là "thời gian", nhưng không thêm con số thứ hai — con số
    // đặt cạnh thanh sẽ bị hiểu nhầm là giờ của riêng câu đó.
    const showPace = pace && pace.total > 0 && pace.left !== null;
    const pct = showPace ? Math.max(0, Math.min(100, (pace.left / pace.total) * 100)) : 0;

    return (
        <div className={`toeic-test-header-bar${hidden ? ' is-hidden' : ''}`}>
            {/* Trái: quay lại + tên đề */}
            <div className="toeic-header-left">
                <button className="toeic-back-btn" title="Quay lại" onClick={onBack}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <div className="toeic-test-name">{testName}</div>
            </div>

            {/* Giữa: điều hướng câu */}
            <div className="toeic-header-center">
                {nav && <QuestionNav {...nav} />}
            </div>


            {/* Phải: điều hướng câu hỏi + đồng hồ + hành động */}
            <div className="toeic-test-actions">
                {onToggleNav && (
                    <button className="toeic-action-btn" title="Điều hướng câu hỏi" onClick={onToggleNav}>
                        <i className="fas fa-th"></i> Câu hỏi
                    </button>
                )}
                {timer && (
                    <Timer
                        display={timer.display}
                        warning={timer.warning}
                        isUnlimited={timer.isUnlimited}
                        sectionLabel={timerSectionLabel}
                    />
                )}
                <button className={`toeic-action-btn${isMarked ? ' active' : ''}`} onClick={onToggleMark}>
                    <i className="fas fa-bookmark"></i> Đánh dấu
                </button>
                <button className="toeic-action-btn primary" onClick={onSubmit}>
                    <i className="fas fa-check"></i> Nộp bài
                </button>
            </div>

            {showPace && (
                <div className="toeic-pace-bar" title={pace.label}>
                    <div
                        className={`toeic-pace-fill${pace.left <= 5 ? ' urgent' : ''}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            )}
        </div>
    );
}
