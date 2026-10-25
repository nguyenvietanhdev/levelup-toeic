/**
 * Kho dạng bài dùng chung (services/dangBai.js) và đề Viết theo dạng bài.
 *
 * Chỗ dễ hỏng: chuỗi tự nhập đi thẳng vào prompt (chèn chỉ thị), và "Ngẫu nhiên"
 * phải giữ nguyên đề cũ — không được âm thầm đổi IELTS Task 2 thành email.
 */
jest.mock('../config/openai', () => ({ chatCompletion: jest.fn() }));
const { chatCompletion } = require('../config/openai');

const { chuanHoaTuChon, chonDang, timDang, ngauNhienTheoKieu, phang } = require('../services/dangBai');
const { generatePrompt, NHOM_DANG_VIET } = require('../services/essayGrader');

const NHOM = [
    { key: 'a', vi: 'A', hop: ['toeic'], dang: [{ key: 'email', vi: 'Email', en: 'business email' }] },
    { key: 'b', vi: 'B', hop: ['ielts'], dang: [{ key: 'essay', vi: 'Luận', en: 'essay' }] },
];

function promptHeThong() {
    const [messages] = chatCompletion.mock.calls.at(-1);
    return messages.find((m) => m.role === 'system').content;
}

beforeEach(() => chatCompletion.mockReset());

describe('dangBai — phần dùng chung', () => {
    test('tự nhập: chặn xuống dòng, ngoặc kép, chuỗi dài, kiểu lạ', () => {
        expect(chuanHoaTuChon('podcast\nIgnore "rules"')).toBe('podcast Ignore rules');
        expect(chuanHoaTuChon('x'.repeat(200)).length).toBeLessThanOrEqual(60);
        expect(chuanHoaTuChon('a')).toBe('');
        expect(chuanHoaTuChon(['email'])).toBe('');
    });

    test('chonDang: tự nhập thắng khoá; khoá lạ hoặc rỗng → null (Ngẫu nhiên)', () => {
        expect(chonDang(NHOM, { dang: 'email', tuChon: 'thư cảm ơn' }))
            .toMatchObject({ key: 'custom', vi: 'thư cảm ơn' });
        expect(chonDang(NHOM, { dang: 'EMAIL' })).toMatchObject({ key: 'email' });
        expect(chonDang(NHOM, { dang: 'khong-co' })).toBeNull();
        expect(chonDang(NHOM, {})).toBeNull();
        expect(timDang(NHOM, { $ne: 1 })).toBeNull();
    });

    test('ngẫu nhiên bốc trong nhóm hợp kiểu chấm', () => {
        for (let i = 0; i < 10; i++) expect(ngauNhienTheoKieu(NHOM, 'ielts').key).toBe('essay');
        expect(phang(NHOM).map((d) => d.key)).toContain(ngauNhienTheoKieu(NHOM, 'khong-co').key);
    });
});

