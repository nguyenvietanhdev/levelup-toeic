/**
 * Dịch đoạn văn chiều NGƯỢC (Anh/Trung → Việt) — đo đọc hiểu.
 *
 * Chỗ dễ hỏng: chấm bằng tiêu chí viết (ngữ pháp, tự nhiên như người bản ngữ) cho bản dịch tiếng
 * Việt của người Việt; điểm tổng không nặng về "hiểu đúng"; AI bịa cụm "hiểu sai" không có trong
 * đoạn gốc rồi lưu vào Từ vựng riêng (học nhầm); lỗi HIỂU lọt vào Sổ tay lỗi / Ôn lỗi / hồ sơ ngữ
 * pháp vốn dành cho lỗi VIẾT; đề chiều ngược lại sinh bằng tiếng Việt.
 */
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const { chatCompletion } = require('../config/openai');
const fs = require('fs');
const path = require('path');
const G = require('../services/translationGrader');

const traVe = (o) => chatCompletion.mockResolvedValueOnce({ success: true, content: JSON.stringify(o) });
const DOAN = 'We ran out of milk this morning. My brother had to go to the shop before work. He was not happy about it.';

beforeEach(() => chatCompletion.mockReset());

describe('chiều và tiêu chí', () => {
    test('chiều lạ → Việt → ngoại ngữ (mặc định như bài cũ)', () => {
        expect(G.chuanChieu('ngoai-vi')).toBe('ngoai-vi');
        expect(G.chuanChieu('xyz')).toBe('vi-ngoai');
        expect(G.chuanChieu()).toBe('vi-ngoai');
    });

    test('chiều ngược: Hiểu đúng · Đủ ý · Diễn đạt; chiều xuôi giữ ba trục cũ', () => {
        expect(G.tieuChiCua('ngoai-vi').map((c) => c.key)).toEqual(['comprehension', 'completeness', 'expression']);
        expect(G.tieuChiCua('vi-ngoai').map((c) => c.key)).toEqual(['accuracy', 'grammar', 'naturalness']);
    });

    test('điểm tổng chiều ngược nặng về hiểu đúng (x2), diễn đạt nhẹ (x0.5)', () => {
        // Hiểu đúng 9, đủ ý 9, diễn đạt 3 → vẫn cao; hiểu đúng 3 → thấp dù văn hay.
        expect(G.overallBand({ comprehension: 9, completeness: 9, expression: 3 }, 'ngoai-vi')).toBe(8);
        expect(G.overallBand({ comprehension: 3, completeness: 9, expression: 9 }, 'ngoai-vi')).toBe(5.5);
        // Chiều xuôi vẫn là trung bình đều.
        expect(G.overallBand({ accuracy: 6, grammar: 7, naturalness: 8 })).toBe(7);
    });

    test('độ dài tối thiểu chiều ngược tính theo từ tiếng Việt', () => {
        expect(G.limitsFor('zh', 'ngoai-vi')).toEqual({ min: G.MIN_VI });
        expect(G.limitsFor('zh', 'vi-ngoai').min).toBeGreaterThan(G.MIN_VI);
    });
});

describe('cụm hiểu sai', () => {
    test('chỉ giữ cụm có NGUYÊN VĂN trong đoạn gốc; kèm câu gốc; không trùng; tối đa 5', () => {
        const r = G.chuanHoaHieuSai([
            { phrase: 'ran out of', meaning: 'hết, dùng hết' },
            { phrase: 'Ran Out Of', meaning: 'trùng' },
            { phrase: 'give up', meaning: 'bịa: không có trong đoạn' },
            { phrase: 'had to', meaning: '' },
        ], DOAN);
        expect(r).toEqual([{ cum: 'ran out of', nghia: 'hết, dùng hết', cau: 'We ran out of milk this morning.' }]);
    });
    test('tiếng Trung so nguyên chữ Hán', () => {
        const r = G.chuanHoaHieuSai([{ phrase: '马马虎虎', meaning: 'tàm tạm' }], '我的中文马马虎虎。你呢？', 'zh');
        expect(r[0]).toMatchObject({ cum: '马马虎虎', cau: '我的中文马马虎虎。' });
    });
});

