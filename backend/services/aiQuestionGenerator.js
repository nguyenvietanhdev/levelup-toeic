const OpenAI = require('openai');
const { logUsage } = require('./aiUsageLogger');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * TOEIC Part configurations and prompts
 */
const PART_CONFIGS = {
    1: {
        name: 'Photographs',
        description: 'Listen to four statements about a photograph and choose the correct one',
        questionType: 'listening-image',
        optionsCount: 4,
        requiresImage: true,
        requiresAudio: true,
    },
    2: {
        name: 'Question-Response',
        description: 'Listen to a question and three responses, choose the best response',
        questionType: 'listening',
        optionsCount: 3,
        requiresAudio: true,
    },
    3: {
        name: 'Conversations',
        description: 'Listen to a conversation and answer questions',
        questionType: 'listening-conversation',
        optionsCount: 4,
        requiresAudio: true,
    },
    4: {
        name: 'Short Talks',
        description: 'Listen to a short talk and answer questions',
        questionType: 'listening-talk',
        optionsCount: 4,
        requiresAudio: true,
    },
    5: {
        name: 'Incomplete Sentences',
        description: 'Choose the word or phrase that best completes the sentence',
        questionType: 'grammar',
        optionsCount: 4,
    },
    6: {
        name: 'Text Completion',
        description: 'Choose the best word or phrase to complete a text',
        questionType: 'grammar-context',
        optionsCount: 4,
    },
    7: {
        name: 'Reading Comprehension',
        description: 'Read a passage and answer questions',
        questionType: 'reading',
        optionsCount: 4,
        requiresPassage: true,
    },
};

/**
 * Generate TOEIC questions using AI
 */
class AIQuestionGenerator {
    /**
     * Generate questions for a specific part
     * @param {number} part - TOEIC part number (1-7)
     * @param {number} count - Number of questions to generate
     * @param {string} difficulty - easy, medium, hard
     * @returns {Promise<Array>} Generated questions
     */
    async generateQuestions(part, count = 5, difficulty = 'medium') {
        const config = PART_CONFIGS[part];
        if (!config) {
            throw new Error(`Invalid TOEIC part: ${part}`);
        }

        console.log(`Generating ${count} questions for Part ${part} (${config.name}) - ${difficulty} difficulty`);

        // Generate questions based on part type
        if (part >= 1 && part <= 4) {
            return this.generateListeningQuestions(part, count, difficulty);
        } else if (part >= 5 && part <= 6) {
            return this.generateGrammarQuestions(part, count, difficulty);
        } else if (part === 7) {
            return this.generateReadingQuestions(count, difficulty);
        }
    }

    /**
     * Generate listening questions (Parts 1-4)
     * Note: This generates question templates. Audio files need to be created separately.
     */
    async generateListeningQuestions(part, count, difficulty) {
        const config = PART_CONFIGS[part];

        const prompt = `Generate ${count} TOEIC Part ${part} questions.

Return a JSON object with a "questions" array containing exactly ${count} question objects.

Example structure:
{
  "questions": [
    {
      "part": ${part},
      "questionText": "Sample question or scenario",
      "audioTranscript": "What would be spoken in audio",
      "options": [
        {"optionLetter": "A", "optionText": "First option", "isCorrect": false},
        {"optionLetter": "B", "optionText": "Second option", "isCorrect": true},
        {"optionLetter": "C", "optionText": "Third option", "isCorrect": false}${config.optionsCount === 4 ? ',\n        {"optionLetter": "D", "optionText": "Fourth option", "isCorrect": false}' : ''}
      ],
      "explanation": "Why the correct answer is right",
      "difficulty": "${difficulty}"
    }
  ]
}

Requirements:
- Part ${part}: ${config.description}
- Each question has ${config.optionsCount} options
- Exactly ONE option per question has "isCorrect": true
- Difficulty level: ${difficulty}
${part === 1 ? '- questionText describes the photograph scenario' : ''}
${part >= 2 ? '- audioTranscript contains the spoken content' : ''}

Generate realistic TOEIC questions following official test format.`;

        try {
            const completion = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a JSON generator for TOEIC questions. You MUST respond with valid JSON array only. No markdown, no code blocks, no explanations. Just the raw JSON array.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                max_tokens: 4000,
                response_format: { type: "json_object" }
            });
            logUsage({ feature: 'toeic-question-generate', model: completion.model, usage: completion.usage });

