/**
 * Popup "Chọn đề" mở đúng TAB chứa đề đang dùng.
 *
 * Trước đây luôn mở "Từ vựng chung". Ai học bằng bộ từ riêng thì mỗi lần mở
 * popup lại phải chuyển tab — thao tác lặp lại hằng ngày.
 *
 * Hai chỗ dễ hỏng:
 *   1. Chỉ đặt giá trị ban đầu cho `useState` là KHÔNG đủ: hàm khởi tạo chỉ
 *      chạy MỘT lần lúc mount, mà component không unmount khi đóng
 *      (`if (!open) return null` chỉ ẩn). Lần mở thứ hai trở đi vẫn giữ tab cũ.
 *   2. Bộ ĐƯỢC CHIA SẺ (`shared:`) hiển thị trong tab "Từ vựng riêng", không
 *      phải "Từ vựng chung" — map nhầm là mở sai tab cho đúng nhóm người dùng
 *      đang cần nhất.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'TopicModal.jsx'), 'utf8');

/** Dựng lại hàm từ chính mã nguồn — chạy thật, không chỉ so chuỗi. */
function loadTabOf() {
    const m = src.match(/function tabOfCurrentTopic\(\) \{[\s\S]*?\n\}/);
    expect(m, 'không tìm thấy tabOfCurrentTopic').toBeTruthy();
    // eslint-disable-next-line no-new-func
    return new Function('TopicSelector', `${m[0]}\nreturn tabOfCurrentTopic;`);
}

const make = (id) => loadTabOf()({ getCurrentTopic: () => (id ? { id } : null) });

describe('suy tab từ đề đang chọn', () => {
    test('bộ từ RIÊNG → tab "Từ vựng riêng"', () => {
        expect(make('personal:zh_giaotiep_tuvung')()).toBe('personal');
    });

    test('bộ ĐƯỢC CHIA SẺ cũng ở tab "Từ vựng riêng"', () => {
        // Hai loại này nằm chung một tab (xem `isShared` trong TopicModal).
        expect(make('shared:ai@example.com:zh_word_topic')()).toBe('personal');
    });

    test('nhóm TỪ SAI → tab "Từ vựng sai"', () => {
        expect(make('wrong:hsk1')()).toBe('wrong');
    });

    test('đề chung (không tiền tố) → tab "Từ vựng chung"', () => {
        expect(make('672f1a2b3c4d5e6f')()).toBe('shared');
    });

    test('chưa chọn đề nào → mặc định "Từ vựng chung"', () => {
        expect(make(null)()).toBe('shared');
        expect(make('')()).toBe('shared');
    });

    test('tên bộ chứa dấu ":" không làm lệch', () => {
        // `source` do người dùng đặt, có thể chứa ':'.
        expect(make('personal:bo:tu:cua:toi')()).toBe('personal');
    });
});

describe('đồng bộ lại mỗi lần MỞ, không chỉ lúc mount', () => {
    test('useState dùng chung hàm đó', () => {
        expect(src).toMatch(/useState\(tabOfCurrentTopic\)/);
    });

    test('đặt lại tab đúng khoảnh khắc đóng → mở', () => {
        // Component không unmount khi đóng — thiếu thì lần mở sau giữ tab cũ.
        expect(src).toMatch(/if \(open && !wasOpenRef\.current\) setTab\(tabOfCurrentTopic\(\)\)/);
        expect(src).toMatch(/wasOpenRef\.current = open/);
    });

    test('effect đặt lại tab CHỈ phụ thuộc `open`', () => {
        // Đây là chỗ suýt hỏng: đặt chung effect có `loadShared`/`onClose` trong
        // deps thì hai hàm đó đổi danh tính là effect chạy lại và ĐÁ NGƯỢC người
        // dùng về tab cũ ngay khi họ vừa bấm sang tab khác.
        const i = src.indexOf('const wasOpenRef');
        const block = src.slice(i, i + 300);
        expect(block).toMatch(/\}, \[open\]\);/);
        expect(block).not.toMatch(/loadShared|onClose/);
    });

    test('effect tải dữ liệu KHÔNG đụng tới tab', () => {
        const i = src.indexOf('if (!open) return;');
        expect(src.slice(i, i + 400)).not.toMatch(/setTab\(/);
    });

    test('đọc TopicSelector, không đợi `current` của useTopics', () => {
        // Hàm còn chạy trong `useState`, trước khi hook kia kịp trả giá trị.
        expect(src).toMatch(/TopicSelector\.getCurrentTopic\(\)\?\.id/);
        expect(src).toMatch(/from ["']\.\/topicSelector\.js["']/);
    });
});
