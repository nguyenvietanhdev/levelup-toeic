/**
 * Ô tìm kiếm nằm CHÍNH GIỮA thanh nav, và nút "Từ vựng riêng" chuyển sang menu.
 *
 * Trước đây nhóm trái có 2 nút + avatar, nhóm phải có 4 nút — mỗi nhóm rộng bằng
 * nội dung của nó nên ô tìm bị đẩy lệch sang trái đúng bằng phần chênh.
 *
 * Ba chỗ dễ hỏng im lặng:
 *   1. Chỉ đặt `flex-grow` mà quên `flex-basis: 0` → phần chênh về số nút vẫn
 *      tính vào, ô tìm vẫn lệch, chỉ ít hơn.
 *   2. Ở khổ điện thoại chỉ huỷ `flex-shrink` mà quên `flex-grow`: hai nhóm giãn
 *      ra và bóp mất ô tìm — nav chỉ có một hàng nên chỗ rất chật.
 *   3. Chuyển "Từ vựng riêng" thành màn hình mà CHÉP lại ruột thay vì dùng
 *      chung — hai bản logic ~1000 dòng sẽ lệch nhau ngay lần sửa đầu.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const nav = strip(readFileSync(join(__dirname, 'TopNav.jsx'), 'utf8'));
const menu = strip(readFileSync(join(__dirname, 'SideMenu.jsx'), 'utf8'));
const layout = readFileSync(join(__dirname, '..', 'assets', 'styles', 'layout.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
const responsive = readFileSync(join(__dirname, '..', 'assets', 'styles', 'responsive.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

describe('nút Từ vựng riêng chuyển sang menu bên', () => {
    test('KHÔNG còn trên thanh nav', () => {
        expect(nav).not.toMatch(/id="upload-btn"/);
    });

    test('không để lại biến mồ côi trong TopNav', () => {
        // `uploadLock` và `openUploadModal` chỉ phục vụ nút đó.
        expect(nav).not.toMatch(/uploadLock/);
        expect(nav).not.toMatch(/openUploadModal/);
    });

    test('có mặt trong menu bên, dạng MÀN HÌNH riêng', () => {
        // Nó có 5 tab và người dùng ở lại lâu (thêm từ · JSON · quản lý · chia
        // sẻ · duyệt bộ được chia sẻ) — đó là một nơi để ĐẾN, không phải hộp
        // thoại làm nhanh rồi đóng.
        expect(menu).toMatch(/screen: 'vocab-screen'/);
        expect(menu).not.toMatch(/action: 'upload'/);
    });

    test('màn hình được đăng ký trong App', () => {
        const app = strip(readFileSync(join(__dirname, '..', 'App.jsx'), 'utf8'));
        expect(app).toMatch(/'vocab-screen': VocabScreen/);
        // `lazy` như các màn khác — nạp sẵn ~1000 dòng ruột cho mọi người dùng
        // là trả giá cho tính năng phần lớn không mở tới.
        expect(app).toMatch(/const VocabScreen\s*=\s*lazy\(/);
    });

    test('vẫn giữ khoá theo Level', () => {
        // Bỏ `feature` là ai cũng mở được, kể cả chưa đạt mốc.
        expect(menu).toMatch(/screen: 'vocab-screen',\s*feature: 'feature:upload-vocab'/);
    });

    test('KHÔNG còn nhánh mở modal trong menu', () => {
        // Sót lại là hai đường vào cho cùng một thứ.
        expect(menu).not.toMatch(/openUploadModal/);
        expect(menu).not.toMatch(/item\.action === 'upload'/);
    });

    test('ruột dùng CHUNG, không có hai bản logic', () => {
        // `buildUploadContent` trả phần thân cho cả màn hình lẫn modal.
        const screen = strip(readFileSync(
            join(__dirname, '..', 'components', 'vocab', 'upload', 'VocabScreen.jsx'), 'utf8'));
        expect(screen).toMatch(/buildUploadContent/);
        const mod = strip(readFileSync(
            join(__dirname, '..', 'components', 'vocab', 'upload', 'openUploadModal.js'), 'utf8'));
        expect(mod).toMatch(/export function buildUploadContent/);
        expect(mod).toMatch(/export function openUploadModal/);
    });

    test('màn hình GỠ listener khi tháo', () => {
        // `dispose` gỡ listener uỷ quyền ở document. Bỏ qua là mỗi lần vào màn
        // lại chồng thêm một cái, cái cũ trỏ vào DOM đã bị React vứt.
        const screen = strip(readFileSync(
            join(__dirname, '..', 'components', 'vocab', 'upload', 'VocabScreen.jsx'), 'utf8'));
        expect(screen).toMatch(/built\?\.dispose\?\.\(\)/);
    });

    test('popup vẫn còn cho popup Dịch nhanh gọi sang tab Quản lý', () => {
        // Bắt người dùng chuyển màn giữa lúc đang dịch dở là cướp thao tác.
        const tm = strip(readFileSync(
            join(__dirname, '..', 'components', 'translate', 'TranslateModal.jsx'), 'utf8'));
        expect(tm).toMatch(/openUploadModal\(\{ tab: 'manage' \}\)/);
    });
});

describe('ô tìm nằm chính giữa nav', () => {
    /**
     * Gộp thân của MỌI quy tắc có chứa selector này.
     *
     * `.nav-right` xuất hiện hai lần: một lần trong nhóm `.nav-left, .nav-right`
     * (mang `flex`), một lần riêng (mang `justify-content`). Lấy quy tắc đầu là
     * kết luận sai về cái thứ hai.
     */
    function rule(sel) {
        const re = /(^|\n)([^{}]+)\{([^}]*)\}/g;
        let m, out = '';
        while ((m = re.exec(layout)) !== null) {
            const parts = m[2].split(',').map(x => x.trim().replace(/\s+/g, ' '));
            if (parts.includes(sel)) out += m[3];
        }
        expect(out, `không tìm thấy ${sel}`).not.toBe('');
        return out;
    }

    test('hai nhóm chiếm BẰNG NHAU, không theo số nút', () => {
        // `basis: 0` là phần quan trọng: thiếu nó thì phần chênh 2 nút vs 4 nút
        // vẫn tính vào và ô tìm vẫn lệch.
        expect(rule('.nav-left')).toMatch(/flex:\s*1 1 0/);
    });

    test('nhóm phải dồn về mép phải', () => {
        expect(rule('.nav-right')).toMatch(/justify-content:\s*flex-end/);
    });

    test('ô tìm rộng hơn mỗi nhóm nút', () => {
        // Chia đều ba phần thì ô tìm hẹp bằng hàng nút, mà nó hay dùng nhất.
        expect(rule('.nav-center')).toMatch(/flex:\s*2 1 0/);
    });
});

describe('khổ điện thoại: nav một hàng chật', () => {
    test('hai nhóm KHÔNG giãn ra bóp mất ô tìm', () => {
        // Chỉ huỷ `flex-shrink` là chưa đủ — `flex-grow: 1` từ layout.css vẫn áp.
        const m = responsive.match(/@media screen and \(max-width: 480px\)\s*\{([\s\S]*)/);
        expect(m).toBeTruthy();
        expect(m[1]).toMatch(/\.nav-left\s*\{[^}]*flex:\s*0 0 auto/);
        expect(m[1]).toMatch(/\.nav-right\s*\{[^}]*flex:\s*0 0 auto/);
    });
});
