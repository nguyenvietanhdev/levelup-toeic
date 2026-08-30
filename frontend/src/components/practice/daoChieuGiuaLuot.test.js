/**
 * Đổi chiều hỏi–đáp GIỮA LƯỢT: hỏi trước, hai lựa chọn có hậu quả khác nhau.
 *
 * Bản cũ ghi thẳng lựa chọn rồi báo "áp dụng từ câu sau". Câu đó KHÔNG ĐÚNG với
 * phần lớn chế độ: chúng sinh trọn bộ câu hỏi ngay từ đầu lượt
 * (`generateQuestions`), nên đổi giữa chừng không đổi được câu nào của lượt
 * này. Người dùng đọc thông báo rồi chờ câu sau mà chẳng thấy gì.
 *
 * Hai lựa chọn giờ nói đúng việc chúng làm:
 *   · Giữ lượt này — KHOÁ chiều cũ tới hết lượt, chiều mới dùng từ lượt sau;
 *   · Đổi ngay     — chạy lại lượt theo chiều mới, mất tiến độ đang có.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const F = (...p) => readFileSync(join(__dirname, ...p), 'utf8');
const sw = F('LangPairSwitch.jsx');
const pm = F('practiceManager.js');
const gl = F('..', '..', 'game', 'gameLogic.js');

/** `isReversed` + khoá phiên, dựng từ chính mã nguồn rồi chạy thật. */
const dungKhoa = () => {
    const lay = (ten) => {
        const i = gl.indexOf(`    ${ten}(`);
        expect(i, `không tìm thấy ${ten}`).toBeGreaterThan(-1);
        return gl.slice(i, gl.indexOf('\n    },', i) + 6);
    };
    const kho = {};
    const obj = new Function('localStorage', `
        return {
            _daoPhien: null,
            ${lay('khoaDaoPhien')},
            ${lay('boKhoaDaoPhien')},
            ${lay('isReversed')}
        };`)({
        getItem: (k) => kho[k] ?? null,
        setItem: (k, v) => { kho[k] = String(v); },
    });
    return { obj, kho };
};

describe('khoá chiều theo LƯỢT', () => {
    let obj; let kho;
    beforeEach(() => { ({ obj, kho } = dungKhoa()); });

    test('không khoá → đọc theo lựa chọn đã lưu', () => {
        kho.reverseMode = 'true';
        expect(obj.isReversed()).toBe(true);
        kho.reverseMode = 'false';
        expect(obj.isReversed()).toBe(false);
    });

    test('khoá `false` thì lựa chọn mới KHÔNG ăn vào lượt này', () => {
        // Đây là cả ý nghĩa của "Giữ lượt này".
        kho.reverseMode = 'false';
        obj.khoaDaoPhien(false);
        kho.reverseMode = 'true';          // người dùng vừa đổi
        expect(obj.isReversed()).toBe(false);
    });

    test('khoá `true` cũng giữ được', () => {
        // Khoá phải giữ ĐÚNG giá trị truyền vào, không phải luôn `false`.
        kho.reverseMode = 'true';
        obj.khoaDaoPhien(true);
        kho.reverseMode = 'false';
        expect(obj.isReversed()).toBe(true);
    });

    test('bỏ khoá → quay lại đọc lựa chọn đã lưu', () => {
        obj.khoaDaoPhien(false);
        kho.reverseMode = 'true';
        obj.boKhoaDaoPhien();
        expect(obj.isReversed()).toBe(true);
    });

    test('`false` là giá trị khoá HỢP LỆ, không phải "chưa khoá"', () => {
        // Dùng `if (this._daoPhien)` thay vì `!== null` là khoá `false` bị bỏ
        // qua — đúng ca hay gặp nhất (đang chiều xuôi, đổi sang ngược).
        kho.reverseMode = 'true';
        obj.khoaDaoPhien(false);
        expect(obj.isReversed()).toBe(false);
    });
});

