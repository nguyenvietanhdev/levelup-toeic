/**
 * Chấm phát âm: nhanh hơn, và bớt chấm oan.
 *
 * ── LỖI CHẤM OAN, HỎNG KIỂU IM LẶNG ─────────────────────────────────────────
 * `SpeechRecognitionResult` là mảng-giống các `SpeechRecognitionAlternative` —
 * mỗi phần tử là OBJECT có `.transcript`, KHÔNG phải chuỗi. "Ôn lại từ sai"
 * chuyền thẳng `Array.from(kq)` vào bộ chấm, nên cả 5 bản đoán biến thành cùng
 * một chuỗi `"[object speechrecognitionalternative]"` và không bao giờ khớp.
 *
 * Đo trên ca thật: nói "brand", máy đoán đầu ra "bread" và để "brand" ở hạng 2.
 * Chế độ Phát âm (chuyền chuỗi) chấm ĐÚNG; "Ôn lại từ sai" chấm SAI — cùng một
 * lượt nói. Không lỗi, không cảnh báo, chỉ là `maxAlternatives = 5` bị trả tiền
 * rồi vứt đi.
 *
 * Nên bộ chấm nhận CẢ HAI kiểu ngay tại cửa vào. Bắt từng nơi gọi tự nhớ thì
 * nơi nào quên là lỗi lại im lặng y hệt.
 *
 * ── CHỜ LÂU ─────────────────────────────────────────────────────────────────
 * Web Speech không chốt khi người học nói xong — nó đợi im lặng một quãng
 * (Chrome 1–2 giây) rồi mới phát `isFinal`. Cả quãng đó màn hình đứng im.
 *
 * Khi bản TẠM đã khớp hẳn từ cần nói thì không còn gì để đợi: gọi `stop()` cho
 * bộ nhận dạng chốt ngay. Đây là rút ngắn thời gian CHỜ, không phải chấm sớm —
 * điểm vẫn tính trên kết quả cuối, không luật chấm nào đổi.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    scoreAttempt, chotSomDuoc, normalize,
} from './modes/pronunciationScoring.js';

const review = readFileSync(join(__dirname, 'modes', 'reviewMistakes.js'), 'utf8');
const mode = readFileSync(join(__dirname, 'modes', 'pronunciationMode.js'), 'utf8');

/** Giả đúng thứ Web Speech trả về: mảng các Alternative. */
const nhuWebSpeech = (...chu) => chu.map((t) => ({ transcript: t, confidence: 0.9 }));

describe('bản đoán thay thế phải THẬT SỰ được xét', () => {
    test('nhận Alternative dạng OBJECT', () => {
        // Đây chính là ca hỏng: người học nói đúng "brand", máy để nó ở hạng 2.
        const r = scoreAttempt('bread', nhuWebSpeech('bread', 'brand'), 'brand', false);
        expect(r.correct).toBe(true);
        expect(r.matchedRank).toBe(2);
    });

    test('nhận Alternative dạng CHUỖI y như cũ', () => {
        // Chế độ Phát âm vẫn tự `.map(a => a.transcript)` trước khi gọi — không
        // được làm hỏng đường đó.
        const r = scoreAttempt('bread', ['bread', 'brand'], 'brand', false);
        expect(r.correct).toBe(true);
        expect(r.matchedRank).toBe(2);
    });

    test('hai kiểu cho ra CÙNG một kết quả', () => {
        // Cùng một lượt nói mà hai chế độ chấm khác nhau là điều vô lý người
        // dùng nhìn thấy được.
        const chu = ['你好吗', '你好'];
        expect(scoreAttempt('你好吗', nhuWebSpeech(...chu), '你好', true))
            .toEqual(scoreAttempt('你好吗', chu, '你好', true));
    });

    test('object KHÔNG có `transcript` thì bỏ qua, không thành chuỗi rác', () => {
        // Chuỗi rác dài có thể ăn điểm `similarity` cao hơn bản đoán thật và
        // cướp mất `matchedRank`.
        const r = scoreAttempt('bread', [{}, null, { transcript: 'brand' }], 'brand', false);
        expect(r.correct).toBe(true);
    });

    test('`normalize` không còn biến object thành `[object ...]`', () => {
        expect(normalize({ transcript: 'Hello.' }, false)).toBe('hello');
        expect(normalize({}, false)).toBe('');
        expect(normalize(null, false)).toBe('');
    });

    test('"Ôn lại từ sai" vẫn chuyền cả mảng bản đoán', () => {
        // Chỉ chuyền bản tốt nhất là bỏ hẳn 4 bản còn lại — quay về đúng chỗ
        // vừa sửa, chỉ theo đường khác.
        expect(review).toMatch(/scoreAttempt\(chu, Array\.from\(kq\), tu, laZh\)/);
    });
});

