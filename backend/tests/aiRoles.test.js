/**
 * Vai của AI theo Part.
 *
 * Mock DB và lời gọi AI để kiểm các quy tắc quan trọng: vai AI dùng chung không
 * gọi AI lần hai, vai riêng thắng vai AI, Part mất thì dọn vai, và đầu vào lạ
 * bị từ chối.
 */
const store = { rows: [] };
const parts = { shared: false, mine: false };
const aiCalls = { n: 0 };

function matches(row, q) {
    return Object.entries(q).every(([k, v]) => {
        if (v === null) return row[k] === null || row[k] === undefined;
        return row[k] === v;
    });
}

jest.mock('../models/AiRole', () => ({
    findOne: (q) => ({ lean: async () => store.rows.find((r) => matches(r, q)) || null }),
    updateOne: async (q, update, opts = {}) => {
        const hit = store.rows.find((r) => matches(r, q));
        if (hit) { Object.assign(hit, update.$set || {}); return { modifiedCount: 1 }; }
        if (opts.upsert) {
            store.rows.push({ ...q, ...(update.$setOnInsert || {}), ...(update.$set || {}) });
            return { upsertedCount: 1 };
        }
        return { modifiedCount: 0 };
    },
    deleteMany: async (q) => {
        const before = store.rows.length;
        store.rows = store.rows.filter((r) => !matches(r, q));
        return { deletedCount: before - store.rows.length };
    },
    deleteOne: async (q) => {
        const i = store.rows.findIndex((r) => matches(r, q));
        if (i < 0) return { deletedCount: 0 };
        store.rows.splice(i, 1);
        return { deletedCount: 1 };
    },
}));

const chain = (rowsFn) => ({
    select: () => chain(rowsFn),
    limit: () => chain(rowsFn),
    lean: async () => rowsFn(),
});
jest.mock('../models/Vocabulary', () => ({
    exists: async () => parts.shared,
    find: () => chain(() => [{ en: 'ledger' }, { en: 'budget' }]),
}));
jest.mock('../models/VocabularyZh', () => ({ exists: async () => false, find: () => chain(() => []) }));
jest.mock('../models/UserUpload', () => ({ exists: async () => parts.mine }));
jest.mock('../services/aiClient', () => ({
    textCompletion: jest.fn(async () => {
        aiCalls.n += 1;
        return { text: 'You are a bank teller helping a customer open an account.', providerId: 'openai' };
    }),
}));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const roles = require('../services/aiRoles');

const KHOA = { source: '600words', part: 'BANKING', lang: 'en' };

beforeEach(() => {
    store.rows = [];
    parts.shared = true;
    parts.mine = false;
    aiCalls.n = 0;
});

describe('chuẩn hoá đầu vào', () => {
    test('vai quá ngắn hoặc quá dài bị từ chối', () => {
        expect(() => roles.chuanHoaVaiText('ngắn')).toThrow(/ít nhất 10/);
        expect(() => roles.chuanHoaVaiText('x'.repeat(401))).toThrow(/dài quá 400/);
    });

    test('bỏ ký tự điều khiển và gom khoảng trắng', () => {
        expect(roles.chuanHoaVaiText('  A  bank\u0007 teller\n talking  ')).toBe('A bank teller talking');
    });

    test('thiếu source hoặc part thì từ chối', () => {
        expect(() => roles.chuanHoaKhoa({ source: '', part: 'X' })).toThrow(/Thiếu/);
        expect(() => roles.chuanHoaKhoa({ source: 's', part: '' })).toThrow(/Thiếu/);
    });

    test('source luôn chữ thường, lang lạ về en', () => {
        expect(roles.chuanHoaKhoa({ source: '600WORDS', part: 'B', lang: 'fr' })).toEqual({ source: '600words', part: 'B', lang: 'en' });
    });
});

