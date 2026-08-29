/**
 * "Ôn lại từ sai" có thêm kiểu PHÁT ÂM — đủ bộ nghe · nói · đọc · viết.
 *
 * Chỗ dễ hỏng nhất: Web Speech API chỉ có ở Chrome/Edge. Chế độ Phát âm riêng
 * gặp trình duyệt không hỗ trợ thì thoát cả lượt được, nhưng ở đây các kiểu
 * ĐAN XEN — một câu nói giữa lượt trên Firefox là kẹt cứng, không có nút nào
 * đi tiếp.
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'modes', 'reviewMistakes.js'), 'utf8');
const panel = readFileSync(
    join(__dirname, '..', 'settings', 'panels', 'ReviewPanel.jsx'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

/** Nạp các hàm thuần từ nguồn, với `GameState` giả. */
function napBoChon(settings = {}) {
    const i = src.indexOf('const KIEU_HOI');
    const j = src.indexOf('export const ReviewMistakes');
    const GameState = { state: { settings } };
    return new Function('GameState',
        `${src.slice(i, j)}; return { chonKieu, kieuDuocPhep, KIEU_HOI, locTheoTu };`
    )(GameState);
}

/** Giả lập trình duyệt CÓ / KHÔNG có Web Speech API. */
const datSR = (co) => {
    if (co) window.SpeechRecognition = function () {};
    else { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; }
};

afterEach(() => datSR(false));

describe('đủ bộ nghe · nói · đọc · viết', () => {
    const M = napBoChon();

    test('`speak` nằm trong danh sách kiểu', () => {
        expect(M.KIEU_HOI).toContain('speak');
    });

    test('xếp giữa `listen` và `scramble`', () => {
        // Nói ra được là hơn nhận mặt chữ, nhưng vẫn dễ hơn gõ đúng chính tả.
        // Thứ tự này quyết định cả vòng xoay lẫn hướng lùi khi kiểu bị tắt.
        const i = M.KIEU_HOI.indexOf('speak');
        expect(M.KIEU_HOI[i - 1]).toBe('listen');
        expect(M.KIEU_HOI[i + 1]).toBe('scramble');
    });

    test('bốn kỹ năng đều có mặt', () => {
        const co = (k) => expect(M.KIEU_HOI).toContain(k);
        co('listen');    // nghe
        co('speak');     // nói
        co('choice');    // đọc
        co('hanzi');     // viết
    });
});

describe('trình duyệt KHÔNG hỗ trợ thì bỏ kiểu này', () => {
    let M;
    beforeEach(() => { M = napBoChon(); });

    test('không có Web Speech API → `speak` bị lọc', () => {
        datSR(false);
        const duoc = M.locTheoTu([...M.KIEU_HOI], { en: 'apple' });
        expect(duoc).not.toContain('speak');
    });

    test('CÓ Web Speech API → `speak` được giữ', () => {
        datSR(true);
        const duoc = M.locTheoTu([...M.KIEU_HOI], { en: 'apple' });
        expect(duoc).toContain('speak');
    });

    test('nhận cả tiền tố `webkit`', () => {
        // Chrome/Safari đời cũ chỉ có bản webkit.
        delete window.SpeechRecognition;
        window.webkitSpeechRecognition = function () {};
        expect(M.locTheoTu([...M.KIEU_HOI], { en: 'apple' })).toContain('speak');
    });

    test('KHÔNG bao giờ ra `speak` khi trình duyệt không hỗ trợ', () => {
        // Đây mới là điều thật sự quan trọng: một câu nói lọt vào giữa lượt
        // trên Firefox là kẹt cứng.
        datSR(false);
        const cp = M.kieuDuocPhep();
        for (let i = 0; i < 16; i++) {
            expect(M.chonKieu({ en: 'apple' }, cp, i)).not.toBe('speak');
        }
    });

    test('người dùng CHỈ bật `speak` mà máy không hỗ trợ → rơi về `choice`', () => {
        // Không được trả rỗng: lượt trống thì không có gì để ôn.
        datSR(false);
        const M2 = napBoChon({ reviewKinds: ['speak'] });
        expect(M2.chonKieu({ en: 'apple' }, M2.kieuDuocPhep(), 0)).toBe('choice');
    });
});

