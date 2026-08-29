/**
 * Phiên âm câu: cache phải BAO GỒM kho song ngữ.
 *
 * Kho song ngữ ôm cả hai ngôn ngữ trong một bản ghi nên dùng tên trường khác
 * (`exampleEn` / `examplePhoneticEn`). Controller chỉ biết hai kho cũ thì hỏng
 * đúng hai đường một lúc: tra cache không bao giờ trúng, mà ghi cache cũng
 * không trúng bản ghi nào — mỗi lần hiện thẻ song ngữ là một lần gọi AI tính
 * tiền, lặp lại vô hạn.
 */
jest.mock('../models/Vocabulary');
jest.mock('../models/VocabularyZh');
jest.mock('../models/VocabularyBi');
jest.mock('../services/sentencePhonetic', () => ({
    layPhienAmCau: jest.fn(),
    coChuHan: (t) => /[\u4e00-\u9fff]/.test(String(t || '')),
}));

const Vocabulary = require('../models/Vocabulary');
const VocabularyZh = require('../models/VocabularyZh');
const VocabularyBi = require('../models/VocabularyBi');
const { layPhienAmCau } = require('../services/sentencePhonetic');
const ctrl = require('../controllers/phoneticController');

/** `findOne(...).select(...).lean()` trả về `kq`. */
const stubTim = (Kho, kq) => {
    Kho.findOne.mockReturnValue({
        select: () => ({ lean: () => Promise.resolve(kq) }),
    });
};

const dungRes = () => {
    const res = {};
    res.json = jest.fn().mockReturnValue(res);
    res.status = jest.fn().mockReturnValue(res);
    return res;
};

beforeEach(() => {
    jest.clearAllMocks();
    for (const K of [Vocabulary, VocabularyZh, VocabularyBi]) {
        stubTim(K, null);
        K.updateMany = jest.fn().mockResolvedValue({});
    }
    layPhienAmCau.mockResolvedValue({ success: true, phonetic: 'AI-MOI' });
});

describe('tra cache ở kho song ngữ', () => {
    test('câu tiếng Anh có sẵn `examplePhoneticEn` → KHÔNG gọi AI', async () => {
        stubTim(VocabularyBi, { examplePhoneticEn: 'njuː ɪmˈplɔɪiːz' });
        const res = dungRes();
        await ctrl.sentence({ query: { text: 'New employees attend.' }, user: {} }, res, jest.fn());

        expect(layPhienAmCau).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: { phonetic: 'njuː ɪmˈplɔɪiːz', cached: true },
        });
    });

    test('tra bằng `exampleEn`, không phải `example`', async () => {
        // Kho song ngữ không có trường `example`; tra sai tên là luôn rỗng.
        await ctrl.sentence({ query: { text: 'New employees attend.' }, user: {} }, dungRes(), jest.fn());
        expect(VocabularyBi.findOne).toHaveBeenCalledWith({ exampleEn: 'New employees attend.' });
    });

    test('câu tiếng TRUNG tra bằng `exampleZh`', async () => {
        stubTim(VocabularyBi, { examplePhoneticZh: 'Duìbùqǐ' });
        const res = dungRes();
        await ctrl.sentence({ query: { text: '对不起。' }, user: {} }, res, jest.fn());

        expect(VocabularyBi.findOne).toHaveBeenCalledWith({ exampleZh: '对不起。' });
        expect(layPhienAmCau).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: { phonetic: 'Duìbùqǐ', cached: true },
        });
    });

    test('kho CŨ vẫn được tra trước như thường', async () => {
        stubTim(Vocabulary, { examplePhonetic: 'CU' });
        const res = dungRes();
        await ctrl.sentence({ query: { text: 'New employees attend.' }, user: {} }, res, jest.fn());

        expect(layPhienAmCau).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            success: true, data: { phonetic: 'CU', cached: true },
        });
    });
});

