/**
 * Lõi chấm điểm của chế độ Hội thoại.
 *
 * Hai kiểu sai đối lập nhau, và cái nào cũng phá tính năng:
 *
 *   · BỎ SÓT — người học dùng ĐÚNG từ ở dạng biến thể (studied, making) mà
 *     không được tính. Họ làm đúng nhưng máy bảo sai; mất niềm tin ngay.
 *   · CHO OAN — "cat" khớp vào "category", hoặc lượt của NPC cũng tính điểm.
 *     Điểm mất giá trị, và người học nhận ra là có thể lách.
 *
 * Test này chạy CẢ HAI chiều cho từng luật.
 */
const {
    normalize, hasHan, englishForms, usesWord, matchWords, collectUsed,
} = require('../utils/wordMatch');

describe('chuẩn hoá câu', () => {
    test('bỏ dấu câu, gom khoảng trắng', () => {
        expect(normalize('  Hello,   world!  ')).toBe('hello world');
    });

    test('GIỮ chữ có dấu tiếng Việt', () => {
        // `\w` trong JS không hiểu chữ có dấu — dùng nó là câu tiếng Việt biến
        // thành rỗng và không bao giờ khớp được gì.
        expect(normalize('Chào bạn!')).toBe('chào bạn');
    });

    test('giữ nguyên chữ Hán', () => {
        expect(normalize('你好，世界。')).toBe('你好 世界');
    });
});

describe('nhận diện tiếng Trung', () => {
    test('có chữ Hán', () => {
        expect(hasHan('你好')).toBe(true);
        expect(hasHan('hello 你好')).toBe(true);
    });

    test('không có', () => {
        expect(hasHan('hello')).toBe(false);
        expect(hasHan('')).toBe(false);
    });
});

describe('biến thể tiếng Anh — chống BỎ SÓT', () => {
    const cases = [
        ['study',  ['studies', 'studied', 'studying']],
        ['make',   ['makes', 'making']],
        ['stop',   ['stops', 'stopped', 'stopping']],
        ['happy',  ['happier', 'happiest']],
        ['use',    ['uses', 'used', 'using']],
        ['work',   ['works', 'worked', 'working']],
    ];

    test.each(cases)('%s sinh đủ dạng thường gặp', (word, forms) => {
        const got = englishForms(word);
        const thiếu = forms.filter((f) => !got.includes(f));
        expect(thiếu).toEqual([]);
    });

    test('KHÔNG xử lý được động từ BẤT QUY TẮC — giới hạn đã biết', () => {
        // go/went, make/made, buy/bought… không sinh ra bằng luật đuôi. Ghi lại
        // ở đây để người đọc sau biết đó là chỗ hụt CÓ Ý THỨC, không phải quên.
        //
        // Hệ quả: người học viết "I went home" mà từ mục tiêu là "go" thì không
        // được tính. Chấp nhận được vì hụt về phía KHÔNG CHO ĐIỂM — người học
        // dùng thêm một câu nữa là được; còn cho điểm oan thì mất giá trị hẳn.
        expect(englishForms('go')).not.toContain('went');
        expect(englishForms('make')).not.toContain('made');
    });

    test('cụm nhiều chữ KHÔNG chia đuôi', () => {
        // "look forward to" + "ed" là chuỗi vô nghĩa; sinh ra chỉ tổ khớp nhầm.
        const got = englishForms('look forward to');
        expect(got).toEqual(['look forward to']);
    });
});

describe('dùng từ tiếng Anh', () => {
    test('khớp dạng gốc', () => {
        expect(usesWord('I work every day', 'work')).toBe(true);
    });

    test('khớp dạng biến thể', () => {
        expect(usesWord('She studied all night', 'study')).toBe(true);
        expect(usesWord('He is making dinner', 'make')).toBe(true);
        expect(usesWord('They stopped the car', 'stop')).toBe(true);
    });

    test('KHÔNG khớp chuỗi con — chống CHO OAN', () => {
        // Đây là lỗi kinh điển: `includes('cat')` khớp luôn "category".
        expect(usesWord('This category is wrong', 'cat')).toBe(false);
        expect(usesWord('I go tomorrow', 'to')).toBe(false);
        expect(usesWord('understand', 'under')).toBe(false);
    });

    test('không phân biệt hoa thường', () => {
        expect(usesWord('WORK hard', 'work')).toBe(true);
    });

    test('dấu câu dính vào từ vẫn khớp', () => {
        // "work." và "work," là dạng rất hay gặp khi người học gõ.
        expect(usesWord('I love my work.', 'work')).toBe(true);
        expect(usesWord('Work, rest, play', 'work')).toBe(true);
    });

    test('cụm nhiều chữ khớp nguyên cụm', () => {
        expect(usesWord('I look forward to it', 'look forward to')).toBe(true);
        expect(usesWord('I look at it', 'look forward to')).toBe(false);
    });

    test('câu rỗng hoặc từ rỗng thì không khớp', () => {
        expect(usesWord('', 'work')).toBe(false);
        expect(usesWord('I work', '')).toBe(false);
    });
});

describe('dùng từ tiếng Trung', () => {
    test('khớp chuỗi con — tiếng Trung không có khoảng trắng', () => {
        expect(usesWord('我很高兴', '高兴')).toBe(true);
        expect(usesWord('晚上好', '晚上')).toBe(true);
    });

    test('không có thì không khớp', () => {
        expect(usesWord('我很好', '高兴')).toBe(false);
    });

    test('lang truyền tay được ưu tiên hơn tự đoán', () => {
        // Từ mục tiêu là chữ Latin nhưng ngữ cảnh là zh (pinyin chẳng hạn).
        expect(usesWord('wo hen gaoxing', 'gaoxing', 'zh')).toBe(true);
    });
});

describe('lọc nhiều từ cùng lúc', () => {
    const target = ['work', 'study', 'happy'];

    test('trả về đúng những từ đã dùng', () => {
        expect(matchWords('I studied and I am happy', target).sort())
            .toEqual(['happy', 'study']);
    });

    test('không dùng từ nào thì trả mảng rỗng', () => {
        expect(matchWords('hello there', target)).toEqual([]);
    });

    test('đầu vào hỏng thì trả rỗng, không ném lỗi', () => {
        expect(matchWords(null, target)).toEqual([]);
        expect(matchWords('hello', null)).toEqual([]);
    });
});

describe('gộp qua nhiều lượt — nguồn tính THƯỞNG', () => {
    const target = ['work', 'study', 'happy', 'money'];

    test('gộp không trùng lặp', () => {
        const turns = [
            { role: 'user', content: 'I work here' },
            { role: 'npc',  content: 'Do you study?' },
            { role: 'user', content: 'Yes I studied, and I work hard' },
        ];
        expect(collectUsed(turns, target).sort()).toEqual(['study', 'work']);
    });

    test('CHỈ tính lượt của người học, BỎ lượt NPC', () => {
        // Đây là lỗ hổng lớn nhất: AI thường tự dùng hết danh sách từ trong câu
        // của nó. Tính cả lượt NPC thì người học được điểm tối đa mà chưa gõ
        // chữ nào.
        const turns = [
            { role: 'npc', content: 'work study happy money' },
        ];
        expect(collectUsed(turns, target)).toEqual([]);
    });

    test('lượt hỏng không làm sập', () => {
        const turns = [null, { role: 'user' }, { role: 'user', content: 'work' }];
        expect(collectUsed(turns, target)).toEqual(['work']);
    });

    test('không có lượt nào thì rỗng', () => {
        expect(collectUsed([], target)).toEqual([]);
        expect(collectUsed(undefined, target)).toEqual([]);
    });
});
