const { chatCompletion } = require('../config/openai');

/**
 * AI Helper - GPT prompts and logic
 */

/**
 * Explain vocabulary word in detail
 */
exports.explainWord = async (word) => {
    const prompt = `Giải thích từ vựng TOEIC:
${word.en} (${word.vn}) - ${word.type}

Yêu cầu (ngắn gọn):
1. Nghĩa và cách dùng
2. 2 ví dụ + dịch
3. Cụm từ thường gặp
4. Lưu ý cho TOEIC`;

    const messages = [
        { role: 'system', content: 'Bạn là giáo viên TOEIC. Trả lời ngắn gọn bằng tiếng Việt.' },
        { role: 'user', content: prompt },
    ];

    const result = await chatCompletion(messages, {
        maxTokens: 600,
        temperature: 0.7,
        feature: 'explain-word',
    });

    return result;
};

/**
 * Generate practice questions from word
 */
exports.generateQuestions = async (word, questionType = 'multiple-choice', count = 5) => {
    const prompt = `Generate ${count} ${questionType} questions for the following vocabulary word for TOEIC practice:

Word: ${word.en}
Vietnamese: ${word.vn}
Type: ${word.type}

Requirements:
- Questions should be at TOEIC difficulty level
- Include realistic distractors (wrong answers)
- Focus on common TOEIC contexts (business, office, travel)
- Each question should test different aspects (meaning, usage, collocation)

Return ONLY valid JSON array format:
[
  {
    "question": "Choose the correct word to complete the sentence: The company provides _____ for all employees.",
    "options": ["accommodation", "accumulation", "acceleration", "accusation"],
    "correctIndex": 0,
    "explanation": "Brief explanation in Vietnamese"
  }
]`;

    const messages = [
        { role: 'system', content: 'You are a TOEIC test creator. Return ONLY valid JSON, no other text.' },
        { role: 'user', content: prompt },
    ];

    const result = await chatCompletion(messages, {
        maxTokens: 1500,
        temperature: 0.8,
        feature: 'word-questions-generate',
    });

    if (!result.success) {
        return result;
    }

    // Parse JSON response
    try {
        const questions = JSON.parse(result.content);
        return {
            success: true,
            questions,
        };
    } catch (error) {
        return {
            success: false,
            error: 'Failed to parse questions',
        };
    }
};

/**
 * Analyze user's mistakes and provide feedback
 */
exports.analyzeMistakes = async (mistakes) => {
    const mistakesText = mistakes.map(m => 
        `Word: ${m.word} - Your answer: "${m.userAnswer}" - Correct: "${m.correctAnswer}"`
    ).join('\n');

    const prompt = `Analyze these vocabulary mistakes from a TOEIC practice session:

${mistakesText}

Provide:
1. Common patterns in the mistakes
2. Specific tips to avoid these errors
3. Study recommendations
4. Encouragement and motivation

Respond in Vietnamese, be supportive and constructive.`;

    const messages = [
        { role: 'system', content: 'You are a supportive TOEIC tutor who helps students learn from mistakes.' },
        { role: 'user', content: prompt },
    ];

    const result = await chatCompletion(messages, {
        maxTokens: 800,
        temperature: 0.7,
        feature: 'analyze-mistakes',
    });

    return result;
};

/**
 * Create personalized study plan
 */
exports.createStudyPlan = async (userStats, weaknesses) => {
    const prompt = `Create a personalized TOEIC vocabulary study plan based on this profile:

Statistics:
- Total words learned: ${userStats.wordsLearned}
- Accuracy rate: ${userStats.accuracy}%
- Games played: ${userStats.totalGamesPlayed}
- Current streak: ${userStats.currentStreak} days

Weak areas: ${weaknesses.join(', ')}

Provide:
1. Weekly study schedule (specific days and duration)
2. Focus areas to improve
3. Recommended practice modes
4. Realistic goals for next 30 days
5. Motivation tips

Format in Vietnamese, be specific and actionable.`;

    const messages = [
        { role: 'system', content: 'You are an expert TOEIC study planner.' },
        { role: 'user', content: prompt },
    ];

    const result = await chatCompletion(messages, {
        maxTokens: 1000,
        temperature: 0.7,
        feature: 'study-plan',
    });

    return result;
};

