/**
 * Tổng hợp giọng nói: giữ ấm kết nối + nhớ lại audio đã tổng hợp.
 *
 * ── VÌ SAO CÓ FILE NÀY ──────────────────────────────────────────────────────
 * Đo trên máy thật (backend/scripts/doTts.js), mỗi lời gọi tốn:
 *
 *   Tiếng Anh  "supplier"                    → bắt tay 253ms + tổng hợp  622ms
 *   Tiếng Việt "người cung cấp đồ ăn"        → bắt tay 310ms + tổng hợp 2180ms
 *   Tiếng Việt một câu 47 ký tự              → bắt tay 222ms + tổng hợp 2764ms
 *
 * Tiếng Việt chậm hơn tiếng Anh gấp ba tới bốn lần — không phải cảm giác. Và
 * bản cũ mở một WebSocket MỚI tới Microsoft cho TỪNG lời gọi, rồi đóng ngay,
 * nên lần nào cũng trả đủ cả hai khoản.
 *
 * Hai cách chữa, đánh vào hai loại lượt khác nhau:
 *
 *   · NHỚ LẠI (`_kho`) — cho chữ đã đọc rồi. Audio từ vựng lặp lại rất nhiều:
 *     cùng một từ được đọc lúc hiện câu hỏi, lúc lật thẻ, lúc bấm nghe lại, và
 *     người học sau gặp đúng từ ấy. Lần thứ hai trở đi tốn 0ms.
 *
 *   · GIỮ ẤM (`_lo`) — cho chữ CHƯA từng đọc, thứ mà nhớ lại không giúp được.
 *     Dùng lại kết nối đang mở thì bỏ hẳn khoản bắt tay, và phần lớn khoản tổng
 *     hợp: đo lại cùng câu tiếng Việt trên kết nối đang mở còn 250–306ms.
 *
 * ── CHỖ NGUY HIỂM CỦA VIỆC DÙNG LẠI KẾT NỐI ─────────────────────────────────
 * `msedge-tts` xử lý socket đóng bằng cách đẩy `null` vào MỌI stream đang chờ
 * (MsEdgeTTS.js:168) — tức là một kết nối chết KHÔNG báo lỗi, nó trả về audio
 * CỤT. Người học nghe được nửa từ và không có gì trong log.
 *
 * Nên ở đây: chỉ dùng lại khi socket còn `OPEN`, và nếu kết quả rỗng thì vứt
 * kết nối, mở cái mới, thử lại đúng MỘT lần. Một lần là đủ — hỏng hai lần liên
 * tiếp thì vấn đề không nằm ở kết nối cũ nữa.
 */
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const logger = require('../utils/logger');

const DINH_DANG = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;

/**
 * Trần kho nhớ, tính bằng BYTE chứ không phải số bản ghi.
 *
 * Đếm bản ghi thì một câu ví dụ dài nặng gấp mười lần một từ đơn mà vẫn tính
 * là một — trần 500 bản ghi có thể là 5MB hoặc 50MB, không đoán trước được.
 * 64MB đủ cho khoảng hai nghìn từ ở 24kHz mono.
 */
const TRAN_KHO = 64 * 1024 * 1024;

/**
 * Đóng kết nối sau bao lâu không dùng (ms).
 *
 * Không giữ mãi: mỗi kết nối là một WebSocket mở tới Microsoft, và phía họ cũng
 * tự ngắt sau một lúc — giữ một socket đã chết chỉ để lần sau phải phát hiện và
 * thử lại.
 */
const NGHI_SAU = 60 * 1000;

/** Kho audio đã tổng hợp. `Map` giữ đúng thứ tự chèn → dùng luôn làm LRU. */
const _kho = new Map();
let _coKho = 0;

/** Kết nối đang giữ ấm, theo từng giọng: `{ tts, hen, dangMo }`. */
const _lo = new Map();

/** Khoá kho — cùng chữ nhưng khác giọng hay khác tốc độ là audio khác hẳn. */
function khoaKho(giong, text, rate) {
    return `${giong}|${rate}|${text}`;
}

/** Lấy từ kho, và đẩy lên đầu hàng (vừa dùng = lâu bị đuổi nhất). */
function layKho(khoa) {
    const buf = _kho.get(khoa);
    if (!buf) return null;
    _kho.delete(khoa);
    _kho.set(khoa, buf);
    return buf;
}