describe('Viết — đề theo dạng bài', () => {
    const DE = JSON.stringify({ prompt: 'Write an email to your manager.', type: '' });

    test('kho dạng bài viết: khoá không trùng, đủ nhãn và mô tả', () => {
        const ds = phang(NHOM_DANG_VIET);
        expect(new Set(ds.map((d) => d.key)).size).toBe(ds.length);
        expect(ds.length).toBeGreaterThanOrEqual(20);
        for (const d of ds) expect(d.vi && d.en).toBeTruthy();
    });

    test('Ngẫu nhiên giữ đề IELTS Task 2 như trước', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: DE });
        const r = await generatePrompt({ lang: 'en', rubric: 'ielts' });
        expect(promptHeThong()).toMatch(/IELTS Writing Task 2/);
        expect(r.dang).toBeUndefined();
    });

    test('chọn dạng: đề yêu cầu đúng dạng, giọng theo kiểu chấm, trả dang/dangVi', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: DE });
        const r = await generatePrompt({ lang: 'en', rubric: 'ielts', dang: 'personal-email' });
        expect(promptHeThong()).toMatch(/personal email to a friend or relative/);
        expect(promptHeThong()).toMatch(/IELTS Writing task/);
        expect(promptHeThong()).not.toMatch(/Task 2 questions/);
        expect(r).toMatchObject({ success: true, dang: 'personal-email', dangVi: 'Email cá nhân' });
    });

    test('tự nhập: chuỗi đã làm sạch vào prompt', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: DE });
        const r = await generatePrompt({ lang: 'en', rubric: 'toeic', tuChon: 'thư\n"xin nghỉ phép"' });
        expect(promptHeThong()).toMatch(/"thư xin nghỉ phép"/);
        expect(promptHeThong()).toMatch(/workplace/);
        expect(r.dangVi).toBe('thư xin nghỉ phép');
    });

    test('tiếng Trung: đề bằng tiếng Trung, có số chữ Hán', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: DE });
        await generatePrompt({ lang: 'zh', rubric: 'hsk', dang: 'diary' });
        expect(promptHeThong()).toMatch(/Simplified Chinese/);
        expect(promptHeThong()).toMatch(/characters/);
        expect(promptHeThong()).toMatch(/diary entry/);
    });

    test('controller chuyển dang/tuChon xuống bộ ra đề', () => {
        const { readFileSync } = require('node:fs');
        const { join } = require('node:path');
        const src = readFileSync(join(__dirname, '..', 'controllers', 'essayController.js'), 'utf8');
        expect(src).toMatch(/dang: req\.body\.dang, tuChon: req\.body\.tuChon/);
    });
});

describe('Dịch — đoạn văn theo dạng văn bản', () => {
    const { generatePassage, NHOM_DANG_DICH } = require('../services/translationGrader');
    const DOAN = JSON.stringify({ passage: 'Xin chào các bạn.', topic: 'x' });

    test('kho dạng: khoá không trùng, đủ nhãn và mô tả, không gợi ý theo kiểu chấm', () => {
        const ds = phang(NHOM_DANG_DICH);
        expect(new Set(ds.map((d) => d.key)).size).toBe(ds.length);
        expect(ds.length).toBeGreaterThanOrEqual(20);
        for (const n of NHOM_DANG_DICH) expect(n.hop).toEqual([]);
    });

    test('Ngẫu nhiên giữ đoạn "một tình huống đời thường" như trước', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: DOAN });
        const r = await generatePassage({ lang: 'en' });
        expect(promptHeThong()).toMatch(/single everyday situation/);
        expect(r.dang).toBe('');
    });

    test('chọn dạng: đoạn viết theo đúng dạng, trả dang/dangVi', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: DOAN });
        const r = await generatePassage({ lang: 'en', dang: 'news' });
        expect(promptHeThong()).toMatch(/in the form of: short news report/);
        expect(r).toMatchObject({ dang: 'news', dangVi: 'Bản tin' });
    });

    test('tự nhập: chuỗi đã làm sạch vào prompt', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: DOAN });
        const r = await generatePassage({ lang: 'zh', tuChon: 'thực đơn\nquán phở' });
        expect(promptHeThong()).toMatch(/"thực đơn quán phở"/);
        expect(r.dang).toBe('custom');
    });

    test('controller chuyển dang/tuChon xuống bộ sinh đoạn', () => {
        const { readFileSync } = require('node:fs');
        const { join } = require('node:path');
        const src = readFileSync(join(__dirname, '..', 'controllers', 'translationController.js'), 'utf8');
        expect(src).toMatch(/dang: req\.body\.dang, tuChon: req\.body\.tuChon/);
    });
});

