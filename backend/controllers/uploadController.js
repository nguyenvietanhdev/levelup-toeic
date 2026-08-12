const mongoose = require('mongoose');
const UserUpload = require('../models/UserUpload');
const VocabShare = require('../models/VocabShare');
const { EMAIL_RE } = require('../models/VocabShare');
// `User` quay lại đây SAU KHI đã gỡ ở lượt bỏ 9 truy vấn email thừa — lần này
// dùng cho việc khác hẳn: tra ID người chơi ra email lúc cấp quyền, và tra
// ngược ra tên hiển thị lúc liệt kê. Không phải để lấy email của CHÍNH người
// gọi (cái đó `req.user.email` lo).
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
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

    // Nhận ID NGƯỜI CHƠI, không phải email.
    //
    // Bảng xếp hạng đã có nút "Sao chép ID" (LeaderboardScreen.jsx:331) nên đây
    // là thứ người dùng lấy được sẵn. Quan trọng hơn: chủ bộ từ KHÔNG cần biết
    // email của ai để chia sẻ, và cũng không thấy email người nhận ở bất kỳ đâu.
    // Nhận email thì màn hình này thành công cụ dò: gõ thử một địa chỉ, phản hồi
    // khác nhau giữa "có tài khoản" và "không có" là đã lộ thông tin.
    //
    // Grant vẫn LƯU theo email vì `UserUpload.ownerEmail` là khoá sở hữu của cả
    // hệ thống — đổi sang ID là phải sửa 9 handler khác. ID chỉ là cách NHẬP.
    const granteeId = String(req.body?.granteeId || '').trim();

    if (!source) {
      return res.status(400).json({ success: false, message: 'Thiếu tên bộ từ' });
    }
    if (!mongoose.Types.ObjectId.isValid(granteeId)) {
      return res.status(400).json({ success: false, message: 'ID người chơi không hợp lệ' });
    }

    const grantee = await User.findById(granteeId).select('email').lean();
    if (!grantee?.email) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người chơi với ID này' });
    }
    const granteeEmail = String(grantee.email).trim().toLowerCase();

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

    // Thông báo dùng TÊN HIỂN THỊ, không phải email — cả mục đích của việc đổi
    // sang ID là để chủ bộ từ không bao giờ thấy email người khác.
    const prof = await UserProfile.findOne({ userId: granteeId })
      .select('displayName username').lean();
    const who = prof?.displayName || prof?.username || 'người chơi này';
    res.json({ success: true, message: `Đã chia sẻ "${source}" cho ${who}` });
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
    // Nhận ID, không phải email — client không bao giờ cầm email người nhận nên
    // cũng không gửi lại được. Tra ra email để khớp với grant đã lưu.
    const granteeId = String(req.params.granteeId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(granteeId)) {
      return res.status(400).json({ success: false, message: 'ID người chơi không hợp lệ' });
    }

    const grantee = await User.findById(granteeId).select('email').lean();
    if (!grantee?.email) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy người chơi với ID này' });
    }
    const granteeEmail = String(grantee.email).trim().toLowerCase();

    // `ownerEmail` trong filter là thứ chặn người khác thu hồi grant KHÔNG PHẢI
    // của họ. Bỏ nó ra thì bất kỳ ai cũng huỷ được chia sẻ của bất kỳ ai, chỉ
    // cần biết tên bộ và ID người nhận.
    const r = await VocabShare.deleteOne({ ownerEmail, source, granteeEmail });
    if (r.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lượt chia sẻ này' });
    }

    // Không nhắc lại email trong thông báo — chủ không cần thấy nó.
    res.json({ success: true, message: 'Đã thu hồi quyền chia sẻ' });
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
    if (rows.length === 0) return res.json({ success: true, data: [] });

    // KHÔNG trả email ra client. Chủ bộ từ cần nhận ra mình đã chia sẻ cho ai,
    // nhưng không cần — và không nên — thấy địa chỉ email của người khác.
    // Trả tên hiển thị + ID để còn thu hồi đúng người.
    const emails = rows.map(r => r.granteeEmail);
    const users = await User.find({ email: { $in: emails } }).select('_id email').lean();
    const byEmail = new Map(users.map(u => [u.email, u]));

    const profiles = await UserProfile.find({ userId: { $in: users.map(u => u._id) } })
      .select('userId displayName username').lean();
    const byUserId = new Map(profiles.map(p => [String(p.userId), p]));

    const data = rows.map(r => {
      const u = byEmail.get(r.granteeEmail);
      const p = u ? byUserId.get(String(u._id)) : null;
      return {
        granteeId: u ? String(u._id) : null,
        // Tài khoản đã xoá thì không còn tên — nói thẳng thay vì để trống, chủ
        // vẫn phải thu hồi được grant mồ côi đó.
        name: p?.displayName || p?.username || (u ? 'Người chơi' : 'Tài khoản không còn'),
        createdAt: r.createdAt,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('listSharees error:', err);
    next(err);
  }
};

// GET /api/upload/shared-topics — những bộ từ NGƯỜI KHÁC đã chia sẻ cho tôi.
exports.getSharedTopics = async (req, res, next) => {
  try {
    const me = req.user.email;
    const grants = await VocabShare.find({ granteeEmail: me })
      .select('ownerEmail source createdAt')
      .lean();
    if (grants.length === 0) return res.json({ success: true, data: [] });

    const soonThreshold = new Date(Date.now() + EXPIRY_WARN_DAYS * DAY_MS);

    // Đếm từ cho đúng các cặp (chủ, bộ) được cấp quyền.
    const stats = await UserUpload.aggregate([
      { $match: { $or: grants.map(g => ({ ownerEmail: g.ownerEmail, source: g.source })) } },
      {
        $group: {
          _id: { ownerEmail: '$ownerEmail', source: '$source' },
          wordCount: { $sum: 1 },
          lastUpload: { $max: '$createdAt' },
          expiringSoon: {
            $sum: { $cond: [{ $and: [{ $ne: ['$expiresAt', null] }, { $lte: ['$expiresAt', soonThreshold] }] }, 1, 0] },
          },
          nearestExpiry: { $min: '$expiresAt' },
        },
      },
    ]);

    const byKey = new Map(stats.map(s => [`${s._id.ownerEmail}|${s._id.source}`, s]));

    // Tên hiển thị của CHỦ bộ từ. Người nhận cần biết bộ này của ai, nhưng không
    // cần thấy email — đối xứng với việc chủ cũng không thấy email người nhận.
    const owners = await User.find({ email: { $in: [...new Set(grants.map(g => g.ownerEmail))] } })
      .select('_id email').lean();
    const ownerIdByEmail = new Map(owners.map(u => [u.email, String(u._id)]));
    const ownerProfiles = await UserProfile.find({ userId: { $in: owners.map(u => u._id) } })
      .select('userId displayName username').lean();
    const nameByUserId = new Map(ownerProfiles.map(p => [String(p.userId), p.displayName || p.username]));
    const ownerNameOf = (email) => nameByUserId.get(ownerIdByEmail.get(email)) || 'Người chơi';

    // GHÉP TỪ PHÍA GRANT, không phải từ phía số liệu.
    //
    // Đây là chỗ dễ sai nhất của cả tính năng. Nếu chỉ trả những cặp có từ (kiểu
    // inner join, hoặc thêm `$match: { wordCount: { $gt: 0 } }`), thì bộ đã bị TTL
    // xoá sạch sẽ BIẾN MẤT khỏi danh sách — người nhận từng thấy nó, giờ không
    // thấy nữa, và không có gì giải thích. Grant mồ côi ở lại chính là để hiện
    // "bộ này đã hết hạn".
    const data = grants.map(g => {
      const s = byKey.get(`${g.ownerEmail}|${g.source}`);
      const wordCount = s?.wordCount || 0;
      return {
        // `ownerEmail` vẫn phải trả: client dùng nó làm khoá gọi
        // /shared-vocabulary/:ownerEmail/:source. Giao diện thì hiện `ownerName`.
        ownerEmail: g.ownerEmail,
        ownerName: ownerNameOf(g.ownerEmail),
        source: g.source,
        wordCount,
        lastUpload: s?.lastUpload || null,
        // Người nhận không gia hạn được (không phải dữ liệu của họ) nhưng PHẢI
        // thấy ngày chết — không thì bộ từ biến mất mà không báo trước.
        expiringSoon: s?.expiringSoon || 0,
        nearestExpiry: s?.nearestExpiry || null,
        expired: wordCount === 0,
        sharedAt: g.createdAt,
      };
    });

    // Bộ còn dùng được lên trước, bia mộ xuống cuối.
    data.sort((a, b) => (a.expired - b.expired) || (new Date(b.sharedAt) - new Date(a.sharedAt)));

    res.json({ success: true, warnDays: EXPIRY_WARN_DAYS, data });
  } catch (err) {
    console.error('getSharedTopics error:', err);
    next(err);
  }
};

// GET /api/upload/shared-vocabulary/:ownerEmail/:source — từ của một bộ được chia sẻ.
exports.getSharedVocabulary = async (req, res, next) => {
  try {
    const me = req.user.email;
    const ownerEmail = String(req.params.ownerEmail || '').trim().toLowerCase();
    const source = String(req.params.source || '').trim().toLowerCase();

    if (!EMAIL_RE.test(ownerEmail)) {
      return res.status(400).json({ success: false, message: 'Email chủ sở hữu không hợp lệ' });
    }

    // TRA GRANT TRƯỚC, rồi mới đọc từ.
    //
    // Đảo thứ tự là lỗ IDOR: đọc từ theo `ownerEmail` client gửi rồi mới kiểm,
    // hoặc kiểm hời hợt, thì ai cũng đọc được kho của người khác chỉ bằng cách
    // đoán email + tên bộ. Truy vấn từ phải dùng giá trị ĐÃ QUA grant.
    const grant = await VocabShare.findOne({ ownerEmail, source, granteeEmail: me })
      .select('ownerEmail source')
      .lean();
    if (!grant) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền xem bộ từ này' });
    }

    const words = await UserUpload.find({ ownerEmail: grant.ownerEmail, source: grant.source })
      .sort({ createdAt: -1 });

    res.json({ success: true, data: words, ownerEmail: grant.ownerEmail, source: grant.source });
  } catch (err) {
    console.error('getSharedVocabulary error:', err);
    next(err);
  }
};

