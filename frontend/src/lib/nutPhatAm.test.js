/**
 * Đang phát tiếng thì KHÔNG bấm được nút âm thanh nào nữa.
 *
 * Hai triệu chứng gộp về một nguyên nhân:
 *   · Bấm nút loa liên tiếp — mỗi lần huỷ lượt đang phát rồi bắt đầu lượt mới,
 *     nghe ra một chuỗi tiếng cụt, và mỗi lượt là một lần gọi tổng hợp.
 *   · Ở chế độ phát âm, bấm loa rồi bấm mic ngay — máy ghi lại chính tiếng loa
 *     của mình và chấm điểm trên đó.
 *
 * Chặn ở tầng SỰ KIỆN, không vá từng chế độ: 17 nút âm thanh nằm rải trong 13
 * chế độ, vá từng chỗ thì mỗi nút mới thêm vào là một chỗ hở không ai nhắc.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { batDauPhat, ketThucPhat, dangPhatAm } from './nutPhatAm.js';

/** Một nút âm thanh gắn vào DOM, đếm số lần handler của chế độ chạy được. */
function dungNut(lop = 'js-nut-am') {
    const nut = document.createElement('button');
    nut.className = lop;
    const goi = [];
    nut.addEventListener('click', () => goi.push(1));
    document.body.appendChild(nut);
    return { nut, soLan: () => goi.length };
}

beforeEach(() => {
    ketThucPhat(null);
    document.body.innerHTML = '';
    document.body.className = '';
});

afterEach(() => { ketThucPhat(null); vi.useRealTimers(); });

describe('trạng thái đang phát', () => {
    test('bắt đầu → đang phát; kết thúc → thôi', () => {
        expect(dangPhatAm()).toBe(false);
        const the = batDauPhat();
        expect(dangPhatAm()).toBe(true);
        ketThucPhat(the);
        expect(dangPhatAm()).toBe(false);
    });

    test('đánh dấu trên `<body>` để CSS làm mờ nút', () => {
        // Nút bấm không ăn mà trông vẫn bình thường thì người dùng tưởng hỏng.
        const the = batDauPhat();
        expect(document.body.classList.contains('dang-phat-am')).toBe(true);
        ketThucPhat(the);
        expect(document.body.classList.contains('dang-phat-am')).toBe(false);
    });

    test('lượt CŨ báo xong muộn KHÔNG mở khoá lượt đang chạy', () => {
        // Ca thật: lật thẻ nhanh thì lượt trước bị lượt sau chiếm chỗ, rồi
        // `onEnd` của nó mới về. Mở khoá theo nó là nút ăn bấm giữa lúc lượt
        // mới đang phát.
        const cu = batDauPhat();
        const moi = batDauPhat();
        ketThucPhat(cu);
        expect(dangPhatAm()).toBe(true);
        ketThucPhat(moi);
        expect(dangPhatAm()).toBe(false);
    });

    test('`ketThucPhat(null)` mở khoá bất kể lượt nào', () => {
        // `stopSpeaking` dùng đường này: đã dừng thì không còn tiếng để chờ.
        batDauPhat();
        batDauPhat();
        ketThucPhat(null);
        expect(dangPhatAm()).toBe(false);
    });
});