describe('vai AI dùng chung', () => {
    test('lần đầu gọi AI, các lần sau dùng lại — không tốn token', async () => {
        const a = await roles.deXuatVaiAI({ userId: 'u1', email: 'a@x', ...KHOA });
        const b = await roles.deXuatVaiAI({ userId: 'u2', email: 'b@x', ...KHOA });
        expect(aiCalls.n).toBe(1);
        expect(a.daCo).toBe(false);
        expect(b.daCo).toBe(true);
        expect(b.vai).toBe(a.vai);
    });

    test('vai AI có cùng khoá source+part thì không lẫn sang đề khác', async () => {
        await roles.deXuatVaiAI({ userId: 'u1', email: 'a@x', ...KHOA });
        await roles.deXuatVaiAI({ userId: 'u1', email: 'a@x', ...KHOA, source: 'ets2024' });
        expect(aiCalls.n).toBe(2);
    });
});

describe('vai người dùng tự viết', () => {
    test('vai riêng thắng vai AI, và chỉ với đúng người đó', async () => {
        await roles.deXuatVaiAI({ userId: 'u1', email: 'a@x', ...KHOA });
        await roles.luuVaiNguoiDung({ userId: 'u1', email: 'a@x', ...KHOA, text: 'A strict auditor reviewing my ledger.' });
        const cua1 = await roles.layVai({ userId: 'u1', email: 'a@x', ...KHOA });
        const cua2 = await roles.layVai({ userId: 'u2', email: 'b@x', ...KHOA });
        expect(cua1).toMatchObject({ nguon: 'user' });
        expect(cua2).toMatchObject({ nguon: 'ai' });
    });

    test('xoá vai riêng thì quay về vai AI', async () => {
        await roles.deXuatVaiAI({ userId: 'u1', email: 'a@x', ...KHOA });
        await roles.luuVaiNguoiDung({ userId: 'u1', email: 'a@x', ...KHOA, text: 'A strict auditor reviewing my ledger.' });
        await roles.xoaVaiNguoiDung({ userId: 'u1', ...KHOA });
        expect((await roles.layVai({ userId: 'u1', email: 'a@x', ...KHOA })).nguon).toBe('ai');
    });

    test('xoá vai riêng không xoá vai AI dùng chung', async () => {
        await roles.deXuatVaiAI({ userId: 'u1', email: 'a@x', ...KHOA });
        await roles.luuVaiNguoiDung({ userId: 'u1', email: 'a@x', ...KHOA, text: 'A strict auditor reviewing my ledger.' });
        await roles.xoaVaiNguoiDung({ userId: 'u1', ...KHOA });
        expect(store.rows.some((r) => r.origin === 'ai')).toBe(true);
    });
});

describe('Part đã bị xoá khỏi kho', () => {
    test('layVai: Part mất → dọn mọi vai của Part đó và trả rỗng', async () => {
        await roles.deXuatVaiAI({ userId: 'u1', email: 'a@x', ...KHOA });
        parts.shared = false;
        const r = await roles.layVai({ userId: 'u1', email: 'a@x', ...KHOA });
        expect(r).toEqual({ vai: null, nguon: null });
        expect(store.rows.filter((x) => x.part === 'BANKING')).toHaveLength(0);
    });

    test('dọn đúng Part đó, không đụng Part khác', async () => {
        await roles.deXuatVaiAI({ userId: 'u1', email: 'a@x', ...KHOA });
        await roles.deXuatVaiAI({ userId: 'u1', email: 'a@x', ...KHOA, part: 'HOTELS' });
        parts.shared = false;
        await roles.layVai({ userId: 'u1', email: 'a@x', ...KHOA });
        expect(store.rows.map((x) => x.part)).toEqual(['HOTELS']);
    });

    test('không gọi AI cho Part đã mất', async () => {
        parts.shared = false;
        await expect(roles.deXuatVaiAI({ userId: 'u1', email: 'a@x', ...KHOA })).rejects.toThrow(/không còn trong kho/);
        expect(aiCalls.n).toBe(0);
    });

    test('kho riêng của người dùng vẫn giữ Part sống', async () => {
        parts.shared = false;
        parts.mine = true;
        const r = await roles.luuVaiNguoiDung({ userId: 'u1', email: 'a@x', ...KHOA, text: 'A strict auditor reviewing my ledger.' });
        expect(r.nguon).toBe('user');
    });
});
