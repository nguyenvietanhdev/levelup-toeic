/**
 * Chế độ này có đang trong khung giờ được phép không.
 *
 * Tách thành hàm THUẦN (vào lịch + mốc thời gian, ra true/false) vì đây là chỗ
 * dễ sai nhất của cả tính năng và cũng là chỗ khó thử tay nhất: muốn kiểm ca
 * "22:00 → 02:00 đêm thứ Hai" thì phải đợi tới 1 giờ sáng thứ Ba.
 *
 * ── MÚI GIỜ ────────────────────────────────────────────────────────────────
 * Cố định `Asia/Ho_Chi_Minh`, KHÔNG dùng giờ máy.
 *
 * Server chạy trên hosting nước ngoài thì `new Date().getHours()` ra giờ UTC —
 * lệch 7 tiếng so với người học. Admin đặt "mở 18:00–22:00" xong tới giờ đó
 * server vẫn chặn, mà log không có lỗi nào. Client dùng giờ máy cũng không ổn:
 * hai bên khác múi thì giao diện báo "đang mở" còn server từ chối.
 */

/** Múi giờ chuẩn của app — cả server lẫn client đều quy về đây. */
const MUI_GIO = 'Asia/Ho_Chi_Minh';

/**
 * Thứ và số phút trong ngày, theo múi giờ chuẩn.
 *
 * Dùng `Intl` chứ không cộng trừ offset bằng tay: Việt Nam không đổi giờ theo
 * mùa nên +7 luôn đúng hôm nay, nhưng viết tay một lần là chỗ đó vĩnh viễn
 * không ai dám sửa. `Intl` cũng là thứ duy nhất chạy giống nhau ở Node và
 * trình duyệt.
 *
 * @param {Date} [now]
 * @returns {{thu: number, phut: number}} `thu` 0=CN…6=T7, `phut` 0…1439.
 */
