const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const UserStats = require('../models/UserStats');
const logger = require('../utils/logger');
const { createUserWithDependents } = require('../utils/userStateHelper');

exports.getAllUsers = async (req, res, next) => {
    try {
        const users = await User.find().select('-password -token').sort({ createdAt: -1 }).lean();
        const userIds = users.map(u => u._id);
        const profiles = await UserProfile.find({ userId: { $in: userIds } }).lean();
        const profileMap = new Map(profiles.map(p => [p.userId.toString(), p]));

        const data = users.map(u => {
            const p = profileMap.get(u._id.toString()) || {};
            return { ...u, username: p.username, avatar: p.avatar, level: p.level };
        });

        res.json({ success: true, count: data.length, data });
    } catch (error) {
        logger.error('Error fetching users:', error);
        next(error);
    }
};

exports.getUserById = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id).select('-password -token').lean();
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const profile = await UserProfile.findOne({ userId: user._id }).lean();
        res.json({ success: true, data: { ...user, username: profile?.username, avatar: profile?.avatar, level: profile?.level } });
    } catch (error) {
        logger.error('Error fetching user:', error);
        next(error);
    }
};

exports.createUser = async (req, res, next) => {
    try {
        const { username, email, password, role = 'user' } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Username, email, and password are required' });
        }

        const [existingEmail, existingProfile] = await Promise.all([
            User.findOne({ email: email.toLowerCase().trim() }),
            UserProfile.findOne({ username: username.trim() }),
        ]);
        if (existingEmail) return res.status(400).json({ success: false, message: 'Email already exists' });
        if (existingProfile) return res.status(400).json({ success: false, message: 'Username already exists' });

        const { user, profile } = await createUserWithDependents({ email, passwordHash: password, username, role });

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: { id: user._id, email: user.email, role: user.role, username: profile.username },
        });
    } catch (error) {
        logger.error('Error creating user:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ success: false, message: Object.values(error.errors).map(e => e.message).join(', ') });
        }
        next(error);
    }
};

exports.updateUser = async (req, res, next) => {
    try {
        const userId = req.params.id;
        const { username, email, password, role, isLocked } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const profile = await UserProfile.findOne({ userId });

        // Update username via UserProfile
        if (username && profile && username !== profile.username) {
            const existing = await UserProfile.findOne({ username, userId: { $ne: userId } });
            if (existing) return res.status(400).json({ success: false, message: 'Username already exists' });
            profile.username = username;
            await profile.save();
        }

        // Update email
        if (email && email !== user.email) {
            const existing = await User.findOne({ email, _id: { $ne: userId } });
            if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });
            user.email = email;
        }

        if (role) user.role = role;
        if (password) user.password = password;

        if (typeof isLocked === 'boolean') {
            user.isLocked = isLocked;
            if (!isLocked) { user.loginAttempts = 0; user.lockUntil = null; }
        }

        await user.save();

        res.json({
            success: true,
            message: 'User updated successfully',
            data: { id: user._id, email: user.email, role: user.role, isLocked: user.isLocked, username: profile?.username },
        });
    } catch (error) {
        logger.error('Error updating user:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ success: false, message: Object.values(error.errors).map(e => e.message).join(', ') });
        }
        next(error);
    }
};

exports.deleteUser = async (req, res, next) => {
    try {
        const userId = req.params.id;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (user.role === 'admin') {
            const adminCount = await User.countDocuments({ role: 'admin' });
            if (adminCount <= 1) return res.status(400).json({ success: false, message: 'Cannot delete the last admin user' });
        }

        await Promise.all([
            User.findByIdAndDelete(userId),
            UserProfile.deleteOne({ userId }),
            UserStats.deleteOne({ userId }),
        ]);

        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        logger.error('Error deleting user:', error);
        next(error);
    }
};
