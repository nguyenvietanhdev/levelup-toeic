/**
 * Chấm phát âm — ranh giới "gần đúng" phải đúng chỗ.
 *
 * Bản cũ chấm bằng `===` tuyệt đối: nói `你好` mà máy nghe thành `你好吗` (nó tự
 * chèn trợ từ) thì tính SAI, ngang với nói sai hoàn toàn. Người học không phân
 * biệt được mình đang tiến bộ hay không.
 *
 * Hai lần chỉnh ngưỡng đầu đều SAI, và chỉ lộ ra khi chạy số thật:
 *
 *   1. Ngưỡng tỉ lệ 0.8 — `你好` vs `你好吗` ra 0.67 nên trượt. Từ tiếng Trung đa
 *      số 2 chữ, mọi sai lệch 1 chữ đều rơi xuống 0.5–0.67, nên ngưỡng tỉ lệ gần
 *      như không bao giờ kích hoạt.
 *   2. "Từ ngắn cho lệch 1 ký tự" — hỏng nặng hơn: `买` vs `卖`, hai chữ khác hẳn
 *      và nghĩa ngược nhau, cũng lệch đúng 1 nên được tính ĐẠT.
 *
 * Quy tắc cuối phân biệt theo LOẠI sai, không theo độ dài:
 *   - thừa/thiếu ở hai đầu → máy nhận dạng chèn/nuốt chữ, cho qua
 *   - thay ký tự → phát ra âm khác, KHÔNG cho qua, dù chỉ lệch một ký tự
 */
import { describe, test, expect } from 'vitest';
import {
    normalize, editDistance, similarity, isNear, scoreAttempt, feedbackMessage,
    scoreSentence, sentenceFeedback,
} from './pronunciationScoring.js';

describe('normalize', () => {
    test('tiếng Trung: bỏ dấu câu và mọi khoảng trắng', () => {
        expect(normalize('你好，我是越南人。', true)).toBe('你好我是越南人');
        expect(normalize('你 好', true)).toBe('你好');
    });

    test('tiếng Anh: thường hoá, gộp khoảng trắng, bỏ dấu câu', () => {
        expect(normalize('  Hello,  World! ', false)).toBe('hello world');
    });

    test('đầu vào rỗng/null không ném lỗi', () => {
        expect(normalize(null, true)).toBe('');
        expect(normalize(undefined, false)).toBe('');
    });
});

describe('editDistance — đếm đúng ký tự Unicode', () => {
    test('chữ Hán tính là MỘT ký tự, không phải hai', () => {
        // Dùng .length của chuỗi JS thì `你` ổn nhưng ký tự ngoài BMP sẽ tính 2.
        expect(editDistance('你好', '你好吗')).toBe(1);
        expect(editDistance('中国人', '中国')).toBe(1);
    });

    test('chuỗi rỗng', () => {
        expect(editDistance('', 'abc')).toBe(3);
        expect(editDistance('abc', '')).toBe(3);
        expect(editDistance('', '')).toBe(0);
    });
});

describe('isNear — CHO QUA máy chèn/nuốt chữ', () => {
    test('máy tự thêm trợ từ ở cuối — người học nói chuẩn', () => {
        // Đây là ca đã làm hỏng ngưỡng tỉ lệ 0.8 (chỉ ra 0.67).
        expect(isNear('你好吗', '你好')).toBe(true);
    });

    test('máy nuốt mất chữ cuối của từ dài', () => {
        expect(isNear('中国', '中国人')).toBe(true);
        expect(isNear('我是越南', '我是越南人')).toBe(true);
    });

    test('tiếng Anh thừa một chữ cái', () => {
        expect(isNear('pronounciation', 'pronunciation')).toBe(true);
    });

    test('giống hệt', () => {
        expect(isNear('social', 'social')).toBe(true);
    });
});

describe('isNear — KHÔNG cho qua khi phát ra âm khác', () => {
    test('买 vs 卖 — lệch đúng 1 ký tự nhưng nghĩa ngược nhau', () => {
        // Ca đã làm hỏng quy tắc "từ ngắn cho lệch 1".
        expect(isNear('卖', '买')).toBe(false);
        expect(isNear('买', '卖')).toBe(false);
    });

    test('thay một chữ trong từ 2 chữ', () => {
        expect(isNear('媒休', '媒体')).toBe(false);
    });

    test('nói mỗi nửa từ không tính là nói được cả từ', () => {
        expect(isNear('你', '你好')).toBe(false);
    });

    test('tiếng Anh sai âm', () => {
        expect(isNear('bread', 'brand')).toBe(false);
        expect(isNear('medium', 'media')).toBe(false);
    });

    test('rỗng luôn trượt — im lặng không phải là gần đúng', () => {
        expect(isNear('', '你好')).toBe(false);
        expect(isNear('你好', '')).toBe(false);
    });
});

