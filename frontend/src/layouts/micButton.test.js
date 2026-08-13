/**
 * Nút ghi âm phải là ANH EM của ô tìm, không phải con của nó.
 *
 * Bản trước nó nằm TRONG `.search-bar`. Trên điện thoại ô tìm thu lại thành nút
 * kính lúp và mic bị `display: none` — bấm vào chỗ đó là bấm trúng input, nên
 * nút ghi âm coi như không tồn tại. Triệu chứng người dùng gặp: "bấm nút ghi âm
 * thì nó cứ nhảy vào ô nhập".
 *
 * Trên máy tính vẫn phải TRÔNG như nằm trong ô — kéo bằng margin âm, không phải
 * `position: absolute`: ra khỏi `.search-bar` thì `absolute` bám lên tổ tiên
 * định vị gần nhất (`.top-nav`) và nút bay sang tận mép màn hình.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const nav = readFileSync(join(__dirname, 'TopNav.jsx'), 'utf8');
const layout = readFileSync(join(__dirname, '..', 'assets', 'styles', 'layout.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

describe('cấu trúc DOM', () => {
    test('mic nằm NGOÀI .search-bar', () => {
        // Cắt từ mở `.search-bar` tới thẻ đóng của nó; mic không được ở trong.
        const open = nav.indexOf('className={`search-bar');
        expect(open).toBeGreaterThan(-1);
        const micAt = nav.indexOf('mic-btn', open);
        const navRightAt = nav.indexOf('className="nav-right"', open);
        expect(micAt).toBeGreaterThan(-1);
        // Mic phải đứng sau ô tìm và trước nhóm nút phải → tức là trong
        // `.nav-center` nhưng ngoài `.search-bar`.
        expect(micAt).toBeLessThan(navRightAt);
        // Và KHÔNG được nằm giữa input với thẻ đóng của .search-bar.
        const inputAt = nav.indexOf('id="search-input"', open);
        const between = nav.slice(inputAt, micAt);
        // Thẻ đóng của .search-bar phải xuất hiện TRƯỚC mic.
        expect(between).toMatch(/<\/div>/);
    });

    test('vẫn giữ nút cho trình duyệt KHÔNG hỗ trợ, ở dạng mờ', () => {
        // Ẩn im lặng khiến người ta nghĩ app hỏng; nút mờ khiến người ta biết
        // phải đổi trình duyệt.
        expect(nav).toMatch(/is-unsupported/);
        expect(nav).toMatch(/không hỗ trợ nhập giọng nói/);
    });
});

describe('nhấn GIỮ để nói, nhả để điền', () => {
    test('bắt đầu thu ở pointerdown, dừng ở pointerup', () => {
        expect(nav).toMatch(/onPointerDown=\{handleMicDown\}/);
        expect(nav).toMatch(/onPointerUp=\{handleMicUp\}/);
    });

    test('kéo ngón RA NGOÀI nút rồi nhả cũng phải dừng', () => {
        // `pointerup` bắn ở chỗ khác — thiếu hai dòng này là micro chạy mãi.
        expect(nav).toMatch(/onPointerLeave=\{handleMicUp\}/);
        expect(nav).toMatch(/onPointerCancel=\{handleMicUp\}/);
    });

    test('chặn `click` bắn sau khi vừa giữ xong', () => {
        // `click` LUÔN bắn sau `pointerup`; không chặn thì nó toggle lại và
        // micro BẬT LẠI ngay sau khi người dùng nhả tay.
        expect(nav).toMatch(/micJustHeldRef\.current = true/);
        expect(nav).toMatch(/if \(micJustHeldRef\.current\) \{ micJustHeldRef\.current = false; return; \}/);
    });

    test('vẫn giữ lối CHẠM NHANH để bật/tắt', () => {
        // Người quen chạm nhanh mà chỉ có giữ thì bật xong không biết tắt kiểu gì.
        expect(nav).toMatch(/onClick=\{handleMicClick\}/);
        expect(nav).toMatch(/toggleSpeech\(\);/);
    });

    test('preventDefault ở pointerdown — không cướp focus khỏi ô nhập', () => {
        // Mất focus là ô tìm tự thu lại giữa chừng.
        const i = nav.indexOf('const handleMicDown');
        expect(nav.slice(i, i + 500)).toMatch(/e\.preventDefault\(\)/);
    });
});

describe('nhận diện theo NGÔN NGỮ ĐANG HỌC', () => {
    test('lấy ngôn ngữ từ vocabLang, không đoán từ âm thanh', () => {
        // Chọn sẵn ngôn ngữ thì bộ nhận diện ra đúng mặt chữ; để nó tự suy từ
        // âm là tiếng Trung ra chữ Latin.
        expect(nav).toMatch(/lang: speechLangFor\(getVocabLang\(\)\)/);
    });
});

describe('vị trí trên máy tính', () => {
    function micRule() {
        const m = layout.match(/(^|\n)\.mic-btn\s*\{([^}]*)\}/);
        expect(m).toBeTruthy();
        return m[2];
    }

    test('KHÔNG dùng position: absolute nữa', () => {
        // Ra khỏi `.search-bar` thì absolute bám lên `.top-nav` và nút bay sang
        // mép màn hình.
        expect(micRule()).not.toMatch(/position:\s*absolute/);
    });

    test('kéo vào trong ô bằng margin âm, có trừ gap của .nav-center', () => {
        const r = micRule();
        expect(r).toMatch(/margin-left:\s*calc\(-34px - var\(--spacing-sm\)\)/);
    });

    test('có nút xoá thì lùi thêm để hai nút không đè nhau', () => {
        expect(layout).toMatch(/\.nav-center:has\(\.clear-search-btn\) \.mic-btn/);
    });

    test('không co lại khi hàng chật', () => {
        // `flex-shrink` mặc định là 1 — nút sẽ bị bóp méo rồi biến mất.
        expect(micRule()).toMatch(/flex:\s*0 0 auto/);
    });
});
