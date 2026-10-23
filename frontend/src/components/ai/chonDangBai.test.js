/**
 * Kho dạng bài (ChonDangBai) dùng chung ở Đọc hiểu, Viết, Dịch, Nghe.
 *
 * Mỗi màn khai báo lại kho của server để hiện chip; lệch khoá là bấm chip mà
 * server không nhận ra → âm thầm ra bài ngẫu nhiên. Test này khoá cho hai bên khớp.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');
const server = (f) => readFileSync(join(__dirname, '..', '..', '..', '..', 'backend', 'services', f), 'utf8');

/** [[khoá nhóm, [khoá dạng…]], …] theo đúng thứ tự trong khối `const <ten> = [`. */
function nhomCua(src, ten) {
    const i = src.indexOf(`const ${ten} = [`);
    expect(i).toBeGreaterThan(-1);
    const khoi = src.slice(i, src.indexOf('\n];', i));
    return khoi.split(/\n    \{\n/).slice(1).map((n) => [
        n.match(/key: '([^']+)'/)[1],
        [...n.slice(n.indexOf('dang: [')).matchAll(/key: '([^']+)'/g)].map((m) => m[1]),
    ]);
}

const MAN = [
    ['Đọc hiểu', ['components', 'reading', 'ReadingScreen.jsx'], 'readingGrader.js', 'NHOM_DANG'],
    ['Viết', ['components', 'essay', 'EssayScreen.jsx'], 'essayGrader.js', 'NHOM_DANG_VIET'],
    ['Dịch', ['components', 'translation', 'TranslationScreen.jsx'], 'translationGrader.js', 'NHOM_DANG_DICH'],
    ['Nghe', ['components', 'listening', 'ListeningScreen.jsx'], 'listeningAi.js', 'NHOM_DANG_NGHE'],
];

describe('kho dạng bài khớp server', () => {
    for (const [ten, duong, file, tenServer] of MAN) {
        test(`${ten}: cùng nhóm, cùng khoá, cùng thứ tự`, () => {
            const fe = nhomCua(doc(...duong), 'NHOM_DANG');
            expect(fe.length).toBe(4);
            expect(fe.flatMap(([, ds]) => ds).length).toBeGreaterThanOrEqual(20);
            expect(fe).toEqual(nhomCua(server(file), tenServer));
        });

        test(`${ten}: dùng ChonDangBai và gửi dạng tự nhập lên server`, () => {
            const src = doc(...duong);
            expect(src).toMatch(/import ChonDangBai/);
            expect(src).toMatch(/<ChonDangBai/);
            expect(src).toMatch(/tuChon/);
        });
    }
});

describe('component ChonDangBai', () => {
    const src = doc('components', 'ai', 'ChonDangBai.jsx');

    test('có Ngẫu nhiên, ô tự nhập giới hạn độ dài, nhóm xếp theo kiểu chấm', () => {
        expect(src).toMatch(/Ngẫu nhiên/);
        expect(src).toMatch(/maxLength=\{maxLength\}/);
        expect(src).toMatch(/b\.hop\.includes\(kieu\)/);
    });

    test('MAX_TU_CHON khớp server', () => {
        const m = src.match(/export const MAX_TU_CHON = (\d+);/);
        const s = server('dangBai.js').match(/const MAX_TU_CHON = (\d+);/);
        expect(m[1]).toBe(s[1]);
    });

    test('chọn chip thì xoá ô tự nhập (tự nhập luôn thắng chip)', () => {
        expect(src).toMatch(/onDang\(d\.key\); onTuChon\(''\)/);
    });
});
