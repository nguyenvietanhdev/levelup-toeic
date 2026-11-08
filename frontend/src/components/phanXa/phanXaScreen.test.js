/**
 * Phản xạ câu: nối dây và các hành vi dễ hỏng mà không báo gì.
 *   · Tự focus ô nhập khi đang dùng giọng nói → phím Cách gõ dấu cách, không bật micro.
 *   · Nhả phím lúc còn đang xin quyền micro → micro mở mãi.
 *   · Không dừng tiếng khi rời màn → câu vẫn đọc ở màn khác.
 *   · Thêm màn mà quên một đầu nối (lazy route, menu, API, sổ tay phím tắt).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');
const src = doc('components', 'phanXa', 'PhanXaScreen.jsx');

describe('nối dây', () => {
    test('lazy route, menu và sổ tay phím tắt đều có màn này', () => {
        const app = doc('App.jsx');
        expect(app).toMatch(/import\('@components\/phanXa\/PhanXaScreen\.jsx'\)/);
        expect(app).toMatch(/'phan-xa-screen': PhanXaScreen/);
        expect(doc('layouts', 'SideMenu.jsx')).toMatch(/label: 'Phản xạ câu', icon: 'fa-bolt', screen: 'phan-xa-screen'/);
        expect(doc('lib', 'phimTat.js')).toMatch(/screens: \['phan-xa-screen'\]/);
    });
    test('API đúng đường dẫn backend', () => {
        const api = doc('api', 'phanXa.js');
        expect(api).toMatch(/'\/phan-xa\/tong-quan'/);
        expect(api).toMatch(/'\/phan-xa\/buoi'/);
        expect(api).toMatch(/\/phan-xa\/buoi\/\$\{encodeURIComponent\(id\)\}\/cau\/\$\{i\}/);
    });
});

describe('hành vi', () => {
    test('hỏi khi thoát lúc đang làm; rời màn thì dừng tiếng và micro', () => {
        expect(src).toMatch(/useHoiKhiThoat\('phan-xa-screen', dangLam, \{/);
        const than = src.slice(src.indexOf('if (active) return undefined;'));
        expect(than.slice(0, 120)).toMatch(/dungPhat\(\);\s+ghi\.lamLai\(\);/);
    });
    test('phím Cách: bỏ qua khi đang gõ trong ô nhập hoặc có popup, không bật lại khi giữ', () => {
        expect(src).toMatch(/if \(e\.repeat \|\| coPopup\(\) \|\| laONhap\(e\.target\)\) return;/);
    });
    test('chỉ tự focus ô nhập khi câu trước là gõ, không phải giọng nói', () => {
        expect(src).toMatch(/if \(pha === 'hoi' && vuaGo\.current\) oNhap\.current\?\.focus\(\);/);
        const bat = src.slice(src.indexOf('const batDauNoi'));
        expect(bat.slice(0, 400)).toMatch(/vuaGo\.current = false;/);
    });
    test('nhả phím khi micro chưa mở xong: mở xong thì dừng luôn', () => {
        expect(src).toMatch(/if \(dangGhi && muonDung\.current\) \{/);
    });
    test('lỗi mạng không làm kẹt lượt: có kết quả "không tính" để sang câu tiếp', () => {
        expect(src).toMatch(/kq = \{ dung: false, khongChac: true, cauDung: '', ghiChu: e\.message \}/);
    });
    test('hết giờ gợi ý không tự chấm sai', () => {
        const giay = src.slice(src.indexOf('const t = setInterval'), src.indexOf('const batDauNoi'));
        expect(giay).not.toMatch(/gui\(/);
    });
    test('đọc và nghe đúng ngôn ngữ đang luyện (server quyết), không để máy đoán', () => {
        expect(src).toMatch(/GameLogic\.speakWord\(text, lang === 'zh' \? 'zh-CN' : 'en-US'\)/);
        expect(src).toMatch(/const lang = tongQuan\?\.lang \|\| \(getVocabLang\(\) === 'zh' \? 'zh' : 'en'\);/);
        expect(src).toMatch(/useGhiAm\(speechLangFor\(lang\)\)/);
        expect(src).toMatch(/phat\(kq\.cauDung, lang\)/);
        expect(src).toMatch(/phat\(ketQua\.cauDung, lang\)/);
    });
    test('tiếng Trung hiện pinyin ở kết quả và danh sách cần ôn', () => {
        expect(src).toMatch(/\{ketQua\.pinyin && <p className="px-pinyin">\{ketQua\.pinyin\}<\/p>\}/);
        expect(src).toMatch(/\{c\.pinyin && <small className="px-pinyin">\{c\.pinyin\}<\/small>\}/);
    });
});
