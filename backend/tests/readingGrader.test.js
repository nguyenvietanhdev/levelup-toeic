/**
 * Đọc hiểu TOEIC Part 7 — sinh đề và chấm.
 *
 * Test GỌI HÀM THẬT với `chatCompletion` giả.
 *
 * Chỗ dễ hỏng nhất KHÔNG phải logic chấm (so đáp án thì khó sai) mà là:
 *   1. Đáp án lọt về client — người dùng mở DevTools thấy hết, chế độ vô dụng.
 *   2. Câu hỏi hỏng lọt qua (thiếu lựa chọn, `answer: "E"`) — người học bấm mãi
 *      không đúng được và tưởng mình sai.
 *   3. Đề không bị xoá sau khi chấm — nộp lại lần hai ăn thưởng lần nữa.
 */
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const { chatCompletion } = require('../config/openai');

const {
    generateReading, gradeReading, donCauHoi, mucKho, chuanHoaDang, nhanDang,
    DANG_BAI, CAU_HOI_THEO_MUC,
} = require('../services/readingGrader');

function aiTraVe(content) {
    chatCompletion.mockResolvedValueOnce({ success: true, content });
}

function promptHeThong() {
    const [messages] = chatCompletion.mock.calls.at(-1);
    return messages.find((m) => m.role === 'system').content;
}

/** Một câu hỏi hợp lệ tối thiểu. */
const CAU = (n = 1) => ({
    question: `Question ${n}?`,
    options: ['A one', 'B two', 'C three', 'D four'],
    answer: 'B',
    explain: 'Vì đoạn hai nói vậy.',
});

const BAI_OK = (soCau = 3) => JSON.stringify({
    title: 'Office Notice',
    passage: 'The office will be closed on Monday for maintenance.',
    questions: Array.from({ length: soCau }, (_, i) => CAU(i + 1)),
});

beforeEach(() => chatCompletion.mockReset());

describe('lọc câu hỏi hỏng', () => {
    test('nhận câu đầy đủ', () => {
        expect(donCauHoi(CAU())).toMatchObject({ answer: 'B' });
    });

    test('bỏ câu THIẾU lựa chọn', () => {
        // Ba lựa chọn thì không còn là câu Part 7, và bố cục hiển thị vỡ.
        expect(donCauHoi({ ...CAU(), options: ['a', 'b', 'c'] })).toBeNull();
    });

    test('bỏ câu có lựa chọn RỖNG', () => {
        expect(donCauHoi({ ...CAU(), options: ['a', '', 'c', 'd'] })).toBeNull();
    });

    test('bỏ câu có đáp án ngoài A–D', () => {
        // `answer: "E"` lọt qua thì người học bấm cả bốn phương án đều sai.
        for (const a of ['E', '', 'x', null, 5]) {
            expect(donCauHoi({ ...CAU(), answer: a })).toBeNull();
        }
    });

    test('chấp nhận đáp án viết thường', () => {
        expect(donCauHoi({ ...CAU(), answer: 'b' })).toMatchObject({ answer: 'B' });
    });

    test('bỏ câu không có đề', () => {
        expect(donCauHoi({ ...CAU(), question: '   ' })).toBeNull();
    });

    test('thiếu giải thích vẫn nhận, chỉ để rỗng', () => {
        // Giải thích là thứ tốt để có, không phải điều kiện để câu dùng được.
        expect(donCauHoi({ ...CAU(), explain: undefined })).toMatchObject({ explain: '' });
    });

    test('đầu vào rác không ném lỗi', () => {
        for (const v of [null, undefined, 'chuỗi', 42, []]) {
            expect(() => donCauHoi(v)).not.toThrow();
            expect(donCauHoi(v)).toBeNull();
        }
    });
});

