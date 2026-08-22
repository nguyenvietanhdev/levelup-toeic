/**
 * QUY TẮC BẤT BIẾN của chế độ "Ôn lại từ sai".
 *
 *   1. Vào chế độ thì LUÔN phải qua popup chọn đề ở tab "Từ vựng sai".
 *      Không lối nào được đi thẳng xuống bước chọn Part.
 *   2. Rời chế độ — thoát giữa chừng hay làm xong hết — thì mất lựa chọn đề,
 *      lượt sau phải chọn lại.
 *
 * Hai vế dính nhau: thiếu vế 2 thì `currentTopic` còn nguyên nhóm `wrong:` và
 * lần vào sau `start()` rơi thẳng xuống bước Part, tức là vế 1 bị vô hiệu mà
 * không có dòng code nào trông sai cả.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'practiceManager.js'), 'utf8');

/** Thân hàm `start()` — nơi mọi guard vào chế độ sống. */
function thanStart() {
    const i = src.indexOf('async start(mode) {');
    expect(i).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('\n    cleanupMode(mode)', i));
}

describe('vế 1 — luôn phải chọn đề trước', () => {
    test('guard chọn đề đứng TRƯỚC guard chọn Part', () => {
        // Đứng sau thì `review-mistakes` đã lọt vào bước Part rồi mới bị chặn.
        const t = thanStart();
        const iDe = t.indexOf("mode === 'review-mistakes'");
        const iPart = t.indexOf('showPartSelectionModal');
        expect(iDe).toBeGreaterThan(-1);
        expect(iPart).toBeGreaterThan(-1);
        expect(iDe).toBeLessThan(iPart);
    });

    test('KHÔNG còn miễn trừ theo đề đang chọn', () => {
        // Bản cũ: `mode === 'review-mistakes' && !dangLaNhomTuSai` — đề cũ còn
        // là nhóm `wrong:` thì bỏ qua popup. Đó đúng là đường tắt bị cấm.
        expect(thanStart()).not.toMatch(/dangLaNhomTuSai/);
    });

    test('guard chọn đề chung không loại trừ chế độ này nữa', () => {
        // Bản cũ: `if (!currentTopic && mode !== 'review-mistakes')`. Chỉ soi
        // ĐÚNG guard đó — hai chỗ `mode !== 'review-mistakes'` còn lại trong
        // `start()` là hợp lệ và không liên quan chọn đề: bỏ qua kiểm tra pool
        // (chế độ này có pool từ sai riêng), và không ghi lại từ sai vào chính
        // danh sách đang ôn.
        const t = thanStart();
        const i = t.indexOf('if (!TopicSelector.currentTopic');
        expect(i).toBeGreaterThan(-1);
        expect(t.slice(i, t.indexOf(') {', i))).not.toMatch(/review-mistakes/);
    });

    test('chặn rồi thì DỪNG, không chạy tiếp xuống trừ năng lượng', () => {
        const t = thanStart();
        const i = t.indexOf("mode === 'review-mistakes'");
        // Ngay trong khối guard phải có `return false`.
        expect(t.slice(i, i + 220)).toMatch(/return false;/);
    });

    test('popup mở đúng ở tab từ vựng sai, khoá hai tab kia', () => {
        // `pendingMode` là thứ TopicModal đọc để khoá tab.
        const t = thanStart();
        const i = t.indexOf("mode === 'review-mistakes'");
        expect(t.slice(i, i + 220)).toMatch(/TOPIC_MODAL_REQUESTED, \{ pendingMode: mode \}/);
    });

    test('ngoại lệ duy nhất là "Làm lại N câu sai"', () => {
        // Nút đó chạy lại câu vừa sai TRONG lượt này, không mở lượt mới — không
        // có đề nào để chọn. Ngoại lệ nào khác đều là đường tắt trá hình.
        const t = thanStart();
        const i = t.indexOf("mode === 'review-mistakes'");
        const dieuKien = t.slice(i, t.indexOf(') {', i));
        expect(dieuKien).toMatch(/!PartSelector\.retryWords\?\.length/);
        // Đúng MỘT điều kiện phụ, không hơn.
        expect(dieuKien.split('&&').length).toBe(2);
    });
});

describe('vế 2 — rời chế độ là mất lựa chọn đề', () => {
    test('có hàm xoá lựa chọn, xoá cả `settings`', () => {
        // `settings.selectedPart` là bản sao thứ hai của cùng một lựa chọn; bỏ
        // sót thì popup Part mở ra với Part cũ đã tick sẵn.
        const i = src.indexOf('xoaLuaChonTuSai() {');
        expect(i).toBeGreaterThan(-1);
        const than = src.slice(i, src.indexOf('\n    },', i));
        expect(than).toMatch(/setCurrentTopic\(null\)/);
        expect(than).toMatch(/PartSelector\.selectedPart = null/);
        expect(than).toMatch(/settings\.selectedPart = null/);
    });

    test('chỉ xoá khi đề đang chọn LÀ nhóm từ sai', () => {
        // Người dùng đang ôn Topic 3 rồi bấm nhầm chế độ khác thì không có lý
        // do gì mất lựa chọn của họ.
        const i = src.indexOf('xoaLuaChonTuSai() {');
        const than = src.slice(i, src.indexOf('\n    },', i));
        expect(than).toMatch(/startsWith\('wrong:'\)/);
        expect(than).toMatch(/if \(![\s\S]{0,90}\) return;/);
    });

    test('gọi ở CẢ BA đường rời chế độ', () => {
        // Thoát có session (hỏi xác nhận) · thoát không session · làm xong rồi
        // bấm "Về trang chủ" ở màn kết quả. Sót một đường là quy tắc thủng ở
        // đúng đường đó, mà hai đường kia vẫn chạy đúng nên rất khó thấy.
        expect(src.split('this.xoaLuaChonTuSai();').length - 1).toBe(3);
    });

    test('xoá TRƯỚC khi điều hướng về trang chủ', () => {
        // Xoá sau `showScreen` thì HomeScreen đã đọc trạng thái cũ để dựng lưới.
        const i = src.indexOf("UI.showScreen('home-screen');");
        const truoc = src.slice(Math.max(0, i - 400), i);
        expect(truoc).toMatch(/xoaLuaChonTuSai/);
    });
});
