/**
 * Khối thông tin dưới mỗi thẻ chế độ: số từ cần ôn · số lượt đã chơi · năng lượng.
 *
 * Đọc mã nguồn thay vì render: khối này nằm sâu trong một `map` có `locked`,
 * `wrongWordsCount`, `playCounts` và mốc mở khoá theo Level — dựng đủ ngữ cảnh
 * để render tốn nhiều công hơn thứ nó kiểm, mà điều cần giữ ở đây là THỨ TỰ và
 * điều kiện hiện, cả hai đều đọc thẳng ra được.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'HomeScreen.jsx'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

/** Nội dung khối `mode-meta` — nơi ba dòng thông tin cùng sống. */
function khoiMeta() {
    const i = src.indexOf('<div className="mode-meta">');
    expect(i).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('</div>', i));
}

describe('thứ tự ba dòng trong thẻ chế độ', () => {
    test('năng lượng ở DƯỚI CÙNG', () => {
        // Ô năng lượng là viên màu vàng nổi bật; đặt gì dưới nó thì thứ đó
        // thành cái đuôi thừa treo dưới một khối đã đóng.
        const m = khoiMeta();
        expect(m.indexOf('mode-played')).toBeLessThan(m.indexOf('mode-cost'));
        expect(m.indexOf('wrong-words-count')).toBeLessThan(m.indexOf('mode-cost'));
    });

    test('số từ cần ôn ở trên số lượt đã chơi', () => {
        // "Còn 8 từ cần ôn" là việc PHẢI làm, "đã chơi 5 lượt" là chuyện đã qua.
        const m = khoiMeta();
        expect(m.indexOf('wrong-words-count')).toBeLessThan(m.indexOf('mode-played'));
    });
});

describe('điều kiện hiện', () => {
    test('chưa chơi lần nào thì KHÔNG hiện dòng lượt', () => {
        // Số 0 không nói thêm gì mà chiếm nguyên một dòng.
        expect(khoiMeta()).toMatch(/playCounts\[m\.mode\] > 0 &&/);
    });

    test('số từ cần ôn chỉ hiện ở đúng chế độ ôn, và chỉ khi đã mở khoá', () => {
        // Thẻ bị khoá mà vẫn khoe "8 từ cần ôn" là mời người dùng bấm vào một
        // thứ họ chưa mở được.
        expect(khoiMeta()).toMatch(
            /!locked && m\.mode === 'review-mistakes' && wrongWordsCount > 0 &&/);
    });
});

describe('nguồn số lượt đã chơi', () => {
    test('đọc từ `modeStats` của tiến trình, không đếm lại ở client', () => {
        // Server là nguồn chính; đếm lại ở client thì mỗi máy một số.
        expect(src).toMatch(/progress\?\.modeStats/);
    });

    test('giá trị hỏng không làm vỡ thẻ', () => {
        // `modeStats` cũ có thể thiếu `played`, hoặc là chuỗi. `Number(...) || 0`
        // giữ nó luôn là số — `undefined > 0` chỉ là false, nhưng
        // `undefined lượt` thì hiện ra chữ.
        expect(src).toMatch(/Number\(v\?\.played\) \|\| 0/);
    });
});

describe('lưới không lệch chiều cao', () => {
    test('`mode-meta` xếp DỌC và neo xuống đáy thẻ', () => {
        const i = css.indexOf('.mode-meta {');
        expect(i).toBeGreaterThan(-1);
        const rule = css.slice(i, css.indexOf('}', i));
        expect(rule).toMatch(/flex-direction: column/);
        // Neo đáy: các thẻ có tên và mô tả dài ngắn khác nhau, canh từ trên
        // xuống thì viên năng lượng mỗi thẻ một cao độ.
        expect(rule).toMatch(/margin-top: auto/);
        expect(rule).toMatch(/justify-content: flex-end/);
    });

    test('KHÔNG kẹp `min-height` — nguồn của khoảng hở thừa', () => {
        // Các ô trong một hàng grid đã tự bằng chiều cao nhau, nên kẹp sàn chỉ
        // chừa sẵn chỗ cho dòng thứ ba mà hầu hết thẻ không có: phần mô tả và
        // khối này bị đẩy xa nhau ra.
        // Gỡ comment trước khi soi: lý do KHÔNG kẹp được ghi ngay trong rule,
        // và chữ `min-height` trong lời giải thích đó không phải khai báo.
        const i = css.indexOf('.mode-meta {');
        const rule = css.slice(i, css.indexOf('}', i)).replace(/\/\*[\s\S]*?\*\//g, '');
        expect(rule).not.toMatch(/min-height/);
    });

    test('mỗi selector khai đúng MỘT lần', () => {
        // Khai hai lần thì rule sau âm thầm đè rule trước, và sửa nhầm chỗ là
        // sửa xong không thấy gì đổi.
        for (const sel of ['.mode-meta {', '.mode-played {']) {
            expect(css.split(sel).length - 1).toBe(1);
        }
    });
});
