/**
 * Kho từ SONG NGỮ.
 *
 * Hai chỗ dễ hỏng nhất, và cả hai đều hỏng IM LẶNG:
 *
 *   1. Đổi hình sai mặt → loa đọc 你好 bằng giọng Anh, nghe không ra chữ nào.
 *   2. Từ song ngữ lẫn vào danh sách ôn từ sai của hai kho cũ, vì
 *      `WrongWord.langFilter` phân loại bản ghi cũ bằng regex chữ Hán.
 */
const { doiHinh, doiHinhNhieu } = require('../services/vocabBiMapper');
const WrongWord = require('../models/WrongWord');

const MAU = {
    _id: 'x1',
    zh: '你好', en: 'hello', vn: 'Xin chào',
    hienThi: 'zh',
    phoneticZh: 'nǐ hǎo', phoneticEn: '/həˈloʊ/',
    exampleZh: '你好，很高兴认识你。', exampleEn: 'Hello, nice to meet you.',
    exampleVn: 'Xin chào, rất vui được gặp bạn.',
    examplePhoneticZh: 'nǐ hǎo, hěn gāoxìng rènshi nǐ.',
    examplePhoneticEn: '/həˈloʊ naɪs tə miːt juː/',
    part: 'Chào hỏi', source: 'song_ngu',
};

describe('đổi hình về dạng 16 chế độ đã hiểu', () => {
    test('`en` mang TỪ PHẢI NHỚ, không phải chữ tiếng Anh', () => {
        // `word.en` là khoá chính xuyên hệ thống (`wordPk`, `WrongWord.en`,
        // `modeStats`). Đặt chữ tiếng Anh vào đó thì khi học mặt Hán, từ sai
        // lưu lại là "hello" — mở ra ôn thấy từ khác hẳn thứ vừa học.
        expect(doiHinh(MAU).en).toBe('你好');
    });

    test('mặt kia nằm ở `doiChieu`, không đè lên ô đã có nghĩa', () => {
        expect(doiHinh(MAU).doiChieu).toBe('hello');
    });

    test('`vn` giữ nguyên — đây là ĐÁP ÁN của 13/16 chế độ', () => {
        expect(doiHinh(MAU).vn).toBe('Xin chào');
    });

    test('phiên âm đi theo ĐÚNG mặt đang hiện', () => {
        // Hiện pinyin cạnh từ tiếng Anh (hoặc ngược lại) là vô nghĩa.
        expect(doiHinh(MAU).phonetic).toBe('nǐ hǎo');
        expect(doiHinh({ ...MAU, hienThi: 'en' }).phonetic).toBe('/həˈloʊ/');
    });

    test('câu ví dụ cùng mặt với từ', () => {
        // Khác mặt thì loa đọc câu bằng giọng sai.
        expect(doiHinh(MAU).example).toBe('你好，很高兴认识你。');
        expect(doiHinh({ ...MAU, hienThi: 'en' }).example).toBe('Hello, nice to meet you.');
    });

    test('phiên âm câu ví dụ cũng đi theo mặt', () => {
        expect(doiHinh(MAU).examplePhonetic).toBe('nǐ hǎo, hěn gāoxìng rènshi nǐ.');
        expect(doiHinh({ ...MAU, hienThi: 'en' }).examplePhonetic)
            .toBe('/həˈloʊ naɪs tə miːt juː/');
    });

    test('nói rõ GIỌNG ĐỌC, không để client đoán', () => {
        // `ttsLang()` ở client là nhị phân zh/en dựa trên `vocabLang`, mà kho
        // song ngữ không có giá trị `vocabLang` riêng — không nói rõ thì nó
        // đọc 你好 bằng giọng Anh.
        expect(doiHinh(MAU).ttsLang).toBe('zh-CN');
        expect(doiHinh({ ...MAU, hienThi: 'en' }).ttsLang).toBe('en-US');
    });

    test('mặt `en`: `en` mang chữ tiếng Anh, `doiChieu` mang chữ Hán', () => {
        const d = doiHinh({ ...MAU, hienThi: 'en' });
        expect(d.en).toBe('hello');
        expect(d.doiChieu).toBe('你好');
    });

    test('thiếu `hienThi` thì mặc định mặt Hán', () => {
        const { hienThi, ...khongCo } = MAU;
        expect(doiHinh(khongCo).en).toBe('你好');
    });

    test('có cờ `songNgu` để client khỏi phải đoán', () => {
        expect(doiHinh(MAU).songNgu).toBe(true);
    });

    test('nhận cả document Mongoose lẫn object thuần', () => {
        const gia = { ...MAU, toObject: () => MAU };
        expect(doiHinh(gia).en).toBe('你好');
    });

    test('`null` không làm vỡ', () => {
        expect(doiHinh(null)).toBeNull();
        expect(doiHinhNhieu(null)).toEqual([]);
        expect(doiHinhNhieu([MAU, null]).length).toBe(1);
    });
});

