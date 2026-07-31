const { OpenAI } = require('openai');
const logger = require('../utils/logger');
const { logUsage } = require('../services/aiUsageLogger');

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
 * Generate chat completion
 */
const chatCompletion = async (messages, options = {}) => {
    const model = options.model || process.env.OPENAI_MODEL || 'gpt-4';
    const feature = options.feature || 'unknown';
    const userId = options.userId || null;
    try {
        const response = await openai.chat.completions.create({
            model,
            messages,
            max_tokens: options.maxTokens || 500,
            temperature: options.temperature || 0.7,
        });

        const usage = response.usage;
        logger.debug('OpenAI token usage', {
            model, feature,
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
        });
        // Ghi log usage vào DB cho tab Token Management.
        logUsage({ userId, feature, model, usage, success: true });

        return {
            success: true,
            content: response.choices[0].message.content,
            usage: response.usage,
        };
    } catch (error) {
        logger.error('OpenAI API error', { error: error.message, feature });
        logUsage({ userId, feature, model, usage: {}, success: false });
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
