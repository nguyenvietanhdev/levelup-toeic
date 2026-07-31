import { useState } from 'react';
import { toeicQuestionNumber } from '../toeicPartTime.js';

/**
 * Lưới điều hướng câu cho màn XEM LẠI — cột DÍNH bên trái, không phải popup.
 *
 * Bản cũ là overlay và tự đóng sau mỗi lần bấm, nên xem 7 câu sai là 7 vòng
 * "cuộn lên → mở panel → bấm → đọc → cuộn lên lại". Ở đây lưới luôn nằm đó,
 * bấm số là khung bên phải đổi tại chỗ: một cú bấm cho mỗi câu, không cuộn.
 *
 * Tô màu theo ĐÚNG/SAI (khác popup lúc làm bài tô theo đã trả lời / đánh dấu)
 * vì xem lại thì đáp án đã lộ hết.
 */
const PART_LABEL = {
    1: 'Part 1 · Photographs',
    2: 'Part 2 · Question-Response',
    3: 'Part 3 · Conversations',
    4: 'Part 4 · Talks',
    5: 'Part 5 · Incomplete Sentences',
    6: 'Part 6 · Text Completion',
    7: 'Part 7 · Reading Comprehension',
};

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

export default function ResultsNavSidebar({ open, questions, selectedIndex, onSelect, onClose }) {
    const [filterPart, setFilterPart] = useState(null);

    const groups = groupByPart(questions);
    const shownGroups = filterPart == null ? groups : groups.filter(g => g.part === filterPart);

    const renderBtn = ({ q, i }) => {
        const answered = !!q.userAnswer;
        const isCorrect = q.userAnswer === q.correctAnswer;
        const classes = ['toeic-nav-btn'];
        // Bỏ qua giữ nguyên nền trắng để phân biệt với câu làm sai.
        if (answered) classes.push(isCorrect ? 'res-correct' : 'res-wrong');
        if (i === selectedIndex) classes.push('res-current');
        return (
            <button
                key={i}
                className={classes.join(' ')}
                title={answered ? (isCorrect ? 'Đúng' : `Sai — bạn chọn ${q.userAnswer}`) : 'Bỏ qua'}
                onClick={() => onSelect(i)}
            >
                {toeicQuestionNumber(q, i)}
            </button>
        );
    };

    return (
        // aria-hidden + inert khi đóng: ngăn kéo vẫn nằm trong DOM (để trượt
        // được), nhưng đã trượt ra ngoài thì không được để Tab lọt vào đó.
        <aside
            className={`results-nav-sidebar${open ? ' open' : ''}`}
            aria-hidden={!open}
            inert={!open}
        >
            <div className="results-nav-sidebar-head">
                <span><i className="fas fa-th"></i> Lưới câu</span>
                <button className="results-nav-sidebar-close" onClick={onClose} title="Đóng lưới">
                    <i className="fas fa-times"></i>
                </button>
            </div>

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

            <div className="toeic-nav-legend">
                <span className="toeic-legend-item"><span className="toeic-legend-dot res-correct"></span>Đúng</span>
                <span className="toeic-legend-item"><span className="toeic-legend-dot res-wrong"></span>Sai</span>
                <span className="toeic-legend-item"><span className="toeic-legend-dot"></span>Bỏ qua</span>
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
        </aside>
    );
}
