/**
 * Câu ví dụ chỉ TỰ ĐỌC ở chế độ nào LUYỆN chính câu ví dụ.
 *
 * ── LỖI ─────────────────────────────────────────────────────────────────────
 * `exampleBlock` tự đọc câu ví dụ cho MỌI chế độ đi qua nó, và điều kiện duy
 * nhất là người dùng đã tắt "Tự động chuyển câu". Hai sai lầm chồng lên nhau:
 *
 *   1. Lấy một cài đặt ĐIỀU HƯỚNG làm công tắc cho ÂM THANH. Người dùng tắt tự
 *      chuyển câu vì muốn tự bấm "Tiếp", không phải vì muốn nghe thêm. Công tắc
 *      phát âm là "Tự động phát âm", và nó nói về TỪ — `en`, `zh`, `vn`.
 *
 *   2. Bật cho mọi chế độ. Nặng nhất là "Nghe và chọn": khối ví dụ nằm ngay
 *      trong màn câu hỏi, nên câu ví dụ được đọc lên TRƯỚC khi người học kịp
 *      chọn gì. Ở chế độ đó cả bài là nghe một TỪ rồi chọn nghĩa — đọc thêm cả
 *      câu chứa từ ấy vừa ồn vừa lộ. "Hiểu qua câu" thì bị đọc HAI lần: một lần
 *      là đề bài, một lần nữa ở đây sau khi trả lời.
 *
 * ── QUY TẮC ─────────────────────────────────────────────────────────────────
 * · Đọc TỪ (`en`/`zh`/`vn`) tự động → theo cài đặt "Tự động phát âm".
 * · Đọc CÂU VÍ DỤ tự động → chỉ chế độ nào lấy câu ví dụ làm ĐỀ BÀI.
 * · Mọi chế độ khác: câu ví dụ là chú thích, có nút loa, bấm thì đọc.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const D = join(__dirname, 'modes');
const eb = readFileSync(join(__dirname, 'exampleBlock.js'), 'utf8');
const doc = (f) => readFileSync(join(D, f), 'utf8');

/**
 * Mã nguồn đã BỎ COMMENT.
 *
 * Bắt buộc, không phải cho gọn: chính lời giải thích bên cạnh lời gọi cũng viết
 * `tuDoc: true` để nói rõ vì sao chế độ đó xin đọc. Soi thẳng cả file thì gỡ
 * lời gọi thật đi mà comment ở lại là test vẫn xanh — đã đo bằng cách gỡ thật.
 */
