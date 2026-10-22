/**
 * Chấm cuối phiên hội thoại theo bộ tiêu chí.
 *
 * Mock lời gọi AI để kiểm: bộ tiêu chí nhận đúng mã, prompt chỉ chấm lời người
 * học, đầu ra bị kiểm chặt (không tin model), và lỗi AI không làm hỏng phiên.
 */
const mockText = jest.fn();
jest.mock('../services/aiClient', () => ({
    textCompletion: (...a) => mockText(...a),
}));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const g = require('../services/conversationGrader');

beforeEach(() => mockText.mockReset());

describe('bộ tiêu chí', () => {
    test('có đủ 4 bộ, mỗi bộ có tiêu chí và mô tả', () => {
        expect(Object.keys(g.BO_TIEU_CHI).sort()).toEqual(['hsk', 'ielts', 'giaotiep', 'toeic'].sort());
        for (const bo of Object.values(g.BO_TIEU_CHI)) {
            expect(bo.criteria.length).toBeGreaterThanOrEqual(3);
            for (const c of bo.criteria) expect(c.mota).toBeTruthy();
        }
    });

    test('mã lạ, rỗng, hoặc không phải chuỗi → về mặc định (không phải chuỗi tự do)', () => {
        expect(g.chuanHoaBoTieuChi('toeic')).toBe('toeic');
        expect(g.chuanHoaBoTieuChi('nope')).toBe(g.BO_MAC_DINH);
        expect(g.chuanHoaBoTieuChi('constructor')).toBe(g.BO_MAC_DINH);
        expect(g.chuanHoaBoTieuChi({ toString: () => 'toeic' })).toBe(g.BO_MAC_DINH);
    });

    test('HSK chỉ cho tiếng Trung; TOEIC/IELTS chỉ cho tiếng Anh', () => {
        expect(g.chuanHoaBoTieuChi('hsk', 'zh')).toBe('hsk');
        expect(g.chuanHoaBoTieuChi('hsk', 'en')).toBe(g.BO_MAC_DINH);
        expect(g.chuanHoaBoTieuChi('toeic', 'zh')).toBe(g.BO_MAC_DINH);
        expect(g.chuanHoaBoTieuChi('ielts', 'zh')).toBe(g.BO_MAC_DINH);
        expect(g.chuanHoaBoTieuChi('toeic', 'en')).toBe('toeic');
    });

    test('song ngữ Trung–Anh (bi) được chọn cả 4 bộ', () => {
        for (const ma of ['giaotiep', 'toeic', 'ielts', 'hsk']) {
            expect(g.chuanHoaBoTieuChi(ma, 'bi')).toBe(ma);
        }
    });

    test('bi không nhận khoá lạ hoặc tên thuộc tính của Object', () => {
        expect(g.chuanHoaBoTieuChi('toeic', 'constructor')).toBe('toeic');
        expect(g.chuanHoaBoTieuChi('hsk', 'constructor')).toBe(g.BO_MAC_DINH);
    });

    test('giao tiếp dùng được cho cả hai ngôn ngữ', () => {
        expect(g.chuanHoaBoTieuChi('giaotiep', 'en')).toBe('giaotiep');
        expect(g.chuanHoaBoTieuChi('giaotiep', 'zh')).toBe('giaotiep');
    });

    test('parseGrading với bộ sai ngôn ngữ thì chấm theo Giao tiếp, nhãn đúng', () => {
        const raw = JSON.stringify({ criteria: [{ key: 'ro_y', score: 6 }] });
        const r = g.parseGrading(raw, 'hsk', 'en');
        expect(r.rubric).toBe('giaotiep');
        expect(r.label).toBe('Giao tiếp');
    });

    test('không có tiêu chí phát âm/ngữ điệu — chat bằng chữ không nghe được', () => {
        const keys = Object.values(g.BO_TIEU_CHI).flatMap((b) => b.criteria.map((c) => c.key));
        expect(keys.join(' ')).not.toMatch(/phat_am|ngu_dieu|thanh_dieu/);
    });
});

