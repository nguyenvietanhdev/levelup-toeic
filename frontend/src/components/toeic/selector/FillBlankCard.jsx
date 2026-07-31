export default function FillBlankCard({ test, onStart }) {
    const partNumber = test.testType.replace('mini-part', '');

    return (
        <div className="toeic-test-card" data-test-id={test._id} data-fill-blank="true">
            <div className="toeic-test-header">
                <div
                    className="toeic-test-icon"
                    style={{ background: 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))' }}
                >
                    <i className="fas fa-pen-square"></i>
                </div>
                <div>
                    <span className="toeic-test-badge mini">Part {partNumber}</span>
                    <span
                        className="toeic-test-badge"
                        style={{ background: 'var(--primary-light, #f0e6ff)', color: 'var(--primary-color)' }}
                    >
                        Đục lỗ
                    </span>
                </div>
            </div>

            <h3 className="toeic-test-title">{test.testName}</h3>
            <p className="toeic-test-description">
                Điền từ còn thiếu vào chỗ trống trong câu hỏi và đáp án
            </p>

            <div className="toeic-test-stats">
                <div className="toeic-stat">
                    <span className="toeic-stat-value">{test.totalQuestions}</span>
                    <span className="toeic-stat-label">Câu hỏi</span>
                </div>
                <div className="toeic-stat">
                    <span className="toeic-stat-value">{Math.floor((test.totalTime || 0) / 60)}</span>
                    <span className="toeic-stat-label">Phút</span>
                </div>
                <div className="toeic-stat">
                    <span className="toeic-stat-value"><i className="fas fa-pen"></i></span>
                    <span className="toeic-stat-label">Điền từ</span>
                </div>
            </div>

            <div className="toeic-test-footer">
                <span className="toeic-test-attempts">
                    <i className="fas fa-headphones"></i> Listening Part {partNumber}
                </span>
                <button
                    className="toeic-start-btn"
                    onClick={(e) => { e.stopPropagation(); onStart?.(test._id); }}
                >
                    <i className="fas fa-play"></i> Bắt đầu
                </button>
            </div>
        </div>
    );
}
