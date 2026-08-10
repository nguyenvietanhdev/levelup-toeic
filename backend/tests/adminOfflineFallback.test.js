/**
 * Panel admin không được tuyên bố "offline" chỉ vì server ngủ đông dậy chậm.
 *
 * Đã gặp trên production: 4 ô thống kê hiện "-" người dùng và "0" từ vựng, trong
 * khi `/health` cùng lúc trả về 8.327 từ vựng và 4 user — dữ liệu vẫn nguyên vẹn.
 *
 * Nguyên nhân: `checkApiAvailability()` đặt timeout CỨNG 3 giây. Gói free của
 * Render tắt máy sau 15 phút không ai truy cập, lần gọi đầu phải chờ server khởi
 * động lại — thường 30-50 giây. Quá 3 giây là panel rơi vào nhánh offline.
 *
 * Điều khiến nó nguy hiểm hơn một lỗi hiển thị bình thường: nhánh offline ghi số
 * `0`, mà `0` TRÔNG NHƯ dữ liệu thật. Người xem không nghĩ "chưa tải được", họ
 * nghĩ "mất sạch từ vựng rồi".
 *
 * Test thuần: đọc file nguồn, không nạp trình duyệt.
 */
const fs = require('fs');
const path = require('path');

const CORE = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin', 'js', 'core', 'core.js'), 'utf8'
);

/** Bỏ dòng comment trước khi soi — comment có nhắc số 3000 để giải thích lỗi cũ. */
const code = CORE.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('Admin — chờ server ngủ đông, đừng vội kết luận offline', () => {

    test('không còn timeout cứng 3 giây khi dò API', () => {
        const fn = /async function checkApiAvailability[\s\S]*?\n\}/.exec(code);
        expect(fn).not.toBeNull();
        // 3000ms không đủ cho một lần khởi động nguội của Render free tier.
        expect(fn[0]).not.toMatch(/abort\(\)\s*,\s*3000\s*\)/);
    });

    test('có ngưỡng chờ dài để server ngủ đông kịp dậy', () => {
        const probe = /API_PROBE_MS\s*=\s*\[([^\]]*)\]/.exec(code);
        expect(probe).not.toBeNull();
        const values = probe[1].split(',').map(v => Number(v.trim()));
        expect(values.length).toBeGreaterThanOrEqual(2);
        // Lần thử cuối phải đủ dài — dưới 30s là chưa chắc kịp.
        expect(Math.max(...values)).toBeGreaterThanOrEqual(30000);
    });

    test('nhánh offline KHÔNG hiện số 0 như thể đó là dữ liệu thật', () => {
        // `0` không phân biệt được với "đọc được và bằng không". Phải là dấu gạch.
        // Soi thẳng hai dòng gán, không bắt theo cửa sổ ký tự quanh comment —
        // comment dài ngắn thay đổi là regex kiểu đó hụt ngay (đã dính một lần).
        expect(code).toMatch(/localVocabularyData\.length\s*\|\|\s*"—"/);
        expect(code).toMatch(/getElementById\("total-users"\)\.textContent\s*=\s*"—"/);
    });

    test('có báo cho người dùng biết đang CHỜ, không phải đã hỏng', () => {
        // Màn hình đứng im 30 giây mà không nói gì sẽ bị hiểu là treo.
        expect(code).toMatch(/function showWakingUpHint/);
        expect(code).toMatch(/showWakingUpHint\(\)/);
    });
});
