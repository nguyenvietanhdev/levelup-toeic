/**
 * Mic không được nghe chính tiếng loa của app.
 *
 * Người dùng KHÔNG đeo tai nghe: bấm nghe mẫu rồi bật mic, mic thu được giọng
 * TTS đang đọc "gate", bộ nhận dạng chấm là người học nói đúng — được điểm mà
 * chưa hề mở miệng. Web Speech API không cho ta chạm vào luồng âm thanh nên
 * không thể phân biệt giọng máy với giọng người ở phía nhận dạng; phải chặn ở
 * phía phát.
 *
 * Cùng lỗ hổng có ở chế độ Hội thoại: bấm loa nghe câu NPC trong lúc đang ghi âm
 * thì câu đó lọt vào ô nhập như thể người dùng vừa nói.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pron = readFileSync(join(__dirname, 'modes', 'pronunciationMode.js'), 'utf8');
const convo = readFileSync(
    join(__dirname, '..', 'conversation', 'ConversationScreen.jsx'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

/** Thân một hàm trong object literal, cắt tới dòng `},` cùng mức. */
function ham(src, ten) {
    const i = src.indexOf(ten);
    expect(i, `không tìm thấy ${ten}`).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('\n    },', i));
}

describe('chế độ Phát âm: khoá mic khi đang phát mẫu', () => {
    test('MỌI lối phát đều đi qua speakSample', () => {
        // Sót một lối là lối đó vẫn phát mà mic vẫn mở. Chỉ `speakSample` được
        // gọi `GameLogic.speakWord` trực tiếp.
        const soLanGoiThang = (pron.match(/GameLogic\.speakWord\(/g) || []).length;
        expect(soLanGoiThang).toBe(1);
        const trongSpeakSample = ham(pron, 'speakSample(text) {');
        expect(trongSpeakSample).toMatch(/GameLogic\.speakWord\(/);
    });

    test('đặt cờ TRƯỚC khi phát', () => {
        const body = ham(pron, 'speakSample(text) {');
        const iCo = body.indexOf('this._speaking = true');
        const iPhat = body.indexOf('GameLogic.speakWord(');
        expect(iCo).toBeGreaterThan(-1);
        expect(iCo).toBeLessThan(iPhat);
    });

    test('đang ghi âm mà bấm phát → dừng ghi trước', () => {
        // Không dừng thì hai việc chồng nhau đúng vào tình huống muốn tránh.
        const body = ham(pron, 'speakSample(text) {');
        expect(body).toMatch(/if \(this\.isListening\)/);
        expect(body).toMatch(/this\.recognition\?\.stop\(\)/);
    });

    test('toggleListening chặn cả khi gọi bằng phím tắt', () => {
        // `disabled` trên nút chỉ chặn cú bấm chuột.
        const body = ham(pron, 'toggleListening() {');
        expect(body).toMatch(/if \(this\._speaking\) return;/);
    });

    test('mở khoá khi phát XONG, không phải theo giờ đoán', () => {
        // `onEnd` bắn ở cả hai đường phát (Google TTS và giọng hệ điều hành).
        const body = ham(pron, 'speakSample(text) {');
        expect(body).toMatch(/GameLogic\.speakWord\(text, ttsLang\(\), \(\) =>/);
        expect(body).toMatch(/this\._speaking = false/);
    });

    test('có đệm chống tiếng vang của loa ngoài', () => {
        // Loa còn vang một chút sau khi file kết thúc; bộ nhận dạng bắt cả đuôi.
        expect(pron).toMatch(/ECHO_GUARD_MS/);
        const ms = Number((pron.match(/ECHO_GUARD_MS:\s*(\d+)/) || [])[1]);
        expect(ms).toBeGreaterThan(0);
        // Không quá dài — người dùng phải chờ mới bấm được mic.
        expect(ms).toBeLessThanOrEqual(1000);
    });

    test('có chốt chặn nếu onEnd KHÔNG bao giờ bắn', () => {
        // Lỗi mạng hoặc thẻ audio treo thì mic khoá vĩnh viễn.
        const body = ham(pron, 'speakSample(text) {');
        expect(body).toMatch(/_speakFallback/);
        expect(body).toMatch(/setTimeout\(/);
    });

    test('rời chế độ thì dọn cờ và timer', () => {
        // Còn `_speaking = true` thì lần vào sau mic khoá ngay từ đầu.
        const body = ham(pron, 'cleanup() {');
        expect(body).toMatch(/clearTimeout\(this\._speakFallback\)/);
        expect(body).toMatch(/this\._speaking = false/);
    });
});

describe('nói RÕ vì sao mic không bấm được', () => {
    test('đổi chữ trạng thái, không chỉ làm mờ nút', () => {
        // Nút mờ mà không giải thích thì người dùng tưởng hỏng.
        const body = ham(pron, '_syncMicDisabled() {');
        expect(body).toMatch(/Đang phát mẫu/);
    });

    test('trả lại chữ cũ khi mở khoá', () => {
        const body = ham(pron, '_syncMicDisabled() {');
        expect(body).toMatch(/Click mic để bắt đầu/);
    });

    test('vừa disabled vừa có class riêng', () => {
        const body = ham(pron, '_syncMicDisabled() {');
        expect(body).toMatch(/micBtn\.disabled = !!this\._speaking/);
        expect(body).toMatch(/is-muted-by-audio/);
    });

    test('CSS cho thấy đây là trạng thái CHỜ, không phải hỏng', () => {
        // Nút hỏng thì đứng im; nhịp thở nhẹ nói rằng sắp bấm được.
        expect(css).toMatch(/\.mic-button\.is-muted-by-audio/);
        expect(css).toMatch(/@keyframes mic-waiting/);
    });

    test('tôn trọng prefers-reduced-motion', () => {
        const i = css.indexOf('@keyframes mic-waiting');
        expect(css.slice(i, i + 400)).toMatch(/prefers-reduced-motion/);
    });
});

describe('Hội thoại: cùng lỗ hổng, cùng cách chặn', () => {
    test('dừng ghi âm TRƯỚC khi đọc câu NPC', () => {
        // Không dừng thì câu của NPC lọt vào ô nhập như thể người dùng vừa nói.
        const i = convo.indexOf('const speak = useCallback');
        const body = convo.slice(i, convo.indexOf('}, []);', i));
        const iStop = body.indexOf('speechRef.current?.stop?.()');
        const iSpeak = body.indexOf('GameLogic.speakWord(');
        expect(iStop).toBeGreaterThan(-1);
        expect(iStop).toBeLessThan(iSpeak);
    });

    test('tắt luôn cờ giao diện, không để nút mic hiện "đang nghe"', () => {
        const i = convo.indexOf('const speak = useCallback');
        const body = convo.slice(i, convo.indexOf('}, []);', i));
        expect(body).toMatch(/setSpeechOn\(false\)/);
    });
});