describe('câu hỏi và giao diện', () => {
    test('sinh câu `speak` giữ từ và nghĩa', () => {
        const i = src.indexOf("if (kieu === 'speak')");
        expect(i).toBeGreaterThan(-1);
        const than = src.slice(i, i + 250);
        expect(than).toMatch(/word, kieu, correctAnswer: word\.vn/);
    });

    test('mặt chữ HIỆN (khác kiểu nghe)', () => {
        // Phải nhìn thấy từ mới đọc được — chỉ `listen` mới che mặt chữ.
        const i = src.indexOf('rm-word-text');
        const dong = src.slice(i, i + 200);
        expect(dong).toMatch(/kieu === 'listen' \?/);
        expect(dong).not.toMatch(/kieu === 'speak'/);
    });

    test('có nút mic và ô hiện chữ máy nghe được', () => {
        const i = src.indexOf("if (question.kieu === 'speak') {");
        expect(i).toBeGreaterThan(-1);
        const than = src.slice(i, i + 900);
        expect(than).toMatch(/id="rm-mic"/);
        expect(than).toMatch(/id="rm-heard"/);
        expect(than).toMatch(/id="rm-speak-skip"/);   // lối thoát
    });

    test('CSS có nút mic và trạng thái đang nghe', () => {
        expect(css).toMatch(/\.rm-mic-btn \{/);
        expect(css).toMatch(/\.rm-mic-btn\.is-listening \{/);
        expect(css).toMatch(/\.rm-heard \{/);
    });

    test('Cài đặt có ô tick "Phát âm"', () => {
        expect(panel).toMatch(/key: 'speak'/);
        expect(panel).toMatch(/Phát âm/);
    });
});

describe('chấm điểm và dọn mic', () => {
    const than = (() => {
        const i = src.indexOf('ganPhatAm(question) {');
        expect(i).toBeGreaterThan(-1);
        return src.slice(i, src.indexOf('\n    },', i));
    })();

    test('dùng lại bộ chấm của chế độ Phát âm', () => {
        // Viết lại phép so bằng `===` là bỏ sót ca máy tự thêm trợ từ tiếng
        // Trung — người học đọc chuẩn mà bị chấm sai.
        expect(src).toMatch(/import \{ scoreAttempt, feedbackMessage \}/);
        expect(than).toMatch(/scoreAttempt\(chu, Array\.from\(kq\), tu, laZh\)/);
    });

    test('ngôn ngữ nhận dạng theo CHỮ của từ, không theo cài đặt', () => {
        // Lượt ôn trộn từ của mọi bộ; đặt `en-US` cho một từ chữ Hán là máy
        // nghe ra một tràng vô nghĩa và người học bị chấm sai dù đọc chuẩn.
        expect(than).toMatch(/const laZh = HAN_RE\.test\(tu\)/);
        expect(than).toMatch(/rec\.lang = laZh \? 'zh-CN' : 'en-US'/);
    });

    test('KHÔNG chấm trên kết quả tạm', () => {
        // Bản tạm đổi liên tục trong lúc nói; chấm sớm là ăn oan một lượt.
        expect(than).toMatch(/if \(!kq\.isFinal\)/);
        const iTam = than.indexOf('if (!kq.isFinal)');
        const iCham = than.indexOf('scoreAttempt(');
        expect(iTam).toBeLessThan(iCham);
    });

    test('không nghe được gì thì KHÔNG chấm sai', () => {
        // Phạt phải dành cho lỗi phát âm, không phải cho mic chưa bắt được.
        const iEnd = than.indexOf('rec.onend');
        const khoi = than.slice(iEnd, than.indexOf('rec.onerror'));
        expect(iEnd).toBeGreaterThan(-1);
        expect(khoi).not.toMatch(/ketThucCau/);
    });

    test('dừng mic khi sang câu khác và khi rời chế độ', () => {
        // Bỏ chạy thì nó còn nghe sang câu sau, đèn mic trình duyệt vẫn sáng.
        const iKt = src.indexOf('ketThucCau(dung, question, dapAn) {');
        expect(src.slice(iKt, iKt + 500)).toMatch(/this\._dungNghe\(\)/);

        const iCl = src.indexOf('cleanup() {');
        expect(src.slice(iCl, iCl + 400)).toMatch(/this\._dungNghe\(\)/);
    });

    test('`_dungNghe` gọi `abort` và xoá tham chiếu', () => {
        const i = src.indexOf('_dungNghe() {');
        const t = src.slice(i, src.indexOf('\n    },', i));
        expect(t).toMatch(/abort\(\)/);
        expect(t).toMatch(/this\._rec = null/);
    });
});
