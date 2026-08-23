/**
 * Nhớ vị trí cuộn của popup chọn đề / chọn Part.
 *
 * Test GỌI HÀM THẬT với phần tử DOM giả — logic ở đây thuần và dễ kiểm.
 *
 * Chỗ dễ hỏng nhất KHÔNG phải việc lưu mà là:
 *   1. Khôi phục quá sớm — DOM đã dựng nhưng layout chưa tính xong, `scrollTop`
 *      bị kẹp về số nhỏ hơn và danh sách nhảy về gần đầu.
 *   2. Không gỡ listener — nó treo trên phần tử đã bị gỡ khỏi cây.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    luuCuon, docCuon, quenCuon, khoiPhucCuon, theoDoiCuon,
    cuonToiChonHoacNho, _xoaHet,
} from './scrollMemory.js';

/** Phần tử giả có `scrollTop` ghi được. */
function taoEl(top = 0) {
    const el = document.createElement('div');
    Object.defineProperty(el, 'isConnected', { value: true, configurable: true });
    el.scrollTop = top;
    return el;
}

beforeEach(() => _xoaHet());

describe('lưu và đọc', () => {
    test('lưu rồi đọc lại đúng giá trị', () => {
        luuCuon('a', taoEl(250));
        expect(docCuon('a')).toBe(250);
    });

    test('chưa lưu gì thì trả 0', () => {
        expect(docCuon('chua-co')).toBe(0);
    });

    test('KHÔNG lưu vị trí 0', () => {
        // Cuộn lên đầu rồi đóng nghĩa là lần sau mở ở đầu mới đúng ý — lưu số 0
        // chỉ chiếm chỗ mà không thay đổi hành vi.
        luuCuon('a', taoEl(300));
        luuCuon('a', taoEl(0));
        expect(docCuon('a')).toBe(0);
    });

    test('mỗi khoá độc lập', () => {
        // Ba tab của popup chọn đề là ba danh sách khác hẳn; dùng chung khoá thì
        // chuyển tab xong bị ném xuống vị trí của tab trước.
        luuCuon('topic-modal:general', taoEl(100));
        luuCuon('topic-modal:wrong', taoEl(400));
        expect(docCuon('topic-modal:general')).toBe(100);
        expect(docCuon('topic-modal:wrong')).toBe(400);
    });

    test('quên được khi cần', () => {
        luuCuon('a', taoEl(120));
        quenCuon('a');
        expect(docCuon('a')).toBe(0);
    });

    test('đầu vào hỏng không ném lỗi', () => {
        for (const v of [null, undefined, {}]) {
            expect(() => luuCuon('a', v)).not.toThrow();
            expect(() => luuCuon(v, taoEl(10))).not.toThrow();
        }
        expect(() => khoiPhucCuon(null, null)).not.toThrow();
    });

    test('có TRẦN số khoá — không phình vô hạn', () => {
        for (let i = 0; i < 80; i++) luuCuon(`k${i}`, taoEl(i + 1));
        // Khoá cũ nhất bị đẩy ra, khoá mới nhất còn.
        expect(docCuon('k79')).toBeGreaterThan(0);
        expect(docCuon('k0')).toBe(0);
    });
});