/**
 * Chat with AI tutor
 */
exports.chatWithTutor = async (userMessage, conversationHistory = []) => {
    const systemPrompt = `You are a friendly and knowledgeable TOEIC English tutor. Help students with:
- Vocabulary explanations
- Grammar questions
- TOEIC test strategies
- Study tips and motivation
- Practice suggestions

Always respond in Vietnamese unless asked to use English. Be encouraging and patient.`;

    const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: userMessage },
    ];

    const result = await chatCompletion(messages, {
        maxTokens: 500,
        temperature: 0.8,
        feature: 'chat-tutor',
    });

    return result;
};

/**
 * Generate example sentences
 */
exports.generateExamples = async (word, count = 5) => {
    const prompt = `Generate ${count} realistic example sentences using the word "${word.en}" in different TOEIC contexts (business, office, daily life, travel).

For each sentence:
1. Use the word naturally
2. Reflect TOEIC difficulty level
3. Provide Vietnamese translation

Return ONLY valid JSON array:
[
  {
    "en": "The hotel provides comfortable accommodation for business travelers.",
    "vn": "Khách sạn cung cấp chỗ ở thoải mái cho khách du lịch công tác."
  }
]`;

    const messages = [
        { role: 'system', content: 'You are a TOEIC content creator. Return ONLY valid JSON.' },
        { role: 'user', content: prompt },
    ];

    const result = await chatCompletion(messages, {
        maxTokens: 800,
        temperature: 0.8,
        feature: 'generate-examples',
    });

    if (!result.success) {
        return result;
    }

    try {
        const examples = JSON.parse(result.content);
        return {
            success: true,
            examples,
        };
    } catch (error) {
        return {
            success: false,
            error: 'Failed to parse examples',
        };
    }
};

/**
 * Check grammar and suggest corrections
 */
exports.checkGrammar = async (sentence) => {
    const prompt = `Check this English sentence for grammar errors and suggest corrections:

"${sentence}"

Provide:
1. Is it correct? (Yes/No)
2. Errors found (if any)
3. Corrected version (if needed)
4. Explanation in Vietnamese

Return ONLY valid JSON:
{
  "isCorrect": true/false,
  "errors": ["error1", "error2"],
  "corrected": "corrected sentence",
  "explanation": "explanation in Vietnamese"
}`;

    const messages = [
        { role: 'system', content: 'You are an English grammar checker. Return ONLY valid JSON.' },
        { role: 'user', content: prompt },
    ];

    const result = await chatCompletion(messages, {
        maxTokens: 400,
        temperature: 0.3,
        feature: 'check-grammar',
    });

    if (!result.success) {
        return result;
    }

    try {
        const analysis = JSON.parse(result.content);
        return {
            success: true,
            analysis,
        };
    } catch (error) {
        return {
            success: false,
            error: 'Failed to parse analysis',
        };
    }
};

/**
 * Suggest related words
 */
exports.suggestRelatedWords = async (word) => {
    const prompt = `For the word "${word.en}" (${word.vn}), suggest 10 related words that TOEIC learners should know.

Categories to include:
- Synonyms
- Antonyms
- Related concepts
- Common collocations
- Word family (noun, verb, adjective forms)

Return ONLY valid JSON array:
[
  {
    "word": "lodging",
    "vn": "chỗ ở",
    "relation": "synonym",
    "note": "More informal than accommodation"
  }
]`;

    const messages = [
        { role: 'system', content: 'You are a vocabulary expert. Return ONLY valid JSON.' },
        { role: 'user', content: prompt },
    ];

    const result = await chatCompletion(messages, {
        maxTokens: 1000,
        temperature: 0.7,
        feature: 'related-words',
    });

    if (!result.success) {
        return result;
    }

    try {
        const relatedWords = JSON.parse(result.content);
        return {
            success: true,
            relatedWords,
        };
    } catch (error) {
        return {
            success: false,
            error: 'Failed to parse related words',
        };
    }
};

