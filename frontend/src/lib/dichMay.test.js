/**
 * Dịch máy: Google (gtx) trước, bị chặn thì MyMemory.
 *
 * Chỗ dễ hỏng: Google bị chặn theo IP (chuyển hướng sang trang "sorry", trình duyệt thấy lỗi mạng)
 * làm hỏng hết popup Dịch nhanh, nút Dịch, tra từ — đã xảy ra thật. MyMemory hết hạn mức thì trả
 * câu cảnh báo NẰM TRONG bản dịch, không được hiện nó như một bản dịch.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { dichMay, googleDangNghi, _datLaiDichMay, NGHI_GOOGLE_MS } from './dichMay.js';

const googleOk = (ban, nguon = 'en') => ({ ok: true, status: 200, json: async () => [[[ban, 'x']], null, nguon] });
const myMemory = (ban, extra = {}) => ({ ok: true, status: 200, json: async () => ({ responseStatus: 200, quotaFinished: false, responseData: { translatedText: ban, detectedLanguage: 'en' }, ...extra }) });

beforeEach(() => { _datLaiDichMay(); vi.useFakeTimers({ toFake: ['Date'] }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('dịch máy', () => {
    test('Google được thì dùng Google, kèm JSON thô cho phiên âm/từ điển', async () => {
        global.fetch = vi.fn(async () => googleOk('xin chào'));
        const r = await dichMay('hello', { tl: 'vi', dt: ['t', 'rm'] });
        expect(r).toMatchObject({ translated: 'xin chào', sourceLang: 'en', nguon: 'google' });
        expect(r.google).toBeTruthy();
        expect(global.fetch.mock.calls[0][0]).toMatch(/translate\.googleapis\.com.*client=gtx.*dt=t&dt=rm/);
    });

    test('Google bị chặn (lỗi mạng như khi bị chuyển sang trang sorry) → MyMemory, tự nhận ngôn ngữ', async () => {
        global.fetch = vi.fn(async (url) => {
            if (String(url).includes('googleapis')) throw new TypeError('Failed to fetch');
            return myMemory('Không dành cho cậu đâu.');
        });
        const r = await dichMay('it not for you', { tl: 'vi' });
        expect(r).toMatchObject({ translated: 'Không dành cho cậu đâu.', sourceLang: 'en', nguon: 'mymemory' });
        expect(global.fetch.mock.calls[1][0]).toMatch(/api\.mymemory\.translated\.net\/get\?q=it%20not%20for%20you&langpair=autodetect%7Cvi/);
    });

    test('Google vừa bị chặn thì bỏ qua Google 10 phút, rồi thử lại', async () => {
        global.fetch = vi.fn(async (url) => {
            if (String(url).includes('googleapis')) return { ok: false, status: 429, json: async () => ({}) };
            return myMemory('một');
        });
        await dichMay('one');
        expect(googleDangNghi()).toBe(true);
        global.fetch.mockClear();
        await dichMay('two');
        expect(global.fetch.mock.calls.every(([u]) => !String(u).includes('googleapis'))).toBe(true);
        vi.setSystemTime(Date.now() + NGHI_GOOGLE_MS + 1);
        global.fetch.mockClear();
        await dichMay('three');
        expect(String(global.fetch.mock.calls[0][0])).toContain('googleapis');
    });

    test('chọn sẵn ngôn ngữ nguồn thì gửi đúng cặp ngôn ngữ cho MyMemory', async () => {
        global.fetch = vi.fn(async (url) => (String(url).includes('googleapis') ? Promise.reject(new Error('x')) : myMemory('hello')));
        await dichMay('你好', { sl: 'zh-CN', tl: 'en' });
        expect(String(global.fetch.mock.calls[1][0])).toContain('langpair=zh-CN%7Cen');
    });

    test('MyMemory hết hạn mức (câu cảnh báo nằm trong bản dịch): báo lỗi, không hiện cảnh báo như bản dịch', async () => {
        global.fetch = vi.fn(async (url) => (String(url).includes('googleapis')
            ? Promise.reject(new Error('x'))
            : myMemory('MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY', { responseStatus: 429 })));
        await expect(dichMay('hello')).rejects.toThrow();
    });

    test('câu đã là ngôn ngữ đích: báo nguồn = đích (để popup tự đổi đích như với Google), không báo lỗi', async () => {
        global.fetch = vi.fn(async (url) => (String(url).includes('googleapis')
            ? Promise.reject(new Error('x'))
            : { ok: true, status: 200, json: async () => ({ responseStatus: '403', responseDetails: 'PLEASE SELECT TWO DISTINCT LANGUAGES', responseData: { translatedText: 'PLEASE SELECT TWO DISTINCT LANGUAGES' } }) }));
        expect(await dichMay('it not for you', { tl: 'en' })).toMatchObject({ translated: 'it not for you', sourceLang: 'en', cungNgonNgu: true, nguon: 'mymemory' });
    });

    test('gỡ thực thể HTML trong bản dịch MyMemory', async () => {
        global.fetch = vi.fn(async (url) => (String(url).includes('googleapis') ? Promise.reject(new Error('x')) : myMemory('It&#39;s &quot;fine&quot;')));
        expect((await dichMay('ổn mà')).translated).toBe('It\'s "fine"');
    });
});
