/**
 * "Học tiếp" mở cho MỌI chế độ không cần 4 đáp án, không chỉ Flashcard.
 *
 * Ranh giới là `optionsCount` trong `Config.modes`: chế độ nào khai nó thì phải
 * dựng một đáp án đúng + ba nhiễu từ chính bộ đang luyện, nên lô kế tiếp ít từ
 * là hàng đáp án thiếu ô. Chế độ không khai thì hiện một từ mỗi lượt, lô nhỏ
 * cũng chạy được.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pm = readFileSync(join(__dirname, 'practiceManager.js'), 'utf8');
const cfg = readFileSync(join(__dirname, '..', '..', 'game', 'config.js'), 'utf8');
const ps = readFileSync(
    join(__dirname, '..', 'vocab', 'part', 'partSelector.js'), 'utf8');

/** Danh sách chế độ được phép, đọc thẳng từ mã nguồn. */
const duocPhep = (() => {
    const m = pm.match(/const MODE_HOC_TIEP = new Set\(\[([\s\S]*?)\]\);/);
    expect(m, 'không tìm thấy MODE_HOC_TIEP').toBeTruthy();
    return new Set([...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]));
})();

/** Chế độ nào khai `optionsCount` — tức là cần đáp án nhiễu. */
const canNhieu = (() => {
    const out = new Set();
    const re = /'([a-z][a-z-]+)':\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
    for (const [, ten, than] of cfg.matchAll(re)) {
        if (than.includes('questionsPerRound') && than.includes('optionsCount')) out.add(ten);
    }
    return out;
})();

describe('danh sách chế độ khớp với ranh giới `optionsCount`', () => {
    test('KHÔNG chế độ nào cần 4 đáp án lọt vào danh sách', () => {
        // Đây là điều kiện chính người dùng đặt ra.
        for (const mode of duocPhep) {
            expect(canNhieu.has(mode), `${mode} cần đáp án nhiễu mà vẫn cho Học tiếp`)
                .toBe(false);
        }
    });

    test('đủ cả 7 chế độ không cần đáp án nhiễu', () => {
        for (const mode of [
            'flashcard', 'fill-blank', 'dictation', 'pronunciation',
            'hanzi-writing', 'sentence-builder', 'speed-quiz',
        ]) {
            expect(duocPhep.has(mode), `thiếu ${mode}`).toBe(true);
        }
        expect(duocPhep.size).toBe(7);
    });

    test('chế độ trắc nghiệm bị loại', () => {
        for (const mode of [
            'multiple-choice', 'listening', 'synonym-check', 'word-type-check',
            'example-fill-blank', 'context-learning', 'sentence-listening',
            'phonetic-quiz', 'review-mistakes',
        ]) {
            expect(duocPhep.has(mode), `${mode} không được phép Học tiếp`).toBe(false);
        }
    });

    test('`speed-quiz` được phép dù có đáp án sai', () => {
        // Nó chỉ cần MỘT từ khác (đúng/sai), không phải bốn lựa chọn.
        expect(duocPhep.has('speed-quiz')).toBe(true);
        expect(canNhieu.has('speed-quiz')).toBe(false);
    });
});

describe('`nutHocTiep` — chạy hàm thật lấy từ mã nguồn', () => {
    const ham = (() => {
        const i = pm.indexOf('nutHocTiep(mode, dung, sai) {');
        expect(i).toBeGreaterThan(-1);
        const than = pm.slice(pm.indexOf('{', i) + 1, pm.indexOf('\n    },', i));
        return new Function('MODE_HOC_TIEP', 'NGUONG_HOC_TIEP', 'Modal',
            `return function (mode, dung, sai) { ${than} };`
        )(duocPhep, 80, { close() {} });
    })();

    test('chế độ được phép + đạt ngưỡng → có nút', () => {
        expect(ham.call({}, 'dictation', 8, 2)).toHaveLength(1);
        expect(ham.call({}, 'dictation', 8, 2)[0].text).toBe('Học tiếp');
    });

    test('chế độ trắc nghiệm → KHÔNG có nút dù điểm tuyệt đối', () => {
        expect(ham.call({}, 'multiple-choice', 10, 0)).toHaveLength(0);
    });

    test('dưới 80% → không có nút', () => {
        expect(ham.call({}, 'dictation', 7, 3)).toHaveLength(0);
    });

    test('đúng 80% → CÓ nút (biên `>=`)', () => {
        expect(ham.call({}, 'dictation', 8, 2)).toHaveLength(1);
    });

    test('lượt rỗng → không có nút', () => {
        // Khác Flashcard: ở đây lượt rỗng nghĩa là chưa trả lời câu nào, mở nút
        // là bấm nhầm thành nhảy lô mà chưa học gì.
        expect(ham.call({}, 'dictation', 0, 0)).toHaveLength(0);
    });

    test('mode rỗng → không có nút', () => {
        expect(ham.call({}, null, 10, 0)).toHaveLength(0);
    });
});

describe('con trỏ lô dùng chung', () => {
    test('`getWordsForPractice` mặc định lấy `conTroLo`', () => {
        expect(ps).toMatch(/offset = null/);
        expect(ps).toMatch(/if \(offset === null\) offset = this\.conTroLo;/);
    });

    test('tự chọn part thủ công thì con trỏ VỀ 0', () => {
        // Người dùng đổi part trên nav mà giữ con trỏ cũ là part mới bị bỏ qua
        // mất mấy chục từ đầu, không có gì báo.
        const i = ps.indexOf('async selectPart(part) {');
        expect(ps.slice(i, i + 500)).toMatch(/this\.conTroLo = 0/);
    });

    test('xoá part cũng reset con trỏ', () => {
        const i = ps.indexOf('async clearPart() {');
        expect(ps.slice(i, i + 300)).toMatch(/this\.conTroLo = 0/);
    });

    test('`sangPartKe` đặt con trỏ về đầu part mới', () => {
        const i = ps.indexOf('const ke = ds[i + 1];');
        expect(ps.slice(i, i + 200)).toMatch(/this\.conTroLo = 0/);
    });
});

describe('`hocLoKeTiep` giữ con trỏ đúng', () => {
    const than = (() => {
        const i = pm.indexOf('async hocLoKeTiep(mode) {');
        expect(i).toBeGreaterThan(-1);
        return pm.slice(i, pm.indexOf('\n    },', i));
    })();

    test('đẩy con trỏ theo SỐ TỪ của lô vừa học', () => {
        expect(than).toMatch(/PartSelector\.conTroLo \+= this\._soTuLoVua\(mode\)/);
    });

    test('hết part thì thử chuyển part', () => {
        expect(than).toMatch(/sangPartKe\(\)/);
    });

    test('part CUỐI thì trả con trỏ về chỗ cũ', () => {
        // Không trả lại là lần sau nhảy hụt qua phần chưa học.
        expect(than).toMatch(/PartSelector\.conTroLo = truoc/);
    });

    test('chạy lại chính chế độ đó', () => {
        expect(than).toMatch(/this\.start\(mode\)/);
    });
});
