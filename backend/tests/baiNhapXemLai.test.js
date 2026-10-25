/**
 * Bài làm dở (Viết/Dịch) và Nộp lại bài đã sửa để AI xem lại.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Client tự tạo bài nháp với đề tuỳ ý (đề phải do server ghi lúc sinh).
 *   2. Lỗi lưu nháp làm hỏng việc lấy đề.
 *   3. Nộp lại bài y nguyên / bài trống vẫn gọi AI → tốn token vô ích.
 *   4. AI bỏ sót một lỗi → bị coi là "đã sửa".
 *   5. Hai lần bấm song song vượt trần 3 lượt xem lại.
 *   6. Xem lại cộng XP / trả điểm → nộp đi nộp lại để cày.
 */
const mockNhap = { updateOne: jest.fn(), findOneAndUpdate: jest.fn(), findOne: jest.fn(), deleteOne: jest.fn() };
jest.mock('../models/BaiNhap', () => mockNhap);
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const { chatCompletion } = require('../config/openai');

const { luuDe, luuNoiDung, xoaNhap } = require('../services/baiNhap');
const { xemLaiBai, chuanHoaKetQua, khongDoi, MAX_XEM_LAI } = require('../services/xemLaiBai');
const { taoXemLai } = require('../controllers/xemLaiController');
const { readFileSync } = require('fs');
const { join } = require('path');

beforeEach(() => jest.clearAllMocks());

describe('bài nháp', () => {
    test('lưu đề: upsert theo (người, chế độ, ngôn ngữ), xoá phần gõ cũ', async () => {
        mockNhap.findOneAndUpdate.mockResolvedValue({});
        await luuDe('u1', 'viet', 'en', { prompt: 'p' });
        expect(mockNhap.findOneAndUpdate).toHaveBeenCalledWith(
            { userId: 'u1', mode: 'viet', lang: 'en' },
            { $set: { de: { prompt: 'p' }, noiDung: '', an: null } },
            expect.objectContaining({ upsert: true }),
        );
    });

    test('lỗi DB khi lưu đề → không ném (không chặn việc trả đề)', async () => {
        mockNhap.findOneAndUpdate.mockRejectedValue(new Error('db'));
        await expect(luuDe('u1', 'viet', 'en', { prompt: 'p' })).resolves.toBeUndefined();
    });

    test('lưu phần gõ CHỈ cập nhật bài nháp đang có và CÙNG ĐỀ (không upsert), cắt độ dài', async () => {
        mockNhap.updateOne.mockResolvedValue({ matchedCount: 0 });
        expect(await luuNoiDung('u1', 'dich', 'en', 'x'.repeat(30000), 'Đoạn văn A')).toBe(false);
        const [q, set, opt] = mockNhap.updateOne.mock.calls[0];
        // Đề khác (tab cũ, máy khác) → không khớp → không ghi đè bài nháp của đề mới.
        expect(q).toEqual({ userId: 'u1', mode: 'dich', lang: 'en', 'de.passage': 'Đoạn văn A' });
        expect(set.$set.noiDung).toHaveLength(20000);
        expect(opt).toBeUndefined();
    });

    test('không gửi đề kèm theo → không lưu (không đoán bài nháp nào)', async () => {
        expect(await luuNoiDung('u1', 'viet', 'en', 'abc')).toBe(false);
        expect(mockNhap.updateOne).not.toHaveBeenCalled();
        mockNhap.updateOne.mockResolvedValue({ matchedCount: 1 });
        expect(await luuNoiDung('u1', 'viet', 'en', 'abc', 'Đề A')).toBe(true);
        expect(mockNhap.updateOne.mock.calls[0][0]).toMatchObject({ 'de.prompt': 'Đề A' });
    });

    test('chế độ lạ bị bỏ qua', async () => {
        await luuDe('u1', 'hack', 'en', {});
        await xoaNhap('u1', 'hack', 'en');
        expect(mockNhap.findOneAndUpdate).not.toHaveBeenCalled();
        expect(mockNhap.deleteOne).not.toHaveBeenCalled();
    });

    test('controller: lấy đề thì lưu nháp, chấm xong thì xoá nháp (cả Viết lẫn Dịch)', () => {
        const viet = readFileSync(join(__dirname, '..', 'controllers', 'essayController.js'), 'utf8');
        const dich = readFileSync(join(__dirname, '..', 'controllers', 'translationController.js'), 'utf8');
        expect(viet).toMatch(/await luuDe\(req\.user\.id, 'viet', lang, data\);/);
        expect(viet).toMatch(/await xoaNhap\(req\.user\.id, 'viet', lang\);/);
        expect(dich).toMatch(/await luuDe\(req\.user\.id, 'dich', lang, data\);/);
        expect(dich).toMatch(/await xoaNhap\(req\.user\.id, 'dich', lang\);/);
        // Route nháp không có đường nào cho client đặt `de`.
        const route = readFileSync(join(__dirname, '..', 'routes', 'baiNhap.js'), 'utf8');
        expect(route).not.toMatch(/luuDe/);
    });
});

