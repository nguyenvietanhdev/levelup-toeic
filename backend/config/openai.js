const { OpenAI } = require('openai');
const logger = require('../utils/logger');
const { textCompletion } = require('../services/aiClient');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Test OpenAI connection
 */
const testConnection = async () => {
    try {
        await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Hello!' }],
            max_tokens: 10,
        });
        logger.info('OpenAI API connected successfully');
        return true;
    } catch (error) {
        logger.error('OpenAI API connection failed', { error: error.message });
        return false;
    }
};

/**
 * Chat chữ cho mọi tính năng AI.
 *
 * Đi qua `services/aiClient` để tôn trọng cấu hình nhà cung cấp ở admin và tự
 * chuyển hãng khi hãng đang dùng lỗi. Trước đây hàm này gọi thẳng OpenAI, nên đổi
 * hãng ở admin không ảnh hưởng tới các tính năng chữ (hội thoại, chấm luận...).
 *
 * `options.model` không còn được dùng: tên model thuộc về từng hãng, truyền
 * tên OpenAI cho Gemini sẽ hỏng. Model được chọn ở admin.
 */
const chatCompletion = async (messages, options = {}) => {
    const feature = options.feature || 'unknown';
    try {
        const out = await textCompletion({
            feature,
            messages,
            maxTokens: options.maxTokens || 500,
            temperature: options.temperature ?? 0.7,
            userId: options.userId || null,
        });
        return {
            success: true,
            content: out.text,
            usage: out.usage,
        };
    } catch (error) {
        logger.error('AI chat error', { error: error.message, feature });
        return {
            success: false,
            error: error.message,
        };
    }
};

module.exports = {
    openai,
    testConnection,
    chatCompletion,
};