describe('prompt chấm', () => {
    const turns = [
        { role: 'npc', content: 'Do you keep a record?' },
        { role: 'user', content: 'Yes, I keep a ledger.' },
    ];

    test('chứa đúng các tiêu chí của bộ đã chọn', () => {
        const msgs = g.buildGradingMessages({ rubric: 'ielts', lang: 'en', turns });
        const sys = msgs[0].content;
        for (const c of g.BO_TIEU_CHI.ielts.criteria) expect(sys).toContain(c.key);
        expect(sys).not.toContain('ro_y');   // không lẫn tiêu chí bộ khác
    });

    test('chỉ chấm lời người học; lời AI đánh dấu là PARTNER', () => {
        const msgs = g.buildGradingMessages({ rubric: 'giaotiep', lang: 'en', turns });
        const user = msgs[1].content;
        expect(user).toContain('PARTNER: Do you keep a record?');
        expect(user).toContain('LEARNER: Yes, I keep a ledger.');
        expect(msgs[0].content).toMatch(/Grade ONLY the LEARNER/);
    });
});

describe('đọc đầu ra của model', () => {
    const tot = JSON.stringify({
        criteria: [
            { key: 'ngu_phap', score: 7, comment: 'Ngữ pháp ổn định.' },
            { key: 'mach_lac', score: 6, comment: 'Thiếu từ nối.' },
            { key: 'von_tu', score: 8, comment: 'Từ chính xác.' },
            { key: 'lien_quan', score: 9, comment: 'Đúng trọng tâm.' },
        ],
        summary: 'Bạn trả lời tốt. Nên dùng thêm từ nối.',
    });

    test('đọc JSON trong hàng rào ```json', () => {
        const r = g.parseGrading('```json\n' + tot + '\n```', 'toeic');
        expect(r.criteria.map((c) => c.score)).toEqual([7, 6, 8, 9]);
        expect(r.overall).toBe(7.5);
        expect(r.label).toBe('TOEIC');
    });

    test('đọc JSON có lời dẫn thừa xung quanh', () => {
        const r = g.parseGrading('Đây là kết quả:\n' + tot + '\nHết.', 'toeic');
        expect(r).not.toBeNull();
    });

    test('điểm ngoài 0–9 bị kẹp, số lẻ được làm tròn', () => {
        const raw = JSON.stringify({ criteria: [
            { key: 'ngu_phap', score: 14 }, { key: 'mach_lac', score: -3 }, { key: 'von_tu', score: 6.6 },
        ] });
        const r = g.parseGrading(raw, 'toeic');
        expect(r.criteria.find((c) => c.key === 'ngu_phap').score).toBe(9);
        expect(r.criteria.find((c) => c.key === 'mach_lac').score).toBe(0);
        expect(r.criteria.find((c) => c.key === 'von_tu').score).toBe(7);
    });

    test('tiêu chí thiếu → điểm null, không bịa điểm', () => {
        const raw = JSON.stringify({ criteria: [{ key: 'ngu_phap', score: 5 }] });
        const r = g.parseGrading(raw, 'toeic');
        expect(r.criteria.find((c) => c.key === 'lien_quan').score).toBeNull();
        expect(r.overall).toBe(5);
    });

    test('không có điểm nào hoặc không phải JSON → null', () => {
        expect(g.parseGrading('xin lỗi, tôi không chấm được', 'toeic')).toBeNull();
        expect(g.parseGrading('{ bị hỏng', 'toeic')).toBeNull();
        expect(g.parseGrading(JSON.stringify({ criteria: [] }), 'toeic')).toBeNull();
    });

    test('comment quá dài bị cắt', () => {
        const raw = JSON.stringify({ criteria: [{ key: 'ngu_phap', score: 5, comment: 'x'.repeat(1000) }] });
        expect(g.parseGrading(raw, 'toeic').criteria[0].comment.length).toBe(300);
    });
});

describe('gradeConversation', () => {
    test('không có lời người học thì KHÔNG gọi AI, trả null', async () => {
        const r = await g.gradeConversation({
            rubric: 'toeic', lang: 'en', turns: [{ role: 'npc', content: 'Hi' }],
        });
        expect(r).toBeNull();
        expect(mockText).not.toHaveBeenCalled();
    });

    test('AI lỗi → trả null, không ném lỗi (phiên vẫn kết thúc được)', async () => {
        mockText.mockRejectedValue(new Error('no credits'));
        const r = await g.gradeConversation({
            rubric: 'toeic', lang: 'en', turns: [{ role: 'user', content: 'Hi' }],
        });
        expect(r).toBeNull();
    });

    test('AI trả JSON hợp lệ → trả kết quả đã chuẩn hoá', async () => {
        mockText.mockResolvedValue({ text: JSON.stringify({
            criteria: [{ key: 'ngu_phap', score: 7, comment: 'ok' }], summary: 's',
        }), providerId: 'deepseek' });
        const r = await g.gradeConversation({
            rubric: 'toeic', lang: 'en', turns: [{ role: 'user', content: 'Hi' }],
        });
        expect(r.rubric).toBe('toeic');
        expect(r.criteria.find((c) => c.key === 'ngu_phap').score).toBe(7);
        expect(mockText.mock.calls[0][0].feature).toBe('conversation-grade');
    });
});

