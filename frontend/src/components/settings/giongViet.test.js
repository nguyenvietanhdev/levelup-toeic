/**
 * Ô chọn GIỌNG TIẾNG VIỆT trong Cài đặt — và nó KHÔNG bao giờ bị khoá.
 *
 * Hai ô giọng có sẵn gắn với KHO ĐANG HỌC: học bộ tiếng Trung thì ô giọng Anh
 * hiện huy hiệu "Không dùng" và bị mờ đi, vì kho đó thật sự không phát chữ tiếng
 * Anh nào. Đó là quy tắc đúng cho hai ô ấy.
 *
 * Tiếng Việt nằm ngoài quy tắc đó. Nó là mặt NGHĨA của cả ba kho (`en`, `zh`,
 * `bi`) nên phát ở mọi chế độ: đảo chiều (mặt hỏi chính là nghĩa tiếng Việt),
 * nút loa trên ô nghĩa, popup Dịch nhanh. Không kho nào làm nó im — nên khoá nó
 * theo kho là khoá một thứ vẫn đang kêu.
 *
 * Phần dưới đường ống đã có sẵn từ trước (`MA_GIONG` có ba mã `vi`, backend có
 * `vi-VN-HoaiMyNeural`/`NamMinhNeural`, `speakWord` đọc khoá `toeic_voice_vi`) —
 * chỉ màn Cài đặt là chưa bao giờ lộ nó ra.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MA_GIONG } from '@lib/giongDaChon.js';

const panel = readFileSync(join(__dirname, 'panels', 'SoundPanel.jsx'), 'utf8');
const screen = readFileSync(join(__dirname, 'SettingsScreen.jsx'), 'utf8');
const flag = readFileSync(join(__dirname, '..', '..', 'ui', 'FlagIcon.jsx'), 'utf8');
const tts = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'backend', 'routes', 'tts.js'), 'utf8');

/** Khối JSX của ô chọn giọng Việt. */
const khoiVi = (() => {
    const i = panel.indexOf('Giọng Tiếng Việt');
    expect(i, 'không tìm thấy ô giọng Tiếng Việt').toBeGreaterThan(-1);
    return panel.slice(panel.lastIndexOf('<div className', i), panel.indexOf('</div>\n\n', i));
})();

describe('có mặt trong Cài đặt', () => {
    test('ô chọn nằm trong mục "Giọng đọc"', () => {
        expect(panel.indexOf('<h3>Giọng đọc</h3>'))
            .toBeLessThan(panel.indexOf('Giọng Tiếng Việt'));
    });

    test('đứng SAU hai ô kia — tiếng Việt là mặt nghĩa, không phải mặt học', () => {
        expect(panel.indexOf('Giọng Tiếng Anh')).toBeLessThan(panel.indexOf('Giọng Tiếng Việt'));
        expect(panel.indexOf('Giọng Tiếng Trung')).toBeLessThan(panel.indexOf('Giọng Tiếng Việt'));
    });

    test('có nút "Thử" như hai ô kia', () => {
        expect(khoiVi).toMatch(/onClick=\{handleTestVoiceVi\}/);
    });

    test('có cờ Việt Nam, và `FlagIcon` vẽ được nó', () => {
        // `FlagIcon` trả `null` cho mã lạ — thiếu nhánh `vi` thì không lỗi gì
        // cả, chỉ là chỗ đó trống trong khi hai dòng trên đều có cờ.
        expect(khoiVi).toMatch(/<FlagIcon lang="vi"/);
        expect(flag).toMatch(/lang === 'vi'/);
    });
});

describe('KHÔNG bị khoá theo kho đang học', () => {
    test('không có `disabled`', () => {
        // Đây là điểm chính: hai ô kia khoá theo kho, ô này thì không.
        expect(khoiVi).not.toMatch(/disabled=/);
    });

    test('không có huy hiệu "Không dùng"', () => {
        expect(khoiVi).not.toMatch(/voice-inactive-badge/);
        expect(khoiVi).not.toMatch(/voice-select-inactive/);
    });

    test('không làm mờ', () => {
        expect(khoiVi).not.toMatch(/opacity:/);
    });

    test('KHÔNG đọc `vocabLang` để quyết định', () => {
        // Dù chỉ đọc để hiện chữ thì cũng là mở đường cho việc khoá nó sau này.
        expect(khoiVi).not.toMatch(/vocabLang|isZh|laSongNgu|tatEn|tatZh/);
    });

    test('hai ô kia VẪN khoá theo kho như cũ', () => {
        // Bỏ khoá cho tiếng Việt không được kéo theo bỏ khoá cả hai ô kia.
        expect(panel).toMatch(/const tatEn = isZh;/);
        expect(panel).toMatch(/const tatZh = !isZh && !laSongNgu;/);
    });
});

