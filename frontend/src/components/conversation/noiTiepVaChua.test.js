/**
 * Hội thoại: nói tiếp phiên đang dở, và chữa từng câu sau khi kết thúc.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Nói tiếp mà gọi lại API mở phiên → trừ năng lượng lần hai.
 *   2. Tìm phiên dở cả khi đang ở tab Lịch sử / Vai, hoặc khi đang có phiên.
 *   3. Chữa từng câu trỏ sai lượt (đếm cả lượt của AI).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');
const man = doc('components', 'conversation', 'ConversationScreen.jsx');
const ctc = doc('components', 'conversation', 'ChuaTungCau.jsx');

describe('nói tiếp phiên dở', () => {
    test('chỉ tìm khi màn mở, tab Luyện, chưa có phiên; tách Chat / Giọng nói', () => {
        expect(man).toMatch(/if \(!active \|\| convo \|\| result \|\| tab !== 'luyen'\) return undefined;/);
        expect(man).toMatch(/ConversationAPI\.dangDo\(voice\)/);
    });

    test('nói tiếp dựng lại phiên từ dữ liệu server — không gọi start', () => {
        const nt = man.slice(man.indexOf('const noiTiep'), man.indexOf('const boPhienDo'));
        expect(nt).toMatch(/setConvo\(\{\s*id: d\.id,/);
        expect(nt).not.toMatch(/ConversationAPI\.start/);
    });

    test('bỏ phiên dở gọi API bỏ; thẻ nói rõ không mất năng lượng', () => {
        expect(man).toMatch(/ConversationAPI\.bo\(id\)/);
        expect(man).toMatch(/nói tiếp không mất năng lượng/);
        expect(doc('api', 'conversation.js')).toMatch(/Http\.get\(`\/conversation\/dang-do\?voice=\$\{voice \? 1 : 0\}`\)/);
    });
});

describe('chữa từng câu', () => {
    test('đếm lượt CHỈ trên câu của người học (khớp `luot` của server)', () => {
        expect(ctc).toMatch(/const cauHoc = \(turns \|\| \[\]\)\.filter\(\(t\) => t\.role === 'user'\)\.map\(\(t\) => t\.content\);/);
        expect(ctc).toMatch(/if \(!cauHoc\[c\.luot\]\) continue;/);
    });

    test('hiện ở kết quả cuối phiên và trong Lịch sử', () => {
        expect(man).toMatch(/<ChuaTungCau turns=\{convo\?\.turns\} corrections=\{result\.feedback\.corrections\} \/>/);
        expect(doc('components', 'history', 'LichSuMode.jsx')).toMatch(/<ChuaTungCau turns=\{phien\.turns\} corrections=\{phien\.feedback\.corrections\} \/>/);
    });

    test('Sổ tay lỗi có nguồn Hội thoại', () => {
        expect(doc('components', 'tienBo', 'SoTayLoi.jsx')).toMatch(/noi: 'Hội thoại'/);
    });
});
