// routes/test.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const mongoose = require('mongoose');

// TEST API – XEM FRONTEND GỬI GÌ LÊN
router.post('/test-connection', (req, res) => {
    console.log('\n');
    console.log('FRONTEND ĐÃ GỌI THÀNH CÔNG ĐẾN SERVER!');
    console.log('='.repeat(60));
    console.log('Thời gian:', new Date().toLocaleString('vi-VN'));
    console.log('IP:', req.ip || 'unknown');
    console.log('User-Agent:', req.get('User-Agent') || 'unknown');
    console.log('Token:', req.get('Authorization') || 'Không có token');
    console.log('Body gửi lên:', req.body);
    console.log('='.repeat(60));

    res.json({
        success: true,
        message: "KẾT NỐI THÀNH CÔNG! SERVER ĐÃ NHẬN ĐƯỢC DỮ LIỆU TỪ FRONTEND!",
        receivedData: req.body,
        headers: {
            authorization:  req.get('Authorization'),
            userAgent: req.get('User-Agent')
        },
        yourToken: req.get('Authorization')?.split(' ')[1] || null,
        timestamp: new Date().toISOString()
    });
});

// TEST MONGODB ATLAS CONNECTION
router.get('/test-mongodb', async (req, res) => {
    try {
        console.log('\n🔍 TESTING MONGODB ATLAS CONNECTION...');
        console.log('='.repeat(60));

        // 1. Check MongoDB connection status
        const dbState = mongoose.connection.readyState;
        const connectionStatus = {
            0: 'Disconnected',
            1: 'Connected',
            2: 'Connecting',
            3: 'Disconnecting'
        };

        console.log(`📊 MongoDB Status: ${connectionStatus[dbState]}`);
        console.log(`🗄️  Database: ${mongoose.connection.name}`);
        console.log(`🌐 Host: ${mongoose.connection.host}`);

        if (dbState !== 1) {
            return res.status(500).json({
                success: false,
                error: 'MongoDB not connected',
                status: connectionStatus[dbState]
            });
        }

        // 2. Test query - count users
        const userCount = await User.countDocuments();
        console.log(`👥 Total users in database: ${userCount}`);

        // 3. Get sample user data (first user)
        const sampleUser = await User.findOne().select('email role isActive');
        console.log(`📄 Sample user:`, sampleUser);

        console.log('='.repeat(60));
        console.log('✅ MONGODB ATLAS CONNECTION SUCCESSFUL!\n');

        res.json({
            success: true,
            message: '✅ MongoDB Atlas connected successfully!',
            connection: {
                status: connectionStatus[dbState],
                database: mongoose.connection.name,
                host: mongoose.connection.host
            },
            stats: {
                totalUsers: userCount,
                sampleUser: sampleUser ? {
                    email: sampleUser.email,
                    role: sampleUser.role,
                    isActive: sampleUser.isActive
                } : null
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ MONGODB TEST FAILED:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// TEST GET USER FROM MONGODB BY USERNAME (deprecated — username moved to user_profiles)
router.get('/test-get-user/:username', async (req, res) => {
    return res.status(410).json({ success: false, message: 'Deprecated — username is now in user_profiles collection' });
    try {
        const { username } = req.params;

        console.log(`\n🔍 FETCHING USER FROM MONGODB: ${username}`);
        console.log('='.repeat(60));

        const user = await User.findOne({ username }).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found in MongoDB'
            });
        }

        console.log('✅ User found:', user.username);
        console.log('='.repeat(60));

        res.json({
            success: true,
            message: '✅ User retrieved from MongoDB successfully!',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                level: user.level,
                xp: user.xp,
                totalXp: user.totalXp,
                coins: user.coins,
                gems: user.gems,
                energy: user.energy,
                hints: user.hints,
                shields: user.shields,
                timeFreezes: user.timeFreezes,
                streak: {
                    current: user.streakCurrent,
                    longest: user.streakLongest,
                    lastPlayDate: user.streakLastPlayDate
                },
                quests: {
                    daily: user.dailyQuests,
                    lastResetDate: user.questsLastResetDate
                },
                achievements: user.achievements,
                createdAt: user.createdAt
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ GET USER TEST FAILED:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// TEST SAVE DATA TO MONGODB (deprecated — game state now in user_stats collection)
router.post('/test-save-user', async (req, res) => {
    return res.status(410).json({ success: false, message: 'Deprecated — game state is now in user_stats collection' });
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }

        console.log('\n💾 TESTING SAVE USER DATA TO MONGODB...');
        console.log('='.repeat(60));
        console.log(`User ID: ${userId}`);

        // Find user
        const user = await User.findOne({ id: userId });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        console.log('📊 User data BEFORE update:');
        console.log(`  Level: ${user.level}`);
        console.log(`  Coins: ${user.coins}`);
        console.log(`  Gems: ${user.gems}`);

        // Add test data
        user.coins += 100;
        user.gems += 10;

        // Save to MongoDB
        await user.save();

        console.log('📊 User data AFTER update:');
        console.log(`  Level: ${user.level}`);
        console.log(`  Coins: ${user.coins}`);
        console.log(`  Gems: ${user.gems}`);
        console.log('='.repeat(60));
        console.log('✅ SAVE TO MONGODB SUCCESSFUL!\n');

        res.json({
            success: true,
            message: '✅ Data saved to MongoDB successfully!',
            userData: {
                id: user.id,
                username: user.username,
                level: user.level,
                coins: user.coins,
                gems: user.gems
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ SAVE TEST FAILED:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// MIGRATE DATA FROM JSON TO MONGODB (deprecated - use node scripts/migrateAllDataToMongoDB.js)
router.post('/migrate-to-mongodb', async (req, res) => {
    return res.status(410).json({
        success: false,
        message: 'This endpoint is deprecated. Run migration via: node scripts/migrateAllDataToMongoDB.js',
    });

    try {
        console.log('\n🔄 MIGRATING DATA FROM JSON TO MONGODB...');
        console.log('='.repeat(60));

        const jsonUsers = [];

        console.log(`📊 Found ${jsonUsers.length} users in JSON file`);

        let migratedCount = 0;
        let skippedCount = 0;
        let errors = [];

        for (const jsonUser of jsonUsers) {
            try {
                // Check if user already exists in MongoDB
                const existingUser = await User.findOne({
                    $or: [
                        { email: jsonUser.email },
                        { username: jsonUser.username }
                    ]
                });

                if (existingUser) {
                    console.log(`⚠️  Skipping ${jsonUser.username} - already exists in MongoDB`);
                    skippedCount++;
                    continue;
                }

                // Create new user in MongoDB
                // We need to bypass password hashing since JSON passwords are already hashed
                // Use a temporary placeholder that meets validation, then update directly
                const hashedPassword = jsonUser.password;

                const newUser = new User({
                    username: jsonUser.username,
                    email: jsonUser.email,
                    password: 'temp_password_will_be_replaced', // Temporary - will be replaced with hashed password
                    avatar: jsonUser.avatar,
                    role: jsonUser.role || 'user',
                    isActive: jsonUser.isActive !== false,
                    lastLoginAt: jsonUser.lastLoginAt || Date.now(),

                    // Level & XP
                    level: jsonUser.level || 1,
                    xp: jsonUser.xp || 0,
                    totalXp: jsonUser.totalXp || 0,

                    // Resources
                    energy: jsonUser.resources?.energy || jsonUser.energy || 100,
                    maxEnergy: jsonUser.resources?.maxEnergy || jsonUser.maxEnergy || 100,
                    coins: jsonUser.resources?.coins || jsonUser.coins || 0,
                    gems: jsonUser.resources?.gems || jsonUser.gems || 0,
                    hints: jsonUser.resources?.hints || jsonUser.hints || 0,
                    shields: jsonUser.resources?.shields || jsonUser.shields || 0,
                    timeFreezes: jsonUser.resources?.timeFreezes || jsonUser.timeFreezes || 0,
                    lastEnergyUpdate: jsonUser.resources?.lastEnergyUpdate || jsonUser.lastEnergyUpdate || Date.now(),

                    // Streak
                    streakCurrent: jsonUser.streakCurrent || jsonUser.streak?.current || 0,
                    streakLongest: jsonUser.streakLongest || jsonUser.streak?.longest || 0,
                    streakLastPlayDate: jsonUser.streakLastPlayDate || jsonUser.streak?.lastPlayDate || null,
                    streakShieldsUsed: jsonUser.streakShieldsUsed || jsonUser.streak?.shieldsUsed || 0,

                    // Progress
                    wordsLearned: jsonUser.wordsLearned || jsonUser.progress?.wordsLearned || [],
                    wordsMastered: jsonUser.wordsMastered || jsonUser.progress?.wordsMastered || [],
                    totalGamesPlayed: jsonUser.totalGamesPlayed || jsonUser.progress?.totalGamesPlayed || 0,
                    totalCorrectAnswers: jsonUser.totalCorrectAnswers || jsonUser.progress?.totalCorrectAnswers || 0,
                    totalWrongAnswers: jsonUser.totalWrongAnswers || jsonUser.progress?.totalWrongAnswers || 0,
                    perfectRounds: jsonUser.perfectRounds || jsonUser.progress?.perfectRounds || 0,
                    highestScore: jsonUser.highestScore || jsonUser.progress?.highestScore || 0,
                    totalPlayTime: jsonUser.totalPlayTime || jsonUser.progress?.totalPlayTime || 0,

                    // Mode Stats
                    modeStats: jsonUser.modeStats || jsonUser.progress?.modeStats || {
                        'multiple-choice': { played: 0, score: 0, correct: 0, total: 0 },
                        'fill-blank': { played: 0, score: 0, correct: 0, total: 0 },
                        'listening': { played: 0, score: 0, correct: 0, total: 0 },
                        'matching': { played: 0, score: 0, correct: 0, total: 0 },
                        'word-scramble': { played: 0, score: 0, correct: 0, total: 0 },
                        'speed-quiz': { played: 0, score: 0, correct: 0, total: 0 },
                    },

                    // Practice History
                    practiceHistory: jsonUser.practiceHistory || [],

                    // Quests - Transform nested reward structure to flat
                    dailyQuests: (jsonUser.dailyQuests || jsonUser.quests?.daily || []).map(quest => ({
                        id: quest.id,
                        name: quest.name,
                        description: quest.description,
                        icon: quest.icon,
                        type: quest.type,
                        mode: quest.mode || '',
                        target: quest.target,
                        progress: quest.progress || 0,
                        rewardCoins: quest.reward?.coins || quest.rewardCoins || 0,
                        rewardXp: quest.reward?.xp || quest.rewardXp || 0,
                        completed: quest.completed || false,
                    })),
                    questsLastResetDate: jsonUser.questsLastResetDate || jsonUser.quests?.lastResetDate || null,

                    // Achievements
                    achievements: jsonUser.achievements || [],

                    // Boosts
                    xpBoostActive: jsonUser.xpBoostActive || false,
                    xpBoostMultiplier: jsonUser.xpBoostMultiplier || 1,
                    xpBoostExpiresAt: jsonUser.xpBoostExpiresAt || null,
                    coinsBoostActive: jsonUser.coinsBoostActive || false,
                    coinsBoostMultiplier: jsonUser.coinsBoostMultiplier || 1,
                    coinsBoostExpiresAt: jsonUser.coinsBoostExpiresAt || null,

                    // Settings
                    randomQuestions: jsonUser.randomQuestions !== undefined ? jsonUser.randomQuestions : false,
                    soundEnabled: jsonUser.soundEnabled !== undefined ? jsonUser.soundEnabled : true,
                    soundEffects: jsonUser.soundEffects !== undefined ? jsonUser.soundEffects : true,
                    volume: jsonUser.volume || 70,
                    autoPronunciation: jsonUser.autoPronunciation || false,
                    notificationsEnabled: jsonUser.notificationsEnabled !== undefined ? jsonUser.notificationsEnabled : true,
                    questionsPerSession: jsonUser.questionsPerSession || 10,
                    timePerQuestion: jsonUser.timePerQuestion || 30,
                    difficulty: jsonUser.difficulty || 'medium',
                    autoSync: jsonUser.autoSync !== undefined ? jsonUser.autoSync : true,

                    // Timestamps
                    createdAt: jsonUser.createdAt || Date.now(),
                    updatedAt: jsonUser.updatedAt || Date.now(),
                });

                // IMPORTANT: Set the already-hashed password directly to bypass hashing middleware
                // We need to use $set to update the password field directly in the database
                await newUser.save();

                // Now update the password directly without triggering the pre-save hook
                await User.updateOne(
                    { _id: newUser._id },
                    { $set: { password: hashedPassword } }
                );
                console.log(`✅ Migrated user: ${jsonUser.username}`);
                migratedCount++;

            } catch (userError) {
                console.error(`❌ Error migrating user ${jsonUser.username}:`, userError.message);
                errors.push({
                    username: jsonUser.username,
                    error: userError.message
                });
            }
        }

        console.log('='.repeat(60));
        console.log(`✅ Migration completed!`);
        console.log(`   Migrated: ${migratedCount}`);
        console.log(`   Skipped: ${skippedCount}`);
        console.log(`   Errors: ${errors.length}`);
        console.log('='.repeat(60));

        res.json({
            success: true,
            message: 'Migration completed successfully',
            stats: {
                total: jsonUsers.length,
                migrated: migratedCount,
                skipped: skippedCount,
                errors: errors.length
            },
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('❌ MIGRATION FAILED:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

module.exports = router;