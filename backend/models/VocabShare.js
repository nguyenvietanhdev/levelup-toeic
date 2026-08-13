const mongoose = require('mongoose');

// Cùng regex với User.email — hai bên phải nhận cùng một tập email, không thì
// chủ mời được một địa chỉ mà hệ thống không bao giờ tạo được tài khoản cho nó.
const EMAIL_RE = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

/**
 * Quyền xem một bộ "Từ vựng riêng" đã được chủ chia sẻ cho người khác.
 *
 * Vì sao là collection riêng chứ không phải một field trên word doc: "bộ từ"
 * KHÔNG phải một document — nó chỉ là chuỗi `source` chung của N từ trong
 * `user_upload`. Nhét grant vào từng từ là N lượt ghi mỗi lần chia sẻ, N lượt
 * xoá mỗi lần thu hồi, và grant biến mất theo TTL cùng với từ.
 *
 * Vì sao grant KHÔNG có TTL: từ vựng tự xoá khi `expiresAt` qua hạn (mọi bộ hiện
 * có hết hạn trong 2-4 tuần). Nếu grant chết cùng thì người nhận thấy bộ từ biến
 * mất không dấu vết — đúng kiểu hỏng im lặng. Grant mồ côi ở lại chính là thứ
 * cho phép hiện "bộ này đã hết hạn" thay vì không hiện gì cả.
 */
const vocabShareSchema = new mongoose.Schema(
    {
        // Chủ sở hữu bộ từ. Khớp với `UserUpload.ownerEmail` (cũng lowercase).
        ownerEmail: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        source: {
            type: String,
            required: true,
            trim: true,
        },
        // Người được chia sẻ. Là CHUỖI, cố ý không `ref: 'User'`: mời được cả
        // người chưa đăng ký. Bắt phải tồn tại thì lời mời hụt ngay lúc chủ cần
        // nó nhất, mà chủ không hiểu vì sao.
        granteeEmail: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            match: [EMAIL_RE, 'Email không hợp lệ'],
        },
        // Người nhận đã ĐỒNG Ý nhận bộ này chưa.
        //
        // Trước đây chia sẻ là bộ từ hiện NGAY trong danh sách chọn đề của người
        // nhận, không hỏi han gì. Ai biết ID cũng đẩy được bộ từ vào màn hình
        // người khác — phiền, và về lâu dài là đường spam.
        //
        // Mặc định 'pending': grant CŨ (tạo trước khi có trường này) sẽ thành chờ
        // duyệt, tức là biến khỏi danh sách chọn đề cho tới khi người nhận bấm
        // đồng ý. Đó là hành vi ĐÚNG với ý định mới, và người nhận vẫn thấy chúng
        // trong mục "Bộ từ được chia sẻ cho tôi" chứ không mất đi đâu.
        status: {
            type: String,
            enum: ['pending', 'accepted'],
            default: 'pending',
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'vocab_shares',
    }
);

// Chia sẻ lại cho cùng người là không-thao-tác, không tạo bản ghi thứ hai.
vocabShareSchema.index({ ownerEmail: 1, source: 1, granteeEmail: 1 }, { unique: true });
// "Những bộ được chia sẻ với tôi" — chạy mỗi lần mở modal chọn đề.
vocabShareSchema.index({ granteeEmail: 1 });

module.exports = mongoose.model('VocabShare', vocabShareSchema);
module.exports.EMAIL_RE = EMAIL_RE;
