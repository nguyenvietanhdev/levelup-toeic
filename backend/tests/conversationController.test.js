/**
 * Controller chế độ Hội thoại.
 *
 * Đọc mã nguồn thay vì dựng request thật: ba endpoint này cần DB + nhà cung cấp
 * AI, mà thứ cần khoá lại đều là những QUYẾT ĐỊNH nhìn thấy trong mã — và mỗi
 * cái là một lỗ hổng nếu thiếu:
 *
 *   1. Trừ năng lượng TRƯỚC khi gọi AI, và HOÀN lại khi AI lỗi. Sai thứ tự thì
 *      người không đủ năng lượng vẫn làm ta tốn token; không hoàn thì người
 *      dùng mất năng lượng mà chẳng được gì.
 *   2. Trừ năng lượng NGUYÊN TỬ. Kiểm rồi mới trừ ở hai bước thì hai request
 *      song song cùng qua bước kiểm và trừ hai lần.
 *   3. Mọi truy vấn phiên phải lọc theo `userId`. Thiếu là ai biết id cũng
 *      đọc/ghi được hội thoại của người khác.
 *   4. `usedWords` tính LẠI ở server. Cộng dồn từ client là client tự khai
 *      thưởng cho chính mình.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'conversationController.js'), 'utf8');
const routes = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'conversation.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const ctrl = require('../controllers/conversationController');

/** Thân một hàm exports, cắt tới `};` ở cột 0. */
function body(name) {
    const i = src.indexOf(`exports.${name} = async`);
    expect(i).toBeGreaterThan(-1);
    const j = src.indexOf('\n};', i);
    expect(j).toBeGreaterThan(i);
    return src.slice(i, j);
}

