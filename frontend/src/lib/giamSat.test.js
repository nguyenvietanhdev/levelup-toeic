/**
 * Giám sát lỗi phía trình duyệt.
 *
 * Chỗ dễ hỏng: tải Sentry khi không có DSN (nặng vô ích), gửi chữ người học đang gõ, lỗi trước
 * lúc Sentry tải xong bị mất, hoặc cấu hình hỏng làm app chết.
 */
import { describe, test, expect, vi } from 'vitest';

async function moi() {
    vi.resetModules();
    return import('./giamSat.js');
}

describe('khởi động', () => {
    test('không có DSN: không tải thư viện Sentry', async () => {
        const g = await moi();
        const nap = vi.fn();
        expect(await g.khoiDongGiamSat({ layCauHinh: async () => ({ data: { dsn: '' } }), napThuVien: nap })).toBe(false);
        expect(nap).not.toHaveBeenCalled();
    });
    test('đọc cấu hình lỗi: im lặng, không ném', async () => {
        const g = await moi();
        await expect(g.khoiDongGiamSat({ layCauHinh: async () => { throw new Error('offline'); } })).resolves.toBe(false);
    });
    test('có DSN: bật không PII, không đo hiệu năng; lỗi báo trước lúc bật vẫn được gửi', async () => {
        const g = await moi();
        const S = { init: vi.fn(), captureException: vi.fn() };
        const loiSom = new Error('sớm');
        g.baoLoi(loiSom);
        expect(await g.khoiDongGiamSat({ layCauHinh: async () => ({ data: { dsn: 'https://k@o1.ingest.sentry.io/2', moiTruong: 'production' } }), napThuVien: async () => S })).toBe(true);
        expect(S.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: 'https://k@o1.ingest.sentry.io/2', sendDefaultPii: false, tracesSampleRate: 0, beforeSend: g.lamSach }));
        expect(S.captureException).toHaveBeenCalledWith(loiSom, undefined);
        const loiSau = new Error('sau');
        g.baoLoi(loiSau, { x: 1 });
        expect(S.captureException).toHaveBeenLastCalledWith(loiSau, { x: 1 });
    });
});

test('làm sạch: bỏ thân request, chữ đang gõ, người dùng chỉ giữ id', async () => {
    const { lamSach } = await moi();
    const e = lamSach({
        request: { url: '/x', data: 'password=1' },
        user: { id: 7, email: 'a@b.c' },
        breadcrumbs: [{ category: 'ui.input', message: 'bài viết' }, { category: 'navigation' }],
    });
    expect(e.request).toEqual({ url: '/x' });
    expect(e.user).toEqual({ id: '7' });
    expect(e.breadcrumbs).toEqual([{ category: 'navigation' }]);
});
