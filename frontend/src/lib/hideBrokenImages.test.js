/**
 * Ẩn ảnh hỏng bằng listener thay cho inline `onerror` (CSP chặn inline).
 *
 * Điểm dễ sai nhất: sự kiện `error` KHÔNG nổi bọt. Gắn listener thường trên
 * document thì không bao giờ chạy — phải dùng pha capture. Test này chốt đúng
 * chỗ đó, vì bỏ `true` là hỏng im lặng y hệt lỗi đang thay thế.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { installBrokenImageHandler } from './hideBrokenImages.js';

describe('installBrokenImageHandler', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        delete document._brokenImgBound;
        installBrokenImageHandler(document);
    });

    test('ảnh hỏng tự ẩn chính nó', () => {
        document.body.innerHTML = '<img id="a" class="js-hide-on-error" src="x.png">';
        const img = document.getElementById('a');
        img.dispatchEvent(new Event('error'));
        expect(img.style.display).toBe('none');
    });

    test('ẩn cả cột chứa ảnh khi có data-hide-closest', () => {
        document.body.innerHTML =
            '<div class="card-image-col"><img id="a" class="js-hide-on-error" data-hide-closest=".card-image-col"></div>';
        document.getElementById('a').dispatchEvent(new Event('error'));
        expect(document.querySelector('.card-image-col').style.display).toBe('none');
    });

    test('KHÔNG đụng tới ảnh không đánh dấu', () => {
        document.body.innerHTML = '<img id="a" src="x.png">';
        const img = document.getElementById('a');
        img.dispatchEvent(new Event('error'));
        expect(img.style.display).toBe('');
    });

    test('data-hide-closest trỏ tới thứ không tồn tại thì bỏ qua, không ném lỗi', () => {
        document.body.innerHTML = '<img id="a" class="js-hide-on-error" data-hide-closest=".khong-co">';
        const img = document.getElementById('a');
        expect(() => img.dispatchEvent(new Event('error'))).not.toThrow();
    });

    test('gọi hai lần không gắn chồng listener', () => {
        installBrokenImageHandler(document);
        installBrokenImageHandler(document);
        document.body.innerHTML = '<img id="a" class="js-hide-on-error">';
        const img = document.getElementById('a');
        img.dispatchEvent(new Event('error'));
        expect(img.style.display).toBe('none');   // vẫn đúng, không lỗi
    });
});
