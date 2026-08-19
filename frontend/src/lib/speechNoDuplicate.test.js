/**
 * Nhập giọng nói KHÔNG được nhân đôi chữ.
 *
 * Web Speech API tự ngắt sau vài giây im lặng, nên `speechInput` phải tự bật
 * lại. Mỗi lần bật lại là một PHIÊN nhận dạng mới: `e.resultIndex` quay về 0 và
 * `e.results` là mảng của phiên mới.
 *
 * Bản cũ cộng dồn `finalText += chunk` theo `resultIndex`. Khi trình duyệt gửi
 * lại một đoạn đã chốt — chuyện xảy ra thật lúc tự bật lại — đoạn đó bị cộng
 * lần thứ hai: bật/tắt micro một lần là "你好" thành "你好你好".
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';

/** Bộ nhận dạng giả, cho phép bắn `onresult`/`onend` theo ý muốn. */
class FakeRecognition {
    constructor() {
        FakeRecognition.last = this;
        this.lang = ''; this.continuous = false; this.interimResults = false;
        this.dangChay = false;
    }
    start() {
        if (this.dangChay) throw new Error('already started');
        this.dangChay = true;
    }
    stop() { this.dangChay = false; this.onend?.(); }
    abort() { this.dangChay = false; }

    /**
     * Bắn kết quả. `parts` = [[text, isFinal], …] của PHIÊN hiện tại.
     *
     * `resultIndex` mô phỏng đúng Chrome: nó trỏ tới mảnh ĐẦU TIÊN chưa được
     * gửi ở lần `onresult` trước, KHÔNG phải luôn bằng 0. Để nó cố định 0 thì
     * bản cộng dồn theo `resultIndex` cũng qua được test — mà đó chính là lỗi
     * cần bắt.
     */
    ketQua(parts) {
        const results = parts.map(([transcript, isFinal]) => ({
            0: { transcript }, isFinal, length: 1,
        }));
        results.length = parts.length;
        const from = this._daGui || 0;
        // Chrome chỉ tính các mảnh ĐÃ CHỐT vào con trỏ; phần đang đoán vẫn được
        // gửi lại ở lần sau.
        this._daGui = parts.filter(([, f]) => f).length;
        this.onresult?.({ resultIndex: Math.min(from, results.length - 1), results });
    }

    /** Trình duyệt tự ngắt vì im lặng (KHÔNG phải người dùng bấm dừng). */
    tuNgat() {
        this.dangChay = false;
        // Phiên mới bắt đầu từ đầu — Chrome đánh số lại từ 0.
        this._daGui = 0;
        this.onend?.();
    }
}

let createSpeechInput;
beforeEach(async () => {
    vi.resetModules();
    FakeRecognition.last = null;
    global.window = global.window || {};
    window.SpeechRecognition = FakeRecognition;
    ({ createSpeechInput } = await import('./speechInput.js'));
});

/** Tạo phiên và thu lại mọi text mà nó báo ra. */
function moPhien() {
    const texts = [];
    const s = createSpeechInput({ lang: 'zh-CN', onText: (t) => texts.push(t) });
    s.start();
    return { s, texts, rec: () => FakeRecognition.last, cuoi: () => texts[texts.length - 1] };
}

describe('luồng bình thường', () => {
    test('tạm thời rồi chốt — không lặp', () => {
        const { rec, cuoi } = moPhien();
        rec().ketQua([['你', false]]);
        expect(cuoi()).toBe('你');
        rec().ketQua([['你好', true]]);
        expect(cuoi()).toBe('你好');
    });

    test('nhiều mảnh trong CÙNG một phiên ghép đúng thứ tự', () => {
        const { rec, cuoi } = moPhien();
        rec().ketQua([['你好', true], ['吗', false]]);
        expect(cuoi()).toBe('你好吗');
    });
});

