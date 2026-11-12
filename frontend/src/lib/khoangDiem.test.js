/**
 * Khoảng điểm thay cho một con số band.
 *
 * Chỗ dễ hỏng: khoảng tràn ra ngoài thang 0–9, hiện "6–7" lúc "6.5–7.5" (hai đầu lệch định dạng),
 * hoặc màn kết quả quên hiện khoảng.
 */
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { khoangBand, chuoiKhoang, DO_LECH_BAND } from './khoangDiem.js';

test('khoảng ±0.5 quanh band, kẹp trong thang 0–9', () => {
    expect(DO_LECH_BAND).toBe(0.5);
    expect(khoangBand(6.5)).toEqual({ thap: 6, cao: 7 });
    expect(khoangBand(9)).toEqual({ thap: 8.5, cao: 9 });
    expect(khoangBand(0)).toEqual({ thap: 0, cao: 0.5 });
    expect(khoangBand('x')).toBeNull();
});

test('chuỗi hiển thị luôn một chữ số thập phân', () => {
    expect(chuoiKhoang(6.5)).toBe('6.0–7.0');
    expect(chuoiKhoang(7)).toBe('6.5–7.5');
    expect(chuoiKhoang(undefined)).toBe('');
});

test('màn kết quả bài Viết hiện khoảng điểm', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'components', 'essay', 'EssayScreen.jsx'), 'utf8');
    expect(src).toMatch(/khoảng \{chuoiKhoang\(result\.overall\)\}/);
});
