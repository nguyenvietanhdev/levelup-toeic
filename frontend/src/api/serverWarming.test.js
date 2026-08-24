/**
 * Client chịu được 503 mà KHÔNG đăng xuất.
 *
 * Vế thứ hai của lỗi "phải đăng nhập lại sau mỗi lần Render restart": server đã
 * trả 503 thay vì 401, nhưng nếu client vẫn coi mọi lỗi là hết phiên thì chưa
 * sửa được gì.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const http = readFileSync(join(__dirname, 'http.js'), 'utf8');

describe('503 = máy chủ đang khởi động', () => {
    test('có nhánh riêng cho 503', () => {
        expect(http).toMatch(/response\.status === 503/);
    });

    test('KHÔNG phát `auth:expired` — đây chính là lỗi cũ', () => {
        // Server trả 401 cho lỗi DB, client xoá token. Nay 503 phải đi đường
        // khác hẳn.
        const i = http.indexOf('response.status === 503');
        const khoi = http.slice(i, http.indexOf('response.status === 423'));
        expect(khoi).not.toMatch(/auth:expired/);
    });

    test('KHÔNG ném lỗi — người dùng không thấy màn đỏ', () => {
        // Ném thì màn hình hiện lỗi cho một tình huống tự khỏi sau vài giây, và
        // họ tưởng app hỏng.
        const i = http.indexOf('response.status === 503');
        const khoi = http.slice(i, http.indexOf('response.status === 423'));
        expect(khoi).not.toMatch(/throw/);
        expect(khoi).toMatch(/return \{/);
    });

    test('đánh dấu `retryable` để nơi gọi biết là tạm thời', () => {
        const i = http.indexOf('response.status === 503');
        expect(http.slice(i, i + 600)).toMatch(/retryable: true/);
    });

    test('nhánh 503 đứng TRƯỚC `!response.ok`', () => {
        // Đứng sau thì `!response.ok` nuốt mất và lại ném lỗi như cũ.
        expect(http.indexOf('response.status === 503'))
            .toBeLessThan(http.indexOf('if (!response.ok)'));
    });

    test('401 vẫn đăng xuất như cũ — không nới lỏng quá tay', () => {
        // Token hết hạn thật thì vẫn phải đăng xuất; nếu không người dùng kẹt ở
        // trạng thái "đăng nhập rồi" mà mọi request đều hỏng.
        const i = http.indexOf('response.status === 401');
        expect(http.slice(i, i + 300)).toMatch(/auth:expired/);
    });
});
