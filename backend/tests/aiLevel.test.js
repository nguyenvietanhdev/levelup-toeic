/**
 * Mức khó dùng chung cho MỌI chế độ AI.
 *
 * Trước đây mỗi chế độ tự lo, và hai chế độ cũ thì không lo gì cả: Hội thoại
 * cứng ở "beginner level" trong prompt — người Level 18, đúng mốc mở khoá của
 * chính nó, vẫn nhận hội thoại vỡ lòng — còn Viết luận không có khái niệm mức
 * khó nào.
 *
 * Chỗ dễ hỏng nhất là mức bị RƠI VỀ mặc định ở đâu đó giữa chừng: hội thoại đặt
 * mức "Khó" lúc mở màn rồi các lượt đáp sau lại dễ dần, mà không có gì báo.
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { MUC, KEYS, chuanHoaMuc, chiThiMuc, nhanMuc } = require('../services/aiLevel');

describe('chuẩn hoá mức', () => {
    test('nhận ba mức hợp lệ', () => {
        for (const k of ['easy', 'medium', 'hard']) expect(chuanHoaMuc(k)).toBe(k);
    });

    test('hoa thường và khoảng trắng đều nhận', () => {
        expect(chuanHoaMuc(' HARD ')).toBe('hard');
    });

    test('giá trị lạ → medium, KHÔNG ném lỗi', () => {
        // Mức khó chỉ ảnh hưởng độ khó của đề; chặn cả lượt vì nó thì không đáng.
        for (const v of ['bịa', '', null, undefined, 42, {}]) {
            expect(chuanHoaMuc(v)).toBe('medium');
        }
    });

    test('KHÔNG nhận khoá kế thừa từ Object.prototype', () => {
        // `in` sẽ cho `constructor` lọt qua, rồi tra bảng ra `undefined`.
        for (const v of ['constructor', 'toString', 'hasOwnProperty']) {
            expect(chuanHoaMuc(v)).toBe('medium');
        }
    });
});

describe('chỉ thị gửi cho AI', () => {
    test('mỗi mức có chỉ thị riêng, khác nhau', () => {
        const ds = KEYS.map(chiThiMuc);
        expect(new Set(ds).size).toBe(3);
    });

    test('dùng khung CEFR, không dùng chữ mơ hồ', () => {
        // Bảo "trung bình" thì mỗi lần sinh ra một mức khác; "B1" thì ổn định.
        for (const m of MUC) expect(m.prompt).toMatch(/CEFR/);
    });

    test('độ khó TĂNG DẦN theo thứ tự khai báo', () => {
        expect(MUC.map((m) => m.key)).toEqual(['easy', 'medium', 'hard']);
        expect(chiThiMuc('easy')).toMatch(/simple|short/i);
        expect(chiThiMuc('hard')).toMatch(/complex|precise/i);
    });

    test('mức lạ vẫn ra chỉ thị, không trả undefined', () => {
        // `undefined` ghép vào prompt thành chuỗi "undefined" gửi cho model.
        expect(typeof chiThiMuc('bịa')).toBe('string');
        expect(chiThiMuc('bịa').length).toBeGreaterThan(0);
    });

    test('nhãn tiếng Việt cho mọi mức, kể cả mức lạ', () => {
        for (const m of MUC) expect(m.vi.length).toBeGreaterThan(0);
        expect(nhanMuc('bịa')).toBe('Vừa');
    });
});

describe('bốn chế độ AI đều dùng mức khó', () => {
    const doc = (p) => readFileSync(join(__dirname, '..', p), 'utf8');
    const convAi = doc('services/conversationAi.js');
    const convCtrl = doc('controllers/conversationController.js');
    const essayAi = doc('services/essayGrader.js');
    const essayCtrl = doc('controllers/essayController.js');
    const convModel = doc('models/Conversation.js');

    test('Hội thoại KHÔNG còn cứng ở beginner', () => {
        // Đây là bug thật: mốc mở khoá của chế độ là Level 18, mà nội dung thì
        // luôn ở trình độ vỡ lòng.
        expect(convAi).not.toMatch(/Stay at beginner level/);
        expect(convAi).toMatch(/chiThiMuc\(level\)/);
    });

    test('Hội thoại LƯU mức vào phiên', () => {
        // `replyTurn` chạy ở request KHÁC với `openConversation`; không lưu thì
        // mọi lượt đáp sau lượt đầu rơi về mặc định và hội thoại tự dễ đi giữa
        // chừng — không có gì báo.
        expect(convModel).toMatch(/level: \{ type: String, enum: \['easy', 'medium', 'hard'\]/);
        expect(convCtrl).toMatch(/level: convo\.level/);
    });

    test('mức được GHI vào phiên lúc tạo', () => {
        // Khai trường trong schema mà quên truyền lúc `create` thì mọi phiên
        // lưu `medium` mặc định: chọn "Khó" chỉ có tác dụng ở lượt mở màn, rồi
        // các lượt sau đọc `convo.level` ra `medium` và hội thoại dễ lại.
        const i = convCtrl.indexOf('Conversation.create(');
        expect(i).toBeGreaterThan(-1);
        const goi = convCtrl.slice(i, convCtrl.indexOf('});', i));
        expect(goi).toMatch(/^\s*level,\s*$/m);
    });

    test('lượt đáp đọc mức từ PHIÊN, không nhận từ client', () => {
        // Client khai mức khác giữa chừng là đổi độ khó sau khi đã bắt đầu.
        const i = convCtrl.indexOf('replyTurn({');
        const goi = convCtrl.slice(i, convCtrl.indexOf('});', i));
        expect(goi).toMatch(/level: convo\.level/);
        expect(goi).not.toMatch(/req\.body\.level/);
    });

    test('Viết luận nhận mức khi xin đề', () => {
        expect(essayCtrl).toMatch(/chuanHoaMuc\(req\.body\.level\)/);
        expect(essayAi).toMatch(/chiThiMuc\(level\)/);
    });

    test('Viết luận chèn chỉ thị vào CẢ HAI ngôn ngữ', () => {
        // Hai prompt riêng (IELTS và HSK); chèn một chỗ thì bên kia im lặng bỏ
        // qua mức khó.
        expect(essayAi.split('chiThiMuc(level)').length - 1).toBe(2);
    });

    test('mức luôn qua `chuanHoaMuc` trước khi dùng', () => {
        // Đi thẳng `req.body.level` vào prompt là để client tự viết chỉ thị.
        for (const [ten, src] of [['conv', convCtrl], ['essay', essayCtrl]]) {
            const i = src.indexOf('req.body.level');
            expect(i).toBeGreaterThan(-1);
            const truoc = src.slice(Math.max(0, i - 40), i);
            expect(`${ten}:${truoc}`).toMatch(/chuanHoaMuc\($/);
        }
    });
});
