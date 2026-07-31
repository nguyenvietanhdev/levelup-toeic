/**
 * Test Create Test API Directly
 *
 * This simulates what the frontend does when creating a test
 */

require('dotenv').config();
const { connectMongoDB, closeMongoConnection } = require('../config/mongodb');
const mongoose = require('mongoose');

// Import controller function
const { createTest } = require('../controllers/toeicController');

async function testCreateTestAPI() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await connectMongoDB();

        // Simulate authenticated admin user
        const mockReq = {
            body: {
                testName: 'Test API Direct Call',
                testType: 'mini-part1',
                totalTime: 240,
                difficulty: 'mixed',
                description: 'Testing API'
            },
            user: {
                id: new mongoose.Types.ObjectId() // Mock admin user ID
            }
        };

        const mockRes = {
            status: function(code) {
                this.statusCode = code;
                return this;
            },
            json: function(data) {
                this.responseData = data;
                return this;
            }
        };

        const mockNext = (error) => {
            console.error('❌ Error passed to next():', error.message);
            mockRes.status(500).json({
                success: false,
                message: error.message
            });
        };

        console.log('\n🧪 Testing createTest API...');
        console.log('Request Body:', mockReq.body);

        await createTest(mockReq, mockRes, mockNext);

        console.log('\n📊 Response:');
        console.log('Status Code:', mockRes.statusCode);
        console.log('Response Data:', JSON.stringify(mockRes.responseData, null, 2));

        if (mockRes.responseData?.success) {
            console.log('\n✅ API Test Successful!');
            console.log(`Created test with ${mockRes.responseData.data.totalQuestions} questions`);

            // Clean up test data
            const ToeicTest = require('../models/ToeicTest');
            await ToeicTest.findByIdAndDelete(mockRes.responseData.data._id);
            console.log('(Test data cleaned up)');
        } else {
            console.log('\n❌ API Test Failed');
            if (mockRes.responseData?.insufficientParts) {
                console.log('\nInsufficient Parts:');
                console.table(mockRes.responseData.insufficientParts);
            }
        }

        await closeMongoConnection();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Fatal Error:', error);
        await closeMongoConnection();
        process.exit(1);
    }
}

testCreateTestAPI();
