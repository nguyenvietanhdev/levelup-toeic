const UserUpload = require('../models/UserUpload');
const User = require('../models/User');
const UserStats = require('../models/UserStats');
const { logTxn } = require('../utils/economyLog');
const { getGameConfig } = require('../services/gameConfig');

// Private uploads: user picks retention at upload time.
const ALLOWED_RETENTION_DAYS = [3, 7, 14, 30];
const DEFAULT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Days until a private source is considered "expiring soon" (force export).
const EXPIRY_WARN_DAYS = 3;

// Giới hạn từ vựng riêng & phí gia hạn: đọc từ GameConfig (admin chỉnh được).

/** Resolve a valid retention (in days) from the request, fallback to default. */
function resolveRetentionDays(raw) {
  const n = parseInt(raw, 10);
  return ALLOWED_RETENTION_DAYS.includes(n) ? n : DEFAULT_RETENTION_DAYS;
}

const lower = (s) => (s == null ? '' : String(s).trim().toLowerCase());
const upper = (s) => (s == null ? '' : String(s).trim().toUpperCase());
const capFirst = (s) => {
  if (!s) return '';
  const trimmed = String(s).trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

// GET /api/upload/check
// Permission gating disabled — all authenticated users can upload.
exports.checkPermission = async (req, res, next) => {
  res.json({
    success: true,
    hasPermission: true,
    limit: 100,
    status: 'active',
  });
};

// POST /api/upload/vocabulary - save a single vocab entry as PRIVATE doc
exports.uploadVocabulary = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userDoc = await User.findById(userId).select('email').lean();
    const email = userDoc?.email;
    const {
      en, vn, phonetic, part, synonyms,
      type, image, example, level, source, retentionDays
    } = req.body;

    if (!en || !String(en).trim()) {
      return res.status(400).json({ success: false, message: 'English is required' });
    }
    if (!part || !String(part).trim()) {
      return res.status(400).json({ success: false, message: 'Part is required' });
    }
    if (!source || !String(source).trim()) {
      return res.status(400).json({ success: false, message: 'Source is required' });
    }

    const enL = lower(en);
    const sourceL = lower(source);

    // Upsert theo (ownerEmail + source + en): trùng thì cập nhật đè dữ liệu mới
    // (bổ sung field còn thiếu), không tạo bản ghi trùng.
    const filter = { ownerEmail: email, source: sourceL, en: enL };
    const existing = await UserUpload.findOne(filter).select('_id').lean();

    // Chặn khi vượt giới hạn (chỉ tính lúc thêm từ MỚI, update không tính).
    if (!existing) {
      const MAX_UPLOAD_WORDS = (await getGameConfig()).maxUploadWords;
      const count = await UserUpload.countDocuments({ ownerEmail: email });
      if (count >= MAX_UPLOAD_WORDS) {
        return res.status(400).json({
          success: false, limitReached: true,
          message: `Đã đạt giới hạn ${MAX_UPLOAD_WORDS} từ vựng riêng. Hãy xoá bớt (hoặc xuất file) trước khi thêm.`,
        });
      }
    }

    const doc = await UserUpload.findOneAndUpdate(
      filter,
      {
        $set: {
          en: enL,
          vn: lower(vn),
          phonetic: lower(phonetic),
          part: upper(part),
          synonyms: lower(synonyms),
          type: lower(type),
          image: lower(image),
          example: capFirst(example),
          level: upper(level),
          source: sourceL,
          ownerId: userId,
          ownerEmail: email,
          expiresAt: new Date(Date.now() + resolveRetentionDays(retentionDays) * DAY_MS),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    res.json({
      success: true,
      updated: !!existing,
      message: existing
        ? `Đã cập nhật "${doc.en}" trong source "${doc.source}"`
        : `Saved "${doc.en}" to source "${doc.source}"`,
      data: doc,
    });
  } catch (err) {
    console.error('uploadVocabulary error:', err);
    next(err);
  }
};

// GET /api/upload/my-topics - list unique private sources for current user
exports.getMyTopics = async (req, res, next) => {
  try {
    const userDoc = await User.findById(req.user.id).select('email').lean();
    const email = userDoc?.email;
    const soonThreshold = new Date(Date.now() + EXPIRY_WARN_DAYS * DAY_MS);
    const topics = await UserUpload.aggregate([
      { $match: { ownerEmail: email } },
      {
        $group: {
          _id: '$source',
          wordCount: { $sum: 1 },
          lastUpload: { $max: '$createdAt' },
          // Số từ sắp hết hạn (≤ EXPIRY_WARN_DAYS ngày) + hạn gần nhất.
          expiringSoon: {
            $sum: { $cond: [{ $and: [{ $ne: ['$expiresAt', null] }, { $lte: ['$expiresAt', soonThreshold] }] }, 1, 0] },
          },
          nearestExpiry: { $min: '$expiresAt' },
        },
      },
      { $sort: { lastUpload: -1 } },
      {
        $project: {
          _id: 0,
          source: '$_id',
          wordCount: 1,
          lastUpload: 1,
          expiringSoon: 1,
          nearestExpiry: 1,
        },
      },
    ]);
    res.json({ success: true, data: topics });
  } catch (err) {
    console.error('getMyTopics error:', err);
    next(err);
  }
};

// GET /api/upload/expiring - private sources expiring within EXPIRY_WARN_DAYS.
// Used to force the user to export before auto-deletion.
exports.getExpiringTopics = async (req, res, next) => {
  try {
    const userDoc = await User.findById(req.user.id).select('email').lean();
    const email = userDoc?.email;
    const threshold = new Date(Date.now() + EXPIRY_WARN_DAYS * DAY_MS);

    const topics = await UserUpload.aggregate([
      {
        $match: {
          ownerEmail: email,
          expiresAt: { $ne: null, $lte: threshold },
        },
      },
      {
        $group: {
          _id: '$source',
          wordCount: { $sum: 1 },
          expiresAt: { $min: '$expiresAt' },
        },
      },
      { $sort: { expiresAt: 1 } },
      {
        $project: { _id: 0, source: '$_id', wordCount: 1, expiresAt: 1 },
      },
    ]);

    res.json({ success: true, warnDays: EXPIRY_WARN_DAYS, data: topics });
  } catch (err) {
    console.error('getExpiringTopics error:', err);
    next(err);
  }
};

// GET /api/upload/my-vocabulary/:source - load words by source for current user
exports.getMyVocabulary = async (req, res, next) => {
  try {
    const userDoc = await User.findById(req.user.id).select('email').lean();
    const email = userDoc?.email;
    const { source } = req.params;
    const words = await UserUpload.find({
      ownerEmail: email,
      source,
    }).sort({ createdAt: -1 });
    res.json({ success: true, data: words });
  } catch (err) {
    console.error('getMyVocabulary error:', err);
    next(err);
  }
};

// DELETE /api/upload/my-vocabulary/:wordId — delete a single word owned by current user
exports.deleteMyWord = async (req, res, next) => {
  try {
    const userDoc = await User.findById(req.user.id).select('email').lean();
    const email = userDoc?.email;
    const { wordId } = req.params;

    const word = await UserUpload.findOne({ _id: wordId, ownerEmail: email });
    if (!word) return res.status(404).json({ success: false, message: 'Không tìm thấy từ hoặc bạn không có quyền xóa' });

    await word.deleteOne();
    res.json({ success: true, message: `Đã xóa "${word.en}"` });
  } catch (err) {
    console.error('deleteMyWord error:', err);
    next(err);
  }
};

// POST /api/upload/extend/:source — push expiry of all words in a private
// source forward by DEFAULT_RETENTION_DAYS (renew, no data loss).
exports.extendMySource = async (req, res, next) => {
  try {
    const userDoc = await User.findById(req.user.id).select('email').lean();
    const email = userDoc?.email;
    const { source } = req.params;

    // Phí gia hạn = số từ × EXTEND_COST_PER_WORD (coins). VIP miễn phí.
    const wordCount = await UserUpload.countDocuments({ ownerEmail: email, source });
    if (!wordCount) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy nguồn hoặc bạn không có quyền' });
    }
    const stats = await UserStats.findOne({ userId: req.user.id });
    const isVip = !!(stats?.vipExpiresAt && new Date(stats.vipExpiresAt).getTime() > Date.now());
    const EXTEND_COST_PER_WORD = (await getGameConfig()).extendCostPerWord;
    const cost = isVip ? 0 : wordCount * EXTEND_COST_PER_WORD;

    if (cost > 0) {
      if ((stats?.coins || 0) < cost) {
        return res.status(400).json({
          success: false, notEnough: true, cost, coins: stats?.coins || 0,
          message: `Cần ${cost} xu để gia hạn ${wordCount} từ (bạn có ${stats?.coins || 0}).`,
        });
      }
      stats.coins -= cost;
      await stats.save();
    }

    const newExpiresAt = new Date(Date.now() + DEFAULT_RETENTION_DAYS * DAY_MS);
    const result = await UserUpload.updateMany(
      { ownerEmail: email, source },
      { $set: { expiresAt: newExpiresAt } }
    );

    if (cost > 0) {
      logTxn(req.user.id, { type: 'extend', direction: 'out', name: `Gia hạn "${source}" (${wordCount} từ)`, amount: cost, currency: 'coins', balanceAfter: stats.coins });
    }

    res.json({
      success: true,
      message: cost > 0
        ? `Đã gia hạn "${source}" thêm ${DEFAULT_RETENTION_DAYS} ngày (−${cost} xu)`
        : `Đã gia hạn "${source}" thêm ${DEFAULT_RETENTION_DAYS} ngày (VIP miễn phí)`,
      extendedCount: result.modifiedCount,
      expiresAt: newExpiresAt,
      retentionDays: DEFAULT_RETENTION_DAYS,
      cost,
      newBalance: stats?.coins || 0,
    });
  } catch (err) {
    console.error('extendMySource error:', err);
    next(err);
  }
};

// DELETE /api/upload/my-source/:source — delete all words in a source owned by current user
exports.deleteMySource = async (req, res, next) => {
  try {
    const userDoc = await User.findById(req.user.id).select('email').lean();
    const email = userDoc?.email;
    const { source } = req.params;

    const result = await UserUpload.deleteMany({ ownerEmail: email, source });
    res.json({ success: true, message: `Đã xóa ${result.deletedCount} từ trong "${source}"`, deletedCount: result.deletedCount });
  } catch (err) {
    console.error('deleteMySource error:', err);
    next(err);
  }
};

// GET /api/admin/upload/monitoring
exports.getMonitoring = async (req, res, next) => {
  try {
    const uploads = await UserUpload.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { email: '$ownerEmail', source: '$source' },
          wordCount: { $sum: 1 },
          lastUpload: { $max: '$createdAt' },
          words: { $push: '$en' },
        },
      },
      { $sort: { lastUpload: -1 } },
      { $limit: 100 },
    ]);

    const data = uploads.map(u => ({
      email: u._id.email,
      source: u._id.source,
      wordCount: u.wordCount,
      contentPreview: (u.words || []).slice(0, 5),
      status: 'active',
      createdAt: u.lastUpload,
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error('getMonitoring error:', err);
    next(err);
  }
};

// GET /api/admin/upload/stats
exports.getStats = async (req, res, next) => {
  try {
    const totalWords = await UserUpload.countDocuments({});
    const totalUsers = await UserUpload.distinct('ownerEmail').then(a => a.filter(Boolean).length);
    const totalSources = await UserUpload.distinct('source').then(a => a.length);
    res.json({
      success: true,
      data: { totalWords, totalUsers, totalSources },
    });
  } catch (err) {
    console.error('getStats error:', err);
    next(err);
  }
};
