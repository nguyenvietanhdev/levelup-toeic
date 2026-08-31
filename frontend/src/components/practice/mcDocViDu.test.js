/**
 * Trắc nghiệm: tự đọc CÂU VÍ DỤ ngay sau khi chọn đáp án.
 *
 * Câu ví dụ là chỗ dạy CÁCH DÙNG từ, nhưng ở chế độ này nó chỉ lộ ra đúng một
 * khoảnh khắc — chấm xong rồi câu trôi. Bắt bấm thêm nút loa mới nghe được nghĩa
 * là hầu như không ai nghe: mắt người học đang ở ô đáp án đúng/sai, không đi tìm
 * nút.
 *
 * Phần khó nằm ở NHỊP, không ở lời gọi:
 *
 *   · Nhịp tự chuyển câu mặc định của chế độ này là 1000ms, ngắn hơn mọi câu ví
 *     dụ. Chuyển đúng hẹn là cắt tiếng giữa chừng, lần nào cũng vậy — nên nhịp
 *     phải ĐỢI đọc xong.
 *   · Đợi bằng `onEnd` thì phải có lưới: `onEnd` của gTTS KHÔNG bao giờ về khi
 *     lượt đọc bị lượt sau chiếm chỗ, và trình duyệt còn chặn tự phát tiếng.
 *     Không có lưới thì cả lượt đứng im, mà chế độ tự chuyển không có nút nào
 *     để đi tiếp.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'modes', 'multipleChoice.js'), 'utf8');

/** Thân một hàm, cắt tới hàm kế tiếp. */
const than = (ten) => {
    const i = src.indexOf(ten);
    expect(i, `không tìm thấy ${ten}`).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('\n    },', i));
};

describe('tự đọc khi câu ví dụ lộ ra', () => {
    const t = than('revealExample(question) {');

    test('có tự đọc mà không cần bấm nút', () => {
        // Lời gọi của NÚT loa là `speakPhu(cau)` trần; lời gọi tự động phải kèm
        // `onEnd` để nhịp chuyển câu bám vào.
        expect(t).toMatch(/GameLogic\.speakPhu\(cau, null, \(\) => \{/);
    });

    test('hoãn một nhịp, không đè lên tiếng đúng/sai', () => {
        // `Utils.playSound` kêu ngay lúc chấm; đọc cùng lúc thì không nghe rõ
        // cái nào.
        const m = src.match(/const HOAN_DOC_VI_DU = (\d+);/);
        expect(m, 'không tìm thấy `HOAN_DOC_VI_DU`').toBeTruthy();
        expect(Number(m[1])).toBeGreaterThan(0);
        expect(t).toMatch(/\}, HOAN_DOC_VI_DU\);/);
    });

    test('KHÔNG đọc nữa nếu đã sang câu khác', () => {
        // Người học bấm "Tiếp" nhanh hơn khoảng hoãn thì câu trước đọc đè lên
        // câu sau.
        const i = t.indexOf('}, HOAN_DOC_VI_DU);');
        const khoi = t.slice(t.lastIndexOf('setTimeout(() => {', i), i);
        expect(khoi).toMatch(/if \(this\.currentIndex !== idxLucDoc\) return;/);
    });

    test('`onEnd` cũng chốt theo chỉ số câu', () => {
        // Hai lớp, không thừa: lớp trên chặn lúc BẮT ĐẦU đọc, lớp này chặn
        // `onEnd` của câu trước về muộn — nó sẽ gọi đúng `_docXong` của câu SAU
        // và đẩy câu đó đi sớm.
        const i = t.indexOf('GameLogic.speakPhu(cau, null');
        expect(t.slice(i, i + 400)).toMatch(/if \(this\.currentIndex !== idxLucDoc\) return;/);
    });

    test('báo lại cho nơi gọi là CÓ đọc', () => {
        expect(t).toMatch(/return true;/);
    });

    test('không có câu ví dụ thì báo KHÔNG đọc', () => {
        // Nhánh thoát sớm trả về `undefined`, nên `seDoc` sai và nhịp chuyển câu
        // giữ nguyên đường cũ.
        expect(t).toMatch(/if \(!cau \|\| !slot \|\| slot\.childElementCount\) return;/);
    });
});

