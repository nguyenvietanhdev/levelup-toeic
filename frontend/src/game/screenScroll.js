/**
 * Nhớ vị trí cuộn của từng màn hình.
 *
 * Các màn không unmount khi rời đi — chúng chỉ bị `display: none` (layout.css
 * `.screen`). Trang co lại nên trình duyệt kéo `window.scrollY` về 0, và lúc
 * quay lại thì người dùng đứng ở đầu trang dù trước đó đã cuộn xuống giữa danh
 * sách chế độ. Với trang chủ — nơi có 12 thẻ chế độ, nhiệm vụ, lịch streak —
 * đó là mất chỗ thật sự: vào luyện tập rồi thoát ra là phải cuộn tìm lại.
 *
 * Lưu theo TỪNG màn chứ không một biến chung: mỗi màn có độ dài riêng, dùng
 * chung một giá trị là khôi phục nhầm vị trí của màn khác.
 */

const viTri = new Map();

/** Cuộn hiện tại. `documentElement` cho Chrome/Firefox, `body` cho Safari cũ. */
function scrollHienTai() {
    return window.scrollY
        ?? window.pageYOffset
        ?? document.documentElement?.scrollTop
        ?? 0;
}

/** Ghi lại chỗ đang đứng của một màn, gọi TRƯỚC khi rời đi. */
export function luuViTri(screenId) {
    if (!screenId) return;
    viTri.set(screenId, scrollHienTai());
}

/** Vị trí đã lưu của một màn (0 nếu chưa từng ghé). */
export function docViTri(screenId) {
    return viTri.get(screenId) ?? 0;
}

/** Quên vị trí — dùng khi muốn lần vào sau bắt đầu từ đầu trang. */
export function quenViTri(screenId) {
    viTri.delete(screenId);
}

/**
 * Cuộn tới `y` sau khi màn mới đã hiện.
 *
 * Hai khung hình chứ không phải một: khung đầu React mới gắn class `active`,
 * chiều cao trang lúc đó vẫn là của màn cũ nên `scrollTo` bị kẹp về đáy cũ.
 * Khung thứ hai trang đã đủ cao để nhận đúng giá trị.
 *
 * `behavior: 'auto'` chứ không `smooth`: đây là KHÔI PHỤC chỗ cũ, người dùng
 * mong thấy nó ngay. Cuộn mượt từ đầu trang xuống giữa trang trông như trang tự
 * trôi.
 */
export function khoiPhucCuon(y) {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            window.scrollTo({ top: y || 0, behavior: 'auto' });
        });
    });
}
