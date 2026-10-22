/**
 * Danh sách vai của Part: hiện ở phần giới thiệu của cả 4 chế độ AI; vai AI dùng
 * chung không có nút xoá; vai riêng sửa và xoá được.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'DanhSachVai.jsx'), 'utf8');
const read = (p) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('DanhSachVai', () => {
    test('lấy danh sách từ API /roles/list', () => {
        expect(src).toMatch(/RolesAPI\.list\(/);
    });

    test('vai của bạn có Sửa và Xoá; vai AI đã lưu không có nút Xoá', () => {
        expect(src).toMatch(/onXoa=\{null\}/);
        expect(src).toMatch(/Dùng chung/);
        expect(src).toMatch(/onSua=\{\(\) => setSoan\(\{ id: ds\.vai\.id/);
    });

    test('Dùng đưa vai AI lên làm vai đang dùng bằng cách lưu lại', () => {
        expect(src).toMatch(/RolesAPI\.saveAi\(/);
    });
});

describe('mọi chế độ AI có danh sách vai ở phần giới thiệu', () => {
    const cases = [
        ['conversation/ConversationScreen.jsx', 'convo-intro'],
        ['essay/EssayScreen.jsx', 'essay-intro'],
        ['reading/ReadingScreen.jsx', 'essay-intro'],
        ['translation/TranslationScreen.jsx', 'essay-intro'],
    ];
    for (const [file, cls] of cases) {
        test(`${file} gắn DanhSachVai trong ${cls}`, () => {
            const s = read(file);
            expect(s).toMatch(/import DanhSachVai from '\.\.\/roles\/DanhSachVai\.jsx'/);
            const i = s.indexOf(`className="${cls}"`);
            const j = s.indexOf('<DanhSachVai', i);
            expect(i).toBeGreaterThan(-1);
            expect(j).toBeGreaterThan(i);
        });
    }
});