describe('lượt MỚI phải bỏ khoá', () => {
    test('`PracticeManager.start` gọi `boKhoaDaoPhien`', () => {
        // Không bỏ thì khoá sống mãi và lựa chọn mới KHÔNG BAO GIỜ có hiệu lực
        // — đúng thứ người dùng vừa chọn lại là thứ không xảy ra.
        const i = pm.indexOf('async start(mode) {');
        expect(i).toBeGreaterThan(-1);
        expect(pm.slice(i, i + 700)).toMatch(/GameLogic\.boKhoaDaoPhien\(\)/);
    });

    test('bỏ khoá TRƯỚC khi dựng câu hỏi', () => {
        const i = pm.indexOf('async start(mode) {');
        const than = pm.slice(i, i + 4000);
        const iBo = than.indexOf('boKhoaDaoPhien');
        const iPool = than.indexOf('_getFilteredPool');
        expect(iBo).toBeGreaterThan(-1);
        if (iPool > -1) expect(iBo).toBeLessThan(iPool);
    });
});

describe('popup hai lựa chọn', () => {
    test('có hỏi, không đổi thẳng', () => {
        expect(sw).toMatch(/Modal\.show\(/);
        expect(sw).toMatch(/Đảo chiều ngôn ngữ/);
    });

    test('đúng HAI nút, đúng nhãn', () => {
        expect(sw).toMatch(/text: 'Giữ lượt này'/);
        expect(sw).toMatch(/text: 'Đổi ngay'/);
    });

    test('"Giữ lượt này" khoá chiều CŨ rồi mới lưu lựa chọn mới', () => {
        const i = sw.indexOf("text: 'Giữ lượt này'");
        const khoi = sw.slice(i, sw.indexOf("text: 'Đổi ngay'", i));
        expect(khoi).toMatch(/GameLogic\.khoaDaoPhien\(dao\)/);
        expect(khoi).toMatch(/luuLuaChon\(daoMoi\)/);
        // Khoá phải nhận chiều CŨ (`dao`), không phải chiều mới.
        expect(khoi).not.toMatch(/khoaDaoPhien\(daoMoi\)/);
    });

    test('"Đổi ngay" chạy lại lượt', () => {
        const i = sw.indexOf("text: 'Đổi ngay'");
        const khoi = sw.slice(i, i + 900);
        expect(khoi).toMatch(/GameLogic\.boKhoaDaoPhien\(\)/);
        expect(khoi).toMatch(/PracticeManager\.start\(mode\)/);
    });

    test('"Đổi ngay" đọc `mode` TRƯỚC khi dọn session', () => {
        // `currentSession = null` rồi mới đọc `.mode` thì luôn `undefined` và
        // lượt không bao giờ chạy lại — nút bấm xong không có gì xảy ra.
        const i = sw.indexOf("text: 'Đổi ngay'");
        const khoi = sw.slice(i, i + 900);
        expect(khoi.indexOf('const mode = PracticeManager.currentSession?.mode'))
            .toBeLessThan(khoi.indexOf('PracticeManager.currentSession = null'));
    });

    test('nói RÕ là mất tiến độ', () => {
        // Chạy lại lượt là mất phần đã làm; không báo trước thì người dùng bấm
        // xong mới biết.
        const i = sw.indexOf('Modal.show(');
        expect(sw.slice(i, sw.indexOf('buttons:', i))).toMatch(/sẽ mất/);
    });

    test('KHÔNG hỏi khi đang không luyện tập', () => {
        // Không có lượt nào dở thì chẳng có gì để giữ — hỏi là thừa một bước.
        const i = sw.indexOf('const dangLuyen');
        expect(i).toBeGreaterThan(-1);
        // Phải suy từ PHIÊN THẬT. Gán cứng thì hoặc popup không bao giờ hiện,
        // hoặc hiện cả khi không luyện tập — cả hai đều lọt nếu chỉ soi
        // `if (!dangLuyen)`.
        expect(sw).toMatch(
            /const dangLuyen = !!PracticeManager\.currentSession\?\.mode;/);
        const khoi = sw.slice(i, sw.indexOf('Modal.show(', i));
        expect(khoi).toMatch(/if \(!dangLuyen\)/);
        expect(khoi).toMatch(/luuLuaChon\(daoMoi\)/);
        expect(khoi).toMatch(/return;/);
    });

    test('bỏ câu "áp dụng từ câu sau" — nó sai với phần lớn chế độ', () => {
        // Chúng sinh trọn bộ câu hỏi từ đầu lượt, nên không có "câu sau" nào
        // đổi chiều cả.
        //
        // Bỏ comment trước khi soi: chính lời giải thích trong mã nguồn cũng
        // trích lại câu cũ đó.
        const sach = sw.replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n').map((d) => d.replace(/\/\/.*$/, '')).join('\n');
        expect(sach).not.toMatch(/áp dụng từ câu sau/);
    });
});
