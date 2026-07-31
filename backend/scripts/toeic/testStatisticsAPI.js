/**
 * Test Statistics API
 */

require('dotenv').config();
const { connectMongoDB, closeMongoConnection } = require('../config/mongodb');
const mongoose = require('mongoose');

// Import controller
const { getQuestionsStatistics } = require('../controllers/toeicController');

async function testStatisticsAPI() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await connectMongoDB();

        const mockReq = {
            user: {
                id: new mongoose.Types.ObjectId()
            }
        };

        const mockRes = {
            status: function(code) {
                this.statusCode = code;
                return this;
            },
            json: function(data) {
                this.responseData = data;
                console.log('\n📊 Response:');
                console.log(JSON.stringify(data, null, 2));
                return this;
            }
        };

        const mockNext = (error) => {
            console.error('❌ Error:', error.message);
        };

        console.log('🧪 Testing getQuestionsStatistics API...\n');

        await getQuestionsStatistics(mockReq, mockRes, mockNext);

        if (mockRes.responseData?.success) {
            console.log('\n✅ API Test Successful!');
            console.log(`Total Available: ${mockRes.responseData.data.summary.totalAvailable}`);
            console.log(`Progress: ${mockRes.responseData.data.summary.progress}%`);
            console.log(`Can Create Full Test: ${mockRes.responseData.data.summary.canCreateFullTest}`);
        } else {
            console.log('\n❌ API Test Failed');
        }

        await closeMongoConnection();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Fatal Error:', error);
        await closeMongoConnection();
        process.exit(1);
    }
}

testStatisticsAPI();
