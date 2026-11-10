/**
 * Dò file "mồ côi" trên Cloudinary (tab Cloudinary của admin, có nút xoá).
 *
 * Chỗ dễ hỏng, mất dữ liệu thật: danh sách "đang dùng" chỉ tính ảnh/âm thanh đề TOEIC thì mọi
 * file bài nghe (MP3/MP4) hiện là mồ côi, và một cú bấm "xoá" là mất cả thư viện bài nghe.
 */
jest.mock('../models/ToeicQuestionSet', () => ({
    find: () => ({ select: () => ({ lean: async () => [{ _id: 's1', source: 'ets', imageUrls: [], audioUrl: 'https://res.cloudinary.com/demo/video/upload/v1/toeic/audio/ets/q1.mp3' }] }) }),
}));
jest.mock('../models/BaiNghe', () => ({
    find: (q) => ({ select: () => ({ lean: async () => (q.cloudinaryId ? [{ cloudinaryId: 'bai-nghe/lesson1' }, { cloudinaryId: 'bai-nghe/lesson2' }] : []) }) }),
}));

const { dbPublicIds } = require('../services/cloudinaryAssets');

test('file bài nghe được tính là đang dùng, cùng với âm thanh đề TOEIC', async () => {
    const ids = await dbPublicIds();
    expect(ids.has('bai-nghe/lesson1')).toBe(true);
    expect(ids.has('bai-nghe/lesson2')).toBe(true);
    expect([...ids].some((x) => x.includes('q1'))).toBe(true);
});
