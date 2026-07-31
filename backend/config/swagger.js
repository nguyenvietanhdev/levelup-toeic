const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'LevelUp TOEIC API',
            version: '1.0.0',
            description: `
## LevelUp TOEIC — Vocabulary Learning & Practice API

Nền tảng học từ vựng và luyện thi TOEIC tích hợp:
- **12 chế độ luyện tập** (Flashcard, Multiple Choice, Listening, Matching...)
- **Hệ thống thi TOEIC 7 Part** đầy đủ
- **Gamification**: XP, Level, Streak, Coins, Achievements
- **AI**: Giải thích từ, sinh câu hỏi, kiểm tra ngữ pháp
- **Spaced Repetition** (SM-2 algorithm)

### Authentication
Hầu hết các endpoint yêu cầu **Bearer Token** (JWT).
Lấy token từ \`POST /api/auth/login\` rồi truyền vào header:
\`Authorization: Bearer <token>\`
            `,
            contact: {
                name: 'LevelUp TOEIC',
            },
        },
        servers: [
            {
                url: `http://localhost:${process.env.PORT || 5000}`,
                description: 'Local Development',
            },
            {
                url: 'https://your-app.onrender.com',
                description: 'Production (Render)',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT token từ /api/auth/login',
                },
            },
            schemas: {
                // ── Auth ──────────────────────────────────────────────
                LoginRequest: {
                    type: 'object',
                    required: ['identifier', 'password'],
                    properties: {
                        identifier: { type: 'string', example: 'admin', description: 'Username hoặc email' },
                        password:   { type: 'string', format: 'password', example: 'Admin@123' },
                    },
                },
                AuthResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        token:   { type: 'string', example: 'eyJhbGci...' },
                        user:    { $ref: '#/components/schemas/UserPublic' },
                    },
                },
                UserPublic: {
                    type: 'object',
                    properties: {
                        _id:      { type: 'string', example: '64a1b2c3d4e5f6789abc' },
                        username: { type: 'string', example: 'john_doe' },
                        email:    { type: 'string', example: 'john@example.com' },
                        avatar:   { type: 'string', example: 'avatar1' },
                        role:     { type: 'string', enum: ['user', 'admin'], example: 'user' },
                        level:    { type: 'integer', example: 5 },
                        xp:       { type: 'integer', example: 1200 },
                        coins:    { type: 'integer', example: 350 },
                        streakCurrent: { type: 'integer', example: 7 },
                    },
                },
                // ── Vocabulary ────────────────────────────────────────
                VocabularyItem: {
                    type: 'object',
                    properties: {
                        _id:      { type: 'string' },
                        en:       { type: 'string', example: 'efficiency' },
                        vn:       { type: 'string', example: 'hiệu quả' },
                        phonetic: { type: 'string', example: '/ɪˈfɪʃənsi/' },
                        type:     { type: 'string', example: 'noun' },
                        part:     { type: 'string', example: 'ETS24T10-P5' },
                        synonyms: { type: 'string', example: 'productivity, effectiveness' },
                        example:  { type: 'string', example: 'The new system improved work efficiency.' },
                        image:    { type: 'string', example: 'assets/pages/efficiency.jpg' },
                        difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                    },
                },
                VocabularyListResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        count:   { type: 'integer' },
                        total:   { type: 'integer' },
                        page:    { type: 'integer' },
                        limit:   { type: 'integer' },
                        data:    { type: 'array', items: { $ref: '#/components/schemas/VocabularyItem' } },
                    },
                },
                // ── Practice ──────────────────────────────────────────
                PracticeStartRequest: {
                    type: 'object',
                    required: ['mode'],
                    properties: {
                        mode:           { type: 'string', enum: ['flashcard','multiple-choice','fill-blank','listening','matching','word-scramble','speed-quiz','synonym-check','word-type','example-based','context-learning','listening-spelling'], example: 'multiple-choice' },
                        questionsCount: { type: 'integer', example: 10, default: 10 },
                        part:           { type: 'string', example: 'ETS24T10-P5', description: 'Lọc theo part (optional)' },
                        difficulty:     { type: 'string', enum: ['easy','medium','hard'], description: 'Lọc theo độ khó (optional)' },
                    },
                },
                PracticeSubmitRequest: {
                    type: 'object',
                    required: ['sessionId','answers','duration'],
                    properties: {
                        sessionId:      { type: 'string' },
                        answers:        { type: 'array', items: { type: 'object', properties: { wordId: { type: 'string' }, userAnswer: { type: 'string' }, isCorrect: { type: 'boolean' }, timeSpent: { type: 'integer' } } } },
                        duration:       { type: 'integer', description: 'Thời gian làm bài (giây)', example: 120 },
                        xpEarned:       { type: 'integer', example: 50 },
                        coinsEarned:    { type: 'integer', example: 10 },
                    },
                },
                // ── Error ─────────────────────────────────────────────
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string', example: 'Unauthorized' },
                    },
                },
            },
        },
        security: [{ bearerAuth: [] }],
        tags: [
            { name: 'Auth',       description: 'Xác thực & quản lý tài khoản' },
            { name: 'Vocabulary', description: 'Từ vựng TOEIC' },
            { name: 'Practice',   description: 'Luyện tập từ vựng (12 chế độ)' },
            { name: 'TOEIC Test', description: 'Hệ thống thi TOEIC 7 Part' },
            { name: 'AI',         description: 'Tính năng AI (giải thích, dịch, sinh câu hỏi)' },
            { name: 'User State', description: 'Game state: XP, coins, streaks, quests' },
            { name: 'Leaderboard',description: 'Bảng xếp hạng' },
            { name: 'Wrong Words',description: 'Spaced repetition — từ sai cần ôn' },
            { name: 'Reports',    description: 'Báo cáo lỗi & phản hồi' },
            { name: 'Admin',      description: 'Metrics & quản trị hệ thống' },
        ],
    },
    apis: [
        path.join(__dirname, '../routes/*.js'),
    ],
};

module.exports = swaggerJsdoc(options);
