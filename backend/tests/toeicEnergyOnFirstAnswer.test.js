/**
 * Năng lượng TOEIC trừ ở câu trả lời ĐẦU TIÊN, không phải lúc bấm "Bắt đầu".
 *
 * Vì sao đổi: trong DB thật có 101 lượt bỏ dở ở câu 0 (0 giây), đã ăn 2604⚡ —
 * 93% toàn bộ năng lượng TOEIC đổ vào bài không trả lời câu nào. Bấm nhầm, xem
 * thử rồi thoát, hay đổi ý đều mất 15–60⚡ trước khi nhìn thấy câu nào.
 *
 * Ba thứ phải đúng, và đều là chỗ mất tiền thật của người dùng nếu sai:
 *   1. `start` KHÔNG trừ năng lượng (nhưng VẪN trừ vàng — vàng không tự hồi).
 *   2. Câu đầu tiên trừ ĐÚNG MỘT LẦN, kể cả khi hai request đến cùng lúc.
 *   3. Trừ hụt (không đủ năng lượng) phải trả cờ về 0, nếu không lượt thi thành
 *      "đã trả phí" mà thực tế chưa trừ đồng nào.
 */
const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'controllers', 'toeicController.js'), 'utf8');
const ToeicAttempt = require('../models/ToeicAttempt');

/** Cắt thân một hàm export ra khỏi nguồn để soi riêng. */
function bodyOf(name) {
    const i = src.indexOf(`exports.${name} =`);
    if (i < 0) throw new Error(`không tìm thấy exports.${name}`);
    const next = src.indexOf('\nexports.', i + 1);
    return src.slice(i, next < 0 ? src.length : next);
}

