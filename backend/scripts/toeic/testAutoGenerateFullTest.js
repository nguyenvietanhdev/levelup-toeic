/**
 * Test Auto Generate Full Test
 *
 * This tests the automatic Full Test generation feature
 */

require('dotenv').config();
const { connectMongoDB, closeMongoConnection } = require('../config/mongodb');
const ToeicTest = require('../models/ToeicTest');
const ToeicQuestion = require('../models/ToeicQuestion'); // Must require to register schema

async function testAutoGenerate() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await connectMongoDB();

        console.log('\n🧪 Testing Auto Generate Full Test...\n');

        const test = await ToeicTest.createFullTest({
            testName: 'Auto-Generated Test #001',
            description: 'First auto-generated full TOEIC test with 200 questions',
            difficulty: 'mixed',
            createdBy: '6936ecbcb9657bbcc9133505', // Admin ID
            isPublished: false
        });

        console.log('✅ SUCCESS! Full Test Created:\n');
        console.log('═'.repeat(80));
        console.log('Test ID:', test._id);
        console.log('Test Name:', test.testName);
        console.log('Total Questions:', test.totalQuestions);
        console.log('Total Time:', test.totalTime, 'seconds (' + Math.round(test.totalTime / 60) + ' minutes)');
        console.log('Is Published:', test.isPublished);
        console.log('Difficulty:', test.difficulty);

        console.log('\n📋 Parts breakdown:');
        console.log('─'.repeat(80));
        test.parts.forEach(p => {
            console.log(`  Part ${p.partNumber}: ${p.questionsCount} questions (${Math.round(p.timeLimit / 60)} min) - ${p.questions.length} IDs saved`);
        });

        console.log('\n' + '═'.repeat(80));
        console.log('✅ Full Test Auto-Generation Working Perfectly!');
        console.log('═'.repeat(80));

        await closeMongoConnection();
        console.log('\n✅ Test completed');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.insufficientParts) {
            console.log('\n⚠️  Insufficient Parts:');
            console.table(error.insufficientParts);
        }
        await closeMongoConnection();
        process.exit(1);
    }
}

testAutoGenerate();
