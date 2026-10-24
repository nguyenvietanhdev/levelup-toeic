/**
 * Rời màn AI khi ĐANG LÀM DỞ → hỏi trước, cùng popup như 16 chế độ luyện tập.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Chỉ chặn nút quay về trong màn → bấm avatar / Trang chủ / menu vẫn thoát
 *      không hỏi. Phải chặn ở chokepoint `showScreen`.
 *   2. Guard không được gỡ khi làm xong / rời màn → lần sau đi đâu cũng bị hỏi.
 *   3. Chuyển sang CHÍNH màn đó (vd bấm lại mục menu) cũng bị hỏi.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');
const guard = doc('components', 'ai', 'aiExitGuard.js');
const ctx = doc('game', 'GameContext.jsx');

describe('chokepoint showScreen', () => {
    test('mọi lối chuyển màn đi qua guard AI; sang chính màn đó thì không hỏi', () => {
        const i = ctx.indexOf('const showScreen = useCallback(');
        const than = ctx.slice(i, ctx.indexOf('}, [doiMan]);', i));
        expect(than).toMatch(/const aiGuard = getAiExitGuard\(\);/);
        expect(than).toMatch(/if \(aiGuard && screenId !== aiGuard\.screen\)/);
        expect(than).toMatch(/aiGuard\.fn\(\(\) => doiMan\(screenId, opts\)\)/);
        expect(than).toMatch(/setMenuOpen\(false\)/);
    });
});

describe('guard', () => {
    test('popup giống luyện tập: Hủy / Thoát, Thoát thì đóng popup rồi mới chuyển màn', () => {
        expect(guard).toMatch(/text: 'Hủy', className: 'btn-secondary', onClick: \(\) => Modal\.close\(\)/);
        expect(guard).toMatch(/text: 'Thoát',\s*className: 'btn-primary'/);
        expect(guard).toMatch(/Modal\.close\(\);\s*\/\/[^\n]*\n\s*setTimeout\(proceed, 0\);/);
    });

    test('chỉ bật khi đang làm dở, và chỉ gỡ guard CỦA MÌNH khi xong / rời màn', () => {
        expect(guard).toMatch(/if \(!dangLamDo\) return undefined;/);
        expect(guard).toMatch(/return \(\) => \{ if \(guard === g\) guard = null; \};/);
        expect(guard).toMatch(/\}, \[screen, dangLamDo\]\);/);
    });
});

describe('cả 5 màn AI đăng ký guard với đúng điều kiện "đang làm dở"', () => {
    const CASES = [
        // Chat và Hội thoại giọng nói dùng chung màn: mã màn theo route (`screenId`).
        ['conversation', 'ConversationScreen.jsx', null, '!!convo && !result'],
        ['reading', 'ReadingScreen.jsx', 'reading-screen', '!!de && !result'],
        ['essay', 'EssayScreen.jsx', 'essay-screen', '!!prompt && !result'],
        ['translation', 'TranslationScreen.jsx', 'translation-screen', '!!de && !result'],
        ['listening', 'ListeningScreen.jsx', 'listening-screen', '!!phien && !ketQua'],
    ];
    for (const [thuMuc, file, screen, dk] of CASES) {
        test(`${file}`, () => {
            const src = doc('components', thuMuc, file);
            expect(src).toContain(screen ? `useHoiKhiThoat('${screen}', ${dk}, {` : `useHoiKhiThoat(screenId, ${dk}, {`);
            if (!screen) expect(src).toMatch(/const screenId = voice \? 'voice-conversation-screen' : 'conversation-screen';/);
            expect(src).toMatch(/import \{ useHoiKhiThoat \} from '\.\.\/ai\/aiExitGuard\.js';/);
            // Hook đứng TRƯỚC mọi return của component (luật gọi hook).
            const i = src.indexOf('export default function');
            const hook = src.indexOf('useHoiKhiThoat(', i);
            expect(src.slice(i, hook)).not.toMatch(/\n {4}(if [^\n]*)?return\b/);
        });
    }
});