describe('chặn cú bấm', () => {
    test('đang phát → handler của chế độ KHÔNG chạy', () => {
        const { nut, soLan } = dungNut();
        batDauPhat();
        nut.click();
        expect(soLan()).toBe(0);
    });

    test('phát xong → bấm lại được', () => {
        // Khoá mà không mở là hỏng nặng hơn cả spam.
        const { nut, soLan } = dungNut();
        const the = batDauPhat();
        nut.click();
        ketThucPhat(the);
        nut.click();
        expect(soLan()).toBe(1);
    });

    test('không phát gì thì không chặn ai', () => {
        const { nut, soLan } = dungNut();
        nut.click();
        nut.click();
        expect(soLan()).toBe(2);
    });

    test('chặn cả khi bấm vào ICON bên trong nút', () => {
        // Mọi nút loa đều là `<button><i class="fas fa-volume-up"></i></button>`,
        // nên `event.target` là thẻ `<i>`, không phải nút. So bằng `===` là
        // không chặn được cú bấm nào.
        const { nut, soLan } = dungNut();
        const icon = document.createElement('i');
        nut.appendChild(icon);
        batDauPhat();
        icon.click();
        expect(soLan()).toBe(0);
    });

    test('KHÔNG chặn nút không mang nhãn — vd nút DỊCH', () => {
        // `.btn-speak-mini` dùng chung cho cả nút dịch. Đang nghe mà không tra
        // được nghĩa là chặn nhầm hẳn một việc chẳng liên quan.
        const { nut, soLan } = dungNut('btn-speak-mini card-translate');
        batDauPhat();
        nut.click();
        expect(soLan()).toBe(1);
    });

    test('chặn CẢ handler gắn cùng pha trên chính nút đó', () => {
        // `stopPropagation` chặn được cha, nhưng không chặn các handler anh em
        // gắn trên cùng phần tử — phải `stopImmediatePropagation`.
        const nut = document.createElement('button');
        nut.className = 'js-nut-am';
        const goi = [];
        nut.addEventListener('click', () => goi.push('a'));
        nut.addEventListener('click', () => goi.push('b'));
        document.body.appendChild(nut);

        batDauPhat();
        nut.click();
        expect(goi).toEqual([]);
    });

    test('huỷ luôn hành vi mặc định của nút', () => {
        // `stopImmediatePropagation` chặn được handler, nhưng KHÔNG chặn hành vi
        // mặc định của trình duyệt. Một `<button>` không ghi `type="button"` nằm
        // trong `<form>` vẫn gửi form — trang nhảy đi mất chỉ vì bấm nút loa.
        const { nut } = dungNut();
        batDauPhat();
        const su = new MouseEvent('click', { bubbles: true, cancelable: true });
        nut.dispatchEvent(su);
        expect(su.defaultPrevented).toBe(true);
    });

    test('KHÔNG huỷ hành vi mặc định khi không phát gì', () => {
        // Chặn cả lúc rảnh là chặn nhầm mọi cú bấm bình thường.
        const { nut } = dungNut();
        const su = new MouseEvent('click', { bubbles: true, cancelable: true });
        nut.dispatchEvent(su);
        expect(su.defaultPrevented).toBe(false);
    });

    test('chặn cả handler gắn trên phần tử CHA', () => {
        // Thẻ lật của Flashcard có handler trên cả thẻ; nút loa nằm trong đó.
        const cha = document.createElement('div');
        const goi = [];
        cha.addEventListener('click', () => goi.push(1));
        const nut = document.createElement('button');
        nut.className = 'js-nut-am';
        cha.appendChild(nut);
        document.body.appendChild(cha);

        batDauPhat();
        nut.click();
        expect(goi).toEqual([]);
    });
});

describe('lưới an toàn: không khoá vĩnh viễn', () => {
    test('tự mở khoá sau khi hết hạn chờ', () => {
        // `onEnd` của gTTS KHÔNG bao giờ về khi lượt phát bị lượt sau chiếm chỗ,
        // và trình duyệt còn chặn tự phát tiếng. Thiếu mốc này thì mọi nút âm
        // thanh khoá cứng cho tới khi tải lại trang.
        vi.useFakeTimers();
        batDauPhat();
        expect(dangPhatAm()).toBe(true);
        vi.advanceTimersByTime(15000);
        expect(dangPhatAm()).toBe(false);
    });

    test('lượt mới ĐẨY LÙI hạn chờ của lượt cũ', () => {
        // Không đặt lại thì lượt thứ hai chỉ còn phần thời gian thừa của lượt
        // đầu, và nút mở khoá giữa lúc đang phát.
        vi.useFakeTimers();
        batDauPhat();
        vi.advanceTimersByTime(14000);
        batDauPhat();
        vi.advanceTimersByTime(2000);
        expect(dangPhatAm()).toBe(true);
    });
});
