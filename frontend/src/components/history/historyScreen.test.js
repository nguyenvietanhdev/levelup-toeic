/**
 * Màn Lịch sử AI: tab theo chế độ, và KHÔNG giả vờ có dữ liệu cho chế độ chưa lưu.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'HistoryScreen.jsx'), 'utf8');
const app = readFileSync(join(__dirname, '..', '..', 'App.jsx'), 'utf8');
const menu = readFileSync(join(__dirname, '..', '..', 'layouts', 'SideMenu.jsx'), 'utf8');

describe('màn Lịch sử AI', () => {
    test('có đủ bốn tab theo chế độ', () => {
        for (const key of ['hoithoai', 'viet', 'dich', 'doc']) {
            expect(src).toMatch(new RegExp(`key: '${key}'`));
        }
    });

    test('Dịch và Đọc hiểu được đánh dấu chưa lưu, không hiện danh sách giả', () => {
        expect(src).toMatch(/key: 'dich'[^}]*chuaLuu: true/);
        expect(src).toMatch(/key: 'doc'[^}]*chuaLuu: true/);
        expect(src).toMatch(/Chế độ này chưa lưu lịch sử/);
    });

    test('tab Hội thoại gọi API lịch sử và xem chi tiết', () => {
        expect(src).toMatch(/ConversationAPI\.history\(\)/);
        expect(src).toMatch(/ConversationAPI\.detail\(id\)/);
    });

    test('tab Luyện viết dùng API lịch sử có sẵn', () => {
        expect(src).toMatch(/EssayAPI\.history\(\)/);
    });

    test('có nút quay lại danh sách từ màn chi tiết', () => {
        expect(src).toMatch(/chiTiet \? setChiTiet\(null\)/);
    });

    test('đã đăng ký màn hình và có mục trong menu', () => {
        expect(app).toMatch(/'history-screen': HistoryScreen/);
        expect(menu).toMatch(/screen: 'history-screen'/);
    });
});