// POST /api/upload/shared-vocabulary/:ownerEmail/:source/copy
// Sao chép một bộ được chia sẻ về kho của CHÍNH người gọi.
//
// Đây là lối thoát khỏi vấn đề TTL: bộ gốc hết hạn thì bản sao vẫn còn. Bản sao
// mang `ownerEmail` của người gọi nên tính vào giới hạn từ của họ và có hạn
// riêng — đúng như họ tự thêm vào.
exports.copySharedSource = async (req, res, next) => {
  try {
    const me = req.user.email;
    const ownerEmail = String(req.params.ownerEmail || '').trim().toLowerCase();
    const source = String(req.params.source || '').trim().toLowerCase();

    if (!EMAIL_RE.test(ownerEmail)) {
      return res.status(400).json({ success: false, message: 'Email chủ sở hữu không hợp lệ' });
    }
    if (ownerEmail === me) {
      return res.status(400).json({ success: false, message: 'Đây đã là bộ từ của bạn' });
    }

    // Tra grant TRƯỚC — cùng lý do như getSharedVocabulary: không có bước này thì
    // đoán đúng email + tên bộ là chép được kho của bất kỳ ai.
    const grant = await VocabShare.findOne({ ownerEmail, source, granteeEmail: me })
      .select('ownerEmail source').lean();
    if (!grant) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền sao chép bộ từ này' });
    }

    const words = await UserUpload.find({ ownerEmail: grant.ownerEmail, source: grant.source }).lean();
    if (words.length === 0) {
      return res.status(404).json({ success: false, message: 'Bộ từ này đã hết hạn, không còn từ nào để sao chép' });
    }

    // Không trộn vào bộ trùng tên sẵn có của người gọi — họ sẽ không phân biệt
    // được từ nào của mình, từ nào vừa chép về.
    let target = source;
    if (await UserUpload.exists({ ownerEmail: me, source: target })) {
      target = `${source}-copy`;
    }

    // ĐẾM TRƯỚC KHI GHI. Ghi rồi mới phát hiện vượt hạn là để lại nửa bộ từ trong
    // kho, người dùng không biết thiếu những từ nào — mà lệnh ghi thì không hoàn
    // tác được (không có transaction ở đây).
    const MAX_UPLOAD_WORDS = (await getGameConfig()).maxUploadWords;
    const current = await UserUpload.countDocuments({ ownerEmail: me });
    // Chỉ đếm từ THỰC SỰ mới: chép đè lên bộ cũ cùng tên thì phần trùng không tăng số.
    const existing = await UserUpload.countDocuments({
      ownerEmail: me, source: target, en: { $in: words.map(w => w.en) },
    });
    const willAdd = words.length - existing;
    if (current + willAdd > MAX_UPLOAD_WORDS) {
      return res.status(400).json({
        success: false, limitReached: true,
        message: `Sao chép ${willAdd} từ sẽ vượt giới hạn ${MAX_UPLOAD_WORDS} từ vựng riêng (đang có ${current}). Hãy xoá bớt trước.`,
      });
    }

    // Hạn MỚI, không kế thừa hạn bộ gốc — kế thừa thì bản sao chết cùng lúc với
    // bản gốc, tức là chép xong cũng vô nghĩa.
    const expiresAt = new Date(Date.now() + DEFAULT_RETENTION_DAYS * DAY_MS);

    await UserUpload.bulkWrite(words.map(w => ({
      updateOne: {
        filter: { ownerEmail: me, source: target, en: w.en },
        update: {
          $set: {
            en: w.en, vn: w.vn, phonetic: w.phonetic, part: w.part,
            synonyms: w.synonyms, type: w.type, image: w.image,
            example: w.example, level: w.level, lang: w.lang,
            source: target, ownerId: req.user.id, ownerEmail: me, expiresAt,
          },
        },
        upsert: true,
      },
    })));

    const copied = await UserUpload.countDocuments({ ownerEmail: me, source: target });
    res.json({
      success: true,
      data: { source: target, wordCount: copied },
      message: `Đã sao chép ${words.length} từ vào bộ "${target}"`,
    });
  } catch (err) {
    console.error('copySharedSource error:', err);
    next(err);
  }
};