function mocThoiGian(now = new Date()) {
    const dinhDang = new Intl.DateTimeFormat('en-US', {
        timeZone: MUI_GIO,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    const phan = {};
    for (const p of dinhDang.formatToParts(now)) phan[p.type] = p.value;

    const BANG_THU = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const thu = BANG_THU[phan.weekday] ?? 0;

    // `hour: '2-digit'` với `hour12: false` trả '24' cho nửa đêm ở một số phiên
    // bản ICU — quy về 0, nếu không thì 24*60 = 1440 và mọi khung đều trượt.
    const gio = Number(phan.hour) % 24;
    const phut = gio * 60 + Number(phan.minute);

    return { thu, phut };
}

/**
 * Lịch này có cho phép chạy tại thời điểm `now` không.
 *
 * @param {object|null} lich bản ghi `ModeSchedule`; `null` = chưa cấu hình.
 * @param {Date} [now]
 * @returns {boolean}
 */
function dangMo(lich, now = new Date()) {
    // Chưa cấu hình, hoặc admin đã tắt → KHÔNG giới hạn.
    //
    // Mặc định phải là "mở". Đặt mặc định là "đóng" thì ngày bật tính năng này
    // lên, mọi chế độ chưa kịp cấu hình đều tắt cùng lúc.
    if (!lich || lich.isActive === false) return true;

    const { thu, phut } = mocThoiGian(now);

    const thuDuocPhep = Array.isArray(lich.days) ? lich.days : [];
    // Rỗng = mọi thứ trong tuần (xem ghi chú ở model).
    const hopThu = (d) => thuDuocPhep.length === 0 || thuDuocPhep.includes(d);

    const start = Number(lich.start) || 0;
    const end = Number.isFinite(Number(lich.end)) ? Number(lich.end) : 1440;

    // Cả ngày.
    if (start === 0 && end >= 1440) return hopThu(thu);

    // Khung rỗng (start === end) → không giờ nào hợp lệ. Admin muốn chặn hẳn
    // thì đây là cách nói ra điều đó.
    if (start === end) return false;

    if (start < end) {
        // Khung trong CÙNG một ngày.
        return hopThu(thu) && phut >= start && phut < end;
    }

    // Khung VẮT QUA NỬA ĐÊM (22:00 → 02:00).
    //
    // Thứ được xét theo NGÀY KHUNG BẮT ĐẦU: "đêm thứ Hai" nghĩa là T2 22:00
    // đến T3 02:00. Xét theo ngày hiện tại thì 1 giờ sáng thứ Ba bị coi là
    // "thứ Ba" và trượt, dù người dùng đang ở giữa đúng cái khung đó.
    if (phut >= start) return hopThu(thu);
    if (phut < end) return hopThu((thu + 6) % 7);   // hôm qua
    return false;
}

/**
 * Mô tả khung giờ cho người học đọc, vd "T2–T6, 18:00–22:00".
 *
 * Ở server để client không phải chép lại luật — chép là hai bản sẽ lệch.
 *
 * @param {object|null} lich
 * @returns {string} rỗng nếu không giới hạn.
 */
function moTa(lich) {
    if (!lich || lich.isActive === false) return '';

    const start = Number(lich.start) || 0;
    const end = Number.isFinite(Number(lich.end)) ? Number(lich.end) : 1440;
    const days = Array.isArray(lich.days) ? [...lich.days].sort((a, b) => a - b) : [];

    const TEN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const hh = (p) => `${String(Math.floor(p / 60) % 24).padStart(2, '0')}:${String(p % 60).padStart(2, '0')}`;

    const veThu = days.length === 0 || days.length === 7
        ? ''
        : days.map((d) => TEN[d] ?? '?').join(', ');
    const veGio = (start === 0 && end >= 1440) ? '' : `${hh(start)}–${hh(end)}`;

    if (!veThu && !veGio) return '';
    if (!veThu) return veGio;
    if (!veGio) return veThu;
    return `${veThu} · ${veGio}`;
}

/**
 * Middleware chặn khi ngoài khung giờ.
 *
 * Chặn ở SERVER chứ không chỉ làm mờ thẻ ngoài giao diện — cùng lý do với
 * `requireLevel`: client sửa được, mà lượt luyện tập có trừ năng lượng và cộng
 * XP.
 *
 * Ngoại lệ `bypassFeatureLock` đi theo luôn: tài khoản demo đã được miễn mốc
 * Level thì cũng nên miễn khung giờ, nếu không thì buổi demo rơi vào 3 giờ
 * sáng là không mở được gì.
 *
 * @param {(req: object) => string|null} modeOf lấy id chế độ từ request.
 */
function requireInSchedule(modeOf) {
    return async (req, res, next) => {
        try {
            if (req.user?.bypassFeatureLock) return next();

            const mode = typeof modeOf === 'function' ? modeOf(req) : modeOf;
            if (!mode) return next();

            // Nạp trong hàm, không ở đầu file: `services/` bị vài test nạp lẻ,
            // mà `require` model ở tầng module kéo theo cả mongoose.
            const ModeSchedule = require('../models/ModeSchedule');
            const lich = await ModeSchedule.findOne({ mode }).lean();

            if (dangMo(lich)) return next();

            return res.status(403).json({
                success: false,
                // Khoá theo GIỜ, khác `locked` của khoá Level — client vẽ hai
                // lời nhắc khác nhau: một cái bảo "cày thêm", một cái bảo "quay
                // lại lúc mấy giờ".
                lockedBySchedule: true,
                schedule: moTa(lich),
                message: moTa(lich)
                    ? `Chế độ này chỉ mở ${moTa(lich)}.`
                    : 'Chế độ này đang ngoài khung giờ cho phép.',
            });
        } catch (err) { next(err); }
    };
}

module.exports = { dangMo, moTa, mocThoiGian, requireInSchedule, MUI_GIO };

