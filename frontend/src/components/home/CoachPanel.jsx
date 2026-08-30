import { useState, useEffect, useCallback } from 'react';
import { CoachAPI } from '@api/coach.js';

/**
 * GỢI Ý LUYỆN TẬP — "hôm nay nên luyện gì".
 *
 * Thứ gắn 16 chế độ rời rạc lại với nhau. Người học tự chọn thì trôi về chỗ dễ:
 * số liệu thật trong DB cho thấy Trắc nghiệm 69 lượt / đúng 88%, còn Tốc độ 8
 * lượt / đúng 28% và Viết chữ Hán 10 lượt / đúng 34%. Chế độ càng yếu càng bị
 * né, mà đó chính là chỗ cần luyện.
 *
 * Mỗi gợi ý có LÝ DO chứ không chỉ mệnh lệnh: "luyện Tốc độ đi" thì người ta bỏ
 * qua, "bạn đúng 28% ở đây, thấp nhất trong các chế độ" thì họ hiểu vì sao.
 */

/** Biểu tượng theo loại gợi ý — mắt nhận ra loại trước khi đọc chữ. */
const ICON = {
    'review-due': 'fa-clock-rotate-left',
    grammar: 'fa-spell-check',
    'weak-mode': 'fa-arrow-trend-down',
    forgotten: 'fa-hourglass-half',
    untried: 'fa-compass',
};

export default function CoachPanel({ onPick, active = true }) {
    const [items, setItems] = useState(null);   // null = đang tải
    const [dangTai, setDangTai] = useState(false);
    // Mở rộng/thu gọn: mặc định chỉ hiện gợi ý ĐẦU TIÊN. Đổ cả năm mục lên đầu
    // trang chủ thì nó thành một bức tường chữ che mất lưới chế độ — mà lưới
    // mới là thứ người dùng vào đây để bấm.
    const [moRong, setMoRong] = useState(false);

    // Nạp LẠI mỗi lần vào Trang chủ, không phải một lần lúc mount.
    //
    // `HomeScreen` là màn ở LẠI trong cây (chỉ đổi class `active`), nên nó không
    // unmount khi người dùng đi luyện tập. Deps rỗng nghĩa là con số "N từ đến
    // hạn ôn" đóng băng từ lúc mở app: ôn xong quay về vẫn thấy con số cũ, phải
    // F5 cả trang mới đúng.
    //
    // Đây cũng là đúng lúc cần nạp: gợi ý chỉ đổi sau khi người dùng luyện xong
    // một lượt, mà quay về Trang chủ là việc họ luôn làm ngay sau đó.
    const napLai = useCallback(async () => {
        setDangTai(true);
        try {
            setItems(await CoachAPI.suggestions());
        } finally {
            // `finally` chứ không đặt sau `await`: mạng hỏng thì dòng tắt cờ bị
            // nhảy qua và nút quay mãi.
            setDangTai(false);
        }
    }, []);

    useEffect(() => {
        if (!active) return;
        let huy = false;
        CoachAPI.suggestions().then((d) => { if (!huy) setItems(d); });
        return () => { huy = true; };
    }, [active]);

    // Đang tải, hoặc không có gợi ý nào → ẩn HẲN khối này.
    //
    // Không hiện khung rỗng hay spinner: đây là thông tin phụ trợ, một ô trống
    // nhấp nháy trên đầu trang chủ mỗi lần vào thì phiền hơn là hữu ích.
    if (!items?.length) return null;

    const hien = moRong ? items : items.slice(0, 1);

    return (
        <div className="coach-panel">
            <div className="coach-head">
                <h3><i className="fas fa-lightbulb"></i> Hôm nay nên luyện gì</h3>
                {/* Nút tải lại đứng TRƯỚC "Xem thêm".
                    Tự nạp lại mỗi lần vào Trang chủ đã đủ cho hầu hết lúc, nhưng
                    người dùng ở lì trên Trang chủ (ví dụ vừa ôn ở tab khác) thì
                    không có gì kích hoạt — khi đó vẫn phải F5 cả trang nếu không có
                    nút này. */}
                <button
                    className="coach-reload"
                    onClick={napLai}
                    disabled={dangTai}
                    title="Tải lại gợi ý"
                >
                    <i className={`fas fa-rotate${dangTai ? ' fa-spin' : ''}`}></i>
                </button>
                {items.length > 1 && (
                    <button className="coach-toggle" onClick={() => setMoRong((v) => !v)}>
                        {moRong ? 'Thu gọn' : `Xem thêm ${items.length - 1}`}
                        <i className={`fas fa-chevron-${moRong ? 'up' : 'down'}`}></i>
                    </button>
                )}
            </div>

            <div className="coach-list">
                {hien.map((g) => (
                    <button
                        key={g.key}
                        className="coach-item"
                        onClick={() => onPick?.(g)}
                    >
                        <i className={`fas ${ICON[g.key] || 'fa-circle-dot'} coach-icon`}></i>
                        <span className="coach-body">
                            <strong>{g.tieuDe}</strong>
                            <em>{g.lyDo}</em>
                        </span>
                        <i className="fas fa-chevron-right coach-go"></i>
                    </button>
                ))}
            </div>
        </div>
    );
}
