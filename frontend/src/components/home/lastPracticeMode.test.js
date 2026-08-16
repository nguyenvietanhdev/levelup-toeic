/**
 * Nút "Luyện tập ngay" mở CHẾ ĐỘ GẦN NHẤT, không phải luôn Trắc nghiệm.
 *
 * Hai nút trên Trang chủ (dải nhắc ôn tập + thẻ streak) đều cứng
 * `handleModeClick('multiple-choice')`. Ai quen chơi Flashcard hay Nghe & chọn
 * thì bấm xong vẫn phải thoát ra chọn lại.
 *
 * Ba chỗ dễ hỏng — nút này bấm là VÀO THẲNG, không có bước nào để sửa:
 *   1. Chế độ lưu từ lần trước có thể đã bị gỡ khỏi danh sách (đổi phiên bản).
 *   2. Khách chưa đăng nhập mà chế độ đó cần tài khoản.
 *   3. Chế độ khoá theo Level — tài khoản mới trên máy cũ vẫn còn giá trị lưu.
 * Không kiểm thì bấm nút chỉ hiện "cần đăng nhập / cần Level N": đúng về mặt
 * chặn, nhưng người dùng bấm "Luyện tập ngay" mà không luyện được gì.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const home = readFileSync(join(__dirname, 'HomeScreen.jsx'), 'utf8');
const pm = readFileSync(
    join(__dirname, '..', 'practice', 'practiceManager.js'), 'utf8');

describe('lưu chế độ vừa luyện', () => {
    test('ghi vào Storage khi phiên BẮT ĐẦU', () => {
        expect(pm).toMatch(/Storage\.set\('lastPracticeMode', mode\)/);
    });

    test('lưu lúc bắt đầu, KHÔNG đợi hoàn thành', () => {
        // Bỏ dở giữa chừng vẫn là chế độ họ vừa chọn — đó mới là thứ muốn quay lại.
        const i = pm.indexOf("Storage.set('lastPracticeMode'");
        const j = pm.indexOf('this.currentSession = {');
        expect(i).toBeGreaterThan(-1);
        expect(i).toBeLessThan(j);
    });

    test('ghi hỏng không làm sập việc vào luyện tập', () => {
        const i = pm.indexOf("Storage.set('lastPracticeMode'");
        expect(pm.slice(i, i + 200)).toMatch(/\.catch\(/);
    });
});

describe('nút dùng chế độ đã lưu', () => {
    test('cả HAI nút gọi resolvePracticeMode', () => {
        const hits = home.match(/handleModeClick\(resolvePracticeMode\(\)\)/g) || [];
        expect(hits.length).toBe(2);
    });

    test('không còn nút nào cứng multiple-choice', () => {
        expect(home).not.toMatch(/handleModeClick\('multiple-choice'\)/);
    });

    test('đọc lại mỗi lần vào Trang chủ', () => {
        // Vừa luyện chế độ khác rồi quay về thì nút phải trỏ tới chế độ đó,
        // không phải cái đọc được lúc mount.
        expect(home).toMatch(/Storage\.get\('lastPracticeMode'\)/);
        const i = home.indexOf("Storage.get('lastPracticeMode')");
        expect(home.slice(i - 200, i)).toMatch(/if \(!active\) return;/);
    });

    test('huỷ khi rời màn — không set state sau unmount', () => {
        const i = home.indexOf("Storage.get('lastPracticeMode')");
        const block = home.slice(i - 250, i + 300);
        expect(block).toMatch(/let cancelled = false/);
        expect(block).toMatch(/if \(!cancelled && m\)/);
    });
});

describe('kiểm lại trước khi mở — nút không có bước xác nhận', () => {
    const fn = home.slice(
        home.indexOf('const resolvePracticeMode'),
        home.indexOf('const handleModeClick'),
    );

    test('chưa từng luyện → về mặc định', () => {
        expect(fn).toMatch(/if \(!lastMode \|\| lastMode === FALLBACK\) return FALLBACK/);
    });

    test('chế độ không còn tồn tại → về mặc định', () => {
        expect(fn).toMatch(/const exists = gameModes\.flatMap/);
        expect(fn).toMatch(/if \(!exists\) return FALLBACK/);
    });

    test('khách không được vào chế độ cần đăng nhập', () => {
        expect(fn).toMatch(/if \(!isLoggedIn && !GUEST_FREE_MODES\.has\(lastMode\)\) return FALLBACK/);
    });

    test('chế độ khoá theo Level → về mặc định', () => {
        expect(fn).toMatch(/if \(lockInfo\(`mode:\$\{lastMode\}`\)\.locked\) return FALLBACK/);
    });
});

describe('nói trước sẽ mở chế độ nào', () => {
    test('nút có tooltip ghi tên chế độ', () => {
        // Bấm là vào thẳng — không nói trước thì người dùng bất ngờ khi nó
        // không còn là Trắc nghiệm.
        const hits = home.match(/title=\{`Mở chế độ \$\{modeLabelOf\(resolvePracticeMode\(\)\)\}`\}/g) || [];
        expect(hits.length).toBe(2);
    });

    test('modeLabelOf rơi về chính mã chế độ nếu không tìm thấy nhãn', () => {
        expect(home).toMatch(/function modeLabelOf\(mode\)/);
        expect(home).toMatch(/return mode;/);
    });
});

/**
 * Giữ Part đã chọn qua các lần mở app.
 *
 * Hai quy tắc từng ĐÁ NHAU:
 *  · "Chọn đề xong thì buộc chọn Part" — `start()` thấy `!selectedPart` là bật
 *    popup;
 *  · "Bấm Luyện tập ngay thì vào thẳng chế độ".
 *
 * Gốc xung đột: cả bốn hàm chọn đề đều gọi `PartSelector.clearSelection()`, mà
 * `restoreLastTopic()` lúc khởi động cũng đi qua chính chúng — nên Part đã lưu
 * bị xoá mỗi lần mở app. Người dùng chọn Part hôm trước, hôm sau bấm "Luyện tập
 * ngay" vẫn phải chọn lại.
 *
 * Xoá khi người dùng CHỦ ĐỘNG đổi đề thì vẫn đúng (Part của đề cũ vô nghĩa) —
 * nên phân biệt bằng cờ `keepPart`, không bỏ hẳn.
 */
