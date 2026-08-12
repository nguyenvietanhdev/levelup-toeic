/**
 * Giữ Shift để nói → thả ra → tự mở popup dịch với nội dung vừa nói.
 *
 * Ba điểm dễ sai, đều thuộc loại hỏng-mà-trông-bình-thường:
 *
 * 1. Đọc `searchQuery` trong `onStateChange` thì LUÔN được chuỗi rỗng: callback
 *    đó do effect tạo một lần, closure của nó giữ giá trị của lần render đầu và
 *    không bao giờ thấy chữ mới. Popup sẽ mở với nội dung trống. Vì thế chữ nghe
 *    được phải nằm trong ref.
 *
 * 2. Mốc mở popup là lúc DỪNG nghe, không phải `isFinal`. Một phiên có thể chốt
 *    nhiều đoạn giữa chừng — mở popup ở đó là cắt ngang lúc người dùng còn đang nói.
 *
 * 3. Bấm NÚT micro thì KHÔNG được tự mở popup: bấm nút là muốn điền vào ô tìm
 *    kiếm. Chỉ phím tắt mới bật cờ tự dịch.
 *
 * Test này dựng lại đúng máy trạng thái đó (không render cả TopNav — nó kéo theo
 * GameContext, auth, API), rồi kiểm hành vi.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

/** Bản sao máy trạng thái trong TopNav: ref chữ nghe được + cờ tự dịch. */
function makeSpeechFlow({ openTranslate }) {
    const lastHeard = { current: '' };
    const autoTranslate = { current: false };

    return {
        lastHeard,
        autoTranslate,
        onText(text) { lastHeard.current = text; },
        onStateChange(listening) {
            if (listening) { lastHeard.current = ''; return; }
            const text = (lastHeard.current || '').trim();
            lastHeard.current = '';
            if (!text || !autoTranslate.current) return;
            autoTranslate.current = false;
            openTranslate(text);
        },
        startByShortcut() { autoTranslate.current = true; this.onStateChange(true); },
        startByMicButton() { autoTranslate.current = false; this.onStateChange(true); },
    };
}

describe('nói xong tự mở popup dịch', () => {
    let open, flow;
    beforeEach(() => {
        open = vi.fn();
        flow = makeSpeechFlow({ openTranslate: open });
    });

    test('giữ Shift → nói → thả ra thì mở popup với ĐÚNG chữ vừa nói', () => {
        flow.startByShortcut();
        flow.onText('hello');
        flow.onText('hello world');   // bản sau đè bản trước
        flow.onStateChange(false);
        expect(open).toHaveBeenCalledWith('hello world');
    });

    test('bấm NÚT micro thì KHÔNG tự mở popup', () => {
        flow.startByMicButton();
        flow.onText('hello');
        flow.onStateChange(false);
        expect(open).not.toHaveBeenCalled();
    });

    test('không nói gì thì không mở popup rỗng', () => {
        flow.startByShortcut();
        flow.onStateChange(false);
        expect(open).not.toHaveBeenCalled();
    });

    test('chỉ nói khoảng trắng cũng không mở', () => {
        flow.startByShortcut();
        flow.onText('   ');
        flow.onStateChange(false);
        expect(open).not.toHaveBeenCalled();
    });

    test('phiên mới quên chữ phiên trước — không mở lại nội dung cũ', () => {
        // Nếu không xoá lúc bắt đầu: bấm nói rồi im lặng sẽ mở popup với chữ của
        // lần nói TRƯỚC, người dùng không hiểu chữ đó ở đâu ra.
        flow.startByShortcut();
        flow.onText('lần trước');
        flow.onStateChange(false);
        expect(open).toHaveBeenCalledTimes(1);

        flow.startByShortcut();
        flow.onStateChange(false);         // phiên này không nói gì
        expect(open).toHaveBeenCalledTimes(1);
    });

    test('mở popup ĐÚNG MỘT lần cho mỗi phiên', () => {
        // Cờ tự dịch phải tắt sau khi dùng — không thì mọi lần dừng nghe sau đó
        // (kể cả do bấm nút) đều mở thêm một popup.
        flow.startByShortcut();
        flow.onText('xin chào');
        flow.onStateChange(false);
        flow.onStateChange(false);
        expect(open).toHaveBeenCalledTimes(1);
    });
});

/**
 * Chốt bằng NGUỒN THẬT — phần trên chép lại máy trạng thái nên chỉ chứng minh
 * nó tự nhất quán; sửa TopNav về đọc `searchQuery` trong closure thì nó vẫn xanh.
 */
describe('TopNav thực sự nối đúng', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs
        .readFileSync(path.join(__dirname, 'TopNav.jsx'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter(l => !/^\s*\/\//.test(l) && !/^\s*\{\/\*/.test(l)).join('\n');

    test('chữ nghe được giữ trong ref, không phải state', () => {
        expect(src).toMatch(/lastHeardRef\s*=\s*useRef/);
        expect(src).toMatch(/lastHeardRef\.current\s*=\s*text/);
    });

    test('startSpeech tự focus vào ô tìm kiếm', () => {
        // Thiếu bước này thì nói xong chữ hiện ở ô mà con trỏ không nằm trong đó.
        expect(src).toMatch(/getElementById\(\s*['"]search-input['"]\s*\)\?\.focus\(\)/);
    });

    test('cử chỉ GIỮ Shift bật cờ tự dịch', () => {
        expect(src).toMatch(/autoTranslateRef\.current\s*=\s*true;\s*startSpeech\(\)/);
    });

    test('nút micro TẮT cờ tự dịch', () => {
        expect(src).toMatch(/autoTranslateRef\.current\s*=\s*false;[\s\S]{0,80}startSpeech\(\)/);
    });

    test('tự kiểm: đọc được nội dung thật', () => {
        expect(src.length).toBeGreaterThan(5000);
        expect(src).toMatch(/createHoldGesture/);
    });
});
