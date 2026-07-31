require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');

// Old collection names replaced by new names in the 18-collection schema
const STALE_COLLECTIONS = [
    'otpcodes',          // → otp_codes
    'practicesessions',  // → user_practice_sessions
    'wrongwords',        // → user_wrongwords
    'toeicattempts',     // → toeic_test_attempts
    'toeicquestions',    // → toeic_questions
    'toeictests',        // → toeic_tests
];

// The 18 final collections that must exist
const FINAL_COLLECTIONS = [
    'users',
    'user_profiles',
    'user_stats',
    'user_quests',
    'user_achievements',
    'user_practice_sessions',
    'user_wrongwords',
    'toeic_tests',
    'toeic_questions',
    'toeic_test_attempts',
    'vocabularies',
    'vocabulary_uploads',     // created on first upload
    'vocabulary_topics',
    'achievement_definitions',
    'quest_definitions',      // created on first quest added
    'otp_codes',
    'reports',
    'notifications',
];

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    const all = (await db.listCollections().toArray()).map(c => c.name).sort();
    console.log('\n=== COLLECTIONS HIỆN TẠI ===');
    console.log(all.join('\n'));

    console.log('\n=== PHÂN TÍCH ===');

    // Check stale
    const staleFound = all.filter(c => STALE_COLLECTIONS.includes(c));
    const missing = FINAL_COLLECTIONS.filter(c => !all.includes(c));
    const unexpected = all.filter(c => !FINAL_COLLECTIONS.includes(c) && !STALE_COLLECTIONS.includes(c));

    if (staleFound.length) {
        console.log('\n[CẦN XÓA] Collection cũ (đã đổi tên):');
        for (const name of staleFound) {
            const count = await db.collection(name).countDocuments();
            console.log(`  - ${name}  (${count} docs)`);
        }
    }

    if (missing.length) {
        console.log('\n[CHƯA CÓ] Collection chưa được tạo (sẽ tự tạo khi có dữ liệu):');
        missing.forEach(n => console.log(`  - ${n}`));
    }

    if (unexpected.length) {
        console.log('\n[NGOÀI KẾ HOẠCH] Collection không thuộc schema:');
        for (const name of unexpected) {
            const count = await db.collection(name).countDocuments();
            console.log(`  - ${name}  (${count} docs)`);
        }
    }

    const ok = FINAL_COLLECTIONS.filter(c => all.includes(c));
    console.log(`\n[OK] ${ok.length}/${FINAL_COLLECTIONS.length} collections đúng schema`);

    if (staleFound.length === 0 && unexpected.length === 0) {
        console.log('\n✅ Database sạch, không cần cleanup.');
        await mongoose.disconnect();
        process.exit(0);
    }

    // Confirm before deleting
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    rl.question('\nXóa các collection cũ? (yes/no): ', async (answer) => {
        rl.close();
        if (answer.trim().toLowerCase() !== 'yes') {
            console.log('Hủy bỏ.');
            await mongoose.disconnect();
            process.exit(0);
        }

        for (const name of staleFound) {
            const count = await db.collection(name).countDocuments();
            if (count > 0) {
                console.log(`⚠️  Bỏ qua "${name}" — có ${count} docs, cần kiểm tra thủ công`);
            } else {
                await db.dropCollection(name);
                console.log(`✅ Đã xóa: ${name}`);
            }
        }

        console.log('\nHoàn tất cleanup.');
        await mongoose.disconnect();
        process.exit(0);
    });
}

main().catch(err => {
    console.error('Lỗi:', err.message);
    process.exit(1);
});
