/**
 * Hội thoại GIỌNG NÓI: AI gửi tin nhắn thoại (chỉ nút phát, không chữ), người học
 * trả lời bằng ghi âm — luyện phản xạ nghe hiểu như nói chuyện thật.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Lộ chữ câu AI trong lúc nói (bong bóng, gợi ý "Trả lời câu: …") → hết luyện nghe.
 *   2. Micro ghi luôn tiếng loa khi AI đang đọc.
 *   3. Gửi bản ghi rỗng (máy không nghe rõ) → server chấm một lượt trống.
 *   4. Thu hồi URL bản ghi ngay sau khi gửi → bong bóng đã gửi không phát lại được.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');
const man = doc('components', 'conversation', 'ConversationScreen.jsx');
const ghi = doc('components', 'conversation', 'useGhiAm.js');
const bong = doc('components', 'conversation', 'BongThoai.jsx');

describe('menu và route', () => {
    test('nhóm Nói với AI có Chat (chữ) và Hội thoại (giọng nói), cùng khoá Level', () => {
        const menu = doc('layouts', 'SideMenu.jsx');
        expect(menu).toMatch(/\{ label: 'Chat', icon: 'fa-comments', screen: 'conversation-screen', feature: 'feature:conversation' \}/);
        expect(menu).toMatch(/\{ label: 'Hội thoại', icon: 'fa-microphone-lines', screen: 'voice-conversation-screen', feature: 'feature:conversation' \}/);
    });

    test('route voice-conversation-screen dùng lại màn Chat với prop voice', () => {
        const app = doc('App.jsx');
        expect(app).toMatch(/'voice-conversation-screen': VoiceConversationScreen/);
        expect(doc('components', 'conversation', 'VoiceConversationScreen.jsx'))
            .toMatch(/<ConversationScreen \{\.\.\.props\} voice \/>/);
    });

    test('mở phiên gửi cờ voice lên server', () => {
        expect(man).toMatch(/\.\.\.dangGui\(\{ dang, tuChon, goiY \}\),\s*voice,/);
        expect(doc('api', 'conversation.js')).toMatch(/voice: voice === true/);
    });
});

describe('không lộ chữ trong lúc nói', () => {
    test('lượt AI là bong bóng thoại; chữ chỉ hiện khi đã có kết quả (kết thúc phiên)', () => {
        expect(man).toMatch(/voice && t\.role === 'npc' \? \(/);
        expect(man).toMatch(/<BongThoaiAI/);
        expect(man).toMatch(/\{result && <div className="convo-thoai-chu">\{t\.content\}<\/div>\}/);
    });

    test('gợi ý không hiện lại câu hỏi bằng chữ', () => {
        expect(man).toMatch(/\{!voice && goiY\.cauHoi && /);
    });

    test('bong bóng AI chỉ có nút phát + sóng âm, không render chữ', () => {
        const i = bong.indexOf('export function BongThoaiAI');
        const than = bong.slice(i, bong.indexOf('export function BongThoaiCuaToi'));
        expect(than).not.toMatch(/content|text/);
        expect(than).toMatch(/fa-play/);
    });
});

describe('ghi âm trả lời', () => {
    test('dừng giọng AI trước khi ghi để micro không thu tiếng loa', () => {
        expect(man).toMatch(/dungPhat\(\);\s*ghiAm\.batDau\(\);/);
    });

    test('ghi song song: MediaRecorder (nghe lại) + nhận dạng giọng (chữ để chấm)', () => {
        expect(ghi).toMatch(/createSpeechInput\(\{/);
        expect(ghi).toMatch(/new MediaRecorder\(x\.stream\)/);
        // Không xin được micro cho MediaRecorder vẫn nhận dạng chữ được.
        expect(ghi).toMatch(/catch \{\s*\/\/ Không ghi được giọng/);
    });

    test('chờ phần chữ cuối sau khi dừng; có trần thời lượng', () => {
        expect(ghi).toMatch(/const CHO_CHU_CUOI_MS = \d+;/);
        expect(ghi).toMatch(/const TOI_DA_GIAY = 60;/);
    });

    test('không gửi khi máy không nghe rõ; gửi kèm URL bản ghi để phát lại', () => {
        expect(man).toMatch(/disabled=\{busy \|\| !ghiAm\.chu\.trim\(\)\}/);
        expect(man).toMatch(/handleSend\(ghiAm\.chu, ghiAm\.url \? \{ audioUrl: ghiAm\.url \} : undefined\)/);
    });

    test('gửi xong KHÔNG thu hồi URL (bong bóng còn dùng); ghi lại và rời màn thì thu hồi', () => {
        const xg = ghi.slice(ghi.indexOf('const xongGui'), ghi.indexOf('useEffect(() => () =>'));
        expect(xg).not.toMatch(/revokeObjectURL/);
        expect(ghi.slice(ghi.indexOf('const lamLai'), ghi.indexOf('const xongGui'))).toMatch(/revokeObjectURL\(u\)/);
        expect(ghi).toMatch(/r\.current\.urls\.forEach\(\(u\) => URL\.revokeObjectURL\(u\)\)/);
    });

    test('trình duyệt không nhận giọng nói → báo và khoá nút bắt đầu', () => {
        expect(man).toMatch(/\{voice && !coNhanGiong && \(/);
        expect(man).toMatch(/disabled=\{starting \|\| \(voice && !coNhanGiong\)\}/);
    });
});
