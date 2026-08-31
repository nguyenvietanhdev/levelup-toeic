/**
 * TTS: nhớ lại audio đã tổng hợp, và giữ ấm kết nối.
 *
 * Đo trên máy thật trước khi sửa: một lượt tiếng Việt tốn 1.8–4.9 giây, tiếng
 * Anh 0.2–0.9 giây. Phần lớn khoản đó là Microsoft NGHĨ trước khi gửi mảnh audio
 * đầu tiên (đo được 1971ms trước mảnh đầu, rồi chảy hết chỉ trong 280ms) — nên
 * stream sớm không cứu được gì, mà nhớ lại thì cứu được tất cả những lượt sau.
 *
 * Chỗ dễ hỏng nhất KHÔNG phải phép nhớ mà là việc dùng lại kết nối:
 * `msedge-tts` xử lý socket đóng bằng cách đẩy `null` vào mọi stream đang chờ
 * (MsEdgeTTS.js:168). Tức là kết nối chết KHÔNG ném lỗi — nó trả audio CỤT, và
 * người học nghe nửa từ mà log sạch trơn.
 */
const { PassThrough } = require('stream');

// Bộ giả lập `msedge-tts` — không chạm mạng.
const trangThai = {
    soLanMoKetNoi: 0,
    soLanTongHop: 0,
    /** Mỗi phần tử: Buffer trả về, hoặc 'RONG' (socket chết), hoặc 'NEM'. */
    kichBan: [],
    /** readyState mà socket giả báo. 1 = OPEN. */
    readyState: 1,
    soLanDong: 0,
};

jest.mock('msedge-tts', () => ({
    OUTPUT_FORMAT: { AUDIO_24KHZ_96KBITRATE_MONO_MP3: 'mp3' },
    MsEdgeTTS: class {
        constructor() {
            trangThai.soLanMoKetNoi += 1;
            this._ws = { OPEN: 1, get readyState() { return trangThai.readyState; } };
        }
        async setMetadata() { /* bắt tay giả */ }
        toStream() {
            trangThai.soLanTongHop += 1;
            const audioStream = new PassThrough();
            const buoc = trangThai.kichBan.shift() ?? Buffer.from('am-thanh');
            process.nextTick(() => {
                if (buoc === 'NEM') { audioStream.emit('error', new Error('socket rớt')); return; }
                if (buoc !== 'RONG') audioStream.write(buoc);
                audioStream.end();
            });
            return { audioStream };
        }
        close() { trangThai.soLanDong += 1; }
    },
}));

const engine = require('../services/ttsEngine');

beforeEach(() => {
    engine.dongHet();
    engine.xoaKho();
    trangThai.soLanMoKetNoi = 0;
    trangThai.soLanTongHop = 0;
    trangThai.soLanDong = 0;
    trangThai.kichBan = [];
    trangThai.readyState = 1;
});

afterAll(() => engine.dongHet());

describe('nhớ lại audio đã tổng hợp', () => {
    test('lượt đầu tổng hợp, lượt sau lấy từ kho', async () => {
        const a = await engine.tongHop('vi-VN-HoaiMyNeural', 'xin chào', 0.8);
        const b = await engine.tongHop('vi-VN-HoaiMyNeural', 'xin chào', 0.8);

        expect(a.tuKho).toBe(false);
        expect(b.tuKho).toBe(true);
        expect(b.buffer).toEqual(a.buffer);
        // Đây mới là điều đáng giá: KHÔNG gọi Microsoft lần thứ hai.
        expect(trangThai.soLanTongHop).toBe(1);
    });

    test('khác GIỌNG là audio khác, không dùng chung', async () => {
        await engine.tongHop('vi-VN-HoaiMyNeural', 'xin chào', 0.8);
        const b = await engine.tongHop('vi-VN-NamMinhNeural', 'xin chào', 0.8);
        expect(b.tuKho).toBe(false);
    });

    test('khác TỐC ĐỘ là audio khác', async () => {
        // Người dùng chỉnh tốc độ đọc trong Cài đặt; trả lại bản 0.8 cho người
        // đang đặt 1.5 là phát sai hẳn thứ họ chọn.
        await engine.tongHop('vi-VN-HoaiMyNeural', 'xin chào', 0.8);
        const b = await engine.tongHop('vi-VN-HoaiMyNeural', 'xin chào', 1.5);
        expect(b.tuKho).toBe(false);
    });

    test('khác CHỮ là audio khác', async () => {
        await engine.tongHop('vi-VN-HoaiMyNeural', 'xin chào', 0.8);
        const b = await engine.tongHop('vi-VN-HoaiMyNeural', 'tạm biệt', 0.8);
        expect(b.tuKho).toBe(false);
    });
});

