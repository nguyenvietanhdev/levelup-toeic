/**
 * Script to generate reading/grammar questions (Parts 5, 6, 7) using AI
 * These parts don't require audio, so they're ready to use immediately!
 *
 * Run: node scripts/generateReadingQuestions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const aiGenerator = require('../services/aiQuestionGenerator');
const ToeicQuestion = require('../models/ToeicQuestion');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/toeic-game');

async function generateAndSaveQuestions() {
    try {
        console.log('🚀 Starting AI question generation for Parts 5, 6, 7...\n');

        const partsConfig = [
            { part: 5, count: 30, name: 'Incomplete Sentences' },
            { part: 6, count: 16, name: 'Text Completion' },
            { part: 7, count: 54, name: 'Reading Comprehension' },
        ];

        let totalGenerated = 0;

        for (const config of partsConfig) {
            console.log(`\n📝 Generating Part ${config.part}: ${config.name}`);
            console.log(`   Target: ${config.count} questions`);
            console.log(`   ⏳ Please wait...`);

            try {
                // Generate questions
                const questions = await aiGenerator.generateQuestions(
                    config.part,
                    config.count,
                    'medium'
                );

                console.log(`   ✅ Generated ${questions.length} questions`);

                // Save to database
                let savedCount = 0;
                for (let i = 0; i < questions.length; i++) {
                    const qData = questions[i];

                    // Map questionType to schema enum
                    let questionType;
                    if (qData.part === 5) {
                        questionType = 'incomplete-sentence';
                    } else if (qData.part === 6) {
                        questionType = 'text-completion';
                    } else if (qData.part === 7) {
                        questionType = 'single-passage';
                    }

                    // Transform options from AI format to DB format
                    const transformedOptions = qData.options.map(opt => ({
                        label: opt.optionLetter,
                        text: opt.optionText,
                        isCorrect: opt.isCorrect
                    }));

                    const questionToSave = {
                        part: qData.part,
                        questionNumber: i + 1,
                        questionText: qData.questionText,
                        questionType: questionType,
                        difficulty: qData.difficulty,
                        options: transformedOptions,
                        correctAnswer: qData.options.find(opt => opt.isCorrect)?.optionLetter || 'A',
                        explanation: qData.explanation,
                        grammarPoint: qData.grammarPoint || null,
                        topic: qData.grammarPoint || qData.passageType || 'general',
                        audioScript: qData.audioTranscript || null,
                        passage: qData.passage || null,
                        passageType: qData.passageType || null,
                        tags: ['ai-generated', 'reading-grammar'],
                        isPublished: true,
                        isActive: true,
                        createdBy: null,
                    };

                    try {
                        await ToeicQuestion.create(questionToSave);
                        savedCount++;
                    } catch (saveError) {
                        console.error(`   ❌ Error saving question: ${saveError.message}`);
                    }
                }

                console.log(`   💾 Saved ${savedCount}/${questions.length} questions to database`);
                totalGenerated += savedCount;

                // Delay to avoid rate limiting
                if (config.part < 7) {
                    console.log(`   ⏱️  Waiting 3 seconds before next part...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }

            } catch (error) {
                console.error(`   ❌ Failed to generate Part ${config.part}:`, error.message);
            }
        }

        console.log('\n\n🎉 ============================================');
        console.log(`✅ COMPLETE! Generated ${totalGenerated} questions total`);
        console.log('============================================\n');

        console.log('📊 Summary:');
        const part5Count = await ToeicQuestion.countDocuments({ part: 5 });
        const part6Count = await ToeicQuestion.countDocuments({ part: 6 });
        const part7Count = await ToeicQuestion.countDocuments({ part: 7 });

        console.log(`   Part 5: ${part5Count} questions`);
        console.log(`   Part 6: ${part6Count} questions`);
        console.log(`   Part 7: ${part7Count} questions`);
        console.log(`   Total:  ${part5Count + part6Count + part7Count} questions\n`);

        console.log('✨ You can now generate mini tests for Parts 5, 6, 7!');
        console.log('💡 To generate full test (200 questions), generate Parts 1-4 too.\n');

    } catch (error) {
        console.error('\n❌ Fatal error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('📡 Database connection closed');
        process.exit(0);
    }
}

// Run the script
generateAndSaveQuestions();
