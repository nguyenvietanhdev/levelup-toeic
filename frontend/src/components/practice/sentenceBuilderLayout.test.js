/**
 * Xếp câu: khối kết quả phải xếp DỌC.
 *
 * Lỗi người dùng báo (ảnh chụp trên điện thoại): "Câu của bạn" và "Đáp án đúng"
 * nằm cạnh nhau, bị bóp thành hai cột hẹp — chữ rơi xuống thành cột dựng đứng,
 * mỗi dòng một hai chữ, gần như không đọc được.
 *
 * Nguyên nhân: `.sentence-area` là `display: flex` hướng mặc định `row`. Ở
 * trạng thái làm bài điều đó ĐÚNG (các cụm từ ghép thành một câu nằm ngang),
 * nhưng khi hiện kết quả thì hai khối là hai CÂU để so sánh — mà so sánh hai
 * câu thì phải xếp trên–dưới.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'modes', 'sentenceBuilder.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

describe('kết quả xếp dọc', () => {
    test('có lớp riêng cho trạng thái kết quả', () => {
        const i = css.indexOf('.sentence-area.has-result {');
        expect(i).toBeGreaterThan(-1);
        const rule = css.slice(i, css.indexOf('}', i));
        expect(rule).toMatch(/flex-direction: column/);
    });

    test('hai khối căng đủ chiều rộng, không co lại', () => {
        // `align-items: center` mặc định làm mỗi khối chỉ rộng bằng nội dung —
        // hai khung lệch nhau trông như hỏng.
        const i = css.indexOf('.sentence-area.has-result {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/align-items: stretch/);
    });

    test('lớp được GẮN khi hiện kết quả', () => {
        expect(src).toMatch(/sentenceArea\.classList\.add\('has-result'\)/);
    });

    test('lớp được GỠ khi làm lại / sửa câu', () => {
        // Không gỡ thì khung kẹt ở dạng dọc, và các cụm từ đang xếp bị đổ thành
        // một cột — mỗi cụm một dòng, không còn nhìn ra câu.
        const i = src.indexOf('updateSentenceArea() {');
        const than = src.slice(i, i + 500);
        expect(than).toMatch(/classList\.remove\('has-result'\)/);
    });

    test('gắn lớp TRƯỚC khi ghi nội dung', () => {
        // Ghi HTML rồi mới đổi hướng thì có một khung hình bố cục sai — người
        // dùng thấy nó nhảy.
        const i = src.indexOf("classList.add('has-result')");
        const j = src.indexOf('result-sentence wrong');
        expect(i).toBeGreaterThan(-1);
        expect(i).toBeLessThan(j);
    });
});

describe('trạng thái làm bài vẫn xếp ngang', () => {
    test('`.sentence-area` giữ hướng ngang mặc định', () => {
        // Các cụm từ ghép thành một CÂU — xếp dọc là mỗi cụm một dòng.
        const i = css.indexOf('.sentence-area {');
        const rule = css.slice(i, css.indexOf('}', i));
        expect(rule).toMatch(/display: flex/);
        expect(rule).not.toMatch(/flex-direction: column/);
    });

    test('cụm từ XUỐNG DÒNG được khi câu dài', () => {
        // Không wrap thì câu dài tràn ra ngoài khung.
        const i = css.indexOf('.sentence-area {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/flex-wrap: wrap/);
    });
});

describe('khoảng cách giữa hai khối', () => {
    test('dùng `gap`, không dùng margin inline', () => {
        // Margin inline chỉ áp cho một khối; `gap` là khoảng cách THẬT giữa hai
        // phần tử và tự biến mất khi chỉ có một khối (câu đúng).
        const i = css.indexOf('.sentence-area.has-result {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/gap:/);
        expect(src).not.toMatch(/style="margin-top: 10px; animation-delay/);
    });
});

describe('nút Dịch và Nghe ở khối kết quả', () => {
    test('có cả hai nút', () => {
        expect(src).toMatch(/class="btn-speak-mini rs-translate"/);
        expect(src).toMatch(/class="btn-speak-mini rs-speak"/);
    });

    test('nút DỊCH đứng trước nút LOA', () => {
        // Đọc hiểu rồi mới nghe — cùng thứ tự với Flashcard và Trắc nghiệm, để
        // tay quen một chỗ là quen mọi chỗ.
        expect(src.indexOf('rs-translate')).toBeLessThan(src.indexOf('rs-speak'));
    });

    test('CHỈ gắn vào câu đúng, KHÔNG gắn vào câu sai', () => {
        // Câu sai là thứ người học vừa tự ghép ra — nghe lại nó là học thuộc
        // cái sai, còn dịch nó thì ra một câu tiếng Việt lộn xộn.
        const i = src.indexOf('result-sentence wrong animate-pop');
        const khoiSai = src.slice(i, src.indexOf('</div>', i));
        expect(khoiSai).not.toMatch(/nutHoTro/);
        // Và khối đúng thì có.
        const j = src.indexOf('result-sentence correct" style=');
        expect(src.slice(j, src.indexOf('</div>', j))).toMatch(/nutHoTro/);
    });

    test('luôn phát/dịch CÂU ĐÚNG, không phải câu người dùng gõ', () => {
        expect(src).toMatch(/const cauDung = this\.correctSentence/);
        expect(src).toMatch(/GameLogic\.speakWord\(cauDung\)/);
        expect(src).toMatch(/TRANSLATE_REQUESTED, \{ text: cauDung \}/);
    });

    test('chặn nổi bọt trên cả hai nút', () => {
        // Khu vực kết quả nằm trong vùng có handler khác; không chặn thì một cú
        // bấm chạy hai việc.
        for (const cls of ['rs-speak', 'rs-translate']) {
            const i = src.indexOf(`.${cls}')`);
            expect(src.slice(i, i + 200)).toMatch(/e\.stopPropagation\(\)/);
        }
    });

    test('hàng nút xuống DÒNG RIÊNG, không chen cuối câu', () => {
        // Câu ở đây dài mấy dòng; nhét nút vào cuối dòng cuối thì nó trôi theo
        // độ dài câu và mỗi lần một chỗ.
        const i = css.indexOf('.result-actions {');
        expect(i).toBeGreaterThan(-1);
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/width: 100%/);
        // Và khối cha phải cho phép xuống dòng.
        const j = css.indexOf('.result-sentence {');
        expect(css.slice(j, css.indexOf('}', j))).toMatch(/flex-wrap: wrap/);
    });

    test('KHÔNG khai thêm `.result-sentence` lần nữa', () => {
        // File này đã có 2 rule cho selector đó (rule sau bổ sung rule trước).
        // Thêm rule thứ ba là một chỗ nữa để quên khi sửa.
        expect(css.split('\n.result-sentence {').length - 1).toBe(2);
    });
});
