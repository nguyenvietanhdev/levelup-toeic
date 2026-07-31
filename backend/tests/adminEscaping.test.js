/**
 * Test cho `esc()` của admin panel + chốt các chỗ hiển thị dữ liệu người dùng.
 *
 * Vì sao cần: panel dựng bảng bằng nối chuỗi rồi gán `innerHTML`, và ba trường
 * mà NGƯỜI DÙNG tự viết đều chảy vào đó — từ vựng họ upload (`source`,
 * `contentPreview`) và tên hiển thị (`username`). Đường ghi là tính năng hợp lệ,
 * đã guard đủ 3 lớp (`POST /api/upload/vocabulary`), nên **không có cách vá phía
 * server**: escape ở chỗ hiển thị là biện pháp duy nhất. Xem SEC-admin.tabs-001.
 *
 * Admin panel là script cổ điển trong thẻ <script>, không có module system, nên
 * test nạp mã nguồn rồi eval trong một scope riêng để lấy `esc` ra.
 */
const fs = require('fs');
const path = require('path');

const ADMIN_JS = path.join(__dirname, '..', 'public', 'admin', 'js');

/** Lấy `esc` ra khỏi core/utils.js (script trình duyệt, không export gì). */
function loadEsc() {
    const src = fs.readFileSync(path.join(ADMIN_JS, 'core', 'utils.js'), 'utf8');
    // `document` được stub vì file có hàm đụng DOM ở tầm module-eval là không có,
    // nhưng cứ cấp sẵn để eval không phụ thuộc môi trường.
    // eslint-disable-next-line no-new-func
    return new Function('document', `${src}; return esc;`)(undefined);
}

const esc = loadEsc();

describe('esc() — escape trước khi nội suy vào HTML', () => {
    test('escape đủ 5 ký tự có nghĩa trong HTML', () => {
        expect(esc('&')).toBe('&amp;');
        expect(esc('<')).toBe('&lt;');
        expect(esc('>')).toBe('&gt;');
        expect(esc('"')).toBe('&quot;');
        expect(esc("'")).toBe('&#39;');
    });

    test('vô hiệu hoá thẻ HTML — không còn dấu ngoặc nhọn nào lọt qua', () => {
        const out = esc('<img src=x onerror=alert(1)>');
        expect(out).not.toMatch(/[<>]/);
        expect(out).toContain('&lt;img');
    });

    test('thoát khỏi thuộc tính nháy kép là bất khả — title="..." an toàn', () => {
        expect(esc('a" onmouseover="x')).not.toMatch(/"/);
    });

    test('escape `&` trước, không tạo entity kép', () => {
        // Nếu thay '<' trước rồi mới thay '&' thì '&lt;' sẽ thành '&amp;lt;'.
        expect(esc('&lt;')).toBe('&amp;lt;');
        expect(esc('a & b')).toBe('a &amp; b');
    });

    test('null/undefined/số → chuỗi, không ném lỗi', () => {
        expect(esc(null)).toBe('');
        expect(esc(undefined)).toBe('');
        expect(esc(0)).toBe('0');
        expect(esc(12)).toBe('12');
    });

    test('chuỗi thường không bị đổi', () => {
        expect(esc('delegate')).toBe('delegate');
        expect(esc('ETS24T10-P5')).toBe('ETS24T10-P5');
    });
});

describe('tabs.js — dữ liệu người dùng phải đi qua esc()', () => {
    const tabs = fs.readFileSync(path.join(ADMIN_JS, 'core', 'tabs.js'), 'utf8');

    // Ba trường người dùng tự viết, đã truy được đường đi trong SEC-admin.tabs-001.
    /**
     * Bắt `${ … field … }` mà KHÔNG mở đầu bằng `esc(`.
     *
     * `[^${}]` giới hạn ở interpolation TRONG CÙNG — cố ý. Một ternary bọc ngoài
     * như `${u.displayName || u.username ? `<div>${esc(...)}</div>` : ""}` dùng
     * trường đó làm *điều kiện* chứ không render nó; giá trị thật nằm ở
     * interpolation lồng bên trong và đã được kiểm riêng. Nếu không giới hạn,
     * test sẽ báo động giả ở mọi ternary.
     */
    const unescaped = (field) => new RegExp(
        '\\$\\{(?!esc\\()[^${}]*\\b' + field.replace('.', '\\.') + '\\b[^${}]*\\}', 'g',
    );

    test.each([
        ['u.source', 'từ vựng upload — tên bộ đề do user đặt'],
        ['u.email', 'email đăng ký'],
        ['u.username', 'tên hiển thị do user đặt'],
        ['u.displayName', 'tên hiển thị do user đặt'],
    ])('%s luôn được bọc esc() khi nội suy', (field) => {
        expect(tabs.match(unescaped(field)) || []).toEqual([]);
    });

    test('contentPreview (chính là các từ user upload) không lọt thô vào markup', () => {
        expect(tabs.match(unescaped('contentPreview')) || []).toEqual([]);
    });

    test('máy dò còn hoạt động — bắt được một chuỗi chưa escape cố tình dựng ra', () => {
        // Nếu regex hỏng, mọi test trên sẽ xanh một cách vô nghĩa.
        const fake = 'tbody.innerHTML = `<td>${u.email}</td>`;';
        expect(fake.match(unescaped('u.email'))).not.toBeNull();
    });

    test.each([
        ['t.displayName', 'tên đề — admin đặt, lưu trong DB'],
        ['n.title', 'tiêu đề thông báo'],
        ['n.body', 'nội dung thông báo'],
        ['a.name', 'tên thành tích'],
        ['m.provider', 'nhà cung cấp AI'],
    ])('%s cũng phải qua esc()', (field) => {
        expect(tabs.match(unescaped(field)) || []).toEqual([]);
    });
});

describe('showToast — hàm được gọi nhiều nhất trong panel, không được là sink HTML', () => {
    const fs = require('fs');
    const path = require('path');
    const ADMIN_JS = path.join(__dirname, '..', 'public', 'admin', 'js');
    const vocab = fs.readFileSync(path.join(ADMIN_JS, 'features', 'vocab', 'vocab.js'), 'utf8');

    test('dựng nội dung toast bằng textContent, không phải innerHTML', () => {
        // 157 call site, phần lớn nhét thẳng err.message từ server hoặc tên do
        // người dùng đặt. Đổi ở đây miễn nhiễm tất cả; để innerHTML thì mỗi call
        // site là một sink và không ai đi bọc đủ 157 chỗ.
        const body = vocab.slice(vocab.indexOf('function showToast'));
        const decl = body.slice(0, body.indexOf('toast.style.cssText'));
        expect(decl).toMatch(/toast\.textContent\s*=\s*message/);
        expect(decl).not.toMatch(/toast\.innerHTML\s*=\s*message/);
    });

    test('không call site nào truyền markup — cơ sở để dùng textContent', () => {
        const withMarkup = [];
        for (const dir of ['core', 'features']) {
            const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
                const full = path.join(d, e.name);
                if (e.isDirectory()) return e.name !== 'vendor' && walk(full);
                if (!e.name.endsWith('.js')) return;
                const src = fs.readFileSync(full, 'utf8');
                for (const m of src.matchAll(/showToast\(([\s\S]{0,160}?)\);/g)) {
                    if (/<[a-zA-Z/]/.test(m[1])) withMarkup.push(path.basename(full));
                }
            });
            walk(path.join(ADMIN_JS, dir));
        }
        expect(withMarkup).toEqual([]);
    });
});
