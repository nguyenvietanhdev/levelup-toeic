const mongoose = require('mongoose');

/**
 * Khung giờ được phép chạy của MỘT chế độ luyện tập.
 *
 * Vì sao có bảng riêng thay vì thêm cột vào `FeatureUnlock`: hai thứ khoá theo
 * hai trục khác nhau và người dùng mở chúng bằng hai cách khác nhau. Khoá Level
 * mở được bằng cách cày; khoá giờ thì chỉ chờ. Gộp một bảng là lời nhắc
 * ("Mở ở Level 12") không nói được điều người dùng cần biết ("Mở lúc 18:00").
 *
 * `days` là thứ trong tuần theo chuẩn JS: 0 = Chủ nhật … 6 = Thứ bảy.
 *
 * `start`/`end` là SỐ PHÚT tính từ nửa đêm (0…1440), không phải giờ tròn:
 * "mở lúc 18:30" là yêu cầu rất thường, mà lưu theo giờ thì phải đổi kiểu dữ
 * liệu và migrate cả bảng.
 *
 * `start > end` nghĩa là khung VẮT QUA NỬA ĐÊM (22:00 → 02:00). Đây là ca dễ
 * quên nhất: so `start <= now && now < end` sẽ trả false suốt cả khung đó.
 */
const modeScheduleSchema = new mongoose.Schema(
    {
        /** Id chế độ, vd 'speed-quiz'. Khớp `Config.modes` bên client. */
        mode: { type: String, required: true, unique: true, trim: true },
        label: { type: String, default: '', trim: true },

        /**
         * Thứ được phép. RỖNG = mọi thứ trong tuần.
         *
         * Rỗng nghĩa là "không giới hạn" chứ không phải "không ngày nào": một
         * chế độ không bao giờ chạy được thì đặt `isActive: false` rõ ràng hơn
         * nhiều, mà bỏ trống ô thì thường là chưa điền chứ không phải muốn chặn.
         */
        days: { type: [Number], default: [] },

        /** Phút từ nửa đêm. 0 → 1440 = cả ngày. */
        start: { type: Number, default: 0, min: 0, max: 1440 },
        end: { type: Number, default: 1440, min: 0, max: 1440 },

        /** Tắt = KHÔNG giới hạn giờ (không phải "chặn hẳn"). */
        isActive: { type: Boolean, default: true },

        /** Ghi chú cho admin, không hiện cho người học. */
        note: { type: String, default: '' },
    },
    { timestamps: true, collection: 'mode_schedules' }
);

modeScheduleSchema.index({ isActive: 1 });

module.exports = mongoose.model('ModeSchedule', modeScheduleSchema);
