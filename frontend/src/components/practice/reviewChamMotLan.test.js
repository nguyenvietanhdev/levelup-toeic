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

describe('kiểu PHÁT ÂM có BA lần thử', () => {
    const t = than('ganPhatAm(question) {');

    test('hằng số khai riêng, giá trị 3', () => {
        // Nhận dạng giọng nói không phải phép đo chính xác: micro rè, tiếng ồn,
        // hay máy nghe hụt một âm là trượt — mà người học không sai gì cả. Một
        // lần duy nhất biến những ca đó thành "sai", rồi lịch ôn đẩy từ ấy quay
        // lại sớm hơn mức cần.
        expect(src).toMatch(/const SO_LAN_NOI = 3;/);
    });

    test('đếm lần thử, đặt lại ở ĐẦU mỗi câu', () => {
        // Không đặt lại thì câu trước dùng hết lượt là câu sau chấm sai ngay
        // lần nói đầu tiên.
        expect(t).toMatch(/this\._soLanNoi = 0;/);
        expect(t.indexOf('this._soLanNoi = 0')).toBeLessThan(t.indexOf('const bat ='));
    });

    test('sai mà CÒN lượt thì chưa chấm', () => {
        expect(t).toMatch(/if \(!diem\.correct && conLai > 0\)/);
        // Và phải THOÁT khỏi nhánh chấm.
        const i = t.indexOf('if (!diem.correct && conLai > 0)');
        expect(t.slice(i, i + 700)).toMatch(/return;/);
    });

    test('nhánh còn lượt KHÔNG gọi `khoaLai` hay `ketThucCau`', () => {
        // `khoaLai` vừa đặt cờ "đã chấm" vừa vô hiệu hoá nút mic, nên gọi sớm
        // là người học không bấm lại được và lượt thử còn lại thành vô nghĩa.
        //
        // Bỏ comment trước khi soi: chính lời giải thích trong nhánh cũng nhắc
        // tên hai hàm đó.
        const i = t.indexOf('if (!diem.correct && conLai > 0)');
        const nhanh = t.slice(i, t.indexOf('return;', i))
            .replace(/\/\/.*/g, '');
        expect(nhanh).not.toMatch(/khoaLai\(\)/);
        expect(nhanh).not.toMatch(/ketThucCau\(/);
    });

    test('nói ĐÚNG thì chấm ngay, không bắt thử đủ ba lần', () => {
        // Điều kiện có `!diem.correct` nên đúng là rơi thẳng xuống nhánh chấm.
        const i = t.indexOf('this._soLanNoi += 1');
        const sau = t.slice(i);
        expect(sau).toMatch(/khoaLai\(\);/);
        expect(sau).toMatch(/this\.ketThucCau\(diem\.correct, question, tu\)/);
    });

    test('hết lượt thì chấm SAI, không cho thử mãi', () => {
        // `conLai > 0` là điều kiện duy nhất giữ câu lại; hết lượt thì rơi
        // xuống `khoaLai()` + `ketThucCau`.
        expect(t).toMatch(/const conLai = SO_LAN_NOI - this\._soLanNoi;/);
    });

    test('báo còn mấy lần thử', () => {
        // Không báo thì người học không biết mình còn cơ hội, và bỏ qua luôn.
        expect(t).toMatch(/còn \$\{conLai\} lần thử/);
    });

    test('lời nhắc trên màn hình nói rõ có mấy lần', () => {
        expect(src).toMatch(/còn \$\{SO_LAN_NOI\} lần thử/);
    });

    test('MỘT CÂU vẫn chỉ chấm MỘT lần', () => {
        // Ba lần thử không được phá luật cũ: chỉ đúng một lời gọi `ketThucCau`
        // trong nhánh chấm của `onresult`.
        const i = t.indexOf('rec.onresult');
        const j = t.indexOf('rec.onend', i);
        expect((t.slice(i, j).match(/ketThucCau\(/g) || []).length).toBe(1);
    });
});

describe('may nghe SAI HE CHU thi khong cham', () => {
    const t = than('ganPhatAm(question) {');

    test('xin tiếng Trung mà nhận lại chữ Latin → không chấm', () => {
        // Đó là lỗi của khâu nhận dạng, không phải người học phát âm sai.
        // Chấm sai ở đây là phạt oan, mà còn đẩy từ đó quay lại sớm hơn
        // mức cần trong lịch ôn.
        expect(t).toMatch(/if \(laZh && chu && !HAN_RE\.test\(chu\)\)/);
    });

    test('nhánh đó THOÁT trước khi chấm', () => {
        const i = t.indexOf('if (laZh && chu && !HAN_RE.test(chu))');
        const nhanh = t.slice(i, t.indexOf('scoreAttempt(', i));
        expect(nhanh).toMatch(/return;/);
    });

    test('KHÔNG trừ lượt thử', () => {
        // Cùng lý do với "chưa nghe thấy gì": phạt phải dành cho lỗi phát âm.
        const i = t.indexOf('if (laZh && chu && !HAN_RE.test(chu))');
        const nhanh = t.slice(i, t.indexOf('return;', i));
        expect(nhanh).not.toMatch(/_soLanNoi \+= 1/);
    });

    test('tăng bộ đếm SAU nhánh đó', () => {
        const iChan = t.indexOf('!HAN_RE.test(chu)');
        const iDem = t.indexOf('this._soLanNoi += 1');
        expect(iChan).toBeGreaterThan(-1);
        expect(iDem).toBeGreaterThan(iChan);
    });

    test('chỉ áp dụng khi ĐANG xin tiếng Trung', () => {
        // Kho tiếng Anh nhận chữ Latin là đúng — chặn ở đó là không bao giờ
        // chấm được câu nào.
        expect(t).toMatch(/laZh && chu &&/);
    });

    test('hiện MÃ ngôn ngữ đang nghe', () => {
        // Không hiện thì khi máy nghe sai, không ai biết là app xin sai mã
        // hay trình duyệt phớt lờ mã đúng.
        expect(t).toMatch(/Đang nghe… \(\$\{maNghe\}\)/);
    });
});

describe('bộ đếm lượt thử ĐẾM NGƯỢC', () => {
    const t = than('ganPhatAm(question) {');

    /** `veLuotNoi` dựng từ chính mã nguồn rồi chạy thật trên DOM giả. */
    const dung = (daThu) => {
        const i = src.indexOf('veLuotNoi() {');
        expect(i).toBeGreaterThan(-1);
        const than_ = src.slice(src.indexOf('{', i) + 1, src.indexOf('\n    },', i));
        const el = {
            textContent: '',
            classList: {
                _c: new Set(),
                toggle(k, v) { if (v) this._c.add(k); else this._c.delete(k); },
                has(k) { return this._c.has(k); },
            },
        };
        const doc = { getElementById: () => el };
        const f = new Function('document', 'SO_LAN_NOI',
            `return function () { ${than_} };`)(doc, 3);
        f.call({ _soLanNoi: daThu });
        return el;
    };

    test('chưa thử lần nào → còn 3', () => {
        expect(dung(0).textContent).toBe('còn 3 lần thử');
    });

    test('thử 1 lần → còn 2', () => {
        expect(dung(1).textContent).toBe('còn 2 lần thử');
    });

    test('thử 2 lần → còn 1, và ĐỔI MÀU cảnh báo', () => {
        const el = dung(2);
        expect(el.textContent).toContain('1');
        expect(el.classList.has('sap-het')).toBe(true);
    });

    test('hết lượt → báo hết, không hiện số âm', () => {
        const el = dung(3);
        expect(el.textContent).toMatch(/hết lượt/);
        expect(el.classList.has('het')).toBe(true);
        expect(el.textContent).not.toMatch(/-/);
    });

    test('lỡ đếm quá số lượt vẫn báo ĐÚNG trạng thái hết', () => {
        // `Math.max(0, ...)`: không kẹp sàn thì `conLai === 0` sai ở mọi giá trị
        // vượt ngưỡng, nên lớp `het` không được bật — dòng nhắc giữ nguyên màu
        // thường trong khi người học đã hết lượt.
        const el = dung(9);
        expect(el.textContent).toBe('hết lượt thử');
        expect(el.classList.has('het')).toBe(true);
        expect(el.classList.has('sap-het')).toBe(false);
    });

    test('vẽ lại NGAY khi dựng câu', () => {
        // Không gọi thì câu mới vẫn hiện số của câu trước.
        const i = t.indexOf('this._soLanNoi = 0;');
        expect(t.slice(i, i + 120)).toMatch(/this\.veLuotNoi\(\)/);
    });

    test('vẽ lại SAU mỗi lần thử', () => {
        const i = t.indexOf('this._soLanNoi += 1;');
        expect(t.slice(i, i + 120)).toMatch(/this\.veLuotNoi\(\)/);
    });

    test('dòng nhắc có phần tử riêng để cập nhật', () => {
        // Ghi thẳng trong thẻ <p> thì không sửa được số mà không vẽ lại cả khối.
        expect(src).toMatch(/id="rm-speak-luot"/);
    });
});
