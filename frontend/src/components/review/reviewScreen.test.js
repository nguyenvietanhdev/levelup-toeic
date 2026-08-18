/**
 * Ôn từ đã sai + menu chia nhóm.
 *
 * Chỗ dễ hỏng nhất ở đây KHÔNG phải giao diện mà là hai thứ:
 *
 *  1. `dueTotal` nằm ở lớp NGOÀI, cạnh `data`. Dùng `unwrap` quen tay là lột
 *     mất nó → badge menu về 0 và màn không biết còn bao nhiêu từ.
 *  2. Gửi kết quả hỏng mà vẫn đi tiếp → lịch SM-2 của từ đó không được cập
 *     nhật nhưng người dùng tưởng đã ôn xong. Sai âm thầm, không ai thấy.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'ReviewScreen.jsx'), 'utf8');
const menu = readFileSync(join(__dirname, '..', '..', 'layouts', 'SideMenu.jsx'), 'utf8');
const badges = readFileSync(join(__dirname, '..', '..', 'layouts', 'useMenuBadges.js'), 'utf8');
const app = readFileSync(join(__dirname, '..', '..', 'App.jsx'), 'utf8');

vi.mock('@/auth/token.js', () => ({ authHeaders: () => ({ Authorization: 'Bearer t' }) }));
const { WrongWordsAPI } = await import('../../api/wrongWords.js');

beforeEach(() => { global.fetch = vi.fn(); });
afterEach(() => { vi.restoreAllMocks(); });

const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

describe('due() — dueTotal ở lớp NGOÀI, không được lột mất', () => {
    test('trả về CẢ words lẫn dueTotal', async () => {
        global.fetch.mockReturnValue(ok({
            success: true, count: 2, dueTotal: 134,
            data: [{ en: 'a' }, { en: 'b' }],
        }));
        const r = await WrongWordsAPI.due();
        expect(r.words).toHaveLength(2);
        // Lột nhầm lớp là con số này thành undefined → badge menu về 0.
        expect(r.dueTotal).toBe(134);
    });

    test('thiếu dueTotal → 0, không phải NaN', async () => {
        global.fetch.mockReturnValue(ok({ success: true, data: [] }));
        expect((await WrongWordsAPI.due()).dueTotal).toBe(0);
    });

    test('data không phải mảng → mảng rỗng, không nổ khi .map', async () => {
        global.fetch.mockReturnValue(ok({ success: true, data: null }));
        expect((await WrongWordsAPI.due()).words).toEqual([]);
    });

    test('server báo lỗi → ném, KHÔNG trả rỗng im lặng', async () => {
        // Trả rỗng là màn hiện "hết từ để ôn" trong khi thật ra request hỏng —
        // người dùng tưởng mình đã ôn xong hết.
        global.fetch.mockReturnValue(ok({ success: false, message: 'Token hết hạn' }));
        await expect(WrongWordsAPI.due()).rejects.toThrow('Token hết hạn');
    });

    test('HTTP 500 → ném kể cả khi body rỗng', async () => {
        global.fetch.mockReturnValue(Promise.resolve({
            ok: false, status: 500, json: () => Promise.reject(new Error('không phải JSON')),
        }));
        await expect(WrongWordsAPI.due()).rejects.toThrow(/500/);
    });

    test('all=true thêm đúng tham số', async () => {
        global.fetch.mockReturnValue(ok({ success: true, data: [], dueTotal: 0 }));
        await WrongWordsAPI.due({ limit: 5, all: true });
        const url = global.fetch.mock.calls[0][0];
        expect(url).toContain('limit=5');
        expect(url).toContain('all=1');
    });

    test('all mặc định KHÔNG gửi tham số', async () => {
        global.fetch.mockReturnValue(ok({ success: true, data: [], dueTotal: 0 }));
        await WrongWordsAPI.due();
        expect(global.fetch.mock.calls[0][0]).not.toContain('all=');
    });
});

describe('correct/wrong — ghi nhận kết quả', () => {
    test('correct() escape wordId (từ có dấu cách, chữ Hán)', async () => {
        // `direct deposit` và `你饿吗？` đều là wordId thật trong DB.
        global.fetch.mockReturnValue(ok({ success: true }));
        await WrongWordsAPI.correct('direct deposit');
        expect(global.fetch.mock.calls[0][0]).toContain('direct%20deposit');
    });

    test('wrong() gửi kèm en/vn — route bắt buộc ba trường', async () => {
        // Thiếu là server trả 400 "en is required" và lượt sai không được ghi.
        global.fetch.mockReturnValue(ok({ success: true }));
        await WrongWordsAPI.wrong({ wordId: 'w1', en: 'arrange', vn: 'sắp xếp' });
        const body = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(body.wordId).toBe('w1');
        expect(body.en).toBe('arrange');
        expect(body.vn).toBe('sắp xếp');
    });

    test('lỗi khi ghi → ném để màn hình DỪNG lại', async () => {
        global.fetch.mockReturnValue(ok({ success: false, message: 'Không tìm thấy từ' }));
        await expect(WrongWordsAPI.correct('w1')).rejects.toThrow('Không tìm thấy từ');
    });
});

describe('màn hình dừng khi ghi hỏng', () => {
    test('catch có `return` trước khi sang từ kế', () => {
        // Đi tiếp là lịch SM-2 của từ này không được cập nhật mà người dùng
        // tưởng đã ôn xong — sai âm thầm, không ai phát hiện.
        const i = src.indexOf('const answer =');
        const body = src.slice(i, src.indexOf('}, [busy, current', i));
        const c = body.indexOf('} catch (err) {');
        const after = body.slice(c, body.indexOf('}', body.indexOf('return;', c)));
        expect(after).toMatch(/setBusy\(false\);\s*return;/);
    });
});

describe('không tốn năng lượng', () => {
    test('màn KHÔNG gọi Energy', () => {
        // Ôn lại từ mình đã sai là việc nên khuyến khích; bắt trả năng lượng cho
        // nó là phạt đúng người chịu khó sửa lỗi.
        expect(src).not.toMatch(/Energy\./);
        expect(src).not.toMatch(/energyNeeded/);
    });
});

describe('trạng thái rỗng là tin TỐT, không phải lỗi', () => {
    test('hết từ đến hạn → giải thích + lối ôn thêm', () => {
        expect(src).toMatch(/Không có từ nào đến hạn ôn/);
        expect(src).toMatch(/load\(\{ all: true \}\)/);
    });
});

describe('menu chia nhóm', () => {
    test('Hội thoại và Viết luận NẰM CÙNG một nhóm', () => {
        const i = menu.indexOf("title: 'Luyện với AI'");
        expect(i).toBeGreaterThan(-1);
        const group = menu.slice(i, menu.indexOf('},\n    {', i));
        expect(group).toContain("screen: 'conversation-screen'");
        expect(group).toContain("screen: 'essay-screen'");
    });

    test('KHÔNG mục nào bị mất khi gom nhóm', () => {
        // Gom nhóm mà đánh rơi một mục là người dùng mất hẳn lối vào tính năng.
        for (const s of [
            'toeic-screen', 'review-screen', 'conversation-screen', 'essay-screen',
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

    test('Ôn từ đã sai KHÔNG khoá theo Level', () => {
        // Nó dùng chính từ người dùng đã sai — khoá lại là giữ người mới ở xa
        // đúng thứ họ cần nhất.
        const i = menu.indexOf("screen: 'review-screen'");
        const line = menu.slice(menu.lastIndexOf('{', i), menu.indexOf('}', i));
        expect(line).not.toContain('feature:');
    });
});

describe('badge số từ đến hạn', () => {
    test('có nguồn cấp `reviewDue`, không phải key chết', () => {
        // Khai badgeKey trong menu mà không có nguồn thì badge im lặng không hiện.
        expect(menu).toContain("badgeKey: 'reviewDue'");
        expect(badges).toMatch(/reviewDue: res\.dueTotal \|\| 0/);
    });

    test('đếm bằng limit=1 — chỉ cần con số, không kéo cả danh sách', () => {
        expect(badges).toMatch(/wrong-words\/review\?limit=1'/);
    });

    test('reviewDue có trong state khởi tạo', () => {
        // Thiếu thì lần render đầu là `undefined` → `n > 0` false, badge nháy.
        expect(badges).toMatch(/useState\(\{[^}]*reviewDue: 0/);
    });
});

describe('cắm vào app', () => {
    test('nạp LƯỜI và có trong bảng màn', () => {
        expect(app).toMatch(/const ReviewScreen\s+= lazy\(/);
        expect(app).toMatch(/'review-screen': ReviewScreen/);
    });
});
