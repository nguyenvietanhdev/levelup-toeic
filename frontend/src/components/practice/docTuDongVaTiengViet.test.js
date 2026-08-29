/**
 * Bốn thay đổi quanh phát âm và khôi phục trạng thái.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const F = (...p) => readFileSync(join(__dirname, ...p), 'utf8');
const eb = F('exampleBlock.js');
const gl = F('..', '..', 'game', 'gameLogic.js');
const ts = F('..', 'vocab', 'topic', 'topicSelector.js');
const mc = F('modes', 'multipleChoice.js');

describe('tự đọc câu ví dụ khi TẮT chuyển câu tự động', () => {
    test('đọc khi `autoAdvance` tắt', () => {
        // Bật tự chuyển → câu trôi sau vài giây, tiếng nói bị cắt giữa chừng.
        // Tắt → người học đang dừng lại đọc, đúng lúc để nghe.
        expect(eb).toMatch(/const tuChuyen = GameState\.state\?\.settings\?\.autoAdvance !== false/);
        expect(eb).toMatch(/if \(!tuChuyen\)/);
    });

    test('`!== false` chứ không `=== true`', () => {
        // Mặc định của cài đặt này là BẬT; hồ sơ cũ chưa có trường đó thì
        // `undefined` phải hiểu là bật, không phải tắt.
        expect(eb).not.toMatch(/autoAdvance === true/);
    });

    test('hoãn một nhịp để không chồng lên giọng đọc TỪ', () => {
        expect(eb).toMatch(/const DOI_TRUOC_KHI_DOC = \d+/);
        expect(eb).toMatch(/}, DOI_TRUOC_KHI_DOC\)/);
    });

    test('bỏ nếu đã sang câu khác trong lúc hoãn', () => {
        const i = eb.indexOf('if (!tuChuyen)');
        expect(eb.slice(i, i + 400)).toMatch(/modeObj\.currentIndex !== idxLucGoiDoc/);
    });
});

describe('F5 không mất đề đã chọn', () => {
    test('nạp danh sách đề TRƯỚC khi khôi phục', () => {
        // Không nạp thì `availableTopics` rỗng → `find()` undefined → rơi xuống
        // đề mặc định, mà `_loadDefaultTopic` cũng thoát ngay khi rỗng → KHÔNG
        // có đề nào cả.
        const i = ts.indexOf('async restoreLastTopic()');
        const truoc = ts.slice(i, ts.indexOf("Storage.get('selectedTopic')", i));
        expect(truoc).toMatch(/await this\.loadAvailableTopics\(\)/);
    });

    test('chỉ nạp khi danh sách rỗng, không gọi thừa', () => {
        const i = ts.indexOf('async restoreLastTopic()');
        expect(ts.slice(i, i + 900)).toMatch(/if \(this\.availableTopics\.length === 0\)/);
    });

    test('mạng hỏng vẫn chạy tiếp, không ném', () => {
        const i = ts.indexOf('async restoreLastTopic()');
        expect(ts.slice(i, i + 900)).toMatch(/catch \{[^}]*\}/);
    });
});

describe('phát âm tiếng Việt', () => {
    const thanSpeak = () => {
        const i = gl.indexOf('speakWord(text, lang');
        return gl.slice(i, gl.indexOf('\n    async _speakGoogleTTS', i));
    };

    test('nhận diện chữ có dấu tiếng Việt', () => {
        expect(thanSpeak()).toMatch(/const isViText = /);
    });

    test('KHÔNG nhầm chữ Hán thành tiếng Việt', () => {
        // Chữ Hán kiểm trước và `isViText` loại nó ra.
        expect(thanSpeak()).toMatch(/isViText = !isZhText/);
    });

    test('có khoá giọng riêng cho tiếng Việt', () => {
        // Soi ĐIỀU KIỆN dẫn tới khoá đó, không phải "có chuỗi ở đâu đó":
        // `false ? 'toeic_voice_vi'` vẫn khớp mà khoá thì không bao giờ dùng.
        expect(thanSpeak()).toMatch(/: heChu === 'vi' \? 'toeic_voice_vi'/);
    });

    test('gTTS có ánh xạ giọng Việt', () => {
        // Bảng ánh xạ nay nằm ở module dùng chung (`lib/giongDaChon.js`) —
        // popup Dịch nhanh cũng cần nó, chép rời là hai bản sẽ lệch.
        const bang = readFileSync(join(__dirname, '..', '..', 'lib', 'giongDaChon.js'), 'utf8');
        expect(bang).toMatch(/'__gtts_vi_random__':\s*'vi-random'/);
        expect(bang).toMatch(/'__gtts_vi__':\s*'vi-vn-f'/);
        // Và `gameLogic` phải dùng chính bảng đó.
        expect(gl).toMatch(/const accentMap = MA_GIONG;/);
    });

    test('giọng sai ngôn ngữ bị đổi sang giọng Việt', () => {
        expect(thanSpeak()).toMatch(/heChu === 'vi' && !isViVoice.*__gtts_vi_random__/);
    });

    test('tiền tố lọc giọng khai MỘT lần, dùng chung', () => {
        // Ba nhánh cùng cần nó; chép rời là chỗ để lệch.
        const t = thanSpeak();
        expect(t).toMatch(/const tienToNgonNgu = /);
        expect((t.match(/tienToNgonNgu/g) || []).length).toBeGreaterThanOrEqual(3);
    });
});

describe('đảo chiều vẫn có nút loa', () => {
    test('nút loa KHÔNG còn bị ẩn khi đảo chiều', () => {
        expect(mc).not.toMatch(/\$\{!isReversed \? `<button class="btn-speak"/);
        expect(mc).toMatch(/<button class="btn-speak" id="speak-word-btn"/);
    });

    test('đọc thứ ĐANG HIỆN, không luôn luôn `word.en`', () => {
        // Đảo chiều thì mặt hỏi là nghĩa — đọc `en` là đọc mất đáp án ra loa.
        const i = mc.indexOf("getElementById('speak-word-btn')");
        const t = mc.slice(i, i + 700);
        expect(t).toMatch(/speakWord\(q\.question \|\| q\.word\.en\)/);
    });

    test('KHÔNG truyền cứng ngôn ngữ', () => {
        // `speakWord` tự nhận diện hệ chữ; truyền vào là ghi đè mất phần đó.
        const i = mc.indexOf("getElementById('speak-word-btn')");
        expect(mc.slice(i, i + 700)).not.toMatch(/speakWord\([^)]*'en-US'/);
    });
});
