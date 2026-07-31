/**
 * Script to create TOEIC tests from existing questions
 */

require('dotenv').config();
const { connectMongoDB, closeMongoConnection } = require('../config/mongodb');
const ToeicQuestion = require('../models/ToeicQuestion');
const ToeicTest = require('../models/ToeicTest');

async function createTests() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await connectMongoDB();

        console.log('\n📊 Fetching existing questions...');
        const allQuestions = await ToeicQuestion.find({});
        console.log(`Found ${allQuestions.length} questions`);

        // Group questions by part
        const questionsByPart = {};
        for (let i = 1; i <= 7; i++) {
            questionsByPart[i] = allQuestions.filter(q => q.part === i);
            console.log(`Part ${i}: ${questionsByPart[i].length} questions`);
        }

        // Delete existing tests
        console.log('\n🗑️  Removing existing tests...');
        await ToeicTest.deleteMany({});

        const testsToCreate = [];

        // Create mini tests for each part (if enough questions)
        console.log('\n📝 Creating mini tests...');
        for (let partNum = 1; partNum <= 7; partNum++) {
            const questions = questionsByPart[partNum];

            if (questions.length > 0) {
                const partConfig = getPartConfig(partNum);

                testsToCreate.push({
                    testType: `mini-part${partNum}`,
                    testName: `Part ${partNum} Mini Test - ${partConfig.name}`,
                    description: `Luyện tập Part ${partNum}: ${partConfig.description}`,
                    parts: [{
                        partNumber: partNum,
                        questions: questions.map(q => q._id),
                        questionsCount: questions.length,
                        timeLimit: questions.length * 60 // 1 minute per question
                    }],
                    totalQuestions: questions.length,
                    totalTime: questions.length * 60,
                    difficulty: 'mixed',
                    requireLevel: 1,
                    coinsRequired: 0,
                    isPublished: true
                });
            }
        }

        // Create a full test if we have enough questions
        const totalQuestions = allQuestions.length;
        if (totalQuestions >= 10) {
            console.log('\n📚 Creating full test...');

            const fullTestParts = [];
            for (let partNum = 1; partNum <= 7; partNum++) {
                const questions = questionsByPart[partNum];
                if (questions.length > 0) {
                    const partConfig = getPartConfig(partNum);
                    fullTestParts.push({
                        partNumber: partNum,
                        questions: questions.map(q => q._id),
                        questionsCount: questions.length,
                        timeLimit: partConfig.timeLimit
                    });
                }
            }

            testsToCreate.push({
                testType: 'full-test',
                testName: 'TOEIC Practice Test - Sample',
                description: `Bài thi TOEIC đầy đủ với ${totalQuestions} câu hỏi`,
                parts: fullTestParts,
                totalQuestions: totalQuestions,
                totalTime: 7200, // 2 hours
                difficulty: 'mixed',
                requireLevel: 1,
                coinsRequired: 0,
                isPublished: true
            });
        }

        // Insert all tests
        if (testsToCreate.length > 0) {
            console.log(`\n✅ Creating ${testsToCreate.length} tests...`);
            const created = await ToeicTest.insertMany(testsToCreate);

            console.log('\n🎉 Tests created successfully!');
            created.forEach(test => {
                console.log(`  ✓ ${test.testName} (${test.totalQuestions} câu)`);
            });
        } else {
            console.log('\n⚠️  No tests created. Need more questions in database.');
        }

        console.log('\n✅ Done!');
        await closeMongoConnection();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error);
        await closeMongoConnection();
        process.exit(1);
    }
}

function getPartConfig(partNum) {
    const configs = {
        1: {
            name: 'Photographs',
            description: 'Mô tả hình ảnh',
            timeLimit: 360 // 6 minutes for 6 questions
        },
        2: {
            name: 'Question-Response',
            description: 'Hỏi đáp',
            timeLimit: 1500 // 25 minutes for 25 questions
        },
        3: {
            name: 'Conversations',
            description: 'Hội thoại',
            timeLimit: 1170 // 19.5 minutes for 39 questions (13 conversations)
        },
        4: {
            name: 'Talks',
            description: 'Bài nói chuyện',
            timeLimit: 1380 // 23 minutes for 30 questions (10 talks)
        },
        5: {
            name: 'Incomplete Sentences',
            description: 'Hoàn thành câu',
            timeLimit: 900 // 15 minutes for 30 questions
        },
        6: {
            name: 'Text Completion',
            description: 'Hoàn thành đoạn văn',
            timeLimit: 480 // 8 minutes for 16 questions
        },
        7: {
            name: 'Reading Comprehension',
            description: 'Đọc hiểu',
            timeLimit: 3300 // 55 minutes for 54 questions
        }
    };

    return configs[partNum] || { name: 'Unknown', description: 'Unknown', timeLimit: 600 };
}

// Run the script
createTests();
