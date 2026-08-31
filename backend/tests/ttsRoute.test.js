/**
 * `/api/tts`: trình duyệt phải được giữ audio, và giọng "ngẫu nhiên" phải ỔN ĐỊNH.
 *
 * Hai thứ này nghe như hai chuyện nhưng là một: audio chỉ dùng lại được khi
 * CÙNG một URL luôn cho CÙNG một nội dung.
 *
 * Bản cũ hỏng cả hai đầu. Nó gửi `Cache-Control: no-store`, nên bấm nghe lại
 * đúng từ vừa nghe cũng đi hết một vòng mạng và một lượt tổng hợp — mà một lượt
 * tiếng Việt đo được tới 4.9 giây. Và các mã `*-random` bốc giọng bằng
 * `Math.random()` mỗi lượt, nên kể cả có cache thì cũng chẳng có gì trùng để
 * dùng lại.
 */
const http = require('http');
const express = require('express');

// Không chạm mạng: `tongHop` giả trả về đúng thứ nó được hỏi, để test soi được
// route đã chọn giọng nào.
const goiTongHop = [];
jest.mock('../services/ttsEngine', () => ({
    tongHop: jest.fn(async (giong, text, rate) => {
        goiTongHop.push({ giong, text, rate });
        return { buffer: Buffer.from(`am|${giong}|${rate}|${text}`), tuKho: goiTongHop.length > 1 };
    }),
}));

const app = express();
app.use('/api/tts', require('../routes/tts'));

let server;
let cong;

beforeAll(async () => {
    server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    cong = server.address().port;
});

afterAll(() => new Promise((r) => server.close(r)));

beforeEach(() => { goiTongHop.length = 0; });

/** Gọi endpoint, trả về `{ status, headers, body }`. */
async function goi(qs, headers = {}) {
    const res = await fetch(`http://127.0.0.1:${cong}/api/tts?${qs}`, { headers });
    return {
        status: res.status,
        h: (k) => res.headers.get(k),
        body: Buffer.from(await res.arrayBuffer()).toString(),
    };
}

describe('trình duyệt được giữ audio', () => {
    test('KHÔNG còn `no-store`', async () => {
        // Đây là dòng làm mọi lần nghe lại đều trả giá đầy đủ.
        const r = await goi('text=hello&lang=en-us&rate=0.8');
        expect(r.h('cache-control')).not.toMatch(/no-store/);
    });

    test('cho giữ lâu và khỏi hỏi lại', async () => {
        // Cùng chữ + cùng giọng + cùng tốc độ thì audio không bao giờ đổi, mà cả
        // ba đều nằm trong URL — nên `immutable` là đúng chứ không phải liều.
        const r = await goi('text=hello&lang=en-us&rate=0.8');
        expect(r.h('cache-control')).toMatch(/public/);
        expect(r.h('cache-control')).toMatch(/immutable/);
        const maxAge = Number((r.h('cache-control').match(/max-age=(\d+)/) || [])[1]);
        expect(maxAge).toBeGreaterThanOrEqual(24 * 60 * 60);
    });

    test('có ETag', async () => {
        expect((await goi('text=hello&lang=en-us&rate=0.8')).h('etag')).toBeTruthy();
    });

    test('ETag ĐỔI khi chữ, giọng, hoặc tốc độ đổi', async () => {
        // Ba thứ quyết định audio; thiếu cái nào trong ETag là trình duyệt giữ
        // lại audio của thứ khác.
        const goc = (await goi('text=hello&lang=en-us&rate=0.8')).h('etag');
        expect((await goi('text=world&lang=en-us&rate=0.8')).h('etag')).not.toBe(goc);
        expect((await goi('text=hello&lang=en-gb&rate=0.8')).h('etag')).not.toBe(goc);
        expect((await goi('text=hello&lang=en-us&rate=1.5')).h('etag')).not.toBe(goc);
    });

    test('`If-None-Match` khớp → 304, và KHÔNG tổng hợp lại', async () => {
        // Điểm của 304 là trả lời mà không phải làm gì. Tổng hợp trước rồi mới
        // quyết định gửi hay không là trả đủ giá rồi vứt đi.
        const etag = (await goi('text=hello&lang=en-us&rate=0.8')).h('etag');
        goiTongHop.length = 0;

        const r = await goi('text=hello&lang=en-us&rate=0.8', { 'If-None-Match': etag });
        expect(r.status).toBe(304);
        expect(r.body).toBe('');
        expect(goiTongHop).toHaveLength(0);
    });

    test('`If-None-Match` KHÔNG khớp → gửi audio thật', async () => {
        const r = await goi('text=hello&lang=en-us&rate=0.8', { 'If-None-Match': '"cu-rich"' });
        expect(r.status).toBe(200);
        expect(r.body).toContain('am|');
    });
});

