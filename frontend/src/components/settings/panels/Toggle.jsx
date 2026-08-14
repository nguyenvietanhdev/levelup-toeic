/**
 * Lựa chọn bật/tắt — dùng <select>, không phải nút gạt.
 *
 * Nút gạt chỉ hiện TRẠNG THÁI, không hiện lựa chọn: nhìn vào nó phải biết trước
 * "gạt sang phải nghĩa là bật" mới đọc được, và người dùng thường phải bấm thử
 * mới chắc. Select ghi thẳng "Bật"/"Tắt" nên không phải đoán, và đồng bộ với các
 * ô chọn khác trong cùng màn Cài đặt.
 *
 * Giữ NGUYÊN interface (`checked` + `onChange(boolean)`) nên 8 chỗ gọi không
 * phải sửa gì — đổi ruột ở đây là đổi hết.
 */
export default function Toggle({ checked, onChange, labels }) {
    const on = labels?.on || 'Bật';
    const off = labels?.off || 'Tắt';

    return (
        /* `quick-difficulty-selector` là class của thanh nav, mượn lại để lấy
           kiểu nền/viền. Cái giá của việc mượn: ô này dính luôn mọi quy tắc của
           nav — kể cả bản NÉN ở @media 480px (`font-size: 10px`) và nền
           GRADIENT ở dark-mode. Cả ba đã được kéo về bộ dùng chung của Cài đặt
           trong components.css / responsive.css.

           `toggle-select--on` là thứ báo TRẠNG THÁI ra ngoài cho CSS: bật thì
           tô màu chủ đề, tắt thì để nền trung tính. Trước đây mọi ô đều mang
           gradient đỏ-cam nên nhìn lướt không phân biệt được Bật với Tắt —
           phải đọc chữ mới biết, tức là màu sắc chẳng nói lên gì. */
        <div className={`quick-difficulty-selector toggle-select${checked ? ' toggle-select--on' : ''}`}>
            <select
                value={checked ? 'on' : 'off'}
                onChange={e => {
                    const next = e.target.value === 'on';
                    // Chọn lại đúng giá trị đang dùng thì không làm gì: nhiều
                    // `onChange` ở đây ghi settings rồi hiện thông báo, gọi thừa
                    // là một thông báo thừa mỗi lần chạm.
                    if (next !== checked) onChange(next);
                }}
            >
                <option value="on">{on}</option>
                <option value="off">{off}</option>
            </select>
        </div>
    );
}
