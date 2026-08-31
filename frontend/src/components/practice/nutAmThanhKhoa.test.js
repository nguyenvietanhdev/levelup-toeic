/**
 * Nối dây cho luật "đang phát thì không bấm được nút âm thanh".
 *
 * `lib/nutPhatAm.test.js` đã chốt bản thân bộ chặn chạy đúng. File này chốt ba
 * việc còn lại, vì cả ba đều hỏng KIỂU IM LẶNG — không lỗi, không cảnh báo:
 *
 *   1. `speakWord` phải bật/tắt khoá. Quên là bộ chặn không bao giờ chạy.
 *   2. MỌI nút âm thanh phải mang nhãn `js-nut-am`. Sót một nút thì đúng nút đó
 *      vẫn spam được.
 *   3. Nút DỊCH tuyệt đối KHÔNG mang nhãn: đang nghe vẫn phải tra được nghĩa.
 *
 * Và cái bug người dùng báo: kiểu `speak` của "Ôn lại từ sai" để nút loa cạnh
 * nút mic mà không chặn nhau, nên bấm được cả hai cùng lúc.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const D = join(__dirname, 'modes');
const gl = readFileSync(join(__dirname, '..', '..', 'game', 'gameLogic.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');
const rm = readFileSync(join(D, 'reviewMistakes.js'), 'utf8');
const pm = readFileSync(join(D, 'pronunciationMode.js'), 'utf8');

/** Mọi file có markup nút, gồm cả module dùng chung. */
const MOI_FILE = [
    ...readdirSync(D).filter((f) => f.endsWith('.js') && !f.includes('.test.'))
        .map((f) => [f, readFileSync(join(D, f), 'utf8')]),
    ['exampleBlock.js', readFileSync(join(__dirname, 'exampleBlock.js'), 'utf8')],
];

/** Mọi thẻ `<button ... class="...">` trong toàn bộ các file trên. */
const MOI_NUT = MOI_FILE.flatMap(([f, src]) =>
    [...src.matchAll(/<button[^>]*class="([^"]+)"([^>]*)>/g)]
        .map((m) => ({ f, lop: m[1], con: m[2] })));

