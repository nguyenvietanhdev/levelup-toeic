/**
 * Vai của AI theo Part.
 *
 * Mock DB và lời gọi AI để kiểm các quy tắc: đề xuất chỉ là bản nháp (không lưu),
 * lưu vai AI không trùng, vai mới nhất là vai đang dùng, giới hạn số vai đã lưu,
 * vai riêng thắng vai AI, Part mất thì dọn vai, và đầu vào lạ bị từ chối.
 */
const store = { rows: [] };
const parts = { shared: false, mine: false };
const aiCalls = { n: 0 };
let tick = 0;
let idSeq = 0;

function matches(row, q) {
    return Object.entries(q).every(([k, v]) => {
        if (k === '_id' && v && typeof v === 'object' && v.$in) {
            return v.$in.map(String).includes(String(row._id));
        }
        if (v === null) return row[k] === null || row[k] === undefined;
        return row[k] === v;
    });
}

const byUpdatedDesc = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);

/** Chuỗi truy vấn giả: find(...).sort().skip().select().lean() / findOne(...).sort().lean() */
function query(rowsFn) {
    let sortFn = null;
    let skipN = 0;
    const api = {
        sort: (s) => { if (s && s.updatedAt === -1) sortFn = byUpdatedDesc; if (s && s.updatedAt === 1) sortFn = (a, b) => -byUpdatedDesc(a, b); return api; },
        skip: (n) => { skipN = n; return api; },
        select: () => api,
        lean: async () => {
            let rs = rowsFn();
            if (sortFn) rs = [...rs].sort(sortFn);
            return rs.slice(skipN);
        },
    };
    return api;
}

