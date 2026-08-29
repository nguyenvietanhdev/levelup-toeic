/**
 * Prompt "Copy prompt" ở admin — nhánh tiếng Trung phải dùng khung HSK.
 *
 * Trạng thái trước đó: nhánh `bi` (song ngữ) đã dặn đúng khung HSK, nhưng nhánh
 * `zh` ngay dưới vẫn để `"level": "A1"` và KHÔNG có một quy tắc nào. Nhánh viết
 * sau được sửa, nhánh viết trước bị bỏ quên — kiểu lệch mà không có gì nhắc.
 *
 * Vì sao con số này quan trọng: bộ lọc độ khó so khớp CHÍNH XÁC từng chuỗi
 * (`levelFilter.includes(w.level)`, 5 chỗ ở frontend), và
 * `HSK_BANDS.hard = ['HSK5', 'HSK6', 'HSK7-9']`. Một từ nhập vào với
 * `level: "A1"` — hay `"HSK7"` tách rời — không nằm trong danh sách nào của
 * khung HSK, nên người học chọn độ khó là nó BIẾN MẤT. Không lỗi nào báo, từ
 * chỉ đơn giản không bao giờ xuất hiện.
 *
 * Test thuần: đọc file nguồn, không nạp trình duyệt.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin', 'js', 'features', 'users', 'users.js'),
    'utf8',
);

/** Thân một nhánh prompt, cắt từ template literal tới dấu đóng. */
function nhanh(moc) {
    const i = SRC.indexOf(moc);
    // Jest KHÔNG nhận tham số thông báo trong `expect(giaTri, 'msg')` như
    // Vitest — truyền vào là ném "Expect takes at most one argument".
    if (i < 0) throw new Error(`không tìm thấy nhánh: ${moc}`);
    const j = SRC.indexOf('Chỉ trả về JSON array', i);
    expect(j).toBeGreaterThan(i);
    return SRC.slice(i, j);
}

const promptZh = () => nhanh('Hãy tạo 5 object JSON từ vựng tiếng Trung');
const promptBi = () => nhanh('Hãy tạo 5 object JSON từ vựng SONG NGỮ');
const promptEn = () => nhanh('Hãy tạo 5 object JSON từ vựng tiếng Anh');

describe('nhánh tiếng Trung dùng khung HSK', () => {
    test('ví dụ mẫu để `level` là HSK, không phải A1', () => {
        const p = promptZh();
        expect(p).toMatch(/"level": "HSK1"/);
        expect(p).not.toMatch(/"level": "A1"/);
    });

    test('có quy tắc CẤM khung châu Âu', () => {
        // Không dặn thì AI mặc định trả A1/B2 cho mọi ngôn ngữ.
        expect(promptZh()).toMatch(/KHÔNG dùng A1\/B2\/C1/);
    });

    /**
     * DÒNG LIỆT KÊ giá trị hợp lệ, tách riêng khỏi phần còn lại của prompt.
     *
     * Phải soi đúng dòng này chứ không soi cả prompt: chuỗi 'HSK7-9' còn xuất
     * hiện ở bảng quy đổi ("C2→HSK7-9") và ở câu cảnh báo, nên `toContain`
     * trên cả prompt vẫn xanh kể cả khi dòng liệt kê đã bị tách thành
     * HSK7/HSK8/HSK9 — đúng thứ cần chặn.
     */
    const dongLietKe = () => {
        const p = promptZh();
        const i = p.indexOf('Chỉ nhận đúng 7 giá trị');
        expect(i).toBeGreaterThan(-1);
        return p.slice(i, p.indexOf('\n', p.indexOf('HSK', i)) + 1);
    };

    test('liệt kê đủ 7 giá trị hợp lệ', () => {
        const d = dongLietKe();
        for (const v of ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'HSK7-9']) {
            expect(d).toContain(v);
        }
    });

    test('dòng liệt kê KHÔNG tách bậc 7·8·9 thành ba giá trị', () => {
        // `HSK_BANDS.hard` chứa đúng chuỗi 'HSK7-9'; nhập "HSK7" rời là từ đó
        // không khớp giá trị nào và biến mất khỏi bộ lọc độ khó.
        const d = dongLietKe();
        expect(d).not.toMatch(/HSK7(?!-9)/);
        expect(d).not.toContain('HSK8');
        expect(d).not.toContain('HSK9');
    });

    test('nói rõ bậc 7·8·9 GỘP, không tách', () => {
        expect(promptZh()).toMatch(/KHÔNG tách thành HSK7\/HSK8\/HSK9/);
    });

    test('có bảng quy đổi từ khung châu Âu', () => {
        // Người nhập thường chỉ biết "từ này dễ" — cho đường quy đổi thì họ
        // không phải đoán.
        const p = promptZh();
        expect(p).toMatch(/A1→HSK1/);
        expect(p).toMatch(/C2→HSK7-9/);
    });
});

describe('nhánh tiếng Trung dặn đủ các trường dễ sai khác', () => {
    test('pinyin CÓ DẤU THANH, không phải IPA', () => {
        // Sai thanh là sai nghĩa; pinyin không dấu thì không đọc được đúng.
        const p = promptZh();
        expect(p).toMatch(/pinyin CÓ DẤU THANH/);
        expect(p).toMatch(/KHÔNG phải IPA/);
    });

    test('`type` viết bằng chữ Hán', () => {
        // Kho zh lưu 名词/动词; để AI trả noun/verb thì từ mới nằm riêng một
        // mục và lọc theo 名词 bỏ sót.
        expect(promptZh()).toMatch(/KHÔNG dùng noun\/verb/);
    });

    test('`synonyms` viết bằng chữ Hán', () => {
        expect(promptZh()).toMatch(/BẰNG CHỮ HÁN/);
    });

    test('giữ nguyên chữ Hán, không phiên âm sang Latin', () => {
        expect(promptZh()).toMatch(/KHÔNG phiên âm sang chữ Latin/);
    });
});

describe('hai nhánh kia không bị đụng', () => {
    test('song ngữ vẫn dùng HSK', () => {
        const p = promptBi();
        expect(p).toMatch(/"level": "HSK1"/);
        expect(p).toMatch(/HSK7-9/);
    });

    test('tiếng Anh vẫn dùng CEFR — KHÔNG áp HSK nhầm', () => {
        // Từ vựng tiếng Anh phân cấp theo CEFR; áp HSK vào là sai hệ quy chiếu.
        const p = promptEn();
        expect(p).toMatch(/"level": "B1"/);
        expect(p).not.toMatch(/HSK/);
    });
});
