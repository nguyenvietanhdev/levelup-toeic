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

const css = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin', 'css', 'dashboard.css'), 'utf8');

/** Thân handler của nút Tải lại. */
const handler = (() => {
    const i = tabs.indexOf('reloadBtn?.addEventListener');
    expect(i).toBeGreaterThan(-1);
    return tabs.slice(i, i + 1600);
})();

/** Thân hàm hiện dấu "đã tải lại". */
const marker = (() => {
    const i = tabs.indexOf('function markAiUsageUpdated');
    expect(i).toBeGreaterThan(-1);
    return tabs.slice(i, tabs.indexOf('\n}', i) + 2);
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

    test('lỗi được BẮT, không thoát sớm bỏ qua phần tắt cờ', () => {
        // Lỗi mạng mà không tắt cờ thì nút quay mãi và không bấm lại được.
        // Handler bắt lỗi vào biến rồi mới tắt cờ — thay cho `finally` vì còn
        // phải chờ đủ thời lượng quay tối thiểu trước khi tắt.
        expect(handler).toMatch(/catch \(e\)/);
        const iCatch = handler.indexOf('catch (e)');
        const rest = handler.slice(iCatch);
        expect(rest).toMatch(/classList\.remove\("fa-spin"\)/);
        expect(rest).toMatch(/reloadBtn\.disabled = false/);
    });

    test('KHÔNG có return/throw giữa catch và chỗ tắt cờ', () => {
        // Thoát sớm ở đó là nút kẹt vĩnh viễn — đúng lỗi cũ với hình dạng mới.
        const iCatch = handler.indexOf('catch (e)');
        const iOff = handler.indexOf('reloadBtn.disabled = false');
        const giua = handler.slice(iCatch, iOff);
        expect(giua).not.toMatch(/return/);
        expect(giua).not.toMatch(/throw/);
    });
});

describe('BIẾT ĐƯỢC là đã tải lại hay chưa', () => {
    test('quay TỐI THIỂU một khoảng, không chớp qua', () => {
        // API trả về trong ~50ms; vòng quay chớp nhanh hơn mắt kịp bắt nên admin
        // bấm xong không biết đã tải hay chưa.
        expect(handler).toMatch(/Date\.now\(\)/);
        expect(handler).toMatch(/setTimeout/);
        const m = handler.match(/(\d{3,4}) - \(Date\.now\(\) - t0\)/);
        expect(m).toBeTruthy();
        expect(Number(m[1])).toBeGreaterThanOrEqual(300);
    });

    test('chờ tối thiểu KHÔNG cộng thêm vào thời gian mạng', () => {
        // Phải trừ đi thời gian đã trôi, không phải sleep cứng sau khi tải xong.
        expect(handler).toMatch(/- \(Date\.now\(\) - t0\)/);
        expect(handler).toMatch(/if \(con > 0\)/);
    });

    test('có dấu vết ĐỌNG LẠI sau khi tải xong', () => {
        // Vòng quay biến mất ngay khi xong; nếu số liệu không đổi thì màn hình
        // trông y hệt lúc chưa bấm.
        expect(html).toMatch(/id="ai-usage-updated"/);
        expect(handler).toMatch(/markAiUsageUpdated\(/);
    });

    test('dấu tích nhường chỗ cho MỐC GIỜ', () => {
        // Dấu tích xác nhận HÀNH ĐỘNG vừa xảy ra; mốc giờ trả lời TRẠNG THÁI.
        // Giữ dấu tích mãi thì lần bấm sau không phân biệt được với lần trước.
        expect(marker).toMatch(/Đã tải lại/);
        expect(marker).toMatch(/Cập nhật \$\{gio\}/);
        expect(marker).toMatch(/setTimeout/);
    });

    test('LỖI hiện rõ, không im lặng như thành công', () => {
        expect(marker).toMatch(/is-error/);
        expect(marker).toMatch(/Tải lỗi/);
    });

    test('bấm liên tiếp không chồng hai bộ đếm', () => {
        // Không clear thì dấu tích của lần bấm mới bị timer cũ xoá sớm.
        expect(marker).toMatch(/clearTimeout/);
    });

    test('đổi khoảng ngày CŨNG hiện dấu', () => {
        // Không thì mốc giờ đứng im trong khi số liệu đã đổi — con số nói dối.
        // Neo vào chỗ GẮN listener, không phải lần xuất hiện đầu tiên của id —
        // `loadTokenStats` cũng đọc `ai-usage-days` và đứng trước trong file.
        // Regex thay vì so chuỗi cứng: khớp chuỗi cứng phụ thuộc thụt lề, đổi
        // format một lần là test đỏ oan.
        const m = tabs.match(
            /getElementById\("ai-usage-days"\)\s*\?\.addEventListener[\s\S]{0,500}/);
        expect(m).toBeTruthy();
        expect(m[0]).toMatch(/markAiUsageUpdated\(/);
    });

    test('trình đọc màn hình cũng nhận được thông báo', () => {
        expect(html).toMatch(/aria-live="polite"/);
    });
});

describe('trình bày', () => {
    test('có CSS cho ba trạng thái', () => {
        expect(css).toMatch(/\.ai-usage-updated\s*\{/);
        expect(css).toMatch(/\.ai-usage-updated\.is-ok/);
        expect(css).toMatch(/\.ai-usage-updated\.is-error/);
    });

    test('chiều rộng tối thiểu — chữ đổi không làm layout nhảy', () => {
        // "✓ Đã tải lại" ngắn hơn "Cập nhật 20:31:05"; thiếu min-width thì nút
        // bên cạnh nhảy chỗ mỗi 2 giây.
        const i = css.indexOf('.ai-usage-updated {');
        expect(css.slice(i, i + 200)).toMatch(/min-width/);
    });

    test('bump ?v= để trình duyệt không dùng bản cache cũ', () => {
        // Admin đã mở dashboard sẽ giữ tabs.js cũ trong cache và không thấy gì đổi.
        const dash = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'admin', 'dashboard.html'), 'utf8');
        const js = dash.match(/tabs\.js\?v=(\d+)/);
        const cssV = dash.match(/dashboard\.css\?v=(\d+)/);
        expect(Number(js[1])).toBeGreaterThanOrEqual(13);
        expect(Number(cssV[1])).toBeGreaterThanOrEqual(29);
    });
});
