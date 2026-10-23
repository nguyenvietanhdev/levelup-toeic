/**
 * Gợi ý dạng bài hợp bộ từ của Part (nhóm "Hợp bộ từ này").
 *
 * Chỗ dễ hỏng: AI bịa khoá không có trong kho (chip bấm vào server không nhận),
 * gọi AI mỗi lần mở màn (tốn token), và AI lỗi làm hỏng cả màn chọn.
 */
const mockText = jest.fn();
jest.mock('../services/aiClient', () => ({ textCompletion: (...a) => mockText(...a) }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const chuoi = (data) => ({ select: () => ({ limit: () => ({ lean: async () => data }) }) });
const mockShared = jest.fn();
const mockMine = jest.fn();
jest.mock('../models/Vocabulary', () => ({ find: (...a) => chuoi(mockShared(...a)) }));
jest.mock('../models/VocabularyZh', () => ({ find: (...a) => chuoi(mockShared(...a)) }));
jest.mock('../models/UserUpload', () => ({ find: (...a) => chuoi(mockMine(...a)), exists: jest.fn() }));

const mockFindOne = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../models/DangGoiY', () => ({
    findOne: (...a) => ({ lean: async () => mockFindOne(...a) }),
    updateOne: (...a) => mockUpdate(...a),
}));

const { goiYDang, tachKhoa } = require('../services/goiYDang');
const { NHOM_DANG_NGHE } = require('../services/listeningAi');

const HOI = { mode: 'listening', source: 'drink', part: 'Part 1', lang: 'en', email: 'a@b.c', userId: 'u1' };

beforeEach(() => {
    mockText.mockReset();
    mockFindOne.mockReset();
    mockUpdate.mockReset().mockResolvedValue({});
    mockShared.mockReset().mockReturnValue([{ en: 'bartender' }, { en: 'cocktail' }, { en: 'tip' }]);
    mockMine.mockReset().mockReturnValue([]);
});

describe('đọc câu trả lời của AI', () => {
    test('chỉ giữ khoá có trong kho, không trùng, tối đa 6', () => {
        const r = tachKhoa('- review\n- recipe, REVIEW, khong-co, speech, story, directions, news, podcast', NHOM_DANG_NGHE);
        expect(r).toEqual(['review', 'recipe', 'speech', 'story', 'directions', 'news']);
    });
});

describe('gợi ý dạng bài', () => {
    test('lần đầu: hỏi AI với bộ từ + kho của chế độ, lưu cache dùng chung (scope rỗng)', async () => {
        mockFindOne.mockReturnValue(null);
        mockText.mockResolvedValue({ text: 'review, recipe, speech, story' });
        const keys = await goiYDang(HOI);
        expect(keys).toEqual(['review', 'recipe', 'speech', 'story']);
        const call = mockText.mock.calls[0][0];
        expect(call.feature).toBe('dang-goi-y');
        expect(call.messages[0].content).toMatch(/airport: airport announcement/);
        expect(call.messages[1].content).toMatch(/bartender, cocktail, tip/);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ mode: 'listening', source: 'drink', part: 'Part 1', scope: '' }),
            { $set: { keys } }, { upsert: true });
    });

    test('đã có cache: KHÔNG gọi AI, và lọc bỏ khoá đã bị xoá khỏi kho', async () => {
        mockFindOne.mockReturnValue({ keys: ['review', 'da-bi-xoa', 'recipe', 'speech'] });
        const keys = await goiYDang(HOI);
        expect(keys).toEqual(['review', 'recipe', 'speech']);
        expect(mockText).not.toHaveBeenCalled();
    });

    test('bộ từ riêng (không có trong kho chung): cache theo email người dùng', async () => {
        mockShared.mockReturnValue([]);
        mockMine.mockReturnValue([{ en: 'nurse' }, { en: 'ward' }]);
        mockFindOne.mockReturnValue(null);
        mockText.mockResolvedValue({ text: 'lecture, instructions, training' });
        await goiYDang(HOI);
        expect(mockUpdate.mock.calls[0][0]).toMatchObject({ scope: 'a@b.c' });
    });

    test('AI lỗi → trả rỗng, không ném, không lưu', async () => {
        mockFindOne.mockReturnValue(null);
        mockText.mockRejectedValue(new Error('quota'));
        await expect(goiYDang(HOI)).resolves.toEqual([]);
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    test('AI trả quá ít khoá hợp lệ → trả về nhưng không lưu (lần sau hỏi lại)', async () => {
        mockFindOne.mockReturnValue(null);
        mockText.mockResolvedValue({ text: 'review, bia-hoi' });
        await expect(goiYDang(HOI)).resolves.toEqual(['review']);
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    test('chưa chọn đề/Part hoặc Part không có từ → rỗng, không gọi AI', async () => {
        await expect(goiYDang({ ...HOI, source: '' })).resolves.toEqual([]);
        mockShared.mockReturnValue([]);
        await expect(goiYDang(HOI)).resolves.toEqual([]);
        expect(mockText).not.toHaveBeenCalled();
    });

    test('chế độ lạ → lỗi 400', async () => {
        await expect(goiYDang({ ...HOI, mode: 'hack' })).rejects.toMatchObject({ status: 400 });
    });

    test('route đăng ký và chỉ cho người đã đăng nhập', () => {
        const { readFileSync } = require('node:fs');
        const { join } = require('node:path');
        const server = readFileSync(join(__dirname, '..', 'server.js'), 'utf8');
        const route = readFileSync(join(__dirname, '..', 'routes', 'dangGoiY.js'), 'utf8');
        expect(server).toMatch(/app\.use\('\/api\/dang-goi-y', require\('\.\/routes\/dangGoiY'\)\)/);
        expect(route).toMatch(/router\.use\(protect\)/);
    });
});

describe('chỉ thị "hợp bối cảnh" có trong prompt cả bốn chế độ', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const doc = (f) => readFileSync(join(__dirname, '..', 'services', f), 'utf8');
    test.each(['readingGrader.js', 'translationGrader.js', 'listeningAi.js'])('%s dùng CHI_THI_HOP_BOI_CANH', (f) => {
        expect(doc(f)).toMatch(/push\(.*CHI_THI_HOP_BOI_CANH|\[CHI_THI_HOP_BOI_CANH\]/);
    });
    test('Viết: đề theo dạng bài đặt vào bối cảnh hợp chủ đề', () => {
        expect(doc('essayGrader.js')).toMatch(/fits both this kind of text and the topic naturally/);
    });
});
