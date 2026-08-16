import { useEffect } from 'react';

/**
 * Đặt biến CSS `--kb` = chiều cao phần màn hình bị BÀN PHÍM ẢO che.
 *
 * Vì sao cần: nav ở khổ điện thoại là `position: fixed; bottom: 0` — bám đáy
 * CỬA SỔ. Nhưng bàn phím ảo KHÔNG làm cửa sổ ngắn lại, nó phủ lên trên. Nên
 * đúng lúc người dùng chạm vào ô tìm để gõ thì cả nav lẫn ô tìm (nằm trong
 * nav) đều bị bàn phím che — gõ mà không thấy mình gõ gì.
 *
 * `window.innerHeight` KHÔNG phát hiện được chuyện này: nó vẫn là chiều cao
 * cửa sổ đầy đủ. Phải dùng VisualViewport — nó mô tả phần THẬT SỰ nhìn thấy.
 *
 *     chiều cao bị che = innerHeight - (visualViewport.height + offsetTop)
 *
 * Trừ cả `offsetTop` vì khi người dùng phóng to rồi kéo, khung nhìn trượt
 * xuống; thiếu vế đó thì tính dư và nav bị đẩy lên lơ lửng giữa màn hình.
 *
 * Trình duyệt không có VisualViewport (Firefox cũ) thì `--kb` giữ nguyên 0 và
 * nav bám đáy như trước — chỉ mất phần cải thiện, không hỏng gì.
 */
export function useKeyboardInset() {
    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;

        const root = document.documentElement;

        const sync = () => {
            const hidden = window.innerHeight - (vv.height + vv.offsetTop);
            // Làm tròn + chặn âm: lúc thanh địa chỉ của trình duyệt co giãn,
            // phép trừ ra số âm nhỏ và nav bị kéo TỤT xuống dưới đáy.
            const px = Math.max(0, Math.round(hidden));
            // Ngưỡng 80px để phân biệt BÀN PHÍM với thanh địa chỉ đang ẩn/hiện
            // (thanh đó chỉ ~50px). Không có ngưỡng thì nav nhấp nhô mỗi lần
            // cuộn trang, trông như lỗi.
            root.style.setProperty('--kb', px > 80 ? `${px}px` : '0px');
        };

        sync();
        vv.addEventListener('resize', sync);
        // `scroll` của khung nhìn: người dùng phóng to rồi kéo thì `offsetTop`
        // đổi mà `resize` không bắn.
        vv.addEventListener('scroll', sync);
        return () => {
            vv.removeEventListener('resize', sync);
            vv.removeEventListener('scroll', sync);
            // Trả về 0 khi tháo: để lại giá trị cũ thì màn khác vẫn thấy nav
            // lơ lửng cách đáy đúng bằng chiều cao bàn phím đã đóng từ lâu.
            root.style.setProperty('--kb', '0px');
        };
    }, []);
}