describe('`chotSomDuoc` — chỉ chốt khi CHẮC', () => {
    test('bản tạm khớp hẳn → chốt', () => {
        expect(chotSomDuoc('你好', '你好', true)).toBe(true);
        expect(chotSomDuoc('Brand.', 'brand', false)).toBe(true);
    });

    test('mới nói được một phần → CHƯA chốt', () => {
        // `拿` trên đường tới `拿铁`: chốt ở đây là cắt lời giữa chừng.
        expect(chotSomDuoc('拿', '拿铁', true)).toBe(false);
        expect(chotSomDuoc('super', 'supermarket', false)).toBe(false);
    });

    test('GẦN đúng thì KHÔNG chốt — đó là lúc cần đợi thêm nhất', () => {
        // Bản tạm rất hay tự sửa lại thành đúng ở nhịp cuối; chốt sớm là khoá
        // luôn bản chưa sửa.
        expect(chotSomDuoc('你好吗', '你好', true)).toBe(false);
        expect(chotSomDuoc('bread', 'brand', false)).toBe(false);
    });

    test('rỗng thì không chốt', () => {
        expect(chotSomDuoc('', 'brand', false)).toBe(false);
        expect(chotSomDuoc('brand', '', false)).toBe(false);
        expect(chotSomDuoc(null, null, false)).toBe(false);
    });

    test('bỏ qua dấu câu và hoa thường như lúc chấm', () => {
        // Dùng khác luật với `scoreAttempt` thì có lượt chốt sớm rồi lại bị
        // chấm sai — mâu thuẫn ngay trong một lượt.
        expect(chotSomDuoc('  BRAND!  ', 'brand', false)).toBe(true);
        expect(chotSomDuoc('你好。', '你好', true)).toBe(true);
    });
});

describe('cả hai chế độ đều chốt sớm', () => {
    for (const [ten, src, goi] of [
        ['Ôn lại từ sai', review, /this\._rec\?\.stop\(\)/],
        ['Phát âm', mode, /this\.recognition\?\.stop\(\)/],
    ]) {
        test(`${ten}: gọi \`stop()\` khi bản tạm đã khớp`, () => {
            expect(src).toMatch(/chotSomDuoc\(/);
            expect(src).toMatch(goi);
        });

        test(`${ten}: chốt sớm nằm trong nhánh bản TẠM`, () => {
            // Đặt ở nhánh kết quả cuối thì vô nghĩa — lúc đó đã chốt xong rồi.
            const i = src.indexOf('chotSomDuoc(');
            const iCuoi = src.indexOf('isFinal');
            expect(i).toBeGreaterThan(iCuoi);
            // Và phải TRƯỚC lời gọi chấm điểm.
            expect(i).toBeLessThan(src.indexOf('scoreAttempt('));
        });

        test(`${ten}: vẫn KHÔNG chấm trên bản tạm`, () => {
            // Cả điểm của cách làm này: rút ngắn thời gian chờ mà không đụng
            // một luật chấm nào.
            const i = src.indexOf('chotSomDuoc(');
            const khoi = src.slice(i - 400, i + 300);
            expect(khoi).not.toMatch(/scoreAttempt\(/);
        });
    }

    test('"Ôn lại từ sai" chốt theo ĐÚNG từ đang hỏi và đúng hệ chữ', () => {
        // Truyền nhầm mặt nghĩa vào đây thì chốt sớm cho một chuỗi không liên
        // quan, và lượt nói bị cắt ngang.
        expect(review).toMatch(/chotSomDuoc\(chu, tu, laZh\)/);
    });

    test('Phát âm chốt theo CÂU khi đang đọc câu', () => {
        // Chế độ đọc câu có đích là `cauDoc`, không phải `currentWord`.
        expect(mode).toMatch(/chotSomDuoc\(transcript, this\.cauDoc \|\| this\.currentWord, this\._isZh\(\)\)/);
    });

    test('`stop()` bọc try/catch', () => {
        // Gọi `stop()` trên bộ nhận dạng đã dừng thì trình duyệt ném lỗi, và
        // lỗi đó nổ ngay giữa `onresult` — mất luôn kết quả cuối.
        for (const src of [review, mode]) {
            const i = src.indexOf('.stop(); } catch');
            expect(i).toBeGreaterThan(-1);
        }
    });
});

describe('lỗi mic không được im lặng', () => {
    const than = (() => {
        const i = mode.indexOf('rec.onerror = (event) => {');
        return mode.slice(i, mode.indexOf('\n        };', i));
    })();

    test('có nhánh cuối cho MỌI lỗi còn lại', () => {
        // `network`, `audio-capture`, `service-not-allowed` trước đây rơi vào
        // khoảng trống: bấm mic, không nghe, không chấm, không một chữ nào trên
        // màn hình. Người học ngồi chờ một lượt không bao giờ tới.
        expect(than).toMatch(/\} else \{/);
        expect(than).toMatch(/Mic gặp sự cố/);
    });

    test('lỗi lạ KHÔNG trừ lượt thử', () => {
        // Cùng lý do với `no-speech`: phạt phải dành cho lỗi phát âm.
        const i = than.indexOf('} else {');
        expect(than.slice(i)).toMatch(/this\._resultHandled = false;/);
    });

    test('`aborted` được kể tên riêng và KHÔNG báo gì', () => {
        // Chính ta huỷ khi sang câu khác hay rời chế độ. Không kể tên thì nó
        // rơi vào nhánh cuối và hiện thông báo lỗi cho một việc bình thường.
        expect(than).toMatch(/event\.error === 'aborted'/);
        const i = than.indexOf("event.error === 'aborted'");
        expect(than.slice(i, than.indexOf('} else', i))).not.toMatch(/Notification\.show/);
    });
});
