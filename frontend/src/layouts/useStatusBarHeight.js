import { useEffect } from 'react';

/**
 * Đặt biến CSS `--sb` = chiều cao THẬT của thanh trạng thái.
 *
 * Ô tìm ở khổ điện thoại là một dòng cố định nằm NGAY DƯỚI thanh đó. Không thể
 * ghim con số cứng: thanh trạng thái xuống dòng (`flex-wrap`) nên cao 1 hay 2
 * dòng tuỳ nội dung — có bảng Part hay không, số xu dài ngắn, khổ màn hình.
 * Ghim cứng thì hoặc ô tìm đè lên thanh, hoặc chừa một khoảng hở lơ lửng.
 *
 * `ResizeObserver` bắt được cả hai kiểu đổi: đổi nội dung (mua đồ, lên cấp,
 * chọn Part) và đổi khổ màn (xoay ngang).
 *
 * Thanh trạng thái bị ẩn (`.status-bar--hidden` khi cuộn xuống) vẫn chiếm chỗ
 * trong `offsetHeight` — đó là ĐÚNG: nó chỉ trượt lên bằng `transform`, không
 * rời khỏi dòng chảy, nên ô tìm cứ giữ nguyên chỗ là khớp.
 */
export function useStatusBarHeight() {
    useEffect(() => {
        const root = document.documentElement;
        const el = document.getElementById('status-bar');
        if (!el) {
            // Màn nào không có thanh trạng thái thì ô tìm bám sát đỉnh.
            root.style.setProperty('--sb', '0px');
            return;
        }

        const sync = () => {
            root.style.setProperty('--sb', `${Math.round(el.offsetHeight)}px`);
        };

        sync();
        const ro = new ResizeObserver(sync);
        ro.observe(el);
        return () => {
            ro.disconnect();
            // Trả về 0 khi tháo: để lại giá trị cũ thì màn khác vẫn chừa một
            // khoảng trống đúng bằng chiều cao của thứ không còn ở đó.
            root.style.setProperty('--sb', '0px');
        };
    }, []);
}
