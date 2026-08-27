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

    test('hàng nút nằm CÙNG HÀNG, sát mép phải', () => {
        // Bản trước dùng `width: 100%` nên hai icon nhỏ chiếm nguyên một dòng —
        // phí chỗ và đẩy khối cao thêm. Nay `margin-left: auto` đẩy chúng sang
        // phải, cùng hàng với nội dung.
        const i = css.indexOf('.result-actions {');
        expect(i).toBeGreaterThan(-1);
        const rule = css.slice(i, css.indexOf('}', i));
        expect(rule).toMatch(/margin-left: auto/);
        expect(rule).not.toMatch(/width: 100%/);
    });

    test('nút KHÔNG bị co lại khi câu dài', () => {
        // Cùng hàng với chữ thì flex co mọi thứ; không khoá thì hai icon bị bóp
        // méo trên màn hẹp.
        const i = css.indexOf('.result-actions {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/flex-shrink: 0/);
    });

    test('nút căn GIỮA theo chiều dọc, không dính mép trên', () => {
        // Khối cha căn `flex-start` (để icon không trôi xuống lưng chừng), nên
        // hàng nút phải tự căn lại — không thì nó dính lên đỉnh khối.
        const i = css.indexOf('.result-actions {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/align-self: center/);
    });

    test('khối cha vẫn cho xuống dòng khi chật', () => {
        // Câu rất dài trên màn hẹp thì hàng nút vẫn phải rơi xuống được, thay vì
        // bóp câu lại.
        const j = css.indexOf('.result-sentence {');
        expect(css.slice(j, css.indexOf('}', j))).toMatch(/flex-wrap: wrap/);
    });

    test('KHÔNG khai thêm `.result-sentence` lần nữa', () => {
        // File này đã có 2 rule cho selector đó (rule sau bổ sung rule trước).
        // Thêm rule thứ ba là một chỗ nữa để quên khi sửa.
        expect(css.split('\n.result-sentence {').length - 1).toBe(2);
    });
});

