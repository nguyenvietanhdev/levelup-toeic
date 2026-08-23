/**
 * Bộ gợi ý luyện tập.
 *
 * Test GỌI HÀM THẬT với dữ liệu có hình dạng như DB thật.
 *
 * Chỗ dễ hỏng nhất là NGƯỠNG TIN CẬY: chơi 1 lượt đúng 10/10 không có nghĩa là
 * giỏi, và 2 lượt đúng 100% (số liệu thật của `dictation`) không đủ kết luận gì.
 * Khuyên dựa trên nhiễu còn tệ hơn không khuyên — người học sẽ đi luyện sai chỗ.
 */
const {
    dungGoiY, phanTichCheDo, diemYeu, chuaThu, boQuen, tenCheDo,
    TOI_THIEU_LUOT, NGUONG_YEU, NGAY_BO_QUEN,
} = require('../services/coachAdvisor');

/** Dữ liệu thật rút gọn từ một tài khoản trong DB. */
const THAT = {
    'multiple-choice': { played: 69, correct: 940, total: 1074 },  // 88%
    'speed-quiz': { played: 8, correct: 28, total: 100 },          // 28%
    'hanzi-writing': { played: 10, correct: 34, total: 100 },      // 34%
    flashcard: { played: 24, correct: 92, total: 100 },            // 92%
    dictation: { played: 2, correct: 20, total: 20 },              // 100% nhưng 2 lượt
};

describe('phân tích từng chế độ', () => {
    test('tính tỉ lệ đúng khi đủ lượt', () => {
        const ds = phanTichCheDo(THAT);
        const mc = ds.find((x) => x.mode === 'multiple-choice');
        expect(mc.acc).toBeCloseTo(940 / 1074);
    });

    test('CHƯA đủ lượt → `acc` là null, KHÔNG phải 0', () => {
        // Coi "chưa có dữ liệu" là "đúng 0%" thì mọi chế độ mới đều bị xếp là
        // điểm yếu nặng nhất, và gợi ý chỉ toàn nói về chúng.
        const ds = phanTichCheDo({ x: { played: 1, correct: 10, total: 10 } });
        expect(ds[0].acc).toBeNull();
    });

    test('ngưỡng tin cậy đúng bằng `TOI_THIEU_LUOT`', () => {
        const duoi = phanTichCheDo({ x: { played: TOI_THIEU_LUOT - 1, correct: 1, total: 2 } });
        const du = phanTichCheDo({ x: { played: TOI_THIEU_LUOT, correct: 1, total: 2 } });
        expect(duoi[0].acc).toBeNull();
        expect(du[0].acc).toBe(0.5);
    });

    test('đọc được cả Map lẫn object thuần', () => {
        // Mongoose trả Map; sau `.lean()` thành object. Xử lý một kiểu thì kiểu
        // kia ra danh sách rỗng và gợi ý im lặng biến mất.
        const m = new Map([['a', { played: 5, correct: 5, total: 10 }]]);
        expect(phanTichCheDo(m)[0].acc).toBe(0.5);
        expect(phanTichCheDo({ a: { played: 5, correct: 5, total: 10 } })[0].acc).toBe(0.5);
    });

    test('dữ liệu hỏng không ném lỗi', () => {
        for (const v of [null, undefined, 'chuỗi', 42]) {
            expect(() => phanTichCheDo(v)).not.toThrow();
        }
        expect(phanTichCheDo({ a: {} })[0].acc).toBeNull();
    });
});