describe('nhịp chuyển câu ĐỢI đọc xong', () => {
    const t = than('selectAnswer(index) {');

    test('chỉ đợi khi thật sự có đọc VÀ đang tự chuyển', () => {
        // Tắt tự chuyển thì đã có thanh "← Trước / Tiếp →"; chiếm quyền chuyển
        // câu ở đó là bỏ mất thanh ấy.
        expect(t).toMatch(/if \(seDoc && isAutoAdvance\(\)\) \{/);
    });

    test('đường cũ vẫn còn cho các ca kia', () => {
        expect(t).toMatch(/afterAnswer\(this, 'multiple-choice'\);/);
        const i = t.indexOf('if (seDoc && isAutoAdvance())');
        expect(t.slice(i, i + 200)).toMatch(/return;/);
    });
});

describe('`chuyenSauKhiDocXong` chạy thật', () => {
    /**
     * Dựng từ chính mã nguồn, với đồng hồ và `setTimeout` giả.
     *
     * Chạy thật chứ không soi chữ: cái cần chốt ở đây là SỐ HỌC của nhịp chờ
     * ("đọc xong sớm thì vẫn giữ nhịp, muộn thì đi ngay"), mà regex không nói
     * được điều đó.
     */
    const dung = ({ nhip = 1000 } = {}) => {
        const i = src.indexOf('chuyenSauKhiDocXong() {');
        expect(i).toBeGreaterThan(-1);
        const body = src.slice(src.indexOf('{', i) + 1, src.indexOf('\n    },', i));

        const hen = [];          // mọi setTimeout đã đặt
        let now = 0;
        const ctx = {
            currentIndex: 0,
            soLanChuyen: 0,
            daDungGio: false,
            nextQuestion() { this.soLanChuyen += 1; },
        };
        const f = new Function(
            'stopQuestionTimer', 'getTransitionDelay', 'CHO_DOC_TOI_DA', 'setTimeout', 'Date',
            `return function () { ${body} };`,
        )(
            () => { ctx.daDungGio = true; },
            () => nhip,
            8000,
            (fn, ms) => { hen.push({ fn, ms }); return hen.length; },
            { now: () => now },
        );
        f.call(ctx);

        return {
            ctx,
            hen,
            troi: (ms) => { now += ms; },
            docXong: () => ctx._docXong(),
            /** Chạy mọi hẹn đã đặt từ mốc `tu` trở đi. */
            chay: (tu = 0) => hen.slice(tu).forEach((h) => h.fn()),
        };
    };

    test('dừng đếm ngược NGAY, không đợi đọc xong', () => {
        // Câu đã chấm rồi; để đồng hồ chạy tiếp là "hết giờ" nổ giữa lúc đang
        // nghe và tính SAI lần hai.
        expect(dung().ctx.daDungGio).toBe(true);
    });

    test('đặt sẵn lưới an toàn', () => {
        const { hen } = dung();
        expect(hen).toHaveLength(1);
        expect(hen[0].ms).toBe(8000);
    });

    test('đọc xong SỚM hơn nhịp → vẫn giữ đúng nhịp người dùng đặt', () => {
        // Câu ví dụ hai chữ mà chuyển ngay thì màn hình giật, và người học không
        // kịp nhìn đáp án đúng.
        const s = dung({ nhip: 1000 });
        s.troi(200);
        s.docXong();
        expect(s.hen).toHaveLength(2);
        expect(s.hen[1].ms).toBe(800);
    });

    test('đọc xong MUỘN hơn nhịp → chuyển ngay, không cộng dồn', () => {
        // Cộng thêm 1000ms sau một câu dài là ngồi nhìn màn hình đứng im.
        const s = dung({ nhip: 1000 });
        s.troi(3000);
        s.docXong();
        expect(s.hen[1].ms).toBe(0);
    });

    test('nhịp lấy từ Cài đặt, không ghi cứng', () => {
        const s = dung({ nhip: 2500 });
        s.docXong();
        expect(s.hen[1].ms).toBe(2500);
    });

    test('chuyển đúng MỘT lần dù đọc xong rồi lưới cũng nổ', () => {
        // `onEnd` về đúng hẹn xong lưới 8s vẫn nổ sau đó — không chặn thì nhảy
        // hai câu một lúc.
        const s = dung();
        s.docXong();
        s.hen[0].fn();          // lưới an toàn
        s.docXong();
        expect(s.hen).toHaveLength(2);
        s.chay(1);
        expect(s.ctx.soLanChuyen).toBe(1);
    });

    test('`onEnd` không về thì LƯỚI kéo lượt đi tiếp', () => {
        // Đây là ca thật: gTTS bị lượt sau chiếm chỗ, hoặc trình duyệt chặn tự
        // phát tiếng. Không có lưới thì lượt đứng im vĩnh viễn.
        const s = dung();
        s.troi(8000);
        s.hen[0].fn();
        expect(s.hen).toHaveLength(2);
        s.chay(1);
        expect(s.ctx.soLanChuyen).toBe(1);
    });

    test('đã sang câu khác thì KHÔNG chuyển', () => {
        const s = dung();
        s.ctx.currentIndex = 1;
        s.docXong();
        expect(s.hen).toHaveLength(1);
        expect(s.ctx.soLanChuyen).toBe(0);
    });

    test('chốt lại chỉ số câu ngay TRƯỚC khi chuyển', () => {
        // Giữa lúc chờ hết nhịp, câu vẫn có thể đổi (lượt kết thúc, người dùng
        // thoát chế độ). Chốt một lần lúc đặt hẹn là chưa đủ.
        const s = dung();
        s.docXong();
        s.ctx.currentIndex = 2;
        s.chay(1);
        expect(s.ctx.soLanChuyen).toBe(0);
    });
});

describe('rời chế độ giữa chừng', () => {
    test('`cleanup` bỏ callback chuyển câu', () => {
        // `onEnd` về sau khi đã thoát mà còn giữ callback là gọi `nextQuestion`
        // trên một lượt đã đóng.
        expect(than('cleanup() {')).toMatch(/this\._docXong = null;/);
    });
});
