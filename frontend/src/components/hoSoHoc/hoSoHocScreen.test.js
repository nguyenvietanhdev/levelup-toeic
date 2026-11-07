/**
 * Mục tiêu & trình độ: nối dây và các hành vi dễ hỏng mà không báo gì.
 *   · Chọn được mục tiêu chưa có lộ trình → hứa điều hệ thống chưa làm.
 *   · Câu nói chuyển sang gõ vẫn báo là "nói" → điểm Nói sai.
 *   · Lỗi mạng làm kẹt giữa bài.
 *   · Bước Phản xạ câu trên lộ trình không mở đúng khung trọng tâm.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');
const src = doc('components', 'hoSoHoc', 'HoSoHocScreen.jsx');
const loTrinh = doc('components', 'loTrinh', 'LoTrinhScreen.jsx');
const phanXa = doc('components', 'phanXa', 'PhanXaScreen.jsx');

describe('nối dây', () => {
    test('lazy route và menu', () => {
        const app = doc('App.jsx');
        expect(app).toMatch(/import\('@components\/hoSoHoc\/HoSoHocScreen\.jsx'\)/);
        expect(app).toMatch(/'ho-so-hoc-screen': HoSoHocScreen/);
        expect(doc('layouts', 'SideMenu.jsx')).toMatch(/label: 'Mục tiêu & trình độ', icon: 'fa-bullseye', screen: 'ho-so-hoc-screen'/);
    });
    test('API đúng đường dẫn backend', () => {
        const api = doc('api', 'hoSoHoc.js');
        expect(api).toMatch(/'\/ho-so-hoc'/);
        expect(api).toMatch(/'\/ho-so-hoc\/muc-tieu'/);
        expect(api).toMatch(/'\/ho-so-hoc\/kiem-tra'/);
        expect(api).toMatch(/\/ho-so-hoc\/kiem-tra\/\$\{encodeURIComponent\(id\)\}\/tra-loi/);
    });
});

describe('mục tiêu và test', () => {
    test('cả 4 mục tiêu chọn được; IELTS, HSK có phần riêng', () => {
        expect(src.match(/khoa: true/g)).toBeNull();
        expect(src).toMatch(/\['ielts', 'hsk'\]\.includes\(hoSo\?\.mucTieu\) && \(\s+<PanelBang/);
        const bang = doc('components', 'hoSoHoc', 'PanelBang.jsx');
        expect(bang).toMatch(/sessionStorage\.setItem\('levelup\.kieuCham', rubric\)/);
        expect(bang).toMatch(/không quy ra/);
        expect(src).toMatch(/key: 'toeic', ten: 'TOEIC', icon: 'fa-file-lines', moTa: '[^']+' \}/);
        expect(src).toMatch(/disabled=\{!!m\.khoa \|\| dang\}/);
        expect(src).toMatch(/key: 'giao-tiep', ten: 'Giao tiếp', icon: 'fa-comments', moTa: '[^']+' \}/);
    });
    test('mục tiêu luôn hiện và đổi được, cả trước và sau khi làm test', () => {
        expect(src).toMatch(/pha === 'hoSo' && hoSo && \(\s+<>\s+<h3[^>]*>\{hoSo\.mucTieu \? 'Mục tiêu đang theo'/);
        expect(src).toMatch(/onChon=\{doiMucTieu\}/);
    });
    test('mỗi mục tiêu hiện đúng phần của nó', () => {
        expect(src).toMatch(/hoSo\?\.mucTieu === 'toeic' && \(\s+<PanelToeic/);
        expect(src).toMatch(/hoSo\?\.mucTieu === 'giao-tiep' && !hoSo\.testNgay/);
        expect(src).toMatch(/hoSo\?\.mucTieu === 'giao-tiep' && hoSo\.testNgay/);
    });
    test('màn TOEIC mở đúng Part hệ thống gợi ý, đọc xong xoá ngay', () => {
        const panel = doc('components', 'hoSoHoc', 'PanelToeic.jsx');
        const toeic = doc('components', 'toeic', 'ToeicScreen.jsx');
        expect(panel).toMatch(/sessionStorage\.setItem\('levelup\.toeic\.moi'/);
        expect(toeic).toMatch(/sessionStorage\.getItem\('levelup\.toeic\.moi'\)/);
        expect(toeic).toMatch(/sessionStorage\.removeItem\('levelup\.toeic\.moi'\)/);
    });
    test('hỏi khi thoát lúc đang test; rời màn thì dừng tiếng và micro', () => {
        expect(src).toMatch(/useHoiKhiThoat\('ho-so-hoc-screen', pha === 'test', \{/);
        const than = src.slice(src.indexOf('if (active) return undefined;'));
        expect(than.slice(0, 120)).toMatch(/dungPhat\(\);\s+ghi\.lamLai\(\);/);
    });
    test('chỉ giọng nói thật hoặc "Chưa biết" ở câu nói mới gửi cach noi; gõ thay gửi cach go', () => {
        expect(src).toMatch(/nop\(\{ traLoi: chu, cach: 'noi' \}\)/);
        expect(src).toMatch(/if \(chu\) nop\(\{ traLoi: chu, cach: 'go' \}\)/);
        expect(src).toMatch(/cach: canNoi \? 'noi' : 'go'/);
    });
    test('lỗi giữa bài có lối ra, không kẹt', () => {
        expect(src).toMatch(/setLoiTest\(e\.message\)/);
        expect(src).toMatch(/Làm lại từ đầu/);
    });
    test('so sánh lấy từ server (chỉ kỹ năng chung), câu sai hiện điều máy đã nghe', () => {
        expect(src).toMatch(/const soVoi = hoSo\?\.soVoiTruoc;/);
        expect(src).not.toMatch(/lanTruoc/);
        expect(src).toMatch(/c\.daNoi \? 'Máy nghe được' : 'Bạn gõ'/);
    });
    test('kết quả nói rõ đây là ước lượng', () => {
        expect(src).toMatch(/ước lượng ban đầu từ 15 câu/);
    });
});

describe('lộ trình và Phản xạ câu', () => {
    test('chưa có hồ sơ thì mời làm test; có thì hiện lý do của từng bước', () => {
        expect(loTrinh).toMatch(/data\?\.moiLapHoSo/);
        expect(loTrinh).toMatch(/showScreen\('ho-so-hoc-screen'\)/);
        expect(loTrinh).toMatch(/b\.lyDo &&/);
    });
    test('bước Phản xạ mở đúng khung trọng tâm và Phản xạ đọc rồi xoá ngay', () => {
        expect(loTrinh).toMatch(/sessionStorage\.setItem\('levelup\.phanXa\.khung', b\.khung/);
        expect(phanXa).toMatch(/sessionStorage\.getItem\('levelup\.phanXa\.khung'\)/);
        expect(phanXa).toMatch(/sessionStorage\.removeItem\('levelup\.phanXa\.khung'\)/);
    });
    test('thẻ quy tắc: tự hiện khi server yêu cầu, xem lại được sau câu sai', () => {
        expect(phanXa).toMatch(/setPha\(b\.canXem\?\.length \? 'quyTac' : 'hoi'\)/);
        expect(phanXa).toMatch(/!ketQua\.dung && buoi\.quyTac\?\.\[cau\.khung\]/);
    });
    test('chẩn đoán có lối đi thẳng tới luyện khung đó', () => {
        expect(src).toMatch(/luyenKhung\(c\.kyNang\)/);
        expect(src).toMatch(/sessionStorage\.setItem\('levelup\.phanXa\.khung', khung\)/);
    });
    test('Phản xạ báo cách trả lời để hồ sơ biết câu nào thật sự nói', () => {
        expect(phanXa).toMatch(/if \(chu\) gui\(chu, 'noi'\);/);
        expect(phanXa).toMatch(/gui\(chu, 'go'\);/);
        expect(doc('api', 'phanXa.js')).toMatch(/\{ traLoi, cach \}/);
    });
});
