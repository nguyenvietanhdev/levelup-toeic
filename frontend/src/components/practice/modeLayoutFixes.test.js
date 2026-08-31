/**
 * Năm sửa đổi về bố cục và điều khiển các chế độ luyện tập.
 *
 * Quy ước CHUNG chốt ở đây: câu ví dụ hiện SAU khi trả lời, nằm DƯỚI 4 ô đáp án.
 * Trước đó mỗi chế độ một kiểu — Trắc nghiệm hiện sẵn từ đầu, Từ đồng nghĩa và
 * Loại từ chờ trả lời xong. Mà câu ví dụ CHỨA chính từ đang hỏi ("多少钱?" lộ
 * thẳng đáp án 多少), nên hiện sẵn là cho không đáp án.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const R = (...p) => readFileSync(join(__dirname, ...p), 'utf8');
const mc = R('modes', 'multipleChoice.js');
const fc = R('modes', 'flashcard.js');
const dict = R('modes', 'dictation.js');
const pq = R('modes', 'phoneticQuiz.js');
const syn = R('modes', 'synonymCheck.js');
const wt = R('modes', 'wordTypeCheck.js');
const pron = R('modes', 'pronunciationMode.js');
const css = R('..', '..', 'assets', 'styles', 'components.css');
const modes = R('..', '..', 'assets', 'styles', 'new-modes.css');
const resp = R('..', '..', 'assets', 'styles', 'responsive.css');

/** Thân một luật CSS, tìm theo dòng mở. */
function luat(src, selector) {
    const i = src.indexOf(selector + ' {');
    expect(i, `không tìm thấy ${selector}`).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('}', i));
}

describe('câu ví dụ: hiện SAU khi trả lời, DƯỚI 4 ô đáp án', () => {
    test('Trắc nghiệm KHÔNG còn hiện sẵn từ đầu', () => {
        // `exampleHtml` cũ được nhúng thẳng vào lúc render câu hỏi.
        expect(mc).not.toMatch(/\$\{this\.exampleHtml\(question\)\}/);
    });

    test('chỗ chứa nằm SAU khối đáp án', () => {
        expect(mc.indexOf('id="mc-example-slot"'))
            .toBeGreaterThan(mc.indexOf('class="choices-container"'));
    });

    test('chỉ điền khi đã trả lời', () => {
        const iReveal = mc.indexOf('this.revealExample(question)');
        const iAnswer = mc.indexOf("afterAnswer(this, 'multiple-choice')");
        expect(iReveal).toBeGreaterThan(-1);
        expect(iReveal).toBeLessThan(iAnswer);
    });

    test('không lộ hai lần khi bấm lại', () => {
        const i = mc.indexOf('revealExample(question) {');
        expect(mc.slice(i, i + 900)).toMatch(/slot\.childElementCount/);
    });

    test('CÙNG quy ước với Từ đồng nghĩa và Loại từ', () => {
        // Hai chế độ này vốn đã hiện sau khi trả lời — giữ nguyên.
        for (const src of [syn, wt]) {
            expect(src).toMatch(/this\.showWordInfo\(question\.word\)/);
        }
    });
});

describe('phát âm: không ép giọng tiếng Anh cho câu tiếng Trung', () => {
    test('Trắc nghiệm để bộ đọc tự nhận ngôn ngữ', () => {
        // `speakWord` tự phát hiện chữ Hán rồi đổi sang zh-CN. Truyền cứng
        // 'en-US' là đọc 多少钱 bằng giọng tiếng Anh.
        const i = mc.indexOf('revealExample(question) {');
        const body = mc.slice(i, i + 1800);
        expect(body).toMatch(/GameLogic\.speakPhu\(cau\)/);
        expect(body).not.toMatch(/speak(Word|Phu)\(cau, .en-US.\)/);
    });

    test('Flashcard có hàm đọc riêng, không truyền en-US', () => {
        // `pronounce` gắn cứng hiệu ứng vào nút mặt trước; dùng lại thì nghe câu
        // ví dụ lại làm nút kia nhấp nháy.
        const i = fc.indexOf('pronounceText(text) {');
        expect(i).toBeGreaterThan(-1);
        expect(fc.slice(i, i + 300)).toMatch(/GameLogic\.speakPhu\(text\)/);
    });
});

describe('Flashcard: nút loa cho ví dụ và từ đồng nghĩa', () => {
    test('có nút ở CẢ HAI khối', () => {
        // `data-speak` giờ mang THẲNG nội dung câu, không phải tên khoá: kho
        // song ngữ có hai bộ (một cho mỗi mặt) nên tra theo khoá luôn ra bộ của
        // mặt kia. Soi khối chứa nút thay vì giá trị thuộc tính.
        expect(fc).toMatch(/class="card-example"[\s\S]*?card-speak/);
        expect(fc).toMatch(/class="card-synonyms"[\s\S]*?card-speak/);
    });

    test('chặn nổi bọt — bấm nghe KHÔNG được lật thẻ', () => {
        // Cả thẻ có listener lật; không chặn thì mỗi lần nghe là thẻ lật một cái.
        const i = fc.indexOf(".card-speak'");
        expect(fc.slice(i, i + 500)).toMatch(/e\.stopPropagation\(\)/);
    });

    test('dùng pronounceText, không dùng pronounce', () => {
        const i = fc.indexOf(".card-speak'");
        expect(fc.slice(i, i + 500)).toMatch(/this\.pronounceText\(text\)/);
    });

    test('có CSS, nút không đè lên nền thẻ', () => {
        const body = luat(css, '.card-extra-row .card-speak');
        expect(body).toMatch(/flex-shrink:\s*0/);
        expect(body).toMatch(/border-radius:\s*50%/);
    });

    test('câu dài xuống dòng thay vì đẩy nút ra ngoài', () => {
        expect(luat(css, '.card-extra-row p')).toMatch(/min-width:\s*0/);
    });
});