/** Cất vào kho, đuổi bản ghi cũ nhất cho tới khi vừa trần. */
function catKho(khoa, buf) {
    // Một bản ghi to hơn cả trần thì cất vào là đuổi sạch mọi thứ khác rồi vẫn
    // tràn — thà không cất.
    if (buf.length > TRAN_KHO) return;

    const cu = _kho.get(khoa);
    if (cu) { _kho.delete(khoa); _coKho -= cu.length; }

    _kho.set(khoa, buf);
    _coKho += buf.length;

    while (_coKho > TRAN_KHO) {
        const cuNhat = _kho.keys().next();
        if (cuNhat.done) break;
        _coKho -= _kho.get(cuNhat.value).length;
        _kho.delete(cuNhat.value);
    }
}

/** Hẹn giờ đóng kết nối đang rỗi. */
function henNghi(giong) {
    const o = _lo.get(giong);
    if (!o) return;
    clearTimeout(o.hen);
    o.hen = setTimeout(() => boKetNoi(giong), NGHI_SAU);
    // Đừng giữ tiến trình sống chỉ vì một hẹn giờ dọn dẹp — `npm test` sẽ treo.
    if (typeof o.hen.unref === 'function') o.hen.unref();
}

/** Đóng và quên một kết nối. */
function boKetNoi(giong) {
    const o = _lo.get(giong);
    if (!o) return;
    clearTimeout(o.hen);
    _lo.delete(giong);
    try { o.tts.close && o.tts.close(); } catch (_) { /* đóng cái đã chết */ }
}

/** Socket này còn dùng được không. */
function conSong(tts) {
    const ws = tts?._ws;
    // Không có `_ws` nghĩa là bản thư viện khác — coi như không dùng lại được,
    // đường chậm vẫn chạy đúng.
    if (!ws) return false;
    const OPEN = ws.OPEN ?? 1;
    return ws.readyState === OPEN;
}

/** Kết nối cho một giọng: dùng lại nếu còn sống, không thì mở mới. */
async function layKetNoi(giong) {
    const o = _lo.get(giong);
    if (o && conSong(o.tts)) return o.tts;
    if (o) boKetNoi(giong);

    const tts = new MsEdgeTTS();
    await tts.setMetadata(giong, DINH_DANG);
    _lo.set(giong, { tts, hen: null });
    henNghi(giong);
    return tts;
}

/** Một lượt tổng hợp trên kết nối cho trước. */
function motLuot(tts, text, rate) {
    return new Promise((resolve, reject) => {
        const { audioStream } = tts.toStream(text, { rate });
        const manh = [];
        audioStream.on('data', (c) => manh.push(c));
        audioStream.on('end', () => resolve(Buffer.concat(manh)));
        audioStream.on('error', reject);
    });
}

/**
 * Audio cho một đoạn chữ. Trả về `{ buffer, tuKho }`.
 *
 * `tuKho` để nơi gọi biết lượt này có tốn công tổng hợp hay không — dùng cho
 * header `X-TTS-Cache`, thứ duy nhất nhìn được từ ngoài để biết kho có chạy.
 */
async function tongHop(giong, text, rate) {
    const khoa = khoaKho(giong, text, rate);

    const san = layKho(khoa);
    if (san) return { buffer: san, tuKho: true };

    let buffer = null;
    try {
        const tts = await layKetNoi(giong);
        buffer = await motLuot(tts, text, rate);
        henNghi(giong);
    } catch (err) {
        logger.warn('TTS: lượt đầu hỏng, thử lại bằng kết nối mới:', err?.message || err);
        buffer = null;
    }

    // Rỗng KHÔNG phải lỗi kỹ thuật mà là dấu hiệu socket chết giữa chừng — thư
    // viện đóng stream bằng `null` chứ không ném. Vứt kết nối rồi thử lại.
    if (!buffer || buffer.length === 0) {
        boKetNoi(giong);
        const tts = await layKetNoi(giong);
        buffer = await motLuot(tts, text, rate);
        henNghi(giong);
    }

    if (buffer && buffer.length > 0) catKho(khoa, buffer);
    return { buffer, tuKho: false };
}

/** Đóng mọi kết nối — cho lúc tắt server và cho test. */
function dongHet() {
    for (const giong of [..._lo.keys()]) boKetNoi(giong);
}

/** Xoá kho — cho test. */
function xoaKho() {
    _kho.clear();
    _coKho = 0;
}

/** Số liệu kho, cho trang admin và cho test. */
function soLieuKho() {
    return { soBanGhi: _kho.size, soByte: _coKho, tran: TRAN_KHO };
}

module.exports = { tongHop, dongHet, xoaKho, soLieuKho, TRAN_KHO, NGHI_SAU, DINH_DANG };
