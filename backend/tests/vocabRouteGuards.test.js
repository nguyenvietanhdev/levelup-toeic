/**
 * Test chốt guard cho router kho từ vựng dùng chung.
 *
 * Vì sao cần: `routes/vocabulary.js` từng import `protect` và chỉ gắn cho 3 route
 * `/favorites`, còn 11 route GHI thì để trần. Hậu quả không phải lý thuyết:
 *   - `DELETE /api/vocabulary/all` xoá sạch corpus bằng 1 request ẩn danh;
 *   - `POST /api/vocabulary/replace` xoá trước khi validate, nên body rác cũng xoá sạch;
 *   - `POST /api/vocabulary/` cho người lạ ghi `part`, mà admin panel render giá trị
 *     đó ra DOM → chạy script ngay trong phiên admin.
 * Ý định "chỉ admin" đã được ghi ở 4 chỗ (Swagger summary "(Admin)", `security: []`
 * chỉ gắn cho GET, JSDoc `@access Private/Admin`, bảng API-reference của panel) mà
 * router thì không thực hiện chỗ nào — nên chốt bằng test chứ không bằng trí nhớ.
 *
 * Test thuần cấu trúc: đọc router stack của Express, không DB, không HTTP.
 */
const router = require('../routes/vocabulary');

const MUTATING = ['post', 'put', 'patch', 'delete'];

/** Mọi route đã khai báo trên router → { path, method, guards: [tên middleware] }. */
function routes() {
    return router.stack
        .filter(layer => layer.route)
        .flatMap(layer => Object.keys(layer.route.methods)
            .filter(m => layer.route.methods[m])
            .map(method => ({
                path: layer.route.path,
                method,
                // Layer cuối là handler; các layer trước nó là guard.
                guards: layer.route.stack.slice(0, -1).map(l => l.name),
            })));
}

const mutations = () => routes().filter(r => MUTATING.includes(r.method));

// 11 route ghi vào kho dùng chung — phải là admin. `/favorites` KHÔNG nằm đây:
// đó là dữ liệu riêng của user, chỉ cần `protect`.
const ADMIN_ONLY = [
    ['post', '/'],
    ['post', '/upsert'],
    ['post', '/bulk'],
    ['post', '/replace'],
    ['post', '/switch/:filename'],
    ['post', '/remove-duplicates/:filename'],
    ['post', '/filter-delete'],
    ['delete', '/bulk'],
    ['delete', '/all'],
    ['put', '/:id'],
    ['delete', '/:id'],
];

describe('routes/vocabulary — guard trên đường ghi', () => {
    test.each(ADMIN_ONLY)('%s %s có protect + authorize', (method, path) => {
        const r = mutations().find(x => x.method === method && x.path === path);
        expect(r).toBeDefined();
        // `protect` là arrow gán vào const nên giữ tên; `authorize('admin')` trả về
        // hàm ẩn danh (name = '') → đếm số guard thay vì so tên cả hai.
        expect(r.guards[0]).toBe('protect');
        expect(r.guards.length).toBeGreaterThanOrEqual(2);
    });

    test('không còn route ghi nào thiếu protect', () => {
        const unguarded = mutations()
            .filter(r => r.guards[0] !== 'protect')
            .map(r => `${r.method.toUpperCase()} ${r.path}`);
        expect(unguarded).toEqual([]);
    });

    test('route đọc vẫn công khai — Swagger đánh dấu security: [] có chủ ý', () => {
        const publicGets = routes()
            .filter(r => r.method === 'get' && r.guards.length === 0)
            .map(r => r.path);
        // /favorites là GET có protect nên không nằm trong danh sách này.
        expect(publicGets).toEqual(expect.arrayContaining(['/', '/stats', '/parts', '/search', '/:id']));
        expect(publicGets).not.toContain('/favorites');
    });

    test('path chữ đứng trước /:id, nếu không "/:id" nuốt mất /bulk và /all', () => {
        const paths = routes().map(r => r.path);
        expect(paths.indexOf('/bulk')).toBeLessThan(paths.lastIndexOf('/:id'));
        expect(paths.indexOf('/all')).toBeLessThan(paths.lastIndexOf('/:id'));
        expect(paths.indexOf('/favorites')).toBeLessThan(paths.indexOf('/:id'));
    });
});