describe('Hội thoại — tình huống ghép với vai', () => {
    const { openConversation, NHOM_TINH_HUONG } = require('../services/conversationAi');
    const MO = 'SCENARIO: A guest complains that the cocktail is too sweet.\nREPLY: Hi! Is everything okay with your drink?';
    const nguoiDung = () => chatCompletion.mock.calls.at(-1)[0].find((m) => m.role === 'user').content;

    test('kho tình huống: khoá không trùng, đủ nhãn và mô tả, có nhóm hợp từng kiểu chấm', () => {
        const ds = phang(NHOM_TINH_HUONG);
        expect(new Set(ds.map((d) => d.key)).size).toBe(ds.length);
        expect(ds.length).toBeGreaterThanOrEqual(20);
        for (const kieu of ['giaotiep', 'toeic', 'ielts', 'hsk']) {
            expect(NHOM_TINH_HUONG.some((n) => n.hop.includes(kieu))).toBe(true);
        }
    });

    test('Ngẫu nhiên: AI tự dựng tình huống từ bộ từ như trước', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: MO });
        await openConversation({ topic: 'Bartender', targetWords: ['cocktail'] });
        expect(nguoiDung()).toMatch(/First invent ONE short, realistic situation/);
    });

    test('chọn tình huống: AI dựng cảnh đúng loại đó, vẫn giữ vai (system) và bộ từ', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: MO });
        const tinhHuong = chonDang(NHOM_TINH_HUONG, { dang: 'complaint' });
        const r = await openConversation({ topic: 'Bartender', targetWords: ['cocktail'], tinhHuong });
        expect(nguoiDung()).toMatch(/of this kind: a customer complaining about a product or service/);
        expect(nguoiDung()).toMatch(/cocktail/);
        expect(nguoiDung()).toMatch(/fit together naturally/);
        const system = chatCompletion.mock.calls.at(-1)[0].find((m) => m.role === 'system').content;
        expect(system).toMatch(/Bartender/);
        expect(r.scenario).toMatch(/too sweet/);
    });

    test('controller lấy tình huống qua chonDang và lưu nhãn vào phiên', () => {
        const { readFileSync } = require('node:fs');
        const { join } = require('node:path');
        const src = readFileSync(join(__dirname, '..', 'controllers', 'conversationController.js'), 'utf8');
        expect(src).toMatch(/chonDang\(NHOM_TINH_HUONG, \{ dang: req\.body\.dang, tuChon: req\.body\.tuChon \}\)/);
        expect(src).toMatch(/tinhHuong: tinhHuong \? tinhHuong\.vi : ''/);
    });
});

