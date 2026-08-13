/**
 * Thời hạn lưu: MỘT ô duy nhất trên header, dùng chung cho cả hai tab.
 *
 * Trước đây mỗi tab có ô riêng (`vocab-retention`, `json-retention`) — cùng một
 * khái niệm mà hai giá trị độc lập: đặt 7 ngày ở tab "Thêm từ mới" rồi sang tab
 * JSON vẫn thấy 30 ngày, không có gì báo là hai ô khác nhau.
 *
 * Chỗ dễ hỏng IM LẶNG khi gộp: `readRetention` đọc theo id. Chuyển ô lên header
 * mà quên sửa nơi đọc thì `getElementById` trả null → `parseInt(undefined)` →
 * NaN → rơi về mặc định 30 ngày. Người dùng chọn 3 ngày, hệ thống lưu 30, không
 * có lỗi nào cả.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'openUploadModal.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

describe('ô Thời hạn lưu trên header', () => {
    test('ô nằm trong header, cạnh nút Quản lý từ vựng', () => {
        expect(src).toMatch(/id="upload-retention"/);
        // Cùng một khối với nút quản lý — không phải hai chỗ rời nhau.
        expect(src).toMatch(/upload-retention[\s\S]{0,600}upload-tab-manage/);
    });

    test('KHÔNG còn hai ô riêng của hai tab', () => {
        expect(src).not.toMatch(/vocab-retention/);
        expect(src).not.toMatch(/json-retention/);
    });

    test('readRetention đọc ĐÚNG id mới', () => {
        // Quên sửa chỗ này là lỗi im lặng: null → NaN → mặc định 30 ngày.
        expect(src).toMatch(/getElementById\('upload-retention'\)/);
        // Và không còn nhận id qua tham số nữa.
        expect(src).not.toMatch(/readRetention = \(id\)/);
    });

    test('cả hai đường lưu đều gọi readRetention() không tham số', () => {
        const calls = src.match(/readRetention\(\)/g) || [];
        expect(calls.length).toBeGreaterThanOrEqual(2);   // tab "Thêm từ mới" + tab JSON
        expect(src).not.toMatch(/readRetention\('[^']+'\)/);
    });

    test('giữ đủ các lựa chọn thời hạn', () => {
        expect(src).toMatch(/RETENTION_OPTIONS\.map/);
        expect(src).toMatch(/d === DEFAULT_RETENTION \? ' selected' : ''/);
    });

    test('dọn helper cũ, không để mã chết', () => {
        expect(src).not.toMatch(/retentionFieldHtml/);
    });

    test('form vẫn nói rõ thời hạn chọn ở đâu', () => {
        // Bỏ ô đi mà không nói gì thì người dùng tưởng mất tính năng.
        expect(src).toMatch(/Thời hạn lưu chọn ở góc trên/);
    });

    test('tự kiểm: đọc được nội dung thật', () => {
        expect(src.length).toBeGreaterThan(10000);
        expect(src).toMatch(/RETENTION_OPTIONS/);
    });
});
