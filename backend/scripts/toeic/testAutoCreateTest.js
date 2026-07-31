/**
 * Test Auto-Create Test Feature
 *
 * This tests the new auto-populate logic when creating Full Test and Mini Test
 */

require('dotenv').config();
const { connectMongoDB, closeMongoConnection } = require('../config/mongodb');
const ToeicTest = require('../models/ToeicTest');
const ToeicQuestion = require('../models/ToeicQuestion');

async function testAutoCreateTest() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await connectMongoDB();

        console.log('\n📊 Current question availability:');
        for (let part = 1; part <= 7; part++) {
            const count = await ToeicQuestion.countDocuments({
                part,
                isActive: true,
                isPublished: true,
            });
            const required = { 1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54 }[part];
            const status = count >= required ? '✅' : '❌';
            console.log(`  ${status} Part ${part}: ${count}/${required} questions`);
        }

        // Test 1: Try to create Full Test (should fail with current data)
        console.log('\n🧪 TEST 1: Attempting to create Full Test...');
        try {
            const fullTest = await ToeicTest.createFullTest({
                testName: 'Auto-Generated Full Test',
                description: 'Testing auto-populate feature',
                difficulty: 'mixed',
                createdBy: null,
            });
            console.log('✅ Full Test created successfully!');
            console.log(`   ID: ${fullTest._id}`);
            console.log(`   Questions: ${fullTest.totalQuestions}`);
            console.log(`   Time: ${Math.round(fullTest.totalTime / 60)} minutes`);
        } catch (error) {
            if (error.insufficientParts) {
                console.log('❌ Validation Error (Expected):');
                console.log(`   Missing parts: ${error.insufficientParts.length}`);
                error.insufficientParts.forEach(p => {
                    console.log(`   • Part ${p.part}: Need ${p.required}, have ${p.available} (missing ${p.missing})`);
                });
            } else {
                console.log('❌ Unexpected error:', error.message);
            }
        }

        // Test 2: Try to create Mini Test Part 1 (should succeed)
        console.log('\n🧪 TEST 2: Attempting to create Mini Test Part 1...');
        const part1Count = await ToeicQuestion.countDocuments({
            part: 1,
            isActive: true,
            isPublished: true,
        });

        if (part1Count >= 6) {
            const miniTest = await ToeicTest.create({
                testName: 'Auto-Generated Mini Part 1',
                testType: 'mini-part1',
                description: 'Testing mini test creation',
                parts: [],
                totalQuestions: 0,
                totalTime: 240,
                createdBy: null,
            });

            // Manually populate (simulating controller logic)
            const questions = await ToeicQuestion.getRandomQuestions({
                part: 1,
                count: 6,
                difficulty: 'mixed',
            });

            miniTest.parts = [{
                partNumber: 1,
                questions: questions.map(q => q._id),
                questionsCount: questions.length,
                timeLimit: 240,
            }];
            miniTest.totalQuestions = questions.length;
            await miniTest.save();

            console.log('✅ Mini Test Part 1 created successfully!');
            console.log(`   ID: ${miniTest._id}`);
            console.log(`   Questions: ${miniTest.totalQuestions}`);
            console.log(`   Time: ${Math.round(miniTest.totalTime / 60)} minutes`);

            // Clean up test data
            await ToeicTest.findByIdAndDelete(miniTest._id);
            console.log('   (Test data cleaned up)');
        } else {
            console.log(`❌ Cannot create Mini Test Part 1: Only ${part1Count}/6 questions available`);
        }

        await closeMongoConnection();
        console.log('\n✅ All tests completed');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Fatal Error:', error);
        await closeMongoConnection();
        process.exit(1);
    }
}

testAutoCreateTest();
