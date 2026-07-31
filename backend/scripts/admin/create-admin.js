require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ADMIN_EMAIL = 'admin@toeicgame.com';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Load models after connecting
    const User = require('../../models/User');
    const UserProfile = require('../../models/UserProfile');
    const UserStats = require('../../models/UserStats');

    // Check by email
    let user = await User.findOne({ email: ADMIN_EMAIL });

    if (user) {
        // Reset password + ensure admin role
        user.password = ADMIN_PASSWORD;
        user.role = 'admin';
        user.isActive = true;
        await user.save(); // pre-save hook hashes the password
        console.log('Admin already exists — password reset to:', ADMIN_PASSWORD);
    } else {
        // Create user
        user = await User.create({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' });

        // Create profile + stats
        await Promise.all([
            UserProfile.create({ userId: user._id, username: ADMIN_USERNAME, avatar: 'A', level: 99 }),
            UserStats.create({ userId: user._id, coins: 999999, gems: 999999, energy: 100 }),
        ]);

        console.log('Admin created successfully!');
    }

    console.log('');
    console.log('╔══════════════════════════════════════╗');
    console.log('║        ADMIN ACCOUNT READY           ║');
    console.log('╠══════════════════════════════════════╣');
    console.log(`║  Email:    ${ADMIN_EMAIL.padEnd(26)}║`);
    console.log(`║  Username: ${ADMIN_USERNAME.padEnd(26)}║`);
    console.log(`║  Password: ${ADMIN_PASSWORD.padEnd(26)}║`);
    console.log('╚══════════════════════════════════════╝');

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