describe('từ song ngữ KHÔNG lẫn vào hai kho cũ', () => {
    test('lọc `bi` khớp chính xác, không đoán bằng chữ Hán', () => {
        expect(WrongWord.langFilter('bi')).toEqual({ lang: 'bi' });
    });

    test('lọc `zh` loại hẳn `bi` ra', () => {
        // Không loại thì từ song ngữ mặt Hán lọt vào danh sách ôn tiếng Trung —
        // mở ra thấy từ của bộ khác hẳn.
        const f = JSON.stringify(WrongWord.langFilter('zh'));
        expect(f).toContain('"$ne":"bi"');
    });

    test('lọc `en` cũng loại `bi` ra', () => {
        // Mặt Latin của từ song ngữ trông y hệt từ tiếng Anh.
        const f = JSON.stringify(WrongWord.langFilter('en'));
        expect(f).toContain('"$ne":"bi"');
    });

    test('vẫn đoán được bản ghi CŨ thiếu `lang`', () => {
        // Dữ liệu có trước khi trường `lang` tồn tại vẫn phải phân loại đúng —
        // thêm `bi` không được phá thứ đang chạy.
        const f = JSON.stringify(WrongWord.langFilter('zh'));
        expect(f).toContain('$exists');
        expect(f).toContain('$regex');
    });

    test('enum nhận `bi`', () => {
        // Mongoose `strict` chặn giá trị ngoài enum — quên mở rộng thì mọi từ
        // sai của kho song ngữ bị từ chối lúc lưu.
        const enums = WrongWord.schema.path('lang').enumValues;
        expect(enums).toContain('bi');
        expect(enums).toContain('en');
        expect(enums).toContain('zh');
    });
});

describe('schema kho song ngữ', () => {
    const VocabularyBi = require('../models/VocabularyBi');

    test('ba ngôn ngữ đều BẮT BUỘC', () => {
        // `vn` bắt buộc vì nó là đáp án, không phải chú thích.
        for (const f of ['zh', 'en', 'vn']) {
            expect(VocabularyBi.schema.path(f).isRequired).toBe(true);
        }
    });

    test('phiên âm TÁCH ĐÔI theo ngôn ngữ', () => {
        // Một bản ghi có hai từ cần đọc — dùng chung một ô `phonetic` thì hiện
        // pinyin cạnh từ tiếng Anh.
        expect(VocabularyBi.schema.path('phoneticZh')).toBeDefined();
        expect(VocabularyBi.schema.path('phoneticEn')).toBeDefined();
        expect(VocabularyBi.schema.path('phonetic')).toBeUndefined();
    });

    test('nằm ở collection RIÊNG, không đụng hai kho cũ', () => {
        expect(VocabularyBi.collection.name).toBe('vocabularies_bi');
    });

    test('chống nạp trùng theo (source + zh)', () => {
        // Unique theo `zh` trần là chặn nhầm: cùng một chữ Hán có thể ở hai bộ
        // khác nhau với nghĩa khác nhau.
        const idx = VocabularyBi.schema.indexes();
        const u = idx.find(([, o]) => o && o.unique);
        expect(u).toBeDefined();
        expect(u[0]).toEqual({ source: 1, zh: 1 });
    });

    test('KHÔNG khai index thừa cho upload cá nhân', () => {
        // Kho này nạp tay, toàn bộ public — không có owner, scope, TTL.
        // `vocabularies_en` khai 9 index và trả giá bằng 5,8 MB index trên
        // 1,8 MB data. M0 chật RAM hơn chật đĩa.
        const khoa = VocabularyBi.schema.indexes().flatMap(([k]) => Object.keys(k));
        for (const thua of ['ownerId', 'ownerEmail', 'uploadBatchId', 'expiresAt', 'scope']) {
            expect(khoa).not.toContain(thua);
        }
    });
});
