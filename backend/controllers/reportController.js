const Report = require('../models/Report');
const UserProfile = require('../models/UserProfile');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// ── Multer config: save to public/uploads/reports ──
const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'reports');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `report-${Date.now()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
        if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Chỉ cho phép ảnh JPEG, PNG, GIF, WEBP'));
    },
});

// ── Submit a report (user-facing) ──
exports.submitReport = [
    (req, res, next) => upload.single('image')(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, message: err.message });
        next();
    }),
    async (req, res, next) => {
        try {
            const { content } = req.body;
            if (!content || content.trim().length < 5) {
                return res.status(400).json({ success: false, message: 'Nội dung báo cáo quá ngắn' });
            }

            const imageUrl = req.file
                ? `/uploads/reports/${req.file.filename}`
                : null;

            const userId = req.user?.id || req.user?._id || null;
            let username = 'Ẩn danh';
            if (userId) {
                const profile = await UserProfile.findOne({ userId }).select('username').lean();
                if (profile?.username) username = profile.username;
            }
            const report = await Report.create({
                userId,
                username,
                content:  content.trim(),
                imageUrl,
            });

            res.json({ success: true, message: 'Báo cáo đã được gửi thành công', data: report });
        } catch (err) {
            logger.error('submitReport error:', err);
            next(err);
        }
    },
];

// ── List reports (admin) ──
exports.listReports = async (req, res, next) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page)  || 1);
        const limit  = Math.min(50, parseInt(req.query.limit) || 20);
        const status = req.query.status || '';

        const filter = status ? { status } : {};
        const total  = await Report.countDocuments(filter);
        const reports = await Report.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        res.json({
            success: true,
            data: reports,
            pagination: { total, page, limit, pages: Math.ceil(total / limit) },
        });
    } catch (err) {
        next(err);
    }
};

// ── Update report status / add admin note (admin) ──
exports.updateReport = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, adminNote } = req.body;

        const update = {};
        if (status) update.status = status;
        if (adminNote !== undefined) update.adminNote = adminNote;

        const report = await Report.findByIdAndUpdate(id, update, { new: true });
        if (!report) return res.status(404).json({ success: false, message: 'Không tìm thấy báo cáo' });

        res.json({ success: true, data: report });
    } catch (err) {
        next(err);
    }
};

// ── Delete a report (admin) ──
exports.deleteReport = async (req, res, next) => {
    try {
        const report = await Report.findByIdAndDelete(req.params.id);
        if (!report) return res.status(404).json({ success: false, message: 'Không tìm thấy báo cáo' });

        // Remove uploaded image if exists
        if (report.imageUrl) {
            const imgPath = path.join(__dirname, '..', 'public', report.imageUrl);
            fs.unlink(imgPath, () => {});
        }

        res.json({ success: true, message: 'Đã xóa báo cáo' });
    } catch (err) {
        next(err);
    }
};

// ── Delete ALL reports (admin) ──
exports.deleteAllReports = async (_req, res) => {
    try {
        const reports = await Report.find({ imageUrl: { $ne: null } }, 'imageUrl').lean();
        reports.forEach(r => {
            const imgPath = path.join(__dirname, '..', 'public', r.imageUrl);
            fs.unlink(imgPath, () => {});
        });
        await Report.deleteMany({});
        res.json({ success: true, message: 'Đã xóa tất cả báo cáo' });
    } catch (err) {
        next(err);
    }
};

// ── Summary stats (admin) ──
exports.reportStats = async (_req, res) => {
    try {
        const [total, pending, reviewed, resolved, dismissed] = await Promise.all([
            Report.countDocuments(),
            Report.countDocuments({ status: 'pending' }),
            Report.countDocuments({ status: 'reviewed' }),
            Report.countDocuments({ status: 'resolved' }),
            Report.countDocuments({ status: 'dismissed' }),
        ]);
        res.json({ success: true, data: { total, pending, reviewed, resolved, dismissed } });
    } catch (err) {
        next(err);
    }
};
