/**
 * Nghe với AI: màn đã đăng ký và có trong menu; đoạn gốc chỉ hiện SAU khi nộp bài;
 * âm thanh đi qua đường dẫn riêng (không lộ chữ).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const screen = readFileSync(join(__dirname, 'ListeningScreen.jsx'), 'utf8');
const api = readFileSync(join(__dirname, '..', '..', 'api', 'listening.js'), 'utf8');
const app = readFileSync(join(__dirname, '..', '..', 'App.jsx'), 'utf8');
const menu = readFileSync(join(__dirname, '..', '..', 'layouts', 'SideMenu.jsx'), 'utf8');

describe('màn Nghe với AI', () => {
    test('đã đăng ký trong App và có mục trong menu', () => {
        expect(app).toMatch(/'listening-screen': ListeningScreen/);
        expect(menu).toMatch(/screen: 'listening-screen'/);
        expect(menu).toMatch(/title: 'Nghe với AI'/);
    });

    test('đoạn gốc chỉ hiện trong kết quả sau khi nộp', () => {
        // Phần hiển thị đoạn gốc nằm TRONG nhánh có kết quả (ketQua), không ở form nhập.
        const i = screen.indexOf('Đoạn gốc');
        const nhanh = screen.indexOf('ketQua ? (');
        expect(i).toBeGreaterThan(-1);
        expect(nhanh).toBeGreaterThan(-1);
        expect(i).toBeGreaterThan(nhanh);
    });

    test('âm thanh lấy qua audioUrl, không đưa chữ vào giao diện trước khi chấm', () => {
        // Xin audio tốc độ gốc; tốc độ do trình phát lo (xem test dưới).
        expect(screen).toMatch(/ListeningAPI\.audioUrl\(phien\.id, 1\)/);
        expect(screen).not.toMatch(/phien\.passage/);
    });

    test('đổi tốc độ bằng playbackRate — không tải lại audio, vẫn đúng khi server dùng giọng dự phòng', () => {
        // Trước đây đổi tốc độ là đổi `src`: tải lại từ đầu, và giọng dự phòng (Google)
        // không chỉnh tốc độ được nên ba nút thành vô tác dụng.
        expect(screen).toMatch(/key=\{`\$\{phien\.id\}-\$\{lanTai\}`\}/);
        expect(screen).toMatch(/if \(audioRef\.current\) audioRef\.current\.playbackRate = tocDo;/);
        expect(screen).toMatch(/onLoadedMetadata=\{\(e\) => \{ e\.currentTarget\.playbackRate = tocDo;/);
    });

    test('audio lỗi → báo rõ và cho tải lại (không im lặng hiện 0:00)', () => {
        expect(screen).toMatch(/onError=\{\(\) => setLoiAudio\(/);
        expect(screen).toMatch(/setLanTai\(\(n\) => n \+ 1\)/);
    });
});

describe('API nghe', () => {
    test('gọi đúng đường dẫn start, grade và audio', () => {
        expect(api).toMatch(/\/listening\/start/);
        expect(api).toMatch(/\/listening\/\$\{encodeURIComponent\(id\)\}\/grade/);
        expect(api).toMatch(/\/api\/listening\/\$\{encodeURIComponent\(id\)\}\/audio/);
    });
});

describe('nghe tiếng Trung', () => {
    test('không còn chặn hay khoá nút khi học tiếng Trung', () => {
        expect(screen).not.toMatch(/chuaHoTro/);
        expect(screen).not.toMatch(/chỉ có tiếng Anh/);
        expect(screen).toMatch(/disabled=\{busy\}/);
        expect(screen).toMatch(/useGoiYDang\('listening', active\)/);
    });

    test('ngôn ngữ theo phiên (server trả), đơn vị chấm là chữ với tiếng Trung', () => {
        expect(screen).toMatch(/const zh = \(phien\?\.lang \|\| \(getVocabLang\(\) === 'zh' \? 'zh' : 'en'\)\) === 'zh';/);
        expect(screen).toMatch(/const donVi = zh \? 'chữ' : 'từ';/);
        expect(screen).toMatch(/\{ketQua\.total\} \{donVi\}/);
        expect(screen).toMatch(/zh \? 'Gõ đoạn bạn nghe được bằng chữ Hán…'/);
    });
});

describe('lỗi server hiện đúng lý do', () => {
    test('API Nghe đọc câu lỗi ở `error` (Http đặt ở đó), không chỉ `message`', () => {
        // Lỗi dựng trước rồi gắn dữ liệu (`energyNeeded`…) — vẫn đọc `error` trước `message`.
        expect(api).toMatch(/new Error\(res\.error \|\| res\.message \|\| /);
    });
});