describe('sinh bài đọc', () => {
    test('trả về bài và danh sách câu hỏi', async () => {
        aiTraVe(BAI_OK(3));
        const r = await generateReading({});
        expect(r.success).toBe(true);
        expect(r.questions).toHaveLength(3);
        expect(r.passage).toMatch(/closed on Monday/);
    });

    test('LỌC bỏ câu hỏng, giữ câu tốt', async () => {
        aiTraVe(JSON.stringify({
            passage: 'x',
            questions: [CAU(1), { ...CAU(2), answer: 'Z' }, CAU(3)],
        }));
        const r = await generateReading({});
        expect(r.questions).toHaveLength(2);
    });

    test('KHÔNG câu nào dùng được → thất bại, không trả bài trống', async () => {
        // Người học đọc xong 200 từ rồi không có gì để làm.
        aiTraVe(JSON.stringify({ passage: 'x', questions: [{ question: 'hỏng' }] }));
        const r = await generateReading({});
        expect(r.success).toBe(false);
    });

    test('AI trả thiếu `passage` → thất bại', async () => {
        aiTraVe(JSON.stringify({ questions: [CAU()] }));
        expect((await generateReading({})).success).toBe(false);
    });

    test('AI hỏng → trả nguyên lỗi, không nuốt', async () => {
        chatCompletion.mockResolvedValueOnce({ success: false, error: 'timeout' });
        expect((await generateReading({})).success).toBe(false);
    });

    test('đọc được JSON bọc trong ```json', async () => {
        aiTraVe('```json\n' + BAI_OK(2) + '\n```');
        expect((await generateReading({})).success).toBe(true);
    });

    describe('chỉ thị gửi cho model', () => {
        test('yêu cầu câu hỏi BUỘC đọc hiểu, không hỏi nghĩa từ', async () => {
            // Đây là điều phân biệt Part 7 thật với một bài trắc nghiệm từ vựng.
            aiTraVe(BAI_OK());
            await generateReading({});
            const p = promptHeThong();
            expect(p).toMatch(/inference, purpose/);
            expect(p).toMatch(/Never ask about a word's dictionary meaning/);
        });

        test('đúng MỘT đáp án đúng, ba cái kia phải hợp lý', async () => {
            // Ba phương án nhảm thì đoán trúng mà không cần đọc.
            aiTraVe(BAI_OK());
            await generateReading({});
            expect(promptHeThong()).toMatch(/Exactly one option is correct/);
            expect(promptHeThong()).toMatch(/plausible/);
        });

        test('giải thích bằng TIẾNG VIỆT', async () => {
            // Người học chế độ này chưa đọc vững tiếng Anh; giải thích bằng tiếng
            // Anh là thêm rào cản đúng lúc họ cần hiểu vì sao mình sai.
            aiTraVe(BAI_OK());
            await generateReading({});
            expect(promptHeThong()).toMatch(/"explain" in Vietnamese/);
        });

        test('số câu theo mức khó', async () => {
            for (const [muc, soCau] of Object.entries(CAU_HOI_THEO_MUC)) {
                aiTraVe(BAI_OK());
                await generateReading({ level: muc });
                expect(promptHeThong()).toContain(`exactly ${soCau} questions`);
            }
        });

        test('cắt từ vựng còn tối đa 8', async () => {
            aiTraVe(BAI_OK());
            const r = await generateReading({
                tuVung: Array.from({ length: 40 }, (_, i) => `w${i}`),
            });
            expect(r.words).toHaveLength(8);
            expect(promptHeThong()).not.toContain('w8');
        });

        test('bỏ chuỗi quá dài — chỗ nhét chỉ thị vào prompt', async () => {
            aiTraVe(BAI_OK());
            const r = await generateReading({ tuVung: ['ok', 'A'.repeat(200), 'fine'] });
            expect(r.words).toEqual(['ok', 'fine']);
        });
    });

    describe('dạng văn bản', () => {
        test('nhận dạng hợp lệ', () => {
            expect(chuanHoaDang('email')).toBe('email');
            expect(chuanHoaDang('NOTICE')).toBe('notice');
        });

        test('dạng lạ → chọn một dạng có thật, không trả rỗng', () => {
            const keys = DANG_BAI.map((d) => d.key);
            for (const v of ['bịa', '', null, undefined]) {
                expect(keys).toContain(chuanHoaDang(v));
            }
        });

        test('mỗi dạng có nhãn tiếng Việt', () => {
            for (const d of DANG_BAI) expect(d.vi.length).toBeGreaterThan(0);
            // Dạng lạ vẫn ra nhãn, không phải `undefined` lọt lên màn hình.
            expect(typeof nhanDang('khong-co')).toBe('string');
            expect(nhanDang('khong-co').length).toBeGreaterThan(0);
        });

        test('mức khó lạ → medium, không nhận khoá kế thừa', () => {
            expect(mucKho('bịa')).toBe('medium');
            expect(mucKho('constructor')).toBe('medium');
            expect(mucKho('hard')).toBe('hard');
        });
    });
});

describe('chấm bài', () => {
    const QS = [
        { question: 'q1', answer: 'A', explain: 'e1' },
        { question: 'q2', answer: 'B', explain: 'e2' },
        { question: 'q3', answer: 'C', explain: 'e3' },
    ];

    test('đếm đúng số câu đúng', () => {
        const r = gradeReading(QS, ['A', 'B', 'D']);
        expect(r.correct).toBe(2);
        expect(r.total).toBe(3);
        expect(r.ratio).toBeCloseTo(2 / 3);
    });

    test('bỏ trống tính SAI, không bỏ qua', () => {
        // Trong đề thi thật không trả lời cũng là mất điểm.
        const r = gradeReading(QS, ['A', '', '']);
        expect(r.correct).toBe(1);
        expect(r.total).toBe(3);
    });

    test('chấp nhận chữ thường', () => {
        expect(gradeReading(QS, ['a', 'b', 'c']).correct).toBe(3);
    });

    test('đáp án rác không tính là đúng', () => {
        const r = gradeReading(QS, ['Z', '<script>', null]);
        expect(r.correct).toBe(0);
        // Và `chose` phải sạch, không mang chuỗi rác lên màn hình.
        expect(r.details.every((d) => ['', 'A', 'B', 'C', 'D'].includes(d.chose))).toBe(true);
    });

    test('trả lời thiếu so với số câu vẫn chấm được', () => {
        const r = gradeReading(QS, ['A']);
        expect(r.total).toBe(3);
        expect(r.correct).toBe(1);
    });

    test('kèm đáp án đúng và giải thích để người học đối chiếu', () => {
        // Sai mà không biết vì sao thì lần sau vẫn sai đúng chỗ đó.
        const r = gradeReading(QS, ['D', 'B', 'C']);
        expect(r.details[0]).toMatchObject({ answer: 'A', chose: 'D', explain: 'e1' });
    });

    test('mảng rỗng KHÔNG chia cho 0', () => {
        // NaN đi vào công thức thưởng làm XP thành NaN.
        const r = gradeReading([], []);
        expect(r.ratio).toBe(0);
        expect(Number.isFinite(r.ratio)).toBe(true);
    });

    test('đầu vào hỏng không ném lỗi', () => {
        for (const v of [null, undefined, 'x', 42]) {
            expect(() => gradeReading(v, v)).not.toThrow();
        }
    });
});

/**
 * Controller: giữ đề ở server, KHÔNG lộ đáp án.
 *
 * Đọc mã nguồn — dựng đủ Mongo + auth để chạy thật tốn nhiều hơn thứ nó kiểm,
 * mà điều cần giữ ở đây là các bất biến, đọc thẳng ra được.
 */
describe('controller — đáp án phải ở lại server', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const ctrl = readFileSync(
        join(__dirname, '..', 'controllers', 'readingController.js'), 'utf8');

    /**
     * Phần dựng phản hồi của `passage` — nơi đáp án có thể lọt ra.
     *
     * Gỡ COMMENT trước khi soi: lời giải thích ngay trên chỗ đó có nhắc
     * `answer`/`explain`, mà chữ trong comment không gửi đi đâu cả.
     */
    function traVePassage() {
        const i = ctrl.indexOf('exports.passage');
        const j = ctrl.indexOf('exports.grade');
        const than = ctrl.slice(i, j).replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        return than.slice(than.indexOf('res.json('));
    }

    test('phản hồi CHỈ có đề và lựa chọn — không `answer`, không `explain`', () => {
        // Gửi kèm là người dùng mở DevTools thấy đáp án ngay, và cả chế độ
        // thành vô nghĩa.
        const tra = traVePassage();
        expect(tra).toMatch(/question: q\.question/);
        expect(tra).toMatch(/options: q\.options/);
        expect(tra).not.toMatch(/answer/);
        expect(tra).not.toMatch(/explain/);
    });

    test('đề giữ ở SERVER, khoá theo id ngẫu nhiên', () => {
        expect(ctrl).toMatch(/crypto\.randomUUID\(\)/);
        expect(ctrl).toMatch(/DE_MO\.set\(readingId/);
    });

    test('kiểm đề thuộc về ĐÚNG người nộp', () => {
        expect(ctrl).toMatch(/luu\.userId !== String\(req\.user\.id\)/);
    });

    test('XOÁ đề ngay sau khi chấm — chặn nộp hai lần ăn thưởng hai lần', () => {
        const i = ctrl.indexOf('exports.grade');
        const than = ctrl.slice(i);
        expect(than).toMatch(/DE_MO\.delete\(readingId\)/);
        // Và phải xoá TRƯỚC khi cộng thưởng.
        expect(than.indexOf('DE_MO.delete')).toBeLessThan(than.indexOf('awardXp'));
    });

    test('trừ năng lượng SAU khi chắc đề còn hiệu lực', () => {
        // Trừ rồi mới phát hiện đề hết hạn là mất năng lượng oan.
        const i = ctrl.indexOf('exports.grade');
        const than = ctrl.slice(i);
        expect(than.indexOf('expired: true')).toBeLessThan(than.indexOf('chargeEnergy'));
    });

    test('xin bài KHÔNG trừ năng lượng — chỉ nộp mới trừ', () => {
        // Người dùng có thể xin bài rồi thấy quá dài mà bỏ; tính tiền cho việc
        // đó là phạt một quyết định hợp lý.
        const i = ctrl.indexOf('exports.passage');
        const j = ctrl.indexOf('exports.grade');
        expect(ctrl.slice(i, j)).not.toMatch(/chargeEnergy/);
    });

    test('bộ nhớ đề có TRẦN và hạn — không phình vô hạn', () => {
        // Một người bấm "bài khác" trăm lần không được làm ngốn hết RAM.
        expect(ctrl).toMatch(/TOI_DA/);
        expect(ctrl).toMatch(/HAN_MS/);
        const i = ctrl.indexOf('function donDe');
        const than = ctrl.slice(i, ctrl.indexOf('\n}', i));
        expect(than).toMatch(/DE_MO\.delete/);
    });

    test('thưởng tính từ tỉ lệ đúng do SERVER chấm', () => {
        // Client không khai được điểm của chính mình.
        expect(ctrl).toMatch(/r\.ratio \* XP_PER_RATIO/);
        expect(ctrl).not.toMatch(/req\.body\.(correct|score|xp)/);
    });

    test('lịch sử không trả cả bài đọc', () => {
        // Trả `passage` là mỗi lần mở màn tải về hàng chục KB.
        const i = ctrl.indexOf('exports.history');
        const than = ctrl.slice(i);
        expect(than).toMatch(/\.select\('title dang level correct total createdAt'\)/);
    });
});

describe('hỗ trợ CẢ HAI ngôn ngữ', () => {
    test('tiếng Trung dùng chuẩn HSK, không phải TOEIC', async () => {
        // Hai CHUẨN chứ không phải một chuẩn dịch sang hai thứ tiếng — cùng lý
        // do đã tách IELTS/HSK ở Viết luận. Tiếng Trung không có TOEIC.
        aiTraVe(BAI_OK(2));
        await generateReading({ lang: 'zh' });
        const p = promptHeThong();
        expect(p).toMatch(/HSK reading comprehension/);
        expect(p).not.toMatch(/TOEIC Part 7/);
    });

    test('tiếng Anh vẫn dùng chuẩn TOEIC', async () => {
        aiTraVe(BAI_OK(2));
        await generateReading({ lang: 'en' });
        expect(promptHeThong()).toMatch(/TOEIC Part 7/);
    });

    test('độ dài đo bằng CHỮ HÁN, không phải từ', async () => {
        // "150 words" là yêu cầu model không đo được với tiếng Trung — không có
        // khoảng trắng giữa các từ.
        aiTraVe(BAI_OK(2));
        await generateReading({ lang: 'zh' });
        expect(promptHeThong()).toMatch(/characters/);
        expect(promptHeThong()).not.toMatch(/of \d+-\d+ words/);
    });

    test('bài và câu hỏi viết bằng tiếng Trung', async () => {
        // Ra đề tiếng Anh rồi bắt đọc hiểu tiếng Trung là bài kiểm tra dịch.
        aiTraVe(BAI_OK(2));
        await generateReading({ lang: 'zh' });
        expect(promptHeThong()).toMatch(/in Simplified Chinese/);
    });

    test('giải thích LUÔN bằng tiếng Việt ở cả hai', async () => {
        // Người học chưa đọc vững ngôn ngữ đích; giải thích bằng chính ngôn ngữ
        // đó là thêm rào cản đúng lúc họ cần hiểu vì sao sai.
        for (const lang of ['en', 'zh']) {
            aiTraVe(BAI_OK(2));
            await generateReading({ lang });
            expect(promptHeThong()).toMatch(/"explain" in Vietnamese/);
        }
    });

    test('trả về `lang` để client biết bài thuộc chuẩn nào', async () => {
        aiTraVe(BAI_OK(2));
        expect((await generateReading({ lang: 'zh' })).lang).toBe('zh');
        aiTraVe(BAI_OK(2));
        expect((await generateReading({})).lang).toBe('en');
    });

    test('ngôn ngữ đọc từ HỒ SƠ, KHÔNG nhận từ client', () => {
        // Client khai `lang` là client tự chọn xem mình nhận bài tiếng gì — mà
        // nó không biết người dùng đang học gì. Cùng nguyên tắc với Dịch và
        // Viết luận.
        const { readFileSync } = require('node:fs');
        const { join } = require('node:path');
        const ctrl = readFileSync(
            join(__dirname, '..', 'controllers', 'readingController.js'), 'utf8');
        const i = ctrl.indexOf('exports.passage');
        const than = ctrl.slice(i, ctrl.indexOf('exports.grade'));
        expect(than).toMatch(/settings\?\.vocabLang === 'zh'/);
        expect(than).not.toMatch(/req\.body\.lang/);
    });

    test('lưu `lang` cùng bài — để so điểm giữa các lượt', () => {
        // Hai chuẩn có độ dài và dạng văn bản khác nhau; không biết bài thuộc
        // chuẩn nào thì điểm không so được.
        const { readFileSync } = require('node:fs');
        const { join } = require('node:path');
        const ctrl = readFileSync(
            join(__dirname, '..', 'controllers', 'readingController.js'), 'utf8');
        expect(ctrl).toMatch(/lang: luu\.data\.lang \|\| 'en'/);
    });
});
