const Topic = require("../models/Topic");
const Vocabulary = require("../models/Vocabulary");
const VocabularyZh = require("../models/VocabularyZh");

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

// GET /api/topics — public, dùng cho frontend chọn đề
exports.getTopics = async (req, res, next) => {
  try {
    const filter = { isPublic: true };
    if (req.query.lang) filter.lang = req.query.lang;
    const topics = await Topic.find(filter).sort({ order: 1, displayName: 1 });
    res.json({ success: true, data: topics });
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
