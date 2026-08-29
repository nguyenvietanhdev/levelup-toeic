/**
 * Khung giờ chạy của chế độ luyện tập — phần logic thuần.
 *
 * Đây là chỗ dễ sai nhất của tính năng và cũng là chỗ khó thử tay nhất: muốn
 * kiểm ca "22:00 → 02:00 đêm thứ Hai" thì phải ngồi đợi tới 1 giờ sáng thứ Ba.
 *
 * Hai cái bẫy chính:
 *   1. MÚI GIỜ — server chạy hosting nước ngoài thì giờ máy là UTC, lệch 7
 *      tiếng. Admin đặt 18:00–22:00 xong tới giờ đó server vẫn chặn, log sạch.
 *   2. KHUNG VẮT QUA NỬA ĐÊM — `start <= now && now < end` trả false suốt cả
 *      khung 22:00→02:00.
 */
const { dangMo, moTa, mocThoiGian, MUI_GIO } = require('../services/modeSchedule');

/**
 * Mốc thời gian theo giờ VIỆT NAM.
 *
 * Dựng bằng chuỗi ISO có offset `+07:00` chứ không phải `new Date(y,m,d,h)`:
 * hàm dựng đó dùng giờ MÁY CHẠY TEST, nên test sẽ xanh trên máy ở Việt Nam và
 * đỏ trên CI chạy UTC — đúng loại lỗi tính năng này sinh ra để tránh.
 */
const luc = (iso) => new Date(`${iso}+07:00`);

// 2026-08-31 là THỨ HAI. Cả file lấy tuần này làm mốc.
const T2 = '2026-08-31';
const T3 = '2026-09-01';
const T7 = '2026-09-05';
const CN = '2026-09-06';

describe('mốc thời gian đọc theo giờ Việt Nam, không theo giờ máy', () => {
    test('thứ và phút tính đúng', () => {
        expect(mocThoiGian(luc(`${T2}T18:30:00`))).toEqual({ thu: 1, phut: 1110 });
        expect(mocThoiGian(luc(`${CN}T00:00:00`))).toEqual({ thu: 0, phut: 0 });
    });

    test('nửa đêm ra 0 phút, KHÔNG phải 1440', () => {
        expect(mocThoiGian(luc(`${T2}T00:00:00`)).phut).toBe(0);
        expect(mocThoiGian(luc(`${T2}T00:59:00`)).phut).toBe(59);
    });

    test('ICU trả giờ "24" thì vẫn quy về 0', () => {
        // Một số phiên bản ICU trả '24' cho nửa đêm với `hour12: false`. Máy
        // này trả '00' nên không tự gặp — phải giả lập, nếu không dòng phòng vệ
        // `% 24` nằm đó mà không có gì chứng minh nó cần thiết.
        //
        // Không quy về 0 thì `phut` = 24*60 = 1440, lớn hơn mọi mốc `end`, nên
        // MỌI khung giờ đều đóng vào lúc nửa đêm.
        const That = Intl.DateTimeFormat;
        Intl.DateTimeFormat = function (...args) {
            const d = new That(...args);
            const goc = d.formatToParts.bind(d);
            d.formatToParts = (x) => goc(x).map(
                (p) => (p.type === 'hour' && p.value === '00' ? { ...p, value: '24' } : p));
            return d;
        };
        try {
            expect(mocThoiGian(luc(`${T2}T00:30:00`)).phut).toBe(30);
        } finally {
            Intl.DateTimeFormat = That;
        }
    });

    test('KHAI RÕ múi giờ, không mượn giờ máy', () => {
        // Không kiểm được bằng cách đổi `process.env.TZ`: Jest dựng môi trường
        // trước khi thân file test chạy nên gán lúc đó không ăn (đã thử). Và
        // máy viết code đang ở `Asia/Saigon` — trùng đúng múi giờ tính năng
        // dùng, nên bỏ hẳn `timeZone` đi thì MỌI test khác vẫn xanh ở đây và
        // chỉ đỏ trên server chạy UTC.
        //
        // Nên soi thẳng tham số truyền cho `Intl`: đó chính là thứ quyết định.
        const That = Intl.DateTimeFormat;
        const daNhan = [];
        Intl.DateTimeFormat = function (locale, opts) {
            daNhan.push(opts);
            return new That(locale, opts);
        };
        try {
            mocThoiGian(new Date('2026-08-31T12:00:00Z'));
        } finally {
            Intl.DateTimeFormat = That;
        }
        expect(daNhan.length).toBeGreaterThan(0);
        expect(daNhan[0]?.timeZone).toBe(MUI_GIO);
        expect(MUI_GIO).toBe('Asia/Ho_Chi_Minh');
    });

    test('cùng một khoảnh khắc UTC vẫn ra giờ Việt Nam', () => {
        // 2026-08-31T12:00Z = 19:00 giờ VN. Đọc bằng giờ máy UTC sẽ ra 12:00 —
        // lệch đúng 7 tiếng, và đó là cả cái bẫy.
        const m = mocThoiGian(new Date('2026-08-31T12:00:00Z'));
        expect(m.phut).toBe(19 * 60);
        expect(m.thu).toBe(1);
    });

    test('gần nửa đêm giờ VN thì NGÀY cũng phải theo VN', () => {
        // 2026-08-31T18:00Z = 01:00 sáng 01/09 giờ VN → thứ BA, không phải T2.
        const m = mocThoiGian(new Date('2026-08-31T18:00:00Z'));
        expect(m.thu).toBe(2);
        expect(m.phut).toBe(60);
    });
});

