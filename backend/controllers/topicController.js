const Topic = require("../models/Topic");
const Vocabulary = require("../models/Vocabulary");
const VocabularyZh = require("../models/VocabularyZh");
const { groupLevelRows, sumStatsFor } = require("../utils/levelStats");

// Parse sourceKeys từ string hoặc array, lowercase + dedupe
function parseSourceKeys(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(",");
  return [...new Set(arr.map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

// Đếm số từ public match bất kỳ sourceKey nào (loại trừ private uploads)
function getVocabularyModelByLang(lang = "en") {
  return lang === "zh" ? VocabularyZh : Vocabulary;
}

async function countWords(sourceKeys, lang = "en") {
  const Model = getVocabularyModelByLang(lang);
  return Model.countDocuments({
    source: { $in: sourceKeys },
    scope: { $ne: "private" },
  });
}

/**
 * Đếm số từ theo MỨC ĐỘ KHÓ (A/B/C) cho nhiều topic trong MỘT truy vấn.
 *
 * Trả về Map: sourceKey -> { a, b, c }.
 *
 * Gộp hết vào một `$group` theo (source, level) thay vì lặp từng topic gọi một
 * lần: bảng đề có ~10 topic, mỗi topic một truy vấn là 10 vòng khứ hồi cho một
 * màn hình chọn đề — chính là N+1. Trường `level` đã có index sẵn.
 *
 * Chỉ lấy CHỮ CÁI ĐẦU của level: dữ liệu thật có cả "A", "A1", "a2"… mà phân
 * loại ở đây chỉ cần ba nhóm.
 */
async function countByLevel(allSourceKeys, lang = "en") {
  const Model = getVocabularyModelByLang(lang);
  const rows = await Model.aggregate([
    { $match: { source: { $in: allSourceKeys }, scope: { $ne: "private" } } },
    {
      $group: {
        _id: { source: "$source", level: "$level" },
        count: { $sum: 1 },
      },
    },
  ]);
  // Việc gom nằm ở utils/levelStats.js — test được mà không cần MongoDB.
  return groupLevelRows(rows);
}

// GET /api/topics — public, dùng cho frontend chọn đề
exports.getTopics = async (req, res, next) => {
  try {
    const filter = { isPublic: true };
    if (req.query.lang) filter.lang = req.query.lang;
    const topics = await Topic.find(filter).sort({ order: 1, displayName: 1 });

    // Kèm phân bố độ khó để popup Chọn đề vẽ dải màu A/B/C (giống popup Chọn
    // Part). Một truy vấn gộp cho TẤT CẢ topic, không phải mỗi topic một lần.
    //
    // Gom theo `lang` vì từ vựng EN và ZH nằm ở hai collection khác nhau; trộn
    // chung một lượt là đếm nhầm sang collection kia.
    const byLang = new Map();
    for (const t of topics) {
      const lang = t.lang || "en";
      if (!byLang.has(lang)) byLang.set(lang, new Set());
      for (const k of t.sourceKeys || []) byLang.get(lang).add(k);
    }
    const statsByLang = new Map();
    await Promise.all(
      [...byLang.entries()].map(async ([lang, keys]) => {
        statsByLang.set(lang, await countByLevel([...keys], lang));
      }),
    );

    const data = topics.map((t) => {
      const stats = statsByLang.get(t.lang || "en");
      // `toObject()` vì `Topic.find()` trả về document Mongoose — rải trực tiếp
      // bằng `...t` chỉ lấy được thuộc tính nội bộ, mất sạch các trường thật.
      return {
        ...t.toObject(),
        levelStats: sumStatsFor(t.sourceKeys || [], stats),
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/topics/all — admin, bao gồm cả isPublic: false
exports.getAllTopics = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.lang) filter.lang = req.query.lang;
    const topics = await Topic.find(filter).sort({ order: 1, displayName: 1 });
    res.json({ success: true, data: topics });
  } catch (err) {
    next(err);
  }
};

// POST /api/topics — tạo topic mới
exports.createTopic = async (req, res, next) => {
  try {
    const {
      sourceKeys: rawKeys,
      displayName,
      description,
      icon,
      color,
      order,
      isPublic,
      lang,
    } = req.body;

    const sourceKeys = parseSourceKeys(rawKeys);
    if (!sourceKeys.length || !displayName) {
      return res.status(400).json({
        success: false,
        message: "sourceKeys và displayName là bắt buộc",
      });
    }

    const wordCount = await countWords(sourceKeys);

    const topic = await Topic.create({
      sourceKeys,
      displayName,
      description: description || "",
      icon: icon || "📚",
      color: color || "#3b82f6",
      order: order ?? 0,
      isPublic: isPublic ?? true,
      lang: lang || "en",
      wordCount,
    });

    res.status(201).json({ success: true, data: topic });
  } catch (err) {
    next(err);
  }
};

// PUT /api/topics/:id — cập nhật topic
exports.updateTopic = async (req, res, next) => {
  try {
    const {
      sourceKeys: rawKeys,
      displayName,
      description,
      icon,
      color,
      order,
      isPublic,
      lang,
    } = req.body;

    const update = { displayName, description, icon, color, order, isPublic };
    if (lang !== undefined) update.lang = lang;
    if (rawKeys !== undefined) {
      const sourceKeys = parseSourceKeys(rawKeys);
      if (!sourceKeys.length) {
        return res
          .status(400)
          .json({ success: false, message: "Phải có ít nhất một sourceKey" });
      }
      update.sourceKeys = sourceKeys;
    }

    const topic = await Topic.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!topic)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy topic" });

    res.json({ success: true, data: topic });
  } catch (err) {
    next(err);
  }
};

// PUT /api/topics/:id/publish
// Xuất bản / gỡ xuất bản một đề. Endpoint riêng thay vì PUT chung để bảng đề
// bật tắt được bằng một cú bấm mà không phải gửi lại toàn bộ field.
// Client gửi trạng thái MONG MUỐN (không phải "đảo") nên bấm nhanh hai lần
// cũng ra đúng kết quả.
exports.publishTopic = async (req, res, next) => {
  try {
    const isPublic = !!req.body?.isPublic;
    const topic = await Topic.findByIdAndUpdate(
      req.params.id,
      { isPublic },
      { new: true, runValidators: true },
    );
    if (!topic)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy topic" });

    res.json({
      success: true,
      message: topic.isPublic
        ? `Đã xuất bản "${topic.displayName}"`
        : `Đã gỡ "${topic.displayName}" khỏi danh sách người dùng`,
      data: topic,
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/topics/:id
exports.deleteTopic = async (req, res, next) => {
  try {
    const topic = await Topic.findByIdAndDelete(req.params.id);
    if (!topic)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy topic" });
    res.json({ success: true, message: "Đã xóa topic" });
  } catch (err) {
    next(err);
  }
};

// POST /api/topics/:id/sync-count
exports.syncWordCount = async (req, res, next) => {
  try {
    const topic = await Topic.findById(req.params.id);
    if (!topic)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy topic" });

    const lang = topic.lang || req.query.lang || "en";
    topic.wordCount = await countWords(topic.sourceKeys, lang);

    await topic.save();

    res.json({ success: true, data: topic });
  } catch (err) {
    next(err);
  }
};

// POST /api/topics/sync-all
exports.syncAllWordCounts = async (req, res, next) => {
  try {
    const topics = await Topic.find();
    const updates = await Promise.all(
      topics.map(async (t) => {
                const lang = t.lang || req.query.lang || 'en';
                t.wordCount = await countWords(t.sourceKeys, lang);

        await t.save();
        return {
          sourceKeys: t.sourceKeys,
          displayName: t.displayName,
          wordCount: t.wordCount,
        };
      }),
    );
    res.json({ success: true, data: updates });
  } catch (err) {
    next(err);
  }
};