describe('trình duyệt TỰ NGẮT rồi tự bật lại', () => {
    test('KHÔNG nhân đôi phần đã chốt', () => {
        // Đây chính là lỗi người dùng gặp.
        const { rec, cuoi } = moPhien();
        rec().ketQua([['你好', true]]);
        expect(cuoi()).toBe('你好');

        rec().tuNgat();               // Chrome ngắt vì im lặng, speechInput bật lại
        rec().ketQua([['吗', true]]); // phiên mới chỉ có phần mới
        expect(cuoi()).toBe('你好吗');
        expect(cuoi()).not.toContain('你好你好');
    });

    test('Chrome GỬI LẠI cả đoạn cũ ở phiên mới → vẫn không nhân đôi', () => {
        // Một số bản Chrome trả lại nguyên kết quả đã chốt của phiên trước.
        // Không có chốt chặn chồng lấn thì đúng đoạn đó bị cộng hai lần.
        const { rec, cuoi } = moPhien();
        rec().ketQua([['你好', true]]);
        rec().tuNgat();
        rec().ketQua([['你好', true]]);
        expect(cuoi()).toBe('你好');

        rec().ketQua([['你好吗', true]]);
        expect(cuoi()).toBe('你好吗');
    });

    test('ngắt HAI lần liên tiếp vẫn đúng', () => {
        const { rec, cuoi } = moPhien();
        rec().ketQua([['我', true]]);
        rec().tuNgat();
        rec().ketQua([['是', true]]);
        rec().tuNgat();
        rec().ketQua([['学生', true]]);
        expect(cuoi()).toBe('我是学生');
    });
});

describe('bật lại sau khi người dùng DỪNG', () => {
    test('lượt ghi âm mới bắt đầu từ chuỗi RỖNG', () => {
        // Không reset thì câu trước dính vào câu sau — người dùng gửi nhầm cả
        // nội dung lượt cũ.
        const { s, rec, cuoi } = moPhien();
        rec().ketQua([['你好', true]]);
        s.stop();

        s.start();
        rec().ketQua([['再见', true]]);
        expect(cuoi()).toBe('再见');
        expect(cuoi()).not.toContain('你好');
    });
});

describe('cờ isFinal báo cho chỗ gọi', () => {
    test('true chỉ khi KHÔNG còn phần đang đoán', () => {
        const chotList = [];
        const s = createSpeechInput({
            lang: 'zh-CN',
            onText: (_t, isFinal) => chotList.push(isFinal),
        });
        s.start();
        const rec = FakeRecognition.last;
        rec.ketQua([['你', false]]);
        rec.ketQua([['你好', true]]);
        expect(chotList).toEqual([false, true]);
    });
});

describe('đọc lại TOÀN BỘ e.results, không cộng dồn theo resultIndex', () => {
    test('mảnh đã chốt được gửi lại trong CÙNG phiên → không nhân đôi', () => {
        // Chrome gửi `onresult` nhiều lần cho cùng một phiên, và `e.results`
        // luôn chứa TẤT CẢ mảnh từ đầu phiên. Cộng dồn theo `resultIndex` thì
        // mảnh nào được gửi lại sẽ bị cộng thêm một lần nữa.
        //
        // Ca này KHÔNG có phần chồng lấn với `doneText` (chưa hề tự ngắt), nên
        // chốt chặn `startsWith` không cứu được — chỉ cách đọc đúng mới cứu.
        const { rec, cuoi } = moPhien();
        rec().ketQua([['我', true]]);
        expect(cuoi()).toBe('我');

        // Lần bắn thứ hai: mảnh '我' vẫn nằm trong results, kèm mảnh mới.
        rec().ketQua([['我', true], ['是', true]]);
        expect(cuoi()).toBe('我是');
        expect(cuoi()).not.toBe('我我是');
    });

    test('ba lần bắn liên tiếp trong một phiên', () => {
        const { rec, cuoi } = moPhien();
        rec().ketQua([['你', true]]);
        rec().ketQua([['你', true], ['好', true]]);
        rec().ketQua([['你', true], ['好', true], ['吗', true]]);
        expect(cuoi()).toBe('你好吗');
    });
});
