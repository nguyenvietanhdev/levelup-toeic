/**
 * Màn Luyện viết luận.
 *
 * Người dùng bỏ 40 phút viết một bài — nên mọi lỗi ở đây đều đắt hơn bình
 * thường. Bốn chỗ dễ hỏng:
 *
 *   1. Hai lớp `.data` lồng nhau (Http bọc + server bọc). Gỡ một lớp là màn
 *      nhận object không có `scores`. Đúng lỗi đã mắc HAI lần ở Hội thoại.
 *   2. Lỗi mất dữ liệu — `throw new Error(message)` làm mất `energyNeeded`, nên
 *      không mở được popup nạp và người dùng phải tự đi tìm cửa hàng sau khi
 *      vừa viết xong bài.
 *   3. Đổi đề mà giữ bài cũ → nộp nhầm bài của đề trước, AI chấm Task Response
 *      rất thấp mà người viết không hiểu vì sao.
 *   4. Không nói rõ band là ƯỚC LƯỢNG → người dùng tin đó là điểm thi thật.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'EssayScreen.jsx'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');
const app = readFileSync(join(__dirname, '..', '..', 'App.jsx'), 'utf8');

/** Nhãn tiếng Việt của 4 tiêu chí — "Lexical Resource" không nói gì với người
 *  học Việt Nam, nên MỌI tiêu chí phải có nhãn Việt, không chỉ vài cái. */
const CRITERIA_VI = ['Trả lời đúng đề', 'Mạch lạc & liên kết', 'Vốn từ vựng', 'Ngữ pháp'];

// ── Hành vi THẬT của lớp API ──────────────────────────────────────────────
const post = vi.fn();
const get = vi.fn();
vi.mock('../../api/http.js', () => ({ Http: { post: (...a) => post(...a), get: (...a) => get(...a) } }));
const { EssayAPI } = await import('../../api/essay.js');

beforeEach(() => { post.mockReset(); get.mockReset(); });

describe('lớp API — gỡ đúng hai lớp bọc', () => {
    test('Http bọc + server bọc → trả payload trong cùng', () => {
        post.mockResolvedValue({
            success: true,
            data: { success: true, data: { overall: 6.5, scores: { grammar: 6 } } },
        });
        return expect(EssayAPI.prompt()).resolves.toEqual({
            overall: 6.5, scores: { grammar: 6 },
        });
    });

    test('chỉ MỘT lớp → không lột quá tay', () => {
        post.mockResolvedValue({ success: true, data: { prompt: 'x' } });
        return expect(EssayAPI.prompt()).resolves.toEqual({ prompt: 'x' });
    });

    test('server báo OK mà KHÔNG có `data` → trả nguyên, không thành undefined', () => {
        // Đây chính là lỗi Hội thoại #5: lột lớp thứ hai vô điều kiện. Với
        // `{success:true, ...}` không kèm `data`, `outer.data` là `undefined`,
        // màn nhận undefined rồi ném "kết quả không hợp lệ" — trong khi server
        // đã trả về đúng và năng lượng thì đã bị trừ.
        post.mockResolvedValue({
            success: true,
            data: { success: true, overall: 6.5, scores: { grammar: 6 } },
        });
        return expect(EssayAPI.grade({ prompt: 'a', essay: 'b' })).resolves.toEqual({
            success: true, overall: 6.5, scores: { grammar: 6 },
        });
    });

    test('lỗi lớp Http (401) — Http KHÔNG ném, nó return', () => {
        post.mockResolvedValue({ success: false, error: 'Token expired' });
        return expect(EssayAPI.prompt()).rejects.toThrow('Token expired');
    });

    test('lỗi lớp SERVER — không có `.data`, dễ rơi qua điều kiện', () => {
        post.mockResolvedValue({
            success: true, data: { success: false, message: 'Thiếu đề bài' },
        });
        return expect(EssayAPI.prompt()).rejects.toThrow('Thiếu đề bài');
    });
});

