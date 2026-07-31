/**
 * Điều hướng câu (◀ Câu n/N ▶) — đặt ngay trên thanh tiêu đề của khung nội dung
 * thay vì trên header đề thi, để nút bấm nằm cạnh thứ nó điều hướng.
 */
export default function QuestionNav({ current, total, part, canPrev, canNext, onPrev, onNext }) {
    return (
        <div className="toeic-inline-qnav">
            <button className="toeic-qnav-arrow" title="Câu trước" disabled={!canPrev} onClick={onPrev}>
                <i className="fas fa-chevron-left"></i>
            </button>
            <span className="toeic-inline-qnav-label">
                Câu {current}/{total}
                {part ? <span className="toeic-inline-qnav-part"> (Part {part})</span> : null}
            </span>
            <button className="toeic-qnav-arrow" title="Câu sau" disabled={!canNext} onClick={onNext}>
                <i className="fas fa-chevron-right"></i>
            </button>
        </div>
    );
}
