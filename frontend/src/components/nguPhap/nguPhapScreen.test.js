/**
 * Công thức ngữ pháp: nối dây và các hành vi dễ hỏng mà không báo gì.
 *   · Gõ tới đâu gọi AI tới đó → tốn lượt vì câu tra chưa gõ xong.
 *   · Phản hồi tra cũ về sau đè kết quả mới.
 *   · Nháp tự vào thư viện khi chưa ai đồng ý.
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
        expect(api).toMatch(/\/ngu-phap\/nhap\/\$\{encodeURIComponent\(nhapId\)\}\/them/);
        expect(api).toMatch(/\/ngu-phap\/\$\{encodeURIComponent\(id\)\}\/vi-du/);
    });
});

describe('luồng tìm không thấy', () => {
    test('khi gõ chỉ tra, không gọi AI', () => {
        const tra = src.slice(src.indexOf('const t = setTimeout'), src.indexOf('return () => clearTimeout(t)'));
        expect(tra).toMatch(/NguPhapAPI\.tim\(/);
        expect(tra).not.toMatch(/NguPhapAPI\.hoi|hoiAI|NguPhapAPI\.themViDu/);
    });
    test('Enter tra lại câu mới nhất, có mục đúng tên thì mở, không có mới gọi AI', () => {
        const than = src.slice(src.indexOf('const guiTim'), src.indexOf('const themVaoThuVien'));
        expect(than).toMatch(/NguPhapAPI\.tim\(cauTra\)/);
        expect(than).toMatch(/if \(dungTen\) setMo\(dungTen\.id\);\s+else hoiAI\(\);/);
    });
    test('chủ điểm đã có: báo và mở mục đó, không hiện nháp', () => {
        expect(src).toMatch(/r\.ketQua === 'da-co'/);
        expect(src).toMatch(/chính là chủ điểm/);
        expect(src).toMatch(/moMuc\(r\.muc, r\.conLuot\)/);
    });
    test('chủ điểm mới: hỏi trước khi thêm; chỉ nút đồng ý mới gọi API thêm', () => {
        expect(src).toMatch(/Có thêm vào thư viện/);
        expect(src).toMatch(/onClick=\{themVaoThuVien\}/);
        expect(src).toMatch(/onClick=\{\(\) => setNhap\(null\)\}>Không thêm/);
        expect(src.match(/NguPhapAPI\.themVaoThuVien\(/g)).toHaveLength(1);
    });
    test('gửi đi chỉ id nháp, không gửi nội dung', () => {
        expect(src).toMatch(/NguPhapAPI\.themVaoThuVien\(nhap\.id\)/);
    });
    test('đổi câu tra thì bỏ nháp cũ', () => {
        expect(src).toMatch(/setBao\(''\); setNhap\(null\); \}, \[q\]\)/);
    });
});

describe('hành vi khác', () => {
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
