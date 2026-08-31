// ===================================
// TTS ROUTES - Text-to-Speech (Microsoft Edge Neural Voices)
// ===================================
// Phiên bản STREAM — không ghi cache file mp3 ra disk (trước đây phát sinh
// rác trong public/tts-cache mỗi lần user sai/đúng). Audio được pipe trực
// tiếp về client với Content-Type: audio/mpeg, frontend nhận blob rồi
// URL.createObjectURL → revoke sau khi phát xong.

const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const crypto = require('crypto');
const { tongHop } = require('../services/ttsEngine');

// TOEIC voice map - neural voices (female + male)
const VOICE_MAP = {
    // English — Female
    'en-us-f':  'en-US-AriaNeural',           // American female
    'en-gb-f':  'en-GB-SoniaNeural',          // British female
    'en-au-f':  'en-AU-NatashaNeural',        // Australian female
    'en-ca-f':  'en-CA-ClaraNeural',          // Canadian female
    // English — Male
    'en-us-m':  'en-US-GuyNeural',            // American male
    'en-gb-m':  'en-GB-RyanNeural',           // British male
    'en-au-m':  'en-AU-WilliamNeural',        // Australian male
    'en-ca-m':  'en-CA-LiamNeural',           // Canadian male
    // English — backward compat aliases (random = mix nam+nữ)
    'en-us': 'en-US-AriaNeural',
    'en-gb': 'en-GB-SoniaNeural',
    'en-au': 'en-AU-NatashaNeural',
    'en-ca': 'en-CA-ClaraNeural',
    // Chinese — Female
    'zh-cn-xiaoxiao': 'zh-CN-XiaoxiaoNeural',
    'zh-cn-xiaoyi':   'zh-CN-XiaoyiNeural',
    'zh-tw':          'zh-TW-HsiaoChenNeural',
    // Chinese — Male
    'zh-cn-yunxi':    'zh-CN-YunxiNeural',
    'zh-cn-yunyang':  'zh-CN-YunyangNeural',
    'zh-tw-m':        'zh-TW-YunJheNeural',
    // Chinese — Random
    'zh-cn-random':   null,
    // Vietnamese — dùng khi ĐẢO CHIỀU (hỏi bằng nghĩa tiếng Việt).
    //
    // Trước đây đảo chiều là mất hẳn nút loa: mặt trước thành tiếng Việt mà hệ
    // thống chỉ có giọng Anh/Trung, đọc ra thì sai hẳn. Có giọng Việt rồi thì
    // chiều nào cũng nghe được.
    'vi-vn-f':        'vi-VN-HoaiMyNeural',
    'vi-vn-m':        'vi-VN-NamMinhNeural',
    'vi-vn':          'vi-VN-HoaiMyNeural',
    'vi-random':      null,
    // Vietnamese — giọng ĐA NGÔN NGỮ.
    //
    // Edge TTS chỉ có ĐÚNG HAI giọng `vi-VN` trên tổng 322 giọng (đã liệt kê
    // bằng `getVoices()`), nên muốn thêm lựa chọn thì phải mượn nhóm
    // `*MultilingualNeural` — chúng đọc được nhiều thứ tiếng, tiếng Việt trong
    // số đó.
    //
    // Không đoán mò là chúng "đọc được": đo ĐỘ DÀI audio trên ba câu tiếng
    // Việt, lấy hai giọng bản địa làm mốc. Giọng đa ngôn ngữ ra −3% đến −7% —
    // tức là đọc trôi chảy. Giọng thường (Aria, Guy, Sonia, Xiaoxiao) ra +8%
    // đến +27%: dài hơn hẳn vì phải đánh vần từng âm theo lối chữ Latin. Hai
    // nhóm tách bạch rõ, không có ca nào ở giữa.
    //
    // Bốn giọng dưới đây là bốn giọng sát mốc bản địa nhất trong nhóm đó.
    'vi-multi-emma':      'en-US-EmmaMultilingualNeural',
    'vi-multi-seraphina': 'de-DE-SeraphinaMultilingualNeural',
    'vi-multi-andrew':    'en-US-AndrewMultilingualNeural',
    'vi-multi-brian':     'en-US-BrianMultilingualNeural',
};

