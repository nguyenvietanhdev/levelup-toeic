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
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

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
};

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
            const zhVoices = ['zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoyiNeural', 'zh-CN-YunxiNeural', 'zh-CN-YunyangNeural'];
            voiceName = zhVoices[Math.floor(Math.random() * zhVoices.length)];
        } else if (lang === 'en-random') {
            const enVoices = [
                'en-US-AriaNeural', 'en-US-GuyNeural',
                'en-GB-SoniaNeural', 'en-GB-RyanNeural',
                'en-AU-NatashaNeural', 'en-AU-WilliamNeural',
                'en-CA-ClaraNeural',
            ];
            voiceName = enVoices[Math.floor(Math.random() * enVoices.length)];
        } else {
            voiceName = VOICE_MAP[lang] || VOICE_MAP['en-us'];
        }

        const tts = new MsEdgeTTS();
        await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

        const { audioStream } = tts.toStream(text, { rate });

        // Collect tất cả chunks trước khi gửi — đảm bảo Content-Length chính xác
        // để browser không dùng range request khi phát từ blob URL.
        const chunks = [];
        await new Promise((resolve, reject) => {
            audioStream.on('data', (chunk) => chunks.push(chunk));
            audioStream.on('end', resolve);
            audioStream.on('error', reject);
        });
        try { tts.close && tts.close(); } catch (_) {}

        const buffer = Buffer.concat(chunks);
        if (!buffer.length) return res.status(500).json({ error: 'TTS returned empty audio' });

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-store');
        res.end(buffer);
    } catch (err) {
        logger.error('TTS error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'TTS generation failed' });
    }
});

module.exports = router;
