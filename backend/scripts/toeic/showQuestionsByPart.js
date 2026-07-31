/**
 * Show Questions Count By Part
 *
 * Displays total available questions for each TOEIC part with detailed breakdown
 */

require('dotenv').config();
const { connectMongoDB, closeMongoConnection } = require('../config/mongodb');
const ToeicQuestion = require('../models/ToeicQuestion');

async function showQuestionsByPart() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await connectMongoDB();

        console.log('\n' + '='.repeat(80));
        console.log('📊 TOEIC QUESTIONS - BREAKDOWN BY PART');
        console.log('='.repeat(80));

        const partNames = {
            1: 'Photographs',
            2: 'Question-Response',
            3: 'Conversations',
            4: 'Talks',
            5: 'Incomplete Sentences',
            6: 'Text Completion',
            7: 'Reading Comprehension'
        };

        const partRequirements = {
            1: 6, 2: 25, 3: 39, 4: 30, 5: 30, 6: 16, 7: 54
        };

        let totalQuestions = 0;
        let totalRequired = 0;
        let canCreateFullTest = true;

        console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
        console.log('│ Part │ Name                    │ Available │ Required │ Status    │ Missing │');
        console.log('├─────────────────────────────────────────────────────────────────────────────┤');

        for (let part = 1; part <= 7; part++) {
            // Count total questions for this part
            const totalCount = await ToeicQuestion.countDocuments({
                part,
                isActive: true,
                isPublished: true,
            });

            // Count by difficulty
            const easyCount = await ToeicQuestion.countDocuments({
                part,
                isActive: true,
                isPublished: true,
                difficulty: 'easy'
            });

            const mediumCount = await ToeicQuestion.countDocuments({
                part,
                isActive: true,
                isPublished: true,
                difficulty: 'medium'
            });

            const hardCount = await ToeicQuestion.countDocuments({
                part,
                isActive: true,
                isPublished: true,
                difficulty: 'hard'
            });

            const required = partRequirements[part];
            const missing = Math.max(0, required - totalCount);
            const canCreate = totalCount >= required;
            const status = canCreate ? '✅ OK    ' : '❌ Need  ';

            totalQuestions += totalCount;
            totalRequired += required;

            if (!canCreate) canCreateFullTest = false;

            const partName = partNames[part].padEnd(23);
            const availableStr = String(totalCount).padStart(9);
            const requiredStr = String(required).padStart(8);
            const missingStr = String(missing).padStart(7);

            console.log(`│  ${part}   │ ${partName} │${availableStr} │${requiredStr} │ ${status} │${missingStr} │`);

            // Show difficulty breakdown
            console.log(`│      │   ├─ Easy: ${String(easyCount).padStart(3)}      │           │          │           │         │`);
            console.log(`│      │   ├─ Medium: ${String(mediumCount).padStart(3)}    │           │          │           │         │`);
            console.log(`│      │   └─ Hard: ${String(hardCount).padStart(3)}      │           │          │           │         │`);

            if (part < 7) {
                console.log('├─────────────────────────────────────────────────────────────────────────────┤');
            }
        }

        console.log('└─────────────────────────────────────────────────────────────────────────────┘');

        // Summary
        console.log('\n' + '='.repeat(80));
        console.log('📊 SUMMARY');
        console.log('='.repeat(80));
        console.log(`Total Available: ${totalQuestions} questions`);
        console.log(`Total Required:  ${totalRequired} questions (for 1 Full Test)`);
        console.log(`Missing:         ${Math.max(0, totalRequired - totalQuestions)} questions`);
        console.log(`Progress:        ${((totalQuestions / totalRequired) * 100).toFixed(1)}%`);

        console.log('\n' + '='.repeat(80));
        console.log('🎯 TEST CREATION STATUS');
        console.log('='.repeat(80));

        if (canCreateFullTest) {
            console.log('✅ Full Test (200 questions): CAN CREATE');
            console.log('   You have enough questions to create unlimited Full Tests!');
        } else {
            console.log('❌ Full Test (200 questions): CANNOT CREATE');
            console.log('   Please add more questions to the parts marked with ❌');
        }

        console.log('\nMini Tests:');
        for (let part = 1; part <= 7; part++) {
            const count = await ToeicQuestion.countDocuments({
                part,
                isActive: true,
                isPublished: true,
            });
            const required = partRequirements[part];
            const canCreate = count >= required;
            const status = canCreate ? '✅ CAN CREATE' : `❌ Need ${required - count} more`;
            console.log(`  Part ${part} (${partNames[part]}): ${status}`);
        }

        // Section breakdown
        console.log('\n' + '='.repeat(80));
        console.log('📚 BY SECTION');
        console.log('='.repeat(80));

        const listeningCount = await ToeicQuestion.countDocuments({
            part: { $in: [1, 2, 3, 4] },
            isActive: true,
            isPublished: true,
        });

        const readingCount = await ToeicQuestion.countDocuments({
            part: { $in: [5, 6, 7] },
            isActive: true,
            isPublished: true,
        });

        console.log(`Listening (Part 1-4): ${listeningCount} questions (need 100 for Full Test)`);
        console.log(`Reading (Part 5-7):   ${readingCount} questions (need 100 for Full Test)`);

        // Recommendations
        if (!canCreateFullTest) {
            console.log('\n' + '='.repeat(80));
            console.log('💡 RECOMMENDATIONS');
            console.log('='.repeat(80));

            const priorities = [];
            for (let part = 1; part <= 7; part++) {
                const count = await ToeicQuestion.countDocuments({
                    part,
                    isActive: true,
                    isPublished: true,
                });
                const required = partRequirements[part];
                if (count < required) {
                    priorities.push({
                        part,
                        name: partNames[part],
                        missing: required - count
                    });
                }
            }

            priorities.sort((a, b) => b.missing - a.missing);

            console.log('\nPriority order (by most needed):');
            priorities.forEach((p, index) => {
                console.log(`  ${index + 1}. Part ${p.part} (${p.name}): Add ${p.missing} questions`);
            });

            console.log('\n💡 Use these methods to add questions:');
            console.log('   • Dashboard → "Add Question" button (manual)');
            console.log('   • Dashboard → "AI Generate" feature (automatic)');
            console.log('   • Import script: scripts/importToeicQuestions.js');
        }

        console.log('\n' + '='.repeat(80));
        await closeMongoConnection();
        console.log('\n✅ Report completed');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Error:', error);
        await closeMongoConnection();
        process.exit(1);
    }
}

showQuestionsByPart();
