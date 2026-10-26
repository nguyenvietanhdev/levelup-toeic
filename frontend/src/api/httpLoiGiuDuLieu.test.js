/**
 * Lỗi HTTP phải GIỮ dữ liệu server gửi kèm, và hai lỗi người dùng gặp thật:
 *   1. Chế độ AI hết năng lượng chỉ hiện "Không đủ năng lượng" (không mở popup nạp):
 *      `Http` bỏ mất `energyNeeded` nên nhánh mở popup ở các màn không bao giờ chạy.
 *   2. Bấm "Sử dụng" Thẻ hồi đầy ⚡ mà năng lượng không đổi: nút ở tab Tiêu hao chỉ
 *      đóng túi đồ, không gọi server.
 */
import { describe, test, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Http } from './http.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', ...p), 'utf8');

afterEach(() => { vi.unstubAllGlobals(); });

describe('Http giữ dữ liệu lỗi', () => {
    test('400 "Không đủ năng lượng" → còn energyNeeded / currentEnergy', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            status: 400, ok: false,
            headers: { get: () => 'application/json' },
            json: async () => ({ success: false, message: 'Không đủ năng lượng', energyNeeded: 20, currentEnergy: 14 }),
        })));
        const r = await Http.post('/conversation/start', {});
        expect(r).toMatchObject({
            success: false, error: 'Không đủ năng lượng', energyNeeded: 20, currentEnergy: 14, status: 400,
        });
    });

    test('server trả `success: true` lạ trong thân lỗi cũng không lật được kết quả', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            status: 500, ok: false,
            headers: { get: () => 'application/json' },
            json: async () => ({ success: true, message: 'x' }),
        })));
        expect((await Http.get('/a')).success).toBe(false);
    });
});

describe('các chế độ AI mở popup nạp khi thiếu năng lượng', () => {
    test.each([
        ['conversation', 'ConversationScreen.jsx'],
        ['essay', 'EssayScreen.jsx'],
        ['translation', 'TranslationScreen.jsx'],
        ['reading', 'ReadingScreen.jsx'],
        ['listening', 'ListeningScreen.jsx'],
    ])('%s', (thuMuc, file) => {
        const s = doc('components', thuMuc, file);
        expect(s).toMatch(/if \(err\?\.energyNeeded\) \{\s*Energy\.showRefillModal\(/);
    });

    test('API Nghe mang dữ liệu lỗi theo (không chỉ câu chữ)', () => {
        expect(doc('api', 'listening.js')).toMatch(/Object\.assign\(err, res\);/);
    });
});

test('Thẻ dùng ngay ở tab Tiêu hao gọi server (không chỉ đóng túi đồ)', () => {
    const s = doc('components', 'inventory', 'InventoryWardrobe.jsx');
    expect(s).toMatch(/dungNgay: i\.definition\.durationType === 'on_use' && !!i\.definition\.effect\?\.type/);
    expect(s).toMatch(/if \(item\.dungNgay\) return activate\(item\);/);
});