describe('màu và bố cục khối kết quả', () => {
    test('khối ĐÚNG dùng màu xanh, KHÔNG dùng `--primary-color`', () => {
        // `--primary-color` của theme này là đỏ hồng (#E11D48), nên khối đúng và
        // khối sai ra CÙNG MỘT MÀU ĐỎ — người học nhìn hai khung đỏ cạnh nhau
        // không biết cái nào là đáp án.
        const i = css.indexOf('.result-sentence.correct {');
        const rule = css.slice(i, css.indexOf('}', i));
        expect(rule).toMatch(/--success-color/);
        expect(rule).not.toMatch(/--primary-color/);
    });

    test('khối SAI vẫn đỏ — hai khối phải khác màu nhau', () => {
        const i = css.indexOf('.result-sentence.wrong {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/--error-color/);
    });

    test('KHÔNG dùng `<br>` giữa các mục flex', () => {
        // `<br>` giữa các mục flex không xuống dòng như trong văn bản thường:
        // icon, nhãn và câu thành ba mục riêng, căn lệch nhau và nhãn trôi khỏi
        // câu — đúng thứ trông như hỏng trong ảnh người dùng gửi.
        const i = src.indexOf('const than = (nhan, cau)');
        expect(i).toBeGreaterThan(-1);
        const khoi = src.slice(i, src.indexOf('};', i));
        expect(khoi).not.toMatch(/<br>/);
        expect(khoi).toMatch(/class="rs-body"/);
    });

    test('nhãn và câu bọc trong MỘT khối xếp dọc', () => {
        const i = css.indexOf('.rs-body {');
        expect(i).toBeGreaterThan(-1);
        const rule = css.slice(i, css.indexOf('}', i));
        expect(rule).toMatch(/flex-direction: column/);
        // `flex: 1` để chiếm hết chiều ngang còn lại sau icon — thiếu thì câu bó
        // theo độ dài nội dung và hàng nút bị kéo lên nằm cạnh nó.
        expect(rule).toMatch(/flex: 1/);
        expect(rule).toMatch(/min-width: 0/);
    });

    test('icon căn ĐẦU, không căn giữa', () => {
        // Khối có hai dòng (nhãn + câu); căn giữa thì icon trôi xuống lưng chừng.
        const i = css.indexOf('.result-sentence {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/align-items: flex-start/);
    });

    test('câu tiếng Trung ngắt dòng được', () => {
        // Không có khoảng trắng giữa các chữ nên không tự xuống dòng.
        const i = css.indexOf('.rs-text {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/word-break: break-word/);
    });
});

describe('ô Từ khoá: phiên âm + nút nghe', () => {
    test('hiện phiên âm khi từ có', () => {
        expect(src).toMatch(/question\.word\.phonetic \? `<span class="sb-phonetic">/);
    });

    test('KHÔNG chừa chỗ trống khi từ chưa có phiên âm', () => {
        // 14 khung câu trong bộ giao tiếp cố ý không có phiên âm; hiện một dải
        // trống ở đó là bố cục nhảy giữa các câu.
        const i = src.indexOf('sb-phonetic');
        expect(src.slice(Math.max(0, i - 60), i)).toMatch(/phonetic \? `/);
    });

    test('có nút nghe từ khoá', () => {
        expect(src).toMatch(/class="btn-speak-mini sb-key-speak"/);
    });

    test('nút đọc câu hỏi từ STATE, không dùng biến tự do', () => {
        // `attachListeners()` gọi không đối số — dùng thẳng `question` là
        // `ReferenceError` ngay khi bấm, mà build KHÔNG bắt (lỗi lúc chạy).
        // Soi chỗ GẮN sự kiện, không phải chỗ khai nút trong markup.
        const i = src.indexOf(".sb-key-speak')");
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, i + 400)).toMatch(/this\.questions\[this\.currentIndex\]/);
    });

    test('không truyền cứng ngôn ngữ cho `speakWord`', () => {
        // Bộ từ tiếng Trung đọc bằng giọng Anh thì không nghe ra chữ nào.
        const i = src.indexOf(".sb-key-speak')");
        expect(src.slice(i, i + 400)).not.toMatch(/speakWord\([^)]*['"]en-US/);
    });

    test('chặn nổi bọt', () => {
        const i = src.indexOf(".sb-key-speak')");
        expect(src.slice(i, i + 400)).toMatch(/e\.stopPropagation\(\)/);
    });

    test('hàng từ khoá xuống dòng được khi chật', () => {
        // Từ + phiên âm + nghĩa + nút trên màn hẹp không đủ một hàng.
        const i = css.indexOf('.sb-hint-value {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/flex-wrap: wrap/);
    });
});

describe('nghe lại câu mình xếp sai', () => {
    test('khối câu SAI có nút loa riêng', () => {
        expect(src).toMatch(/class="btn-speak-mini rs-speak-wrong"/);
    });

    test('nút đó đọc câu NGƯỜI DÙNG xếp, không đọc câu đúng', () => {
        // Đọc câu đúng ở cả hai khối thì nút trên khối sai thành vô nghĩa —
        // không nghe ra mình sai chỗ nào.
        const i = src.indexOf(".rs-speak-wrong')");
        expect(i).toBeGreaterThan(-1);
        const than = src.slice(i, i + 300);
        expect(than).toMatch(/speakWord\(userSentence\)/);
        expect(than).not.toMatch(/speakWord\(cauDung\)/);
    });

    test('khối SAI KHÔNG có nút dịch', () => {
        // Dịch một câu hỏng ra tiếng Việt hỏng thì học nhầm.
        const i = src.indexOf('result-sentence wrong');
        const khoi = src.slice(i, src.indexOf('</div>', src.indexOf('result-actions', i)));
        expect(khoi).not.toMatch(/rs-translate/);
    });

    test('chặn nổi bọt', () => {
        const i = src.indexOf(".rs-speak-wrong')");
        expect(src.slice(i, i + 300)).toMatch(/e\.stopPropagation\(\)/);
    });
});

describe('gợi ý xếp hộ phần mở đầu', () => {
    test('đọc `correctPhrases`, KHÔNG đọc `words`', () => {
        // `question.words` không tồn tại — trường thật là `correctPhrases`.
        // Đọc nhầm thì gợi ý in ra "undefined undefined".
        const i = src.indexOf('    showHint() {');
        const than = src.slice(i, src.indexOf('\n    },', i));
        expect(than).toMatch(/question\.correctPhrases/);
        expect(than).not.toMatch(/question\.words/);
    });

    test('XẾP cụm vào câu, không chỉ đọc ra', () => {
        const i = src.indexOf('    showHint() {');
        const than = src.slice(i, src.indexOf('\n    },', i));
        expect(than).toMatch(/this\.selectPhrase\(/);
    });

    test('đi qua `selectPhrase`, không đẩy thẳng vào `selectedWords`', () => {
        // Đẩy thẳng thì nút gốc không bị khoá → bấm được lần nữa → câu thừa từ.
        const i = src.indexOf('    showHint() {');
        const than = src.slice(i, src.indexOf('\n    },', i));
        expect(than).not.toMatch(/selectedWords\.push/);
    });

    test('dọn câu đang xếp dở trước khi chèn', () => {
        // Chèn vào cuối câu dở thì phần mở đầu nằm ở giữa — gợi ý thành ra sai.
        const i = src.indexOf('    showHint() {');
        const than = src.slice(i, src.indexOf('\n    },', i));
        expect(than).toMatch(/clearSentence\(\)/);
        expect(than.indexOf('clearSentence()')).toBeLessThan(than.indexOf('selectPhrase('));
    });

    test('soi THÂN HÀM, không soi chỗ gọi', () => {
        // `indexOf('showHint()')` tìm ra CHỖ GỌI trước, và cửa sổ cắt từ đó
        // không chứa thân hàm — mọi test dưới sẽ đỏ dù code đúng.
        expect(src.indexOf('    showHint() {'))
            .toBeGreaterThan(src.indexOf('this.showHint();'));
    });

    test('chỉ chèn cụm CHƯA bị khoá', () => {
        // Câu có cụm lặp: không lọc `!b.disabled` thì cả hai lần đều tìm ra
        // đúng một nút, cụm thứ hai không được chèn.
        const i = src.indexOf('    showHint() {');
        expect(src.slice(i, src.indexOf('\n    },', i))).toMatch(/!b\.disabled/);
    });
});

describe('ẩn kho cụm từ khi đã có kết quả', () => {
    test('ẩn khi hiện kết quả', () => {
        // Xếp xong thì mọi ô đều disabled, bấm không tác dụng — chỉ còn chiếm
        // chỗ và đẩy hai nút "Câu trước / Câu tiếp" xuống dưới khung nhìn.
        const i = src.indexOf("sentenceArea.classList.add('has-result')");
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, i + 600)).toMatch(/words-pool-container'\)\?\.classList\.add\('an-khi-xong'\)/);
    });

    test('HIỆN LẠI khi sang câu mới', () => {
        // Quên bỏ lớp ẩn thì câu sau không có gì để bấm — kẹt hẳn.
        const i = src.indexOf("sentenceArea.classList.remove('has-result')");
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, i + 400)).toMatch(/classList\.remove\('an-khi-xong'\)/);
    });

    test('ẩn luôn hai nút Làm lại / Kiểm tra', () => {
        // "Kiểm tra" đã bấm rồi, "Làm lại" không sửa được gì vì câu đã chấm.
        // Để lại là chiếm một hàng, đẩy "Trước / Tiếp" — thứ DUY NHẤT còn dùng
        // được ở bước này — xuống dưới mép.
        // Cắt tới HẾT nhánh hiện kết quả thay vì đếm ký tự: cửa sổ cố định
        // hỏng ngay khi ai đó thêm một comment ở giữa.
        const i = src.indexOf("sentenceArea.classList.add('has-result')");
        expect(i).toBeGreaterThan(-1);
        const nhanh = src.slice(i, src.indexOf('PracticeManager.recordAnswer', i));
        expect(nhanh).toMatch(/sentence-actions'\)\?\.classList\.add\('an-khi-xong'\)/);
    });

    test('hiện lại hai nút đó khi làm lại', () => {
        const i = src.indexOf("sentenceArea.classList.remove('has-result')");
        expect(src.slice(i, i + 500)).toMatch(/sentence-actions'\)\?\.classList\.remove\('an-khi-xong'\)/);
    });

    test('CSS phủ CẢ HAI khối, không chỉ kho cụm từ', () => {
        // Gắn cứng vào `.words-pool-container` thì thêm khối thứ hai là quên.
        const i = css.indexOf('.words-pool-container.an-khi-xong');
        const sel = css.slice(i, css.indexOf('{', i));
        expect(sel).toMatch(/\.sentence-actions\.an-khi-xong/);
    });

    test('CSS dùng `display:none`, không phải `visibility`', () => {
        // `visibility:hidden` và `opacity:0` vẫn giữ nguyên chiều cao — tức là
        // không giải quyết gì, vì vấn đề là CHỖ chứ không phải nhìn thấy.
        const i = css.indexOf('.words-pool-container.an-khi-xong');
        expect(i).toBeGreaterThan(-1);
        // Cắt từ dấu `{` để không nuốt cả selector, và soi ĐÚNG khối này.
        const rule = css.slice(css.indexOf('{', i), css.indexOf('}', i));
        expect(rule).toMatch(/display:\s*none/);
        // `visibility:hidden` / `opacity:0` vẫn giữ nguyên chiều cao — không
        // giải quyết gì, vì vấn đề là CHỖ chứ không phải nhìn thấy hay không.
        expect(rule).not.toMatch(/visibility|opacity/);
    });
});
