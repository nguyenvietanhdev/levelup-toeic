/**
 * Nhận ra chữ tiếng Việt — và không phải đoán khi đã biết chắc.
 *
 * ── LỖI 1: BỘ DẤU SÓT NGUYÊN MỘT HỌ ─────────────────────────────────────────
 * `speakWord` nhận diện tiếng Việt bằng một danh sách ký tự gõ tay. Danh sách
 * đó thiếu HẲN ừ ứ ử ữ ự (U+1EE9…U+1EF1) — cả họ `ư` mang dấu. Hậu quả: "Ngựa",
 * "sữa", "tự tin", "cửa", "lửa", "trứng" đều bị coi là tiếng Anh và đọc bằng
 * giọng Mỹ.
 *
 * Kiểu lỗi này không sửa được bằng cách bổ sung thêm ký tự — lần sau lại sót họ
 * khác. Phải gõ theo KHOẢNG Unicode: U+1EA0–U+1EF9 chứa toàn bộ nguyên âm tiếng
 * Việt mang dấu hỏi, ngã, nặng và mọi tổ hợp với ă â ê ô ơ ư.
 *
 * ── LỖI 2: ĐOÁN Ở CHỖ ĐÃ BIẾT CHẮC ──────────────────────────────────────────
 * Nhận diện dù hoàn hảo vẫn bó tay trước nghĩa KHÔNG DẤU: "Ba", "Anh trai",
 * "in", "kho", "cho vay" trông y hệt tiếng Anh. Đếm trên DB thật: 175/8605
 * nghĩa của kho `en` và 457/12679 của kho `zh` — tổng 632 — không có lấy một
 * dấu nào.
 *
 * Không cách nào đoán đúng, mà cũng không cần đoán: chỗ gọi BIẾT mặt nào là mặt
 * nghĩa. `maCapHoc`/`maTheoChieu` trả sẵn mã BCP-47 cho từng mặt.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const gl = readFileSync(join(__dirname, 'gameLogic.js'), 'utf8');

/** Chính biểu thức nhận diện trong `speakWord`, lấy ra từ mã nguồn. */
const RE_VI = (() => {
    const m = gl.match(/const isViText = !isZhText\s*\r?\n\s*&& (\/\[.+?\]\/i)\.test\(chu\);/);
    expect(m, 'không tìm thấy biểu thức nhận diện tiếng Việt').toBeTruthy();
    // eslint-disable-next-line no-eval
    return eval(m[1]);
})();

describe('bộ dấu KHÔNG được sót họ nào', () => {
    test('cả họ `ư` mang dấu — đúng chỗ đã sót', () => {
        for (const c of ['ừ', 'ứ', 'ử', 'ữ', 'ự']) {
            expect(RE_VI.test(c), `thiếu ${c}`).toBe(true);
        }
    });

    test('những từ thật từng bị đọc giọng Anh', () => {
        for (const t of ['Ngựa', 'sữa', 'tự tin', 'cửa', 'lửa', 'trứng', 'người tự do']) {
            expect(RE_VI.test(t), `${t} vẫn bị coi là tiếng Anh`).toBe(true);
        }
    });

    test('quét TOÀN BỘ khối U+1EA0–U+1EF9, không sót ký tự nào', () => {
        // Đây mới là phép kiểm thật: kiểm từng ca lẻ thì lần sau sót họ khác.
        const sot = [];
        for (let cp = 0x1ea0; cp <= 0x1ef9; cp++) {
            const c = String.fromCodePoint(cp);
            if (!RE_VI.test(c)) sot.push(`U+${cp.toString(16).toUpperCase()} ${c}`);
        }
        expect(sot, `sót: ${sot.join(', ')}`).toEqual([]);
    });

    test('bảy chữ nền riêng của tiếng Việt', () => {
        for (const c of ['ă', 'â', 'đ', 'ê', 'ô', 'ơ', 'ư']) {
            expect(RE_VI.test(c), `thiếu ${c}`).toBe(true);
        }
    });

    test('hoa cũng nhận ra', () => {
        // Nghĩa trong DB rất hay viết hoa chữ đầu ("Ngựa", "Đường").
        expect(RE_VI.test('NGỰA')).toBe(true);
        expect(RE_VI.test('Đường')).toBe(true);
    });

    test('KHÔNG nhận nhầm tiếng Anh thuần', () => {
        // Nhận nhầm thì từ tiếng Anh bị đọc bằng giọng Việt — hỏng chiều ngược.
        for (const t of ['supplier', 'contract', 'warehouse', 'invoice', 'schedule']) {
            expect(RE_VI.test(t), `${t} bị coi là tiếng Việt`).toBe(false);
        }
    });

    test('viết theo KHOẢNG, không liệt kê tay', () => {
        // Liệt kê tay là cách đã sinh ra lỗi này; chốt luôn hình thức.
        expect(gl).toMatch(/Ạ-ỹ/);
    });
});

