/**
 * Màn "Tiến bộ của tôi": hồ sơ năng lực 8 tuần, mọi con số do server tính.
 *
 * Chỗ dễ hỏng, đều im lặng:
 *   1. Tuần chưa làm vẽ thành cột 0 → trông như "làm sai hết".
 *   2. Lỗi ngữ pháp GIẢM mà tô đỏ (dùng chung màu với điểm kỹ năng đi xuống).
 *   3. Thiếu dữ liệu mà vẫn hiện "Ổn định" thay vì "Chưa đủ dữ liệu".
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const doc = (...p) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');
const man = doc('components', 'tienBo', 'TienBoScreen.jsx');

describe('lối vào', () => {
    test('mục ĐẦU nhóm Tiến độ trong menu, không khoá Level; route tien-bo-screen', () => {
        const menu = doc('layouts', 'SideMenu.jsx');
        const i = menu.indexOf("title: 'Tiến độ'");
        const dau = menu.indexOf('{ label:', i);
        const muc = menu.slice(dau, menu.indexOf('}', dau));
        expect(muc).toMatch(/label: 'Tiến bộ của tôi'.*screen: 'tien-bo-screen'/);
        expect(muc).not.toMatch(/feature:/);
        expect(doc('App.jsx')).toMatch(/'tien-bo-screen': TienBoScreen/);
        expect(doc('api', 'tienBo.js')).toMatch(/Http\.get\('\/tien-bo'\)/);
    });
});

describe('màn tiến bộ', () => {
    test('tải lại mỗi lần mở màn; chưa đăng nhập thì không gọi API', () => {
        expect(man).toMatch(/TienBoAPI\.get\(\)/);
        expect(man).toMatch(/if \(!active \|\| !isLoggedIn\) return undefined;/);
        expect(man).toMatch(/\}, \[active, isLoggedIn\]\);/);
    });

    test('tuần chưa làm là vạch trống, không phải cột 0', () => {
        expect(man).toMatch(/className=\{d === null \? 'is-trong' : ''\}/);
        expect(doc('assets', 'styles', 'components.css')).toMatch(/\.tb-cot span\.is-trong \{/);
    });

    test('lỗi ngữ pháp có bảng màu riêng: BỚT lỗi là tốt', () => {
        expect(man).toMatch(/giam: \{ nhan: 'Đang bớt', icon: 'fa-arrow-trend-down', lop: 'is-tot' \}/);
        expect(man).toMatch(/tang: \{ nhan: 'Tăng lên', icon: 'fa-arrow-trend-up', lop: 'is-xau' \}/);
        expect(man).toMatch(/<NhanXuHuong xh=\{g\.xuHuong\} bang=\{XU_HUONG_LOI\} \/>/);
    });

    test('xu hướng null → "Chưa đủ dữ liệu"', () => {
        expect(man).toMatch(/if \(!x\) return <span className="tb-xu-huong">Chưa đủ dữ liệu<\/span>;/);
    });

    test('bấm thẻ kỹ năng mở đúng chế độ, chế độ còn khoá Level thì không mở', () => {
        expect(man).toMatch(/noi: \{ screen: 'voice-conversation-screen', feature: 'feature:conversation' \}/);
        expect(man).toMatch(/if \(!dich \|\| \(dich\.feature && lockInfo\(dich\.feature\)\.locked\)\) return;/);
        expect(man).toMatch(/disabled=\{khoa\.locked\}/);
    });

    test('chưa có bài nào → mời sang Lộ trình hôm nay, không vẽ thẻ rỗng', () => {
        expect(man).toMatch(/data && !data\.coDuLieu && \(/);
        expect(man).toMatch(/data && data\.coDuLieu && \(/);
    });
});

describe('tổng kết tuần (AI)', () => {
    test('mở màn chỉ ĐỌC bản đã lưu; AI chỉ chạy khi bấm nút', () => {
        expect(doc('api', 'tienBo.js')).toMatch(/Http\.get\('\/tien-bo\/tong-ket'\)/);
        expect(doc('api', 'tienBo.js')).toMatch(/Http\.post\('\/tien-bo\/tong-ket', \{\}\)/);
        const effect = man.slice(man.indexOf('useEffect(() => {'), man.indexOf('}, [active, isLoggedIn]);'));
        expect(effect).toMatch(/TienBoAPI\.tongKet\(\)/);
        expect(effect).not.toMatch(/taoTongKet/);
        expect(man).toMatch(/onClick=\{nhoTongKet\} disabled=\{dangTongKet\}/);
    });

    test('kế hoạch: nút "Làm" chỉ khi bước hợp lệ và chế độ không khoá; Ôn sai đi qua sự kiện', () => {
        expect(man).toMatch(/\{dich && !khoa\.locked && \(/);
        expect(man).toMatch(/'on-sai': \{ mode: 'review-mistakes' \}/);
        expect(man).toMatch(/EventBus\.emit\(GameEvents\.PRACTICE_REQUESTED, \{ mode: dich\.mode \}\)/);
    });

    test('Lộ trình hôm nay nhắc kế hoạch tuần khi đã có tổng kết', () => {
        const lt = doc('components', 'loTrinh', 'LoTrinhScreen.jsx');
        expect(lt).toMatch(/\{data\.keHoachTuan\?\.length > 0 && \(/);
        expect(lt).toMatch(/showScreen\('tien-bo-screen'\)/);
    });
});
