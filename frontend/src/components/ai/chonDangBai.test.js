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
    ['Hội thoại', ['components', 'conversation', 'ConversationScreen.jsx'], 'conversationAi.js', 'NHOM_TINH_HUONG'],
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

describe('gợi ý "Hợp bộ từ này"', () => {
    test('dangGui: tự nhập thắng, rồi chip, rồi Ngẫu nhiên bốc trong gợi ý', async () => {
        const { dangGui } = await import('./ChonDangBai.jsx');
        expect(dangGui({ dang: 'email', tuChon: ' thư ', goiY: ['review'] })).toEqual({ dang: '', tuChon: 'thư' });
        expect(dangGui({ dang: 'email', tuChon: '', goiY: ['review'] })).toEqual({ dang: 'email', tuChon: '' });
        for (let i = 0; i < 10; i++) {
            expect(['review', 'recipe']).toContain(dangGui({ dang: '', tuChon: '', goiY: ['review', 'recipe'] }).dang);
        }
        // Không có gợi ý → Ngẫu nhiên gửi rỗng, server giữ đề như cũ.
        expect(dangGui({ dang: '', tuChon: '' })).toEqual({ dang: '', tuChon: '' });
    });

    test('component hiện nhóm gợi ý ĐẦU TIÊN, chỉ với khoá có trong kho', () => {
        const src = doc('components', 'ai', 'ChonDangBai.jsx');
        expect(src).toMatch(/label: 'Hợp bộ từ này'/);
        expect(src).toMatch(/\[\{ key: 'goi-y'.*goiY: true \}, \.\.\.nhomXep\]/);
        expect(src).toMatch(/goiY\.map\(\(k\) => tatCaDang\.find\(\(d\) => d\.key === k\)\)\.filter\(Boolean\)/);
    });

    test('hook đọc đề/Part khi màn được mở và gọi đúng API', () => {
        const src = doc('components', 'ai', 'ChonDangBai.jsx');
        expect(src).toMatch(/DangGoiYAPI\.get\(\{ mode, source, part, lang: getVocabLang\(\) \}\)/);
        expect(src).toMatch(/\}, \[mode, active\]\);/);
        const api = doc('api', 'dangGoiY.js');
        expect(api).toMatch(/\/dang-goi-y\?/);
    });

    const CHE_DO = [
        ['Đọc hiểu', ['components', 'reading', 'ReadingScreen.jsx'], 'reading'],
        ['Viết', ['components', 'essay', 'EssayScreen.jsx'], 'essay'],
        ['Dịch', ['components', 'translation', 'TranslationScreen.jsx'], 'translation'],
        ['Nghe', ['components', 'listening', 'ListeningScreen.jsx'], 'listening'],
        ['Hội thoại', ['components', 'conversation', 'ConversationScreen.jsx'], 'conversation'],
    ];
    for (const [ten, duong, mode] of CHE_DO) {
        test(`${ten}: lấy gợi ý đúng chế độ, truyền vào chip và dùng dangGui khi gửi`, () => {
            const src = doc(...duong);
            // `active` có thể kèm điều kiện (vd Nghe bỏ qua khi học tiếng Trung).
            expect(src).toContain(`useGoiYDang('${mode}', active`);
            expect(src).toMatch(/goiY=\{goiY\}/);
            expect(src).toMatch(/\.\.\.dangGui\(\{ dang, tuChon[^}]*goiY \}\)/);
        });
    }
});
