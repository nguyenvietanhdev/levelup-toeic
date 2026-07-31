/**
 * Unit test cho phần THUẦN của tab quản lý Cloudinary: đọc URL và dựng đường
 * dẫn file (không chạm DB, không gọi Cloudinary).
 *
 * Điểm dễ hỏng nhất là `publicIdFromUrl`: nó quyết định file nào bị coi là "mồ
 * côi". Đọc sai một chút là tab bảo file đang dùng thành rác rồi xoá mất ảnh đề.
 */
const path = require('path');
const { isCloudUrl, publicIdFromUrl, localTarget, PUBLIC_DIR } = require('../services/cloudinaryAssets');

describe('isCloudUrl', () => {
    test('phân biệt URL cloud với đường đĩa', () => {
        expect(isCloudUrl('https://res.cloudinary.com/dx/image/upload/v1/a.png')).toBe(true);
        expect(isCloudUrl('http://example.com/a.png')).toBe(true);
        expect(isCloudUrl('/assets/images/ets26t1/a.png')).toBe(false);
        expect(isCloudUrl('')).toBe(false);
        expect(isCloudUrl(null)).toBe(false);
    });
});

describe('publicIdFromUrl', () => {
    test('secure_url thường → public_id đầy đủ đường thư mục', () => {
        expect(publicIdFromUrl('https://res.cloudinary.com/dx/image/upload/v1712345678/toeic/images/ets26t1/a.png'))
            .toBe('toeic/images/ets26t1/a');
    });

    test('audio (resource_type video) cũng đọc được', () => {
        expect(publicIdFromUrl('https://res.cloudinary.com/dx/video/upload/v1/toeic/audio/ets26t1/p3.mp3'))
            .toBe('toeic/audio/ets26t1/p3');
    });

    test('bỏ đoạn biến đổi ảnh chèn giữa URL', () => {
        expect(publicIdFromUrl('https://res.cloudinary.com/dx/image/upload/w_300,h_200,c_fill/v1/toeic/images/a.png'))
            .toBe('toeic/images/a');
    });

    test('bỏ query string (?_a=... Cloudinary hay chèn)', () => {
        expect(publicIdFromUrl('https://res.cloudinary.com/dx/image/upload/v1/toeic/images/a.png?_a=BAM'))
            .toBe('toeic/images/a');
    });

    test('không có version vẫn đọc đúng', () => {
        expect(publicIdFromUrl('https://res.cloudinary.com/dx/image/upload/toeic/images/a.png'))
            .toBe('toeic/images/a');
    });

    test('URL không phải Cloudinary → null (không đoán bừa)', () => {
        expect(publicIdFromUrl('/assets/images/ets26t1/a.png')).toBeNull();
        expect(publicIdFromUrl('https://example.com/image/upload/v1/a.png')).toBeNull();
        expect(publicIdFromUrl('')).toBeNull();
    });
});

describe('localTarget', () => {
    test('URL đĩa → đường dẫn thật + folder cloud tương ứng', () => {
        const t = localTarget('/assets/images/ets26t1/a.png', 'images');
        expect(t.abs).toBe(path.join(PUBLIC_DIR, 'assets', 'images', 'ets26t1', 'a.png'));
        expect(t.cloudFolder).toBe('toeic/images/ets26t1');
        expect(t.publicId).toBe('a');
        expect(t.resourceType).toBe('image');
    });

    test('audio dùng resource_type "video" — Cloudinary xếp audio chung nhóm video', () => {
        expect(localTarget('/assets/audio/ets26t1/p3.mp3', 'audio').resourceType).toBe('video');
    });

    test('URL đã lên cloud → null (không đẩy lại lần nữa)', () => {
        expect(localTarget('https://res.cloudinary.com/dx/image/upload/v1/a.png', 'images')).toBeNull();
    });

    test('chặn ../ leo ra ngoài public/ — URL trong DB là dữ liệu, không phải hằng số', () => {
        expect(localTarget('/assets/images/../../../../etc/passwd', 'images')).toBeNull();
    });
});
