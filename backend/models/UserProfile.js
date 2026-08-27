const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
    {
        // Audio
        soundEnabled: { type: Boolean, default: true },
        soundEffects: { type: Boolean, default: true },
        answerFeedbackSound: { type: Boolean, default: true },
        practiceSoundEnabled: { type: Boolean, default: true },
        volume: { type: Number, default: 70, min: 0, max: 100 },
        autoPronunciation: { type: Boolean, default: false },

        // Giọng đọc — lưu THEO TÀI KHOẢN, không chỉ localStorage.
        //
        // Trước đây ba trường này chỉ nằm ở localStorage nên đăng nhập máy khác
        // là mất lựa chọn, rơi về "Tự động — Random". Máy cũ vẫn nhớ nên rất dễ
        // tưởng là đã lưu rồi.
        //
        // Chuỗi rỗng = chưa chọn → client dùng mặc định của nó. KHÔNG đặt mặc
        // định là '__gtts_random__' ở đây: làm vậy thì không phân biệt được
        // "chưa từng chọn" với "cố ý chọn random".
        voiceEn: { type: String, default: '' },
        voiceZh: { type: String, default: '' },
        // Tốc độ đọc, % (50–150). Cũng chỉ nằm ở localStorage như trên.
        speechRate: { type: Number, default: 80, min: 50, max: 150 },

        // Game
        randomQuestions: { type: Boolean, default: false },
        questionsPerSession: { type: mongoose.Schema.Types.Mixed, default: 10 },
        timePerQuestion: { type: Number, default: 30 },
        // Mục tiêu thời gian học mỗi ngày (phút) — vòng tiến độ ở trang chủ.
        dailyStudyGoalMin: { type: Number, default: 15 },
        // Mục tiêu điểm TOEIC (0 = chưa đặt). Thang thật 10–990, bước 5.
        // Phần phân tích lấy con số này để đối chiếu với điểm ước lượng.
        toeicTargetScore: { type: Number, default: 0, min: 0, max: 990 },
        difficulty: {
            type: String,
            enum: ['easy', 'medium', 'hard', 'adaptive'],
            default: 'medium',
        },

        // ── Đồng bộ ĐA THIẾT BỊ ──────────────────────────────────────────────
        //
        // Mười trường dưới đây trước chỉ nằm ở localStorage. Mongoose chạy
        // `strict` mặc định nên trường KHÔNG khai ở đây bị LOẠI BỎ ÂM THẦM:
        // client gửi lên bao nhiêu lần cũng vô ích, không lỗi nào báo. Người
        // dùng đăng nhập máy khác là mất sạch lựa chọn — mà app cho phép nhiều
        // thiết bị cùng một tài khoản.
        //
        // `theme` CỐ TÌNH không có ở đây: nền sáng/tối thuộc về THIẾT BỊ, không
        // thuộc tài khoản (máy bàn để sáng, điện thoại để tối là hợp lý).

        // Ngôn ngữ đang học — nặng nhất trong nhóm: sai là máy khác mở ra học
        // nhầm hẳn ngôn ngữ.
        //
        // `bi` = kho song ngữ (Trung ↔ Anh). Thiếu nó ở enum thì Mongoose TỪ
        // CHỐI lưu, và người dùng chọn xong tải lại trang là thấy nhảy về
        // `en` — không có lỗi nào hiện ra, vì `save()` thất bại lặng lẽ ở nền.
        vocabLang: { type: String, enum: ['en', 'zh', 'bi'], default: 'en' },

        // Danh sách `level` ứng với mức độ khó đang chọn (['HSK1','HSK2']…).
        // Đi CẶP với `difficulty`: có cái này thiếu cái kia là lọc ra 0 từ.
        // `null` = không lọc; mảng rỗng KHÁC null nên không dùng default [].
        levelFilter: { type: [String], default: null },

        // Đảo chiều hỏi–đáp (VN→EN thay vì EN→VN) — đổi hẳn cách ra đề.
        reverseMode: { type: Boolean, default: false },

        // ── ĐỀ và PART đang chọn ─────────────────────────────────────────────
        //
        // Hai trường này trước bị Mongoose LOẠI BỎ ÂM THẦM (không khai ở đây thì
        // `strict` mặc định strip sạch), nên client là nơi DUY NHẤT biết người
        // dùng đang học bộ nào. Hệ quả: mọi tính năng cần thông tin đó đều phải
        // bắt client gửi lên — mà client thì lấy từ một module vanilla trả về
        // OBJECT, gửi sai kiểu là ra lỗi 404 không liên quan gì tới bệnh thật.
        // Đó chính là chuỗi lỗi của chế độ Hội thoại.
        //
        // Lưu ở server thì server tự biết, không phải hỏi client — bớt hẳn một
        // ranh giới để đoán sai.
        selectedSource: { type: String, default: '' },
        selectedPart: { type: String, default: '' },

        // Giới hạn giờ mỗi câu + thời gian theo TỪNG chế độ.
        timeLimitEnabled: { type: Boolean, default: true },
        // `{ [modeId]: giây }` — khoá do client đặt nên phải Mixed, không thể
        // khai cứng từng chế độ.
        questionTime: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

        // Tự chuyển câu sau khi trả lời (luyện tập).
        autoAdvance: { type: Boolean, default: true },
        // Chế độ Phát âm: đọc cả câu ví dụ thay vì một từ. MẶC ĐỊNH TẮT — đọc
        // câu khó hơn hẳn, bật sẵn thì người mới gặp ngay câu 15 từ và bỏ.
        pronounceSentence: { type: Boolean, default: false },

        /**
         * Kiểu hỏi được phép trong chế độ "Ôn lại từ sai": 'choice' /
         * 'truefalse' / 'fill'.
         *
         * Mảng RỖNG = không giới hạn (dùng cả ba), không phải "không có kiểu
         * nào" — người bỏ tick hết là người không muốn giới hạn, chứ không phải
         * muốn một lượt không có câu nào.
         *
         * PHẢI khai ở đây: Mongoose ở chế độ `strict` XOÁ ÂM THẦM mọi trường
         * không khai, nên thiếu dòng này thì lựa chọn của người dùng lưu xong là
         * mất, không có lỗi nào báo.
         */
        reviewKinds: { type: [String], default: undefined },

        // ── Cấu hình bài thi TOEIC ───────────────────────────────────────────
        // Bốn trường này người dùng chỉnh khá kỹ; mất là phải dựng lại từ đầu.
        toeicPerQuestionTimer: { type: Boolean, default: false },
        toeicAutoAdvance: { type: Boolean, default: true },
        toeicTransition: { type: Number, default: 1, min: 0, max: 10 },
        // `{ [part]: phút }` cho Part 5·6·7 — khoá là số Part, dùng Mixed.
        toeicCustomPartMin: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({ 5: 15, 6: 8, 7: 36 }),
        },

        // Features
        notificationsEnabled: { type: Boolean, default: true },
        autoSync: { type: Boolean, default: true },
    },
    { _id: false }
);

const userProfileSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
        },
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            minlength: 3,
            maxlength: 20,
        },
        displayName: { type: String, trim: true, default: '' },
        // Lần đổi tên gần nhất — giới hạn 1 lần / 30 ngày. null = chưa từng đổi.
        usernameChangedAt: { type: Date, default: null },
        avatar: {
            type: String,
            default: function () {
                return (this.username || '?').charAt(0).toUpperCase();
            },
        },

        level: { type: Number, default: 1 },
        currentLevelXp: { type: Number, default: 0 },

        // Cosmetic đang trang bị theo slot: { background: itemId, frame: itemId, ... }
        equipped: { type: mongoose.Schema.Types.Mixed, default: {} },

        // Số lượt like nhận được (denormalized để hiện nhanh ở BXH/popup).
        likeCount: { type: Number, default: 0 },

        settings: { type: settingsSchema, default: () => ({}) },
    },
    {
        timestamps: true,
        collection: 'user_profiles',
        versionKey: false,
    }
);

module.exports = mongoose.model('UserProfile', userProfileSchema);