describe('scoreAttempt — dùng thứ hạng của alternatives', () => {
    test('khớp hẳn ở hạng đầu = chuẩn nhất', () => {
        const r = scoreAttempt('你好', [], '你好', true);
        expect(r.correct).toBe(true);
        expect(r.matchedRank).toBe(0);
        expect(r.similarity).toBe(1);
    });

    test('đúng nhưng nằm ở hạng sau — vẫn tính đúng, và GIỮ thứ hạng', () => {
        // Bản cũ chỉ hỏi "có bản nào khớp không" rồi coi hạng 3 chuẩn ngang hạng 1.
        // Thứ hạng là thông tin thật: máy nghe ra thứ khác trước = nói chưa rõ.
        const r = scoreAttempt('你号', ['你豪', '你好'], '你好', true);
        expect(r.correct).toBe(true);
        expect(r.matchedRank).toBe(2);
    });

    test('gần đúng khi không bản nào khớp hẳn', () => {
        const r = scoreAttempt('你好吗', [], '你好', true);
        expect(r.correct).toBe(true);
        expect(r.near).toBe(true);
    });

    test('sai hẳn', () => {
        const r = scoreAttempt('再见', [], '你好', true);
        expect(r.correct).toBe(false);
        expect(r.near).toBe(false);
    });

    test('không nói gì', () => {
        const r = scoreAttempt('', [], '你好', true);
        expect(r.correct).toBe(false);
        expect(r.heard).toBe('');
    });

    test('alternatives null không ném lỗi', () => {
        expect(() => scoreAttempt('你好', null, '你好', true)).not.toThrow();
    });
});

describe('feedbackMessage — nói RÕ sai ở đâu', () => {
    test('chuẩn ở hạng đầu', () => {
        const r = scoreAttempt('你好', [], '你好', true);
        expect(feedbackMessage(r, '你好', true)).toMatch(/chuẩn/i);
    });

    test('đúng nhưng hạng sau → nhắc nói dứt khoát hơn', () => {
        const r = scoreAttempt('你号', ['你豪', '你好'], '你好', true);
        expect(feedbackMessage(r, '你好', true)).toMatch(/chưa thật rõ/i);
    });

    test('gần đúng → hiện % và chữ máy nghe được', () => {
        const r = scoreAttempt('你好吗', [], '你好', true);
        const msg = feedbackMessage(r, '你好', true);
        expect(msg).toMatch(/你好吗/);
        expect(msg).toMatch(/%/);
    });

    test('không nghe thấy gì → bảo nói to hơn, KHÔNG nói "sai"', () => {
        const r = scoreAttempt('', [], '你好', true);
        expect(feedbackMessage(r, '你好', true)).toMatch(/không nghe rõ/i);
    });

    test('sai hẳn → cho biết máy nghe thành gì', () => {
        const r = scoreAttempt('再见', [], '你好', true);
        expect(feedbackMessage(r, '你好', true)).toMatch(/再见/);
    });
});

/**
 * Nối ghép vào PronunciationMode: chấm và hiển thị chạy đúng trong luồng thật.
 *
 * Phần trên test logic thuần. Phần này test chỗ dễ hỏng hơn: bật interimResults
 * mà quên sửa onresult thì bản tạm bị bỏ qua hoàn toàn — bật cũng như không, và
 * KHÔNG có dấu hiệu gì báo.
 */