describe('giọng "ngẫu nhiên" ổn định theo CHỮ', () => {
    const giongCua = async (text, lang = 'vi-random') => {
        goiTongHop.length = 0;
        await goi(`text=${encodeURIComponent(text)}&lang=${lang}&rate=0.8`);
        return goiTongHop[0].giong;
    };

    test('cùng một từ luôn ra CÙNG giọng', async () => {
        // `Math.random()` mỗi lượt thì mỗi lượt là một audio khác — cache ở cả
        // hai phía đều thành vô nghĩa.
        const a = await giongCua('xin chào');
        for (let i = 0; i < 6; i++) expect(await giongCua('xin chào')).toBe(a);
    });

    test('vẫn TRỘN giọng giữa các từ khác nhau', async () => {
        // Ổn định không được biến thành "chỉ còn một giọng" — trộn giọng chính
        // là điểm của chế độ này.
        const tu = ['xin chào', 'tạm biệt', 'cảm ơn', 'hẹn gặp lại', 'chúc ngủ ngon',
            'rất vui', 'hôm nay', 'ngày mai', 'buổi sáng', 'buổi tối'];
        const thay = new Set();
        for (const t of tu) thay.add(await giongCua(t));
        expect(thay.size).toBeGreaterThan(1);
    });

    test('chỉ chọn trong danh sách ĐÚNG ngôn ngữ', async () => {
        expect(await giongCua('xin chào', 'vi-random')).toMatch(/^vi-VN-/);
        expect(await giongCua('你好', 'zh-cn-random')).toMatch(/^zh-CN-/);
        expect(await giongCua('hello', 'en-random')).toMatch(/^en-/);
    });

    test('mã giọng CỐ ĐỊNH vẫn đi thẳng, không bị bốc lại', async () => {
        expect(await giongCua('xin chào', 'vi-vn-m')).toBe('vi-VN-NamMinhNeural');
    });
});

describe('những phần cũ vẫn còn nguyên', () => {
    test('thiếu `text` → 400', async () => {
        expect((await goi('lang=en-us')).status).toBe(400);
    });

    test('tốc độ bị kẹp trong khoảng an toàn', async () => {
        // `rate` đến thẳng từ query; không kẹp thì `rate=99` cho ra tiếng rít,
        // `rate=0` thì tổng hợp không bao giờ xong.
        await goi('text=hello&lang=en-us&rate=99');
        expect(goiTongHop[0].rate).toBeLessThanOrEqual(2);
        goiTongHop.length = 0;
        await goi('text=hello&lang=en-us&rate=0.01');
        expect(goiTongHop[0].rate).toBeGreaterThanOrEqual(0.5);
    });

    test('gửi đúng kiểu nội dung và độ dài', async () => {
        // `Content-Length` chính xác là thứ giữ trình duyệt khỏi dùng range
        // request trên blob URL — lý do bản cũ gom hết audio trước khi gửi.
        const res = await fetch(`http://127.0.0.1:${cong}/api/tts?text=hello&lang=en-us&rate=0.8`);
        const buf = Buffer.from(await res.arrayBuffer());
        expect(res.headers.get('content-type')).toBe('audio/mpeg');
        expect(Number(res.headers.get('content-length'))).toBe(buf.length);
        expect(res.headers.get('accept-ranges')).toBe('bytes');
    });

    test('mã ngôn ngữ lạ → lùi về giọng Anh, không vỡ', async () => {
        goiTongHop.length = 0;
        await goi('text=hello&lang=tieng-sao-hoa&rate=0.8');
        expect(goiTongHop[0].giong).toBe('en-US-AriaNeural');
    });
});
