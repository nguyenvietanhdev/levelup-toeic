/**
 * "Ôn lại từ sai": MỘT CÂU CHỈ CHẤM MỘT LẦN trong cùng một phiên.
 *
 * Chấm hai lần không chỉ sai điểm hiển thị: `recordAnswer` đẩy `masteryLevel`
 * của từ đi hai bậc, nên từ vừa ôn bị coi là thuộc hơn thực tế và lịch ôn giãn
 * ra sai — đúng thứ chế độ này sinh ra để chống.
 *
 * Ba kiểu từng hở:
 *   · `speak`     — chấm xong bấm mic lần nữa là chấm lại từ đầu;
 *   · `hanzi`     — ba đường vào (tô xong / xem mẫu rồi tô / "Bỏ qua chữ này")
 *                   không chặn nhau;
 *   · `flashcard` — nút bị vô hiệu hoá SAU khi chấm, hai cú bấm thật nhanh vẫn
 *                   lọt cả hai.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'modes', 'reviewMistakes.js'), 'utf8');

/** Thân một hàm, cắt tới hàm kế tiếp. */
const than = (ten) => {
    const i = src.indexOf(ten);
    expect(i, `không tìm thấy ${ten}`).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('\n    },', i));
};

/**
 * `ketThucCau` dựng từ chính mã nguồn rồi chạy thật.
 *
 * Chỉ giữ phần chặn: phần còn lại đụng `PracticeManager`, `Notification`, DOM…
 * Cắt tại lời gọi `recordAnswer` — đó là ranh giới "đã chấm thật".
 */
const dungKetThucCau = () => {
    const t = than('ketThucCau(dung, question, dapAn) {');
    const dau = t.indexOf('{') + 1;
    const cuoi = t.indexOf('PracticeManager.recordAnswer');
    expect(cuoi).toBeGreaterThan(-1);
    const phanChan = t.slice(dau, cuoi);

    const goi = [];
    const ctx = {
        huyOVe() {}, _dungNghe() {},
        _cham(d, q) { goi.push(d); },
    };
    // Thay `PracticeManager.recordAnswer(...)` bằng bộ đếm của test.
    const ham = new Function('dung', 'question', 'dapAn',
        `${phanChan}\n this._cham(dung, question); return true;`);
    return {
        chay: (q, d) => ham.call(ctx, d, q, ''),
        soLan: () => goi.length,
    };
};

describe('chặn ở `ketThucCau` — điểm chung của cả tám kiểu', () => {
    test('lần chấm ĐẦU đi qua', () => {
        const { chay, soLan } = dungKetThucCau();
        const q = { word: { en: 'hello' } };
        chay(q, true);
        expect(soLan()).toBe(1);
    });

    test('lần chấm THỨ HAI bị chặn', () => {
        const { chay, soLan } = dungKetThucCau();
        const q = { word: { en: 'hello' } };
        chay(q, true);
        chay(q, true);
        chay(q, false);
        expect(soLan()).toBe(1);
    });

    test('câu KHÁC vẫn chấm được', () => {
        // Chặn nhầm cả câu sau thì cả lượt đứng im sau câu đầu.
        const { chay, soLan } = dungKetThucCau();
        chay({ word: { en: 'a' } }, true);
        chay({ word: { en: 'b' } }, true);
        expect(soLan()).toBe(2);
    });

    test('quay lại câu cũ bằng nút "Trước" cũng KHÔNG chấm lại', () => {
        // Cờ nằm trên chính đối tượng câu hỏi nên còn nguyên khi quay lại —
        // đây là lý do không đặt cờ trên `this`.
        const { chay, soLan } = dungKetThucCau();
        const q1 = { word: { en: 'a' } };
        const q2 = { word: { en: 'b' } };
        chay(q1, true);
        chay(q2, true);
        chay(q1, true);   // bấm "Trước" rồi trả lời lại
        expect(soLan()).toBe(2);
    });

    test('`question` rỗng không làm sập', () => {
        const { chay } = dungKetThucCau();
        expect(() => chay(undefined, true)).not.toThrow();
        expect(() => chay(null, false)).not.toThrow();
    });
});

describe('cờ đặt trên CÂU HỎI, không phải trên `this`', () => {
    test('dùng `question._daCham`', () => {
        // Đối tượng câu hỏi sống đúng bằng một câu nên không phải nhớ dọn ở
        // đâu cả; cờ trên `this` thì phải dọn đúng chỗ, mà quên là hỏng.
        const t = than('ketThucCau(dung, question, dapAn) {');
        expect(t).toMatch(/question\?\._daCham/);
        expect(t).toMatch(/question\._daCham = true/);
    });

    test('chặn TRƯỚC mọi thứ khác trong hàm', () => {
        const t = than('ketThucCau(dung, question, dapAn) {');
        const iChan = t.indexOf('_daCham');
        expect(iChan).toBeLessThan(t.indexOf('this.huyOVe()'));
        expect(iChan).toBeLessThan(t.indexOf('PracticeManager.recordAnswer'));
    });
});

describe('kiểu PHÁT ÂM: khoá điều khiển sau khi chấm', () => {
    const t = than('ganPhatAm(question) {');

    test('cờ đặt lại ở ĐẦU mỗi câu', () => {
        // `ganPhatAm` gọi một lần cho mỗi câu nói; không đặt lại thì câu sau
        // thừa hưởng cờ đã bật và không bấm mic được.
        expect(t).toMatch(/this\._daChamNoi = false/);
        expect(t.indexOf('this._daChamNoi = false')).toBeLessThan(t.indexOf('const bat ='));
    });

    test('bấm mic lần nữa sau khi chấm bị chặn', () => {
        const i = t.indexOf('const bat = () => {');
        expect(t.slice(i, i + 220)).toMatch(/if \(this\._daChamNoi\) return;/);
    });

    test('nút mic và nút Bỏ qua đều bị vô hiệu hoá', () => {
        expect(t).toMatch(/nut\.disabled = true/);
        expect(t).toMatch(/nutBoQua\.disabled = true/);
    });

    test('"Bỏ qua từ này" cũng chỉ ăn MỘT lần', () => {
        const i = t.indexOf("nutBoQua?.addEventListener");
        expect(t.slice(i, i + 200)).toMatch(/if \(this\._daChamNoi\) return;/);
    });

    test('KHÔNG dùng biến cục bộ `daCham` nữa', () => {
        // Đó là gốc của bug: mỗi lần bấm mic gọi `bat()` mới nên biến cục bộ
        // chỉ chặn trùng trong CÙNG một lượt nghe.
        expect(t).not.toMatch(/let daCham = false/);
    });

    test('`ketThucCau` KHÔNG dọn cờ nói', () => {
        // Hàm đó chạy ngay khi chấm xong; dọn ở đấy là mở lại đường chấm lần
        // hai — đúng thứ vừa chặn.
        expect(than('ketThucCau(dung, question, dapAn) {'))
            .not.toMatch(/_donCoNoi\(\)/);
    });

    test('đã chấm thì lỗi mic không ghi đè câu nhận xét', () => {
        const i = t.indexOf('rec.onerror');
        expect(t.slice(i, i + 500)).toMatch(/this\._daChamNoi/);
    });
});