describe('tìm điểm yếu', () => {
    test('chọn chế độ tệ nhất trong số đủ dữ liệu', () => {
        expect(diemYeu(phanTichCheDo(THAT)).mode).toBe('speed-quiz');
    });

    test('KHÔNG bịa điểm yếu khi mọi chế độ đều tốt', () => {
        // Người đúng 85% ở mọi chỗ không có "điểm yếu"; bịa ra một cái làm lời
        // khuyên mất tin cậy.
        const tot = { a: { played: 10, correct: 85, total: 100 } };
        expect(diemYeu(phanTichCheDo(tot))).toBeNull();
    });

    test('bỏ qua chế độ chưa đủ lượt dù tỉ lệ thấp', () => {
        const it = { a: { played: 1, correct: 0, total: 10 } };
        expect(diemYeu(phanTichCheDo(it))).toBeNull();
    });

    test('ngưỡng yếu đúng bằng `NGUONG_YEU`', () => {
        const ngay = { a: { played: 5, correct: NGUONG_YEU * 100, total: 100 } };
        expect(diemYeu(phanTichCheDo(ngay))).toBeNull();   // bằng ngưỡng = chưa yếu
    });
});

describe('chế độ chưa thử', () => {
    test('tìm ra chế độ chưa có lượt nào', () => {
        const r = chuaThu(phanTichCheDo(THAT));
        expect(r).not.toBeNull();
        expect(THAT[r.mode]).toBeUndefined();
    });

    test('chơi hết rồi thì trả null', () => {
        const het = {};
        for (const m of Object.keys(require('../services/coachAdvisor').TEN_CHE_DO)) {
            het[m] = { played: 5, correct: 5, total: 10 };
        }
        expect(chuaThu(phanTichCheDo(het))).toBeNull();
    });
});

describe('chế độ bỏ quên', () => {
    const NGAY = 86400000;

    test('tìm ra chế độ lâu chưa động', () => {
        const r = boQuen({
            a: { played: 5, lastPlayedAt: new Date(Date.now() - 30 * NGAY) },
        });
        expect(r.mode).toBe('a');
        expect(r.ngay).toBeGreaterThanOrEqual(NGAY_BO_QUEN);
    });

    test('mới chơi thì không nhắc', () => {
        expect(boQuen({ a: { played: 5, lastPlayedAt: new Date() } })).toBeNull();
    });

    test('chưa chơi bao giờ KHÔNG tính là bỏ quên', () => {
        // Đó là việc của `chuaThu`; lẫn hai thứ thì gợi ý nói sai lý do —
        // "30 ngày chưa động vào Tốc độ" cho người chưa từng mở nó.
        //
        // Dùng ngày THẬT chứ không `new Date(0)`: epoch 0 có `getTime()` là 0,
        // mà `!0` là true nên nhánh kiểm `lastPlayedAt` nuốt luôn ca này và
        // phép kiểm `played` không bao giờ được thử.
        const cu = new Date(Date.now() - 30 * NGAY);
        expect(boQuen({ a: { played: 0, lastPlayedAt: cu } })).toBeNull();
        // Cùng ngày đó nhưng ĐÃ chơi thì phải nhắc — chứng minh sự khác biệt
        // đến từ `played`, không phải từ ngày tháng.
        expect(boQuen({ a: { played: 3, lastPlayedAt: cu } })).not.toBeNull();
    });

    test('thiếu `lastPlayedAt` không ném lỗi', () => {
        expect(() => boQuen({ a: { played: 5 } })).not.toThrow();
        expect(boQuen({ a: { played: 5 } })).toBeNull();
    });
});