describe('khôi phục', () => {
    test('hoãn qua HAI khung hình trước khi đặt `scrollTop`', async () => {
        // Một khung là không đủ: React đã dựng DOM nhưng trình duyệt chưa tính
        // xong layout, nên `scrollHeight` còn nhỏ hơn thật và `scrollTop` bị kẹp
        // về giá trị nhỏ hơn — danh sách nhảy về gần đầu thay vì đúng chỗ.
        const el = taoEl(0);
        luuCuon('a', taoEl(200));
        khoiPhucCuon('a', el);

        // Chưa đặt ngay.
        expect(el.scrollTop).toBe(0);
        // SAU MỘT khung vẫn chưa đặt — đây là điều phân biệt "hai khung" với
        // "một khung", và là thứ ca cũ (chỉ kiểm `raf` có được gọi) bỏ lọt.
        await new Promise((r) => requestAnimationFrame(r));
        expect(el.scrollTop).toBe(0);
        // Sau khung thứ hai mới đặt.
        await new Promise((r) => requestAnimationFrame(r));
        expect(el.scrollTop).toBe(200);
    });

    test('đặt đúng vị trí sau khi hai khung trôi qua', async () => {
        const el = taoEl(0);
        luuCuon('a', taoEl(200));
        khoiPhucCuon('a', el);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        expect(el.scrollTop).toBe(200);
    });

    test('KHÔNG đặt nếu phần tử đã rời khỏi cây', () => {
        // Người dùng đóng popup nhanh hơn hai khung hình.
        const el = taoEl(0);
        Object.defineProperty(el, 'isConnected', { value: false, configurable: true });
        luuCuon('a', taoEl(200));
        khoiPhucCuon('a', el);
        return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
            expect(el.scrollTop).toBe(0);
            r();
        })));
    });

    test('huỷ được trước khi khôi phục chạy', async () => {
        const el = taoEl(0);
        luuCuon('a', taoEl(200));
        khoiPhucCuon('a', el)();     // huỷ ngay
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        expect(el.scrollTop).toBe(0);
    });

    test('chưa lưu gì thì không đụng vào `scrollTop`', async () => {
        const el = taoEl(77);
        khoiPhucCuon('chua-co', el);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        expect(el.scrollTop).toBe(77);
    });
});

