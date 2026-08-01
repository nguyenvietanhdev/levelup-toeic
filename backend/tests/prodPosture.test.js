/**
 * Enforcement: NHỮNG THỨ CHỈ SAI Ở MÔI TRƯỜNG THẬT.
 *
 * Cả hai bất biến dưới đây đều KHÔNG thể lộ ra lúc dev, vì lúc dev
 * `NODE_ENV=development` luôn có trong `.env` nên mọi nhánh đều đi đúng hướng
 * mình muốn. Chúng chỉ sai khi biến đó THIẾU — đúng tình huống của một image
 * Docker không khai báo, hoặc một platform không tự tiêm.
 *
 * 1. Cổng `/api-docs` phải FAIL CLOSED.
 *    `NODE_ENV !== 'production'` là fail OPEN: thiếu biến → `'undefined' !==
 *    'production'` → true → Swagger UI công khai kèm bản đồ đầy đủ mọi endpoint,
 *    gồm cả nhóm admin, kèm sẵn client bấm thử.
 *
 * 2. Log lỗi phải có stack.
 *    Chặn stack khỏi RESPONSE là đúng. Chặn khỏi LOG là tự bịt mắt: sự cố
 *    production còn lại đúng một dòng message không có frame nào.
 *
 * Test thuần: đọc file nguồn, không nạp app, không DB, không HTTP.
 */
const fs = require('fs');
const path = require('path');

const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
const errorHandlerSrc = fs.readFileSync(
    path.join(__dirname, '..', 'middleware', 'errorHandler.js'), 'utf8'
);

describe('Tư thế production — thứ chỉ sai khi rời máy dev', () => {

    test('cổng /api-docs fail closed: thiếu NODE_ENV thì ĐÓNG', () => {
        // Phải loại dòng comment TRƯỚC khi tìm: comment giải thích cũng nhắc tên
        // biến, và `find(l => l.includes(...))` sẽ tóm trúng comment thay vì điều
        // kiện thật → test đo nhầm đối tượng. Đã dính đúng bẫy này hai lần.
        const gate = serverSrc.split('\n')
            .filter(l => !/^\s*\/\//.test(l))
            .find(l => l.includes('ENABLE_API_DOCS') && l.trim().startsWith('if ('));
        expect(gate).toBeDefined();
        // `!== 'production'` là fail open — thiếu biến thành mở.
        expect(gate).not.toMatch(/NODE_ENV\s*!==\s*['"]production['"]/);
        // Phải là opt-in tường minh: chỉ mở khi ĐÚNG là development, hoặc bật tay.
        expect(gate).toMatch(/NODE_ENV\s*===\s*['"]development['"]/);
    });

    test('Dockerfile khai báo NODE_ENV=production', () => {
        // Không phụ thuộc platform tự tiêm: Render KHÔNG tiêm cho Docker service,
        // Railway thì tuỳ builder. Thiếu nó còn kéo theo log rớt về mức debug và
        // morgan mất định dạng combined.
        expect(dockerfile).toMatch(/^ENV\s+NODE_ENV=production\s*$/m);
    });

    test('log lỗi luôn kèm stack, không phụ thuộc môi trường', () => {
        const logCall = errorHandlerSrc.slice(
            errorHandlerSrc.indexOf('logger.error'),
            errorHandlerSrc.indexOf('if (err.name')
        );
        expect(logCall).toMatch(/stack:/);
        expect(logCall).not.toMatch(/NODE_ENV/);
    });

    test('response VẪN không lộ stack ngoài development', () => {
        // Bất biến ngược lại, phải giữ: sửa mục trên không được kéo stack ra client.
        const resCall = errorHandlerSrc.slice(errorHandlerSrc.indexOf('res.status('));
        expect(resCall).toMatch(/NODE_ENV\s*===\s*['"]development['"]/);
        expect(resCall).toMatch(/stack:\s*err\.stack/);
    });

    test('self-check: bộ dò phân biệt được fail-open với fail-closed', () => {
        const open = "if (process.env.NODE_ENV !== 'production' || x) {";
        const closed = "if (process.env.NODE_ENV === 'development' || x) {";
        const isFailOpen = (s) => /NODE_ENV\s*!==\s*['"]production['"]/.test(s);
        expect(isFailOpen(open)).toBe(true);
        expect(isFailOpen(closed)).toBe(false);
    });
});