const ma = (f) => doc(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

/** Mọi chế độ, trừ file test và module phụ trợ. */
const MOI_CHE_DO = readdirSync(D)
    .filter((f) => f.endsWith('.js') && !f.includes('.test.'));

describe('`exampleBlock` không tự quyết định thay chế độ', () => {
    test('mặc định KHÔNG đọc', () => {
        // Mặc định đọc thì mỗi chế độ mới thêm vào là một chỗ phát tiếng ngoài
        // ý muốn, và không có gì nhắc.
        expect(eb).toMatch(/tuDoc = false/);
    });

    test('cả `ganViDu` lẫn `chenViDu` đều nhận `tuDoc`', () => {
        // `chenViDu` chỉ là `htmlViDu` + `ganViDu`; quên chuyền tiếp thì chế độ
        // xin đọc mà không được đọc.
        expect(eb).toMatch(/export function ganViDu\(id, cau, \{ modeObj = null, goc = document, tuDoc = false \}/);
        expect(eb).toMatch(/export function chenViDu\(slot, cau, \{ nhan = '', modeObj = null, tuDoc = false \}/);
        expect(eb).toMatch(/ganViDu\(id, cau, \{ modeObj, goc: slot, tuDoc \}\)/);
    });

    test('KHÔNG lấy `autoAdvance` làm công tắc bật/tắt việc đọc', () => {
        // Đây là gốc của lỗi: một cài đặt điều hướng quyết định chuyện âm thanh.
        // Nó vẫn được xét, nhưng chỉ để TRÁNH đọc khi biết chắc sẽ bị cắt —
        // `tuDoc` mới là thứ quyết định CÓ đọc hay không.
        expect(eb).toMatch(/if \(tuDoc && !tuChuyen\)/);
        expect(eb).not.toMatch(/if \(!tuChuyen\) \{/);
    });
});

describe('chỉ chế độ LUYỆN câu ví dụ mới xin tự đọc', () => {
    /** Chế độ nào truyền `tuDoc: true`. */
    const xinDoc = MOI_CHE_DO.filter((f) => /tuDoc:\s*true/.test(ma(f)));

    test('"Điền vào câu" có xin — câu ví dụ chính là đề bài', () => {
        // Điền xong rồi nghe lại nguyên câu đúng là phần cuối của bài.
        expect(xinDoc).toContain('exampleFillBlank.js');
    });

    test('KHÔNG chế độ nào khác xin', () => {
        // Chốt cả thư mục thay vì kể tên từng chế độ: thêm một chế độ mới rồi
        // tiện tay bật đọc là lỗi này quay lại, chỉ ở chỗ khác.
        expect(xinDoc).toEqual(['exampleFillBlank.js']);
    });
});

describe('những chế độ TỪNG bị đọc oan giờ đã im', () => {
    for (const [file, ten, vi] of [
        ['listening.js', 'Nghe và chọn',
            'khối ví dụ nằm trong màn câu hỏi — đọc là phát TRƯỚC khi người học chọn'],
        ['phoneticQuiz.js', 'Đọc phiên âm', 'câu ví dụ chỉ là chú thích ở màn kết quả'],
        ['synonymCheck.js', 'Từ đồng nghĩa', 'câu ví dụ chỉ là chú thích'],
        ['wordTypeCheck.js', 'Từ loại', 'câu ví dụ chỉ là chú thích'],
        ['reviewMistakes.js', 'Ôn lại từ sai', 'câu ví dụ chỉ là chú thích'],
        ['contextLearning.js', 'Hiểu qua câu', 'đã tự đọc đề bài rồi — đọc nữa là hai lần'],
    ]) {
        test(`${ten}: không xin tự đọc (${vi})`, () => {
            expect(ma(file)).not.toMatch(/tuDoc:\s*true/);
        });

        test(`${ten}: vẫn HIỆN khối ví dụ có nút loa`, () => {
            // Không đọc ≠ giấu đi. Người học vẫn phải bấm nghe được khi muốn.
            expect(doc(file)).toMatch(/chenViDu\(|ganViDu\(/);
        });
    }
});

describe('"Hiểu qua câu" đọc đề bài ĐÚNG MỘT lần', () => {
    const cl = doc('contextLearning.js');

    test('vẫn tự đọc câu ví dụ lúc hiện câu hỏi', () => {
        // Ở chế độ này câu ví dụ LÀ đề bài: nghe rồi đoán nghĩa của từ bị ẩn.
        // Bỏ luôn lần đọc này là bỏ cả chế độ.
        const i = cl.indexOf('this.attachListeners(question);');
        expect(cl.slice(i, i + 200)).toMatch(/GameLogic\.speakWord\(question\.example\)/);
    });

    test('khối ví dụ SAU khi trả lời không đọc lại lần nữa', () => {
        expect(ma('contextLearning.js')).not.toMatch(/tuDoc:\s*true/);
    });
});

describe('cài đặt "Tự động phát âm" vẫn chỉ nói về TỪ', () => {
    /**
     * Mọi lời gọi `autoPronunciation`, kèm đoạn ngay sau nó.
     *
     * Cài đặt này nói về `en`/`zh`/`vn` — mặt từ. Dùng nó để gác một lượt đọc
     * CÂU VÍ DỤ là trộn hai chuyện: người dùng bật nó để nghe từ, không phải để
     * nghe câu.
     */
    const noiDung = MOI_CHE_DO.flatMap((f) => {
        const src = doc(f);
        const ra = [];
        let i = src.indexOf('autoPronunciation');
        while (i !== -1) {
            ra.push({ f, doan: src.slice(i, i + 320) });
            i = src.indexOf('autoPronunciation', i + 1);
        }
        return ra;
    });

    test('có chế độ thật sự dùng cài đặt này', () => {
        // Danh sách rỗng thì test dưới luôn xanh mà không kiểm gì.
        expect(noiDung.length).toBeGreaterThanOrEqual(4);
    });

    test('KHÔNG chỗ nào dùng nó để gác việc đọc câu ví dụ', () => {
        for (const { f, doan } of noiDung) {
            // Bỏ comment trước khi soi: vài chỗ có nhắc chữ `example` trong lời
            // giải thích chính vì lý do này.
            const ma = doan.replace(/\/\/.*/g, '');
            expect(ma, `${f} dùng autoPronunciation cho câu ví dụ`)
                .not.toMatch(/\.example|question\.example/);
        }
    });
});
