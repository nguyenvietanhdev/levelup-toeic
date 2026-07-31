require('dotenv').config();
const mongoose = require('mongoose');
const ToeicQuestion = require('../models/ToeicQuestion');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/toeic-game');

async function checkQuestions() {
    try {
        console.log('📊 Question Count by Part:\n');

        for (let i = 1; i <= 7; i++) {
            const count = await ToeicQuestion.countDocuments({
                part: i,
                isActive: true,
                isPublished: true
            });

            const required = i === 1 ? 6 : i === 2 ? 25 : i === 3 ? 39 : i === 4 ? 30 : i === 5 ? 30 : i === 6 ? 16 : 54;
            const status = count >= required ? '✅' : '❌';

            console.log(`${status} Part ${i}: ${count}/${required} questions`);
        }

        const total = await ToeicQuestion.countDocuments({
            isActive: true,
            isPublished: true
        });

        console.log(`\nTotal: ${total}/200 questions needed for full test`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

checkQuestions();
