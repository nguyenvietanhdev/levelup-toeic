/**
 * `saveState` chỉ được ghi những khoá settings ĐÃ KHAI trong schema.
 *
 * Bản cũ: `Object.assign(profile.settings, state.settings)` — nhận BẤT KỲ khoá
 * nào client gửi. Mongoose `strict` strip khoá lạ khi validate, nhưng
 * `markModified('settings')` ngay sau đó ép ghi cả nhánh, nên rác vẫn vào DB.
 *
 * Hậu quả THẬT đã gặp: `settings.selectedSource` mang giá trị "conversations"
 * (tên một collection Mongo), không phải mã đề nào cả. Rồi chế độ Hội thoại đọc
 * trường đó và đi tìm bộ từ không tồn tại — lỗi hiện ra ở chỗ khác hoàn toàn so
 * với chỗ gây ra nó.
 */
const mongoose = require('mongoose');
const UserProfile = require('../models/UserProfile');

/** Danh sách khoá hợp lệ, lấy từ chính schema. */
const allowed = Object.keys(
    UserProfile.schema.path('settings')?.schema?.paths || {}
);

describe('danh sách khoá lấy từ SCHEMA, không viết tay', () => {
    test('đọc được và không rỗng', () => {
        // Viết tay danh sách thì thêm setting mới là quên cập nhật, và setting
        // đó âm thầm không lưu được.
        expect(allowed.length).toBeGreaterThan(10);
    });

    test('có những khoá chế độ Hội thoại cần', () => {
        expect(allowed).toContain('selectedSource');
        expect(allowed).toContain('selectedPart');
        expect(allowed).toContain('vocabLang');
    });
});

describe('controller lọc theo danh sách đó', () => {
    // Bỏ COMMENT trước khi dò: chú thích trong controller có nhắc chính
    // `Object.assign(profile.settings, state.settings)` để giải thích vì sao
    // KHÔNG dùng nó nữa — dò thẳng là đọc trúng lời văn của mình và test đỏ oan.
    const src = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'controllers', 'userStateController.js'),
        'utf8'
    )
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !/^\s*\/\//.test(l))
        .join('\n');

    test('KHÔNG còn Object.assign thẳng vào settings', () => {
        expect(src).not.toMatch(/Object\.assign\(profile\.settings, state\.settings\)/);
    });

    test('lấy danh sách khoá từ MODEL, không từ instance', () => {
        // Instance có thể chưa khởi tạo `settings` (hồ sơ cũ) — lúc đó danh sách
        // rỗng và KHÔNG khoá nào được ghi, mất sạch cài đặt mà không lỗi nào báo.
        expect(src).toMatch(/UserProfile\.schema\.path\('settings'\)/);
    });

    test('bỏ qua _id và __v', () => {
        // Ghi hai trường này là làm hỏng document.
        expect(src).toMatch(/k === '_id' \|\| k === '__v'/);
    });

    test('chỉ ghi khoá client THỰC SỰ gửi', () => {
        // Duyệt danh sách rồi gán tất cả là ghi `undefined` lên những setting
        // client không gửi — xoá sạch cài đặt của người dùng.
        expect(src).toMatch(/hasOwnProperty\.call\(state\.settings, k\)/);
    });
});

describe('hành vi lọc — mô phỏng đúng vòng lặp của controller', () => {
    function applyLikeController(profile, incoming) {
        for (const k of allowed) {
            if (k === '_id' || k === '__v') continue;
            if (Object.prototype.hasOwnProperty.call(incoming, k)) {
                profile.settings[k] = incoming[k];
            }
        }
        return profile;
    }

    function fresh() {
        return new UserProfile({
            userId: new mongoose.Types.ObjectId(),
            username: 'tester',
        });
    }

    test('khoá lạ bị BỎ QUA hoàn toàn', () => {
        const p = applyLikeController(fresh(), {
            vocabLang: 'zh',
            conversations: 'rác',        // đúng kiểu rác đã thấy trong DB
            __proto__polluted: true,
        });
        expect(p.settings.vocabLang).toBe('zh');
        expect(p.settings.conversations).toBeUndefined();
    });

    test('khoá hợp lệ vẫn ghi được', () => {
        const p = applyLikeController(fresh(), {
            selectedSource: 'hsk1',
            selectedPart: 'FREFIX-C',
        });
        expect(p.settings.selectedSource).toBe('hsk1');
        expect(p.settings.selectedPart).toBe('FREFIX-C');
    });

    test('KHÔNG xoá cài đặt mà client không gửi', () => {
        // Client chỉ gửi một khoá thì những khoá khác phải GIỮ NGUYÊN, không bị
        // ghi `undefined` lên.
        const p = fresh();
        p.settings.selectedSource = 'hsk1';
        p.settings.speechRate = 120;
        applyLikeController(p, { vocabLang: 'zh' });
        expect(p.settings.selectedSource).toBe('hsk1');
        expect(p.settings.speechRate).toBe(120);
    });
});
