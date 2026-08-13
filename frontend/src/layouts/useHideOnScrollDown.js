import { useState, useEffect } from 'react';

// Chỉ bắt đầu ẩn sau khi đã cuộn qua ngưỡng này. Ẩn ngay từ pixel đầu tiên là
// thanh chớp tắt theo từng cú lăn chuột — rất khó chịu.
const HIDE_AFTER = 90;
// Ngưỡng chống rung: chuột lăn nhẹ hoặc màn cảm ứng nảy vài pixel không được
// tính là "đổi hướng".
const DELTA = 6;

/**
 * Ẩn khi cuộn XUỐNG, hiện lại khi cuộn LÊN.
 *
 * Trả lại chiều cao thanh cho nội dung lúc đang đọc, mà muốn dùng lại thì chỉ
 * cần lăn ngược một chút, không phải cuộn về đỉnh trang.
 *
 * Dùng chung cho thanh trạng thái (trên) và thanh điều hướng (dưới, mobile) —
 * hai bản chép rời sẽ lệch ngưỡng nhau, và người dùng thấy hai thanh ẩn/hiện
 * so le thì tưởng giao diện giật.
 */
export function useHideOnScrollDown() {
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        let last = window.scrollY;
        let ticking = false;

        const update = () => {
            ticking = false;
            const y = window.scrollY;
            const diff = y - last;
            if (Math.abs(diff) < DELTA) return;   // rung lặt vặt → bỏ qua
            last = y;
            setHidden(y > HIDE_AFTER && diff > 0);
        };

        // rAF: sự kiện scroll bắn dày đặc, gom về mỗi khung hình một lần.
        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(update);
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return hidden;
}