describe('route được gắn và có bảo vệ', () => {
    test('mọi route đều cần đăng nhập', () => {
        // Mỗi lượt là một request tính tiền theo token — để trần là hoá đơn
        // không giới hạn, đúng lỗi routes/ai.js từng mắc.
        expect(routes).toMatch(/router\.use\(protect\)/);
    });

    test('khoá theo Level ở SERVER, không chỉ ẩn mục menu', () => {
        // Menu bên đã khoá mục này, nhưng đó chỉ là giao diện — gọi thẳng API là
        // lách được, và "lách được" ở đây nghĩa là người chưa đủ Level vẫn tiêu
        // token của ta.
        expect(routes).toMatch(/requireLevel\('feature:conversation'\)/);
    });

    test('CHỈ khoá `start`, không khoá reply/finish', () => {
        // `reply`/`finish` là phiên ĐANG chạy. Chặn cả hai thì người vừa tụt
        // Level (admin sửa, hoặc mốc bị nâng) mắc kẹt giữa hội thoại — đã trừ
        // năng lượng mà không chốt được để nhận thưởng.
        const reply = routes.match(/router\.post\('\/:id\/reply'[^\n]*/)[0];
        const finish = routes.match(/router\.post\('\/:id\/finish'[^\n]*/)[0];
        expect(reply).not.toMatch(/requireLevel/);
        expect(finish).not.toMatch(/requireLevel/);
    });

    test('mốc Level đã khai trong seed', () => {
        const seed = fs.readFileSync(
            path.join(__dirname, '..', 'scripts', 'seedFeatureUnlocks.js'), 'utf8');
        const m = seed.match(/key: 'feature:conversation'[^\n]*requiredLevel: (\d+)/);
        if (!m) throw new Error('thiếu mốc mở khoá cho Hội thoại trong seed');
        expect(Number(m[1])).toBeGreaterThan(0);
    });

    test('có đủ ba endpoint', () => {
        expect(routes).toMatch(/router\.post\('\/start'/);
        expect(routes).toMatch(/router\.post\('\/:id\/reply'/);
        expect(routes).toMatch(/router\.post\('\/:id\/finish'/);
    });

    test('đã gắn vào server', () => {
        expect(server).toMatch(/app\.use\('\/api\/conversation', require\('\.\/routes\/conversation'\)\)/);
    });
});

describe('năng lượng — thứ tự và tính nguyên tử', () => {
    const start = () => body('start');

    test('trừ năng lượng TRƯỚC khi gọi AI', () => {
        const b = start();
        const charge = b.indexOf('chargeEnergy');
        const ai = b.indexOf('openConversation(');
        expect(charge).toBeGreaterThan(-1);
        expect(ai).toBeGreaterThan(-1);
        expect(charge).toBeLessThan(ai);
    });

    test('AI lỗi thì HOÀN năng lượng', () => {
        // Người dùng không được gì mà vẫn mất năng lượng là lỗi tệ nhất ở đây.
        const b = start();
        const i = b.indexOf('if (!ai.success)');
        expect(i).toBeGreaterThan(-1);
        expect(b.slice(i, i + 500)).toMatch(/\$inc: \{ energy: ENERGY_COST \}/);
    });

    test('KHÔNG hoàn cho VIP — họ chưa bị trừ', () => {
        const b = start();
        const i = b.indexOf('if (!ai.success)');
        expect(b.slice(i, i + 500)).toMatch(/if \(!charge\.vip\)/);
    });

    test('trừ nguyên tử: điều kiện $gte nằm TRONG truy vấn', () => {
        // Kiểm rồi mới trừ ở hai bước riêng thì hai request song song cùng vượt
        // qua bước kiểm và trừ hai lần.
        expect(src).toMatch(/energy: \{ \$gte: ENERGY_COST \}/);
        expect(src).toMatch(/\$inc: \{ energy: -ENERGY_COST \}/);
    });

    test('VIP được miễn trừ', () => {
        expect(src).toMatch(/isVipActive\(current\)/);
    });
});

describe('phân quyền — không đọc được phiên của người khác', () => {
    test.each(['reply', 'finish'])('%s lọc theo userId', (name) => {
        expect(body(name)).toMatch(/findOne\(\{ _id: req\.params\.id, userId: req\.user\.id \}\)/);
    });
});

describe('điểm và thưởng do SERVER tính', () => {
    test('reply tính LẠI usedWords từ turns', () => {
        // Cộng dồn từ client là client tự khai thưởng cho chính mình.
        expect(body('reply')).toMatch(/collectUsed\(convo\.turns, convo\.targetWords, convo\.lang\)/);
    });

    test('finish tính LẠI lần cuối, không tin usedWords đã lưu', () => {
        // Đây là bước ra tiền.
        expect(body('finish')).toMatch(/collectUsed\(convo\.turns/);
    });

    test('KHÔNG nhận điểm/thưởng từ req.body', () => {
        // Đọc `req.body.usedWords`/`xp`/`coins` là để client tự khai giá trị.
        expect(src).not.toMatch(/req\.body\.(usedWords|xp|coins|reward)/);
    });

    test('chặn nhận thưởng HAI LẦN', () => {
        const b = body('finish');
        expect(b).toMatch(/if \(convo\.reward\.claimed\)/);
        expect(b).toMatch(/claimed: true/);
    });

    test('gọi lại sau khi đã nhận trả 200 kèm cờ, KHÔNG phải lỗi', () => {
        // Mạng chập rồi gọi lại là chuyện thường; báo lỗi ở đó làm người dùng
        // tưởng mất thưởng.
        const b = body('finish');
        const i = b.indexOf('if (convo.reward.claimed)');
        const seg = b.slice(i, i + 300);
        expect(seg).toMatch(/alreadyClaimed: true/);
        expect(seg).not.toMatch(/status\(4\d\d\)/);
    });
});

describe('chặn lạm dụng', () => {
    test('có trần số lượt', () => {
        // Mỗi lượt là một lần gọi AI có phí — phiên chạy vô hạn là hoá đơn vô hạn.
        expect(ctrl.MAX_TURNS).toBeGreaterThan(0);
        expect(body('reply')).toMatch(/turns\.length >= MAX_TURNS/);
    });

    test('cắt độ dài câu gửi lên', () => {
        // Không cắt thì người dùng nhồi 100KB vào prompt.
        expect(src).toMatch(/MAX_REPLY_LEN/);
        expect(body('reply')).toMatch(/\.slice\(0, MAX_REPLY_LEN\)/);
    });

    test('không đáp được phiên đã kết thúc', () => {
        expect(body('reply')).toMatch(/convo\.status !== 'active'/);
    });
});

describe('lấy từ vựng', () => {
    test('dò CẢ kho chung LẪN kho riêng của người dùng', () => {
        // Cùng một `source` có thể nằm ở một trong hai. Dò một chỗ là mất hẳn
        // nửa dữ liệu, mà danh sách rỗng trông y như "part này chưa có từ".
        const i = src.indexOf('async function fetchWords');
        const b = src.slice(i, src.indexOf('\n}', i));
        expect(b).toMatch(/SharedModel\.find/);
        expect(b).toMatch(/UserUpload\.find/);
    });

    test('chọn đúng model theo ngôn ngữ', () => {
        expect(src).toMatch(/lang === 'zh' \? VocabularyZh : Vocabulary/);
    });

    test('ưu tiên từ ĐÃ SAI', () => {
        // Đây là chỗ tính năng hơn một chatbot thường: app biết người học yếu từ
        // nào nên nhắm đúng chỗ đó.
        const i = src.indexOf('async function pickTargets');
        const b = src.slice(i, src.indexOf('\n}', i));
        expect(b).toMatch(/WrongWord\.find/);
        expect(b).toMatch(/\[\.\.\.weak, \.\.\.rest\]/);
    });

    test('dùng đúng trường `en` của WrongWord', () => {
        // Model đó KHÔNG có trường `word` — đoán sai tên là danh sách "từ yếu"
        // luôn rỗng, mà không lỗi nào báo.
        const WrongWord = require('../models/WrongWord');
        expect(Object.keys(WrongWord.schema.paths)).toContain('en');
        expect(src).toMatch(/select\('en'\)/);
    });

    test('bộ từ quá ít thì báo rõ, không mở phiên rỗng', () => {
        const b = body('start');
        expect(b).toMatch(/words\.length < 4/);
        expect(b).toMatch(/ít nhất 4 từ/);
    });
});

describe('hằng số công khai cho giao diện', () => {
    test('xuất ra để client hiện giá và trần lượt', () => {
        expect(ctrl.ENERGY_COST).toBeGreaterThan(0);
        expect(ctrl.TARGET_SIZE).toBeGreaterThan(0);
        expect(ctrl.XP_PER_WORD).toBeGreaterThan(0);
        expect(ctrl.COINS_PER_WORD).toBeGreaterThan(0);
    });
});
