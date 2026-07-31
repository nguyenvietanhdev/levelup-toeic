import { useState } from 'react';

function QuestionReviewItem({ q, index, expanded, onToggle }) {
    const isCorrect = q.userAnswer === q.correctAnswer;
    const statusClass = isCorrect ? 'correct' : 'wrong';
    const statusIcon = isCorrect ? 'fa-check-circle' : 'fa-times-circle';

    // explanation có thể là OBJECT {A,B,C,D} (theo từng đáp án) hoặc string.
    // Render thẳng object sẽ crash React → phải tách ra.
    const explObj = (q.explanation && typeof q.explanation === 'object') ? q.explanation : null;
    const explString = typeof q.explanation === 'string' ? q.explanation : (explObj?.note || '');
    const imageUrl = q.imageUrls?.[0] || q.imageUrl || '';
    const passageList = q.passages?.length ? q.passages : (q.passage ? [q.passage] : []);

    return (
        <div className={`review-question-item ${statusClass}`}>
            <div className="review-question-header" onClick={onToggle} style={{ cursor: 'pointer' }}>
                <div className="review-question-number">
                    <i className={`fas ${statusIcon}`}></i>
                    <span>Câu {index + 1}</span>
                </div>
                <div className="review-answers">
                    <span className="answer-label">Đáp án đúng:</span>
                    <span className="answer-value correct-answer">{q.correctAnswer || '-'}</span>
                    <span className="answer-separator">|</span>
                    <span className="answer-label">Của bạn:</span>
                    <span className={`answer-value user-answer ${isCorrect ? 'correct' : 'wrong'}`}>
                        {q.userAnswer || '(Bỏ qua)'}
                    </span>
                </div>
                <i className={`fas ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'} toggle-icon`}></i>
            </div>
            {expanded && (
                <div className="review-question-detail" style={{ display: 'block' }}>
                    {/* LUÔN 2 cột: trái = "Câu hỏi" (ảnh/đoạn văn) · phải = câu hỏi + đáp án + giải thích */}
                    <div className="review-detail-2col">
                        <div className="review-detail-left">
                            <div className="review-detail-left-title">Câu hỏi</div>
                            {imageUrl && (
                                <img src={imageUrl} alt="Question" className="review-detail-img" />
                            )}
                            {passageList.map((p, pi) => (
                                <div key={pi} className="question-passage">
                                    <span dangerouslySetInnerHTML={{ __html: String(p).replace(/\n/g, '<br>') }} />
                                </div>
                            ))}
                            {!imageUrl && passageList.length === 0 && (
                                <div className="review-detail-left-empty">(Câu không có hình / đoạn văn)</div>
                            )}
                        </div>
                        <div className="review-detail-content">
                            {q.questionText && (
                                <p className="question-text"><strong>Câu hỏi:</strong> <span dangerouslySetInnerHTML={{ __html: q.questionText }} /></p>
                            )}
                            <div className="question-options">
                                {q.options?.map(opt => {
                                    let cls = '';
                                    if (opt.label === q.correctAnswer) cls = 'option-correct';
                                    if (opt.label === q.userAnswer && !isCorrect) cls = 'option-wrong';
                                    const optExpl = explObj?.[opt.label];
                                    return (
                                        <div key={opt.label} className={`option-item ${cls}`}>
                                            <span className="option-label">{opt.label}.</span>
                                            <span className="option-text">
                                                {opt.text}
                                                {optExpl ? <em style={{ display: 'block', opacity: 0.8, fontSize: '0.9em', marginTop: 2 }}>{optExpl}</em> : null}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            {explString && (
                                <div className="question-explanation">
                                    <strong>Giải thích:</strong> {explString}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ResultsModal({ data, onClose }) {
    const [expandedIndex, setExpandedIndex] = useState(null);

    if (!data?.scores || !data?.stats) return null;

    const toggle = (i) => setExpandedIndex(prev => (prev === i ? null : i));

    // Full test → thang TOEIC /990 + Listening/Reading /495.
    // Mini / Nghe Đục Lỗ → điểm theo part (đúng×5 / tổng×5) + số câu đúng + độ chính xác.
    const isFull = data.testType === 'full-test';
    const totalQ = data.stats.totalQuestions || 0;
    const correct = data.stats.correctAnswers || 0;
    const accuracy = Math.round(data.scores.accuracy || 0);
    const partMatch = /(?:mini-)?part(\d)/.exec(data.testType || '');
    const modeName = data.fillBlankMode ? 'Nghe Đục Lỗ' : 'Mini Test';
    const partLabel = partMatch ? `${modeName} · Part ${partMatch[1]}` : modeName;

    return (
        <div id="modal-container" className="active">
            <div className="modal-backdrop" onClick={onClose}></div>
            <div className="modal toeic-results-modal" style={{ maxWidth: 1200, width: '95vw' }}>
                <div className="modal-header">
                    <h3>Kết quả chi tiết</h3>
                    <button className="icon-btn modal-close-btn" onClick={onClose}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                    <div className="toeic-results-header">
                        <h2><i className="fas fa-check-circle"></i> Kết quả bài thi</h2>
                    </div>

                    <div className="toeic-score-card">
                        {isFull ? (
                            <>
                                <div className="main-score">
                                    <div className="score-label">Tổng điểm TOEIC</div>
                                    <div className="score-value">{data.scores.total || 0}</div>
                                    <div className="score-max">/ 990</div>
                                </div>
                                <div className="sub-scores">
                                    <div className="sub-score">
                                        <div className="sub-score-label">Listening</div>
                                        <div className="sub-score-value">{data.scores.listening || 0}</div>
                                        <div className="sub-score-max">/ 495</div>
                                    </div>
                                    <div className="sub-score">
                                        <div className="sub-score-label">Reading</div>
                                        <div className="sub-score-value">{data.scores.reading || 0}</div>
                                        <div className="sub-score-max">/ 495</div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="main-score">
                                    <div className="score-label">{partLabel}</div>
                                    <div className="score-value">{correct * 5}</div>
                                    <div className="score-max">/ {totalQ * 5}</div>
                                </div>
                                <div className="sub-scores">
                                    <div className="sub-score">
                                        <div className="sub-score-label">Số câu đúng</div>
                                        <div className="sub-score-value">{correct}/{totalQ}</div>
                                    </div>
                                    <div className="sub-score">
                                        <div className="sub-score-label">Độ chính xác</div>
                                        <div className="sub-score-value">{accuracy}%</div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="toeic-stats-grid">
                        <div className="stat-card">
                            <div className="stat-icon"><i className="fas fa-check"></i></div>
                            <div className="stat-value">{data.stats.correctAnswers || 0}</div>
                            <div className="stat-label">Đúng</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon"><i className="fas fa-times"></i></div>
                            <div className="stat-value">{data.stats.wrongAnswers || 0}</div>
                            <div className="stat-label">Sai</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon"><i className="fas fa-percentage"></i></div>
                            <div className="stat-value">{Math.round(data.scores.accuracy || 0)}%</div>
                            <div className="stat-label">Độ chính xác</div>
                        </div>
                    </div>

                    <div className="review-questions-section">
                        <h3><i className="fas fa-list"></i> Chi tiết các câu hỏi</h3>
                        <div className="review-questions-list">
                            {data.questions?.length ? data.questions.map((q, i) => (
                                <QuestionReviewItem
                                    key={i}
                                    q={q}
                                    index={i}
                                    expanded={expandedIndex === i}
                                    onToggle={() => toggle(i)}
                                />
                            )) : <p>Không có dữ liệu câu hỏi</p>}
                        </div>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-primary" onClick={onClose}>Về trang chủ TOEIC</button>
                </div>
            </div>
        </div>
    );
}
