import { useState } from 'react';

// Nhãn từng Part cho lưới điều hướng — hiện rõ câu nào thuộc Part nào.
const PART_LABEL = {
    1: 'Part 1 · Photographs',
    2: 'Part 2 · Question-Response',
    3: 'Part 3 · Conversations',
    4: 'Part 4 · Talks',
    5: 'Part 5 · Incomplete Sentences',
    6: 'Part 6 · Text Completion',
    7: 'Part 7 · Reading Comprehension',
};

// Gom các câu (giữ index gốc) thành từng cụm Part liên tiếp, đúng thứ tự đề.
function groupByPart(questions) {
    const groups = [];
    let cur = null;
    questions.forEach((q, i) => {
        const part = q?.part ?? 0;
        if (!cur || cur.part !== part) { cur = { part, items: [] }; groups.push(cur); }
        cur.items.push({ q, i });
    });
    return groups;
}

export default function QuestionNavPopup({ open, questions, currentIndex, answers, markedQuestions, onSelect, onClose }) {
    const [hover, setHover] = useState(null);
    // Lọc theo Part để đỡ cuộn: null = xem tất cả, hoặc chỉ 1 Part.
    const [filterPart, setFilterPart] = useState(null);
    if (!open) return null;

    // Preview theo câu đang hover; không hover thì lấy câu hiện tại.
    const previewIdx = hover != null ? hover : currentIndex;
    const pq = questions[previewIdx];
    const groups = groupByPart(questions);
    const shownGroups = filterPart == null ? groups : groups.filter(g => g.part === filterPart);

    const renderBtn = ({ i }) => {
        const classes = ['toeic-nav-btn'];
        if (i === currentIndex) classes.push('current');
        if (answers[i] !== undefined) classes.push('answered');
        if (markedQuestions.has(i)) classes.push('marked');
        return (
            <button
                key={i}
                className={classes.join(' ')}
                onClick={() => { onSelect(i); onClose(); }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
            >
                {i + 1}
            </button>
        );
    };

    return (
        <div className="toeic-nav-popup" onClick={onClose}>
            <div className="toeic-nav-popup-inner" onClick={(e) => e.stopPropagation()}>
                <div className="toeic-nav-popup-header">
                    <span className="toeic-nav-title">
                        <i className="fas fa-list"></i> Điều hướng câu hỏi
                    </span>
                    {/* Lọc nhanh theo Part — nằm ở khoảng trống giữa tiêu đề và dấu X. */}
                    {groups.length > 1 && (
                        <div className="toeic-nav-partfilter">
                            <button
                                className={`toeic-nav-partchip${filterPart == null ? ' active' : ''}`}
                                onClick={() => setFilterPart(null)}
                            >
                                Tất cả
                            </button>
                            {groups.map((g) => (
                                <button
                                    key={g.part}
                                    className={`toeic-nav-partchip${filterPart === g.part ? ' active' : ''}`}
                                    title={PART_LABEL[g.part] || `Part ${g.part}`}
                                    onClick={() => setFilterPart(filterPart === g.part ? null : g.part)}
                                >
                                    P{g.part}
                                </button>
                            ))}
                        </div>
                    )}
                    <button className="toeic-nav-popup-close" onClick={onClose}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div className="toeic-nav-body">
                    {/* Cột trái: lưới số câu TÁCH THEO TỪNG PART (cuộn riêng nếu nhiều) */}
                    <div className="toeic-nav-left">
                        <div className="toeic-nav-legend">
                            <span className="toeic-legend-item"><span className="toeic-legend-dot current"></span>Hiện tại</span>
                            <span className="toeic-legend-item"><span className="toeic-legend-dot answered"></span>Đã trả lời</span>
                            <span className="toeic-legend-item"><span className="toeic-legend-dot marked"></span>Đánh dấu</span>
                        </div>
                        <div className="toeic-nav-groups">
                            {shownGroups.map((g) => (
                                <div key={`${g.part}-${g.items[0]?.i}`} className="toeic-nav-part-group">
                                    <div className="toeic-nav-part-label">
                                        {PART_LABEL[g.part] || `Part ${g.part}`}
                                        <span className="toeic-nav-part-count">{g.items.length} câu</span>
                                    </div>
                                    <div className="toeic-nav-grid">
                                        {g.items.map(renderBtn)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Cột phải: preview câu hỏi + đáp án (luôn hiển thị) */}
                    <div className="toeic-nav-right">
                        {pq && (
                            <div className="toeic-nav-preview">
                                <div className="toeic-nav-preview-title">
                                    Câu {previewIdx + 1}
                                    {pq.part ? <span className="toeic-nav-preview-part"> · {PART_LABEL[pq.part] || `Part ${pq.part}`}</span> : null}
                                </div>
                                {pq.questionText
                                    ? <div className="toeic-nav-preview-q" dangerouslySetInnerHTML={{ __html: pq.questionText }} />
                                    : <div className="toeic-nav-preview-q toeic-nav-preview-muted">(Câu nghe — không có đề chữ)</div>}
                                <div className="toeic-nav-preview-opts">
                                    {pq.options?.map(o => (
                                        <div
                                            key={o.label}
                                            className={`toeic-nav-preview-opt${answers[previewIdx] === o.label ? ' chosen' : ''}`}
                                        >
                                            <b>{o.label}.</b> {o.text}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
