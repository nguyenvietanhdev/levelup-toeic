/**
 * Check mini tests in database
 */

require('dotenv').config();
const { connectMongoDB, closeMongoConnection } = require('../config/mongodb');
const ToeicTest = require('../models/ToeicTest');
const ToeicQuestion = require('../models/ToeicQuestion');

async function checkTests() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await connectMongoDB();

        // Check all mini tests
        const miniTests = await ToeicTest.find({
            testType: { $regex: 'mini-part' }
        }).populate('parts.questions');

        console.log(`\n📊 Found ${miniTests.length} mini tests:\n`);

        for (const test of miniTests) {
            console.log(`✓ ${test.testName}`);
            console.log(`  Type: ${test.testType}`);
            console.log(`  Questions: ${test.totalQuestions}`);
            console.log(`  Parts: ${test.parts.length}`);

            if (test.parts.length > 0) {
                const part = test.parts[0];
                console.log(`  Questions in part: ${part.questions.length}`);
                console.log(`  Questions count: ${part.questionsCount}`);
            }
            console.log('');
        }

        // Check questions for each part
        console.log('\n📝 Questions by part:');
        for (let i = 1; i <= 7; i++) {
            const count = await ToeicQuestion.countDocuments({ part: i });
            console.log(`  Part ${i}: ${count} questions`);
        }

        await closeMongoConnection();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error);
        await closeMongoConnection();
        process.exit(1);
    }
}

checkTests();
