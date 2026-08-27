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

    test('người dùng mới nhận gợi ý LỘ TRÌNH, bắt đầu từ vòng 1', () => {
        // Màn trống cho người mới là lúc họ cần hướng dẫn nhất — và hướng dẫn
        // phải là "bước tiếp theo của bạn", không phải một chế độ ngẫu nhiên
        // chưa thử.
        const r = dungGoiY({ modeStats: {}, dueTotal: 0 });
        expect(r.length).toBeGreaterThan(0);
        expect(r[0].key).toBe('path');
        expect(r[0].tieuDe).toMatch(/Vòng 1/);
        expect(r[0].mode).toBe('flashcard');
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

describe('lộ trình 4 vòng', () => {
    const { LO_TRINH, vongCua, vongNenTapTrung } = require('../services/coachAdvisor');

    test('bốn vòng, đi từ nhận ra tới dùng được', () => {
        expect(LO_TRINH.map((v) => v.vong)).toEqual([1, 2, 3, 4]);
        // Flashcard mở đầu (gặp mặt), Xếp câu ở cuối (dùng trong ngữ cảnh).
        expect(LO_TRINH[0].modes).toContain('flashcard');
        expect(LO_TRINH[3].modes).toContain('sentence-builder');
    });

    test('chế độ NHẬN RA đứng trước chế độ NHỚ LẠI', () => {
        // `retrieval practice`: cố nhớ lại củng cố trí nhớ mạnh hơn đọc lại, nên
        // phải đi từ có-đáp-án-trong-tầm-mắt sang không-gợi-ý-gì.
        expect(vongCua('multiple-choice')).toBeLessThan(vongCua('fill-blank'));
        expect(vongCua('matching')).toBeLessThan(vongCua('dictation'));
    });

    test('Tốc độ KHÔNG nằm trong lộ trình', () => {
        // Nó không kiểm tra trí nhớ mà kiểm tra TỐC ĐỘ TRUY XUẤT — thứ chỉ đến
        // sau khi đã thuộc. Gợi ý nó cho người ở vòng 2 là tạo áp lực vô ích.
        expect(vongCua('speed-quiz')).toBe(0);
    });

    test('mỗi chế độ thuộc ĐÚNG một vòng', () => {
        // Nằm hai vòng thì `vongCua` trả cái đầu tiên gặp và thứ tự thành ngẫu
        // nhiên theo cách khai báo.
        const tatCa = LO_TRINH.flatMap((v) => v.modes);
        expect(new Set(tatCa).size).toBe(tatCa.length);
    });

    test('người mới đứng ở vòng 1', () => {
        expect(vongNenTapTrung(phanTichCheDo({}))?.vong).toBe(1);
    });

    test('vững vòng 1 thì chuyển sang vòng 2', () => {
        const v1 = { flashcard: { played: 10, correct: 90, total: 100 } };
        expect(vongNenTapTrung(phanTichCheDo(v1))?.vong).toBe(2);
    });

    test('KHÔNG nhảy cóc khi vòng dưới còn yếu', () => {
        // Đẩy người chưa thuộc từ lên vòng 4 không phải là thử thách, chỉ là
        // thất bại liên tục.
        //
        // Phải chơi ĐỦ mọi chế độ vòng 2 rồi mới cô lập được điều kiện `acc`:
        // thiếu một chế độ thì nó dừng ở vòng 2 vì "chưa thử", và ca test không
        // chứng minh được gì về ngưỡng yếu.
        const day = (modes, acc) => Object.fromEntries(
            modes.map((m) => [m, { played: 10, correct: acc, total: 100 }])
        );
        const lech = {
            ...day(LO_TRINH[0].modes, 90),
            ...day(LO_TRINH[1].modes, 90),
            // Một chế độ vòng 2 YẾU — đủ để giữ người học lại.
            'multiple-choice': { played: 10, correct: 40, total: 100 },
            ...day(LO_TRINH[3].modes, 95),
        };
        const r = vongNenTapTrung(phanTichCheDo(lech));
        expect(r?.vong).toBe(2);
        // Và đúng chế độ yếu đó được gợi ý, vì mọi chế độ khác đã vững.
        expect(r?.goiY).toBe('multiple-choice');
    });

    test('ưu tiên chế độ CHƯA THỬ trước chế độ đã chơi mà yếu', () => {
        // Mở rộng trước, đào sâu sau: người chưa thử Nghe và chọn bao giờ thì
        // nên thử, chứ không phải cày lại Trắc nghiệm.
        const st = {
            flashcard: { played: 10, correct: 90, total: 100 },
            'multiple-choice': { played: 10, correct: 40, total: 100 },  // đã chơi, yếu
        };
        const r = vongNenTapTrung(phanTichCheDo(st));
        expect(r.vong).toBe(2);
        expect(r.goiY).not.toBe('multiple-choice');
    });

    test('vững cả bốn vòng thì KHÔNG ép nữa', () => {
        const het = {};
        for (const v of LO_TRINH) {
            for (const m of v.modes) het[m] = { played: 10, correct: 90, total: 100 };
        }
        expect(vongNenTapTrung(phanTichCheDo(het))).toBeNull();
    });

    test('gợi ý lộ trình đứng TRÊN gợi ý chế độ yếu', () => {
        // "Bước tiếp theo của bạn là gì" là câu hỏi lớn hơn "chỗ nào tôi kém".
        const r = dungGoiY({ modeStats: THAT, dueTotal: 0 });
        const iPath = r.findIndex((x) => x.key === 'path');
        const iWeak = r.findIndex((x) => x.key === 'weak-mode');
        expect(iPath).toBeGreaterThan(-1);
        expect(iPath).toBeLessThan(iWeak);
    });

    test('gợi ý lộ trình nói rõ VÒNG và tên chế độ tiếng Việt', () => {
        const r = dungGoiY({ modeStats: {}, dueTotal: 0 });
        const p = r.find((x) => x.key === 'path');
        expect(p.tieuDe).toMatch(/Vòng \d/);
        expect(p.tieuDe).toContain('Flashcard');
    });
});

/**
 * NHIỆM VỤ ĐANG GIAO — thẻ nhấp nháy phải ĐỨNG YÊN.
 *
 * Người dùng nói rõ: mỗi lần về trang chủ chỉ MỘT chế độ được chỉ định, và F5
 * cũng không được làm nó đổi, cho tới khi họ chịu luyện đúng chế độ đó.
 *
 * Chỗ hỏng thật (đã đo): với cùng một bộ thống kê, `dungGoiY` trả `listening`
 * khi không có từ tới hạn, nhưng trả `review-mistakes` khi có 5 từ tới hạn — mà
 * từ tới hạn thì tự đến theo đồng hồ, người dùng không làm gì cả.
 */
describe('chotNhiemVu — giữ nguyên qua F5', () => {
    const { chotNhiemVu, NGAY_NHIEM_VU_CU } = require('../services/coachAdvisor');

    test('chưa có nhiệm vụ thì giao theo đề xuất', () => {
        const nv = chotNhiemVu({ dangGiao: null, modeStats: {}, deXuat: 'listening' });
        expect(nv.mode).toBe('listening');
        expect(nv.giaoLuc).toBeInstanceOf(Date);
    });

    test('ĐÃ GIAO thì giữ nguyên, kể cả khi đề xuất đổi ý', () => {
        // Đây là cả mục đích của hàm này.
        const nv = chotNhiemVu({
            dangGiao: { mode: 'listening', giaoLuc: new Date(), luotLucGiao: 0, vong: 2 },
            modeStats: {},
            deXuat: 'review-mistakes',
        });
        expect(nv.mode).toBe('listening');
    });

    test('F5 mười lần vẫn ra đúng một chế độ', () => {
        const dangGiao = { mode: 'listening', giaoLuc: new Date(), luotLucGiao: 0, vong: 2 };
        // Mỗi lần một đề xuất khác nhau, mô phỏng ưu tiên đảo theo thời gian.
        const deXuats = ['review-mistakes', 'fill-blank', 'speed-quiz', 'matching'];
        const ra = deXuats.map((d) => chotNhiemVu({ dangGiao, modeStats: {}, deXuat: d }).mode);
        expect(new Set(ra).size).toBe(1);
        expect(ra[0]).toBe('listening');
    });

    test('chơi XONG thì mới giao cái mới', () => {
        const nv = chotNhiemVu({
            dangGiao: { mode: 'listening', giaoLuc: new Date(), luotLucGiao: 4, vong: 2 },
            modeStats: { listening: { played: 5 } },   // 4 -> 5 = vừa chơi
            deXuat: 'fill-blank',
        });
        expect(nv.mode).toBe('fill-blank');
        expect(nv.xong).toBe(true);
    });

    test('chế độ TỪNG CHƠI vẫn giao được, không tính là xong ngay', () => {
        // Không có mốc `luotLucGiao` thì `played: 15 > 0` là "xong" ngay lập
        // tức, và nhiệm vụ bị nhảy qua trước khi người dùng kịp chơi.
        const nv = chotNhiemVu({
            dangGiao: { mode: 'fill-blank', giaoLuc: new Date(), luotLucGiao: 15, vong: 3 },
            modeStats: { 'fill-blank': { played: 15 } },
            deXuat: 'matching',
        });
        expect(nv.mode).toBe('fill-blank');
        expect(nv.xong).toBe(false);
    });

    test('nhiệm vụ quá cũ thì bỏ, giao lại', () => {
        const lau = new Date(Date.now() - (NGAY_NHIEM_VU_CU + 1) * 86400000);
        const nv = chotNhiemVu({
            dangGiao: { mode: 'listening', giaoLuc: lau, luotLucGiao: 0, vong: 2 },
            modeStats: {},
            deXuat: 'matching',
        });
        expect(nv.mode).toBe('matching');
    });

    test('chưa tới hạn cũ thì VẪN giữ', () => {
        const gan = new Date(Date.now() - (NGAY_NHIEM_VU_CU - 1) * 86400000);
        const nv = chotNhiemVu({
            dangGiao: { mode: 'listening', giaoLuc: gan, luotLucGiao: 0, vong: 2 },
            modeStats: {},
            deXuat: 'matching',
        });
        expect(nv.mode).toBe('listening');
    });

    test('bộ gợi ý im lặng thì LỘ TRÌNH vẫn giao được', () => {
        // Người mới chưa có dữ liệu gì: `dungGoiY` không có từ tới hạn hay bài
        // AI nào để nói, nhưng lộ trình luôn còn chỗ chưa vững. Trả `null` ở
        // đây là mất thẻ chỉ định đúng lúc người dùng cần nó nhất.
        const nv = chotNhiemVu({ dangGiao: null, modeStats: {}, deXuat: null });
        expect(nv.mode).toBe('flashcard');
        expect(nv.vong).toBe(1);
    });

    test('đọc được `modeStats` dạng Map của Mongoose', () => {
        // `.lean()` có chỗ trả Map, có chỗ trả object thường.
        const nv = chotNhiemVu({
            dangGiao: { mode: 'listening', giaoLuc: new Date(), luotLucGiao: 2, vong: 2 },
            modeStats: new Map([['listening', { played: 3 }]]),
            deXuat: 'matching',
        });
        expect(nv.xong).toBe(true);
    });

    test('nhiệm vụ mới chốt mốc lượt HIỆN TẠI, không phải 0', () => {
        const nv = chotNhiemVu({
            dangGiao: null,
            modeStats: { matching: { played: 18 } },
            deXuat: 'matching',
        });
        expect(nv.luotLucGiao).toBe(18);
    });

    test('vòng được lưu kèm để khỏi tính lại', () => {
        const nv = chotNhiemVu({ dangGiao: null, modeStats: {}, deXuat: 'fill-blank' });
        expect(nv.vong).toBe(3);
    });
});

describe('không giao đi giao lại một chỗ', () => {
    const {
        chotNhiemVu, vongNenTapTrung, phanTichCheDo,
    } = require('../services/coachAdvisor');

    test('trong vòng, chọn chế độ ÍT LƯỢT NHẤT', () => {
        // Chọn theo thứ tự khai báo thì nhiệm vụ nhảy qua nhảy lại: chơi 1 lượt
        // chưa chạm ngưỡng tin cậy nên vẫn "chưa vững" và lại thắng lần sau.
        const ds = phanTichCheDo({
            flashcard: { played: 9, correct: 90, total: 100 },
            'multiple-choice': { played: 9, correct: 90, total: 100 },
            matching: { played: 9, correct: 90, total: 100 },
            listening: { played: 2, correct: 18, total: 20 },
            'word-type-check': { played: 0, correct: 0, total: 0 },
        });
        // `listening` đứng trước `word-type-check` trong khai báo vòng 2, nhưng
        // `word-type-check` chưa chơi lần nào nên phải được chọn.
        expect(vongNenTapTrung(ds).goiY).toBe('word-type-check');
    });

    test('vừa chơi xong thì KHÔNG giao lại chính nó', () => {
        // Một lượt chưa lấp được khoảng trống nên bộ gợi ý vẫn nói tên nó —
        // nhưng giao lại ngay cái vừa làm thì người dùng tưởng hệ thống hỏng.
        const nv = chotNhiemVu({
            dangGiao: { mode: 'listening', giaoLuc: new Date(), luotLucGiao: 0, vong: 2 },
            modeStats: {
                flashcard: { played: 9, correct: 90, total: 100 },
                listening: { played: 1, correct: 8, total: 10 },
            },
            deXuat: 'listening',
        });
        expect(nv.xong).toBe(true);
        expect(nv.mode).not.toBe('listening');
        expect(nv.mode).toBeTruthy();
    });

    test('chuỗi nhiệm vụ không lặp vô hạn hai chế độ', () => {
        // Mô phỏng người dùng làm xong lần lượt: phải QUÉT được nhiều chế độ,
        // không kẹt bập bênh giữa đúng hai cái.
        let stats = {
            flashcard: { played: 31, correct: 92, total: 100 },
            'multiple-choice': { played: 76, correct: 88, total: 100 },
            matching: { played: 18, correct: 86, total: 100 },
        };
        let luu = null;
        const chuoi = [];
        for (let i = 0; i < 8; i += 1) {
            const nv = chotNhiemVu({ dangGiao: luu, modeStats: stats, deXuat: null });
            if (!nv.mode) break;
            chuoi.push(nv.mode);
            luu = {
                mode: nv.mode, giaoLuc: nv.giaoLuc,
                vong: nv.vong, luotLucGiao: nv.luotLucGiao,
            };
            const cu = stats[nv.mode] || { played: 0, correct: 0, total: 0 };
            stats = { ...stats, [nv.mode]: {
                played: cu.played + 1, correct: cu.correct + 8, total: cu.total + 10,
            } };
        }
        // Bập bênh giữa 2 chế độ thì `size` chỉ là 2 — phải nhiều hơn thế.
        expect(new Set(chuoi).size).toBeGreaterThan(2);
    });

    test('hết chế độ để giao thì trả `null`, không giao bừa', () => {
        // Vững cả bốn vòng: không ép nữa còn hơn giao đại một cái.
        const { LO_TRINH } = require('../services/coachAdvisor');
        const vung = {};
        for (const v of LO_TRINH) {
            for (const m of v.modes) vung[m] = { played: 20, correct: 95, total: 100 };
        }
        const nv = chotNhiemVu({ dangGiao: null, modeStats: vung, deXuat: null });
        expect(nv.mode).toBeNull();
    });
});

describe('xen kẽ trong vòng là CỐ Ý, không phải bập bênh', () => {
    const { chotNhiemVu, TOI_THIEU_LUOT } = require('../services/coachAdvisor');

    /** Chơi xong nhiệm vụ rồi xin cái tiếp theo, `n` lần. */
    function chuoiNhiemVu(n, batDau) {
        let stats = { ...batDau };
        let luu = null;
        const ra = [];
        for (let i = 0; i < n; i += 1) {
            const nv = chotNhiemVu({ dangGiao: luu, modeStats: stats, deXuat: null });
            if (!nv.mode) break;
            ra.push(nv.mode);
            luu = {
                mode: nv.mode, giaoLuc: nv.giaoLuc,
                vong: nv.vong, luotLucGiao: nv.luotLucGiao,
            };
            const cu = stats[nv.mode] || { played: 0, correct: 0, total: 0 };
            stats = { ...stats, [nv.mode]: {
                played: cu.played + 1, correct: cu.correct + 8, total: cu.total + 10,
            } };
        }
        return { chuoi: ra, stats };
    }

    const vong1Xong = {
        flashcard: { played: 31, correct: 92, total: 100 },
        'multiple-choice': { played: 76, correct: 88, total: 100 },
        matching: { played: 18, correct: 86, total: 100 },
    };

    test('không cày liền một chế độ ba lượt', () => {
        // Xen kẽ các kiểu truy xuất khác nhau nhớ lâu hơn cày liền một kiểu.
        const { chuoi } = chuoiNhiemVu(4, vong1Xong);
        expect(chuoi[0]).not.toBe(chuoi[1]);
    });

    test('các chế độ cùng vòng nhích lên ĐỀU nhau', () => {
        // Đây mới là thứ phân biệt "xen kẽ có chủ đích" với "bập bênh vì lỗi":
        // số lượt phải chênh nhau nhiều nhất 1.
        const { stats } = chuoiNhiemVu(6, vong1Xong);
        const luot = ['listening', 'word-type-check'].map((m) => stats[m]?.played || 0);
        expect(Math.max(...luot) - Math.min(...luot)).toBeLessThanOrEqual(1);
    });

    test('đủ lượt tin cậy thì SANG vòng sau, không kẹt lại', () => {
        // Bập bênh thật thì mắc kẹt mãi ở hai chế độ. Phải thoát ra được.
        const { chuoi } = chuoiNhiemVu(12, vong1Xong);
        expect(new Set(chuoi).size).toBeGreaterThan(3);
        // Và phải chạm tới vòng 3 (Nhớ lại) — nơi trí nhớ thật sự được xây.
        expect(chuoi).toContain('dictation');
    });

    test('mỗi chế độ vòng 2 được chơi đủ ngưỡng trước khi sang vòng 3', () => {
        const { chuoi, stats } = chuoiNhiemVu(12, vong1Xong);
        const iVong3 = chuoi.findIndex((m) => m === 'dictation');
        expect(iVong3).toBeGreaterThan(-1);
        // Tới lúc sang vòng 3 thì listening/word-type-check phải đủ lượt.
        for (const m of ['listening', 'word-type-check']) {
            expect(stats[m]?.played || 0).toBeGreaterThanOrEqual(TOI_THIEU_LUOT);
        }
    });
});

describe('vừa chơi xong thì không giao lại chính nó', () => {
    const { chotNhiemVu } = require('../services/coachAdvisor');

    test('kể cả khi nó là ứng viên DUY NHẤT còn chưa vững trong vòng', () => {
        // Ở đây `listening` là chế độ vòng 2 duy nhất chưa đủ lượt, nên luật
        // "ít lượt nhất" sẽ chọn lại chính nó. Phải bước sang vòng sau thay vì
        // bắt người dùng làm lại đúng cái vừa xong.
        const stats = {
            flashcard: { played: 9, correct: 90, total: 100 },
            'multiple-choice': { played: 9, correct: 90, total: 100 },
            matching: { played: 9, correct: 90, total: 100 },
            'word-type-check': { played: 9, correct: 90, total: 100 },
            listening: { played: 1, correct: 8, total: 10 },
        };
        const nv = chotNhiemVu({
            dangGiao: { mode: 'listening', giaoLuc: new Date(), luotLucGiao: 0, vong: 2 },
            modeStats: stats,
            deXuat: null,
        });
        expect(nv.xong).toBe(true);
        expect(nv.mode).not.toBe('listening');
    });
});
