import { useState } from 'react';

/**
 * Ô nhập số CHỐT KHI RỜI Ô (blur/Enter), không chốt theo từng phím.
 *
 * Kẹp giá trị ngay trong onChange thì mỗi phím bấm lại bị làm tròn/kẹp rồi ghi
 * ngược vào ô: gõ "700" sẽ chạy 7→10, 100→100, 1000→990. Người dùng thấy số
 * nhảy loạn mà không hiểu vì sao. Giữ bản nháp dạng CHUỖI trong lúc gõ, chỉ quy
 * về số hợp lệ khi người ta gõ xong.
 *
 * @param {number}   value     giá trị đã lưu
 * @param {function} clamp     (number) => number — quy về mốc hợp lệ
 * @param {function} onCommit  nhận giá trị đã clamp; 0 khi người dùng xoá trắng
 */
export default function CommitNumberInput({ value, onCommit, clamp, ...rest }) {
    const [draft, setDraft] = useState(null);   // null = không gõ dở
    // `??` chứ không `||`: chuỗi rỗng (vừa xoá sạch ô) là bản nháp hợp lệ.
    const shown = draft ?? (value ? String(value) : '');

    const commit = () => {
        if (draft === null) return;
        const raw = parseInt(draft, 10);
        onCommit(Number.isFinite(raw) ? clamp(raw) : 0);  // xoá trắng = bỏ đặt
        setDraft(null);
    };

    return (
        <input
            {...rest}
            type="number"
            value={shown}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
    );
}