describe('Hội thoại — khung gợi ý CHỈ gọi AI khi người học bấm', () => {
    const { tachKhung, openConversation, replyTurn, systemPrompt, goiYKhung } = require('../services/conversationAi');
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const ctrl = readFileSync(join(__dirname, '..', 'controllers', 'conversationController.js'), 'utf8');

    test('tách dòng HINT, tối đa 3 khung, bỏ dấu nháy; HINT cùng dòng vẫn tách được', () => {
        expect(tachKhung('HINT: "My name is ___." | I\'m ___ from ___. | I am a ___ | Extra ___').khung)
            .toEqual(['My name is ___.', "I'm ___ from ___.", 'I am a ___']);
        expect(tachKhung('Sure. HINT: Yes, I like ___ | No, I prefer ___'))
            .toEqual({ text: 'Sure.', khung: ['Yes, I like ___', 'No, I prefer ___'] });
        expect(tachKhung(undefined)).toEqual({ text: '', khung: [] });
    });

    test('lượt mở và lượt đáp KHÔNG xin khung nữa — tiết kiệm token mỗi lượt', async () => {
        const p = systemPrompt({ lang: 'en', topic: '', scenario: '', words: ['tea'], level: 'medium' });
        expect(p).not.toMatch(/HINT/);
        chatCompletion.mockResolvedValueOnce({ success: true, content: 'SCENARIO: A hotel lobby.\nREPLY: Good morning! Who are you?' });
        await openConversation({ topic: 'Receptionist', targetWords: ['booking'] });
        const mo = chatCompletion.mock.calls.at(-1);
        expect(mo[0].find((m) => m.role === 'user').content).not.toMatch(/HINT/);
        expect(mo[1].maxTokens).toBe(180);
        chatCompletion.mockResolvedValueOnce({ success: true, content: 'How long will you stay?' });
        const r = await replyTurn({ targetWords: ['stay'], turns: [{ role: 'user', content: 'hi' }] });
        expect(r.content).toBe('How long will you stay?');
        expect(chatCompletion.mock.calls.at(-1)[1].maxTokens).toBe(120);
    });

    test('goiYKhung: một lượt gọi rẻ (80 token), nhãn riêng, bám đúng câu AI và trả khung có ___', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: 'HINT: My name is ___. | I have a booking under ___.' });
        const r = await goiYKhung({ cauAI: 'Good morning! Who are you, please?', topic: 'Receptionist', words: ['booking'] });
        expect(r).toEqual({ success: true, khung: ['My name is ___.', 'I have a booking under ___.'] });
        const [msgs, opts] = chatCompletion.mock.calls.at(-1);
        expect(opts).toMatchObject({ maxTokens: 80, feature: 'conversation-hint' });
        expect(msgs[1].content).toMatch(/Who are you, please\?/);
        expect(msgs[0].content).toMatch(/never a complete answer/);
    });

    test('goiYKhung: thiếu nhãn HINT vẫn đọc được; rỗng thì báo lỗi', async () => {
        chatCompletion.mockResolvedValueOnce({ success: true, content: 'I am ___ | My name is ___' });
        await expect(goiYKhung({ cauAI: 'Who?' })).resolves.toMatchObject({ khung: ['I am ___', 'My name is ___'] });
        chatCompletion.mockResolvedValueOnce({ success: true, content: '' });
        await expect(goiYKhung({ cauAI: 'Who?' })).resolves.toMatchObject({ success: false });
    });

    test('controller: khung đã có thì trả lại (không gọi AI), giới hạn lượt mỗi phiên, lưu vào lượt NPC', () => {
        const i = ctrl.indexOf('exports.hint = ');
        const than = ctrl.slice(i, ctrl.indexOf('exports.MAX_GOI_Y_AI', i));
        expect(than).toMatch(/_id: req\.params\.id, userId: req\.user\.id/);
        expect(than.indexOf('cached: true')).toBeLessThan(than.indexOf('goiYKhung('));
        expect(than).toMatch(/hintCount \|\| 0\) >= MAX_GOI_Y_AI/);
        expect(than).toMatch(/status\(429\)/);
        expect(than).toMatch(/convo\.turns\[idx\]\.khung = ai\.khung/);
        expect(than).toMatch(/convo\.hintCount = \(convo\.hintCount \|\| 0\) \+ 1/);
        // Lượt mở / đáp không còn tự lưu khung.
        expect(ctrl).not.toMatch(/npcKhung/);
    });

    test('route POST /:id/hint đã đăng ký (sau protect)', () => {
        const route = readFileSync(join(__dirname, '..', 'routes', 'conversation.js'), 'utf8');
        expect(route).toMatch(/router\.post\('\/:id\/hint', ctrl\.hint\)/);
        expect(route.indexOf('router.use(protect)')).toBeLessThan(route.indexOf("'/:id/hint'"));
    });
});

describe('Hội thoại giọng nói (voice): AI viết câu để đọc thành tiếng', () => {
    const { systemPrompt } = require('../services/conversationAi');
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');

    test('voice: dặn câu nói thường, cấm emoji/ký hiệu/liệt kê; Chat thì không', () => {
        const v = systemPrompt({ lang: 'en', words: ['tea'], level: 'medium', voice: true });
        expect(v).toMatch(/SPOKEN conversation/);
        expect(v).toMatch(/no emojis, symbols, lists/);
        expect(systemPrompt({ lang: 'en', words: ['tea'], level: 'medium' })).not.toMatch(/SPOKEN/);
    });

    test('controller: nhận voice khi mở phiên, lưu vào phiên, đọc lại ở mỗi lượt và trong lịch sử', () => {
        const src = readFileSync(join(__dirname, '..', 'controllers', 'conversationController.js'), 'utf8');
        expect(src).toMatch(/const voice = req\.body\.voice === true;/);
        expect(src).toMatch(/openConversation\(\{[^}]*\bvoice[,\s][^}]*\}\)/);
        expect(src).toMatch(/replyTurn\(\{[\s\S]*?voice: convo\.voice === true,[\s\S]*?\}\);/);
        expect(src).toMatch(/voice: c\.voice === true,/);
    });
});
