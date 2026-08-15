/**
 * Nút "Tải lại" ở popup Chọn đề không được QUAY MÃI.
 *
 * Ba hàm tải đều bật cờ loading rồi tắt ở cuối. Nhưng `loadShared` KHÔNG có
 * try/catch: hàm tải ném lỗi (mất mạng, token hết hạn) là dòng tắt cờ bị nhảy
 * qua, spinner quay vô tận và người dùng phải đóng popup mở lại.
 *
 * Hai hàm kia có `catch` nhưng đặt `setLoading(false)` NGOÀI khối try — an toàn
 * hiện tại, nhưng thêm một `return` sớm nào đó là kẹt y hệt. Dùng `finally` cho
 * cả ba để không phụ thuộc vào việc nhớ luật đó.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'useTopics.js'), 'utf8');
const modal = readFileSync(join(__dirname, 'TopicModal.jsx'), 'utf8');

/** Thân một hàm `loadX`. */
function fnBody(name) {
    const i = src.indexOf(`const ${name} = useCallback`);
    expect(i, `không tìm thấy ${name}`).toBeGreaterThan(-1);
    const j = src.indexOf('}, []);', i);
    return src.slice(i, j);
}

describe('cờ loading luôn được tắt', () => {
    for (const [fn, setter] of [
        ['loadShared', 'setLoadingShared'],
        ['loadPersonal', 'setLoadingPersonal'],
        ['loadWrong', 'setLoadingWrong'],
    ]) {
        test(`${fn} tắt cờ trong finally`, () => {
            const body = fnBody(fn);
            expect(body).toMatch(new RegExp(`finally\\s*\\{[^}]*${setter}\\(false\\)`));
        });
    }

    test('loadShared có try — trước đây thiếu hẳn', () => {
        // Đây là hàm gây ra spinner kẹt: không try/catch nên lỗi mạng làm nhảy
        // qua dòng tắt cờ.
        const body = fnBody('loadShared');
        expect(body).toMatch(/try \{/);
    });
});

describe('spinner đọc đúng nguồn', () => {
    test('lấy từ cờ của useTopics, không nuôi state riêng', () => {
        // Hai nguồn sự thật thì có lúc nút quay mãi (hoặc dừng trước khi xong).
        expect(modal).toMatch(/tab === "shared" \? loadingShared/);
        expect(modal).not.toMatch(/useState\(false\).*refreshing/);
    });

    test('nút bị khoá khi đang tải, tránh bấm dồn', () => {
        expect(modal).toMatch(/disabled=\{refreshing\}/);
        expect(modal).toMatch(/if \(refreshing\) return;/);
    });

    test('tab "Từ vựng chung" tải lại thì BỎ QUA đệm', () => {
        // Không `force` thì bấm nút chỉ set lại đúng mảng đang có.
        expect(modal).toMatch(/loadShared\(true\)/);
    });
});
