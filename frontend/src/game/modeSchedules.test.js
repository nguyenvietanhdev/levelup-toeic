/**
 * Khung giờ chạy chế độ — phía client.
 *
 * Client KHÔNG tự tính giờ: trạng thái `dangMo` lấy nguyên từ server. Máy người
 * dùng có thể lệch múi giờ hoặc đơn giản là sai giờ, mà hai bên tính khác nhau
 * thì giao diện báo "đang mở" còn `/practice/start` từ chối — người dùng không
 * hiểu chuyện gì.
 *
 * Ở đây chỉ còn hai việc: nạp đúng, và hỏng thì NỚI chứ không siết.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const home = readFileSync(
    join(__dirname, '..', 'components', 'home', 'HomeScreen.jsx'), 'utf8');

vi.mock('@/auth/token.js', () => ({ authHeaders: () => ({}) }));
const { loadSchedules, scheduleInfo, getSchedules } = await import('./modeSchedules.js');

/** Giả lập `/api/features/schedules`. */
const traVe = (data) => {
    global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve(data) });
};

// Dọn cache TRƯỚC mỗi test, với một `fetch` chắc chắn resolve.
//
// Không đặt sẵn thì `loadSchedules` ở đây dùng lại `global.fetch` của test
// trước — mà một test cố ý để promise treo, nên mọi test sau nó timeout 10 giây
// chứ không đỏ vì lý do thật.
beforeEach(async () => {
    traVe({ success: true, data: { bypass: false, schedules: [] } });
    await loadSchedules(true);
});
afterEach(() => vi.restoreAllMocks());

describe('nạp và tra cứu', () => {
    test('chế độ ngoài giờ → khoá, kèm mô tả', async () => {
        traVe({
            success: true,
            data: {
                bypass: false,
                schedules: [{ mode: 'speed-quiz', dangMo: false, moTa: 'T2, T6 · 18:00–22:00' }],
            },
        });
        await loadSchedules(true);

        expect(scheduleInfo('speed-quiz')).toEqual({
            locked: true, moTa: 'T2, T6 · 18:00–22:00',
        });
    });

    test('chế độ đang mở → không khoá', async () => {
        traVe({
            success: true,
            data: { bypass: false, schedules: [{ mode: 'speed-quiz', dangMo: true, moTa: 'x' }] },
        });
        await loadSchedules(true);
        expect(scheduleInfo('speed-quiz').locked).toBe(false);
    });

    test('chế độ KHÔNG có lịch → không khoá', async () => {
        traVe({ success: true, data: { bypass: false, schedules: [] } });
        await loadSchedules(true);
        expect(scheduleInfo('flashcard')).toEqual({ locked: false, moTa: '' });
    });

    test('tài khoản ngoại lệ → không khoá gì cả', async () => {
        // Khớp với `requireInSchedule` bên server; lệch nhau thì giao diện khoá
        // mà API cho qua (hoặc ngược lại).
        traVe({
            success: true,
            data: { bypass: true, schedules: [{ mode: 'speed-quiz', dangMo: false, moTa: 'x' }] },
        });
        await loadSchedules(true);
        expect(scheduleInfo('speed-quiz').locked).toBe(false);
    });
});

