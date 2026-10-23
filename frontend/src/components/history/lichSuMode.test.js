/**
 * Tab "Lịch sử" dùng chung: mỗi màn AI có tab Lịch sử gắn đúng chế độ, và MỌI
 * chế độ đều xem lại được từng bài đã làm (không chỉ danh sách).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (...p) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const lichSu = read('history', 'LichSuMode.jsx');

describe('LichSuMode', () => {
    test('cả năm chế độ đều tải danh sách VÀ mở được từng bài', () => {
        expect(lichSu).not.toMatch(/CHUA_LUU/);
        for (const api of ['ConversationAPI', 'EssayAPI', 'TranslationAPI', 'ReadingAPI', 'ListeningAPI']) {
            expect(lichSu).toContain(`${api}.history()`);
            expect(lichSu).toContain(`${api}.detail(id)`);
        }
    });

    test('mỗi chế độ có màn xem lại riêng', () => {
        for (const c of ['ChiTietHoiThoai', 'ChiTietViet', 'ChiTietDich', 'ChiTietDoc', 'ChiTietNghe']) {
            expect(lichSu).toContain(`function ${c}(`);
        }
    });

    test('Đọc hiểu hiện đáp án đúng và đáp án đã chọn; Nghe hiện đoạn gốc và bài đã gõ', () => {
        expect(lichSu).toMatch(/q\.answer === nhan/);
        expect(lichSu).toMatch(/q\.chose === nhan/);
        expect(lichSu).toMatch(/bai\.passage/);
        expect(lichSu).toMatch(/bai\.typed/);
    });

    test('hội thoại lấy danh sách và chi tiết từ API lịch sử', () => {
        expect(lichSu).toMatch(/ConversationAPI\.history\(\)/);
        expect(lichSu).toMatch(/ConversationAPI\.detail\(id\)/);
    });

    test('Luyện viết lấy danh sách từ API lịch sử có sẵn', () => {
        expect(lichSu).toMatch(/EssayAPI\.history\(\)/);
    });
});

describe('mỗi màn AI có tab Lịch sử gắn đúng chế độ', () => {
    const cases = [
        ['conversation/ConversationScreen.jsx', 'hoithoai'],
        ['essay/EssayScreen.jsx', 'viet'],
        ['reading/ReadingScreen.jsx', 'doc'],
        ['translation/TranslationScreen.jsx', 'dich'],
        ['listening/ListeningScreen.jsx', 'nghe'],
    ];
    for (const [file, mode] of cases) {
        test(`${file} → mode "${mode}"`, () => {
            const src = read(file);
            expect(src).toMatch(/import LichSuMode from '\.\.\/history\/LichSuMode\.jsx'/);
            expect(src).toMatch(new RegExp(`<LichSuMode mode="${mode}"`));
            expect(src).toMatch(/setTab\('lichsu'\)/);
        });
    }
});

describe('không còn màn Lịch sử riêng trong menu', () => {
    test('menu và App không còn mục history-screen', () => {
        expect(readFileSync(join(__dirname, '..', '..', 'layouts', 'SideMenu.jsx'), 'utf8')).not.toMatch(/history-screen/);
        expect(readFileSync(join(__dirname, '..', '..', 'App.jsx'), 'utf8')).not.toMatch(/history-screen/);
    });
});