describe('kho có TRẦN, đuổi bản cũ nhất', () => {
    test('vượt trần thì bản LÂU KHÔNG DÙNG bị đuổi trước', async () => {
        // Trần tính bằng byte chứ không phải số bản ghi: một câu ví dụ dài nặng
        // gấp mười lần một từ đơn, nên đếm bản ghi thì trần thật không đoán được.
        const to = Buffer.alloc(Math.floor(engine.TRAN_KHO * 0.6));
        trangThai.kichBan = [to, to];

        await engine.tongHop('v', 'mot', 0.8);
        await engine.tongHop('v', 'hai', 0.8);   // tổng 120% trần → 'mot' bị đuổi

        expect(engine.soLieuKho().soBanGhi).toBe(1);
        expect((await engine.tongHop('v', 'hai', 0.8)).tuKho).toBe(true);

        trangThai.kichBan = [Buffer.from('lai-tong-hop')];
        expect((await engine.tongHop('v', 'mot', 0.8)).tuKho).toBe(false);
    });

    test('vừa DÙNG thì lâu bị đuổi nhất', async () => {
        // Không đẩy lên đầu hàng khi đọc thì kho thành "đuổi theo thứ tự cất",
        // và đúng những từ đang ôn nhiều nhất lại bị đuổi sớm nhất.
        const to = Buffer.alloc(Math.floor(engine.TRAN_KHO * 0.45));
        trangThai.kichBan = [to, to, to];

        await engine.tongHop('v', 'mot', 0.8);
        await engine.tongHop('v', 'hai', 0.8);
        await engine.tongHop('v', 'mot', 0.8);   // chạm lại 'mot'
        await engine.tongHop('v', 'ba', 0.8);    // phải đuổi 'hai'

        expect((await engine.tongHop('v', 'mot', 0.8)).tuKho).toBe(true);
        trangThai.kichBan = [Buffer.from('x')];
        expect((await engine.tongHop('v', 'hai', 0.8)).tuKho).toBe(false);
    });

    test('bản ghi to hơn cả trần thì KHÔNG cất', async () => {
        // Cất vào là đuổi sạch mọi thứ khác rồi bản thân nó vẫn tràn.
        trangThai.kichBan = [Buffer.alloc(engine.TRAN_KHO + 1)];
        await engine.tongHop('v', 'khong-lo', 0.8);
        expect(engine.soLieuKho().soBanGhi).toBe(0);
    });

    test('audio RỖNG không được cất', async () => {
        // Cất một bản rỗng là đóng băng lỗi: mọi lượt sau đều "thành công" mà
        // không có tiếng nào — im lặng vĩnh viễn cho đúng từ đó.
        trangThai.kichBan = ['RONG', Buffer.from('that')];
        await engine.tongHop('v', 'cau', 0.8);

        expect(engine.soLieuKho().soBanGhi).toBe(1);
        const lai = await engine.tongHop('v', 'cau', 0.8);
        expect(lai.tuKho).toBe(true);
        expect(lai.buffer.toString()).toBe('that');
    });
});

