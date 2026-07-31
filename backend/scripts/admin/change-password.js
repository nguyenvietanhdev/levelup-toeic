// Script to change user password
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');
require('dotenv').config();

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isActive: { type: Boolean, default: true }
});

const User = mongoose.model('User', userSchema);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function changePassword() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Ask for username
        const username = await question('Enter username: ');

        if (!username) {
            console.log('❌ Username is required');
            process.exit(1);
        }

        // Find user
        const user = await User.findOne({ username });

        if (!user) {
            console.log(`❌ User "${username}" not found`);
            process.exit(1);
        }

        console.log(`\n✅ User found:`);
        console.log(`   Username: ${user.username}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Role: ${user.role}\n`);

        // Ask for new password
        const newPassword = await question('Enter new password (min 6 characters): ');

        if (!newPassword || newPassword.length < 6) {
            console.log('❌ Password must be at least 6 characters');
            process.exit(1);
        }

        // Confirm password
        const confirmPassword = await question('Confirm new password: ');

        if (newPassword !== confirmPassword) {
            console.log('❌ Passwords do not match');
            process.exit(1);
        }

        // Hash and save new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        user.password = hashedPassword;
        await user.save();

        console.log('');
        console.log('╔═══════════════════════════════════════════════════════╗');
        console.log('║           ✅ PASSWORD CHANGED SUCCESSFULLY            ║');
        console.log('╠═══════════════════════════════════════════════════════╣');
        console.log(`║  Username: ${user.username.padEnd(43)} ║`);
        console.log(`║  New password has been set                            ║`);
        console.log('╚═══════════════════════════════════════════════════════╝');
        console.log('');

        rl.close();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error changing password:', error);
        rl.close();
        process.exit(1);
    }
}

changePassword();