/**
 * Generate flashcards
 */
exports.generateFlashcards = async (words) => {
    const wordsList = words.map(w => `${w.en} - ${w.vn}`).join(', ');

    const prompt = `Create 5 creative flashcard-style study tips for these words: ${wordsList}

Each tip should:
- Use mnemonics or memory tricks
- Be fun and memorable
- Help Vietnamese learners remember
- Include pronunciation tips if helpful

Return ONLY valid JSON array:
[
  {
    "word": "accommodation",
    "tip": "Think of 'A-COM-MOD-ATION': A place that's COMMON and MODERN for staying",
    "mnemonic": "Ghi nhớ: COM (thoải mái) + MODERN (hiện đại)"
  }
]`;

    const messages = [
        { role: 'system', content: 'You are a creative memory teacher. Return ONLY valid JSON.' },
        { role: 'user', content: prompt },
    ];

    const result = await chatCompletion(messages, {
        maxTokens: 800,
        temperature: 0.9,
        feature: 'generate-flashcards',
    });

    if (!result.success) {
        return result;
    }

    try {
        const flashcards = JSON.parse(result.content);
        return {
            success: true,
            flashcards,
        };
    } catch (error) {
        return {
            success: false,
            error: 'Failed to parse flashcards',
        };
    }
};

/**
 * Translate English sentence to Vietnamese
 */
exports.translateSentence = async (sentence) => {
    const prompt = `Translate this English sentence to Vietnamese naturally:

"${sentence}"

Return ONLY the Vietnamese translation, no extra text or explanation.`;

    const messages = [
        { role: 'system', content: 'You are a professional English-Vietnamese translator. Return ONLY the translation.' },
        { role: 'user', content: prompt },
    ];

    const result = await chatCompletion(messages, {
        maxTokens: 200,
        temperature: 0.3,
        feature: 'translate-sentence',
    });

    return result;
};

/**
 * Lookup word information for vocabulary form auto-fill
 * Returns: vn, zh, phonetic, pinyin, type, synonyms, example
 */
exports.lookupWord = async (englishWord) => {
    const prompt = `Provide complete vocabulary information for the English word: "${englishWord}"

Return ONLY valid JSON with this exact structure:
{
  "en": "${englishWord}",
  "vn": "Vietnamese translation (most common meaning)",
  "zh": "Chinese translation (Simplified Chinese)",
  "phonetic": "IPA phonetic transcription (e.g., /əˈkɒmədeɪt/)",
  "pinyin": "Chinese pinyin with tones (e.g., shì yìng)",
  "type": "word type (noun, verb, adjective, adverb, preposition, conjunction, pronoun, interjection, phrase)",
  "synonyms": "comma-separated list of 3-5 synonyms",
  "example": "One natural example sentence using the word"
}

Rules:
- Vietnamese translation should be the most common/useful meaning
- Type must be ONE of: noun, verb, adjective, adverb, preposition, conjunction, pronoun, interjection, phrase
- If word can be multiple types, use the most common one
- Example should be simple and practical
- Return ONLY the JSON, no extra text`;

    const messages = [
        { role: 'system', content: 'You are a multilingual dictionary expert. Return ONLY valid JSON with accurate translations and linguistic information.' },
        { role: 'user', content: prompt },
    ];

    const result = await chatCompletion(messages, {
        maxTokens: 500,
        temperature: 0.3,
        feature: 'vocab-ai-fill',
    });

    if (!result.success) {
        return result;
    }

    try {
        // Clean the response - remove markdown code blocks if present
        let content = result.content.trim();
        if (content.startsWith('```json')) {
            content = content.slice(7);
        }
        if (content.startsWith('```')) {
            content = content.slice(3);
        }
        if (content.endsWith('```')) {
            content = content.slice(0, -3);
        }
        content = content.trim();

        const wordInfo = JSON.parse(content);
        return {
            success: true,
            data: wordInfo,
        };
    } catch (error) {
        console.error('Failed to parse AI response:', result.content);
        return {
            success: false,
            error: 'Failed to parse word information from AI response',
        };
    }
};