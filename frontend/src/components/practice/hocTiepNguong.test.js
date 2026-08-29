/**
 * Nút "Học tiếp" của Flashcard: chỉ mở khi đã thuộc đủ, và nằm ở CỤM PHẢI.
 *
 * Học tiếp với độ thuộc thấp là bỏ lại phần chưa thuộc rồi chồng thêm từ mới
 * lên trên — càng học càng nợ, mà popup vẫn báo "Hoàn thành" nên không có gì
 * cản.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'modes', 'flashcard.js'), 'utf8');
const pm = readFileSync(join(__dirname, 'practiceManager.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

/** `datNguongHocTiep` tách ra chạy thật, không cần dựng cả module. */
const NGUONG = Number(src.match(/const NGUONG_HOC_TIEP = (\d+)/)[1]);
const datNguong = (biet, chuaBiet) => {
    const tong = biet + chuaBiet;
    if (tong === 0) return true;
    return (biet / tong) * 100 >= NGUONG;
};

describe('ngưỡng độ thuộc', () => {
    test('ngưỡng là 80%', () => {
        expect(NGUONG).toBe(80);
    });

    test('đúng 80% thì ĐƯỢC đi tiếp', () => {
        // Biên: `>=` chứ không `>`. Đúng ngưỡng mà bị chặn là người dùng
        // không hiểu vì sao "80%" vẫn không mở.
        expect(datNguong(16, 4)).toBe(true);
        expect(datNguong(4, 1)).toBe(true);
    });

    test('dưới 80% thì KHÔNG', () => {
        expect(datNguong(15, 5)).toBe(false);
        expect(datNguong(3, 2)).toBe(false);
        expect(datNguong(0, 3)).toBe(false);
    });

    test('lô rỗng thì cho qua, không kẹt cứng', () => {
        // Không có gì để thuộc thì chặn là không thoát ra được.
        expect(datNguong(0, 0)).toBe(true);
    });

    test('100% dĩ nhiên qua', () => {
        expect(datNguong(3, 0)).toBe(true);
    });
});

describe('mã nguồn dùng đúng phép so ấy', () => {
    test('`datNguongHocTiep` đếm theo known/unknown của LÔ', () => {
        // Không đọc `currentSession`: `finalizeSession()` chạy trước
        // `showSummary` và dọn session, tới đây số liệu ở đó có thể đã mất.
        const i = src.indexOf('datNguongHocTiep() {');
        expect(i).toBeGreaterThan(-1);
        const than = src.slice(i, src.indexOf('\n    },', i));
        expect(than).toMatch(/this\.knownWords\.length/);
        expect(than).toMatch(/this\.unknownWords\.length/);
        expect(than).not.toMatch(/currentSession/);
    });

    test('dùng `>=` chứ không `>`', () => {
        const i = src.indexOf('datNguongHocTiep() {');
        const than = src.slice(i, src.indexOf('\n    },', i));
        expect(than).toMatch(/>= NGUONG_HOC_TIEP/);
    });

    test('lô rỗng trả `true` — chạy CHÍNH hàm trong mã nguồn', () => {
        // Chia cho 0 ra NaN, mà `NaN >= 80` là false — nút biến mất ở lô rỗng.
        //
        // Dựng hàm TỪ MÃ NGUỒN rồi gọi thật, thay vì so vị trí hai `indexOf`:
        // gỡ mất dòng guard thì cả hai trả -1, mà `-1 < n` vẫn đúng → test
        // XANH GIẢ, không còn kiểm gì nữa mà không ai biết.
        const i = src.indexOf('datNguongHocTiep() {');
        expect(i).toBeGreaterThan(-1);
        const than = src.slice(src.indexOf('{', i) + 1, src.indexOf('\n    },', i));

        const ham = new Function('NGUONG_HOC_TIEP', `return function () { ${than} };`)(NGUONG);
        const goi = (biet, chuaBiet) => ham.call({
            knownWords: new Array(biet).fill(0),
            unknownWords: new Array(chuaBiet).fill(0),
        });

        expect(goi(0, 0)).toBe(true);
        expect(goi(16, 4)).toBe(true);
        expect(goi(15, 5)).toBe(false);
    });

    test('nút "Học tiếp" bọc trong điều kiện ngưỡng', () => {
        const i = src.indexOf("text: 'Học tiếp'");
        expect(i).toBeGreaterThan(-1);
        // Nhìn ngược lên: khai báo mảng chứa nó phải có lời gọi ngưỡng.
        const truoc = src.slice(Math.max(0, i - 400), i);
        expect(truoc).toMatch(/datNguongHocTiep\(\)/);
    });
});

describe('vị trí: cụm PHẢI', () => {
    test('Flashcard đưa "Học tiếp" vào `extraButtonsRight`', () => {
        const i = src.indexOf("text: 'Học tiếp'");
        const truoc = src.slice(Math.max(0, i - 400), i);
        expect(truoc).toMatch(/extraButtonsRight/);
    });

    test('"Ôn lại từ chưa biết" vẫn ở cụm TRÁI', () => {
        const i = src.indexOf('Ôn lại ${this.unknownWords.length}');
        expect(i).toBeGreaterThan(-1);
        const truoc = src.slice(Math.max(0, i - 300), i);
        expect(truoc).toMatch(/const extraButtons =/);
        expect(truoc).not.toMatch(/extraButtonsRight/);
    });

    test('PracticeManager trải `extraButtonsRight` SAU "Về trang chủ"', () => {
        // `.pr-btn-home` có `margin-right: auto`, nên mọi nút TRƯỚC nó bị dồn
        // sang trái. Đặt sai phía là nút vẫn hiện nhưng nằm xa tay.
        const iHome = pm.indexOf("className: 'btn-secondary pr-btn-home'");
        const iRight = pm.indexOf('...extraButtonsRight');
        expect(iRight).toBeGreaterThan(-1);
        expect(iRight).toBeGreaterThan(iHome);
    });

    test('`extraButtons` (trái) vẫn trải TRƯỚC "Về trang chủ"', () => {
        // Neo vào `className` của nút: chuỗi `pr-btn-home` trần xuất hiện
        // TRƯỚC ở comment giải thích, nằm trên cả hai chỗ trải mảng.
        const iHome = pm.indexOf("className: 'btn-secondary pr-btn-home'");
        // Dùng regex có ranh giới: `indexOf('...extraButtons,')` khớp TRÚNG
        // `...extraButtonsRight,` — cùng tiền tố, nên bắt nhầm cụm phải.
        const iLeft = pm.search(/\.\.\.extraButtons,/);
        expect(iLeft).toBeGreaterThan(-1);
        expect(iLeft).toBeLessThan(iHome);
    });

    test('CSS vẫn tách hai cụm bằng `margin-right: auto`', () => {
        expect(css).toMatch(/\.pr-btn-home \{\s*margin-right: auto/);
    });
});
