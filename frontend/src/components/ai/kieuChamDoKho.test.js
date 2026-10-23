/**
 * Kiểu chấm và độ khó dùng chung: ba màn (Hội thoại, Luyện viết, Dịch) đều dùng cùng
 * component và cùng bảng, nên giao diện và nhãn không lệch nhau.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIEU_CHAM, DO_KHO_THEO_KIEU, doKhoChoKieu, kieuChoNgonNgu } from '../../lib/kieuCham.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');

describe('bảng dùng chung', () => {
    test('tiếng Anh có Giao tiếp, TOEIC, IELTS; tiếng Trung có Giao tiếp, HSK', () => {
        expect(kieuChoNgonNgu('en').map((k) => k.key)).toEqual(['giaotiep', 'toeic', 'ielts']);
        expect(kieuChoNgonNgu('zh').map((k) => k.key)).toEqual(['giaotiep', 'hsk']);
        expect(kieuChoNgonNgu('bi').map((k) => k.key)).toEqual(['giaotiep', 'toeic', 'ielts', 'hsk']);
    });

    test('mỗi kiểu chấm đều có độ khó với ba mức easy/medium/hard', () => {
        for (const k of KIEU_CHAM) {
            const muc = doKhoChoKieu(k.key);
            expect(muc.map((m) => m.key)).toEqual(['easy', 'medium', 'hard']);
        }
        expect(DO_KHO_THEO_KIEU.toeic[0].label).toBe('400–500');
    });

    test('kiểu lạ rơi về Dễ/Vừa/Khó', () => {
        expect(doKhoChoKieu('không-có').map((m) => m.label)).toEqual(['Dễ', 'Vừa', 'Khó']);
    });
});

describe('ba màn dùng chung component', () => {
    const screens = {
        'Hội thoại': doc('components', 'conversation', 'ConversationScreen.jsx'),
        'Luyện viết': doc('components', 'essay', 'EssayScreen.jsx'),
        'Dịch đoạn văn': doc('components', 'translation', 'TranslationScreen.jsx'),
        'Đọc hiểu': doc('components', 'reading', 'ReadingScreen.jsx'),
    };
    for (const [ten, src] of Object.entries(screens)) {
        test(`${ten} dùng KieuChamDoKho`, () => {
            expect(src).toMatch(/import KieuChamDoKho from '\.\.\/ai\/KieuChamDoKho\.jsx'/);
            expect(src).toMatch(/<KieuChamDoKho/);
        });
    }

    test('Đọc hiểu gửi kiểu chấm lên server và không còn chữ cứng "đúng dạng TOEIC Part 7"', () => {
        const src = screens['Đọc hiểu'];
        expect(src).toMatch(/ReadingAPI\.passage\(\{[^}]*rubric: kieuDangChon/);
        expect(src).toMatch(/\[loadingDe, level, dang, tuChonGui, kieuDangChon\]/);
        expect(src).not.toMatch(/đúng dạng TOEIC Part 7/);
        expect(src).not.toMatch(/<h2>.*Part 7/);
    });

    test('Đọc hiểu: kho dạng bài chung (không bó theo kiểu chấm), khoá khớp server', () => {
        const src = screens['Đọc hiểu'];
        const server = readFileSync(
            join(__dirname, '..', '..', '..', '..', 'backend', 'services', 'readingGrader.js'), 'utf8');
        // Lấy [nhóm, [khoá dạng...]] theo đúng thứ tự trong khối NHOM_DANG.
        const nhomCua = (s) => {
            const i = s.indexOf('const NHOM_DANG = [');
            const khoi = s.slice(i, s.indexOf('\n];', i));
            return khoi.split(/\n    \{\n/).slice(1).map((n) => [
                n.match(/key: '([^']+)'/)[1],
                [...n.slice(n.indexOf('dang: [')).matchAll(/key: '([^']+)'/g)].map((m) => m[1]),
            ]);
        };
        const fe = nhomCua(src);
        expect(fe.length).toBe(4);
        expect(fe.flatMap(([, ds]) => ds).length).toBeGreaterThanOrEqual(20);
        expect(fe).toEqual(nhomCua(server));
        // Có ô tự nhập và gửi nó lên server.
        expect(src).toMatch(/tuChon: tuChonGui/);
        expect(src).toMatch(/maxLength=\{MAX_TU_CHON\}/);
    });

    test('không còn khối "Kiểu chấm" viết tay trong màn Hội thoại', () => {
        const src = screens['Hội thoại'];
        expect(src).not.toMatch(/ai-setup-title">Kiểu chấm<\/div>\s*<div className="ai-setup-list tr-levels">\s*\{BO_TIEU_CHI_CHON/);
    });
});
