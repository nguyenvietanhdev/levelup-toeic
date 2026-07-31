/**
 * Đánh số lại questionNumber theo chuẩn TOEIC của từng Part.
 * Trước đây mỗi Part đánh 1,2,3… nên Part 6 ra 1–16 thay vì 131–146 → số hiển
 * thị lúc làm bài không khớp số ghi trong ảnh đề scan.
 *
 * Giữ nguyên THỨ TỰ hiện có; các câu cùng nhóm vẫn liền nhau (sắp theo
 * questionNumber cũ rồi tới questionIndex).
 *
 * Chạy: node scripts/renumberQuestions.js          (xem trước)
 *       node scripts/renumberQuestions.js --apply   (ghi DB)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ToeicQuestion = require('../models/ToeicQuestion');

const PART_START = { 1: 1, 2: 7, 3: 32, 4: 71, 5: 101, 6: 131, 7: 147 };
const APPLY = process.argv.includes('--apply');

(async () => {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    const ops = [];

    // Đánh số theo TỪNG BỘ ĐỀ (source) — mỗi bộ có dải số chuẩn riêng.
    const sources = (await ToeicQuestion.distinct('source')).filter(Boolean).sort();
    let totalChanged = 0;

    for (const source of sources) {
        const line = [];
        for (const part of [1, 2, 3, 4, 5, 6, 7]) {
            const rows = await ToeicQuestion.find({ part, source })
                .select('questionNumber questionIndex groupId')
                .sort({ questionNumber: 1, questionIndex: 1, _id: 1 })
                .lean();
            if (!rows.length) continue;

            let n = PART_START[part];
            let changed = 0;
            for (const r of rows) {
                if (r.questionNumber !== n) {
                    changed++;
                    ops.push({ updateOne: { filter: { _id: r._id }, update: { $set: { questionNumber: n } } } });
                }
                n++;
            }
            totalChanged += changed;
            line.push(`P${part}:${rows.length}c→${PART_START[part]}..${n - 1}${changed ? `(đổi ${changed})` : ''}`);
        }
        console.log(`${source.padEnd(12)} ${line.join('  ')}`);
    }
    console.log(`\nTổng câu cần đổi số: ${totalChanged}`);

    if (APPLY && ops.length) {
        const res = await ToeicQuestion.bulkWrite(ops);
        console.log(`\n✅ Đã ghi: ${res.modifiedCount} câu.`);
    } else if (!APPLY) {
        console.log(`\n（xem trước — ${ops.length} câu sẽ đổi; thêm --apply để ghi）`);
    }
    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