/** Bỏ chú thích — tránh test khớp phải lời giải thích thay vì mã thật. */
function stripComments(code) {
    return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('startAttempt — KHÔNG trừ năng lượng', () => {
    const body = stripComments(bodyOf('startAttempt'));

    test('không có $inc energy âm', () => {
        // Đây chính là dòng đã ăn 2604⚡.
        expect(body).not.toMatch(/\$inc:\s*\{\s*energy:\s*-/);
    });

    test('VẪN kiểm đủ năng lượng để báo trước', () => {
        // Bỏ luôn phần kiểm là người dùng mở được đề rồi mới bị chặn ở câu đầu —
        // tệ hơn tình trạng cũ.
        expect(body).toMatch(/energyNeeded/);
        expect(body).toMatch(/toeicEnergyCost\(test\.totalQuestions\)/);
    });

    test('VẪN trừ vàng ngay — vàng không tự hồi', () => {
        // Hoãn trừ vàng là mở đường xem đề trả phí miễn phí: bấm Bắt đầu, đọc
        // câu hỏi, thoát trước khi trả lời.
        expect(body).toMatch(/\$inc:\s*\{\s*coins:\s*-coinCost\s*\}/);
    });

    test('thiếu năng lượng thì HOÀN vàng đã trừ', () => {
        const i = body.indexOf('energyNeeded');
        const before = body.slice(Math.max(0, i - 400), i);
        expect(before).toMatch(/\$inc:\s*\{\s*coins:\s*coinCost\s*\}/);
    });
});

describe('startAttempt — không vứt bài ĐÃ trả phí', () => {
    const body = stripComments(bodyOf('startAttempt'));

    test('chỉ đánh dấu abandoned cho bài energySpent = 0', () => {
        // Bài đã trả lời là bài đã TRẢ PHÍ; vứt nó là người dùng mất số năng
        // lượng đó mà không nhận lại gì.
        const i = body.indexOf("status: 'abandoned'");
        const filter = body.slice(body.lastIndexOf('updateMany', i), i);
        expect(filter).toMatch(/energySpent:\s*0/);
    });

    test('bài CŨ chưa có trường energySpent cũng được coi là chưa trả phí', () => {
        // 113 lượt thi có sẵn trong DB không có trường này; thiếu nhánh
        // `$exists: false` thì chúng không bao giờ bị dọn.
        const i = body.indexOf("status: 'abandoned'");
        const filter = body.slice(body.lastIndexOf('updateMany', i), i);
        expect(filter).toMatch(/energySpent:\s*\{\s*\$exists:\s*false\s*\}/);
    });
});

describe('submitAnswer — trừ ĐÚNG MỘT LẦN ở câu đầu', () => {
    const body = stripComments(bodyOf('submitAnswer'));

    test('có trừ năng lượng', () => {
        expect(body).toMatch(/\$inc:\s*\{\s*energy:\s*-energyCost\s*\}/);
    });

    test('chỉ trừ khi CHƯA trừ', () => {
        expect(body).toMatch(/if \(!attempt\.energySpent\)/);
    });

    test('chốt chống thu hai lần nằm trong FILTER, không phải if ở JS', () => {
        // Hai request nộp câu gần như đồng thời đều qua được `if` ở JS (cả hai
        // đọc energySpent = 0). Chỉ điều kiện trong filter của findOneAndUpdate
        // mới đảm bảo đúng một cái thắng.
        const i = body.indexOf('findOneAndUpdate');
        const call = body.slice(i, i + 300);
        expect(call).toMatch(/_id:\s*attempt\._id/);
        expect(call).toMatch(/energySpent:\s*0/);
        expect(call).toMatch(/\$set:\s*\{\s*energySpent:\s*energyCost\s*\}/);
    });

    test('chỉ trừ tiền khi GIÀNH được cờ', () => {
        // Trừ ngoài nhánh `if (claimed)` là request thua cuộc vẫn trừ tiền.
        const i = body.indexOf('if (claimed)');
        expect(i).toBeGreaterThan(-1);
        const inc = body.indexOf('$inc: { energy: -energyCost }');
        expect(inc).toBeGreaterThan(i);
    });

    test('trừ hụt thì TRẢ cờ về 0', () => {
        // Không trả cờ thì lượt này mang tiếng "đã trả phí" mà chưa trừ đồng nào,
        // và người dùng làm hết bài miễn phí.
        const i = body.indexOf('if (!paid)');
        const after = body.slice(i, i + 400);
        expect(after).toMatch(/\$set:\s*\{\s*energySpent:\s*0\s*\}/);
    });

    test('giá tính theo số câu của LƯỢT THI, không phải của đề', () => {
        // Đề có thể bị admin sửa số câu sau khi lượt thi đã tạo; tính lại theo
        // đề là thu tiền khác với thứ người dùng đang làm.
        expect(body).toMatch(/toeicEnergyCost\(attempt\.totalQuestions\)/);
    });
});

describe('model — trường energySpent', () => {
    test('có trong schema, mặc định 0', () => {
        // Mongoose ở chế độ `strict` XOÁ ÂM THẦM trường không khai: thiếu nó thì
        // cờ không bao giờ lưu được và năng lượng bị trừ lại mỗi câu trả lời.
        const path = ToeicAttempt.schema.path('energySpent');
        expect(path).toBeDefined();
        expect(path.instance).toBe('Number');
        expect(path.defaultValue).toBe(0);
    });

    test('lưu được giá trị và save() ghi nhận thay đổi', () => {
        const mongoose = require('mongoose');
        const d = new ToeicAttempt({
            userId: new mongoose.Types.ObjectId(),
            testId: new mongoose.Types.ObjectId(),
            totalQuestions: 30,
        });
        expect(d.energySpent).toBe(0);
        d.energySpent = 18;
        expect(d.modifiedPaths()).toContain('energySpent');
    });
});

describe('bảng giá năng lượng không đổi', () => {
    // Đổi chỗ THU không được đổi luôn GIÁ — người dùng sẽ tưởng mình bị tăng giá.
    const cost = (q) => Math.min(60, Math.max(5, Math.round(q * 0.6)));

    test('giá vẫn 0.6⚡/câu, kẹp trong [5, 60]', () => {
        expect(src).toMatch(/TOEIC_ENERGY_PER_Q\s*=\s*0\.6/);
        expect(src).toMatch(/TOEIC_ENERGY_MIN\s*=\s*5/);
        expect(src).toMatch(/TOEIC_ENERGY_MAX\s*=\s*60/);
    });

    test('các mốc quen thuộc giữ nguyên', () => {
        expect(cost(6)).toBe(5);      // chạm sàn
        expect(cost(30)).toBe(18);
        expect(cost(200)).toBe(60);   // chạm trần
    });
});