describe('Chép chính tả: tôn trọng cài đặt tự động chuyển câu', () => {
    test('đi qua afterAnswer thay vì luôn tự nhảy', () => {
        // Trước đây LUÔN `setTimeout(nextQuestion)`, nên tắt tự động chuyển câu
        // ở Cài đặt thì mọi chế độ khác hiện nút ← Trước / Tiếp →, riêng chế độ
        // này vẫn nhảy sang câu sau.
        expect(dict).toMatch(/import \{ afterAnswer, isAutoAdvance \}/);
        expect(dict).toMatch(/_advance\(readDelay = 0\)/);
    });

    test('tắt tự động thì vẽ thanh điều hướng', () => {
        const i = dict.indexOf('_advance(readDelay = 0) {');
        const body = dict.slice(i, i + 400);
        expect(body).toMatch(/if \(!isAutoAdvance\(\)\)/);
        expect(body).toMatch(/afterAnswer\(this, .dictation.\)/);
    });

    test('KHÔNG còn chỗ nào tự nhảy câu bỏ qua cài đặt', () => {
        // Ba lối thoát của `_translateExample` đều phải đi qua `_advance`.
        const i = dict.indexOf('async _translateExample');
        const body = dict.slice(i, i + 1600);
        expect(body).not.toMatch(/setTimeout\(\(\) => this\.nextQuestion\(\)/);
        expect((body.match(/this\._advance\(/g) || []).length).toBeGreaterThanOrEqual(3);
    });
});

describe('Phiên âm: hai cột, không phải cuộn', () => {
    test('markup chia hai cột', () => {
        expect(pq).toMatch(/class="pq-cols"/);
        expect(pq).toMatch(/class="pq-col-main"/);
        expect(pq).toMatch(/class="pq-col-side"/);
    });

    test('phần giải thích ở cột PHẢI, không nằm dưới đáp án', () => {
        const iChoices = pq.indexOf('id="pq-choices"');
        const iSide = pq.indexOf('class="pq-col-side"');
        const iResult = pq.indexOf('id="pq-result"');
        expect(iSide).toBeGreaterThan(iChoices);
        expect(iResult).toBeGreaterThan(iSide);
    });

    test('CSS dựng lưới hai cột', () => {
        const body = luat(modes, '.pq-cols');
        expect(body).toMatch(/display:\s*grid/);
        expect(body).toMatch(/grid-template-columns:\s*1fr \d+px/);
    });

    test('nới trần chiều rộng — 620px cũ không đủ cho hai cột', () => {
        const body = luat(modes, '.phonetic-quiz-container');
        const w = Number((body.match(/max-width:\s*(\d+)px/) || [])[1]);
        expect(w).toBeGreaterThan(620);
    });

    test('màn hẹp về MỘT cột', () => {
        // Hai cột trên màn hẹp thì cột nào cũng chật, ô đáp án bị bóp hai dòng.
        const i = modes.indexOf('@media (max-width: 1000px)');
        expect(i).toBeGreaterThan(-1);
        expect(modes.slice(i, i + 200)).toMatch(/grid-template-columns:\s*1fr/);
    });

    test('cột trái có min-width: 0', () => {
        // Thiếu thì grid item không co, ô đáp án chữ dài đẩy vỡ cả lưới.
        expect(luat(modes, '.pq-col-main')).toMatch(/min-width:\s*0/);
    });

    test('có thanh điều hướng câu hỏi', () => {
        expect(pq).toMatch(/afterAnswer\(this, .phonetic-quiz.\)/);
    });
});

describe('Phát âm trên điện thoại: mic bên phải', () => {
    test('mic đẩy về cuối hàng', () => {
        // Phần lớn người dùng cầm máy tay phải — ngón cái với tới mép phải dễ
        // nhất, mà mic là nút bấm nhiều nhất ở màn này.
        const body = luat(resp, '.pronunciation-mic-col .mic-button');
        expect(body).toMatch(/order:\s*3/);
        expect(body).toMatch(/margin-left:\s*auto/);
    });

    test('trạng thái và chấm sang trái', () => {
        expect(luat(resp, '.pronunciation-mic-col .mic-status')).toMatch(/order:\s*1/);
        expect(luat(resp, '.pronunciation-mic-col #attempts-dots')).toMatch(/order:\s*2/);
    });

    test('"Nghe lại" xuống hàng riêng, đủ rộng', () => {
        // Trước đây nó lọt vào hàng với mic và bị bóp còn một mẩu — mà đây là
        // nút bấm nhiều thứ hai (nghe mẫu rồi mới nhại lại được).
        const body = luat(resp, '.pronunciation-mic-col #replay-btn');
        expect(body).toMatch(/flex:\s*1 0 100%/);
        expect(body).toMatch(/min-height:\s*\d+px/);
    });

    test('dùng order, KHÔNG đổi thứ tự trong HTML', () => {
        // Trình đọc màn hình đọc theo thứ tự DOM; đổi DOM là đổi cả trải nghiệm
        // của họ, mà đây chỉ là sắp xếp thị giác cho màn hẹp.
        const iBtn = pron.indexOf('id="mic-btn"');
        const iStatus = pron.indexOf('id="mic-status"');
        expect(iBtn).toBeGreaterThan(-1);
        expect(iBtn).toBeLessThan(iStatus);
    });
});
