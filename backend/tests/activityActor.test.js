/**
 * Nhật ký hoạt động phải ghi ĐÚNG người làm (SEC-be.vocab-004).
 *
 * Vì sao cần: `logActivity(type, action, data, admin = 'Admin')` — mặc định là
 * chuỗi 'Admin', và KHÔNG call site nào truyền tham số thứ tư. Hồi
 * `routes/vocabulary.js` còn để trần, một cú `DELETE /all` ẩn danh từ internet
 * cũng được ghi là "Admin đã xoá N từ". Người điều tra đọc bản ghi đó sẽ kết
 * luận là chính mình lỡ tay, hoặc tài khoản admin đã bị chiếm — cả hai đều sai.
 *
 * Log ghi sai thủ phạm tệ hơn không có log: nó tạo ra kết luận sai một cách tự
 * tin. Đó là thứ file này chốt, chứ không phải chuyện log có chạy hay không.
 *
 * Pure, no DB, no fs — module fs/promises được mock.
 */
jest.mock('fs/promises', () => ({ access: jest.fn(), readFile: jest.fn(), writeFile: jest.fn() }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

const fs = require('fs/promises');
const { logActivity, actorOf } = require('../utils/activityLogger');

/** Bản ghi vừa được ghi xuống (phần tử đầu vì logs.unshift). */
function lastWritten() {
    const [, json] = fs.writeFile.mock.calls[fs.writeFile.mock.calls.length - 1];
    return JSON.parse(json)[0];
}

beforeEach(() => {
    jest.clearAllMocks();
    fs.access.mockResolvedValue();   // file đã tồn tại → không tạo mới
    fs.readFile.mockResolvedValue('[]');
    fs.writeFile.mockResolvedValue();
});

describe('actorOf', () => {
    test('lấy id từ req.user', () => {
        expect(actorOf({ user: { id: '507f1f77bcf86cd799439011' } })).toBe('507f1f77bcf86cd799439011');
    });

    test('ObjectId → chuỗi, không để lọt object vào log', () => {
        const oid = { toString: () => '507f191e810c19729de860ea' };
        expect(actorOf({ user: { id: oid } })).toBe('507f191e810c19729de860ea');
    });

    test.each([
        ['không có user', {}],
        ['user rỗng', { user: {} }],
        ['req undefined', undefined],
    ])('%s → "system", KHÔNG phải "Admin"', (_label, req) => {
        // Đây là điểm mấu chốt: không quy được cho ai thì phải nói thế, chứ
        // không được đổ cho admin.
        expect(actorOf(req)).toBe('system');
    });
});

describe('logActivity — actor đi vào bản ghi', () => {
    test('truyền actor → ghi đúng actor đó', async () => {
        await logActivity('vocabulary', 'delete-all', { deleted: 7826 }, 'u-123');
        expect(lastWritten().admin).toBe('u-123');
    });

    test('KHÔNG truyền actor → "system"', async () => {
        await logActivity('vocabulary', 'delete-all', { deleted: 7826 });
        const rec = lastWritten();
        expect(rec.admin).toBe('system');
        expect(rec.admin).not.toBe('Admin'); // hồi quy về mặc định cũ
    });

    test('giữ tên field "admin" — dashboard đang đọc field này', async () => {
        await logActivity('vocabulary', 'add', { word: 'delegate' }, 'u-1');
        const rec = lastWritten();
        expect(Object.keys(rec).sort()).toEqual(['action', 'admin', 'data', 'id', 'timestamp', 'type']);
    });
});

describe('mọi call site trong domain vocabulary đều truyền actor', () => {
    const fsSync = jest.requireActual('fs');
    const path = require('path');
    const files = ['vocabularyController.js', 'vocabularyDedupController.js']
        .map(f => path.join(__dirname, '..', 'controllers', f));

    test('không còn lời gọi logActivity nào thiếu tham số thứ tư', () => {
        const bad = [];
        for (const f of files) {
            const src = fsSync.readFileSync(f, 'utf8');
            // Mỗi lời gọi logActivity(...) tới dấu ) đóng ở đầu dòng hoặc cuối câu.
            for (const m of src.matchAll(/logActivity\([\s\S]*?\);/g)) {
                if (!m[0].includes('actorOf(req)')) bad.push(path.basename(f) + ': ' + m[0].slice(0, 60));
            }
        }
        expect(bad).toEqual([]);
    });

    test('máy dò còn hoạt động', () => {
        const sample = "await activityLogger.logActivity('vocabulary', 'delete-all', { x: 1 });";
        expect([...sample.matchAll(/logActivity\([\s\S]*?\);/g)][0][0]).not.toContain('actorOf(req)');
    });
});