describe('lỗi mang theo DỮ LIỆU, không chỉ câu chữ', () => {
    test('thiếu năng lượng → giữ energyNeeded', () => {
        post.mockResolvedValue({
            success: true,
            data: {
                success: false, message: 'Không đủ năng lượng',
                energyNeeded: 20, currentEnergy: 5,
            },
        });
        return EssayAPI.grade({ prompt: 'a', essay: 'b' }).then(
            () => { throw new Error('phải ném'); },
            (e) => {
                expect(e.energyNeeded).toBe(20);
                expect(e.currentEnergy).toBe(5);
            }
        );
    });

    test('bài quá ngắn → giữ wordCount và cờ tooShort', () => {
        // Người viết cần biết mình đang có bao nhiêu từ, không chỉ "quá ngắn".
        post.mockResolvedValue({
            success: true,
            data: { success: false, message: 'Quá ngắn', tooShort: true, wordCount: 180 },
        });
        return EssayAPI.grade({ prompt: 'a', essay: 'b' }).then(
            () => { throw new Error('phải ném'); },
            (e) => {
                expect(e.tooShort).toBe(true);
                expect(e.wordCount).toBe(180);
            }
        );
    });
});

describe('start KHÔNG gửi chủ đề — server tự đọc', () => {
    test('prompt CHỈ gửi `level`', async () => {
        // Mỗi tham số client phải tự gom là một chỗ đoán sai hình dạng dữ liệu —
        // bài học từ 5 lỗi liên tiếp của Hội thoại.
        // `level` là NGOẠI LỆ có chủ ý và là tham số duy nhất được phép: nó là
        // lựa chọn người dùng vừa bấm ngay trên màn hình, server không có cách
        // nào biết. Khác hẳn `source`/`part`/`lang` — những thứ server đọc được
        // từ hồ sơ, và client tự gom là mở lại đúng ranh giới đã gây cả chuỗi lỗi.
        post.mockResolvedValue({ success: true, data: { success: true, data: { prompt: 'x' } } });
        await EssayAPI.prompt();
        const [url, body] = post.mock.calls[0];
        expect(url).toBe('/essay/prompt');
        expect(Object.keys(body)).toEqual(['level']);
    });
});

