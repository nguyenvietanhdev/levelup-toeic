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
const src = doc('components', 'nguPhap', 'NguPhapTra.jsx');
const ngan = doc('components', 'nguPhap', 'NganNguPhap.jsx');
const lienKet = doc('lib', 'nguPhapLienKet.js');
const khoLoi = readFileSync(join(__dirname, '..', '..', '..', '..', 'backend', 'services', 'nguPhapKho.js'), 'utf8');

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
        expect(than).toMatch(/NguPhapAPI\.tim\(cauTra, lang\)/);
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
        expect(src).toMatch(/setBao\(''\); setNhap\(null\); }, \[q, lang\]\)/);
    });
});

describe('tra trong lúc luyện tập', () => {
    test('ngăn luôn sẵn sàng ở mọi màn, có nút mở trên thanh trên cùng', () => {
        expect(doc('App.jsx')).toMatch(/<NganNguPhap \/>/);
        expect(doc('layouts', 'TopNav.jsx')).toMatch(/id="nav-ngu-phap-btn"[\s\S]{0,300}onClick=\{\(\) => moNguPhap\(\)\}/);
    });
    test('mở bằng sự kiện, không đổi màn: bài đang làm không bị mất', () => {
        expect(ngan).toMatch(/addEventListener\(SU_KIEN_NGU_PHAP/);
        expect(ngan).not.toMatch(/showScreen/);
    });
    test('phím gõ trong ngăn không lọt ra bài đang làm; Esc vẫn đóng được', () => {
        expect(ngan).toMatch(/e\.stopPropagation\(\)/);
        expect(ngan).toMatch(/onKeyDown=\{chanPhim\}/);
        expect(ngan).toMatch(/onKeyUp=\{chanPhim\}/);
        expect(ngan).toMatch(/e\.key === 'Escape'\) dong\(\)/);
    });
    test('chỉ tải phần tra cứu sau lần mở đầu tiên', () => {
        expect(ngan).toMatch(/lazy\(\(\) => import\('\.\/NguPhapTra\.jsx'\)\)/);
        expect(ngan).toMatch(/if \(!daMo\) return null;/);
    });
    test('mọi id trong bảng nối đều có thật trong kho lõi', () => {
        const ids = [...lienKet.matchAll(/\{ id: '([a-z-]+)' \}/g)].map((m) => m[1]);
        expect(ids.length).toBeGreaterThan(5);
        for (const id of ids) expect(khoLoi).toContain(`id: '${id}'`);
        for (const [, n] of lienKet.matchAll(/\{ nhom: '([a-z-]+)' \}/g)) expect(khoLoi).toContain(`key: '${n}'`);
    });
    test('có lối mở từ lỗi đã chữa, Sổ tay lỗi, câu sai và chẩn đoán', () => {
        expect(doc('components', 'chuaBai', 'ChuaBai.jsx')).toMatch(/moNguPhap\(NGU_PHAP_THEO_LOI\[dangChon\.loai\]\)/);
        expect(doc('components', 'tienBo', 'SoTayLoi.jsx')).toMatch(/moNguPhap\(NGU_PHAP_THEO_LOI\[m\.loai\]\)/);
        expect(doc('components', 'phanXa', 'PhanXaScreen.jsx')).toMatch(/moNguPhap\(NGU_PHAP_THEO_KHUNG\[cau\.khung\]\)/);
        expect(doc('components', 'hoSoHoc', 'HoSoHocScreen.jsx')).toMatch(/moNguPhap\(NGU_PHAP_THEO_KHUNG\[c\.kyNang\]\)/);
    });
});

describe('luyện từng công thức', () => {
    const luyen = doc('components', 'nguPhap', 'LuyenNguPhap.jsx');
    test('mỗi mục có nút luyện, đến hạn thì đổi thành ôn lại', () => {
        expect(src).toMatch(/onClick=\{onLuyen\}/);
        expect(src).toMatch(/Ôn lại công thức này/);
        expect(src).toMatch(/Luyện công thức này/);
    });
    test('có lọc mục đến hạn ôn; xong lượt thì tải lại để cập nhật nhãn', () => {
        expect(src).toMatch(/nhomChon === 'den-han'/);
        expect(src).toMatch(/onXong=\{\(\) => setLanTai/);
    });
    test('API đúng đường dẫn', () => {
        const api = doc('api', 'nguPhap.js');
        expect(api).toMatch(/\/ngu-phap\/\$\{encodeURIComponent\(id\)\}\/luyen/);
        expect(api).toMatch(/\/ngu-phap\/buoi\/\$\{encodeURIComponent\(buoiId\)\}\/cau\/\$\{i\}/);
    });
    test('đủ ba dạng câu; câu sửa điền sẵn câu sai; làm sai xem lại được công thức', () => {
        expect(luyen).toMatch(/chon: 'Chọn đáp án đúng', sua: 'Sửa câu sai', dich: zh \? 'Dịch sang tiếng Trung' : 'Dịch sang tiếng Anh'/);
        expect(luyen).toMatch(/setNhap\(cau\.loai === 'sua' \? cau\.sai : ''\)/);
        expect(luyen).toMatch(/!ketQua\.dung && \(/);
        expect(luyen).toMatch(/xemCongThuc && <div className="np-luyen-cong-thuc">\{children\}/);
    });
    test('lỗi mạng không làm kẹt lượt; nói rõ câu do AI soạn', () => {
        expect(luyen).toMatch(/setKetQua\(\{ dung: false, khongChac: true/);
        expect(luyen).toMatch(/do AI soạn và chưa được người soát/);
    });
    test('Enter trong bài luyện không lọt ra bài đang làm: nằm trong ngăn đã chặn phím', () => {
        expect(ngan).toMatch(/<NguPhapTra active=\{mo\} dich=\{dich\} \/>/);
    });
});

describe('báo mục sai', () => {
    test('chỉ mục AI mới có nút; ẩn với mọi người nên hỏi lại một bước', () => {
        expect(src).toMatch(/m\.nguon === 'ai' && \(\s+<p className="px-goi-y">\s+\{hoiBao/);
        expect(src).toMatch(/Ẩn mục này khỏi thư viện cho mọi người\?/);
    });
    test('API đúng đường dẫn', () => {
        const api = doc('api', 'nguPhap.js');
        expect(api).toMatch(/\/ngu-phap\/\$\{encodeURIComponent\(id\)\}\/bao-sai/);
        expect(api).toMatch(/\/cau\/\$\{i\}\/bao-sai/);
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
    test('ví dụ đọc đúng giọng: câu có chữ Hán đọc giọng Trung, còn lại giọng Anh', () => {
        expect(src).toMatch(/GameLogic\.speakWord\(text, RE_HAN\.test\(text\) \? 'zh-CN' : 'en-US'\)/);
    });
});