describe('giữ ấm kết nối', () => {
    test('hai lượt KHÁC chữ chỉ mở MỘT kết nối', async () => {
        // Mỗi kết nối là một lần bắt tay WebSocket tới Microsoft — đo được
        // 216–396ms, trả trên MỌI lượt ở bản cũ.
        await engine.tongHop('v', 'mot', 0.8);
        await engine.tongHop('v', 'hai', 0.8);
        expect(trangThai.soLanMoKetNoi).toBe(1);
    });

    test('mỗi GIỌNG một kết nối riêng', async () => {
        // Giọng nằm trong metadata của kết nối, không đổi giữa chừng được.
        await engine.tongHop('giong-a', 'mot', 0.8);
        await engine.tongHop('giong-b', 'mot', 0.8);
        expect(trangThai.soLanMoKetNoi).toBe(2);
    });

    test('socket đã ĐÓNG thì mở cái mới, không dùng lại', async () => {
        await engine.tongHop('v', 'mot', 0.8);
        trangThai.readyState = 3;                 // CLOSED
        await engine.tongHop('v', 'hai', 0.8);
        expect(trangThai.soLanMoKetNoi).toBe(2);
    });

    test('`dongHet` đóng thật', async () => {
        await engine.tongHop('v', 'mot', 0.8);
        engine.dongHet();
        expect(trangThai.soLanDong).toBe(1);
        // Và quên hẳn — lượt sau phải mở lại.
        await engine.tongHop('v', 'hai', 0.8);
        expect(trangThai.soLanMoKetNoi).toBe(2);
    });
});

describe('kết nối chết KHÔNG được trả audio cụt', () => {
    test('audio rỗng → vứt kết nối, thử lại một lần', async () => {
        // Đây là ca thật và là ca im lặng: thư viện đóng stream bằng `null` chứ
        // không ném, nên không có lỗi nào để bắt. Chỉ nhìn ra qua độ dài.
        trangThai.kichBan = ['RONG', Buffer.from('lan-hai')];
        const r = await engine.tongHop('v', 'cau', 0.8);
        expect(r.buffer.toString()).toBe('lan-hai');
        expect(trangThai.soLanMoKetNoi).toBe(2);
    });

    test('lượt đầu NÉM lỗi cũng thử lại', async () => {
        trangThai.kichBan = ['NEM', Buffer.from('lan-hai')];
        const r = await engine.tongHop('v', 'cau', 0.8);
        expect(r.buffer.toString()).toBe('lan-hai');
    });

    test('thử lại ĐÚNG một lần, hỏng nữa thì ném ra', async () => {
        // Hỏng hai lần liên tiếp thì vấn đề không nằm ở kết nối cũ nữa; thử mãi
        // là giữ request treo và giữ luôn cả một socket cho mỗi lần thử.
        trangThai.kichBan = ['NEM', 'NEM'];
        await expect(engine.tongHop('v', 'cau', 0.8)).rejects.toThrow();
        expect(trangThai.soLanMoKetNoi).toBe(2);
    });

    test('rỗng CẢ HAI lần thì không cất — nếu không là hỏng vĩnh viễn', async () => {
        // Ca tệ nhất và khó thấy nhất: cất bản rỗng vào kho thì mọi lượt sau
        // đều lấy trúng nó, không lượt nào chạm tới Microsoft nữa, và đúng từ
        // đó câm vĩnh viễn — kể cả khi mạng đã tốt trở lại.
        trangThai.kichBan = ['RONG', 'RONG'];
        const r = await engine.tongHop('v', 'cau', 0.8);
        expect(r.buffer.length).toBe(0);
        expect(engine.soLieuKho().soBanGhi).toBe(0);

        // Và lần sau vẫn thử lại thật.
        trangThai.kichBan = [Buffer.from('da-on')];
        const lai = await engine.tongHop('v', 'cau', 0.8);
        expect(lai.tuKho).toBe(false);
        expect(lai.buffer.toString()).toBe('da-on');
    });

    test('lượt hỏng KHÔNG để lại gì trong kho', async () => {
        trangThai.kichBan = ['NEM', 'NEM'];
        await expect(engine.tongHop('v', 'cau', 0.8)).rejects.toThrow();
        expect(engine.soLieuKho().soBanGhi).toBe(0);
    });
});