describe('theo dõi cuộn', () => {
    test('tự lưu khi người dùng cuộn', () => {
        const el = taoEl(0);
        theoDoiCuon('a', el);
        el.scrollTop = 333;
        el.dispatchEvent(new Event('scroll'));
        expect(docCuon('a')).toBe(333);
    });

    test('hàm gỡ BỎ listener — không treo trên phần tử đã gỡ', () => {
        const el = taoEl(0);
        const go = theoDoiCuon('a', el);
        go();
        el.scrollTop = 500;
        el.dispatchEvent(new Event('scroll'));
        expect(docCuon('a')).toBe(0);
    });

    test('dùng `passive` — không làm khựng khi cuộn danh sách dài', () => {
        // Thiếu `passive` thì trình duyệt phải chờ handler chạy xong mới cuộn
        // tiếp, dù handler không hề gọi `preventDefault`.
        const el = taoEl(0);
        const spy = vi.spyOn(el, 'addEventListener');
        theoDoiCuon('a', el);
        expect(spy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    });

    test('phần tử null trả hàm gỡ rỗng, không ném', () => {
        expect(() => theoDoiCuon('a', null)()).not.toThrow();
    });
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const modal = readFileSync(
    join(__dirname, '..', 'components', 'vocab', 'topic', 'TopicModal.jsx'), 'utf8');
const part = readFileSync(
    join(__dirname, '..', 'components', 'vocab', 'part', 'partSelector.js'), 'utf8');

describe('nối vào hai popup', () => {

    test('popup chọn đề nhớ RIÊNG từng tab', () => {
        // Ba tab là ba danh sách khác hẳn nhau; chung khoá thì chuyển tab xong
        // bị ném xuống vị trí của tab trước — tệ hơn là không nhớ gì.
        expect(modal).toMatch(/theoDoiCuon\(`topic-modal:\$\{tab\}`/);
    });

    test('cả BA danh sách của popup chọn đề đều được gắn', () => {
        // Gắn hai trong ba thì tab còn lại im lặng không nhớ.
        expect(modal.split('ref={gapDanhSach}').length - 1).toBe(3);
    });

    test('gỡ theo dõi cũ trước khi gắn mới', () => {
        // Chuyển tab là gỡ danh sách cũ và gắn danh sách mới; không gỡ thì mỗi
        // lần chuyển tab cộng thêm một listener.
        const i = modal.indexOf('const gapDanhSach');
        const than = modal.slice(i, modal.indexOf('};', i));
        expect(than.indexOf('goCuonRef.current?.()'))
            .toBeLessThan(than.indexOf('theoDoiCuon'));
    });

    test('popup chọn Part bám `.modal-body`, KHÔNG phải `.topics-grid`', () => {
        // Lưới Part không có `overflow` riêng (xem `layout.css`) — phần cuộn
        // thật là thân modal. Bám nhầm thì `scrollTop` luôn 0 và tính năng im
        // lặng không chạy: không lỗi, không dấu hiệu, chỉ là không nhớ gì.
        const i = part.indexOf('theoDoiCuon(');
        expect(i).toBeGreaterThan(-1);
        const goi = part.slice(i, part.indexOf(';', i));
        expect(goi).toContain(".modal-body");
        expect(goi).not.toContain('topics-grid');
    });

    test('phần tử được bám phải THẬT SỰ cuộn được', () => {
        // Chốt chặn ở tầng CSS: `.topics-list` (popup chọn đề) phải có
        // `overflow-y`, còn `.topics-grid` thì không — đó là lý do hai popup bám
        // hai phần tử khác nhau.
        const css = readFileSync(
            join(__dirname, '..', 'assets', 'styles', 'components.css'), 'utf8');
        const i = css.indexOf('.topics-list {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/overflow-y: auto/);
    });

    test('popup chọn Part gỡ theo dõi khi đóng', () => {
        const i = part.indexOf('onClose: () => {');
        const than = part.slice(i, part.indexOf('},', i));
        expect(than).toMatch(/this\._goCuon\?\.\(\)/);
    });
});

describe('ưu tiên cuộn tới MỤC ĐANG CHỌN', () => {
    /** Vùng cuộn giả có một thẻ `.selected` ở vị trí cho trước. */
    function taoDanhSach({ chonTop = null, khungCao = 300, elTop = 0 } = {}) {
        const el = taoEl(0);
        Object.defineProperty(el, 'offsetTop', { value: elTop, configurable: true });
        Object.defineProperty(el, 'clientHeight', { value: khungCao, configurable: true });
        if (chonTop !== null) {
            const card = document.createElement('div');
            card.className = 'topic-card selected';
            Object.defineProperty(card, 'offsetTop', { value: chonTop, configurable: true });
            el.appendChild(card);
        }
        return el;
    }

    const haiKhung = () =>
        new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    test('có mục đang chọn → cuộn tới nó, BỎ QUA vị trí đã nhớ', async () => {
        // Người dùng mở popup ra thường là để xem mình đang ở đề nào. Vị trí cũ
        // chỉ là xấp xỉ của điều đó — và sai hẳn nếu danh sách vừa đổi.
        luuCuon('k', taoEl(999));
        const el = taoDanhSach({ chonTop: 600 });
        cuonToiChonHoacNho('k', el);
        await haiKhung();
        expect(el.scrollTop).not.toBe(999);
        expect(el.scrollTop).toBeGreaterThan(0);
    });

    test('đặt mục đang chọn ở LƯNG CHỪNG, không dính mép trên', async () => {
        // Dính mép trên thì không thấy mục nào phía trước nó — mà người dùng
        // thường mở ra để đổi sang cái gần đó.
        const el = taoDanhSach({ chonTop: 600, khungCao: 300 });
        cuonToiChonHoacNho('k', el);
        await haiKhung();
        expect(el.scrollTop).toBe(600 - 100);   // trừ 1/3 khung
    });

    test('trừ `el.offsetTop` — `offsetTop` của thẻ KHÔNG tính từ vùng cuộn', async () => {
        // `offsetTop` đo từ phần tử định vị gần nhất, có thể là modal chứ không
        // phải danh sách. Dùng thẳng là nhảy lệch đúng bằng khoảng cách từ đỉnh
        // modal xuống đỉnh danh sách — cả trăm px.
        //
        // Ca trên đặt `el.offsetTop = 0` nên hai công thức trùng nhau; ca này
        // đặt khác 0 để phân biệt.
        const el = taoDanhSach({ chonTop: 600, khungCao: 300, elTop: 150 });
        cuonToiChonHoacNho('k', el);
        await haiKhung();
        expect(el.scrollTop).toBe(600 - 150 - 100);
    });

    test('mục chọn ở gần đầu KHÔNG cho ra scrollTop âm', async () => {
        const el = taoDanhSach({ chonTop: 20, khungCao: 300 });
        cuonToiChonHoacNho('k', el);
        await haiKhung();
        expect(el.scrollTop).toBe(0);
    });

    test('KHÔNG có mục chọn → dùng vị trí đã nhớ', async () => {
        // Tab "Từ vựng chung" có thể chưa chọn gì, mà người dùng vừa cuộn tới
        // giữa danh sách để so sánh vài bộ.
        luuCuon('k', taoEl(450));
        const el = taoDanhSach({ chonTop: null });
        cuonToiChonHoacNho('k', el);
        await haiKhung();
        expect(el.scrollTop).toBe(450);
    });

    test('không chọn gì và cũng chưa nhớ gì → giữ nguyên', async () => {
        const el = taoDanhSach({ chonTop: null });
        el.scrollTop = 33;
        cuonToiChonHoacNho('k', el);
        await haiKhung();
        expect(el.scrollTop).toBe(33);
    });

    test('`theoDoiCuon` dùng chung đường này', () => {
        // Hai hàm mà mỗi cái một luật thì popup nào gọi hàm nào lại cư xử khác
        // nhau.
        const src = readFileSync(join(__dirname, 'scrollMemory.js'), 'utf8');
        const i = src.indexOf('export function theoDoiCuon');
        expect(src.slice(i, i + 600)).toMatch(/cuonToiChonHoacNho/);
    });
});

describe('chuyển giữa hai popup — chờ modal cũ biến mất', () => {
    const nav = readFileSync(
        join(__dirname, '..', 'layouts', 'TopNav.jsx'), 'utf8');

    /** Thân `handleTopicSelected` — nơi mở popup Part sau khi chọn đề. */
    function thanChuyen() {
        const i = nav.indexOf('const handleTopicSelected');
        return nav.slice(i, nav.indexOf('}, []);', i));
    }

    test('KHÔNG dùng `setTimeout` cố định nữa', () => {
        // 200ms đủ cho bộ từ nhỏ nhưng không đủ khi đề có hàng trăm từ: modal
        // cũ còn trong cây khi popup Part mọc lên, và người dùng gặp đúng triệu
        // chứng "bấm Part không ăn, phải đóng rồi mở lại". Tăng con số chỉ đổi
        // ngưỡng — luôn có bộ từ đủ lớn để vượt qua.
        // Gỡ COMMENT trước khi soi: lời giải thích ngay trên chỗ sửa có nhắc
        // `setTimeout(200)` để ghi lại vì sao bỏ nó — chữ trong comment không
        // phải hành vi.
        const code = thanChuyen().replace(/\/\/.*/g, '');
        expect(code).not.toMatch(/setTimeout\(/);
    });

    test('HỎI DOM: chờ tới khi không còn modal nào', () => {
        const t = thanChuyen();
        expect(t).toMatch(/document\.querySelector\('#modal-container \.modal'\)/);
        expect(t).toMatch(/requestAnimationFrame\(cho\)/);
    });

    test('có hạn trên — không treo mãi nếu modal không bao giờ biến mất', () => {
        // Thà mở sớm một nhịp (PartSelector còn tự neo vào modal cuối cùng) còn
        // hơn không mở popup Part bao giờ.
        expect(thanChuyen()).toMatch(/bo >= \d+/);
    });

    test('mở popup Part một lần duy nhất', () => {
        // Gọi trong vòng lặp mà quên `return` thì mỗi khung hình mở thêm một
        // popup chồng lên nhau.
        const t = thanChuyen();
        const i = t.indexOf('moPart();');
        expect(t.slice(i, i + 60)).toMatch(/return;/);
    });
});