            const content = completion.choices[0].message.content.trim();

            // Parse JSON response
            let parsedResponse;
            try {
                parsedResponse = JSON.parse(content);
            } catch (parseError) {
                console.error('❌ JSON Parse Error. Raw content:', content.substring(0, 500));
                throw new Error(`Failed to parse AI response as JSON. Error: ${parseError.message}`);
            }

            // Extract questions array from response
            const questions = parsedResponse.questions || parsedResponse;

            if (!Array.isArray(questions)) {
                console.error('❌ Response is not an array:', parsedResponse);
                throw new Error('AI response does not contain a questions array');
            }

            console.log(`✅ Successfully parsed ${questions.length} questions`);

            // Add metadata
            return questions.map(q => ({
                ...q,
                part,
                difficulty,
                isAIGenerated: true,
                needsAudioRecording: true,
                imageDescription: part === 1 ? q.questionText : null,
            }));

        } catch (error) {
            console.error('Error generating listening questions:', error);
            throw new Error(`Failed to generate questions: ${error.message}`);
        }
    }

    /**
     * Generate grammar questions (Parts 5-6)
     */
    async generateGrammarQuestions(part, count, difficulty) {
        const config = PART_CONFIGS[part];
        const isTextCompletion = part === 6;

        const prompt = `Generate ${count} TOEIC Part ${part} questions.

Return a JSON object with a "questions" array containing exactly ${count} question objects.

Example structure:
{
  "questions": [
    {
      "part": ${part},
      "questionText": "${isTextCompletion ? 'Short passage (2-4 sentences) with _____ for the blank' : 'Complete sentence with _____ for the blank'}",
      "questionNumber": 1,
      "options": [
        {"optionLetter": "A", "optionText": "First choice", "isCorrect": false},
        {"optionLetter": "B", "optionText": "Second choice", "isCorrect": true},
        {"optionLetter": "C", "optionText": "Third choice", "isCorrect": false},
        {"optionLetter": "D", "optionText": "Fourth choice", "isCorrect": false}
      ],
      "explanation": "Grammar rule explanation",
      "grammarPoint": "Grammar category (e.g., Present Perfect, Prepositions)",
      "difficulty": "${difficulty}"
    }
  ]
}

Requirements:
- Part ${part}: ${isTextCompletion ? 'Grammar and vocabulary in context with short passages' : 'Grammar, vocabulary, and sentence structure'}
- Topics: business, office, travel, workplace communication
- Test grammar points: verb tenses, prepositions, conjunctions, word forms, vocabulary
- Each question has 4 options (A, B, C, D)
- Exactly ONE option has "isCorrect": true
- Use _____ to mark the blank in questionText
- Difficulty level: ${difficulty}

Generate realistic TOEIC grammar questions.`;

        try {
            const completion = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a JSON generator for TOEIC grammar questions. You MUST respond with valid JSON object only. No markdown, no code blocks, no explanations.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                max_tokens: 4000,
                response_format: { type: "json_object" }
            });
            logUsage({ feature: 'toeic-question-generate', model: completion.model, usage: completion.usage });

            const content = completion.choices[0].message.content.trim();

            // Parse JSON response
            let parsedResponse;
            try {
                parsedResponse = JSON.parse(content);
            } catch (parseError) {
                console.error('❌ JSON Parse Error. Raw content:', content.substring(0, 500));
                throw new Error(`Failed to parse AI response as JSON. Error: ${parseError.message}`);
            }

            // Extract questions array from response
            const questions = parsedResponse.questions || parsedResponse;

            if (!Array.isArray(questions)) {
                console.error('❌ Response is not an array:', parsedResponse);
                throw new Error('AI response does not contain a questions array');
            }

            console.log(`✅ Successfully parsed ${questions.length} questions`);

            return questions.map(q => ({
                ...q,
                part,
                difficulty,
                isAIGenerated: true,
            }));

        } catch (error) {
            console.error('Error generating grammar questions:', error);
            throw new Error(`Failed to generate questions: ${error.message}`);
        }
    }

    /**
     * Generate reading comprehension questions (Part 7)
     */
    async generateReadingQuestions(count, difficulty) {
        // Part 7 typically has passages with 2-5 questions each
        const passageCount = Math.ceil(count / 3); // ~3 questions per passage

        const prompt = `Generate ${passageCount} reading passages for TOEIC Part 7 with approximately ${count} total questions.

Return a JSON object with a "passages" array.

Example structure:
{
  "passages": [
    {
      "passage": "Full text of the reading passage (100-200 words)",
      "passageType": "email",
      "questions": [
        {
          "part": 7,
          "questionText": "What is the main purpose?",
          "questionNumber": 1,
          "options": [
            {"optionLetter": "A", "optionText": "First option", "isCorrect": false},
            {"optionLetter": "B", "optionText": "Second option", "isCorrect": true},
            {"optionLetter": "C", "optionText": "Third option", "isCorrect": false},
            {"optionLetter": "D", "optionText": "Fourth option", "isCorrect": false}
          ],
          "explanation": "Why this is correct",
          "questionType": "main-idea",
          "difficulty": "${difficulty}"
        }
      ]
    }
  ]
}

Requirements:
- Generate ${passageCount} passages
- Each passage: 100-200 words
- Passage types: email, advertisement, article, notice, memo, form
- Topics: business, office, workplace, travel, events
- 2-4 questions per passage (total ~${count} questions)
- Question types: main-idea, detail, inference, vocabulary
- Each question has 4 options (A, B, C, D)
- Exactly ONE option per question has "isCorrect": true
- Difficulty level: ${difficulty}

Generate realistic TOEIC reading passages.`;

        try {
            const completion = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a JSON generator for TOEIC reading passages. You MUST respond with valid JSON object only. No markdown, no code blocks, no explanations.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                max_tokens: 6000,
                response_format: { type: "json_object" }
            });
            logUsage({ feature: 'toeic-reading-generate', model: completion.model, usage: completion.usage });

            const content = completion.choices[0].message.content.trim();

            // Parse JSON response
            let parsedResponse;
            try {
                parsedResponse = JSON.parse(content);
            } catch (parseError) {
                console.error('❌ JSON Parse Error. Raw content:', content.substring(0, 500));
                throw new Error(`Failed to parse AI response as JSON. Error: ${parseError.message}`);
            }

            // Extract passages array from response
            const passages = parsedResponse.passages || parsedResponse;

            if (!Array.isArray(passages)) {
                console.error('❌ Response is not an array:', parsedResponse);
                throw new Error('AI response does not contain a passages array');
            }

            console.log(`✅ Successfully parsed ${passages.length} passages`);

            // Flatten questions and attach passage info
            const allQuestions = [];
            passages.forEach(passage => {
                passage.questions.forEach(q => {
                    allQuestions.push({
                        ...q,
                        part: 7,
                        passage: passage.passage,
                        passageType: passage.passageType,
                        difficulty,
                        isAIGenerated: true,
                    });
                });
            });

            return allQuestions;

        } catch (error) {
            console.error('Error generating reading questions:', error);
            throw new Error(`Failed to generate questions: ${error.message}`);
        }
    }

    /**
     * Generate a full test (200 questions)
     */
    async generateFullTest(difficulty = 'mixed') {
        const partCounts = [
            { part: 1, count: 6 },
            { part: 2, count: 25 },
            { part: 3, count: 39 },
            { part: 4, count: 30 },
            { part: 5, count: 30 },
            { part: 6, count: 16 },
            { part: 7, count: 54 },
        ];

        const allQuestions = [];

        for (const config of partCounts) {
            console.log(`Generating Part ${config.part}: ${config.count} questions...`);

            try {
                const questions = await this.generateQuestions(
                    config.part,
                    config.count,
                    difficulty
                );
                allQuestions.push(...questions);

                // Add delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));

            } catch (error) {
                console.error(`Failed to generate Part ${config.part}:`, error);
                throw error;
            }
        }

        return allQuestions;
    }
}

module.exports = new AIQuestionGenerator();