describe('xem lại bài đã sửa', () => {
    test('bài y nguyên (chỉ khác khoảng trắng) hoặc trống → KHÔNG gọi AI', async () => {
        expect(khongDoi('I  go\nhome', 'I go home')).toBe(true);
        expect((await xemLaiBai({ goc: 'I go home', sua: 'I go  home' })).ma).toBe('khong-doi');
        expect((await xemLaiBai({ goc: 'a', sua: '   ' })).ma).toBe('trong');
        expect(chatCompletion).not.toHaveBeenCalled();
    });

    test('lỗi AI bỏ sót → chưa sửa; số thứ tự lạ/trùng bị bỏ; trạng thái lạ → chưa sửa', () => {
        const r = chuanHoaKetQua({
            old: [
                { n: 1, status: 'da-sua', note: 'ok' },
                { n: 1, status: 'chua-sua' },  // trùng → bỏ
                { n: 9, status: 'da-sua' },    // ngoài phạm vi → bỏ
                { n: 3, status: 'hoan-hao' },  // lạ → chua-sua
            ],
            new: [{ quote: 'x', issue: 'mới', fix: 'y', type: 'Tense', level: 'style' }, { quote: 'z' }],
        }, 3);
        expect(r.loiCu.map((l) => l.trangThai)).toEqual(['da-sua', 'chua-sua', 'chua-sua']);
        expect(r.soDaSua).toBe(1);
        expect(r.loiMoi).toEqual([{ quote: 'x', issue: 'mới', fix: 'y', type: 'tense', muc: 'nen' }]);
    });

    test('gọi AI rẻ: không điểm, giới hạn token, nhãn tính năng riêng', async () => {
        chatCompletion.mockResolvedValue({ success: true, content: '{"old":[{"n":1,"status":"da-sua"}],"new":[]}' });
        const r = await xemLaiBai({ goc: 'I goes', sua: 'I go', loi: [{ quote: 'I goes', issue: 'sai', fix: 'I go' }], kieu: 'viet' });
        expect(r.success).toBe(true);
        const [messages, opt] = chatCompletion.mock.calls[0];
        expect(opt).toMatchObject({ maxTokens: 700, feature: 'essay-recheck' });
        expect(messages[0].content).toMatch(/Do NOT give scores\./);
        expect(messages[1].content).toMatch(/1\. "I goes" — sai \(suggested: "I go"\)/);
    });
});