describe('các lựa chọn khớp với đường ống có sẵn', () => {
    /** Mã trong mọi `<option value="...">` của ô giọng Việt. */
    const maTrongO = [...khoiVi.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);

    test('có đủ hai giọng BẢN ĐỊA và mục tự động', () => {
        // Edge TTS chỉ có ĐÚNG hai giọng `vi-VN` trên tổng 322 — đã liệt kê
        // bằng `getVoices()`, không phải nhớ áng chừng.
        expect(maTrongO).toEqual(
            expect.arrayContaining(['__gtts_vi_random__', '__gtts_vi__', '__gtts_vi_m__']));
    });

    test('có thêm giọng ĐA NGÔN NGỮ, tách nhóm riêng', () => {
        // Muốn nhiều hơn hai thì phải mượn nhóm `*MultilingualNeural`. Tách
        // nhóm vì chúng không phải giọng Việt bản địa — người dùng phải biết
        // mình đang chọn gì.
        expect(khoiVi).toMatch(/<optgroup label="Giọng Việt bản địa">/);
        expect(khoiVi).toMatch(/<optgroup label="Đa ngôn ngữ/);
        for (const ma of ['__gtts_vi_emma__', '__gtts_vi_seraphina__',
            '__gtts_vi_andrew__', '__gtts_vi_brian__']) {
            expect(maTrongO).toContain(ma);
        }
    });

    test('MỌI khoá giọng Việt bắt đầu bằng `__gtts_vi`', () => {
        // `speakWord` nhận ra giọng hợp ngôn ngữ bằng đúng tiền tố này
        // (`savedVoiceName.startsWith('__gtts_vi')`). Đặt tên khác thì nó tưởng
        // giọng Anh và lặng lẽ đổi sang giọng Việt mặc định — chọn Emma vẫn ra
        // Hoài My, không báo gì.
        for (const ma of maTrongO) expect(ma.startsWith('__gtts_vi')).toBe(true);
    });

    test('"Tự động" chỉ bốc trong hai giọng BẢN ĐỊA', () => {
        // Chọn "tự động" là muốn đổi giọng cho đỡ chán, không phải muốn thử
        // nghiệm. Giọng đa ngôn ngữ phải tự chọn thì mới nhận được.
        const i = tts.indexOf("lang === 'vi-random'");
        expect(i).toBeGreaterThan(-1);
        const nhanh = tts.slice(i, tts.indexOf('} else', i));
        expect(nhanh).toMatch(/vi-VN-HoaiMyNeural/);
        expect(nhanh).toMatch(/vi-VN-NamMinhNeural/);
        expect(nhanh).not.toMatch(/Multilingual/);
    });

    test('mỗi lựa chọn trỏ tới MỘT giọng riêng', () => {
        // Hai ô khác nhau mà ra cùng một giọng thì một trong hai là vô nghĩa.
        const co = maTrongO.filter((m) => m !== '__gtts_vi_random__').map((m) => MA_GIONG[m]);
        expect(new Set(co).size).toBe(co.length);
    });

    test('MỌI mã trong ô đều có trong `MA_GIONG`', () => {
        // Mã không có trong bảng thì `maGiongDaChon` rơi về mặc định — người
        // dùng chọn giọng nam mà vẫn nghe giọng nữ, không báo gì.
        for (const ma of maTrongO) {
            expect(MA_GIONG[ma], `thiếu ${ma} trong MA_GIONG`).toBeTruthy();
        }
    });

    test('mã `/api/tts` mà chúng trỏ tới đều có giọng thật ở backend', () => {
        // Đây là mắt xích cuối; đứt ở đây thì backend lặng lẽ lùi về giọng Anh
        // và đọc tiếng Việt bằng giọng Mỹ.
        for (const ma of maTrongO) {
            const api = MA_GIONG[ma];
            const co = new RegExp(`'${api}':`).test(tts) || new RegExp(`lang === '${api}'`).test(tts);
            expect(co, `backend không biết mã ${api}`).toBe(true);
        }
    });

    test('nữ và nam là HAI giọng khác nhau', () => {
        expect(MA_GIONG['__gtts_vi__']).not.toBe(MA_GIONG['__gtts_vi_m__']);
    });

    test('giọng đa ngôn ngữ trỏ tới giọng `*Multilingual*` thật', () => {
        // Trỏ nhầm vào một giọng Anh THƯỜNG thì nó đánh vần tiếng Việt theo lối
        // chữ Latin — đo được: dài hơn giọng bản địa 8–27%, trong khi nhóm đa
        // ngôn ngữ ngắn hơn 3–7%.
        for (const ma of ['__gtts_vi_emma__', '__gtts_vi_seraphina__',
            '__gtts_vi_andrew__', '__gtts_vi_brian__']) {
            const api = MA_GIONG[ma];
            const i = tts.indexOf(`'${api}':`);
            expect(i, `backend thiếu ${api}`).toBeGreaterThan(-1);
            const cuoiDong = tts.indexOf(String.fromCharCode(10), i);
            expect(tts.slice(i, cuoiDong)).toMatch(/MultilingualNeural/);
        }
    });
});

describe('nối đủ dây từ màn Cài đặt', () => {
    for (const prop of [
        'selectedVoiceVi', 'handleVoiceChangeVi', 'handleTestVoiceVi',
    ]) {
        test(`\`${prop}\` truyền xuống panel và panel có nhận`, () => {
            // Truyền mà không nhận (hoặc ngược lại) thì ô chọn hiện ra nhưng
            // bấm không ăn — React không cảnh báo gì.
            expect(screen).toMatch(new RegExp(`${prop}=\\{${prop}\\}`));
            expect(panel).toMatch(new RegExp(`\\n\\s+${prop},`));
        });
    }

    test('giá trị đầu đọc từ localStorage, lùi về "tự động"', () => {
        const i = screen.indexOf('const [selectedVoiceVi');
        expect(i).toBeGreaterThan(-1);
        const than = screen.slice(i, i + 220);
        expect(than).toMatch(/localStorage\.getItem\('toeic_voice_vi'\)/);
        expect(than).toMatch(/__gtts_vi_random__/);
    });

    test('nút "Thử" đọc câu tiếng Việt CÓ DẤU, và nói rõ mã giọng', () => {
        // Câu không dấu thì `speakWord` nhận diện thành tiếng Anh; mà chỗ này
        // biết chắc nên truyền thẳng vẫn đúng hơn là để nó đoán.
        const i = screen.indexOf('const handleTestVoiceVi');
        const than = screen.slice(i, i + 220);
        expect(than).toMatch(/'vi-VN'/);
        expect(than).toMatch(/[àáảãạăâđêôơưèéíòóùúýỳ]/i);
    });
});
