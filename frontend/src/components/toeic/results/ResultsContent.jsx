import { useState, useMemo, useEffect } from 'react';
import { toeicQuestionNumber } from '../toeicPartTime.js';
import ResultsNavSidebar from './ResultsNavSidebar.jsx';
import ImageLightbox from '../runner/ImageLightbox.jsx';

/** Số câu + Part + đáp án đúng/của bạn — dùng chung cho thẻ và cho thanh trên. */
function QuestionSummary({ q, index }) {
    const isCorrect = q.userAnswer === q.correctAnswer;
    return (
        <>
            <div className="review-question-number">
                <i className={`fas ${isCorrect ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                <span>Câu {toeicQuestionNumber(q, index)}</span>
                {q.part != null && <span className="review-question-part">Part {q.part}</span>}
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
        </>
    );
}

function QuestionReviewItem({ q, index, expanded, onToggle, hideHeader, onZoomImage }) {
    const isCorrect = q.userAnswer === q.correctAnswer;
    const statusClass = isCorrect ? 'correct' : 'wrong';

    const explObj = q.explanation && typeof q.explanation === 'object' ? q.explanation : null;
    const explString = typeof q.explanation === 'string' ? q.explanation : explObj?.note || '';
    const imageUrl = q.imageUrls?.[0] || q.imageUrl || '';
    const passageList = q.passages?.length ? q.passages : q.passage ? [q.passage] : [];
    const hasContext = !!(q.audioUrl || imageUrl || passageList.length);

    return (
        <div className={`review-question-item ${statusClass}`} id={`review-q-${index}`}>
            {/* hideHeader: thẻ đứng một mình trong khung phải — số câu và đáp án
                đã nằm trên thanh tiêu đề rồi, bày lại ở đây là ăn không một dòng
                trong khi ngân sách chiều cao chỉ có đúng một màn hình. */}
            {!hideHeader && (
                <div
                    className="review-question-header"
                    onClick={onToggle || undefined}
                    style={onToggle ? { cursor: 'pointer' } : undefined}
                >
                    <QuestionSummary q={q} index={index} />
                    {onToggle && (
                        <i className={`fas ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'} toggle-icon`}></i>
                    )}
                </div>
            )}
            {expanded && (
                <div className="review-question-detail" style={{ display: 'block' }}>
                    {/* 2 cột CHỈ KHI có ngữ cảnh (ảnh/đoạn văn/audio). Part 5 không có
                        gì để bày bên trái, mà cột đó vẫn chiếm cứng 40% bề ngang nên
                        đáp án phải xuống dòng gấp đôi rồi tràn khỏi màn hình. */}
                    <div className={`review-detail-2col${hasContext ? '' : ' no-context'}`}>
                        {hasContext && (
                            <div className="review-detail-left">
                                <div className="review-detail-left-title">
                                    <span>Câu hỏi</span>
                                    {/* Part Nghe: cho nghe lại/tua audio ngay trong phần xem lại —
            không nghe lại thì không hiểu vì sao mình chọn sai. */}
                                    {q.audioUrl && (
                                        <audio
                                            src={q.audioUrl}
                                            controls
                                            preload="none"
                                            className="review-detail-audio"
                                            style={{ height: '30px', marginLeft: '10px', flex: 1 }}
                                        />
                                    )}
                                </div>
                                {imageUrl && (
                                    <img
                                        src={imageUrl}
                                        alt="Question"
                                        className="review-detail-img"
                                        title="Bấm để xem ảnh cỡ lớn"
                                        onClick={() => onZoomImage?.(imageUrl)}
                                    />
                                )}
                                {passageList.map((p, pi) => (
                                    <div key={pi} className="question-passage">
                                        <span dangerouslySetInnerHTML={{ __html: String(p).replace(/\n/g, '<br>') }} />
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="review-detail-content">
                            {q.questionText && (
                                <p className="question-text">
                                    <strong>Câu hỏi:</strong>{' '}
                                    <span dangerouslySetInnerHTML={{ __html: q.questionText }} />
                                </p>
                            )}
                            <div className="question-options">
                                {q.options?.map((opt) => {
                                    let cls = '';
                                    if (opt.label === q.correctAnswer) cls = 'option-correct';
                                    if (opt.label === q.userAnswer && !isCorrect) cls = 'option-wrong';
                                    const optExpl = explObj?.[opt.label];
                                    return (
                                        <div key={opt.label} className={`option-item ${cls}`}>
                                            <span className="option-label">{opt.label}.</span>
                                            <span className="option-text">
                                                {opt.text}
                                                {optExpl ? (
                                                    <em
                                                        style={{
                                                            display: 'block',
                                                            opacity: 0.8,
                                                            fontSize: '0.9em',
                                                            marginTop: 2,
                                                        }}
                                                    >
                                                        {optExpl}
                                                    </em>
                                                ) : null}
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

/**
 * Nội dung kết quả bài thi (dùng chung cho trang Kết quả).
 */
export default function ResultsContent({ data }) {
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [filter, setFilter] = useState('all'); // all | correct | wrong
    // Mặc định ĐÓNG: ngăn kéo nổi đè lên nội dung, mở sẵn là che mất cột ngữ
    // cảnh ngay khi vừa vào. Đi tuần tự đã có ◀ ▶ và phím ← →; lưới chỉ cần khi
    // muốn nhảy cóc tới một câu cụ thể.
    const [gridOpen, setGridOpen] = useState(false);
    const [zoomSrc, setZoomSrc] = useState(''); // ảnh đang xem cỡ lớn

    // `|| []` tạo mảng MỚI mỗi lần render → useMemo bên dưới không bao giờ ăn
    // cache. Ghim lại một tham chiếu ổn định.
    const questions = useMemo(() => data?.questions || [], [data?.questions]);

    // Bộ lọc quyết định ◀ ▶ đi qua những câu nào: lọc "Sai" thì hai nút đó đi
    // tuần tự đúng các câu sai, khỏi phải nhặt tay trên lưới.
    const navIndexes = useMemo(
        () =>
            questions
                .map((q, i) => ({ q, i }))
                .filter(({ q }) => {
                    if (filter === 'correct') return q.userAnswer === q.correctAnswer;
                    if (filter === 'wrong') return q.userAnswer !== q.correctAnswer;
                    return true;
                })
                .map(({ i }) => i),
        [questions, filter],
    );

    // Câu đang chọn phải luôn nằm trong tập đang lọc, nếu không khung phải trống
    // trơ mà người dùng không hiểu vì sao. TÍNH lúc render chứ không đồng bộ qua
    // useEffect: `selectedIndex` là Ý ĐỊNH của người dùng, cái hiện ra là kết quả
    // suy từ ý định đó + bộ lọc. Ghi ngược vào state chỉ tổ vẽ lại hai lần.
    const shownIndex =
        selectedIndex != null && navIndexes.includes(selectedIndex) ? selectedIndex : (navIndexes[0] ?? null);

    const navPos = shownIndex == null ? -1 : navIndexes.indexOf(shownIndex);

    // Phím ← → chuyển câu. Đăng ký lại mỗi khi đổi câu/bộ lọc — rẻ hơn nhiều so
    // với việc ghi ref trong lúc render (React cấm, và dễ đọc phải giá trị cũ).
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') {
                setGridOpen(false);
                return;
            }
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            // Đang gõ trong ô nhập, hoặc audio đang được focus để tua → nhường phím.
            const el = document.activeElement;
            const tag = el?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'AUDIO' || el?.isContentEditable) return;
            const next = navIndexes[navPos + (e.key === 'ArrowRight' ? 1 : -1)];
            if (next == null) return;
            e.preventDefault();
            setSelectedIndex(next);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [navIndexes, navPos]);

    if (!data?.scores || !data?.stats) return <p>Không có dữ liệu kết quả.</p>;

    // Bấm số ở lưới: nếu câu đó đang bị bộ lọc ẩn thì mở bộ lọc ra, không thì
    // bấm vào nó chẳng có gì xảy ra — trông y như nút hỏng.
    const selectQuestion = (i) => {
        if (!navIndexes.includes(i)) setFilter('all');
        setSelectedIndex(i);
    };

    const goRelative = (step) => {
        const next = navIndexes[navPos + step];
        if (next != null) setSelectedIndex(next);
    };

    const isFull = data.testType === 'full-test';
    const totalQ = data.stats.totalQuestions || 0;
    const correct = data.stats.correctAnswers || 0;
    const accuracy = Math.round(data.scores.accuracy || 0);
    const partMatch = /(?:mini-)?part(\d)/.exec(data.testType || '');
    const modeName = data.fillBlankMode ? 'Nghe Đục Lỗ' : 'Mini Test';
    const partLabel = partMatch ? `${modeName} · Part ${partMatch[1]}` : modeName;

    const wrongCount = (data.stats.wrongAnswers ?? totalQ - correct) || 0;

    return (
        <div className="toeic-results-content">
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
                                <div className="sub-score-value">
                                    {correct}/{totalQ}
                                </div>
                            </div>
                            <div className="sub-score">
                                <div className="sub-score-label">Độ chính xác</div>
                                <div className="sub-score-value">{accuracy}%</div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Bỏ dải "Đúng / Sai / Độ chính xác": ba con số đó đã nằm nguyên
                trong thẻ điểm phía trên VÀ trong bộ lọc Tất cả/Đúng/Sai bên dưới.
                Lặp lần thứ ba chỉ tổ ăn mất chiều cao của phần xem lại. */}

            <div className="review-questions-section">
                {/* Thanh trên gánh luôn danh tính câu đang xem (số câu · Part ·
                    đáp án đúng/của bạn). Trước đây thông tin này nằm ở một hàng
                    riêng bên dưới — hai hàng cho cùng một việc, mà chiều cao thì
                    chỉ có đúng một màn hình để tiêu. */}
                <div className={`review-questions-bar${shownIndex == null ? '' : ' has-question'}`}>
                    {shownIndex == null ? (
                        <h3>
                            <i className="fas fa-list"></i> Chi tiết các câu hỏi
                        </h3>
                    ) : (
                        <QuestionSummary q={questions[shownIndex]} index={shownIndex} />
                    )}
                    <div className="review-filter">
                        <button
                            className={`toeic-part-btn${filter === 'all' ? ' active' : ''}`}
                            onClick={() => setFilter('all')}
                        >
                            Tất cả ({questions.length})
                        </button>
                        <button
                            className={`toeic-part-btn${filter === 'correct' ? ' active' : ''}`}
                            onClick={() => setFilter('correct')}
                        >
                            Đúng ({correct})
                        </button>
                        <button
                            className={`toeic-part-btn${filter === 'wrong' ? ' active' : ''}`}
                            onClick={() => setFilter('wrong')}
                        >
                            Sai ({wrongCount})
                        </button>
                        {/* Nút mở lưới đứng CUỐI, sát mép phải — ngăn kéo trượt ra
                            từ đúng chỗ đó, chuột gần như không phải di chuyển. */}
                        <button
                            className={`toeic-part-btn${gridOpen ? ' active' : ''}`}
                            onClick={() => setGridOpen((o) => !o)}
                            title={gridOpen ? 'Ẩn lưới câu hỏi' : 'Hiện lưới câu hỏi'}
                        >
                            <i className="fas fa-th"></i> Lưới câu
                        </button>
                    </div>
                </div>

                {/* Lưới DÍNH bên trái + chi tiết bên phải: bấm số là khung phải
                    đổi tại chỗ. Không đóng lưới, không cuộn — bản cũ đóng popup
                    sau mỗi lần chọn nên xem N câu là N vòng cuộn đi cuộn lại. */}
                <div className="review-workspace">
                    {/* Luôn render (không gắn/gỡ theo gridOpen) để hoạt ảnh trượt
                        chạy được — phần tử vừa mount thì không có trạng thái cũ
                        để transition từ đó. */}
                    <ResultsNavSidebar
                        open={gridOpen}
                        questions={questions}
                        selectedIndex={shownIndex}
                        onSelect={selectQuestion}
                        onClose={() => setGridOpen(false)}
                    />

                    <div className="review-detail-pane">
                        {shownIndex == null ? (
                            <p className="review-detail-empty">Không có câu hỏi nào ở bộ lọc này.</p>
                        ) : (
                            <>
                                {/* Nội dung cuộn trong vùng RIÊNG; thanh điều hướng
                                    nằm NGOÀI vùng đó nên không bao giờ đè lên chữ.
                                    (sticky bottom thì vẫn đè: nó chỉ chừa chỗ ở vị
                                    trí nghỉ, lúc đang dính thì chữ trôi bên dưới.) */}
                                <div className="review-detail-scroll">
                                    <QuestionReviewItem
                                        key={shownIndex}
                                        q={questions[shownIndex]}
                                        index={shownIndex}
                                        expanded
                                        hideHeader
                                        onZoomImage={setZoomSrc}
                                    />
                                </div>
                                <div className="review-stepper">
                                    <button
                                        className="toeic-part-btn"
                                        disabled={navPos <= 0}
                                        onClick={() => goRelative(-1)}
                                        title="Phím ←"
                                    >
                                        <i className="fas fa-chevron-left"></i> Câu trước
                                    </button>
                                    <span className="review-stepper-pos">
                                        {filter === 'wrong' ? 'Câu sai' : filter === 'correct' ? 'Câu đúng' : 'Câu'}{' '}
                                        {navPos + 1}/{navIndexes.length}
                                        <span className="review-stepper-hint">← →</span>
                                    </span>
                                    <button
                                        className="toeic-part-btn"
                                        disabled={navPos < 0 || navPos >= navIndexes.length - 1}
                                        onClick={() => goRelative(1)}
                                        title="Phím →"
                                    >
                                        Câu sau <i className="fas fa-chevron-right"></i>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <ImageLightbox src={zoomSrc} alt="Ảnh câu hỏi" onClose={() => setZoomSrc('')} />
        </div>
    );
}