describe('controller xem lại', () => {
    const tao = (doc, ghi = { modifiedCount: 1 }) => {
        const Model = {
            findOne: jest.fn(() => ({ select: () => ({ lean: async () => doc }) })),
            updateOne: jest.fn(async () => ghi),
        };
        return { Model, h: taoXemLai({ Model, kieu: 'viet', truongBai: 'essay', truongLoi: 'issues' }) };
    };
    const goi = async (h, body) => {
        const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
        await h({ params: { id: '507f1f77bcf86cd799439011' }, user: { id: 'u1' }, body }, res, (e) => { throw e; });
        return res;
    };

    test('hết 3 lượt → 429, không gọi AI', async () => {
        const { h } = tao({ _id: 'b', essay: 'x', issues: [], xemLai: Array(MAX_XEM_LAI).fill({ noiDung: 'x' }) });
        const res = await goi(h, { noiDung: 'y' });
        expect(res.status).toHaveBeenCalledWith(429);
        expect(chatCompletion).not.toHaveBeenCalled();
    });

    test('so với LẦN XEM LẠI GẦN NHẤT; ghi có điều kiện chưa đủ lượt; trả conLai, không XP/điểm', async () => {
        chatCompletion.mockResolvedValue({ success: true, content: '{"old":[],"new":[]}' });
        const { Model, h } = tao({ _id: 'b', essay: 'v0', issues: [], xemLai: [{ noiDung: 'v1' }] });
        const trung = await goi(h, { noiDung: 'v1' });
        expect(trung.status).toHaveBeenCalledWith(400);   // y nguyên lần trước
        const res = await goi(h, { noiDung: 'v2' });
        const [q, upd] = Model.updateOne.mock.calls[0];
        expect(q).toMatchObject({ [`xemLai.${MAX_XEM_LAI - 1}`]: { $exists: false } });
        expect(upd.$push.xemLai.noiDung).toBe('v2');
        const data = res.json.mock.calls[0][0].data;
        expect(data).toMatchObject({ lan: 2, conLai: 1 });
        expect(data).not.toHaveProperty('reward');
        expect(data).not.toHaveProperty('overall');
    });

    test('bấm song song (điều kiện ghi không khớp) → 429', async () => {
        chatCompletion.mockResolvedValue({ success: true, content: '{"old":[],"new":[]}' });
        const { h } = tao({ _id: 'b', essay: 'v0', issues: [], xemLai: [] }, { modifiedCount: 0 });
        const res = await goi(h, { noiDung: 'v1' });
        expect(res.status).toHaveBeenCalledWith(429);
    });
});

describe('bài nháp Đọc / Nghe', () => {
    const { chiemDeDoc, KHOA_DE } = require('../services/baiNhap');

    test('mỗi chế độ nhận ra bài bằng khoá riêng (Đọc, Nghe dùng mã bài duy nhất)', () => {
        expect(KHOA_DE).toEqual({ viet: 'de.prompt', dich: 'de.passage', doc: 'de.readingId', nghe: 'de.id' });
    });

    test('lấy lại đề Đọc: chiếm (xoá) bài nháp, chỉ trả đáp án ẩn; mã rỗng/không phải chuỗi → null', async () => {
        mockNhap.findOneAndDelete = jest.fn(() => ({ select: () => ({ lean: async () => ({ an: { questions: [1] } }) }) }));
        expect(await chiemDeDoc('u1', 'r-1')).toEqual({ questions: [1] });
        expect(mockNhap.findOneAndDelete).toHaveBeenCalledWith({ userId: 'u1', mode: 'doc', 'de.readingId': 'r-1' });
        expect(await chiemDeDoc('u1', { $ne: '' })).toBeNull();
        expect(await chiemDeDoc('u1', '')).toBeNull();
    });

    test('Nghe: bắt đầu thì lưu nháp KHÔNG kèm lời thoại; nộp thì xoá nháp', () => {
        const src = readFileSync(join(__dirname, '..', 'controllers', 'listeningController.js'), 'utf8');
        const de = src.slice(src.indexOf('const de = {'), src.indexOf('};', src.indexOf('const de = {')));
        expect(de).not.toMatch(/passage/);
        expect(src).toMatch(/await luuDe\(userId, 'nghe', lang, de\);/);
        expect(src).toMatch(/await xoaNhap\(userId, 'nghe', phien\.lang === 'zh' \? 'zh' : 'en'\);/);
    });
});
