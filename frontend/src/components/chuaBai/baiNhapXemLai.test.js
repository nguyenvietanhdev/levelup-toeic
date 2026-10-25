/**
 * Bài làm dở (Viết / Dịch) và Nộp lại bài đã sửa.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Tự lưu mỗi phím gõ → hàng trăm request.
 *   2. Tự lưu tiếp SAU khi đã nộp chấm → tạo lại bài nháp vừa xoá (server đã chặn
 *      bằng "chỉ cập nhật bài đang có", ở đây là lớp thứ hai).
 *   3. "Làm tiếp" xong vẫn tự lưu lại y nguyên nội dung vừa nạp.
 *   4. Lỗi đọc bài nháp làm hỏng màn chọn đề.
 *   5. Bài trong lịch sử không thấy các lần xem lại trước.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');
const hook = doc('components', 'ai', 'BaiNhap.jsx');
const xl = doc('components', 'chuaBai', 'XemLaiBai.jsx');
const MAN = {
    viet: doc('components', 'essay', 'EssayScreen.jsx'),
    dich: doc('components', 'translation', 'TranslationScreen.jsx'),
};

describe('bài làm dở', () => {
    test('chỉ đọc bài nháp khi màn mở mà CHƯA có đề; lỗi thì bỏ qua', () => {
        expect(hook).toMatch(/if \(!active \|\| coDe\) return undefined;/);
        expect(hook).toMatch(/\.catch\(\(\) => \{ \/\* phần thêm/);
    });

    test('tự lưu sau khi ngừng gõ, không lưu khi đã nộp hoặc nội dung không đổi', () => {
        expect(hook).toMatch(/const CHO_LUU_MS = 1500;/);
        expect(hook).toMatch(/if \(!coDe \|\| xong \|\| !deBai \|\| noiDung === daLuu\.current\) return undefined;/);
        // Gửi kèm đề đang hiện: server chỉ lưu khi khớp đề của bài nháp.
        expect(hook).toMatch(/BaiNhapAPI\.luu\(mode, noiDung, deBai\)/);
        expect(hook).toMatch(/return \(\) => clearTimeout\(t\);/);
    });

    test('nhận bài làm dở thì coi nội dung đó là đã lưu', () => {
        expect(hook).toMatch(/daDung: \(\) => \{ daLuu\.current = nhap\?\.noiDung \|\| ''; setNhap\(null\); \}/);
    });

    test.each([['viet', 'prompt', 'setPrompt', 'setEssay', 'essay'], ['dich', 'passage', 'setDe', 'setBanDich', 'banDich']])(
        '%s: thẻ "Làm tiếp" ở màn chọn đề, nạp lại đề + phần đã gõ, không gọi AI',
        (mode, truongDe, datDe, datBai, bien) => {
            const s = MAN[mode];
            // `active` gồm cả tab: quay từ Lịch sử về thì đọc lại bài nháp.
            expect(s).toMatch(new RegExp(`useBaiNhap\\('${mode}', \\{ active: active && tab !== 'lichsu'[^,]*, coDe: !!\\w+, xong: !!result, noiDung: ${bien}, deBai: \\w+\\?\\.${truongDe} \\}\\)`));
            expect(s).toMatch(new RegExp(`<TheBaiDo nhap=\\{baiNhap\\.nhap\\} deBai=\\{baiNhap\\.nhap\\?\\.de\\?\\.${truongDe}\\}`));
            const lt = s.slice(s.indexOf('const lamTiep'), s.indexOf('};', s.indexOf('const lamTiep')));
            expect(lt).toContain(`${datDe}(n.de)`);
            expect(lt).toContain(`${datBai}(n.noiDung || '')`);
            expect(lt).not.toMatch(/API\./);
        },
    );

    test('hộp thoại thoát nói rõ bài được lưu nháp', () => {
        expect(MAN.viet).toMatch(/Bài đang viết được lưu nháp/);
        expect(MAN.dich).toMatch(/Bản dịch đang làm được lưu nháp/);
    });
});

describe('nộp lại bài đã sửa', () => {
    test('gắn sau phần chữa bài ở Viết, Dịch và Lịch sử', () => {
        expect(MAN.viet).toMatch(/<XemLaiBai goc=\{essay\} loi=\{result\.issues\} gui=\{\(t\) => EssayAPI\.xemLai\(result\.id, t\)\} \/>/);
        expect(MAN.dich).toMatch(/<XemLaiBai goc=\{banDich\} loi=\{result\.notes\} gui=\{\(t\) => TranslationAPI\.xemLai\(result\.id, t\)\} \/>/);
        const ls = doc('components', 'history', 'LichSuMode.jsx');
        expect(ls).toMatch(/daXem=\{bai\.xemLai\} gui=\{\(t\) => EssayAPI\.xemLai\(bai\._id, t\)\}/);
        expect(ls).toMatch(/daXem=\{bai\.xemLai\} gui=\{\(t\) => TranslationAPI\.xemLai\(bai\._id, t\)\}/);
    });

    test('sửa từ bản MỚI NHẤT (lần xem lại trước, hoặc bài gốc); hiện lượt còn lại', () => {
        expect(xl).toMatch(/const banMoiNhat = lanGanNhat\?\.noiDung \|\| goc;/);
        expect(xl).toMatch(/const batDauSua = \(\) => \{ setBanSua\(banMoiNhat\); setMoSua\(true\); \};/);
        expect(xl).toMatch(/Còn \$\{conLai\}\/\$\{MAX\} lượt/);
        expect(xl).toMatch(/không tính điểm, không cộng XP/);
    });

    test('lỗi mới khi sửa được chữa trên chính bản sửa', () => {
        expect(xl).toMatch(/<ChuaBai text=\{lanGanNhat\.noiDung\} loi=\{kq\.loiMoi\} tieuDe="Lỗi mới khi sửa" \/>/);
    });

    test('API gọi đúng đường', () => {
        expect(doc('api', 'essay.js')).toMatch(/Http\.post\(`\/essay\/\$\{encodeURIComponent\(id\)\}\/xem-lai`, \{ noiDung \}\)/);
        expect(doc('api', 'translation.js')).toMatch(/Http\.post\(`\/translation\/\$\{encodeURIComponent\(id\)\}\/xem-lai`, \{ noiDung \}\)/);
        expect(doc('api', 'baiNhap.js')).toMatch(/Http\.put\(`\/bai-nhap\/\$\{mode\}`, \{ noiDung, deBai \}\)/);
    });
});
