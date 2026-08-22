/**
 * Luyện DỊCH Việt → Anh/Trung.
 *
 * Test GỌI HÀM THẬT với `chatCompletion` giả, không dò chuỗi mã nguồn — test
 * đọc mã chỉ chứng minh code TRÔNG đúng, không chứng minh code CHẠY đúng.
 *
 * Bốn chỗ dễ hỏng, đều im lặng:
 *   1. `tuVung` do client gửi đi thẳng vào prompt — không lọc thì một mảng 500
 *      phần tử thổi bay giới hạn token, và chuỗi rác thành chỉ thị cho model.
 *   2. Đoạn đề bị lẫn tiếng Anh → lộ luôn đáp án của bài dịch.
 *   3. Không kẹp điểm — AI trả 7.3, không phải band có thật.
 *   4. Ba trục bị gộp thành một điểm, làm mất đúng thứ chế độ này sinh ra để
 *      phân biệt: câu đúng ngữ pháp nhưng không ai nói thế.
 */
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const { chatCompletion } = require('../config/openai');

const {
    generatePassage, gradeTranslation, overallBand, limitsFor, mucKho,
    CRITERIA, CAU_THEO_MUC,
} = require('../services/translationGrader');

/** Cho lần gọi AI kế tiếp trả về đúng nội dung này. */
function aiTraVe(content) {
    chatCompletion.mockResolvedValueOnce({ success: true, content });
}

/** Nội dung `system` của lần gọi gần nhất — nơi mọi chỉ thị được ghép vào. */
function promptHeThong() {
    const [messages] = chatCompletion.mock.calls.at(-1);
    return messages.find((m) => m.role === 'system').content;
}

beforeEach(() => chatCompletion.mockReset());

describe('sinh đoạn văn tiếng Việt', () => {
    test('trả về đoạn văn và chủ đề', async () => {
        aiTraVe('{"passage":"Hôm qua tôi đi làm muộn.","topic":"công việc"}');
        const r = await generatePassage({ lang: 'en' });
        expect(r.success).toBe(true);
        expect(r.passage).toBe('Hôm qua tôi đi làm muộn.');
        expect(r.topic).toBe('công việc');
    });

    test('đọc được JSON bọc trong ```json — dạng model hay trả nhất', async () => {
        aiTraVe('```json\n{"passage":"Một đoạn.","topic":"x"}\n```');
        const r = await generatePassage({});
        expect(r.success).toBe(true);
        expect(r.passage).toBe('Một đoạn.');
    });

    test('AI trả thiếu `passage` → báo lỗi, không trả đoạn rỗng', async () => {
        // Trả `success: true` với đoạn rỗng thì người học nhận màn hình trắng
        // và không hiểu vì sao.
        aiTraVe('{"topic":"chỉ có chủ đề"}');
        const r = await generatePassage({});
        expect(r.success).toBe(false);
    });

    test('AI hỏng → trả nguyên lỗi, không nuốt', async () => {
        chatCompletion.mockResolvedValueOnce({ success: false, error: 'timeout' });
        const r = await generatePassage({});
        expect(r.success).toBe(false);
    });

    describe('lọc từ vựng client gửi lên', () => {
        test('cắt còn tối đa 8 từ', async () => {
            aiTraVe('{"passage":"x","topic":"y"}');
            const nhieu = Array.from({ length: 50 }, (_, i) => `word${i}`);
            const r = await generatePassage({ tuVung: nhieu });
            expect(r.words).toHaveLength(8);
            // Và prompt cũng chỉ chứa 8 từ đó, không phải cả 50.
            expect(promptHeThong()).not.toContain('word8');
        });

        test('bỏ chuỗi quá dài — chỗ nhét chỉ thị vào prompt', async () => {
            aiTraVe('{"passage":"x","topic":"y"}');
            const r = await generatePassage({
                tuVung: ['ok', 'A'.repeat(200), '  ', null, 'fine'],
            });
            expect(r.words).toEqual(['ok', 'fine']);
        });

        test('`tuVung` không phải mảng → coi như không có, không vỡ', async () => {
            aiTraVe('{"passage":"x","topic":"y"}');
            const r = await generatePassage({ tuVung: 'không phải mảng' });
            expect(r.success).toBe(true);
            expect(r.words).toEqual([]);
        });
    });

    describe('chỉ thị gửi cho model', () => {
        test('bắt viết bằng tiếng Việt và CẤM kèm bản dịch', async () => {
            // Kèm bản dịch trong đề là đưa luôn đáp án.
            aiTraVe('{"passage":"x","topic":"y"}');
            await generatePassage({});
            const p = promptHeThong();
            expect(p).toMatch(/MUST be written in natural Vietnamese/);
            expect(p).toMatch(/Do NOT include the translation/);
            expect(p).toMatch(/Do NOT include any English or Chinese/);
        });

        test('nêu từ đích bằng ngôn ngữ ĐÍCH, đúng theo `lang`', async () => {
            aiTraVe('{"passage":"x","topic":"y"}');
            await generatePassage({ tuVung: ['schedule'], lang: 'en' });
            expect(promptHeThong()).toMatch(/these English words: schedule/);

            aiTraVe('{"passage":"x","topic":"y"}');
            await generatePassage({ tuVung: ['时间表'], lang: 'zh' });
            expect(promptHeThong()).toMatch(/these Chinese words: 时间表/);
        });

        test('số câu theo mức khó', async () => {
            for (const [muc, soCau] of Object.entries(CAU_THEO_MUC)) {
                aiTraVe('{"passage":"x","topic":"y"}');
                await generatePassage({ level: muc });
                expect(promptHeThong()).toContain(`exactly ${soCau} sentences`);
            }
        });

        test('mức khó lạ → medium, không ném lỗi', async () => {
            // Mức khó chỉ ảnh hưởng độ dài đoạn đề; chặn cả lượt vì nó thì
            // không đáng.
            expect(mucKho('bịa')).toBe('medium');
            expect(mucKho(undefined)).toBe('medium');
            expect(mucKho('hard')).toBe('hard');
            // Không được nhận khoá kế thừa từ Object.prototype.
            expect(mucKho('constructor')).toBe('medium');
        });
    });
});

