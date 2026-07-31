// Tab "Thi TOEIC" — tách khỏi tab Luyện tập.
//
// Trước đây bốn mục dưới đây nằm chung tab với cài đặt luyện TỪ VỰNG, làm tab
// đó phình lên 12 mục và có tới HAI mục cùng tên "Tự động chuyển câu" (một của
// luyện tập, một của bài thi) — người dùng không cách nào biết mình đang chỉnh
// cái nào. Hai lĩnh vực khác nhau thì tách ra hai tab.
import Toggle from './Toggle.jsx';
import CommitNumberInput from './CommitNumberInput.jsx';

// Thụt lề + vạch trái cho cài đặt PHỤ THUỘC một toggle phía trên.
const NESTED = { paddingLeft: 14, borderLeft: '2px solid var(--border-color)' };

const READ_PARTS = [
    { id: 5, name: 'Part 5 — Hoàn thành câu', def: 15 },
    { id: 6, name: 'Part 6 — Hoàn thành đoạn', def: 8 },
    { id: 7, name: 'Part 7 — Đọc hiểu', def: 36 },
];

// Phần Đọc của TOEIC thật chỉ có 75' cho cả Part 5·6·7 — đặt quá mức đó là
// luyện sai nhịp, đến khi thi thật sẽ không kịp giờ. Chỉ CẢNH BÁO chứ không
// chặn: có người muốn tập chậm lúc mới bắt đầu.
const READING_BUDGET_MIN = 75;

export default function ToeicExamPanel({ s, updateSetting }) {
    const partMin = s.toeicCustomPartMin || {};
    const partMinValue = (p) => (typeof partMin[p.id] === 'number' ? partMin[p.id] : p.def);
    // Chốt khi rời ô (CommitNumberInput) chứ không kẹp theo từng phím — kẹp
    // trong onChange thì gõ "36" bị nhảy 3 → 30 → 36 loạn xạ.
    const setPartMin = (id, v) => {
        updateSetting('toeicCustomPartMin', { ...partMin, [id]: v || 1 });
    };
    const clampMin = (v) => Math.max(1, Math.min(180, v));

    const totalReadMin = READ_PARTS.reduce((sum, p) => sum + partMinValue(p), 0);
    const overBudget = totalReadMin - READING_BUDGET_MIN;

    return (
        <div>
            <h3>Bài thi TOEIC</h3>
            <p className="settings-panel-hint">
                Chỉ áp dụng cho Mini Test. <strong>Full Test luôn chạy giờ chuẩn ETS</strong>
                {' '}(Nghe 45′ · Đọc 75′) và không chịu ảnh hưởng của các mục dưới đây.
            </p>

            <div className="setting-item">
                <div className="setting-info">
                    <h4>Giới hạn giờ từng câu (Part Đọc)</h4>
                    <p>Thanh nhịp trên mỗi câu Part 5·6·7 — chia từ tổng thời gian. Part Nghe do audio dẫn, không đếm</p>
                </div>
                <Toggle
                    checked={s.toeicPerQuestionTimer === true}
                    onChange={v => updateSetting('toeicPerQuestionTimer', v)}
                />
            </div>

            {s.toeicPerQuestionTimer === true && (
                <>
                    <div className="setting-item" style={NESTED}>
                        <div className="setting-info">
                            <h4>Hết giờ thì tự sang câu kế</h4>
                            <p>Tắt thì đồng hồ dừng ở 0, bạn tự bấm Tiếp</p>
                        </div>
                        <Toggle
                            checked={s.toeicAutoAdvance !== false}
                            onChange={v => updateSetting('toeicAutoAdvance', v)}
                        />
                    </div>

                    {s.toeicAutoAdvance !== false && (
                        <div className="setting-item" style={NESTED}>
                            <div className="setting-info">
                                <h4>Thời gian chuyển câu</h4>
                                <p>Khoảng nghỉ giữa hai câu — đã được trừ khỏi thời gian mỗi câu</p>
                            </div>
                            <select
                                value={typeof s.toeicTransition === 'number' ? s.toeicTransition : 1}
                                onChange={e => updateSetting('toeicTransition', parseInt(e.target.value))}
                            >
                                {[0, 1, 2, 3, 5].map(sec => (
                                    <option key={sec} value={sec}>{sec === 0 ? 'Không nghỉ' : `${sec}s`}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="setting-item" style={{ display: 'block', ...NESTED }}>
                        <div className="setting-info" style={{ marginBottom: 8 }}>
                            <h4>Thời gian tổng tùy chỉnh — theo Part Đọc</h4>
                            <p>Mức "Tùy chỉnh" ở popup. Mỗi Part một ngân sách riêng (chia ra giây/câu); Part Nghe do audio dẫn</p>
                        </div>
                        {READ_PARTS.map(p => (
                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
                                <span style={{ fontSize: '0.9rem' }}>{p.name}</span>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <CommitNumberInput
                                        min={1} max={180}
                                        value={partMinValue(p)}
                                        clamp={clampMin}
                                        onCommit={v => setPartMin(p.id, v)}
                                        style={{ width: 76, textAlign: 'right' }}
                                    />
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>phút</span>
                                </div>
                            </div>
                        ))}

                        {/* Tổng 3 Part Đọc so với 75' của đề thi thật */}
                        <div
                            style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                marginTop: 10, paddingTop: 10,
                                borderTop: '1px solid var(--border-color, rgba(0,0,0,.08))',
                                fontSize: '0.9rem', fontWeight: 600,
                                color: overBudget > 0 ? 'var(--danger-color, #dc2626)' : 'var(--text-primary)',
                            }}
                        >
                            <span>Tổng phần Đọc</span>
                            <span>{totalReadMin} / {READING_BUDGET_MIN} phút</span>
                        </div>

                        {overBudget > 0 && (
                            <p
                                style={{
                                    margin: '8px 0 0', fontSize: '0.85rem', lineHeight: 1.5,
                                    color: 'var(--danger-color, #dc2626)',
                                }}
                            >
                                <i className="fas fa-triangle-exclamation"></i>{' '}
                                Vượt <strong>{overBudget} phút</strong> so với đề thi thật (Part 5·6·7 chỉ có {READING_BUDGET_MIN} phút).
                                Hãy giảm bớt thời gian một trong các Part để luyện đúng nhịp thi.
                            </p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
