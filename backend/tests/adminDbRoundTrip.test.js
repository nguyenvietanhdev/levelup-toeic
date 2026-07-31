/**
 * Sao lưu rồi phục hồi phải ra đúng dữ liệu cũ (ROADMAP mục 7).
 *
 * Vì sao cần: hợp đồng định dạng của `/admin/db/import` được định nghĩa DUY NHẤT
 * bởi thứ `/admin/db/export` in ra. Không có test nào nối hai đầu, nên một thay
 * đổi "vô hại" ở một bên làm hỏng phục hồi mà cách duy nhất để phát hiện là...
 * cần phục hồi. Đó là lúc tệ nhất để biết.
 *
 * Test dựng một `mongoose.connection.db` giả thay vì chạy Mongo thật: rủi ro ở
 * đây là ĐỊNH DẠNG (EJSON canonical giữ được ObjectId/Date không, cấu trúc
 * {collections:{...}} có khớp không), chứ không phải driver. Nói rõ để không ai
 * đọc test này rồi tưởng nó chứng minh cả tính atomic hay quyền truy cập —
 * quyền đã có routeGuards.test.js lo.
 */
const { ObjectId } = require('mongodb');

jest.mock('mongoose', () => ({ connection: { db: null } }));
jest.mock('../middleware/auth', () => ({
    protect: (req, res, next) => next(),
    authorize: () => (req, res, next) => next(),
}));
jest.mock('../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

const mongoose = require('mongoose');
const router = require('../routes/adminDb');

/** Handler cuối của một route (bỏ qua các middleware phía trước). */
function handlerFor(method, path) {
    const layer = router.stack.find(
        l => l.route && l.route.path === path && l.route.methods[method],
    );
    if (!layer) throw new Error(`không thấy route ${method} ${path}`);
    return layer.route.stack[layer.route.stack.length - 1].handle;
}

/** DB giả: đủ các phương thức mà export/import dùng. */
function fakeDb(data) {
    return {
        databaseName: 'testdb',
        listCollections: () => ({
            toArray: async () => Object.keys(data).map(name => ({ name })),
        }),
        collection: (name) => ({
            find: () => ({ toArray: async () => data[name] || [] }),
            countDocuments: async () => (data[name] || []).length,
            deleteMany: async () => {
                const n = (data[name] || []).length;
                data[name] = [];
                return { deletedCount: n };
            },
            insertMany: async (docs) => {
                data[name] = (data[name] || []).concat(docs);
                return { insertedCount: docs.length };
            },
            bulkWrite: async (ops) => {
                let upsertedCount = 0, modifiedCount = 0;
                data[name] = data[name] || [];
                for (const op of ops) {
                    const doc = op.replaceOne.replacement;
                    const i = data[name].findIndex(d => String(d._id) === String(doc._id));
                    if (i >= 0) { data[name][i] = doc; modifiedCount++; }
                    else { data[name].push(doc); upsertedCount++; }
                }
                return { upsertedCount, modifiedCount };
            },
        }),
    };
}

function mockRes() {
    return {
        statusCode: 200, body: null, sent: null, headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
        send(s) { this.sent = s; return this; },
    };
}

const OID = new ObjectId('507f1f77bcf86cd799439011');
const WHEN = new Date('2026-01-15T08:30:00.000Z');

/** Bộ dữ liệu mẫu có đủ kiểu mà JSON thường sẽ làm hỏng. */
const seed = () => ({
    users: [{ _id: OID, email: 'a@b.c', createdAt: WHEN }],
    vocabulary: [
        { _id: new ObjectId('507f191e810c19729de860ea'), en: 'delegate', part: 'V' },
        { _id: new ObjectId('507f191e810c19729de860eb'), en: 'audit', part: 'N' },
    ],
    'system.indexes': [{ _id: 'phai-bi-bo-qua' }],
});

async function exportAll(data) {
    mongoose.connection.db = fakeDb(data);
    const res = mockRes();
    await handlerFor('get', '/export')({ query: {} }, res);
    return res;
}

async function importInto(data, raw, query) {
    mongoose.connection.db = fakeDb(data);
    const res = mockRes();
    await handlerFor('post', '/import')({ body: raw, query }, res);
    return res;
}

describe('export → import: dữ liệu quay về nguyên vẹn', () => {
    test('export ra EJSON canonical, bỏ collection system.*', async () => {
        const res = await exportAll(seed());
        const parsed = JSON.parse(res.sent);

        expect(Object.keys(parsed.collections).sort()).toEqual(['users', 'vocabulary']);
        expect(parsed._meta.db).toBe('testdb');
        // Canonical: ObjectId và Date giữ nguyên kiểu, không tụt về chuỗi.
        expect(parsed.collections.users[0]._id).toEqual({ $oid: OID.toHexString() });
        expect(parsed.collections.users[0].createdAt.$date).toBeDefined();
        expect(res.headers['Content-Disposition']).toMatch(/attachment; filename="backup-/);
    });

    test('replace + confirm: nạp lại vào DB rỗng ra đúng dữ liệu, đúng KIỂU', async () => {
        const exported = (await exportAll(seed())).sent;

        const target = { users: [], vocabulary: [] };
        const res = await importInto(target, exported, { mode: 'replace', confirm: 'true' });

        expect(res.body.success).toBe(true);
        expect(res.body.dryRun).toBeUndefined();
        expect(target.users).toHaveLength(1);
        expect(target.vocabulary).toHaveLength(2);
        // Đây là điều JSON thường KHÔNG làm được và là lý do dùng EJSON.
        expect(target.users[0]._id).toBeInstanceOf(ObjectId);
        expect(target.users[0]._id.toHexString()).toBe(OID.toHexString());
        expect(target.users[0].createdAt).toBeInstanceOf(Date);
        expect(target.users[0].createdAt.getTime()).toBe(WHEN.getTime());
    });

    test('merge: khớp theo _id, không nhân bản', async () => {
        const exported = (await exportAll(seed())).sent;

        const target = { users: [{ _id: OID, email: 'cu@b.c' }], vocabulary: [] };
        await importInto(target, exported, { mode: 'merge', confirm: 'true' });

        expect(target.users).toHaveLength(1);
        expect(target.users[0].email).toBe('a@b.c');
    });

    test('import bỏ qua system.* dù file có', async () => {
        const raw = JSON.stringify({ collections: { 'system.indexes': [{ _id: 'x' }] } });
        const target = { 'system.indexes': [] };
        const res = await importInto(target, raw, { mode: 'replace', confirm: 'true' });
        expect(res.body.report).toEqual([]);
        expect(target['system.indexes']).toEqual([]);
    });
});

describe('chạy thử là mặc định (SEC-be.admin-api-002)', () => {
    test('KHÔNG có confirm → không xoá gì, trả về kế hoạch', async () => {
        const exported = (await exportAll(seed())).sent;

        const target = { users: [{ _id: OID, email: 'giu-nguyen@b.c' }], vocabulary: [{ _id: 1 }] };
        const res = await importInto(target, exported, { mode: 'replace' });

        expect(res.body.dryRun).toBe(true);
        // Chốt quan trọng nhất của cả file.
        expect(target.users).toHaveLength(1);
        expect(target.users[0].email).toBe('giu-nguyen@b.c');
        expect(target.vocabulary).toHaveLength(1);
    });

    test('kế hoạch nói rõ sẽ xoá bao nhiêu, ghi bao nhiêu, và cảnh báo users', async () => {
        const exported = (await exportAll(seed())).sent;
        const target = { users: [{ _id: 1 }, { _id: 2 }], vocabulary: [] };
        const res = await importInto(target, exported, { mode: 'replace' });

        const users = res.body.plan.find(p => p.collection === 'users');
        expect(users).toEqual({
            collection: 'users', willClear: 2, willWrite: 1, destructionProtected: true,
        });
        const vocab = res.body.plan.find(p => p.collection === 'vocabulary');
        expect(vocab.destructionProtected).toBe(false);
    });

    test('merge chạy thử báo willClear = 0 — merge không xoá', async () => {
        const exported = (await exportAll(seed())).sent;
        const target = { users: [{ _id: 1 }], vocabulary: [] };
        const res = await importInto(target, exported, { mode: 'merge' });
        expect(res.body.plan.every(p => p.willClear === 0)).toBe(true);
    });

    test('confirm phải đúng chuỗi "true", không nhận giá trị mơ hồ', async () => {
        const exported = (await exportAll(seed())).sent;
        for (const confirm of ['1', 'yes', 'True', '']) {
            const target = { users: [{ _id: 9 }], vocabulary: [] };
            const res = await importInto(target, exported, { mode: 'replace', confirm });
            expect(res.body.dryRun).toBe(true);
            expect(target.users).toHaveLength(1);
        }
    });
});

describe('body hỏng thì không đụng dữ liệu', () => {
    test.each([
        ['rỗng', '   '],
        ['không phải JSON', '{ hỏng'],
        ['là mảng chứ không phải object', '[]'],
    ])('%s → 400, DB nguyên vẹn', async (_label, raw) => {
        const target = { users: [{ _id: 1 }] };
        const res = await importInto(target, raw, { mode: 'replace', confirm: 'true' });
        expect(res.statusCode).toBe(400);
        expect(target.users).toHaveLength(1);
    });
});