describe('sinh đề chiều ngược', () => {
    test('đoạn bằng ngoại ngữ, theo cấp độ, dùng nguyên văn từ của bộ đang học', async () => {
        traVe({ passage: DOAN, topic: 'Hết sữa' });
        const r = await G.generatePassage({ tuVung: ['run out of'], lang: 'en', level: 'medium', chieu: 'ngoai-vi' });
        expect(r).toMatchObject({ success: true, passage: DOAN, topic: 'Hết sữa' });
        const sys = chatCompletion.mock.calls[0][0][0].content;
        expect(sys).toMatch(/MUST be written in natural English/);
        expect(sys).toMatch(/CEFR B1/);
        expect(sys).toMatch(/Do NOT include any Vietnamese/);
        expect(sys).toMatch(/Use these English words naturally.*run out of/);
    });
    test('chiều xuôi vẫn sinh đoạn tiếng Việt như cũ', async () => {
        traVe({ passage: 'Sáng nay nhà tôi hết sữa.', topic: 'x' });
        await G.generatePassage({ lang: 'en', chieu: 'vi-ngoai' });
        expect(chatCompletion.mock.calls[0][0][0].content).toMatch(/MUST be written in natural Vietnamese/);
    });
});

describe('chấm chiều ngược', () => {
    test('chấm đọc hiểu: ba trục mới, ghi chú là lỗi hiểu, cụm hiểu sai đã lọc', async () => {
        traVe({
            scores: { comprehension: 5, completeness: 8, expression: 7.3 },
            reference: 'Sáng nay nhà mình hết sữa…',
            notes: [
                { quote: 'chạy ra khỏi sữa', source: 'ran out of milk', type: 'hieu-sai', issue: 'Hiểu sai cụm động từ', better: 'hết sữa' },
                { quote: 'anh ấy', source: 'He', type: 'dien-dat', issue: 'Nên dùng "anh mình"', better: 'anh mình' },
            ],
            misread: [{ phrase: 'ran out of', meaning: 'hết' }, { phrase: 'bịa', meaning: 'x' }],
            summary: 'Hiểu khá, sai một cụm động từ.',
        });
        const r = await G.gradeTranslationNguoc({ passage: DOAN, translation: 'Chúng tôi chạy ra khỏi sữa sáng nay…', lang: 'en' });
        expect(r.scores).toEqual({ comprehension: 5, completeness: 8, expression: 7.5 });
        expect(r.overall).toBe(G.overallBand(r.scores, 'ngoai-vi'));
        expect(r.notes[0]).toMatchObject({ loai: 'hieu-sai', muc: 'loi', nguon: 'ran out of milk', better: 'hết sữa' });
        expect(r.notes[1]).toMatchObject({ loai: 'dien-dat', muc: 'nen' });
        expect(r.hieuSai.map((x) => x.cum)).toEqual(['ran out of']);
        const sys = chatCompletion.mock.calls[0][0][0].content;
        expect(sys).toMatch(/READING COMPREHENSION/);
        expect(sys).toMatch(/Score this LENIENTLY/);
        expect(sys).toMatch(/Accept ANY Vietnamese wording/);
        expect(chatCompletion.mock.calls[0][1]).toMatchObject({ temperature: 0.2, feature: 'translation-grade' });
    });

    test('AI trả hỏng: báo lỗi để controller hoàn năng lượng', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: 'không phải JSON' });
        expect(await G.gradeTranslationNguoc({ passage: DOAN, translation: 'x' })).toMatchObject({ success: false });
    });
});

describe('loại bài dịch ngược khỏi nơi dành cho lỗi viết; tính vào chuỗi Đọc', () => {
    const doc = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    test.each([
        ['services/onLoi.js', 'Ôn lỗi'],
        ['services/soTayLoi.js', 'Sổ tay lỗi'],
        ['controllers/coachController.js', 'Gợi ý luyện'],
        ['controllers/translationController.js', 'Nhật ký lỗi của màn Dịch'],
    ])('%s (%s) bỏ qua chieu ngoai-vi', (f) => {
        expect(doc(f)).toMatch(/Translation\.find\(\{ userId, createdAt: \{ \$gte: tu \}, chieu: \{ \$ne: 'ngoai-vi' \}/);
    });

    test('chấm chiều ngược không ghi bằng chứng ngữ pháp, không viết lại giải thích theo hồ sơ', () => {
        const c = doc('controllers/translationController.js');
        expect(c).toMatch(/if \(!nguoc\) await ghiBangChung\(/);
        expect(c).toMatch(/if \(!nguoc\) ai\.notes = await vietLaiGiaiThich\(/);
    });

    test('màn Tiến bộ: bài ngược vào chuỗi Đọc (thang 9), không vào chuỗi Dịch', () => {
        const t = doc('services/tienBo.js');
        expect(t).toMatch(/dich\.filter\(\(b\) => b\.chieu === 'ngoai-vi'\)\.map\(\(b\) => \(\{ at: b\.createdAt, tu: b\.overall \|\| 0, mau: 9 \}\)\)/);
        expect(t).toMatch(/dich: dich\.filter\(\(b\) => b\.chieu !== 'ngoai-vi'\)/);
    });
});
