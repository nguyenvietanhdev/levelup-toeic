/**
 * Mọi `PracticeManager.<hàm>()` được gọi trong app đều phải TỒN TẠI.
 *
 * Lỗi đã gặp: `PracticeManager.exitPractice()` chưa từng được định nghĩa, nhưng
 * được gọi ở hai nơi:
 *
 *   - pronunciationMode.js — gọi trần. Firefox không có Web Speech API nên nhánh
 *     "trình duyệt không hỗ trợ" chạy mỗi lần vào chế độ Phát âm bằng Firefox:
 *     TypeError ngay giữa start(), không câu nào render. Mà header "Phát âm
 *     1/10" và đồng hồ đã dựng từ trước nên VẪN CHẠY — nhìn màn hình y hệt một
 *     bài luyện đang mở, chỉ là trống trơn.
 *
 *   - practiceManager.js — gọi qua `?.()`. Không ném lỗi, chỉ lặng lẽ không làm
 *     gì: bấm "Quay lại" ở hộp thoại xác nhận thì hộp thoại đóng và màn hình
 *     đứng im.
 *
 * Cùng một hàm ma, hai kiểu hỏng, cả hai đều KHÔNG để lại dấu vết nào trên màn
 * hình. `?.` đặc biệt nguy hiểm ở đây vì nó biến "gọi nhầm tên hàm" — thứ đáng
 * ra nổ ngay — thành im lặng tuyệt đối.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PracticeManager } from './practiceManager.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(dir) {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : walk(p);
        return /\.(js|jsx)$/.test(name) && !/\.test\.jsx?$/.test(name) ? [p] : [];
    });
}

/** Bỏ comment trước khi quét — không thì chính phần mô tả lỗi ở đầu file này
 *  khớp regex và test xanh giả. Đã dính đúng bẫy đó nhiều lần trong dự án. */
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

// Thuộc tính dữ liệu, không phải hàm — gọi tên chúng không có nghĩa là gọi hàm.
const DATA_PROPS = new Set(['currentSession']);

const calls = new Map();   // tên hàm -> các file gọi nó
for (const file of walk(SRC)) {
    const src = stripComments(readFileSync(file, 'utf8'));
    for (const m of src.matchAll(/PracticeManager\.([a-zA-Z_$][\w$]*)\s*\??\.?\s*\(/g)) {
        if (DATA_PROPS.has(m[1])) continue;
        if (!calls.has(m[1])) calls.set(m[1], []);
        calls.get(m[1]).push(file.replace(SRC, '').replace(/\\/g, '/'));
    }
}

describe('PracticeManager — không gọi hàm ma', () => {

    test('có tìm thấy lời gọi để kiểm — quét rỗng thì test này vô nghĩa', () => {
        expect(calls.size).toBeGreaterThan(3);
    });

    test.each([...calls.keys()])('PracticeManager.%s() tồn tại thật', (name) => {
        // Thông báo kèm file gọi, để ai làm đỏ test biết ngay phải sửa ở đâu.
        expect(typeof PracticeManager[name], `gọi tại: ${calls.get(name).join(', ')}`)
            .toBe('function');
    });

    test('exitPractice — hàm ma cũ — không quay lại', () => {
        // Chốt riêng: đây là cái đã làm hỏng chế độ Phát âm trên Firefox.
        expect(PracticeManager.exitPractice).toBeUndefined();
        expect([...calls.keys()]).not.toContain('exitPractice');
    });

    test('tự kiểm: tên bịa PHẢI trượt', () => {
        // Không có case này thì test trên xanh kể cả khi cách kiểm sai hoàn toàn.
        expect(typeof PracticeManager.khongTonTaiDauNhe).not.toBe('function');
    });
});
