/**
 * Cài đặt phải theo TÀI KHOẢN, không theo máy.
 *
 * App cho đăng nhập nhiều thiết bị cùng một tài khoản. Trước đây `state.js` GHI
 * ĐÈ giá trị vừa lấy từ server bằng bản trong localStorage, nên hướng đồng bộ bị
 * ngược: máy cũ luôn thắng máy mới. Đổi ở điện thoại, mở máy tính là thấy giá
 * trị cũ — mà không có dấu hiệu gì để đoán ra.
 *
 * Giờ localStorage chỉ còn là BẢN SAO DỰ PHÒNG: chỉ LẤP CHỖ TRỐNG (`undefined`)
 * cho tài khoản chưa từng lưu lên server, không được đè lên server.
 *
 * Test đọc mã nguồn vì đây là thứ tự merge trong `init()` — dựng được nó cần cả
 * mạng lẫn IndexedDB, còn thứ tự thì đọc thẳng là thấy.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'state.js'), 'utf8');

/** Mười khoá vừa chuyển từ localStorage lên server. */
const SYNCED = [
    'vocabLang', 'levelFilter', 'reverseMode', 'timeLimitEnabled', 'questionTime',
    'autoAdvance', 'toeicPerQuestionTimer', 'toeicAutoAdvance', 'toeicTransition',
    'toeicCustomPartMin',
];

describe('localStorage KHÔNG được đè lên server', () => {
    test('userSettings chỉ lấp chỗ trống', () => {
        // `Object.assign(settings, userSettings)` là bản cũ — đè sạch.
        expect(src).toMatch(
            /for \(const \[k, v\] of Object\.entries\(userSettings\)\) \{\s*if \(this\.state\.settings\[k\] === undefined\) this\.state\.settings\[k\] = v;/
        );
        expect(src).not.toMatch(/Object\.assign\(\s*this\.state\.settings,\s*userSettings\s*\)/);
    });

    test('vocabLang và practiceSoundEnabled cũng vậy', () => {
        for (const key of ['vocabLang', 'practiceSoundEnabled']) {
            const re = new RegExp(
                'if \\(this\\.state\\.settings\\.' + key + ' === undefined\\)');
            if (!re.test(src)) throw new Error(`${key} vẫn ghi đè giá trị từ server`);
        }
    });
});

describe('server → localStorage', () => {
    test('hydrate lại các khoá mà mã cũ còn đọc thẳng từ localStorage', () => {
        // Vài chỗ (QuickSettings, luyện tập) đọc localStorage trước khi
        // GameState sẵn sàng. Không chép ngược xuống thì máy mới hiện mặc định.
        for (const key of ['reverseMode', 'vocabLang', 'practiceSoundEnabled']) {
            const re = new RegExp("localStorage\\.setItem\\('" + key + "'");
            if (!re.test(src)) throw new Error(`${key} không được chép về localStorage`);
        }
    });
});

describe('schema server khai đủ mười khoá', () => {
    const model = readFileSync(
        join(__dirname, '..', '..', '..', 'backend', 'models', 'UserProfile.js'), 'utf8');

    test.each(SYNCED)('%s có trong settingsSchema', (key) => {
        // Mongoose `strict` LOẠI BỎ ÂM THẦM trường không khai — client gửi lên
        // bao nhiêu lần cũng vô ích, không lỗi nào báo.
        expect(model).toMatch(new RegExp('^\\s*' + key + ':\\s*\\{', 'm'));
    });

    test('theme KHÔNG được khai — nền sáng/tối thuộc về thiết bị', () => {
        expect(model).not.toMatch(/^\s*theme:\s*\{/m);
    });
});

describe('nơi người dùng đổi giá trị phải lưu lên server', () => {
    test('SettingsScreen: Đảo chiều đi qua updateSetting', () => {
        const s = readFileSync(
            join(__dirname, '..', 'components', 'settings', 'SettingsScreen.jsx'), 'utf8');
        expect(s).toMatch(/updateSetting\('reverseMode'/);
    });

    test('QuickSettings: đổi Đảo chiều ghi vào GameState rồi save', () => {
        // Chỉ `localStorage.setItem` là dừng ở máy đó.
        const q = readFileSync(join(__dirname, '..', 'layouts', 'QuickSettings.jsx'), 'utf8');
        const i = q.indexOf('const handleReverse');
        expect(i).toBeGreaterThan(-1);
        const body = q.slice(i, i + 500);
        expect(body).toMatch(/GameState\.state\.settings\.reverseMode = next/);
        expect(body).toMatch(/GameState\.save\?\.\(\)/);
    });
});
