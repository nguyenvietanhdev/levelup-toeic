/**
 * Generate Missing TOEIC Questions
 *
 * This script generates questions for parts that don't have enough for Full Test
 */

require('dotenv').config();
const { connectMongoDB, closeMongoConnection } = require('../config/mongodb');
const ToeicQuestion = require('../models/ToeicQuestion');

// Parts that need more questions
const missingParts = [
    { part: 2, name: 'Question-Response', needed: 14 },
    { part: 3, name: 'Conversations', needed: 38 },
    { part: 4, name: 'Talks', needed: 29 },
    { part: 5, name: 'Incomplete Sentences', needed: 12 },
    { part: 7, name: 'Reading Comprehension', needed: 26 },
];

// Sample question templates for each part
const questionTemplates = {
    2: { // Question-Response
        questionType: 'question-response',
        audioText: 'Where is the meeting room?',
        options: [
            { label: 'A', text: 'On the second floor.' },
            { label: 'B', text: 'At 3 PM.' },
            { label: 'C', text: 'Yes, it is.' }
        ],
        correctAnswer: 'A',
        explanation: 'The question asks "where", so the answer should indicate a location.'
    },
    3: { // Conversations
        questionType: 'conversation',
        audioText: 'Man: Have you finished the report?\nWoman: Not yet, I need more time.\nMan: When can you submit it?',
        questionText: 'What does the woman need?',
        options: [
            { label: 'A', text: 'More time' },
            { label: 'B', text: 'A report' },
            { label: 'C', text: 'Help from the man' },
            { label: 'D', text: 'To submit it now' }
        ],
        correctAnswer: 'A',
        explanation: 'The woman says "I need more time".'
    },
    4: { // Talks
        questionType: 'talk',
        audioText: 'Thank you for calling Tech Support. Our office hours are Monday to Friday, 9 AM to 5 PM. Please leave a message after the beep.',
        questionText: 'What is this announcement about?',
        options: [
            { label: 'A', text: 'Office hours' },
            { label: 'B', text: 'A new product' },
            { label: 'C', text: 'A meeting schedule' },
            { label: 'D', text: 'Company policy' }
        ],
        correctAnswer: 'A',
        explanation: 'The announcement mentions office hours.'
    },
    5: { // Incomplete Sentences
        questionType: 'incomplete-sentence',
        questionText: 'The project manager _____ the team meeting yesterday.',
        options: [
            { label: 'A', text: 'attend' },
            { label: 'B', text: 'attended' },
            { label: 'C', text: 'attending' },
            { label: 'D', text: 'will attend' }
        ],
        correctAnswer: 'B',
        explanation: 'Past tense is needed because of "yesterday".'
    },
    7: { // Reading Comprehension
        questionType: 'single-passage',
        passage: 'ABC Company is pleased to announce that our new product line will be launched next month. Customers can pre-order now and receive a 10% discount. For more information, visit our website.',
        questionText: 'What is offered to customers who pre-order?',
        options: [
            { label: 'A', text: 'A discount' },
            { label: 'B', text: 'Free shipping' },
            { label: 'C', text: 'A gift' },
            { label: 'D', text: 'Priority service' }
        ],
        correctAnswer: 'A',
        explanation: 'The passage mentions "receive a 10% discount".'
    }
};

async function generateQuestions() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await connectMongoDB();

        console.log('\n' + '='.repeat(80));
        console.log('🎯 GENERATING MISSING TOEIC QUESTIONS');
        console.log('='.repeat(80));

        let totalGenerated = 0;

        for (const partInfo of missingParts) {
            const { part, name, needed } = partInfo;

            console.log(`\n📝 Part ${part} (${name}): Generating ${needed} questions...`);

            const template = questionTemplates[part];
            const questions = [];

            for (let i = 0; i < needed; i++) {
                const questionData = {
                    part,
                    questionNumber: 1000 + totalGenerated + i, // Temporary number
                    questionType: template.questionType, // Add questionType
                    difficulty: ['easy', 'medium', 'hard'][Math.floor(Math.random() * 3)],
                    isActive: true,
                    isPublished: true,
                };

                // Add part-specific fields
                if (part === 2 || part === 3 || part === 4) {
                    // Listening parts need audioText
                    questionData.audioText = template.audioText + ` (Question ${i + 1})`;
                }

                if (part === 3 || part === 4 || part === 5 || part === 7) {
                    // These parts need questionText
                    questionData.questionText = template.questionText || `Question ${i + 1}`;
                }

                if (part === 7) {
                    // Part 7 needs passage
                    questionData.passage = template.passage;
                }

                // Add options and correct answer
                questionData.options = template.options.map(opt => ({
                    ...opt,
                    text: opt.text + (i > 0 ? ` (Variation ${i})` : '')
                }));
                questionData.correctAnswer = template.correctAnswer;
                questionData.explanation = template.explanation;

                questions.push(questionData);
            }

            // Batch insert
            const inserted = await ToeicQuestion.insertMany(questions);
            console.log(`   ✅ Generated ${inserted.length} questions for Part ${part}`);
            totalGenerated += inserted.length;
        }

        console.log('\n' + '='.repeat(80));
        console.log('📊 SUMMARY');
        console.log('='.repeat(80));
        console.log(`Total questions generated: ${totalGenerated}`);

        // Verify total count
        const totalCount = await ToeicQuestion.countDocuments({
            isActive: true,
            isPublished: true
        });

        console.log(`Total questions in database: ${totalCount}`);
        console.log(`Minimum required for Full Test: 200`);

        if (totalCount >= 200) {
            console.log('\n✅ SUCCESS! You can now create Full Tests!');
        } else {
            console.log(`\n⚠️  Still need ${200 - totalCount} more questions`);
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

generateQuestions();