describe('mức chấm theo từng bộ', () => {
    test('mỗi bộ có đủ 3 mức easy/medium/hard với nhãn và ngưỡng', () => {
        for (const bo of Object.keys(g.MUC_CHAM)) {
            for (const k of ['easy', 'medium', 'hard']) {
                expect(g.MUC_CHAM[bo][k].label).toBeTruthy();
                expect(g.MUC_CHAM[bo][k].nguong).toBeGreaterThan(0);
            }
        }
    });

    test('nhãn theo đúng thang của bộ: TOEIC điểm, IELTS band, HSK cấp', () => {
        expect(g.MUC_CHAM.toeic.medium.label).toBe('600–700');
        expect(g.MUC_CHAM.ielts.hard.label).toBe('Band 7.0+');
        expect(g.MUC_CHAM.hsk.medium.label).toBe('HSK 4');
    });

    test('mức lạ hoặc thiếu → vừa', () => {
        expect(g.chuanHoaMucCham('toeic', 'constructor')).toBe('medium');
        expect(g.chuanHoaMucCham('toeic', undefined)).toBe('medium');
        expect(g.chuanHoaMucCham('toeic', 'hard')).toBe('hard');
    });

    test('parseGrading cho biết đạt hay chưa theo ngưỡng của mức đã chọn', () => {
        const raw = JSON.stringify({ criteria: [
            { key: 'ngu_phap', score: 6 }, { key: 'mach_lac', score: 6 }, { key: 'von_tu', score: 6 }, { key: 'lien_quan', score: 6 },
        ] });
        const hard = g.parseGrading(raw, 'toeic', 'en', 'hard');
        expect(hard.muc).toBe('800+');
        expect(hard.nguong).toBe(7.5);
        expect(hard.dat).toBe(false);
        const medium = g.parseGrading(raw, 'toeic', 'en', 'medium');
        expect(medium.muc).toBe('600–700');
        expect(medium.dat).toBe(true);
    });

    test('prompt chấm ghi rõ mức kỳ vọng của bộ đã chọn', () => {
        const msgs = g.buildGradingMessages({ rubric: 'hsk', track: 'zh', lang: 'zh', level: 'medium', turns: [{ role: 'user', content: '你好' }] });
        expect(msgs[0].content).toMatch(/Expected level: HSK 4/);
    });
});

describe('ngữ pháp Giao tiếp: nới lỏng hay chuẩn viết', () => {
    const turns = [{ role: 'user', content: 'gonna check u later' }];

    test('Giao tiếp có tiêu chí Ngữ pháp', () => {
        expect(g.BO_TIEU_CHI.giaotiep.criteria.map((c) => c.key)).toContain('ngu_phap');
    });

    test('mặc định nới lỏng: prompt không phạt văn nói', () => {
        const sys = g.buildGradingMessages({ rubric: 'giaotiep', lang: 'en', level: 'medium', turns })[0].content;
        expect(sys).toMatch(/spoken conversation\. Do NOT penalize/);
        expect(sys).not.toMatch(/Count every error/);
    });

    test('bật chuẩn viết: prompt chấm mọi lỗi', () => {
        const sys = g.buildGradingMessages({ rubric: 'giaotiep', lang: 'en', level: 'medium', turns, nghiemNguPhap: true })[0].content;
        expect(sys).toMatch(/Count every error/);
    });

    test('luật nới lỏng chỉ áp dụng cho Giao tiếp, không lẫn vào TOEIC', () => {
        const sys = g.buildGradingMessages({ rubric: 'toeic', lang: 'en', level: 'medium', turns })[0].content;
        expect(sys).not.toMatch(/spoken conversation/);
    });
});