describe('hỏng thì NỚI, không siết', () => {
    test('mạng lỗi → coi như không giới hạn', async () => {
        // Chặn khi không nạp được là biến một lỗi mạng thoáng qua thành "mọi
        // chế độ đều khoá". Server vẫn chặn thật nếu đúng là ngoài giờ, nên
        // nới ở client không mở đường lách nào.
        global.fetch = vi.fn().mockRejectedValue(new Error('mất mạng'));
        await loadSchedules(true);
        expect(scheduleInfo('speed-quiz').locked).toBe(false);
    });

    test('server trả `success: false` → không giới hạn', async () => {
        traVe({ success: false, message: 'lỗi' });
        await loadSchedules(true);
        expect(scheduleInfo('speed-quiz').locked).toBe(false);
    });

    test('CHƯA nạp → không khoá', async () => {
        // Vẽ ổ khoá trước khi biết gì là mọi thẻ nháy khoá rồi mở ra — nhấp nháy.
        await loadSchedules(true).catch(() => {});
        expect(scheduleInfo('bat-ky').locked).toBe(false);
    });

    test('gọi hai lần chỉ fetch MỘT lần', async () => {
        traVe({ success: true, data: { bypass: false, schedules: [] } });
        await loadSchedules(true);
        const soLan = global.fetch.mock.calls.length;
        await loadSchedules();
        await loadSchedules();
        expect(global.fetch.mock.calls.length).toBe(soLan);
    });

    test('hai lời gọi CÙNG LÚC chỉ fetch một lần', async () => {
        // Kiểm riêng guard `_promise`: hai chỗ trên màn hình cùng hỏi lịch
        // trước khi lượt fetch đầu kịp xong thì không được gọi mạng hai lần.
        // Guard `_cache` không đỡ được ca này vì lúc đó cache còn rỗng.
        let moKhoa;
        global.fetch = vi.fn(() => new Promise((res) => {
            moKhoa = () => res({ json: () => Promise.resolve({
                success: true, data: { bypass: false, schedules: [] },
            }) });
        }));
        const a1 = loadSchedules(true);
        const a2 = loadSchedules();
        moKhoa();
        await Promise.all([a1, a2]);
        expect(global.fetch.mock.calls.length).toBe(1);
    });

    test('rớt mạng thì lần sau THỬ LẠI', async () => {
        // Giữ lại promise hỏng thì một lần rớt mạng lúc mở app là cả phiên
        // không bao giờ biết lịch nữa.
        global.fetch = vi.fn().mockRejectedValue(new Error('mất mạng'));
        await loadSchedules(true);
        expect(global.fetch.mock.calls.length).toBe(1);

        global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({
            success: true,
            data: { bypass: false, schedules: [{ mode: 'speed-quiz', dangMo: false, moTa: 'x' }] },
        }) });
        await loadSchedules();          // KHÔNG truyền `force`
        expect(global.fetch.mock.calls.length).toBe(1);
        expect(scheduleInfo('speed-quiz').locked).toBe(true);
    });

    test('`force` thì nạp lại', async () => {
        traVe({ success: true, data: { bypass: false, schedules: [] } });
        await loadSchedules(true);
        await loadSchedules(true);
        expect(global.fetch.mock.calls.length).toBe(2);
    });

    test('`getSchedules` trả dữ liệu đã nạp', async () => {
        traVe({ success: true, data: { bypass: false, schedules: [{ mode: 'a', dangMo: true }] } });
        await loadSchedules(true);
        expect(getSchedules()?.schedules).toHaveLength(1);
    });
});

describe('nối vào Trang chủ', () => {
    test('nạp lại mỗi lần vào Trang chủ', () => {
        // Khung giờ đổi theo ĐỒNG HỒ chứ không theo hành động người dùng, nên
        // mở lại Trang chủ là dịp duy nhất chắc chắn có để cập nhật.
        expect(home).toMatch(/loadSchedules\(true\)/);
    });

    test('thẻ bị khoá khi ngoài giờ', () => {
        expect(home).toMatch(/const schedLocked = scheduleInfo\(m\.mode\)\.locked/);
        expect(home).toMatch(/\|\| langLocked \|\| schedLocked/);
    });

    test('chặn cả ở luồng BẤM, không chỉ làm mờ thẻ', () => {
        // `onClick` vẫn gắn trên thẻ bị mờ: bấm vào là đi tới bước trừ năng
        // lượng rồi mới bị server từ chối — mất lượt mà không hiểu vì sao.
        const i = home.indexOf('const handleModeClick');
        const than = home.slice(i, home.indexOf('\n    };', i));
        expect(than).toMatch(/scheduleInfo\(mode\)/);
        const j = than.indexOf('gio.locked');
        expect(j).toBeGreaterThan(-1);
        expect(than.slice(j, j + 700)).toMatch(/return;/);
    });

    test('lời nhắc ghi RÕ khung giờ', () => {
        // Đây là khoá người dùng không làm gì được ngoài chờ, nên phải biết chờ
        // tới bao giờ — "đang khoá" không nói được gì.
        const i = home.indexOf('const handleModeClick');
        const than = home.slice(i, home.indexOf('\n    };', i));
        expect(than).toMatch(/Chế độ này chỉ mở \$\{gio\.moTa\}/);
    });

    test('thẻ hiện huy hiệu khung giờ', () => {
        expect(home).toMatch(/\) : schedLocked \? \(/);
        expect(home).toMatch(/fa-clock/);
    });
});
