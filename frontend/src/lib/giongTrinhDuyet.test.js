/**
 * Máy chủ đọc lỗi → dùng giọng trình duyệt NHƯNG đúng giọng đã chọn ở Cài đặt.
 *
 * Lỗi người dùng gặp: chọn giọng nào cũng chỉ nghe một giọng, vì đường dự phòng
 * chỉ đặt `lang` và trình duyệt tự lấy giọng mặc định.
 */
import { describe, test, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { giongTheoMa, giongCungNgonNgu, maCuThe, _GIONG, _NGAU_NHIEN } from './giongTrinhDuyet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Tên đúng như Edge hiển thị (đã đối chiếu trên Edge 156).
const EDGE = [
    { name: 'Microsoft David - English (United States)', lang: 'en-US' },
    { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US' },
    { name: 'Microsoft Guy Online (Natural) - English (United States)', lang: 'en-US' },
    // Cùng tên đầu với William thường — phải KHÔNG bị chọn cho 'en-au-m'.
    { name: 'Microsoft William Multilingual Online (Natural) - English (Australia)', lang: 'en-AU' },
    { name: 'Microsoft William Online (Natural) - English (Australia)', lang: 'en-AU' },
    { name: 'Microsoft Sonia Online (Natural) - English (United Kingdom)', lang: 'en-GB' },
    { name: 'Microsoft Emma Multilingual Online (Natural) - English (United States)', lang: 'en-US' },
    { name: 'Microsoft 晓晓 Online (Natural) - Chinese (Mandarin, Simplified)', lang: 'zh-CN' },
    { name: 'Microsoft 云希 Online (Natural) - Chinese (Mandarin, Simplified)', lang: 'zh-CN' },
    { name: 'Microsoft Hoài My Online (Natural) - Vietnamese (Vietnam)', lang: 'vi-VN' },
    { name: 'Microsoft Nam Minh Online (Natural) - Vietnamese (Vietnam)', lang: 'vi-VN' },
];
const goc = globalThis.window?.speechSynthesis;
function gia(voices) {
    globalThis.window = globalThis.window || {};
    window.speechSynthesis = { getVoices: () => voices };
}
afterEach(() => { if (globalThis.window) window.speechSynthesis = goc; });

describe('chọn đúng giọng đã chọn trong Cài đặt', () => {
    test('Guy ra Guy, Sonia ra Sonia, 云希 ra 云希 — không còn chung một giọng', () => {
        gia(EDGE);
        expect(giongTheoMa('en-us-m').name).toMatch(/Guy/);
        expect(giongTheoMa('en-gb-f').name).toMatch(/Sonia/);
        expect(giongTheoMa('zh-cn-yunxi').name).toMatch(/云希/);
        expect(giongTheoMa('vi-vn-m').name).toMatch(/Nam Minh/);
        expect(giongTheoMa('vi-multi-emma').name).toMatch(/Emma Multilingual/);
        expect(giongTheoMa('en-au-m').name).toBe('Microsoft William Online (Natural) - English (Australia)');
    });

    test('mã ngẫu nhiên: trộn nhiều giọng, nhưng CÙNG một từ luôn ra cùng giọng', () => {
        gia(EDGE);
        expect(maCuThe('zh-cn-random', '你好')).toBe(maCuThe('zh-cn-random', '你好'));
        const ra = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((w) => maCuThe('en-random', w)));
        expect(ra.size).toBeGreaterThan(1);
    });

    test('trình duyệt không có giọng đó (vd Chrome) → null, nơi gọi lấy giọng cùng ngôn ngữ', () => {
        gia([{ name: 'Google US English', lang: 'en-US' }, { name: 'Microsoft Zira', lang: 'en-US' }]);
        expect(giongTheoMa('en-us-m')).toBeNull();
        expect(giongCungNgonNgu('en-US').name).toBe('Google US English');
        expect(giongCungNgonNgu('zh-CN')).toBeNull();
    });

    test('mã lạ hoặc chưa nạp danh sách giọng → null, không lỗi', () => {
        gia([]);
        expect(giongTheoMa('en-us-m')).toBeNull();
        expect(giongTheoMa('khong-co')).toBeNull();
    });
});

describe('khớp bảng giọng của server', () => {
    test('mọi mã trong VOICE_MAP (backend/routes/tts.js) đều có ở đây', () => {
        const tts = readFileSync(join(__dirname, '..', '..', '..', 'backend', 'routes', 'tts.js'), 'utf8');
        const khoi = tts.slice(tts.indexOf('const VOICE_MAP = {'), tts.indexOf('\n};', tts.indexOf('const VOICE_MAP = {')));
        const ma = [...khoi.matchAll(/^\s*'([a-z0-9-]+)':\s*'/gm)].map((m) => m[1]);
        expect(ma.length).toBeGreaterThan(20);
        for (const k of ma) expect(Object.keys(_GIONG)).toContain(k);
        for (const k of ['en-random', 'zh-cn-random', 'vi-random']) expect(_NGAU_NHIEN[k].length).toBeGreaterThan(1);
    });

    test('gameLogic dùng giọng đã chọn ở đường dự phòng', () => {
        const g = readFileSync(join(__dirname, '..', 'game', 'gameLogic.js'), 'utf8');
        expect(g).toMatch(/const giongDaChon = giongTheoMa\(lang, text\);/);
        expect(g).toMatch(/const giong = giongDaChon \|\| giongCungNgonNgu\(utterance\.lang\);/);
        expect(g).toMatch(/const giongViet = giongDaChon \|\| giongVietTrinhDuyet\(\);/);
    });
});