describe('ghi cache vào kho song ngữ', () => {
    test('câu tiếng Anh ghi cả kho Anh lẫn kho song ngữ', async () => {
        await ctrl.sentence({ query: { text: 'New employees attend.' }, user: {} }, dungRes(), jest.fn());

        expect(Vocabulary.updateMany).toHaveBeenCalledWith(
            { example: 'New employees attend.' },
            { $set: { examplePhonetic: 'AI-MOI' } },
        );
        expect(VocabularyBi.updateMany).toHaveBeenCalledWith(
            { exampleEn: 'New employees attend.' },
            { $set: { examplePhoneticEn: 'AI-MOI' } },
        );
    });

    test('câu tiếng Trung ghi kho Trung lẫn ô `-Zh` của kho song ngữ', async () => {
        await ctrl.sentence({ query: { text: '对不起。' }, user: {} }, dungRes(), jest.fn());

        expect(VocabularyZh.updateMany).toHaveBeenCalledWith(
            { example: '对不起。' }, { $set: { examplePhonetic: 'AI-MOI' } },
        );
        expect(VocabularyBi.updateMany).toHaveBeenCalledWith(
            { exampleZh: '对不起。' }, { $set: { examplePhoneticZh: 'AI-MOI' } },
        );
        // KHÔNG được đụng kho tiếng Anh với câu chữ Hán.
        expect(Vocabulary.updateMany).not.toHaveBeenCalled();
    });

    test('AI hỏng thì trả rỗng và KHÔNG ghi cache', async () => {
        // Ghi '' vào cache là câu đó vĩnh viễn không có phiên âm, kể cả khi AI
        // đã sống lại — không có gì xoá nó đi.
        layPhienAmCau.mockResolvedValue({ success: false, error: 'quota' });
        const res = dungRes();
        await ctrl.sentence({ query: { text: 'New employees attend.' }, user: {} }, res, jest.fn());

        expect(res.json).toHaveBeenCalledWith({ success: true, data: { phonetic: '' } });
        expect(VocabularyBi.updateMany).not.toHaveBeenCalled();
        // 200 chứ KHÔNG 5xx: đây là thông tin phụ trợ, đẩy lỗi đỏ lên console
        // cho thứ không ảnh hưởng bài học là báo động giả.
        expect(res.status).not.toHaveBeenCalled();
    });

    test('thiếu `text` thì trả 400', async () => {
        const res = dungRes();
        await ctrl.sentence({ query: {}, user: {} }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(layPhienAmCau).not.toHaveBeenCalled();
    });
});

describe('chuỗi đồng nghĩa cũng được cache', () => {
    test('có sẵn `synonymsPhoneticEn` → KHÔNG gọi AI', async () => {
        // Cùng endpoint phục vụ cả câu ví dụ lẫn đồng nghĩa; client chỉ gửi
        // đoạn chữ nên server phải tra cả hai loại ô.
        stubTim(VocabularyBi, { synonymsPhoneticEn: 'haɪ, ˈhaʊdi' });
        const res = dungRes();
        await ctrl.sentence({ query: { text: 'hi, howdy' }, user: {} }, res, jest.fn());

        expect(layPhienAmCau).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            success: true, data: { phonetic: 'haɪ, ˈhaʊdi', cached: true },
        });
    });

    test('ghi cache vào ô đồng nghĩa của cả hai kho', async () => {
        await ctrl.sentence({ query: { text: 'hi, howdy' }, user: {} }, dungRes(), jest.fn());

        expect(Vocabulary.updateMany).toHaveBeenCalledWith(
            { synonyms: 'hi, howdy' }, { $set: { synonymsPhonetic: 'AI-MOI' } },
        );
        expect(VocabularyBi.updateMany).toHaveBeenCalledWith(
            { synonymsEn: 'hi, howdy' }, { $set: { synonymsPhoneticEn: 'AI-MOI' } },
        );
    });

    test('đồng nghĩa tiếng Trung dùng ô `-Zh`', async () => {
        await ctrl.sentence({ query: { text: '您好' }, user: {} }, dungRes(), jest.fn());

        expect(VocabularyBi.updateMany).toHaveBeenCalledWith(
            { synonymsZh: '您好' }, { $set: { synonymsPhoneticZh: 'AI-MOI' } },
        );
        expect(VocabularyZh.updateMany).toHaveBeenCalledWith(
            { synonyms: '您好' }, { $set: { synonymsPhonetic: 'AI-MOI' } },
        );
    });
});
