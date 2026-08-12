const UserUpload = require('../models/UserUpload');
const VocabShare = require('../models/VocabShare');
const { EMAIL_RE } = require('../models/VocabShare');
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
    const email = req.user.email;
    const {
      en, vn, phonetic, part, synonyms,
      type, image, example, level, source, retentionDays, lang
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
          // Chỉ nhận đúng hai giá trị — client gửi gì khác thì coi như 'en',
          // không để giá trị lạ lọt vào rồi TTS đọc bằng giọng không tồn tại.
          lang: lang === 'zh' ? 'zh' : 'en',
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
    const email = req.user.email;
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
    const email = req.user.email;
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
    const email = req.user.email;
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
    const email = req.user.email;
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

// PUT /api/upload/my-vocabulary/:wordId — sửa một từ trong bộ từ vựng riêng.
//
// Chỉ cho sửa NỘI DUNG (en/vn/phonetic/synonyms/type/example/level). KHÔNG cho
// đổi `source`/`part`/`ownerEmail` qua đây: source quyết định từ nằm ở kho nào
// và part quyết định nó xuất hiện trong bài luyện nào — đổi được hai thứ đó
// nghĩa là một request sửa từ có thể chuyển từ sang kho người khác đang dùng.
// Muốn đổi kho thì xoá rồi thêm lại.
exports.updateMyWord = async (req, res, next) => {
  try {
    const email = req.user.email;
    const { wordId } = req.params;

    // Lọc kèm ownerEmail: thiếu nó là ai biết _id cũng sửa được từ của người khác.
    const word = await UserUpload.findOne({ _id: wordId, ownerEmail: email });
    if (!word) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy từ hoặc bạn không có quyền sửa' });
    }

    const { en, vn, phonetic, synonyms, type, example, level, lang } = req.body;

    if (en !== undefined) {
      if (!String(en).trim()) {
        return res.status(400).json({ success: false, message: 'English is required' });
      }
      const enL = lower(en);
      // Đổi `en` có thể đụng bản ghi khác cùng (ownerEmail, source, en) — đó là
      // khoá upsert lúc thêm. Không chặn thì hai từ trùng tên trong một kho.
      if (enL !== word.en) {
        const dup = await UserUpload.findOne({
          ownerEmail: email, source: word.source, en: enL, _id: { $ne: word._id },
        }).select('_id').lean();
        if (dup) {
          return res.status(409).json({ success: false, message: `"${enL}" đã có trong bộ từ này` });
        }
        word.en = enL;
      }
    }

    if (vn !== undefined) word.vn = lower(vn);
    if (phonetic !== undefined) word.phonetic = lower(phonetic);
    if (synonyms !== undefined) word.synonyms = lower(synonyms);
    if (type !== undefined) word.type = lower(type);
    if (example !== undefined) word.example = capFirst(example);
    if (level !== undefined) word.level = upper(level);
    if (lang !== undefined) word.lang = lang === 'zh' ? 'zh' : 'en';

    await word.save();
    res.json({ success: true, data: word, message: `Đã cập nhật "${word.en}"` });
  } catch (err) {
    console.error('updateMyWord error:', err);
    next(err);
  }
};

// POST /api/upload/extend/:source — push expiry of all words in a private
// source forward by DEFAULT_RETENTION_DAYS (renew, no data loss).
exports.extendMySource = async (req, res, next) => {
  try {
    const email = req.user.email;
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
    const email = req.user.email;
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

// ===================================
// CHIA SẺ BỘ TỪ VỰNG RIÊNG
// ===================================
// Chủ bộ từ mời người khác theo email. Người được mời LUYỆN TẬP được bằng bộ đó
// nhưng không sửa/xoá được — điều đó do cấu trúc bảo đảm chứ không phải một cờ:
// mọi handler sửa/xoá đều lọc `ownerEmail: <người gọi>`, nên người nhận gọi vào
// chỉ nhận 404. Đường đọc của người nhận là ROUTE RIÊNG (xem getSharedTopics /
// getSharedVocabulary), không phải nới lỏng getMyVocabulary — 9 handler kia đang
// cùng một khuôn `ownerEmail: email`, làm một cái thành có điều kiện là người
// viết handler thứ 10 chép nhầm khuôn.

// POST /api/upload/share/:source — cấp quyền xem cho một email.
exports.shareSource = async (req, res, next) => {
  try {
    const ownerEmail = req.user.email;
    const source = String(req.params.source || '').trim().toLowerCase();
    const granteeEmail = String(req.body?.granteeEmail || '').trim().toLowerCase();

    if (!source) {
      return res.status(400).json({ success: false, message: 'Thiếu tên bộ từ' });
    }
    if (!EMAIL_RE.test(granteeEmail)) {
      return res.status(400).json({ success: false, message: 'Email không hợp lệ' });
    }
    if (granteeEmail === ownerEmail) {
      return res.status(400).json({ success: false, message: 'Không cần chia sẻ cho chính mình' });
    }

    // Phải THẬT SỰ sở hữu bộ này. "Bộ từ" không phải một document nên không có
    // chỗ nào khác để kiểm quyền — thiếu bước này thì ai cũng cấp được quyền
    // trên bộ của người khác chỉ bằng cách đoán đúng tên `source`.
    const owns = await UserUpload.exists({ ownerEmail, source });
    if (!owns) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bộ từ này trong kho của bạn' });
    }

    // Chia sẻ lại cho cùng người là không-thao-tác. Dùng upsert thay vì bắt lỗi
    // trùng khoá: kết quả giống nhau mà không phải phân biệt hai đường thành công.
    await VocabShare.findOneAndUpdate(
      { ownerEmail, source, granteeEmail },
      { $setOnInsert: { ownerEmail, source, granteeEmail } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.json({ success: true, message: `Đã chia sẻ "${source}" cho ${granteeEmail}` });
  } catch (err) {
    console.error('shareSource error:', err);
    next(err);
  }
};

// DELETE /api/upload/share/:source/:granteeEmail — thu hồi quyền.
exports.unshareSource = async (req, res, next) => {
  try {
    const ownerEmail = req.user.email;
    const source = String(req.params.source || '').trim().toLowerCase();
    const granteeEmail = String(req.params.granteeEmail || '').trim().toLowerCase();

    // `ownerEmail` trong filter là thứ chặn người khác thu hồi grant KHÔNG PHẢI
    // của họ. Bỏ nó ra thì bất kỳ ai cũng huỷ được chia sẻ của bất kỳ ai, chỉ
    // cần biết tên bộ và email người nhận.
    const r = await VocabShare.deleteOne({ ownerEmail, source, granteeEmail });
    if (r.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lượt chia sẻ này' });
    }

    res.json({ success: true, message: `Đã thu hồi quyền của ${granteeEmail}` });
  } catch (err) {
    console.error('unshareSource error:', err);
    next(err);
  }
};

// GET /api/upload/share/:source — ai đang được xem bộ này.
exports.listSharees = async (req, res, next) => {
  try {
    const ownerEmail = req.user.email;
    const source = String(req.params.source || '').trim().toLowerCase();

    const rows = await VocabShare.find({ ownerEmail, source })
      .select('granteeEmail createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('listSharees error:', err);
    next(err);
  }
};
