/**
 * Nút chọn / bỏ chọn TẤT CẢ các kiểu hỏi ở "Ôn từ sai".
 *
 * Tám ô tick thì bật/tắt từng cái một khá mất công, nhất là khi chỉ muốn giữ
 * đúng một hai kiểu: bỏ hết rồi tick lại nhanh hơn nhiều.
 *
 * Điểm dễ hiểu nhầm: "bỏ hết" lưu mảng RỖNG, mà `kieuDuocPhep()` hiểu rỗng là
 * "không giới hạn" — nên về mặt luyện tập nó giống hệt "chọn tất cả". Đó là
 * chủ ý (một lượt không có câu nào thì không dùng được), nhưng trạng thái Ô
 * TICK thì khác nhau, và đó mới là thứ nút này phục vụ.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(join(__dirname, 'panels', 'ReviewPanel.jsx'), 'utf8');
const mode = readFileSync(
    join(__dirname, '..', 'practice', 'modes', 'reviewMistakes.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

/** Danh sách kiểu khai trong panel. */
const kieu = [...panel.matchAll(/key: '([a-z]+)'/g)].map((m) => m[1]);

/** `toggleAll` dựng từ chính mã nguồn rồi gọi thật. */
const dungToggleAll = (kindsChon) => {
    const i = panel.indexOf('const toggleAll = () => {');
    expect(i).toBeGreaterThan(-1);
    const than = panel.slice(panel.indexOf('{', i + 20) + 1, panel.indexOf('\n    };', i));

    let luu;
    const REVIEW_KINDS = kieu.map((k) => ({ key: k }));
    const dangBatHet = kindsChon.length === REVIEW_KINDS.length;
    new Function('REVIEW_KINDS', 'dangBatHet', 'updateSetting', than)(
        REVIEW_KINDS, dangBatHet, (_k, v) => { luu = v; },
    );
    return luu;
};

describe('nút bật/tắt tất cả', () => {
    test('đang bật một phần → CHỌN hết', () => {
        expect(dungToggleAll(['choice', 'fill'])).toEqual(kieu);
    });

    test('đang bật HẾT → bỏ hết (mảng rỗng)', () => {
        expect(dungToggleAll([...kieu])).toEqual([]);
    });

    test('đang tắt hết → chọn hết', () => {
        expect(dungToggleAll([])).toEqual(kieu);
    });

    test('chọn hết nghĩa là đủ CẢ TÁM kiểu, kể cả `speak`', () => {
        const kq = dungToggleAll(['choice']);
        expect(kq).toHaveLength(8);
        for (const k of ['flashcard', 'choice', 'truefalse', 'listen',
            'speak', 'scramble', 'fill', 'hanzi']) {
            expect(kq, k).toContain(k);
        }
    });
});

describe('nhãn nút đổi theo trạng thái', () => {
    test('có cả hai nhãn', () => {
        expect(panel).toMatch(/Bỏ chọn tất cả/);
        expect(panel).toMatch(/Chọn tất cả/);
    });

    test('chọn nhãn theo `dangBatHet`', () => {
        // Một nút đổi trạng thái, không phải hai nút cạnh nhau — hai nút thì
        // lúc nào cũng có một cái vô nghĩa.
        expect(panel).toMatch(/dangBatHet \? 'Bỏ chọn tất cả' : 'Chọn tất cả'/);
    });

    test('`dangBatHet` so với ĐỘ DÀI danh sách, không phải hằng số', () => {
        // Chốt cứng 8 thì thêm kiểu thứ chín là nút hỏng im lặng.
        expect(panel).toMatch(
            /const dangBatHet = kindsChon\.length === REVIEW_KINDS\.length/);
    });
});

describe('bộ đếm', () => {
    test('hiện số đang bật trên tổng', () => {
        // Tám ô thì rà từng cái để biết đang bật mấy khá mất công.
        expect(panel).toMatch(/\{kindsChon\.length\}\/\{REVIEW_KINDS\.length\}/);
    });

    test('không chốt cứng tổng số', () => {
        expect(panel).not.toMatch(/Đang bật \{kindsChon\.length\}\/8/);
    });
});

describe('danh sách panel vẫn khớp mã chế độ', () => {
    test('cùng thứ tự, cùng số lượng', () => {
        // Nút "chọn tất cả" lưu THẲNG danh sách của panel; lệch với `KIEU_HOI`
        // là lưu vào cài đặt những tên mà chế độ không hiểu.
        const m = mode.match(/const KIEU_HOI = \[([\s\S]*?)\];/);
        expect(m).toBeTruthy();
        const cuaMode = [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
        expect(kieu).toEqual(cuaMode);
    });
});

describe('CSS thanh điều khiển', () => {
    test('có thanh và bộ đếm', () => {
        expect(css).toMatch(/\.review-kinds-bar \{/);
        expect(css).toMatch(/\.review-kinds-count \{/);
    });

    test('nút và chữ nằm hai đầu', () => {
        const i = css.indexOf('.review-kinds-bar {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/justify-content: space-between/);
    });
});
