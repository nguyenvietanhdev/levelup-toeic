/**
 * Bài nghe có script chạy theo.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Chia câu sai mốc → tô sáng lệch câu đang nói, bấm câu nghe nhầm chỗ.
 *   2. Script vụn ("Yes." thành một dòng) hoặc dồn cả bài vào một câu.
 *   3. Link admin dán trỏ vào máy nội bộ của server.
 *   4. Bài đã ẩn vẫn mở được; danh sách gửi cả script nặng.
 *   5. Whisper/Cloudinary lỗi mà vẫn tạo bài rỗng.
 */
jest.mock('../utils/cloudinary', () => ({
    isConfigured: () => true,
    cloudinary: {
        uploader: {
            upload_stream: (opts, cb) => ({
                end: () => (mockMay.cloudLoi ? cb(new Error('cloud down')) : cb(null, { secure_url: 'https://res.cloudinary.com/x/bai-nghe/a.mp3', public_id: 'bai-nghe/a', duration: 62.5 })),
            }),
        },
    },
}));
jest.mock('openai', () => ({
    OpenAI: jest.fn(() => ({ audio: { transcriptions: { create: async (o) => { mockMay.whisper.push(o); if (mockMay.whisperLoi) throw new Error('whisper down'); return mockMay.kqWhisper; } } } })),
    toFile: async (buf, ten) => ({ buf, ten }),
}));
const mockMay = { cloudLoi: false, whisperLoi: false, whisper: [], kqWhisper: null, tao: [] };
jest.mock('../models/BaiNghe', () => ({
    create: jest.fn(async (d) => { mockMay.tao.push(d); return { _id: 'b1', ...d }; }),
    findOne: jest.fn((q) => ({ lean: async () => (mockMay.doc && (q.an === false ? !mockMay.doc.an : true) ? mockMay.doc : null) })),
    aggregate: jest.fn(async (p) => { mockMay.pipeline = p; return []; }),
    updateOne: jest.fn(async () => ({ matchedCount: 1 })),
}));

const S = require('../services/baiNghe');

// Khoá giả: test không gọi mạng (OpenAI SDK đã giả lập), chỉ cần có để chọn được nơi chép lời.
process.env.GROQ_API_KEY = 'test-groq';

const DOAN = [
    { start: 0, end: 4, text: ' Hello and welcome to Lets Learn English. I am Anna.' },
    { start: 4, end: 6, text: ' Yes.' },
    { start: 6, end: 10, text: ' Today we talk about' },
    { start: 10, end: 13, text: ' going to the bank.' },
];

beforeEach(() => {
    Object.assign(mockMay, { cloudLoi: false, whisperLoi: false, whisper: [], tao: [], doc: null, kqWhisper: { segments: DOAN, duration: 13 } });
});

describe('chia câu', () => {
    const cau = S.tachCau(DOAN);
    test('một đoạn nhiều câu thì tách, mốc chia theo độ dài và nằm trong đoạn', () => {
        expect(cau[0].text).toBe('Hello and welcome to Lets Learn English.');
        expect(cau[0].batDau).toBe(0);
        expect(cau[1].text).toMatch(/^I am Anna\. Yes\.$/);
        expect(cau[0].ketThuc).toBeGreaterThan(2);
        expect(cau[0].ketThuc).toBeLessThan(4);
    });
    test('mảnh quá ngắn gộp vào câu trước; đoạn cắt giữa câu thì nối với đoạn sau', () => {
        expect(cau.map((c) => c.text)).not.toContain('Yes.');
        expect(cau[2]).toEqual({ batDau: 6, ketThuc: 13, text: 'Today we talk about going to the bank.' });
    });
    test('mốc tăng dần, không chồng nhau', () => {
        for (let i = 1; i < cau.length; i += 1) expect(cau[i].batDau).toBeGreaterThanOrEqual(cau[i - 1].ketThuc - 0.01);
    });
    test('đoạn hỏng bị bỏ; không có dấu câu thì không dồn cả bài vào một câu', () => {
        expect(S.tachCau([{ start: 5, end: 2, text: 'x' }, { start: 0, end: 1, text: '  ' }, null])).toEqual([]);
        const dai = Array.from({ length: 40 }, (_, i) => ({ start: i, end: i + 1, text: 'no punctuation at all here' }));
        expect(S.tachCau(dai).length).toBeGreaterThan(1);
    });
    test('tiếng Trung tách theo dấu câu Trung, không chèn dấu cách khi gộp', () => {
        const zh = S.tachCau([{ start: 0, end: 4, text: '我是安娜，今天我们去银行。好。' }], 'zh');
        expect(zh.map((c) => c.text)).toEqual(['我是安娜，今天我们去银行。好。']);
        expect(S.tachCau([{ start: 0, end: 4, text: '今天我们去银行。明天我们去学校。' }], 'zh')).toHaveLength(2);
        expect(S.tachCau([{ start: 0, end: 2, text: '大家好,欢迎收听。' }], 'zh')[0].text).toBe('大家好，欢迎收听。');
        // Whisper bỏ dấu kết câu: mỗi đoạn vẫn là một câu, không dồn cả bài lại.
        const khongDau = S.tachCau([
            { start: 0, end: 3, text: '欢迎收听今天的中文课' }, { start: 3, end: 5, text: '今天安娜去银行' }, { start: 5, end: 6, text: '好' },
        ], 'zh');
        expect(khongDau.map((c) => c.text)).toEqual(['欢迎收听今天的中文课', '今天安娜去银行好']);
    });
});

