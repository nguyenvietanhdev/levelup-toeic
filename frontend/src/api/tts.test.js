/**
 * Server TTS trả lỗi (500) phải ném ra, không được trả đối tượng rỗng.
 *
 * Bản cũ trả `{ success: false }` — nơi gọi nhận về không có `url` nên im lặng:
 * không tiếng, không fallback. Log thật: `/api/tts` 500 liên tục trên Render.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { TtsAPI } from './tts.js';

describe('TtsAPI.synthesize', () => {
    const fetchGoc = globalThis.fetch;

    beforeEach(() => {
        globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
    });

    afterEach(() => {
        globalThis.fetch = fetchGoc;
    });

    test('server trả 500 → ném lỗi, không trả đối tượng rỗng', async () => {
        globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 }));
        await expect(TtsAPI.synthesize('field', 'en-random', 1)).rejects.toThrow('TTS HTTP 500');
    });

    test('server trả audio → trả url của blob', async () => {
        globalThis.fetch = vi.fn(async () => ({
            ok: true,
            status: 200,
            blob: async () => new Blob(['mp3']),
        }));
        const r = await TtsAPI.synthesize('field', 'en-random', 1);
        expect(r.url).toBe('blob:fake');
    });
});
