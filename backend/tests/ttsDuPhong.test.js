/**
 * Dự phòng giọng đọc khi Edge TTS hỏng (dịch vụ không chính thức, đã có lúc chết hẳn).
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Bài Nghe (năng lượng đã trừ) không phát được gì khi Edge hỏng.
 *   2. Đọc từ vựng âm thầm đổi sang giọng Google — mất giọng người học đã chọn
 *      (trình duyệt có dự phòng riêng dùng đúng giọng đó).
 *   3. Edge đã hỏng mà lượt nào cũng chờ nó hỏng lại → mỗi lượt chậm vô ích.
 *   4. Cắt đoạn giữa từ / vượt giới hạn ký tự của Google.
 */
const trangThai = { nem: true, soLanEdge: 0 };
jest.mock('msedge-tts', () => {
    const { PassThrough } = require('stream');
    return {
        OUTPUT_FORMAT: { AUDIO_24KHZ_96KBITRATE_MONO_MP3: 'mp3' },
        MsEdgeTTS: class {
            constructor() { this._ws = { OPEN: 1, readyState: 1 }; }
            async setMetadata() {
                trangThai.soLanEdge += 1;
                if (trangThai.nem) throw new Error('Unexpected server response: 200');
            }
            toStream() {
                const audioStream = new PassThrough();
                process.nextTick(() => { audioStream.write(Buffer.from('edge')); audioStream.end(); });
                return { audioStream };
            }
            close() {}
        },
    };
});

const engine = require('../services/ttsEngine');

const goiGoogle = [];
beforeEach(() => {
    engine.dongHet();
    engine.xoaKho();
    trangThai.nem = true;
    trangThai.soLanEdge = 0;
    goiGoogle.length = 0;
    global.fetch = jest.fn(async (url) => {
        goiGoogle.push(url);
        return { ok: true, arrayBuffer: async () => Buffer.from('gg') };
    });
});

describe('dự phòng', () => {
    test('Edge hỏng + duPhong → audio Google, đúng ngôn ngữ', async () => {
        const r = await engine.tongHop('zh-CN-XiaoxiaoNeural', '你好。', 1, { duPhong: true });
        expect(r.nguon).toBe('google');
        expect(r.buffer.toString()).toBe('gg');
        expect(goiGoogle[0]).toMatch(/tl=zh-CN/);
    });

    test('KHÔNG xin dự phòng (đọc từ vựng) → báo lỗi, không gọi Google', async () => {
        await expect(engine.tongHop('en-US-AriaNeural', 'supplier', 1)).rejects.toThrow();
        expect(goiGoogle).toHaveLength(0);
    });

    test('Edge vừa hỏng → các lượt sau bỏ qua Edge (không chờ nó hỏng lại)', async () => {
        await engine.tongHop('en-US-AriaNeural', 'one', 1, { duPhong: true });
        const truoc = trangThai.soLanEdge;
        await engine.tongHop('en-US-AriaNeural', 'two', 1, { duPhong: true });
        expect(trangThai.soLanEdge).toBe(truoc);
        expect(goiGoogle.length).toBe(2);
    });

    test('Edge chạy bình thường → dùng Edge, không gọi Google', async () => {
        trangThai.nem = false;
        const r = await engine.tongHop('en-US-AriaNeural', 'hello', 1, { duPhong: true });
        expect(r.nguon).toBe('edge');
        expect(goiGoogle).toHaveLength(0);
    });

    test('đoạn dài → nhiều mảnh, nối lại một audio', async () => {
        const dai = Array.from({ length: 12 }, (_, i) => `This is sentence number ${i + 1} of the passage.`).join(' ');
        const r = await engine.tongHop('en-US-AriaNeural', dai, 1, { duPhong: true });
        expect(goiGoogle.length).toBeGreaterThan(1);
        expect(r.buffer.toString()).toBe('gg'.repeat(goiGoogle.length));
    });
});

describe('cắt mảnh và ngôn ngữ', () => {
    test('mỗi mảnh ≤ 180 ký tự, ưu tiên cắt ở dấu câu, không mất chữ', () => {
        const text = Array.from({ length: 20 }, (_, i) => `Word${i} and more words here, then a stop.`).join(' ');
        const m = engine.catManh(text);
        expect(m.every((x) => x.length <= 180)).toBe(true);
        expect(m.join(' ').replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '));
    });

    test('tiếng Trung không khoảng trắng vẫn cắt được', () => {
        const m = engine.catManh('你'.repeat(400));
        expect(m.every((x) => x.length <= 180)).toBe(true);
        expect(m.join('')).toBe('你'.repeat(400));
    });

    test('nhận ngôn ngữ: theo giọng; chữ tiếng Việt thì là tiếng Việt (giọng đa ngôn ngữ)', () => {
        expect(engine.ngonNguGoogle('en-GB-SoniaNeural', 'hi')).toBe('en');
        expect(engine.ngonNguGoogle('zh-TW-HsiaoChenNeural', '你好')).toBe('zh-TW');
        expect(engine.ngonNguGoogle('en-US-EmmaMultilingualNeural', 'người cung cấp')).toBe('vi');
    });
});

test('route Nghe bật dự phòng; route đọc từ vựng thì không', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const nghe = readFileSync(join(__dirname, '..', 'controllers', 'listeningController.js'), 'utf8');
    expect(nghe).toMatch(/tongHop\(giong, phien\.passage, kepTocDo\(req\.query\.rate\), \{ duPhong: true \}\)/);
    const tts = readFileSync(join(__dirname, '..', 'routes', 'tts.js'), 'utf8');
    expect(tts).not.toMatch(/duPhong/);
});