describe('Part đã chọn sống sót qua lần mở app', () => {
    const ts = readFileSync(
        join(__dirname, '..', 'vocab', 'topic', 'topicSelector.js'), 'utf8');
    const ctx = readFileSync(
        join(__dirname, '..', '..', 'game', 'GameContext.jsx'), 'utf8');

    test('xoá Part có ĐIỀU KIỆN, không vô điều kiện', () => {
        expect(ts).not.toMatch(/^\s+PartSelector\.clearSelection\(\);$/m);
        const guarded = ts.match(/if \(!options\.keepPart\) PartSelector\.clearSelection\(\);/g) || [];
        // Bốn nhánh chọn đề: chung · riêng · được chia sẻ · từ sai.
        expect(guarded.length).toBe(4);
    });

    test('cả bốn hàm chọn đề đều nhận `options`', () => {
        // So khớp bằng chuỗi THẬT, không dựng regex — dấu nháy và ngoặc trong
        // chữ ký hàm rất dễ escape sai, và khi đó test đỏ oan.
        for (const sig of [
            'selectTopic(topicId, options = {})',
            'selectPersonalTopic(source, options = {})',
            'selectSharedTopic(ownerEmail, source, options = {})',
            "selectWrongWordsTopic(source = '', options = {})",
        ]) {
            expect(ts, `thiếu options ở ${sig}`).toContain(sig);
        }
    });

    test('KHÔI PHỤC lúc khởi động thì giữ Part', () => {
        const i = ts.indexOf('async restoreLastTopic()');
        const j = ts.indexOf('async _loadDefaultTopic()');
        const block = ts.slice(i, j);
        // Cả bốn nhánh khôi phục.
        expect((block.match(/keepPart: true/g) || []).length).toBe(4);
    });

    test('khôi phục Part chạy SAU khi đề nạp xong', () => {
        // `loadSelectedPart` chỉ nhận lại Part nếu nó có trong `parts`, mà danh
        // sách đó chỉ dựng sau khi đề nạp từ vựng. Gọi song song là Part bị bỏ.
        expect(ctx).toMatch(/TopicSelector\.restoreLastTopic\(\)\s*\n\s*\.then\(\(\) => PartSelector\.loadSelectedPart\(\)\)/);
    });
});
