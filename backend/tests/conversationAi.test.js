/**
 * Phần sinh hội thoại.
 *
 * Ba thứ ở đây quyết định tính năng CÓ DÙNG ĐƯỢC hay không, và cả ba đều là
 * lỗi im lặng — chạy vẫn ra kết quả, chỉ là kết quả vô dụng:
 *
 *   1. Nhét cả 30 từ vào prompt → AI nói hết danh sách ngay lượt đầu, người
 *      học chẳng còn từ nào để dùng, điểm luôn bằng 0.
 *   2. Gửi lại TOÀN BỘ lượt mỗi lần → chi phí tăng theo BÌNH PHƯƠNG số lượt.
 *      Hội thoại 12 lượt tốn gấp ~10 lần 12 câu hỏi lẻ.
 *   3. Không giới hạn độ dài câu trả lời → AI độc thoại, người học không có
 *      lượt, mà đó chính là mục đích bài tập.
 */
const {
    pickWords, systemPrompt, WORDS_IN_PROMPT,
} = require('../services/conversationAi');

describe('chọn từ nhét vào prompt', () => {
    const target = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];

    test('KHÔNG gửi cả danh sách', () => {
        // Gửi hết thì AI rải đều và nói sạch ngay lượt đầu.
        expect(pickWords(target, []).length).toBe(WORDS_IN_PROMPT);
        expect(WORDS_IN_PROMPT).toBeLessThan(target.length);
    });

    test('ưu tiên từ CHƯA dùng', () => {
        // Hội thoại tự lái về phía những từ người học còn nợ, thay vì lặp lại
        // mấy từ đã ăn điểm rồi.
        const got = pickWords(target, ['a', 'b', 'c']);
        expect(got).not.toContain('a');
        expect(got).not.toContain('b');
        expect(got).not.toContain('c');
    });

    test('dùng hết rồi thì QUAY LẠI cả danh sách, không trả rỗng', () => {
        // Trả rỗng thì prompt mất luật số 4 và hội thoại đứng im.
        const got = pickWords(target, target);
        expect(got.length).toBeGreaterThan(0);
    });

    test('danh sách ngắn hơn mức nhét thì lấy hết', () => {
        expect(pickWords(['x', 'y'], [])).toEqual(['x', 'y']);
    });

    test('đầu vào hỏng không làm sập', () => {
        expect(pickWords(undefined, undefined)).toEqual([]);
        expect(pickWords([], [])).toEqual([]);
    });
});

describe('prompt hệ thống', () => {
    const words = ['hello', 'work'];

    test('ép nói ĐÚNG ngôn ngữ đích', () => {
        expect(systemPrompt({ lang: 'zh', words })).toMatch(/Mandarin Chinese/);
        expect(systemPrompt({ lang: 'en', words })).toMatch(/English/);
    });

    test('ngôn ngữ lạ thì rơi về tiếng Anh, không sập', () => {
        expect(systemPrompt({ lang: 'fr', words })).toMatch(/English/);
    });

    test('ép câu NGẮN — nếu không AI độc thoại', () => {
        const p = systemPrompt({ lang: 'en', words });
        expect(p).toMatch(/ONE or TWO short sentences/);
    });

    test('ép KẾT THÚC bằng câu hỏi', () => {
        // Không có thì hội thoại chết đứng sau vài lượt: người học không biết
        // đáp gì tiếp.
        expect(systemPrompt({ lang: 'en', words })).toMatch(/QUESTION/);
    });

    test('có danh sách từ mục tiêu', () => {
        expect(systemPrompt({ lang: 'en', words })).toMatch(/hello, work/);
    });

    test('CẤM liệt kê hết từ cùng lúc', () => {
        // Đây là luật giữ cho người học còn việc để làm.
        const p = systemPrompt({ lang: 'en', words });
        expect(p).toMatch(/Do NOT use all of them/);
    });

    test('CẤM sửa lỗi giữa chừng', () => {
        // Sửa liên tục thì thành lớp ngữ pháp, không phải hội thoại — và người
        // học ngại nói.
        expect(systemPrompt({ lang: 'en', words })).toMatch(/Do not correct/);
    });

    test('không có chủ đề thì bỏ hẳn dòng đó, không để "Setting: ."', () => {
        expect(systemPrompt({ lang: 'en', words })).not.toMatch(/Setting:/);
        expect(systemPrompt({ lang: 'en', topic: 'đi chợ', words })).toMatch(/Setting: đi chợ/);
    });
});

describe('chặn chi phí', () => {
    const src = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'services', 'conversationAi.js'), 'utf8');

    test('CẮT CỬA SỔ lượt gửi lại — không gửi cả phiên', () => {
        // Gửi lại tất cả thì chi phí tăng theo BÌNH PHƯƠNG số lượt.
        expect(src).toMatch(/const WINDOW = \d+/);
        expect(src).toMatch(/turns\.slice\(-WINDOW\)/);
    });

    test('giới hạn maxTokens thấp hơn hẳn chat thường', () => {
        // `chat-tutor` dùng 500. Ở đây câu phải ngắn, và giới hạn cứng mới là
        // thứ chặn được khi prompt bị lờ đi.
        const hits = [...src.matchAll(/maxTokens:\s*(\d+)/g)].map((m) => Number(m[1]));
        expect(hits.length).toBeGreaterThan(0);
        for (const n of hits) expect(n).toBeLessThanOrEqual(200);
    });

    test('gắn nhãn feature riêng cho từng lượt', () => {
        // `aiUsageLogger` tách chi phí theo `feature` — cùng nhãn với chat
        // thường thì không biết hội thoại tốn bao nhiêu.
        expect(src).toMatch(/feature: 'conversation-open'/);
        expect(src).toMatch(/feature: 'conversation-reply'/);
    });

    test('truyền userId để quy chi phí về đúng người', () => {
        expect(src).toMatch(/userId,/);
    });
});