// ── Màn hình ──────────────────────────────────────────────────────────────
describe('đếm từ và ngưỡng', () => {
    test('hiện số từ so với ngưỡng, không bắt tự đếm', () => {
        expect(src).toMatch(/\{words\} \/ \{minUnits\} \{unit\}/);
    });

    test('nút Chấm bị khoá khi chưa đủ từ', () => {
        expect(src).toMatch(/disabled=\{grading \|\| !enough\}/);
    });

    test('đếm từ bỏ khoảng trắng thừa', () => {
        // Người dùng dán bài từ Word thường kéo theo xuống dòng kép và dấu cách
        // đôi. Đếm bằng `split(' ')` sẽ cộng thêm hàng chục "từ" rỗng, bật nút
        // Chấm khi bài chưa đủ — rồi server từ chối sau khi đã bấm.
        // Chạy THẬT hàm đếm, cắt ra từ nguồn: nó không được export.
        const i = src.indexOf('function countUnits');
        const countUnits = new Function(
            `${src.slice(i, src.indexOf('\n}', i) + 2)}; return countUnits;`)();
        expect(countUnits('  một   hai \n\n ba  ', 'en')).toBe(3);
        expect(countUnits('', 'en')).toBe(0);
        expect(countUnits('   ', 'en')).toBe(0);
    });

    test('số từ đổi màu khi ĐỦ', () => {
        // Không có tín hiệu này thì người viết phải bấm thử nút Chấm mới biết.
        expect(src).toMatch(/is-ok/);
        expect(css).toMatch(/\.essay-count\.is-ok\s*\{[^}]*color:\s*#16a34a/);
    });
});

describe('đổi đề thì BỎ bài cũ', () => {
    test('setEssay("") khi lấy đề mới', () => {
        // Giữ lại là người dùng nộp nhầm bài của đề trước, và AI chấm Task
        // Response rất thấp mà họ không hiểu vì sao.
        const i = src.indexOf('const handleNewPrompt');
        const body = src.slice(i, src.indexOf('const handleGrade', i));
        expect(body).toMatch(/setEssay\(''\)/);
        expect(body).toMatch(/setResult\(null\)/);
    });
});

describe('thiếu năng lượng → popup nạp', () => {
    test('mở popup thay vì chỉ báo lỗi', () => {
        // Người dùng vừa bỏ 40 phút viết bài — bắt họ tự đi tìm cửa hàng rồi
        // quay lại là cách nhanh nhất để họ bỏ luôn bài đó.
        expect(src).toMatch(/if \(err\?\.energyNeeded\)/);
        expect(src).toMatch(/Energy\.showRefillModal\(/);
    });

    test('mua xong CHẤM LUÔN, không bắt bấm lại', () => {
        const i = src.indexOf('err?.energyNeeded');
        expect(src.slice(i, i + 300)).toMatch(/onBought: \(\) => \{ gradeRef\.current\?\.\(\); \}/);
    });
});

describe('nói rõ band là ƯỚC LƯỢNG', () => {
    test('có dòng miễn trừ trên màn kết quả', () => {
        // Để người dùng tin band này là điểm thi thật thì họ vào phòng thi mới
        // vỡ mộng — nói trước là tôn trọng họ.
        expect(src).toMatch(/essay-disclaimer/);
        expect(src).toMatch(/AI ước lượng/);
        expect(src).toMatch(/có thể chênh lệch/);
    });
});

describe('hiển thị đủ 4 tiêu chí', () => {
    test('đúng bốn tiêu chí chính thức', () => {
        const i = src.indexOf('const CRITERIA');
        const body = src.slice(i, src.indexOf('];', i));
        for (const k of ['taskResponse', 'coherence', 'lexical', 'grammar']) {
            expect(body).toContain(k);
        }
    });

    test('mỗi tiêu chí có nhãn TIẾNG VIỆT', () => {
        // "Lexical Resource" không nói lên điều gì với người học Việt Nam.
        const i = src.indexOf('const CRITERIA');
        const body = src.slice(i, src.indexOf('];', i));
        for (const c of CRITERIA_VI) expect(body).toContain(`vi: '${c}'`);
    });
});

describe('cắm vào app', () => {
    test('nạp LƯỜI như các màn khác', () => {
        expect(app).toMatch(/const EssayScreen\s+= lazy\(/);
    });

    test('có trong bảng màn', () => {
        expect(app).toMatch(/'essay-screen': EssayScreen/);
    });

    test('có mục ở menu bên, khoá theo Level', () => {
        const menu = readFileSync(
            join(__dirname, '..', '..', 'layouts', 'SideMenu.jsx'), 'utf8');
        expect(menu).toMatch(/screen: 'essay-screen'/);
        expect(menu).toMatch(/feature: 'feature:essay'/);
    });
});

// ── Hỗ trợ TIẾNG TRUNG (HSK 书写) ─────────────────────────────────────────
//
// Chế độ này ban đầu chỉ làm cho tiếng Anh: người đang học HSK1 xin đề vẫn nhận
// được câu hỏi IELTS tiếng Anh. Hai chuẩn khác nhau thật sự — không phải một
// chuẩn dịch sang hai thứ tiếng — nên chỗ dễ hỏng là lẫn bộ tiêu chí và lẫn
// ĐƠN VỊ ĐẾM.
describe('tiếng Trung — bộ tiêu chí riêng', () => {
    test('có CẢ HAI bộ, không phải một bộ dịch ra', () => {
        expect(src).toMatch(/const CRITERIA_EN/);
        expect(src).toMatch(/const CRITERIA_ZH/);
    });

    test('bộ HSK có `characters`, bộ IELTS có `lexical`', () => {
        // Viết nhầm 的/得/地 là lỗi nặng của tiếng Trung, không có thứ tương
        // đương trong tiêu chí IELTS.
        const zh = src.slice(src.indexOf('const CRITERIA_ZH'), src.indexOf('const criteriaFor'));
        expect(zh).toContain('characters');
        expect(zh).not.toContain('lexical');

        const en = src.slice(src.indexOf('const CRITERIA_EN'), src.indexOf('const CRITERIA_ZH'));
        expect(en).toContain('lexical');
        expect(en).not.toContain('characters');
    });

    test('hiển thị theo ngôn ngữ của BÀI ĐÃ CHẤM, không phải đề hiện tại', () => {
        // Người dùng có thể đổi ngôn ngữ học sau khi chấm xong; đọc lại bài cũ
        // mà lấy bộ tiêu chí của đề mới là bốn ô trống.
        expect(src).toMatch(/const resultLang = result\?\.lang === 'zh'/);
        expect(src).toMatch(/criteriaFor\(resultLang\)/);
    });
});

describe('tiếng Trung — ĐƠN VỊ đếm', () => {
    test('đếm chữ Hán, không đếm theo khoảng trắng', () => {
        // Chạy THẬT hàm đếm cắt từ nguồn: tiếng Trung không có khoảng trắng nên
        // đếm theo từ ra đúng 1 cho cả bài, nút Chấm không bao giờ bật.
        const i = src.indexOf('function countUnits');
        const countUnits = new Function(
            `${src.slice(i, src.indexOf('\n}', i) + 2)}; return countUnits;`)();

        const zh = '我认为学习外语很重要。因为语言是沟通的工具。';
        expect(countUnits(zh, 'zh')).toBe(20);
        expect(countUnits(zh, 'en')).toBe(1);       // đúng cái bẫy
        expect(countUnits('one two three', 'en')).toBe(3);
    });

    test('không đếm dấu câu — nếu không thì nhồi 。，là qua ngưỡng', () => {
        const i = src.indexOf('function countUnits');
        const countUnits = new Function(
            `${src.slice(i, src.indexOf('\n}', i) + 2)}; return countUnits;`)();
        expect(countUnits('。，！？', 'zh')).toBe(0);
    });

    test('ngưỡng tiếng Trung THẤP hơn — HSK không viết 250 chữ', () => {
        // Đọc thẳng hằng số từ nguồn. Không dùng `new RegExp` với template
        // literal: `\d` trong template là ký tự `d`, regex im lặng không khớp.
        const min = (k) => {
            const line = src.split('\n').find(l => l.startsWith(`const ${k} =`));
            return Number(line.replace(/\D+/g, ''));
        };
        expect(min('MIN_ZH')).toBeLessThan(min('MIN_EN'));
    });

    test('nhãn đơn vị đổi theo ngôn ngữ (chữ / từ)', () => {
        expect(src).toMatch(/const unit = lang === 'zh' \? 'chữ' : 'từ'/);
        expect(src).toMatch(/\{words\} \/ \{minUnits\} \{unit\}/);
    });

    test('ngưỡng ưu tiên số SERVER gửi kèm đề', () => {
        // Server là nguồn quyết định; hằng số client chỉ để hiển thị trước khi
        // có đề, nếu không giao diện sẽ lệch với thứ server thật sự kiểm.
        expect(src).toMatch(/Number\(prompt\?\.minWords\) \|\|/);
    });
});

describe('tiếng Trung — không bịa thang điểm', () => {
    test('KHÔNG gọi điểm HSK là "Band"', () => {
        // HSK không có thang band; gọi 0–9 là "Band" là bịa ra thang không có.
        expect(src).toMatch(/resultLang === 'zh' \? 'Điểm tổng \(thang 9\)' : 'Band tổng'/);
    });

    test('nói rõ điểm KHÔNG phải cấp độ HSK', () => {
        expect(src).toMatch(/không\s*\n?\s*phải cấp độ HSK|không phải cấp độ HSK/);
    });

    test('màn giới thiệu nói đúng chuẩn NGAY khi chưa có đề', () => {
        // Người học tiếng Trung đọc "bài luận IELTS Task 2" sẽ tưởng chế độ này
        // không dành cho mình và thoát ra luôn.
        expect(src).toMatch(/GameState\.state\?\.settings\?\.vocabLang === 'zh'/);
        expect(src).toMatch(/HSK 书写/);
    });
});