describe('`speakWord` bật/tắt khoá', () => {
    test('khoá NGAY khi bắt đầu phát', () => {
        const i = gl.indexOf('speakWord(text, lang = null, onEnd = null) {');
        expect(i).toBeGreaterThan(-1);
        expect(gl.slice(i, i + 700)).toMatch(/const _theLuot = batDauPhat\(\);/);
    });

    test('mở khoá khi phát XONG, qua `onEnd` đã bọc', () => {
        // Bọc ở một chỗ thay vì bắt 43 nơi gọi tự nhớ.
        const i = gl.indexOf('const _theLuot = batDauPhat();');
        expect(gl.slice(i, i + 500)).toMatch(/ketThucPhat\(_theLuot\)/);
    });

    test('vẫn gọi `onEnd` của nơi gọi, không nuốt mất', () => {
        // Nuốt mất thì nhịp chuyển câu của Trắc nghiệm đứng im vĩnh viễn.
        const i = gl.indexOf('const _theLuot = batDauPhat();');
        expect(gl.slice(i, i + 500)).toMatch(/if \(_gocOnEnd\) _gocOnEnd\(\);/);
    });

    test('`onend` và `onerror` cùng bắn cũng chỉ tính MỘT lần', () => {
        const i = gl.indexOf('const _theLuot = batDauPhat();');
        expect(gl.slice(i, i + 500)).toMatch(/if \(_daBao\) return;/);
    });

    test('gắn `onend` KHÔNG điều kiện', () => {
        // Bản cũ chỉ gắn khi nơi gọi có truyền `onEnd` — mà đa số thì không.
        // Giữ `if (onEnd)` là nhánh giọng hệ điều hành không bao giờ mở khoá.
        expect(gl).toMatch(/^\s*utterance\.onend = onEnd;$/m);
        const i = gl.indexOf('utterance.onend = onEnd;');
        expect(gl.slice(i - 200, i)).not.toMatch(/if \(onEnd\) \{\s*$/);
    });

    test('`stopSpeaking` mở khoá bất kể lượt nào', () => {
        // Không mở thì một cú lật thẻ khoá cứng mọi nút loa tới hết hạn chờ.
        const i = gl.indexOf('stopSpeaking() {');
        expect(gl.slice(i, gl.indexOf('\n    },', i))).toMatch(/ketThucPhat\(null\)/);
    });
});

describe('mọi nút ÂM THANH đều mang nhãn', () => {
    /** Nút có phải nút âm thanh không — nhận qua tiêu đề và biểu tượng. */
    const laNutAm = (n) =>
        /volume-up|microphone/.test(n.con) || /Nghe|phát âm|mic/i.test(n.con)
        || /play-audio-btn|mic-button|rm-mic-btn/.test(n.lop);

    const nutAm = MOI_NUT.filter(laNutAm);

    test('tìm được đủ nhiều nút để phép kiểm có nghĩa', () => {
        // Danh sách rỗng thì test dưới luôn xanh mà không kiểm gì.
        expect(nutAm.length).toBeGreaterThanOrEqual(12);
    });

    test('KHÔNG nút âm thanh nào thiếu `js-nut-am`', () => {
        const thieu = nutAm.filter((n) => !/\bjs-nut-am\b/.test(n.lop))
            .map((n) => `${n.f}: ${n.lop}`);
        expect(thieu, `thiếu nhãn: ${thieu.join(' | ')}`).toEqual([]);
    });

    test('cả nút MIC cũng mang nhãn', () => {
        // Đây là nửa còn lại của bug: đang phát mẫu mà bấm mic được thì máy ghi
        // lại chính tiếng loa của mình.
        for (const lop of ['mic-button', 'rm-mic-btn']) {
            const n = MOI_NUT.find((x) => x.lop.includes(lop));
            expect(n, `không tìm thấy .${lop}`).toBeTruthy();
            expect(n.lop).toMatch(/\bjs-nut-am\b/);
        }
    });
});

describe('nút DỊCH tuyệt đối KHÔNG mang nhãn', () => {
    test('không nút dịch nào bị khoá theo', () => {
        // Đang nghe vẫn phải tra được nghĩa — hai việc chẳng liên quan gì nhau.
        const nutDich = MOI_NUT.filter((n) =>
            /Dịch/i.test(n.con) || /fa-language/.test(n.con)
            || /translate|-tr"/.test(n.lop) || /translate|-tr"/.test(n.con));
        expect(nutDich.length).toBeGreaterThanOrEqual(3);
        const dinh = nutDich.filter((n) => /\bjs-nut-am\b/.test(n.lop))
            .map((n) => `${n.f}: ${n.lop}`);
        expect(dinh, `nút dịch bị khoá nhầm: ${dinh.join(' | ')}`).toEqual([]);
    });

    test('CSS chỉ nhắm `.js-nut-am`, không nhắm cả `.btn-speak-mini`', () => {
        expect(css).toMatch(/body\.dang-phat-am \.js-nut-am \{/);
        expect(css).not.toMatch(/body\.dang-phat-am \.btn-speak-mini/);
    });
});

describe('mic và loa không chồng nhau — CẢ HAI chiều', () => {
    test('"Ôn từ sai": bấm loa thì DỪNG ghi âm trước', () => {
        // Chiều này bộ chặn chung không lo được: lúc bấm loa chưa có tiếng nào
        // đang phát, nên chưa có gì để khoá. Không dừng ghi thì máy ghi lại
        // chính tiếng loa rồi chấm điểm trên đó.
        const i = rm.indexOf("getElementById('rm-speak-btn')");
        expect(i).toBeGreaterThan(-1);
        const than = rm.slice(i, rm.indexOf('});', i));
        expect(than).toMatch(/this\._dungNghe\(\)/);
        // Và phải dừng TRƯỚC khi phát.
        expect(than.indexOf('_dungNghe')).toBeLessThan(than.indexOf('speakWord'));
    });

    test('"Phát âm": bấm loa cũng dừng ghi trước (vốn đã đúng)', () => {
        const i = pm.indexOf('speakSample(text) {');
        const than = pm.slice(i, pm.indexOf('\n    },', i));
        expect(than).toMatch(/if \(this\.isListening\)/);
        expect(than.indexOf('isListening')).toBeLessThan(than.indexOf('speakWord'));
    });

    test('"Phát âm": đang phát mẫu thì KHÔNG bật mic được', () => {
        // Giữ nguyên lớp chặn sẵn có của chế độ này — bộ chặn chung là lớp thứ
        // hai, không phải lớp thay thế.
        const i = pm.indexOf('toggleListening() {');
        expect(pm.slice(i, i + 260)).toMatch(/if \(this\._speaking\) return;/);
    });
});
