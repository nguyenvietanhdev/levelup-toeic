/**
 * Fix Missing audioText for Listening Parts
 *
 * This script adds audioText to Part 1 and Part 2 questions that don't have it
 */

require('dotenv').config();
const { connectMongoDB, closeMongoConnection } = require('../config/mongodb');
const ToeicQuestion = require('../models/ToeicQuestion');

async function fixAudioText() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await connectMongoDB();

        console.log('\n' + '='.repeat(80));
        console.log('🔧 FIXING MISSING AUDIOTEXT FOR LISTENING PARTS');
        console.log('='.repeat(80));

        let totalFixed = 0;

        // Fix Part 1 - Use questionText as audioText
        console.log('\n📝 Part 1 (Photographs):');
        const part1Questions = await ToeicQuestion.find({
            part: 1,
            isActive: true,
            isPublished: true,
            $or: [
                { audioText: { $exists: false } },
                { audioText: '' }
            ]
        });

        for (const q of part1Questions) {
            // Use questionText as audioText for Part 1
            const audioText = q.questionText || `Look at the photograph. What do you see? (Question ${q.questionNumber})`;
            await ToeicQuestion.updateOne(
                { _id: q._id },
                { $set: { audioText } }
            );
            totalFixed++;
        }
        console.log(`   ✅ Fixed ${part1Questions.length} questions`);

        // Fix Part 2 - Use questionText as audioText
        console.log('\n📝 Part 2 (Question-Response):');
        const part2Questions = await ToeicQuestion.find({
            part: 2,
            isActive: true,
            isPublished: true,
            $or: [
                { audioText: { $exists: false } },
                { audioText: '' }
            ]
        });

        for (const q of part2Questions) {
            // Use questionText as audioText for Part 2
            const audioText = q.questionText || `Listen to the question. (Question ${q.questionNumber})`;
            await ToeicQuestion.updateOne(
                { _id: q._id },
                { $set: { audioText } }
            );
            totalFixed++;
        }
        console.log(`   ✅ Fixed ${part2Questions.length} questions`);

        console.log('\n' + '='.repeat(80));
        console.log('📊 SUMMARY');
        console.log('='.repeat(80));
        console.log(`Total questions fixed: ${totalFixed}`);

        // Verify
        console.log('\n📊 Verification:');
        for (let part = 1; part <= 4; part++) {
            const withAudio = await ToeicQuestion.countDocuments({
                part,
                isActive: true,
                isPublished: true,
                audioText: { $exists: true, $ne: '' }
            });
            const total = await ToeicQuestion.countDocuments({
                part,
                isActive: true,
                isPublished: true
            });
            console.log(`   Part ${part}: ${withAudio}/${total} questions have audioText ${withAudio === total ? '✅' : '❌'}`);
        }

        console.log('\n' + '='.repeat(80));
        await closeMongoConnection();
        console.log('✅ Script completed');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Error:', error);
        await closeMongoConnection();
        process.exit(1);
    }
}

fixAudioText();