describe('mặc định là MỞ', () => {
    test('chưa cấu hình → mở', () => {
        // Mặc định "đóng" thì ngày bật tính năng này lên, mọi chế độ chưa kịp
        // cấu hình đều tắt cùng lúc.
        expect(dangMo(null, luc(`${T2}T03:00:00`))).toBe(true);
        expect(dangMo(undefined, luc(`${T2}T03:00:00`))).toBe(true);
    });

    test('admin TẮT lịch → không giới hạn (không phải chặn hẳn)', () => {
        const lich = { isActive: false, days: [0], start: 0, end: 60 };
        expect(dangMo(lich, luc(`${T2}T15:00:00`))).toBe(true);
    });

    test('`days` rỗng = mọi thứ trong tuần', () => {
        // Bỏ trống ô thường là chưa điền, không phải muốn chặn.
        const lich = { isActive: true, days: [], start: 540, end: 1020 };
        expect(dangMo(lich, luc(`${T2}T10:00:00`))).toBe(true);
        expect(dangMo(lich, luc(`${CN}T10:00:00`))).toBe(true);
    });

    test('cả ngày + mọi thứ = luôn mở', () => {
        const lich = { isActive: true, days: [], start: 0, end: 1440 };
        expect(dangMo(lich, luc(`${T2}T00:00:00`))).toBe(true);
        expect(dangMo(lich, luc(`${T2}T23:59:00`))).toBe(true);
    });
});

describe('khung trong CÙNG một ngày', () => {
    const toi = { isActive: true, days: [1, 2, 3, 4, 5], start: 18 * 60, end: 22 * 60 };

    test('đúng giờ, đúng thứ → mở', () => {
        expect(dangMo(toi, luc(`${T2}T18:00:00`))).toBe(true);
        expect(dangMo(toi, luc(`${T2}T21:59:00`))).toBe(true);
    });

    test('mốc BẮT ĐẦU tính là mở, mốc KẾT THÚC thì không', () => {
        // Nửa khoảng `[start, end)`. Tính cả hai đầu thì hai khung liền nhau
        // (18:00–20:00 và 20:00–22:00) chồng lên nhau đúng một phút.
        expect(dangMo(toi, luc(`${T2}T18:00:00`))).toBe(true);
        expect(dangMo(toi, luc(`${T2}T22:00:00`))).toBe(false);
    });

    test('ngoài giờ → đóng', () => {
        expect(dangMo(toi, luc(`${T2}T17:59:00`))).toBe(false);
        expect(dangMo(toi, luc(`${T2}T23:00:00`))).toBe(false);
    });

    test('đúng giờ nhưng SAI thứ → đóng', () => {
        expect(dangMo(toi, luc(`${T7}T19:00:00`))).toBe(false);
        expect(dangMo(toi, luc(`${CN}T19:00:00`))).toBe(false);
    });
});