describe('dựng danh sách gợi ý', () => {
    test('từ đến hạn ôn đứng ĐẦU', () => {
        // Lịch giãn cách chỉ hiệu quả khi ôn đúng ngày.
        const r = dungGoiY({ modeStats: THAT, dueTotal: 189 });
        expect(r[0].key).toBe('review-due');
        expect(r[0].tieuDe).toContain('189');
    });

    test('không có từ đến hạn thì KHÔNG hiện mục đó', () => {
        // "0 từ đến hạn" là một dòng thừa không nói gì.
        const r = dungGoiY({ modeStats: THAT, dueTotal: 0 });
        expect(r.some((x) => x.key === 'review-due')).toBe(false);
    });

    test('lỗi ngữ pháp đứng trên chế độ yếu', () => {
        // Nó ảnh hưởng mọi kỹ năng viết/nói, không chỉ một chế độ.
        const r = dungGoiY({
            modeStats: THAT, dueTotal: 0,
            loiHayMac: { vi: 'Mạo từ', count: 5, hint: 'x' },
        });
        expect(r.findIndex((x) => x.key === 'grammar'))
            .toBeLessThan(r.findIndex((x) => x.key === 'weak-mode'));
    });

    test('mỗi gợi ý mở thẳng được, không bắt tự tìm', () => {
        // Nói "bạn yếu Tốc độ" rồi để người dùng đi tìm thẻ đó giữa 16 ô là đẩy
        // việc sang họ.
        const r = dungGoiY({ modeStats: THAT, dueTotal: 5 });
        for (const g of r) {
            expect(g.mode || g.screen).toBeTruthy();
        }
    });

    test('mỗi gợi ý có LÝ DO, không chỉ mệnh lệnh', () => {
        const r = dungGoiY({ modeStats: THAT, dueTotal: 5 });
        for (const g of r) expect(g.lyDo.length).toBeGreaterThan(20);
    });

    test('dùng TÊN TIẾNG VIỆT của chế độ', () => {
        // Trả `speed-quiz` thì người dùng không biết đó là thẻ nào.
        const r = dungGoiY({ modeStats: THAT, dueTotal: 0 });
        const yeu = r.find((x) => x.key === 'weak-mode');
        expect(yeu.tieuDe).toContain('Tốc độ');
        expect(yeu.tieuDe).not.toContain('speed-quiz');
    });

    test('người dùng mới (chưa có gì) vẫn ra gợi ý', () => {
        // Màn trống cho người mới là lúc họ cần hướng dẫn nhất.
        const r = dungGoiY({ modeStats: {}, dueTotal: 0 });
        expect(r.length).toBeGreaterThan(0);
        expect(r[0].key).toBe('untried');
    });

    test('sắp theo ưu tiên TĂNG DẦN, ổn định giữa các lần gọi', () => {
        // Thứ tự nhảy giữa hai lần mở trông như dữ liệu đang đổi trong khi
        // không có gì đổi.
        const goi = () => dungGoiY({ modeStats: THAT, dueTotal: 5 });
        expect(goi().map((x) => x.key)).toEqual(goi().map((x) => x.key));

        const ut = goi().map((x) => x.uuTien);
        expect(ut).toEqual([...ut].sort((x, y) => x - y));
    });

    test('đầu vào rỗng hoàn toàn không ném lỗi', () => {
        expect(() => dungGoiY()).not.toThrow();
        expect(() => dungGoiY({})).not.toThrow();
    });
});

describe('tên chế độ', () => {
    test('mọi khoá đều có tên tiếng Việt', () => {
        const { TEN_CHE_DO } = require('../services/coachAdvisor');
        for (const [k, v] of Object.entries(TEN_CHE_DO)) {
            expect(typeof v).toBe('string');
            expect(v.length).toBeGreaterThan(0);
            expect(v).not.toBe(k);
        }
    });

    test('chế độ lạ trả về chính khoá, không trả undefined', () => {
        expect(tenCheDo('khong-ton-tai')).toBe('khong-ton-tai');
    });
});

describe('KHÔNG gọi AI', () => {
    test('service không import openai', () => {
        // Mọi tín hiệu là số đã đếm sẵn. Hỏi AI là trả tiền để nó đoán lại thứ
        // ta biết chắc — và câu trả lời sẽ đổi mỗi lần hỏi, trong khi cùng dữ
        // liệu phải cho cùng lời khuyên.
        const { readFileSync } = require('node:fs');
        const { join } = require('node:path');
        const src = readFileSync(join(__dirname, '..', 'services', 'coachAdvisor.js'), 'utf8');
        expect(src).not.toMatch(/chatCompletion|config\/openai/);
    });
});
