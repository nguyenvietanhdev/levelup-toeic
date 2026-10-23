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
    };
    for (const [ten, src] of Object.entries(screens)) {
        test(`${ten} dùng KieuChamDoKho`, () => {
            expect(src).toMatch(/import KieuChamDoKho from '\.\.\/ai\/KieuChamDoKho\.jsx'/);
            expect(src).toMatch(/<KieuChamDoKho/);
        });
    }

    test('không còn khối "Kiểu chấm" viết tay trong màn Hội thoại', () => {
        const src = screens['Hội thoại'];
        expect(src).not.toMatch(/ai-setup-title">Kiểu chấm<\/div>\s*<div className="ai-setup-list tr-levels">\s*\{BO_TIEU_CHI_CHON/);
    });
});
