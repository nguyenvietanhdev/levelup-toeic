/**
 * Nút Tải lại ở tab Token Management (Giám sát AI).
 *
 * Số liệu token/chi phí chỉ nạp khi MỞ tab hoặc khi đổi khoảng ngày. Admin để
 * tab mở lâu — đúng lúc đang chạy AI Fill hàng loạt để xem tốn bao nhiêu — thì
 * con số đứng im, và cách duy nhất để làm mới là đổi khoảng ngày rồi đổi lại.
 *
 * Ba chỗ dễ hỏng, cả ba đều IM LẶNG:
 *   1. `onclick` nội tuyến trong HTML → CSP của trang admin đặt
 *      `script-src-attr 'none'` nên handler bị chặn: nút hiện ra, bấm không ăn,
 *      không lỗi nào trong console.
 *   2. Không tắt cờ trong `finally` → lỗi mạng là nút quay mãi và không bấm lại
 *      được (đúng lỗi đã gặp ở popup Chọn đề).
 *   3. Gọi lại hàm nạp mà KHÔNG await → không biết lúc nào xong, biểu tượng
 *      quay tắt ngay trong khi dữ liệu chưa về.
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin', 'partials', 'tabs', 'token-management.html'),
    'utf8'
);
const tabs = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin', 'js', 'core', 'tabs.js'),
    'utf8'
);

/** Thân handler của nút Tải lại. */
const handler = (() => {
    const i = tabs.indexOf('reloadBtn?.addEventListener');
    expect(i).toBeGreaterThan(-1);
    return tabs.slice(i, i + 900);
})();

describe('nút có mặt trong trang', () => {
    test('nằm ở hàng tiêu đề, cạnh ô chọn khoảng ngày', () => {
        expect(html).toMatch(/id="btn-ai-usage-reload"/);
        // Cùng cụm với `ai-usage-days` — hai thứ này cùng điều khiển một bảng
        // số liệu, tách ra hai chỗ là người dùng phải đi tìm.
        const i = html.indexOf('ai-usage-days');
        const j = html.indexOf('btn-ai-usage-reload');
        expect(j).toBeGreaterThan(i);
        expect(j - i).toBeLessThan(900);
    });

    test('có nhãn cho người dùng biết nút làm gì', () => {
        // Nút chỉ có icon thì phải có `title`, không thì không ai đoán được.
        const i = html.indexOf('btn-ai-usage-reload');
        expect(html.slice(i, i + 200)).toMatch(/title="/);
    });

    test('KHÔNG dùng onclick nội tuyến', () => {
        // CSP đặt `script-src-attr 'none'` → handler nội tuyến bị chặn IM LẶNG.
        const i = html.indexOf('btn-ai-usage-reload');
        expect(html.slice(i, i + 300)).not.toMatch(/onclick=/);
    });

    test('trang admin THẬT SỰ có CSP chặn handler nội tuyến', () => {
        // Khoá lại giả định của test trên. `script-src-attr 'none'` là MẶC ĐỊNH
        // của Helmet — không khai tường minh ở đâu cả, nên chỗ duy nhất kiểm
        // được là Helmet có bật hay không. Gỡ nó thì test này đỏ và ta biết luật
        // "không dùng onclick" đã hết hiệu lực.
        const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        expect(server).toMatch(/require\('helmet'\)/);
        expect(server).toMatch(/app\.use\(helmet\(/);
    });
});

describe('nối sự kiện đúng cách', () => {
    test('dùng addEventListener', () => {
        expect(tabs).toMatch(/getElementById\("btn-ai-usage-reload"\)/);
        expect(handler).toMatch(/"click"/);
    });

    test('gọi lại đúng hàm nạp số liệu', () => {
        expect(handler).toMatch(/loadTokenStats\(\)/);
    });

    test('AWAIT hàm nạp — nó là async', () => {
        // Không await thì biểu tượng quay tắt ngay trong khi dữ liệu chưa về.
        expect(tabs).toMatch(/async function loadTokenStats/);
        expect(handler).toMatch(/await loadTokenStats\(\)/);
    });
});

describe('chặn bấm dồn và không kẹt', () => {
    test('bỏ qua khi đang tải', () => {
        expect(handler).toMatch(/if \(reloadBtn\.disabled\) return;/);
    });

    test('có dấu hiệu ĐANG tải', () => {
        // Bấm mà không thấy gì đổi thì người dùng bấm tiếp.
        expect(handler).toMatch(/classList\.add\("fa-spin"\)/);
    });

    test('tắt cờ trong FINALLY, không phải sau try', () => {
        // Lỗi mạng mà không tắt thì nút quay mãi và không bấm lại được.
        const i = handler.indexOf('finally');
        expect(i).toBeGreaterThan(-1);
        const rest = handler.slice(i);
        expect(rest).toMatch(/classList\.remove\("fa-spin"\)/);
        expect(rest).toMatch(/reloadBtn\.disabled = false/);
    });
});
