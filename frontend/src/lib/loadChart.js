/**
 * Nạp Chart.js theo YÊU CẦU, không nhét vào chunk khởi động.
 *
 * Trước đây `import Chart from 'chart.js/auto'` nằm thẳng trong main.jsx, nên
 * thư viện lọt vào chunk chính và MỌI người dùng tải nó ngay từ đầu — dù biểu
 * đồ chỉ xuất hiện ở màn Thống kê và tab Phân tích TOEIC.
 *
 * Đo thật: bỏ khỏi chunk chính giảm 875 → 676 kB (gzip 256 → 188 kB).
 *
 * Vẫn gán vào `window.Chart` vì các component vẽ biểu đồ đọc từ đó (chúng dùng
 * `new window.Chart(...)` và bỏ qua im lặng nếu chưa có). Đổi hết sang import
 * trực tiếp là sửa 4 file cho một thứ không đổi hành vi.
 */

/** Promise của lần nạp đang chạy — tránh tải hai lần khi hai màn cùng mở. */
let _loading = null;

/**
 * Bảo đảm `window.Chart` sẵn sàng.
 *
 * @returns {Promise<void>} resolve khi có thể gọi `new window.Chart(...)`
 */
export function loadChart() {
    if (window.Chart) return Promise.resolve();
    if (_loading) return _loading;

    _loading = import('chart.js/auto')
        .then((mod) => { window.Chart = mod.default; })
        .catch((err) => {
            // Nạp hỏng (mất mạng giữa chừng) thì XOÁ promise đã lưu, để lần sau
            // thử lại được. Giữ lại là biểu đồ chết vĩnh viễn cho tới khi F5.
            _loading = null;
            throw err;
        });

    return _loading;
}
