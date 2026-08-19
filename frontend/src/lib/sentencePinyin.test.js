/**
 * Phiên âm cả câu tiếng Trung, lấy từ Google Translate (`dt=rm`).
 *
 * Vì sao gọi Google chứ không lưu sẵn: 12.762 từ tiếng Trung trong DB đều có
 * `example` nhưng KHÔNG bản ghi nào có phiên âm câu — `phonetic` chỉ là phiên âm
 * của một từ đơn.
 *
 * Đây là thông tin PHỤ TRỢ: hỏng thì ẩn đi, tuyệt đối không được làm vỡ màn
 * luyện tập đang chạy.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coChuHan } from './sentencePinyin.js';

const src = readFileSync(join(__dirname, 'sentencePinyin.js'), 'utf8');

let layPinyinCau;
beforeEach(async () => {
    vi.resetModules();
    global.fetch = vi.fn();
    ({ layPinyinCau } = await import('./sentencePinyin.js'));
});

/** Phản hồi đúng hình dạng gtx trả về: [[[dịch, gốc, null, pinyin]], …] */
const traLoi = (pinyin) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve([[['Xin lỗi', '对不起', null, pinyin]]]),
});

describe('nhận diện câu cần phiên âm', () => {
    test('có chữ Hán → cần', () => {
        expect(coChuHan('对不起，我迟到了。')).toBe(true);
        expect(coChuHan('我')).toBe(true);
    });

    test('tiếng Anh/Việt → KHÔNG cần', () => {
        // Google trả chuỗi rỗng cho tiếng Anh; gọi vô ích chỉ tốn một request.
        expect(coChuHan('I am late.')).toBe(false);
        expect(coChuHan('Tôi đến muộn.')).toBe(false);
    });

    test('rỗng / null không nổ', () => {
        expect(coChuHan('')).toBe(false);
        expect(coChuHan(null)).toBe(false);
        expect(coChuHan(undefined)).toBe(false);
    });
});

describe('lấy pinyin', () => {
    test('trả về pinyin CÓ DẤU THANH', async () => {
        // Dấu thanh là thứ quan trọng nhất: "duibuqi" không đọc được đúng, mà
        // sai thanh là sai nghĩa.
        global.fetch.mockReturnValue(traLoi('Duìbùqǐ, wǒ chídàole.'));
        expect(await layPinyinCau('对不起，我迟到了。')).toBe('Duìbùqǐ, wǒ chídàole.');
    });

    test('gọi đúng tham số dt=rm', async () => {
        // `dt=t` chỉ trả bản dịch; thiếu `dt=rm` là không có phiên âm nào cả.
        global.fetch.mockReturnValue(traLoi('Wǒ ài nǐ.'));
        await layPinyinCau('我爱你。');
        const url = global.fetch.mock.calls[0][0];
        expect(url).toContain('dt=rm');
        expect(url).toContain('sl=zh-CN');
    });

    test('KHÔNG gọi mạng cho câu tiếng Anh', async () => {
        expect(await layPinyinCau('I am late.')).toBe('');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('câu rỗng → chuỗi rỗng, không gọi mạng', async () => {
        expect(await layPinyinCau('')).toBe('');
        expect(await layPinyinCau(null)).toBe('');
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

describe('cache trong phiên', () => {
    test('cùng một câu chỉ gọi mạng MỘT lần', async () => {
        // Câu ví dụ hiện lại mỗi lần người dùng quay về câu hỏi cũ (nút "Trước").
        global.fetch.mockReturnValue(traLoi('Wǒ ài nǐ.'));
        await layPinyinCau('我爱你。');
        await layPinyinCau('我爱你。');
        await layPinyinCau('我爱你。');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('câu KHÁC vẫn gọi lại', async () => {
        global.fetch.mockReturnValue(traLoi('x'));
        await layPinyinCau('我爱你。');
        await layPinyinCau('对不起。');
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });
});

describe('hỏng thì ẩn đi, KHÔNG ném lỗi', () => {
    test('mạng lỗi → chuỗi rỗng', async () => {
        // Ném ra ngoài là vỡ màn luyện tập vì một thông tin phụ trợ.
        global.fetch.mockRejectedValue(new Error('mất mạng'));
        await expect(layPinyinCau('我爱你。')).resolves.toBe('');
    });

    test('HTTP lỗi → chuỗi rỗng', async () => {
        global.fetch.mockResolvedValue({ ok: false, status: 429 });
        await expect(layPinyinCau('我爱你。')).resolves.toBe('');
    });

    test('JSON hỏng → chuỗi rỗng', async () => {
        global.fetch.mockResolvedValue({
            ok: true, json: () => Promise.reject(new Error('không phải JSON')),
        });
        await expect(layPinyinCau('我爱你。')).resolves.toBe('');
    });

    test('hình dạng phản hồi lạ → chuỗi rỗng', async () => {
        // Google đổi format là chuyện có thật; không được để nó nổ.
        global.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([null]) });
        await expect(layPinyinCau('我爱你。')).resolves.toBe('');
    });

    test('có timeout — không để fetch treo tích luỹ', () => {
        // gtx bị giới hạn tần suất thì fetch treo và tích luỹ dần.
        expect(src).toMatch(/AbortController/);
        expect(src).toMatch(/setTimeout\(\(\) => ctrl\.abort\(\)/);
    });
});
