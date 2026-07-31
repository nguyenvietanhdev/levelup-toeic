/**
 * GIAI ĐOẠN 1 — Chuyển toeic_questions (1 doc = 1 câu) sang
 * toeic_question_sets (1 doc = 1 MÀN, câu nằm trong mảng questions[]).
 *
 * CHỈ GHI THÊM vào collection mới. Không sửa, không xoá dữ liệu cũ → chạy lại
 * được, và nếu dừng giữa chừng app vẫn chạy y như trước.
 *
 * Gom nhóm:
 *   • có groupId  → các câu cùng groupId gộp thành 1 set (sắp theo questionIndex)
 *   • không có    → mỗi câu thành 1 set có đúng 1 phần tử
 * Ngữ cảnh chung (audio/ảnh/đoạn văn) lấy từ câu ĐẦU TIÊN có dữ liệu trong nhóm.
 *
 * Chạy: node scripts/migrateToQuestionSets.js           (xem trước)
 *       node scripts/migrateToQuestionSets.js --apply    (ghi)
 *       node scripts/migrateToQuestionSets.js --reset --apply  (xoá sets rồi tạo lại)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ToeicQuestion = require('../models/ToeicQuestion');
const ToeicQuestionSet = require('../models/ToeicQuestionSet');

const APPLY = process.argv.includes('--apply');
const RESET = process.argv.includes('--reset');

const firstOf = (rows, pick) => {
    for (const r of rows) {
        const v = pick(r);
        if (Array.isArray(v) ? v.length : (v !== undefined && v !== null && v !== '')) return v;
    }
    return undefined;
};

(async () => {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

    if (RESET && APPLY) {
        const del = await ToeicQuestionSet.deleteMany({});
        console.log(`♻️  Đã xoá ${del.deletedCount} set cũ để tạo lại.\n`);
    }

    const all = await ToeicQuestion.find({})
        .sort({ source: 1, part: 1, questionNumber: 1, questionIndex: 1, _id: 1 })
        .lean();

    // Gom: groupId (nếu có) hoặc chính _id (câu đơn).
    const buckets = new Map();
    for (const q of all) {
        const key = q.groupId ? `g:${q.groupId}` : `s:${q._id}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(q);
    }

    const docs = [];
    const warn = [];
    for (const [key, rows] of buckets) {
        rows.sort((a, b) => (a.questionIndex || 0) - (b.questionIndex || 0) || (a.questionNumber || 0) - (b.questionNumber || 0));
        const head = rows[0];

        const questions = rows.map(r => {
            if (!r.options?.length || !r.correctAnswer) warn.push(`${key}: câu #${r.questionNumber} thiếu options/correctAnswer`);
            return {
                number: r.questionNumber,
                questionText: r.questionText || undefined,
                questionTranslate: r.questionTranslate || undefined,
                options: (r.options || []).map(o => ({ label: o.label, text: o.text })),
                correctAnswer: r.correctAnswer,
                explanation: r.explanation || {},
                timesUsed: r.timesUsed || 0,
                correctCount: r.correctCount || 0,
                wrongCount: r.wrongCount || 0,
            };
        });

        docs.push({
            part: head.part,
            source: head.source,
            // Ngữ cảnh chung: lấy giá trị đầu tiên có trong nhóm.
            audioUrl: firstOf(rows, r => r.audioUrl),
            audioText: firstOf(rows, r => r.audioText),
            audioTranslate: firstOf(rows, r => r.audioTranslate),
            imageUrls: firstOf(rows, r => r.imageUrls) || [],
            passages: firstOf(rows, r => r.passages) || [],
            passageCount: firstOf(rows, r => r.passageCount),
            questions,
            topic: head.topic,
            tags: head.tags || [],
            isActive: head.isActive !== false,
            isPublished: head.isPublished !== false,
            createdBy: head.createdBy,
        });
    }

    // Đối chiếu số lượng — bảo đảm không mất câu nào.
    const byPart = {};
    docs.forEach(d => {
        byPart[d.part] = byPart[d.part] || { sets: 0, qs: 0 };
        byPart[d.part].sets++;
        byPart[d.part].qs += d.questions.length;
    });
    console.log('Part |  set  | câu   (câu phải khớp dữ liệu cũ)');
    let totalQ = 0;
    Object.keys(byPart).sort().forEach(p => {
        console.log(`  ${p}  | ${String(byPart[p].sets).padStart(5)} | ${byPart[p].qs}`);
        totalQ += byPart[p].qs;
    });
    console.log(`\nTổng: ${docs.length} set / ${totalQ} câu  —  nguồn cũ: ${all.length} câu`);
    if (totalQ !== all.length) console.log('❌ LỆCH SỐ CÂU — dừng lại, KHÔNG ghi.');
    if (warn.length) console.log(`\n⚠️  ${warn.length} cảnh báo:\n  ` + warn.slice(0, 5).join('\n  '));

    if (APPLY && totalQ === all.length) {
        const existing = await ToeicQuestionSet.countDocuments();
        if (existing > 0 && !RESET) {
            console.log(`\n⛔ Đã có ${existing} set trong DB. Dùng --reset --apply nếu muốn tạo lại.`);
        } else {
            const res = await ToeicQuestionSet.insertMany(docs);
            console.log(`\n✅ Đã tạo ${res.length} set.`);

            // Bản đồ id CŨ → id MỚI, để dựng lại tham chiếu câu hỏi trong các đề
            // (ToeicTest.parts[].questions). Ghi ra file thay vì nhét vào schema.
            const fs = require('fs');
            const path = require('path');
            const map = {};
            const order = [...buckets.values()];
            res.forEach((set, si) => {
                order[si].forEach((oldQ, qi) => {
                    map[String(oldQ._id)] = { setId: String(set._id), subId: String(set.questions[qi]._id) };
                });
            });
            fs.mkdirSync('backups', { recursive: true });
            const mapPath = path.join('backups', 'legacy-question-map.json');
            fs.writeFileSync(mapPath, JSON.stringify(map, null, 0));
            console.log(`🗺️  Bản đồ id cũ→mới: ${Object.keys(map).length} câu → ${mapPath}`);
        }
    } else if (!APPLY) {
        console.log('\n（xem trước — thêm --apply để ghi）');
    }

    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
