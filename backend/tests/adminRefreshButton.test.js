/**
 * Nút "Tải lại" của tab Tổng quan.
 *
 * Trạng thái trước đó: `refreshData()` và `document.getElementById("btn-refresh")
 * ?.addEventListener(...)` đã nằm trong ui-init.js từ lâu — nhưng CÁI NÚT thì
 * chưa bao giờ có trong HTML. Handler mồ côi, nối vào một id không tồn tại, và
 * toán tử `?.` khiến nó im lặng tuyệt đối.
 *
 * Đây là trang cần nút nhất: mở ra đầu tiên, và là trang hiển thị sai nhiều nhất
 * khi server ngủ đông dậy chậm (xem adminOfflineFallback.test.js). Không có nút
 * thì cách duy nhất để thử lại là F5 cả trang.
 *
 * Hai luật test này chốt:
 *   1. Nút phải TỒN TẠI trong HTML đã render — không thì handler lại mồ côi.
 *   2. Chỉ MỘT chỗ được nối handler. users.js và ui-init.js từng cùng nối vào
 *      #btn-refresh; vô hại khi nút chưa có, nhưng từ lúc có nút thì mỗi lần bấm
 *      chạy refreshData hai lần.
 *
 * Test thuần: render HTML + đọc file nguồn, không nạp trình duyệt.
 */
const fs = require('fs');
const path = require('path');
const { renderAdminDashboard } = require('../utils/renderAdminDashboard');

const ADMIN_JS = path.join(__dirname, '..', 'public', 'admin', 'js');
const html = renderAdminDashboard();

/** Mọi file .js trong panel admin. */
function jsFiles(dir = ADMIN_JS, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) jsFiles(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

describe('Admin — nút Tải lại ở tab Tổng quan', () => {

    test('nút tồn tại trong trang đã render', () => {
        expect(html).toContain('id="btn-refresh"');
    });

    test('nút nằm trong tab Tổng quan, không lạc sang tab khác', () => {
        const tab = /<div id="main-tab-overview"[\s\S]*?<div class="stats-grid"/.exec(html);
        expect(tab).not.toBeNull();
        expect(tab[0]).toContain('id="btn-refresh"');
    });

    test('CHỈ MỘT file nối handler cho #btn-refresh', () => {
        const binders = jsFiles()
            .filter(f => /getElementById\(\s*["']btn-refresh["']\s*\)\s*\??\.addEventListener/.test(
                fs.readFileSync(f, 'utf8')
            ))
            .map(f => path.relative(ADMIN_JS, f).replace(/\\/g, '/'));

        // Đăng ký trùng = mỗi lần bấm gọi refreshData nhiều lần.
        expect(binders).toEqual(['core/ui-init.js']);
    });

    test('refreshData chờ tải xong rồi mới mở khoá nút', () => {
        const core = fs.readFileSync(path.join(ADMIN_JS, 'core', 'core.js'), 'utf8');
        const fn = /async function refreshData\(\)[\s\S]*?\n\}/.exec(core);
        expect(fn).not.toBeNull();
        // Không await thì nút mở khoá ngay lập tức, người dùng bấm dồn.
        expect(fn[0]).toMatch(/await loadDashboard\(\)/);
        expect(fn[0]).toMatch(/disabled = true/);
        expect(fn[0]).toMatch(/finally/);
    });

    test('bấm Tải lại cập nhật CẢ 4 ô, không sót ô TOEIC', () => {
        // Hai ô "Câu hỏi TOEIC" (#total-sessions) và "Đề thi TOEIC"
        // (#toeic-tests-count) do loadToeicStats() ghi, không phải /health. Nếu
        // loadDashboard() không gọi hàm đó thì bấm Tải lại chỉ mới được 2/4 ô.
        const core = fs.readFileSync(path.join(ADMIN_JS, 'core', 'core.js'), 'utf8');
        const fn = /async function loadDashboard\(\)[\s\S]*?\n\}/.exec(core);
        expect(fn).not.toBeNull();
        // PHẢI lọc dòng comment trước khi so. Không lọc thì comment out lời gọi
        // (`// await loadToeicStats();`) vẫn khớp và test vẫn xanh — đã dính đúng
        // bẫy này lúc reverse-verify.
        const code = fn[0].split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
        expect(code).toMatch(/await loadToeicStats\(\)/);
    });

    test('loadToeicStats hỏng thì XOÁ số cũ, không để nguyên', () => {
        // Giữ số của lần trước khiến người xem tin đó là số vừa lấy về — sai mà
        // im lặng. Cùng khuôn với ô Từ vựng từng hiện 0 lúc server ngủ đông.
        const toeic = fs.readFileSync(path.join(ADMIN_JS, 'features', 'toeic', 'toeic.js'), 'utf8');
        const fn = /async function loadToeicStats\(\)[\s\S]*?\n\}/.exec(toeic);
        expect(fn).not.toBeNull();
        const katch = /catch\s*\([\s\S]*$/.exec(fn[0]);
        expect(katch).not.toBeNull();
        expect(katch[0]).toMatch(/toeic-tests-count/);
        expect(katch[0]).toMatch(/total-sessions/);
        expect(katch[0]).toMatch(/'—'/);
    });

    test('có mốc thời gian cập nhật gần nhất', () => {
        // Số liệu không kèm thời điểm thì không biết nó còn mới hay đã cũ.
        expect(html).toContain('id="overview-updated"');
        const core = fs.readFileSync(path.join(ADMIN_JS, 'core', 'core.js'), 'utf8');
        expect(core).toMatch(/function stampOverviewUpdated/);
    });
});
