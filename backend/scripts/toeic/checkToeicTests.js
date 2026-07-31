/**
 * Quick script to check TOEIC tests in database
 */

require('dotenv').config();
const { connectMongoDB, closeMongoConnection } = require('../config/mongodb');
const ToeicTest = require('../models/ToeicTest');

async function checkTests() {
    try {
        await connectMongoDB();

        console.log('📊 Checking ToeicTest collection...');
        console.log('Collection name:', ToeicTest.collection.collectionName);

        const count = await ToeicTest.countDocuments();
        console.log('Total tests:', count);

        const tests = await ToeicTest.find({}).select('testName testType totalQuestions');
        console.log('\nTests found:');
        tests.forEach(test => {
            console.log(`- ${test.testName} (${test.testType}): ${test.totalQuestions} câu`);
        });

        await closeMongoConnection();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error);
        await closeMongoConnection();
        process.exit(1);
    }
}

checkTests();
