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
    test('Hội thoại nằm nhóm NÓI, Luyện viết nằm nhóm VIẾT (gom theo kỹ năng)', () => {
        // Các chế độ AI gom theo kỹ năng: Nói / Đọc / Viết. Hội thoại là kỹ năng Nói,
        // Luyện viết là kỹ năng Viết.
        const nhom = (tieuDe) => {
            const i = menu.indexOf(`title: '${tieuDe}'`);
            expect(i).toBeGreaterThan(-1);
            return menu.slice(i, menu.indexOf('},\n    {', i));
        };
        expect(nhom('Nói với AI')).toContain("screen: 'conversation-screen'");
        expect(nhom('Viết với AI')).toContain("screen: 'essay-screen'");
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

    test('tiêu đề nhóm là NÚT thu/mở, báo trạng thái cho trình đọc màn hình', () => {
        // Trước đây tiêu đề chỉ là nhãn nên ẩn (`aria-hidden`). Giờ bấm được để
        // thu/mở nhóm, nên phải đọc được và nói rõ đang mở hay đóng.
        expect(menu).toMatch(/className="menu-group-title"\s*aria-expanded=\{mo\}\s*onClick=\{\(\) => doiNhom\(group\)\}/);
        expect(menu).not.toMatch(/menu-group-title" aria-hidden="true"/);
    });

    test('nhóm thu chỉ ẩn mục; vẫn hiện tổng badge; nhóm chứa màn đang mở tự mở', () => {
        expect(menu).toMatch(/\{mo && group\.items\.map\(item =>/);
        expect(menu).toMatch(/const tong = mo \? 0 : tongBadge\(group\);/);
        expect(menu).toMatch(/return group\.items\.some\(\(it\) => it\.screen && it\.screen === currentScreen\);/);
        // Đã bấm đóng/mở thì theo người dùng, không tự mở lại.
        expect(menu).toMatch(/if \(chon === true \|\| chon === false\) return chon;/);
    });

    test('nhớ trạng thái nhóm; localStorage hỏng không làm sập menu', () => {
        expect(menu).toMatch(/try \{ localStorage\.setItem\(KHOA_NHOM, JSON\.stringify\(moi\)\); \} catch/);
        expect(menu).toMatch(/\} catch \{ return NHOM_MO_SAN; \}/);
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

    test('badge số từ đến hạn có nguồn cấp', () => {
        // Mục "Ôn lại từ sai" ở sidebar dùng badge này. Khai `badgeKey` mà không
        // có nguồn thì badge im lặng không hiện — không lỗi nào báo.
        expect(menu).toContain("badgeKey: 'reviewDue'");
        expect(badges).toMatch(/reviewDue: res\.dueTotal \|\| 0/);
    });

    test('đếm bằng limit=1 — chỉ cần con số, không kéo cả danh sách', () => {
        expect(badges).toMatch(/wrong-words\/review\?limit=1/);
    });
});

describe('mục CHẠY CHẾ ĐỘ ở sidebar', () => {
    test('"Ôn lại từ sai" dùng `mode`, không phải `screen`', () => {
        // Nó là một chế độ luyện tập, không phải một trang riêng — điều hướng
        // bằng `showScreen` sẽ tìm một màn hình không tồn tại.
        expect(menu).toMatch(/mode: 'review-mistakes'/);
        const i = menu.indexOf("mode: 'review-mistakes'");
        const dong = menu.slice(menu.lastIndexOf('{', i), menu.indexOf('}', i));
        expect(dong).not.toMatch(/screen:/);
    });

    test('đóng menu TRƯỚC khi phát sự kiện', () => {
        // `PracticeManager` có thể mở popup chọn đề; menu còn mở thì popup nằm
        // dưới lớp phủ của nó và bấm không được.
        const i = menu.indexOf('const handleMode');
        const body = menu.slice(i, menu.indexOf('};', i));
        expect(body.indexOf('setMenuOpen(false)'))
            .toBeLessThan(body.indexOf('PRACTICE_REQUESTED'));
    });

    test('key và data-screen chịu được mục không có `screen`', () => {
        // `key={item.screen}` với mục chỉ có `mode` cho `key=undefined` — React
        // cảnh báo và có thể dựng lại nhầm phần tử khi danh sách đổi.
        // Mục HÀNH ĐỘNG (Phím tắt) không có cả `screen` lẫn `mode` → thêm `action`.
        expect(menu).toMatch(/key=\{item\.screen \|\| item\.mode \|\| item\.action\}/);
        expect(menu).toMatch(/data-screen=\{item\.screen \|\| undefined\}/);
    });
});

describe('chế độ "Ôn lại từ sai"', () => {
    test('lối vào là mục SIDEBAR, không còn thẻ trong lưới', () => {
        // Ô trong lưới đã nhường cho chế độ Dịch đoạn văn. Chế độ này vẫn chạy
        // nguyên vẹn — chỉ đổi lối vào.
        expect(home).not.toMatch(/mode: 'review-mistakes'/);
        expect(menu).toMatch(/mode: 'review-mistakes'/);
    });

    test('MIỄN PHÍ năng lượng', () => {
        // Thu phí cho việc sửa lỗi của chính mình là phạt đúng người chịu khó.
        // Soi cấu hình GIÁ thật, không soi thẻ lưới: thẻ chuyển chỗ được, còn
        // giá thì không được đổi chỉ vì nó chuyển chỗ.
        const cfg = readFileSync(join(__dirname, '..', 'game', 'config.js'), 'utf8');
        expect(cfg).toMatch(/'review-mistakes':\s*0\b/);
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

describe('các nhóm chế độ AI ở sidebar (theo kỹ năng)', () => {
    // Gom mọi nhóm AI (Nói / Đọc / Viết) lại để kiểm tra chung.
    const nhomAI = () => ['Nói với AI', 'Đọc với AI', 'Viết với AI']
        .map((tieuDe) => {
            const i = menu.indexOf(`title: '${tieuDe}'`);
            expect(i).toBeGreaterThan(-1);
            return menu.slice(i, menu.indexOf('},\n    {', i));
        })
        .join('\n');

    test('có ĐỦ ba chế độ AI', () => {
        // Ba chế độ này cùng bản chất: gọi AI có phí, tốn năng lượng, có màn
        // hình riêng. Thiếu một cái ở đây thì nó chỉ vào được qua lưới trang
        // chủ, trong khi hai cái kia có lối tắt.
        const nhom = nhomAI();
        for (const s of ['conversation-screen', 'essay-screen', 'translation-screen']) {
            expect(nhom).toContain(s);
        }
    });

    test('mỗi chế độ AI đều khoá theo Level ở sidebar', () => {
        // Menu chỉ là giao diện — server vẫn chặn — nhưng hiện mục cho người
        // chưa mở khoá rồi để họ bấm vào mới báo là mời rồi từ chối.
        const nhom = nhomAI();
        for (const f of ['feature:conversation', 'feature:essay', 'feature:translation']) {
            expect(nhom).toContain(f);
        }
    });

    test('chế độ có màn hình riêng CHỈ ở sidebar, không ở lưới', () => {
        // Lưới trang chủ là nơi của 16 chế độ cùng một kiểu: bấm → chọn đề →
        // chọn Part → vào bài. Chế độ gọi AI đi thẳng ra màn hình của nó, nằm
        // lẫn trong lưới thì bấm vào lại rẽ một đường khác — lạc loài.
        for (const sc of ['translation-screen', 'reading-screen',
                          'conversation-screen', 'essay-screen']) {
            expect(menu).toContain(sc);
            expect(home).not.toContain(sc);
        }
    });
});
