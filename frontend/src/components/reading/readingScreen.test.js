/**
 * Màn hình Đọc hiểu Part 7.
 *
 * Đọc mã nguồn: render đủ màn này cần `useGame`, `GameLogic`, `Energy` và một
 * server giả — công lớn hơn thứ nó kiểm. Điều cần giữ là các bất biến về luồng
 * và về thứ KHÔNG được lộ.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'ReadingScreen.jsx'), 'utf8');
const api = readFileSync(join(__dirname, '..', '..', 'api', 'reading.js'), 'utf8');
const home = readFileSync(join(__dirname, '..', 'home', 'HomeScreen.jsx'), 'utf8');
const menu = readFileSync(join(__dirname, '..', '..', 'layouts', 'SideMenu.jsx'), 'utf8');
const app = readFileSync(join(__dirname, '..', '..', 'App.jsx'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

describe('đáp án không nằm ở client', () => {
    test('màn hình KHÔNG tự chấm — điểm do server trả về', () => {
        // Client tự so đáp án nghĩa là đáp án phải có ở client, tức mở DevTools
        // là thấy hết.
        expect(src).toMatch(/result\?\.details\?\.\[i\]/);
        expect(src).not.toMatch(/q\.answer/);
        expect(src).not.toMatch(/correctAnswer/);
    });

    test('gửi `readingId` để server tìm lại đề', () => {
        expect(api).toMatch(/readingId, answers/);
    });

    test('thưởng lấy từ SERVER, không tự tính', () => {
        // Mọi logic XP/xu phải server-side.
        expect(src).toMatch(/creditServerRewards/);
        expect(src).toMatch(/GameState\.setEnergy\?\.\(d\.energyRemaining\)/);
    });
});

describe('luồng làm bài', () => {
    test('đổi bài thì XOÁ lựa chọn cũ', () => {
        // Giữ lại là các câu tick sẵn đáp án của bài trước, mà thứ tự câu hoàn
        // toàn khác.
        const i = src.indexOf('const handleDeMoi');
        const than = src.slice(i, src.indexOf('}, [loadingDe, level, dang]);', i));
        expect(than).toMatch(/setChon\(new Array\(d\.questions\.length\)\.fill\(''\)\)/);
        expect(than).toMatch(/setResult\(null\)/);
    });

    test('đề HẾT HẠN xử lý riêng, không báo lỗi chung', () => {
        // Chưa trừ năng lượng nên chỉ cần xin bài mới — nói rõ thay vì để người
        // dùng đoán.
        expect(src).toMatch(/err\?\.expired/);
        const i = src.indexOf('err?.expired');
        expect(src.slice(i, i + 300)).toMatch(/setDe\(null\)/);
    });

    test('thiếu năng lượng → mở popup nạp, mua xong nộp luôn', () => {
        const i = src.indexOf('err?.energyNeeded');
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, i + 260)).toMatch(/showRefillModal/);
        expect(src.slice(i, i + 260)).toMatch(/nopRef\.current/);
    });

    test('KHÔNG chặn nộp khi còn câu bỏ trống', () => {
        // Trong đề thi thật vẫn nộp được, và câu bỏ trống tính sai. Chặn là dạy
        // một thói quen không tồn tại trong phòng thi.
        const i = src.indexOf('onClick={handleNop}');
        const nut = src.slice(Math.max(0, i - 200), i + 120);
        expect(nut).toMatch(/disabled=\{grading\}/);
        expect(nut).not.toMatch(/daLam !== tongCau|daLam < tongCau/);
    });

    test('khoá lựa chọn sau khi đã chấm', () => {
        // Đổi đáp án sau khi thấy kết quả là tự lừa mình.
        expect(src).toMatch(/disabled=\{!!result \|\| grading\}/);
    });
});

describe('hiển thị kết quả', () => {
    test('tô đáp án ĐÚNG dù người học chọn gì', () => {
        // Thấy đáp án đúng ở đâu mới học được; chỉ biết mình sai thì không.
        expect(src).toMatch(/const laDapAn = ket && ket\.answer === nhan/);
    });

    test('hiện giải thích cho từng câu', () => {
        // Sai mà không biết vì sao thì lần sau vẫn sai đúng chỗ đó.
        expect(src).toMatch(/ket\?\.explain/);
    });

    test('lựa chọn sai phân biệt cả bằng GẠCH NGANG, không chỉ màu', () => {
        const i = css.indexOf('.rd-opt.is-wrong {');
        expect(i).toBeGreaterThan(-1);
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/text-decoration: line-through/);
    });

    test('giữ xuống dòng của bài đọc', () => {
        // Email/thông báo có bố cục riêng, gộp thành khối chữ liền là mất một
        // phần của việc đọc hiểu Part 7.
        const i = css.indexOf('.rd-passage-text {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/white-space: pre-wrap/);
    });
});

describe('lối vào', () => {
    test('lối vào là SIDEBAR, không phải thẻ trong lưới', () => {
        // Lưới trang chủ chỉ chứa chế độ chạy qua `PracticeManager` — chọn đề,
        // chọn Part rồi vào bài. Chế độ có màn hình riêng nằm lẫn giữa chúng
        // thì bấm vào lại đi một đường khác hẳn, trông lạc loài.
        expect(menu).toMatch(/screen: 'reading-screen'/);
        expect(home).not.toMatch(/reading-screen/);
    });

    test('khoá theo Level ở sidebar', () => {
        expect(menu).toMatch(/feature: 'feature:reading'/);
    });

    test('màn hình đăng ký trong App, nạp lười', () => {
        expect(app).toMatch(/'reading-screen': ReadingScreen/);
        expect(app).toMatch(/lazy\(\(\) => import\('@components\/reading/);
    });
});

describe('gửi lên server', () => {
    test('từ gợi ý lấy NGẪU NHIÊN, không phải 8 từ đầu', () => {
        const i = src.indexOf('function layTuGoiY');
        expect(src.slice(i, src.indexOf('\n}', i))).toMatch(/sort\(\(\) => Math\.random/);
    });

    test('hai lớp `.data` được gỡ đúng', () => {
        expect(api).toMatch(/'success' in outer/);
        expect(api).toMatch(/if \('data' in outer\) return outer\.data/);
    });

    test('lỗi mang theo DỮ LIỆU, không chỉ câu chữ', () => {
        // `expired` và `energyNeeded` là thứ để màn hình xử lý đúng cách.
        expect(api).toMatch(/Object\.assign\(err, payload\)/);
    });
});

describe('CSS', () => {
    test('mỗi selector khai đúng MỘT lần', () => {
        for (const sel of ['.rd-passage {', '.rd-opt {', '.rd-q {', '.rd-explain {']) {
            expect(css.split(sel).length - 1).toBe(1);
        }
    });
});
