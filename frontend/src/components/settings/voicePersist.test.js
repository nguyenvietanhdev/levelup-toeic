/**
 * Lựa chọn GIỌNG ĐỌC phải lưu theo TÀI KHOẢN, không chỉ máy hiện tại.
 *
 * Triệu chứng người dùng gặp: đăng nhập ở máy khác thì ô chọn giọng tiếng Trung
 * rơi về "Tự động — Random"; máy cũ vẫn nhớ nên rất dễ tưởng đã lưu rồi.
 *
 * Ba tầng đều thiếu, phải vá cả ba:
 *   1. `settingsSchema` bên server KHÔNG có trường giọng → Mongoose strip mất,
 *      kể cả khi client có gửi lên (strict mode mặc định).
 *   2. Handler chỉ ghi localStorage, không gọi `updateSetting`.
 *   3. Bộ đọc (gameLogic.speakWord) đọc THẲNG localStorage — máy mới rỗng thì
 *      lần phát âm đầu tiên đã sai giọng, dù server có dữ liệu.
 *
 * Trái nguyên tắc của dự án: MongoDB là nguồn chính, localStorage chỉ là bản
 * sao dự phòng.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const screen = readFileSync(join(__dirname, 'SettingsScreen.jsx'), 'utf8');
const state = readFileSync(join(__dirname, '..', '..', 'game', 'state.js'), 'utf8');
const schema = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'backend', 'models', 'UserProfile.js'), 'utf8');

describe('1. schema server nhận trường giọng', () => {
    test('có voiceEn / voiceZh / voiceVi / speechRate', () => {
        // Thiếu thì Mongoose strip mất, client gửi lên bao nhiêu lần cũng vô ích.
        expect(schema).toMatch(/voiceEn:\s*\{ type: String/);
        expect(schema).toMatch(/voiceZh:\s*\{ type: String/);
        expect(schema).toMatch(/voiceVi:\s*\{ type: String/);
        expect(schema).toMatch(/speechRate:\s*\{ type: Number/);
    });

    test('mặc định là chuỗi RỖNG, không phải "random"', () => {
        // Đặt sẵn '__gtts_random__' thì không phân biệt được "chưa từng chọn"
        // với "cố ý chọn random".
        expect(schema).toMatch(/voiceZh:\s*\{ type: String, default: '' \}/);
    });

    test('tốc độ đọc có chặn biên', () => {
        expect(schema).toMatch(/speechRate:[^}]*min:\s*50[^}]*max:\s*150/);
    });
});

describe('2. đổi giọng thì lưu lên server', () => {
    for (const [handler, key] of [
        ['handleVoiceChangeEn', 'voiceEn'],
        ['handleVoiceChangeZh', 'voiceZh'],
        ['handleVoiceChangeVi', 'voiceVi'],
        ['handleSpeechRate', 'speechRate'],
    ]) {
        test(`${handler} gọi updateSetting('${key}')`, () => {
            const i = screen.indexOf(`const ${handler} =`);
            expect(i).toBeGreaterThan(-1);
            const body = screen.slice(i, i + 400);
            expect(body).toMatch(new RegExp(`updateSetting\\('${key}'`));
        });
    }

    test('VẪN ghi localStorage — đọc được ngay, không chờ mạng', () => {
        expect(screen).toMatch(/localStorage\.setItem\('toeic_voice_zh', name\)/);
    });
});

describe('3. mở Cài đặt thì kéo giá trị từ server xuống', () => {
    test('đồng bộ cả bốn trường', () => {
        expect(screen).toMatch(/if \(st\.voiceEn\)/);
        expect(screen).toMatch(/if \(st\.voiceZh\)/);
        expect(screen).toMatch(/if \(st\.voiceVi\)/);
        expect(screen).toMatch(/if \(st\.speechRate\)/);
    });

    test('rỗng thì GIỮ giá trị đang có, không ghi đè', () => {
        // `if (st.voiceZh)` — chuỗi rỗng là falsy nên nhánh không chạy.
        expect(screen).not.toMatch(/setSelectedVoiceZh\(st\.voiceZh \|\| ''\)/);
    });
});

describe('4. máy mới phát âm ĐÚNG ngay lần đầu', () => {
    test('nạp hồ sơ xong thì sao giọng xuống localStorage', () => {
        // Bộ đọc lấy giọng thẳng từ localStorage; máy mới rỗng thì đọc sai giọng
        // cho tới khi người dùng mở màn Cài đặt.
        expect(state).toMatch(/localStorage\.setItem\('toeic_voice_en', st\.voiceEn\)/);
        expect(state).toMatch(/localStorage\.setItem\('toeic_voice_zh', st\.voiceZh\)/);
        expect(state).toMatch(/localStorage\.setItem\('toeic_voice_vi', st\.voiceVi\)/);
        expect(state).toMatch(/localStorage\.setItem\('toeic_speech_rate', String\(st\.speechRate\)\)/);
    });

    test('đặt SAU khi đã gộp settings từ server', () => {
        // Đặt trước thì `this.state.settings` chưa có dữ liệu server.
        const merge = state.indexOf("localStorage.getItem('userSettings')");
        const copy = state.indexOf("localStorage.setItem('toeic_voice_en'");
        expect(merge).toBeGreaterThan(-1);
        expect(copy).toBeGreaterThan(merge);
    });

    test('localStorage hỏng không làm sập quá trình nạp hồ sơ', () => {
        // Dò tới `catch` GẦN NHẤT sau lệnh ghi, không cắt theo số ký tự cố
        // định: khối này còn sao xuống các khoá khác nên mỗi lần thêm một dòng
        // là cửa sổ cắt lại hụt, test đỏ oan trong khi mã vẫn đúng.
        const i = state.indexOf("localStorage.setItem('toeic_voice_en'");
        expect(i).toBeGreaterThan(-1);
        const j = state.indexOf('} catch', i);
        expect(j).toBeGreaterThan(i);
        // Giữa lệnh ghi và `catch` không được có `try` mới — nếu có thì `catch`
        // bắt được là của khối trong, khối ngoài vẫn hở.
        expect(state.slice(i, j)).not.toMatch(/\btry\s*\{/);
    });

    test('có trong DEFAULT_SETTINGS để khôi phục mặc định không mất khoá', () => {
        expect(state).toMatch(/voiceEn: '',/);
        expect(state).toMatch(/voiceZh: '',/);
        expect(state).toMatch(/voiceVi: '',/);
        expect(state).toMatch(/speechRate: 80,/);
    });
});
