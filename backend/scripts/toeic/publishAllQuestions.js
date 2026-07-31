/**
 * Publish All TOEIC Questions
 *
 * Sets isPublished = true and isActive = true for all questions
 */

require('dotenv').config();
const { connectMongoDB, closeMongoConnection } = require('../config/mongodb');
const ToeicQuestion = require('../models/ToeicQuestion');

async function publishAllQuestions() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await connectMongoDB();

        console.log('📝 Finding unpublished questions...');
        const unpublishedCount = await ToeicQuestion.countDocuments({
            $or: [
                { isPublished: { $ne: true } },
                { isActive: { $ne: true } }
            ]
        });

        console.log(`Found ${unpublishedCount} questions that need publishing`);

        if (unpublishedCount === 0) {
            console.log('✅ All questions are already published!');
            await closeMongoConnection();
            process.exit(0);
        }

        console.log('🔄 Publishing all questions...');
        const result = await ToeicQuestion.updateMany(
            {},
            {
                $set: {
                    isPublished: true,
                    isActive: true
                }
            }
        );

        console.log(`✅ Updated ${result.modifiedCount} questions`);

        // Show stats by part
        console.log('\n📊 Questions by Part:');
        for (let part = 1; part <= 7; part++) {
            const count = await ToeicQuestion.countDocuments({
                part,
                isPublished: true,
                isActive: true
            });
            console.log(`  Part ${part}: ${count} questions`);
        }

        const totalPublished = await ToeicQuestion.countDocuments({
            isPublished: true,
            isActive: true
        });
        console.log(`\n✅ Total published questions: ${totalPublished}`);

        await closeMongoConnection();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error);
        await closeMongoConnection();
        process.exit(1);
    }
}

publishAllQuestions();