describe('nhận diện KHÔNG cứu được nghĩa không dấu', () => {
    test('những nghĩa thật trong DB vẫn không đoán nổi', () => {
        // Không phải để "chốt lỗi", mà để nói rõ VÌ SAO phải truyền mã ngôn ngữ:
        // đây là giới hạn của mọi phép nhận diện, sửa regex bao nhiêu cũng vậy.
        for (const t of ['Ba', 'Anh trai', 'kho', 'cho vay', 'tham gia']) {
            expect(RE_VI.test(t)).toBe(false);
        }
    });
});

describe('chỗ gọi BIẾT thì phải nói ra', () => {
    const F = (...p) => readFileSync(join(__dirname, '..', ...p), 'utf8');
    const mc = F('components', 'practice', 'modes', 'multipleChoice.js');
    const rm = F('components', 'practice', 'modes', 'reviewMistakes.js');
    const fc = F('components', 'practice', 'modes', 'flashcard.js');

    test('Trắc nghiệm truyền mã của MẶT ĐANG HIỆN', () => {
        expect(mc).toMatch(/import \{ maTheoChieu \}/);
        expect(mc).toMatch(/maTheoChieu\(question\.reversed, question\.word\)\.trai/);
        expect(mc).toMatch(/maTheoChieu\(q\.reversed, q\.word\)\.trai/);
    });

    test('"Ôn từ sai" truyền mã mặt hỏi', () => {
        expect(rm).toMatch(/maCapHoc\(question\.word\)\.tu/);
    });

    test('Flashcard có `maMat` song sinh với `chuMat`', () => {
        // `chuMat` đã biết mặt nào là nghĩa; `maMat` chỉ nói ra điều đó.
        expect(fc).toMatch(/maMat\(word, matSau = false\) \{/);
        expect(fc).toMatch(/return \(dao !== matSau\) \? nghia : tu;/);
    });

    test('Flashcard: MỌI lối đọc đều kèm mã', () => {
        // Sót một lối là đúng lối đó quay về đoán.
        const goi = fc.match(/this\.pronounce\(this\.chuMat\([\s\S]*?\);/g) || [];
        expect(goi.length).toBe(5);
        for (const g of goi) expect(g, g).toMatch(/this\.maMat\(/);
    });

    test('`maMat` dùng ĐÚNG cách lật của `chuMat`', () => {
        // Hai hàm lệch nhau một dấu `!` là đọc mặt này bằng giọng mặt kia —
        // nghe vẫn "có tiếng" nên rất khó phát hiện.
        const lay = (ten) => {
            const i = fc.indexOf(`${ten}(word, matSau = false) {`);
            return fc.slice(i, fc.indexOf('\n    },', i));
        };
        expect(lay('chuMat')).toMatch(/\(dao !== matSau\) \?/);
        expect(lay('maMat')).toMatch(/\(dao !== matSau\) \?/);
    });
});