describe('chấm bản dịch', () => {
    const OK = JSON.stringify({
        scores: { accuracy: 7, grammar: 6, naturalness: 5 },
        reference: 'A good translation.',
        notes: [{ quote: 'I very like it', issue: 'Sai trật tự', better: 'I like it a lot' }],
        summary: 'Khá ổn.',
    });

    test('trả đủ ba trục, bản dịch tham khảo và ghi chú', async () => {
        aiTraVe(OK);
        const r = await gradeTranslation({ passage: 'x', translation: 'y' });
        expect(r.success).toBe(true);
        expect(r.scores).toEqual({ accuracy: 7, grammar: 6, naturalness: 5 });
        expect(r.reference).toBe('A good translation.');
        expect(r.notes[0].better).toBe('I like it a lot');
    });

    test('BA trục riêng, không gộp thành một điểm', () => {
        // Cả lý do tồn tại của chế độ này nằm ở chỗ tách `naturalness` khỏi
        // `grammar`: câu đúng ngữ pháp hoàn toàn vẫn có thể không ai nói thế.
        expect(CRITERIA.map((c) => c.key))
            .toEqual(['accuracy', 'grammar', 'naturalness']);
    });

    test('kẹp điểm về thang hợp lệ — AI hay trả 7.3', async () => {
        aiTraVe(JSON.stringify({
            scores: { accuracy: 7.3, grammar: 11, naturalness: -2 },
        }));
        const r = await gradeTranslation({ passage: 'x', translation: 'y' });
        expect(r.scores.accuracy).toBe(7.5);
        expect(r.scores.grammar).toBe(9);
        expect(r.scores.naturalness).toBe(0);
    });

    test('trục thiếu → 0, không phải `undefined` lọt vào điểm tổng', async () => {
        aiTraVe(JSON.stringify({ scores: { accuracy: 6 } }));
        const r = await gradeTranslation({ passage: 'x', translation: 'y' });
        expect(r.scores.grammar).toBe(0);
        expect(Number.isFinite(r.overall)).toBe(true);
    });

    test('điểm tổng = trung bình ba trục, làm tròn 0.5', () => {
        expect(overallBand({ accuracy: 7, grammar: 6, naturalness: 5 })).toBe(6);
        // 7+7+6 = 20/3 = 6.67 → 6.5
        expect(overallBand({ accuracy: 7, grammar: 7, naturalness: 6 })).toBe(6.5);
    });

    test('cắt còn tối đa 4 ghi chú', async () => {
        // "Mọi lỗi nhỏ" thành một danh sách không ai đọc hết.
        aiTraVe(JSON.stringify({
            scores: { accuracy: 5, grammar: 5, naturalness: 5 },
            notes: Array.from({ length: 20 }, (_, i) => ({ issue: `lỗi ${i}` })),
        }));
        const r = await gradeTranslation({ passage: 'x', translation: 'y' });
        expect(r.notes).toHaveLength(4);
    });

    test('bỏ ghi chú không có nội dung lỗi', async () => {
        aiTraVe(JSON.stringify({
            scores: { accuracy: 5, grammar: 5, naturalness: 5 },
            notes: [{ quote: 'a' }, { issue: 'lỗi thật' }],
        }));
        const r = await gradeTranslation({ passage: 'x', translation: 'y' });
        expect(r.notes).toEqual([{ quote: '', issue: 'lỗi thật', better: '' }]);
    });

    test('AI trả thiếu `scores` → báo lỗi, KHÔNG trả điểm 0 giả', async () => {
        // Trả 0 thì người học tưởng mình bị chấm 0 điểm thật.
        aiTraVe('{"summary":"chỉ có nhận xét"}');
        const r = await gradeTranslation({ passage: 'x', translation: 'y' });
        expect(r.success).toBe(false);
    });

    test('nhận xét bằng tiếng Việt, trích dẫn giữ nguyên ngôn ngữ đích', async () => {
        aiTraVe(OK);
        await gradeTranslation({ passage: 'x', translation: 'y', lang: 'en' });
        const p = promptHeThong();
        expect(p).toMatch(/Write "issue" and "summary" in Vietnamese/);
        expect(p).toMatch(/Keep "quote" and "better"/);
    });

    test('chấm tiếng Trung dùng đúng ngôn ngữ đích', async () => {
        aiTraVe(OK);
        await gradeTranslation({ passage: 'x', translation: 'y', lang: 'zh' });
        expect(promptHeThong()).toMatch(/Vietnamese-to-Chinese/);
    });

    test('nhiệt độ THẤP — chấm phải ổn định giữa các lần', async () => {
        // Cùng một bài mà lần này 6.0 lần sau 7.5 thì điểm mất hết ý nghĩa.
        aiTraVe(OK);
        await gradeTranslation({ passage: 'x', translation: 'y' });
        const [, opts] = chatCompletion.mock.calls.at(-1);
        expect(opts.temperature).toBeLessThanOrEqual(0.3);
    });

    test('sinh đề dùng nhiệt độ CAO — mỗi lần một đoạn khác', async () => {
        aiTraVe('{"passage":"x","topic":"y"}');
        await generatePassage({});
        const [, opts] = chatCompletion.mock.calls.at(-1);
        expect(opts.temperature).toBeGreaterThanOrEqual(0.8);
    });
});

describe('ngưỡng độ dài theo ngôn ngữ', () => {
    test('tiếng Trung đếm CHỮ HÁN, ngưỡng riêng', () => {
        // Đếm theo từ thì cả bài tiếng Trung ra đúng 1 và không ai nộp được.
        expect(limitsFor('zh').min).not.toBe(limitsFor('en').min);
        expect(limitsFor('zh').min).toBeGreaterThan(0);
    });

    test('ngôn ngữ lạ → mặc định tiếng Anh', () => {
        expect(limitsFor('xx')).toEqual(limitsFor('en'));
    });
});