jest.mock('../models/AiRole', () => ({
    findOne: (q) => ({
        sort: (s) => {
            const rs = store.rows.filter((r) => matches(r, q)).sort(byUpdatedDesc);
            return { lean: async () => rs[0] || null };
        },
        lean: async () => store.rows.find((r) => matches(r, q)) || null,
    }),
    find: (q) => query(() => store.rows.filter((r) => matches(r, q)).map((r) => ({ ...r }))),
    create: async (doc) => {
        const dup = doc.origin === 'ai' && store.rows.find((r) => r.origin === 'ai'
            && r.source === doc.source && r.part === doc.part && r.lang === doc.lang && r.hash === doc.hash);
        if (dup) { const e = new Error('E11000 duplicate key'); e.code = 11000; throw e; }
        const row = { _id: `id${++idSeq}`, ...doc, updatedAt: ++tick };
        store.rows.push(row);
        return row;
    },
    updateOne: async (q, update, opts = {}) => {
        const hit = store.rows.find((r) => matches(r, q));
        if (hit) {
            const set = { ...(update.$set || {}) };
            if (set.updatedAt) set.updatedAt = ++tick;
            Object.assign(hit, set);
            if (!set.updatedAt && 'text' in set) hit.updatedAt = ++tick;
            return { modifiedCount: 1 };
        }
        if (opts.upsert) {
            store.rows.push({ _id: `id${++idSeq}`, ...q, ...(update.$setOnInsert || {}), ...(update.$set || {}), updatedAt: ++tick });
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
let nextText = 'A bank teller helping a customer open an account.';
jest.mock('../services/aiClient', () => ({
    textCompletion: jest.fn(async () => {
        aiCalls.n += 1;
        return { text: nextText, providerId: 'openai' };
    }),
}));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const roles = require('../services/aiRoles');

const KHOA = { source: '600words', part: 'BANKING', lang: 'en' };
const VAI_TAY = 'A strict auditor reviewing my ledger.';

beforeEach(() => {
    store.rows = [];
    parts.shared = true;
    parts.mine = false;
    aiCalls.n = 0;
    nextText = 'A bank teller helping a customer open an account.';
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

    test('hash không phân biệt hoa thường và khoảng trắng thừa', () => {
        expect(roles.hashVai('Bank Teller', 'A  bank teller.')).toBe(roles.hashVai('bank teller', 'a bank teller.'));
        expect(roles.hashVai('Bank Teller', 'A bank teller.')).not.toBe(roles.hashVai('Café Waiter', 'A bank teller.'));
    });

    test('AI trả TITLE và ROLE thì tách thành tiêu đề và mô tả', () => {
        const r = roles.tachKetQuaAI('TITLE: Barista at a café\nROLE: A café waiter taking a drink order.');
        expect(r).toEqual({ title: 'Barista at a café', text: 'A café waiter taking a drink order.' });
    });

    test('AI trả sai định dạng thì mô tả là cả câu, tiêu đề lấy 6 chữ đầu', () => {
        const r = roles.tachKetQuaAI('A café waiter taking a drink order from a friendly customer today.');
        expect(r.text).toMatch(/^A café waiter/);
        expect(r.title.split(' ').length).toBeLessThanOrEqual(6);
    });

    test('tiêu đề quá ngắn bị từ chối khi người dùng nhập', () => {
        expect(() => roles.chuanHoaTieuDe('x', 'A café waiter taking a drink order.')).toThrow(/ít nhất 2/);
    });
});

describe('đề xuất chỉ là bản nháp', () => {
    test('bấm đề xuất KHÔNG lưu gì vào DB', async () => {
        const r = await roles.deXuatVaiAI({ userId: 'u1', email: 'a@x', ...KHOA });
        expect(r).toMatchObject({ nguon: 'nhap' });
        expect(store.rows).toHaveLength(0);
    });

    test('mỗi lần đề xuất là một lần gọi AI và có thể khác nhau', async () => {
        nextText = 'A café waiter taking a drink order.';
        const a = await roles.deXuatVaiAI({ userId: 'u1', email: 'a@x', ...KHOA });
        nextText = 'A hotel receptionist checking a guest in.';
        const b = await roles.deXuatVaiAI({ userId: 'u1', email: 'a@x', ...KHOA });
        expect(aiCalls.n).toBe(2);
        expect(a.vai).not.toBe(b.vai);
    });

    test('Part đã mất thì không gọi AI', async () => {
        parts.shared = false;
        await expect(roles.deXuatVaiAI({ userId: 'u1', email: 'a@x', ...KHOA })).rejects.toThrow(/không còn trong kho/);
        expect(aiCalls.n).toBe(0);
    });
});

describe('lưu vai AI', () => {
    test('lưu một vai: thành vai đang dùng của Part', async () => {
        const r = await roles.luuVaiAI({ email: 'a@x', ...KHOA, text: 'A café waiter taking a drink order.' });
        expect(r).toMatchObject({ nguon: 'ai', trung: false });
        expect(store.rows).toHaveLength(1);
        const dung = await roles.layVai({ userId: 'u9', email: 'b@x', ...KHOA });
        expect(dung).toMatchObject({ nguon: 'ai', vai: 'A café waiter taking a drink order.' });
    });

    test('lưu trùng nội dung không tạo thêm bản', async () => {
        await roles.luuVaiAI({ email: 'a@x', ...KHOA, text: 'A café waiter taking a drink order.' });
        const lai = await roles.luuVaiAI({ email: 'a@x', ...KHOA, text: 'a  CAFÉ waiter taking a drink order.' });
        expect(lai.trung).toBe(true);
        expect(store.rows).toHaveLength(1);
    });

    test('mỗi lần lưu nội dung khác là một vai riêng, vai mới nhất đang dùng', async () => {
        await roles.luuVaiAI({ email: 'a@x', ...KHOA, text: 'A café waiter taking a drink order.' });
        await roles.luuVaiAI({ email: 'a@x', ...KHOA, text: 'A hotel receptionist checking a guest in.' });
        expect(store.rows).toHaveLength(2);
        const dung = await roles.layVai({ userId: 'u1', email: 'a@x', ...KHOA });
        expect(dung.vai).toBe('A hotel receptionist checking a guest in.');
    });

    test('lưu lại một vai cũ thì nó được đẩy lên thành vai đang dùng, không nhân bản', async () => {
        await roles.luuVaiAI({ email: 'a@x', ...KHOA, text: 'A café waiter taking a drink order.' });
        await roles.luuVaiAI({ email: 'a@x', ...KHOA, text: 'A hotel receptionist checking a guest in.' });
        await roles.luuVaiAI({ email: 'a@x', ...KHOA, text: 'A café waiter taking a drink order.' });
        expect(store.rows).toHaveLength(2);
        const dung = await roles.layVai({ userId: 'u1', email: 'a@x', ...KHOA });
        expect(dung.vai).toBe('A café waiter taking a drink order.');
    });

    test('mỗi Part giữ tối đa 10 vai đã lưu, bỏ bản cũ nhất', async () => {
        for (let i = 0; i < 12; i += 1) {
            await roles.luuVaiAI({ email: 'a@x', ...KHOA, text: `A distinct role number ${i} for this part.` });
        }
        expect(store.rows.filter((r) => r.origin === 'ai')).toHaveLength(roles.MAX_VAI_AI_DA_LUU);
        const dung = await roles.layVai({ userId: 'u1', email: 'a@x', ...KHOA });
        expect(dung.vai).toBe('A distinct role number 11 for this part.');
    });

    test('vai lưu ở Part này không làm đổi Part khác', async () => {
        await roles.luuVaiAI({ email: 'a@x', ...KHOA, text: 'A café waiter taking a drink order.' });
        await roles.luuVaiAI({ email: 'a@x', ...KHOA, part: 'HOTELS', text: 'A hotel receptionist checking a guest in.' });
        const bank = await roles.layVai({ userId: 'u1', email: 'a@x', ...KHOA });
        expect(bank.vai).toBe('A café waiter taking a drink order.');
    });

    test('lưu vai AI cũng bị kiểm độ dài', async () => {
        await expect(roles.luuVaiAI({ email: 'a@x', ...KHOA, text: 'ngắn' })).rejects.toThrow(/ít nhất 10/);
    });
});

describe('vai người dùng tự viết', () => {
    test('vai riêng thắng vai AI, và chỉ với đúng người đó', async () => {
        await roles.luuVaiAI({ email: 'a@x', ...KHOA, text: 'A café waiter taking a drink order.' });
        await roles.luuVaiNguoiDung({ userId: 'u1', email: 'a@x', ...KHOA, text: VAI_TAY });
        expect(await roles.layVai({ userId: 'u1', email: 'a@x', ...KHOA })).toMatchObject({ nguon: 'user', vai: VAI_TAY });
        expect(await roles.layVai({ userId: 'u2', email: 'b@x', ...KHOA })).toMatchObject({ nguon: 'ai' });
    });

    test('xoá vai riêng thì quay về vai AI đang dùng', async () => {
        await roles.luuVaiAI({ email: 'a@x', ...KHOA, text: 'A café waiter taking a drink order.' });
        await roles.luuVaiNguoiDung({ userId: 'u1', email: 'a@x', ...KHOA, text: VAI_TAY });
        await roles.xoaVaiNguoiDung({ userId: 'u1', ...KHOA });
        expect((await roles.layVai({ userId: 'u1', email: 'a@x', ...KHOA })).nguon).toBe('ai');
    });

    test('xoá vai riêng không xoá vai AI đã lưu', async () => {
        await roles.luuVaiAI({ email: 'a@x', ...KHOA, text: 'A café waiter taking a drink order.' });
        await roles.luuVaiNguoiDung({ userId: 'u1', email: 'a@x', ...KHOA, text: VAI_TAY });
        await roles.xoaVaiNguoiDung({ userId: 'u1', ...KHOA });
        expect(store.rows.some((r) => r.origin === 'ai')).toBe(true);
    });
});

describe('Part đã bị xoá khỏi kho', () => {
    test('layVai: Part mất → dọn mọi vai của Part đó và trả rỗng', async () => {
        await roles.luuVaiAI({ email: 'a@x', ...KHOA, text: 'A café waiter taking a drink order.' });
        parts.shared = false;
        const r = await roles.layVai({ userId: 'u1', email: 'a@x', ...KHOA });
        expect(r).toEqual({ title: '', vai: null, nguon: null });
        expect(store.rows.filter((x) => x.part === 'BANKING')).toHaveLength(0);
    });

    test('dọn đúng Part đó, không đụng Part khác', async () => {
        await roles.luuVaiAI({ email: 'a@x', ...KHOA, text: 'A café waiter taking a drink order.' });
        await roles.luuVaiAI({ email: 'a@x', ...KHOA, part: 'HOTELS', text: 'A hotel receptionist checking a guest in.' });
        parts.shared = false;
        await roles.layVai({ userId: 'u1', email: 'a@x', ...KHOA });
        expect(store.rows.map((x) => x.part)).toEqual(['HOTELS']);
    });

    test('kho riêng của người dùng vẫn giữ Part sống', async () => {
        parts.shared = false;
        parts.mine = true;
        const r = await roles.luuVaiNguoiDung({ userId: 'u1', email: 'a@x', ...KHOA, text: VAI_TAY });
        expect(r.nguon).toBe('user');
    });
});

describe('vai AI ngắn gọn để đỡ tốn token', () => {
    test('vai ngắn giữ nguyên', () => {
        expect(roles.rutGonVai('A café waiter taking a drink order.')).toBe('A café waiter taking a drink order.');
    });

    test('vai dài bị cắt dưới 120 ký tự, không đứt giữa chữ', () => {
        const dai = 'A friendly waiter at a neighborhood café-bar taking the drink order of an adult English learner who is deciding among beer, coffee, juice, milk, soda, tea, water, and wine today.';
        const r = roles.rutGonVai(dai);
        expect(r.length).toBeLessThanOrEqual(120);
        expect(dai.startsWith(r)).toBe(true);
        expect(r.endsWith(' ')).toBe(false);
    });

    test('yêu cầu AI xin vai ngắn và giới hạn số token đầu ra', async () => {
        const { textCompletion } = require('../services/aiClient');
        textCompletion.mockClear?.();
        await roles.deXuatVaiAI({ userId: 'u9', email: 'z@x', ...KHOA }).catch(() => {});
        const call = textCompletion.mock.calls[0]?.[0];
        // Hai dòng TITLE + ROLE: đủ 60 token, nhưng vẫn giới hạn chữ để đỡ tốn token.
        expect(call.maxTokens).toBeLessThanOrEqual(60);
        expect(call.messages[0].content).toMatch(/at most 15 words/);
        expect(call.messages[0].content).toMatch(/at most 6 words/);
    });
});
