const FeatureUnlock = require('../models/FeatureUnlock');
const UserProfile = require('../models/UserProfile');
const { getGameConfig } = require('./gameConfig');

/**
 * Cơ chế khoá theo Level có đang bật không (công tắc tổng ở GameConfig).
 * Tắt = mở hết cho mọi người.
 *
 * Mặc định BẬT khi có sự cố: thiếu trường trong config cũ, hoặc đọc config lỗi,
 * đều trả true. Một lần mất kết nối DB không được phép mở toang mọi tính năng —
 * hỏng thì phải khoá, không phải mở.
 */
async function lockingEnabled() {
    try {
        const cfg = await getGameConfig();
        return cfg?.featureUnlockEnabled !== false;
    } catch {
        return true;
    }
}

// Cache 30s: mốc mở khoá đổi rất ít, tránh truy DB mỗi request.
let _cache = null;
let _at = 0;

async function getUnlocks() {
    if (_cache && Date.now() - _at < 30000) return _cache;
    _cache = await FeatureUnlock.find({ isActive: true }).lean();
    _at = Date.now();
    return _cache;
}

function clearUnlockCache() { _cache = null; _at = 0; }

/** Level yêu cầu của 1 key (0 = không khoá). */
async function requiredLevelFor(key) {
    const list = await getUnlocks();
    return list.find(u => u.key === key)?.requiredLevel || 0;
}

async function getUserLevel(userId) {
    const p = await UserProfile.findOne({ userId }).select('level').lean();
    return p?.level || 1;
}

/**
 * Middleware chặn theo level. `keyOf` là string hoặc hàm (req) → key
 * (dùng khi key phụ thuộc body, vd mode luyện tập).
 * Chỉ chặn khi mốc đang bật (isActive) — tắt ở admin là mở cho mọi người.
 */
function requireLevel(keyOf) {
    return async (req, res, next) => {
        try {
            // Tài khoản ngoại lệ: full tính năng, không xét Level.
            if (req.user?.bypassFeatureLock) return next();

            // Công tắc tổng tắt → mở hết cho mọi người.
            if (!(await lockingEnabled())) return next();

            const key = typeof keyOf === 'function' ? keyOf(req) : keyOf;
            if (!key) return next();

            const need = await requiredLevelFor(key);
            if (need <= 1) return next(); // không khoá

            const level = await getUserLevel(req.user.id);
            if (level >= need) return next();

            return res.status(403).json({
                success: false,
                locked: true,
                requiredLevel: need,
                currentLevel: level,
                message: `Tính năng này mở ở Level ${need}. Bạn đang ở Level ${level}.`,
            });
        } catch (err) { next(err); }
    };
}

module.exports = { getUnlocks, clearUnlockCache, requiredLevelFor, requireLevel, lockingEnabled };