/**
 * Trình duyệt được giữ audio bao lâu (giây).
 *
 * Cùng chữ + cùng giọng + cùng tốc độ thì audio KHÔNG bao giờ đổi — cả ba đều
 * nằm trong URL, nên không có ca "nội dung mới ở địa chỉ cũ". Vì vậy `immutable`
 * là đúng chứ không phải liều: nó bảo trình duyệt đừng cả hỏi lại.
 *
 * Bản cũ đặt `no-store`, nghĩa là bấm nghe lại đúng từ vừa nghe cũng phải đi
 * hết một vòng mạng và một lượt tổng hợp.
 */
const GIU_CACHE = 7 * 24 * 60 * 60;

/**
 * Chọn giọng cho các mã `*-random`: theo CHÍNH ĐOẠN CHỮ, không phải `Math.random`.
 *
 * Vẫn trộn giọng như trước — hai từ khác nhau vẫn rơi vào hai giọng khác nhau,
 * đó là điểm của chế độ này. Nhưng CÙNG một từ thì lần nào cũng ra cùng giọng,
 * và đó là điều kiện để cả kho nhớ lẫn cache trình duyệt có tác dụng: bốc ngẫu
 * nhiên mỗi lượt thì mỗi lượt là một audio khác, không có gì dùng lại được.
 *
 * Ổn định còn dễ chịu hơn khi học: một từ luôn nghe bằng một giọng, thay vì
 * đổi người đọc mỗi lần bấm nghe lại.
 */
function chonGiong(danhSach, text) {
    const bam = crypto.createHash('sha1').update(String(text)).digest();
    return danhSach[bam[0] % danhSach.length];
}

/**
 * GET /api/tts?text=hello&lang=en-us&rate=1
 * Collect toàn bộ audio rồi gửi với Content-Length — tránh ERR_REQUEST_RANGE_NOT_SATISFIABLE
 * khi Audio element cố range-request trên blob URL từ chunked stream.
 */
router.get('/', async (req, res) => {
    try {
        const { text, lang = 'en-us', rate: rawRate = '1' } = req.query;
        if (!text) return res.status(400).json({ error: 'Missing text parameter' });

        const rate = Math.min(2, Math.max(0.5, parseFloat(rawRate) || 1));
        let voiceName;
        if (lang === 'zh-cn-random') {
            voiceName = chonGiong(['zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoyiNeural', 'zh-CN-YunxiNeural', 'zh-CN-YunyangNeural'], text);
        } else if (lang === 'vi-random') {
            // "Tự động" chỉ bốc trong hai giọng BẢN ĐỊA. Người chọn "tự động"
            // muốn đổi giọng cho đỡ chán, không phải muốn thử nghiệm — giọng đa
            // ngôn ngữ là thứ phải tự chọn thì mới nhận được.
            voiceName = chonGiong(['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural'], text);
        } else if (lang === 'en-random') {
            voiceName = chonGiong([
                'en-US-AriaNeural', 'en-US-GuyNeural',
                'en-GB-SoniaNeural', 'en-GB-RyanNeural',
                'en-AU-NatashaNeural', 'en-AU-WilliamNeural',
                'en-CA-ClaraNeural',
            ], text);
        } else {
            voiceName = VOICE_MAP[lang] || VOICE_MAP['en-us'];
        }

        // ETag tính từ CHÍNH yêu cầu, không phải từ audio.
        //
        // Nhờ vậy trả lời được `If-None-Match` mà KHÔNG phải tổng hợp trước rồi
        // mới biết có nên gửi hay không — tính xong là biết ngay, đúng mục đích
        // của 304. Ba thứ quyết định audio (giọng, tốc độ, chữ) đều có trong đó.
        const etag = `"${crypto.createHash('sha1')
            .update(`${voiceName}|${rate}|${text}`).digest('hex')}"`;

        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', `public, max-age=${GIU_CACHE}, immutable`);

        if (req.headers['if-none-match'] === etag) return res.status(304).end();

        const { buffer, tuKho } = await tongHop(voiceName, text, rate);
        if (!buffer || !buffer.length) return res.status(500).json({ error: 'TTS returned empty audio' });

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Accept-Ranges', 'bytes');
        // Chỉ để nhìn được kho có chạy không — không có header này thì phải đoán
        // qua thời gian phản hồi.
        res.setHeader('X-TTS-Cache', tuKho ? 'HIT' : 'MISS');
        res.end(buffer);
    } catch (err) {
        logger.error('TTS error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'TTS generation failed' });
    }
});

module.exports = router;
