/**
 * Dải phân bố độ khó A/B/C — CHỈ dải màu, không chữ.
 *
 * Dùng chung khuôn `.part-level-bar` với popup Chọn Part (topicSelector.css),
 * nên hai popup có cùng chiều cao, cùng bo góc, và cùng bị ẩn ở khổ ≤600px chỉ
 * bằng một quy tắc. Chép lại style ở đây là hai bản cho một thứ, sửa một bên
 * thì bên kia lệch.
 *
 * Con số nằm trong `title` của từng đoạn — rê chuột là xem được. Không in thành
 * chữ vì ba con số đó làm mỗi thẻ cao thêm một dòng mà gần như không ai đọc.
 */
export default function LevelBar({ stats }) {
    if (!stats) return null;
    const { a = 0, b = 0, c = 0 } = stats;
    // Vẽ theo TỔNG a+b+c chứ không theo wordCount: từ chưa gắn level không nằm
    // trong nhóm nào, tính chúng vào mẫu số thì dải luôn hụt một khoảng trống
    // khó hiểu.
    const total = a + b + c;
    if (!total) return null;

    const pA = Math.round((a / total) * 100);
    const pB = Math.round((b / total) * 100);
    const pC = 100 - pA - pB;

    // Bo góc đặt ở đoạn ĐẦU và đoạn CUỐI thực sự có mặt — không thì Part chỉ có
    // mỗi mức B sẽ ra một dải vuông chằn chặn giữa các dải bo tròn khác.
    const radius = (isFirst, isLast) => {
        if (isFirst && isLast) return '3px';
        if (isFirst) return '3px 0 0 3px';
        if (isLast) return '0 3px 3px 0';
        return '0';
    };

    const segs = [
        { key: 'a', on: a > 0, flex: pA, color: '#22c55e', title: `A: ${a} từ` },
        { key: 'b', on: b > 0, flex: pB, color: '#f59e0b', title: `B: ${b} từ` },
        { key: 'c', on: c > 0, flex: pC, color: '#ef4444', title: `C: ${c} từ` },
    ].filter(s => s.on);

    return (
        <div className="part-level-bar">
            {segs.map((s, i) => (
                <div
                    key={s.key}
                    title={s.title}
                    style={{
                        flex: s.flex,
                        background: s.color,
                        height: '100%',
                        borderRadius: radius(i === 0, i === segs.length - 1),
                    }}
                />
            ))}
        </div>
    );
}