describe('nơi chép lời', () => {
    test('có khoá Groq thì dùng Groq (miễn phí), không thì OpenAI, không có gì thì báo', () => {
        expect(S.nhaChepLoi({ GROQ_API_KEY: 'g', OPENAI_API_KEY: 'o' })).toMatchObject({ ten: 'groq', baseURL: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3-turbo' });
        expect(S.nhaChepLoi({ OPENAI_API_KEY: 'o' })).toMatchObject({ ten: 'openai', model: 'whisper-1' });
        expect(S.nhaChepLoi({})).toBeNull();
    });
});

describe('link âm thanh', () => {
    test('chỉ http(s) ra ngoài; chặn máy nội bộ', () => {
        expect(S.kiemUrl('https://example.com/a.mp3')).toBe('https://example.com/a.mp3');
        for (const x of ['ftp://a/b.mp3', 'http://localhost/a', 'http://127.0.0.1/a', 'http://10.0.0.5/a', 'http://192.168.1.2/a', 'http://169.254.169.254/latest', 'abc']) {
            expect(S.kiemUrl(x)).toBeNull();
        }
    });
});

describe('thêm bài', () => {
    test('file tải lên: lưu Cloudinary, Whisper có mốc thời gian, lưu script đã chia câu', async () => {
        const r = await S.themBai({ buffer: Buffer.from('mp3'), tenFile: 'lesson1.mp3', tieuDe: ' Lesson 1: Welcome ', capDo: 'de', nguonUrl: 'https://learningenglish.voanews.com/a/1.html' });
        expect(r.bai).toMatchObject({ id: 'b1', tieuDe: 'Lesson 1: Welcome', soCau: 3, thoiLuong: 62.5 });
        expect(mockMay.whisper[0]).toMatchObject({ response_format: 'verbose_json', language: 'en' });
        expect(mockMay.tao[0]).toMatchObject({ capDo: 'de', nguon: 'VOA Learning English', audioUrl: 'https://res.cloudinary.com/x/bai-nghe/a.mp3', cloudinaryId: 'bai-nghe/a' });
    });
    test('thiếu tiêu đề, thiếu âm thanh, link nội bộ → báo lỗi, không gọi Whisper', async () => {
        expect((await S.themBai({ buffer: Buffer.from('x') })).ma).toBe(400);
        expect((await S.themBai({ tieuDe: 'a' })).ma).toBe(400);
        expect((await S.themBai({ tieuDe: 'a', url: 'http://127.0.0.1/a.mp3' })).ma).toBe(400);
        expect(mockMay.whisper).toHaveLength(0);
    });
    test('Whisper hoặc Cloudinary lỗi → không tạo bài', async () => {
        mockMay.whisperLoi = true;
        expect((await S.themBai({ buffer: Buffer.from('x'), tieuDe: 'a' })).loi).toBeTruthy();
        mockMay.whisperLoi = false;
        mockMay.cloudLoi = true;
        expect((await S.themBai({ buffer: Buffer.from('x'), tieuDe: 'a' })).loi).toBeTruthy();
        expect(mockMay.tao).toHaveLength(0);
    });
    test('file không có lời nói → báo, không tạo bài', async () => {
        mockMay.kqWhisper = { segments: [], duration: 3 };
        expect((await S.themBai({ buffer: Buffer.from('x'), tieuDe: 'a' })).loi).toMatch(/lời nói/);
        expect(mockMay.tao).toHaveLength(0);
    });
});

describe('người học xem', () => {
    test('bài đã ẩn không mở được', async () => {
        mockMay.doc = { _id: 'b1', tieuDe: 'x', an: true, cau: [] };
        expect((await S.layBai('b1')).ma).toBe(404);
        mockMay.doc.an = false;
        expect((await S.layBai('b1')).tieuDe).toBe('x');
    });
    test('danh sách chỉ bài đang hiện của đúng ngôn ngữ, không gửi script', async () => {
        await S.danhSach('zh');
        expect(mockMay.pipeline[0].$match).toEqual({ an: false, lang: 'zh' });
        expect(mockMay.pipeline.find((x) => x.$project).$project.cau).toBeUndefined();
    });
});
