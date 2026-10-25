/**
 * Lõi chữa bài: định vị lỗi, ghép bản sửa, so câu tự sửa.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Trích dẫn khác hoa/thường với bài → không gạch chân được.
 *   2. Hai lỗi cùng trích "the" → chồng lên nhau, chữ bị nhân đôi khi ghép bản sửa.
 *   3. Bài chấm cũ có `fix` tiếng Việt → ghép vào bài tiếng Anh thành câu lai.
 *   4. Gõ đúng mà thiếu dấu chấm / thừa khoảng trắng → bị báo sai.
 *   5. Bảng nhãn lệch với backend → loại lỗi mới hiện là "Khác".
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    LOAI_LOI, chuanHoaLoi, dinhViLoi, chiaManh, khopSua, chonHien, coTiengViet,
} from './chuaBai.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('bảng nhãn khớp backend (cùng khoá, cùng nhãn)', () => {
    const be = readFileSync(join(__dirname, '..', '..', '..', 'backend', 'services', 'errorTaxonomy.js'), 'utf8');
    const cap = [...be.matchAll(/\{ key: '([\w-]+)', vi: '([^']+)'/g)].map((m) => [m[1], m[2]]);
    expect(cap.length).toBeGreaterThan(5);
    expect(Object.entries(LOAI_LOI)).toEqual(cap);
});

describe('chuẩn hoá lỗi', () => {
    test('đọc được cả hai nguồn; mức style → nen', () => {
        expect(chuanHoaLoi({ quote: 'a', fix: 'b', type: 'tense', muc: 'loi' }, 0))
            .toMatchObject({ sua: 'b', loai: 'tense', muc: 'loi', suaDuoc: true });
        expect(chuanHoaLoi({ quote: 'a', better: 'c', loai: 'article', muc: 'nen' }, 1))
            .toMatchObject({ sua: 'c', loai: 'article', muc: 'nen' });
        expect(chuanHoaLoi({ quote: 'a', fix: 'b', level: 'style' }, 2).muc).toBe('nen');
        expect(chuanHoaLoi({ type: 'la-hoac' }, 3).loai).toBe('other');
    });

    test('cụm sửa tiếng Việt (bài cũ) → không dùng làm chữ thay thế', () => {
        expect(coTiengViet('Dùng thì quá khứ')).toBe(true);
        expect(chuanHoaLoi({ quote: 'go', fix: 'Dùng thì quá khứ "went"' }, 0).suaDuoc).toBe(false);
        expect(chuanHoaLoi({ quote: '去', fix: '去了' }, 0).suaDuoc).toBe(true);
    });
});

describe('định vị lỗi', () => {
    const L = (quote, id) => ({ id, quote });

    test('khớp đúng chữ; không phân biệt hoa/thường khi cần', () => {
        const { doan, khongThay } = dinhViLoi('Yesterday I go to School.', [L('I go', 'a'), L('school', 'b')]);
        expect(doan.map((d) => [d.start, d.end, d.loi.id])).toEqual([[10, 14, 'a'], [18, 24, 'b']]);
        expect(khongThay).toEqual([]);
    });

    test('khác khoảng trắng / xuống dòng vẫn khớp; ký tự đặc biệt trong trích dẫn không làm hỏng', () => {
        const text = 'Hello Anna!\n\nMy name is (Viet) Anh.';
        const { doan } = dinhViLoi(text, [L('Hello Anna! My name is (Viet)', 'a')]);
        expect(doan).toHaveLength(1);
        expect(text.slice(doan[0].start, doan[0].end)).toBe('Hello Anna!\n\nMy name is (Viet)');
    });

    test('hai lỗi cùng trích dẫn → lấy lần xuất hiện kế tiếp, không chồng', () => {
        const { doan } = dinhViLoi('the cat and the dog', [L('the', 'a'), L('the', 'b')]);
        expect(doan.map((d) => d.start)).toEqual([0, 12]);
    });

    test('không tìm thấy hoặc không có trích dẫn → khongThay', () => {
        const { doan, khongThay } = dinhViLoi('hello', [L('bye', 'a'), L('', 'b')]);
        expect(doan).toEqual([]);
        expect(khongThay.map((l) => l.id)).toEqual(['a', 'b']);
    });

    test('chia mảnh giữ nguyên toàn bộ chữ', () => {
        const text = 'I go to school';
        const { doan } = dinhViLoi(text, [L('go', 'a')]);
        const m = chiaManh(text, doan);
        expect(m.map((x) => x.chu).join('')).toBe(text);
        expect(m[1]).toMatchObject({ chu: 'go', loi: { id: 'a' } });
    });
});

describe('so câu tự sửa', () => {
    test('bỏ qua hoa/thường, khoảng trắng, dấu câu cuối, nháy cong', () => {
        expect(khopSua('  I  WENT. ', 'I went')).toBe(true);
        expect(khopSua('don’t go', "don't go")).toBe(true);
        expect(khopSua('我去了。', '我去了')).toBe(true);
        expect(khopSua('I go', 'I went')).toBe(false);
        expect(khopSua('', '')).toBe(false);
    });
});

test('chỉ hiện tối đa 8, lỗi thật trước nên-sửa', () => {
    const ds = [
        ...Array.from({ length: 3 }, (_, i) => ({ id: `n${i}`, muc: 'nen' })),
        ...Array.from({ length: 7 }, (_, i) => ({ id: `l${i}`, muc: 'loi' })),
    ];
    const hien = chonHien(ds);
    expect(hien.size).toBe(8);
    for (let i = 0; i < 7; i += 1) expect(hien.has(`l${i}`)).toBe(true);
    expect(hien.has('n0')).toBe(true);
    expect(hien.has('n1')).toBe(false);
});