describe('PronunciationMode — chấm và phản hồi', () => {
    let mode;

    beforeEach(async () => {
        const m = await import('./pronunciationMode.js');
        mode = Object.create(m.PronunciationMode);
        document.body.innerHTML = `
            <div id="practice-content">
                <div id="mic-status"></div>
                <div id="recognition-result" style="display:none"></div>
                <div id="attempts-dots"></div>
            </div>`;
        mode.config = { maxAttempts: 3, questionsPerRound: 10 };
        mode.currentWord = '你好';
        mode.currentAttempts = 0;
        mode.wordCompleted = false;
        mode.questions = [{ word: { vn: 'xin chào' }, wordPk: '你好' }];
        mode.currentIndex = 0;
        mode._isZh = () => true;
        mode.handleCorrectAnswer = () => { mode._went = 'correct'; };
        mode.handleWrongAnswer = () => { mode._went = 'wrong'; };
    });

    test('máy chèn trợ từ vẫn tính ĐÚNG — đây là ca `===` cũ làm hỏng', () => {
        mode.handleRecognitionResult('你好吗', []);
        expect(mode._went).toBe('correct');
    });

    test('nói ra chữ khác vẫn tính SAI — không nới lỏng quá tay', () => {
        mode.handleRecognitionResult('再见', []);
        expect(mode._went).toBe('wrong');
    });

    test('kết quả hiện rõ máy nghe thành gì, không chỉ "Chưa đúng"', () => {
        mode.handleRecognitionResult('再见', []);
        const html = document.getElementById('recognition-result').innerHTML;
        expect(html).toMatch(/再见/);
    });

    test('transcript được escape — chuỗi từ giọng nói, không phải hằng số', () => {
        mode.handleRecognitionResult('<img src=x onerror=alert(1)>', []);
        const div = document.getElementById('recognition-result');
        expect(div.querySelector('img')).toBeNull();
        expect(div.innerHTML).toMatch(/&lt;img/);
    });

    test('showInterim hiện chữ đang nghe, KHÔNG tính lượt thử', () => {
        mode.showInterim('你');
        expect(document.getElementById('mic-status').textContent).toMatch(/你/);
        expect(mode.currentAttempts).toBe(0);   // chưa chấm thì chưa mất lượt
    });

    test('bản TẠM đi qua onresult phải hiện chữ và KHÔNG chấm', () => {
        // Gọi thẳng showInterim() không chứng minh được gì: bật interimResults mà
        // quên sửa onresult thì bản tạm bị bỏ qua hoàn toàn, test gọi thẳng vẫn
        // xanh. Phải đi qua đúng đường onresult mới bắt được — đã kiểm bằng cách
        // tắt nhánh interim và thấy test cũ KHÔNG đỏ.
        mode._SpeechRecognition = function () {
            return { start(){}, stop(){}, abort(){}, lang:'', continuous:false,
                     interimResults:false, maxAlternatives:1 };
        };
        mode._createRecognition();

        mode.recognition.onresult({
            resultIndex: 0,
            results: [Object.assign([{ transcript: '你' }], { isFinal: false })],
        });

        expect(document.getElementById('mic-status').textContent).toMatch(/你/);
        expect(mode._went).toBeUndefined();      // chưa chốt thì chưa chấm
        expect(mode.currentAttempts).toBe(0);    // và chưa ăn lượt thử nào
    });

    test('bản CHỐT đi qua onresult mới chấm', () => {
        mode._SpeechRecognition = function () {
            return { start(){}, stop(){}, abort(){}, lang:'', continuous:false,
                     interimResults:false, maxAlternatives:1 };
        };
        mode._createRecognition();

        mode.recognition.onresult({
            resultIndex: 0,
            results: [Object.assign([{ transcript: '你好' }], { isFinal: true })],
        });

        expect(mode._went).toBe('correct');
    });

    test('mic không bắt được tiếng thì KHÔNG trừ lượt thử', () => {
        // Chỉ có 3 lượt. Lỡ tay bấm mic rồi chưa kịp nói mà mất 1/3 là phạt oan —
        // phạt phải dành cho lỗi phát âm, không phải cho việc mic không nghe thấy.
        mode._SpeechRecognition = function () {
            return { start(){}, stop(){}, abort(){}, lang:'', continuous:false,
                     interimResults:false, maxAlternatives:1 };
        };
        mode._createRecognition();
        mode._resultHandled = false;

        mode.recognition.onend();

        expect(mode.currentAttempts).toBe(0);
        expect(document.getElementById('mic-status').textContent).toMatch(/chưa nghe thấy/i);
    });

    test('interimResults được BẬT — tắt là mất hết phản hồi tức thời', () => {
        mode._SpeechRecognition = function () {
            return { start(){}, stop(){}, abort(){}, lang:'', continuous:false,
                     interimResults:false, maxAlternatives:1 };
        };
        mode._createRecognition();
        expect(mode.recognition.interimResults).toBe(true);
    });

    test('showInterim với chuỗi rỗng không xoá trắng trạng thái', () => {
        document.getElementById('mic-status').textContent = 'Đang nghe...';
        mode.showInterim('');
        expect(document.getElementById('mic-status').textContent).toBe('Đang nghe...');
    });
});

