/**
 * Công thức ngữ pháp: nối dây và các hành vi dễ hỏng mà không báo gì.
 *   · Gõ tới đâu gọi AI tới đó → tốn tiền. AI chỉ chạy khi người học bấm.
 *   · Phản hồi tra cũ về sau đè kết quả mới.
 *   · Nội dung AI không gắn nhãn → người học tưởng đã được soát.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');
const src = doc('components', 'nguPhap', 'NguPhapScreen.jsx');

describe('nối dây', () => {
    test('lazy route và menu', () => {
        const app = doc('App.jsx');
        expect(app).toMatch(/import\('@components\/nguPhap\/NguPhapScreen\.jsx'\)/);
        expect(app).toMatch(/'ngu-phap-screen': NguPhapScreen/);
        expect(doc('layouts', 'SideMenu.jsx')).toMatch(/label: 'Công thức ngữ pháp', icon: 'fa-spell-check', screen: 'ngu-phap-screen'/);
    });
    test('API đúng đường dẫn, câu tra được mã hoá', () => {
        const api = doc('api', 'nguPhap.js');
        expect(api).toMatch(/\/ngu-phap\?q=\$\{encodeURIComponent\(q\)\}/);
        expect(api).toMatch(/'\/ngu-phap\/hoi'/);
        expect(api).toMatch(/\/ngu-phap\/\$\{encodeURIComponent\(id\)\}\/vi-du/);
    });
});

describe('hành vi', () => {
    test('khi gõ chỉ tra, không gọi AI; AI chỉ chạy khi bấm nút', () => {
        const tra = src.slice(src.indexOf('const t = setTimeout'), src.indexOf('return () => clearTimeout(t)'));
        expect(tra).toMatch(/NguPhapAPI\.tim\(/);
        expect(tra).not.toMatch(/NguPhapAPI\.hoi|NguPhapAPI\.themViDu/);
        expect(src).toMatch(/onClick=\{hoiAI\}/);
    });
    test('phản hồi cũ không đè kết quả mới', () => {
        expect(src).toMatch(/if \(lan === lanTra\.current\) setData\(d\)/);
    });
    test('nội dung AI có nhãn và lời nhắc đối chiếu', () => {
        expect(src).toMatch(/m\.nguon === 'ai' && <span className="np-nhan-ai">/);
        expect(src).toMatch(/chưa được người soát/);
        expect(src).toMatch(/Ví dụ do AI thêm/);
    });
    test('hết lượt thì khoá nút AI', () => {
        expect(src).toMatch(/disabled=\{dangHoi \|\| conLuot <= 0\}/);
        expect(src).toMatch(/hetLuot=\{conLuot <= 0\}/);
    });
    test('ví dụ tiếng Anh luôn đọc giọng Anh', () => {
        expect(src).toMatch(/GameLogic\.speakWord\(text, 'en-US'\)/);
    });
});
