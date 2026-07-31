/**
 * Test Create Full Test Validation
 *
 * This script tests if the validation works when trying to create a Full Test
 * with insufficient questions.
 */

require('dotenv').config();
const { connectMongoDB, closeMongoConnection } = require('../config/mongodb');
const ToeicTest = require('../models/ToeicTest');
const ToeicQuestion = require('../models/ToeicQuestion');

async function testCreateFullTest() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await connectMongoDB();

        console.log('\n📊 Checking available questions by part...');
        for (let part = 1; part <= 7; part++) {
            const count = await ToeicQuestion.countDocuments({
                part,
                isActive: true,
                isPublished: true,
            });
            console.log(`  Part ${part}: ${count} questions`);
        }

        console.log('\n🧪 Attempting to create Full Test...\n');

        try {
            const test = await ToeicTest.createFullTest({
                testName: 'Test Validation',
                description: 'Testing validation logic',
                difficulty: 'mixed',
                createdBy: null,
            });

            console.log('✅ Test created successfully!');
            console.log('Test ID:', test._id);
            console.log('Total Questions:', test.totalQuestions);
        } catch (error) {
            console.log('❌ Validation Error (Expected):\n');
            console.log(error.message);

            if (error.insufficientParts) {
                console.log('\n📋 Insufficient Parts Details:');
                console.table(error.insufficientParts);
            }
        }

        await closeMongoConnection();
        console.log('\n✅ Test completed');
        process.exit(0);

    } catch (error) {
        console.error('❌ Fatal Error:', error);
        await closeMongoConnection();
        process.exit(1);
    }
}

testCreateFullTest();
