/**
 * Menu bên chia nhóm + chế độ "Ôn lại từ sai".
 *
 * Bối cảnh: từng có lúc tồn tại HAI chế độ ôn từ sai — một ô trong lưới trang
 * chủ (`review-mistakes`, có sẵn từ trước) và một màn hình riêng ở menu bên
 * (dựng thêm sau). Cả hai gọi cùng endpoint `/wrong-words/review` và lấy cùng
 * tập từ. Màn hình riêng đã bị gỡ; test này khoá lại để không mọc lại.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const menu = readFileSync(join(__dirname, 'SideMenu.jsx'), 'utf8');
const home = readFileSync(
    join(__dirname, '..', 'components', 'home', 'HomeScreen.jsx'), 'utf8');
const app = readFileSync(join(__dirname, '..', 'App.jsx'), 'utf8');
const badges = readFileSync(join(__dirname, 'useMenuBadges.js'), 'utf8');

describe('menu chia nhóm', () => {
    test('Hội thoại và Viết luận NẰM CÙNG một nhóm', () => {
        // Hai chế độ này gọi AI có phí và tốn năng lượng, khác hẳn các chế độ
        // bấm-là-chơi — gom lại để thấy rõ chúng cùng một loại.
        const i = menu.indexOf("title: 'Luyện với AI'");
        expect(i).toBeGreaterThan(-1);
        const group = menu.slice(i, menu.indexOf('},\n    {', i));
        expect(group).toContain("screen: 'conversation-screen'");
        expect(group).toContain("screen: 'essay-screen'");
    });

    test('KHÔNG mục nào bị mất khi gom nhóm', () => {
        // Gom nhóm mà đánh rơi một mục là người dùng mất hẳn lối vào tính năng.
        for (const s of [
            'toeic-screen', 'conversation-screen', 'essay-screen',
            'quest-screen', 'leaderboard-screen', 'achievements-screen',
            'statistics-screen', 'shop-screen', 'inventory-screen',
            'vocab-screen', 'profile-screen', 'settings-screen',
        ]) {
            expect(menu).toContain(`screen: '${s}'`);
        }
    });

    test('mỗi màn chỉ xuất hiện ĐÚNG một lần', () => {
        const found = [...menu.matchAll(/screen: '([\w-]+)'/g)].map(m => m[1]);
        expect(new Set(found).size).toBe(found.length);
    });

    test('tiêu đề nhóm ẩn với trình đọc màn hình', () => {
        // Nút đã có nhãn đầy đủ; đọc thêm tiêu đề chỉ làm dài mà không thêm gì.
        expect(menu).toMatch(/menu-group-title" aria-hidden="true"/);
    });
});

describe('KHÔNG có màn ôn từ trùng lặp', () => {
    test('menu bên không có mục ôn từ riêng', () => {
        // Chế độ ôn từ sai đã nằm trong lưới trang chủ; thêm một lối vào thứ hai
        // cho cùng dữ liệu là hai thứ trông như hai tính năng.
        expect(menu).not.toContain('review-screen');
    });

    test('App không đăng ký màn review-screen', () => {
        expect(app).not.toContain('review-screen');
        expect(app).not.toContain('ReviewScreen');
    });

    test('badge menu không gọi API đã bỏ', () => {
        // Gọi mỗi lần mở menu cho một badge không còn ai hiển thị là phí băng thông.
        expect(badges).not.toContain('reviewDue');
        expect(badges).not.toContain('wrong-words/review');
    });
});

describe('chế độ "Ôn lại từ sai" trong lưới trang chủ', () => {
    const line = (() => {
        const i = home.indexOf("mode: 'review-mistakes'");
        return home.slice(home.lastIndexOf('{', i), home.indexOf('},', i));
    })();

    test('KHÔNG khoá cuối tuần', () => {
        // Lịch giãn cách SM-2 chỉ có tác dụng khi ôn đúng ngày đến hạn; khoá vào
        // cuối tuần là phá chính cơ chế nó dựa vào.
        expect(line).not.toContain('weekendOnly');
    });

    test('MIỄN PHÍ năng lượng', () => {
        // Thu phí cho việc sửa lỗi của chính mình là phạt đúng người chịu khó.
        expect(line).toMatch(/cost: 0\b/);
    });

    test('mô tả nói rõ là ôn theo lịch giãn cách', () => {
        expect(line).toMatch(/giãn cách/);
    });

    test('giá client và server phải KHỚP', () => {
        // Lệch nhau thì client hiện một giá, server trừ một giá khác.
        const cfg = readFileSync(join(__dirname, '..', 'game', 'config.js'), 'utf8');
        const srv = readFileSync(
            join(__dirname, '..', '..', '..', 'backend', 'utils', 'energyCosts.js'), 'utf8');
        const g = (s) => Number(s.match(/'review-mistakes':\s*(\d+)/)[1]);
        expect(g(cfg)).toBe(0);
        expect(g(srv)).toBe(0);
    });
});

describe('số "từ cần ôn" trên ô chế độ', () => {
    test('lấy từ SERVER, không đếm localStorage', () => {
        // localStorage chứa TỔNG số từ sai — luôn lớn hơn số đến hạn hôm nay, và
        // không lọc theo ngôn ngữ đang học. Ô hứa "N từ cần ôn" nên N phải là số
        // bấm vào sẽ gặp.
        expect(home).toMatch(/WrongWordsAPI\.due\(/);
        expect(home).toMatch(/setWrongWordsCount\(dueTotal\)/);
    });

    test('loadLocalData KHÔNG ghi đè số của server', () => {
        // Hàm đó chạy lại mỗi lần QUEST_UPDATED; đặt lại count ở đó là số server
        // bị thay bằng số localStorage sau vài giây.
        const i = home.indexOf('const loadLocalData');
        const body = home.slice(i, home.indexOf('}, []);', i));
        expect(body).not.toContain('setWrongWordsCount');
    });
});