describe('khung VẮT QUA NỬA ĐÊM', () => {
    // "Đêm thứ Hai" = T2 22:00 → T3 02:00.
    const dem = { isActive: true, days: [1], start: 22 * 60, end: 2 * 60 };

    test('nửa đầu — tối thứ Hai', () => {
        expect(dangMo(dem, luc(`${T2}T22:00:00`))).toBe(true);
        expect(dangMo(dem, luc(`${T2}T23:59:00`))).toBe(true);
    });

    test('nửa sau — rạng sáng thứ Ba VẪN mở', () => {
        // Đây là ca bị bỏ sót nếu chỉ so `phut >= start && phut < end`, và cũng
        // sai nếu xét thứ theo NGÀY HIỆN TẠI (01:00 sáng T3 sẽ bị coi là "T3").
        expect(dangMo(dem, luc(`${T3}T00:00:00`))).toBe(true);
        expect(dangMo(dem, luc(`${T3}T01:59:00`))).toBe(true);
    });

    test('quá khung thì đóng', () => {
        expect(dangMo(dem, luc(`${T3}T02:00:00`))).toBe(false);
        expect(dangMo(dem, luc(`${T2}T21:59:00`))).toBe(false);
    });

    test('rạng sáng thứ Ba của tuần KHÁC — sau đêm Chủ nhật — thì đóng', () => {
        // 01:00 sáng T2 nghĩa là khung "đêm Chủ nhật", mà CN không được bật.
        expect(dangMo(dem, luc(`${T2}T01:00:00`))).toBe(false);
    });

    test('khung đêm THỨ BẢY vắt sang Chủ nhật — phép lùi ngày không được âm', () => {
        // Ca DUY NHẤT phân biệt `(thu + 6) % 7` với `(thu - 1) % 7`: chỉ khi
        // hôm nay là Chủ nhật (thu = 0) thì phép trừ mới ra -1, và `hopThu(-1)`
        // luôn false — khung đêm thứ Bảy im lặng đóng vào lúc 0 giờ.
        const demT7 = { isActive: true, days: [6], start: 23 * 60, end: 60 };
        expect(dangMo(demT7, luc(`${T7}T23:30:00`))).toBe(true);
        expect(dangMo(demT7, luc(`${CN}T00:30:00`))).toBe(true);
        expect(dangMo(demT7, luc(`${CN}T01:30:00`))).toBe(false);
    });

    test('khung đêm CHỦ NHẬT vắt sang thứ Hai', () => {
        // Kiểm phép lùi ngày không bị âm: 0 - 1 phải ra 6, không ra -1.
        const demCN = { isActive: true, days: [0], start: 23 * 60, end: 60 };
        expect(dangMo(demCN, luc(`${CN}T23:30:00`))).toBe(true);
        expect(dangMo(demCN, luc('2026-09-07T00:30:00'))).toBe(true);   // T2
        expect(dangMo(demCN, luc('2026-09-07T01:30:00'))).toBe(false);
    });
});

describe('khung rỗng = chặn hẳn', () => {
    test('start === end thì không giờ nào hợp lệ', () => {
        // Admin muốn tắt hẳn một chế độ thì đây là cách nói ra điều đó.
        const lich = { isActive: true, days: [], start: 600, end: 600 };
        expect(dangMo(lich, luc(`${T2}T10:00:00`))).toBe(false);
        expect(dangMo(lich, luc(`${T2}T00:00:00`))).toBe(false);
    });
});

describe('mô tả cho người học', () => {
    test('có thứ và giờ', () => {
        expect(moTa({ isActive: true, days: [1, 2, 3, 4, 5], start: 1080, end: 1320 }))
            .toBe('T2, T3, T4, T5, T6 · 18:00–22:00');
    });

    test('cả tuần thì chỉ ghi giờ', () => {
        expect(moTa({ isActive: true, days: [], start: 1080, end: 1320 })).toBe('18:00–22:00');
        expect(moTa({ isActive: true, days: [0, 1, 2, 3, 4, 5, 6], start: 1080, end: 1320 }))
            .toBe('18:00–22:00');
    });

    test('cả ngày thì chỉ ghi thứ', () => {
        expect(moTa({ isActive: true, days: [0, 6], start: 0, end: 1440 })).toBe('CN, T7');
    });

    test('không giới hạn → chuỗi rỗng', () => {
        // Chỗ gọi dựa vào đây để biết có cần hiện gì không.
        expect(moTa({ isActive: true, days: [], start: 0, end: 1440 })).toBe('');
        expect(moTa({ isActive: false, days: [1], start: 600, end: 700 })).toBe('');
        expect(moTa(null)).toBe('');
    });

    test('thứ hiện theo đúng THỨ TỰ trong tuần', () => {
        // Admin tick lung tung thì mảng lưu theo thứ tự bấm; hiện "T7, T2, CN"
        // đọc rất khó.
        expect(moTa({ isActive: true, days: [6, 1, 0], start: 0, end: 1440 }))
            .toBe('CN, T2, T7');
    });
});
