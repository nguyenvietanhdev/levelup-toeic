/**
 * GIAI ĐOẠN 2 — Đổi tham chiếu câu hỏi trong các ĐỀ THI:
 *   ToeicTest.parts[].questions:  [id câu cũ]  →  [id MÀN (set)]
 *
 * Một màn có thể chứa nhiều câu (Part 3/4/6/7) nên danh sách set ngắn hơn danh
 * sách câu cũ; `questionsCount` và `totalQuestions` tính lại theo SỐ CÂU thật.
 *
 * Dùng bản đồ backups/legacy-question-map.json do migrateToQuestionSets tạo ra.
 *
 * Chạy: node scripts/migrateTestsToSets.js           (xem trước)
 *       node scripts/migrateTestsToSets.js --apply    (ghi)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ToeicTest = require('../models/ToeicTest');
const ToeicQuestionSet = require('../models/ToeicQuestionSet');

const APPLY = process.argv.includes('--apply');
const MAP_PATH = path.join('backups', 'legacy-question-map.json');

(async () => {
    if (!fs.existsSync(MAP_PATH)) {
        console.error(`❌ Thiếu ${MAP_PATH} — chạy migrateToQuestionSets.js --reset --apply trước.`);
        process.exit(1);
    }
    const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

    // Số câu của mỗi set (để tính lại questionsCount).
    const sizeOf = new Map();
    (await ToeicQuestionSet.find({}).select('questions').lean())
        .forEach(s => sizeOf.set(String(s._id), s.questions.length));

    const tests = await ToeicTest.find({}).lean();
    const ops = [];
    let missing = 0;

    for (const t of tests) {
        const parts = [];
        let total = 0;
        const notes = [];

        for (const p of (t.parts || [])) {
            const setIds = [];
            for (const qid of (p.questions || [])) {
                const hit = map[String(qid)];
                if (!hit) { missing++; continue; }
                // Nhiều câu cùng màn → chỉ giữ MỘT lần id màn, đúng thứ tự gặp.
                if (!setIds.includes(hit.setId)) setIds.push(hit.setId);
            }
            const count = setIds.reduce((n, id) => n + (sizeOf.get(id) || 0), 0);
            total += count;
            parts.push({ ...p, questions: setIds, questionsCount: count });
            notes.push(`P${p.partNumber}: ${p.questions?.length || 0} câu cũ → ${setIds.length} màn / ${count} câu`);
        }

        const changed = total !== t.totalQuestions || parts.some((p, i) => p.questions.length !== (t.parts[i].questions || []).length);
        console.log(`${(t.testName || t._id).toString().slice(0, 38).padEnd(40)} ${notes.join(' | ')}${changed ? '' : '  (không đổi)'}`);
        ops.push({ updateOne: { filter: { _id: t._id }, update: { $set: { parts, totalQuestions: total } } } });
    }

    console.log(`\nĐề: ${tests.length}${missing ? ` | ⚠️ ${missing} id câu không tìm thấy trong bản đồ (bỏ qua)` : ''}`);

    if (APPLY) {
        const res = await ToeicTest.bulkWrite(ops);
        console.log(`✅ Đã cập nhật ${res.modifiedCount} đề.`);
    } else {
        console.log('（xem trước — thêm --apply để ghi）');
    }
    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