describe('chấm cả CÂU — chỉ ra từ nào sai', () => {
    test('đọc đúng hết', () => {
        const r = scoreSentence('the meeting starts at nine', 'The meeting starts at nine.');
        expect(r.correct).toBe(5);
        expect(r.total).toBe(5);
        expect(r.words.every(w => w.ok)).toBe(true);
    });

    test('sai MỘT từ giữa câu — nêu đúng từ đó', () => {
        // Đây là lý do hàm này tồn tại: `scoreAttempt` cho câu 5 từ sai 1 sẽ ra
        // similarity ~0.9, vượt ngưỡng "gần đúng", và người học không bao giờ
        // biết mình sai từ nào.
        const r = scoreSentence('the meeting starts at wine', 'the meeting starts at nine');
        expect(r.correct).toBe(4);
        expect(r.words.find(w => !w.ok).word).toBe('nine');
    });

    test('máy nghe HỤT một từ — các từ sau không bị lệch nhịp', () => {
        // So theo chỉ số thì thiếu một từ ở đầu làm mọi từ phía sau lệch một
        // nhịp và bị báo sai hết.
        const r = scoreSentence('meeting starts at nine', 'the meeting starts at nine');
        expect(r.correct).toBe(4);
        expect(r.words.filter(w => !w.ok).map(w => w.word)).toEqual(['the']);
    });

    test('máy nghe THỪA một từ — không tính lỗi cho người học', () => {
        // Bộ nhận dạng tự chèn từ là lỗi của nó, không phải của người nói.
        const r = scoreSentence('um the meeting starts at nine', 'the meeting starts at nine');
        expect(r.correct).toBe(5);
        expect(r.ratio).toBe(1);
    });

    test('từ lặp lại được đếm đủ, không gộp làm một', () => {
        const r = scoreSentence('very very good', 'very very good');
        expect(r.correct).toBe(3);
    });

    test('sai chính tả nhẹ của bộ nhận dạng KHÔNG bị tính là lỗi phát âm', () => {
        // "recieve" cho "receive" là lỗi chính tả của máy — phạt là phạt oan.
        const r = scoreSentence('please recieve the document', 'please receive the document');
        expect(r.correct).toBe(4);
    });

    test('không nghe được gì → mọi từ đều sai, không vỡ', () => {
        const r = scoreSentence('', 'the meeting starts at nine');
        expect(r.correct).toBe(0);
        expect(r.total).toBe(5);
        expect(r.ratio).toBe(0);
    });

    test('câu đích rỗng → không chia cho 0', () => {
        const r = scoreSentence('anything', '');
        expect(r.total).toBe(0);
        expect(Number.isFinite(r.ratio)).toBe(true);
    });

    test('giữ nguyên THỨ TỰ từ của câu đích', () => {
        // Người học đọc phản hồi theo thứ tự câu; xáo lên là không dò lại được.
        const r = scoreSentence('a c', 'a b c');
        expect(r.words.map(w => w.word)).toEqual(['a', 'b', 'c']);
    });

    test('dấu câu và hoa thường không ảnh hưởng', () => {
        const r = scoreSentence('THE MEETING, STARTS!', 'the meeting starts');
        expect(r.correct).toBe(3);
    });
});

describe('phản hồi cho lượt đọc câu', () => {
    test('nêu đích danh từ chưa rõ', () => {
        const r = scoreSentence('the meeting starts at wine', 'the meeting starts at nine');
        expect(sentenceFeedback(r)).toContain('nine');
        expect(sentenceFeedback(r)).toContain('4/5');
    });

    test('nêu tối đa 3 từ rồi tóm tắt phần còn lại', () => {
        // Câu 10 từ sai 8 mà liệt kê hết thì thành một dòng dài không ai đọc.
        const r = scoreSentence('a', 'a b c d e f');
        const msg = sentenceFeedback(r);
        expect(msg).toMatch(/và 2 từ nữa/);
        expect(msg).not.toContain('"f"');
    });

    test('đúng hết thì khen, không liệt kê gì', () => {
        const r = scoreSentence('a b c', 'a b c');
        expect(sentenceFeedback(r)).toMatch(/rất tốt/i);
    });

    test('không nghe được gì thì bảo nói to hơn, không nói "sai"', () => {
        const r = scoreSentence('', 'a b c');
        expect(sentenceFeedback(r)).toMatch(/to và chậm/);
    });
});
