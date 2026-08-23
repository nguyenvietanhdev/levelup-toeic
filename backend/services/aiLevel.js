/**
 * Mức khó dùng chung cho MỌI chế độ AI.
 *
 * Trước đây mỗi chế độ tự lo: Dịch và Đọc hiểu mỗi cái khai một bảng riêng, còn
 * Hội thoại thì cứng ở "beginner level" trong prompt và Viết luận không có khái
 * niệm mức khó nào cả. Hậu quả thấy rõ nhất ở Hội thoại: người Level 18 — mốc
 * mở khoá của chính chế độ đó — vẫn nhận hội thoại vỡ lòng.
 *
 * Gom về một chỗ vì ba lý do:
 *   1. Thêm một mức (hay đổi tên mức) chỉ phải sửa một nơi.
 *   2. Ba chữ "Dễ/Vừa/Khó" ở bốn màn hình phải có nghĩa GIỐNG NHAU — "Khó" ở
 *      Dịch mà dễ hơn "Vừa" ở Đọc hiểu thì người học không so được.
 *   3. `chuanHoaMuc` là chỗ duy nhất chặn giá trị lạ từ client, nên không thể
 *      có chế độ nào quên chặn.
 */

/**
 * Ba mức, kèm mô tả trình độ để nhét vào prompt.
 *
 * `cefr` viết theo khung châu Âu vì mọi model đều hiểu nó — bảo "trung bình"
 * thì mỗi lần sinh ra một mức khác, còn "B1-B2" thì ổn định.
 */
const MUC = [
    {
        key: 'easy',
        vi: 'Dễ',
        cefr: 'A2',
        prompt: 'Use simple everyday vocabulary and short sentences (CEFR A2).',
    },
    {
        key: 'medium',
        vi: 'Vừa',
        cefr: 'B1',
        prompt: 'Use common workplace vocabulary and compound sentences (CEFR B1).',
    },
    {
        key: 'hard',
        vi: 'Khó',
        cefr: 'B2-C1',
        prompt: 'Use precise, less common vocabulary and complex sentences (CEFR B2-C1).',
    },
];

const KEYS = MUC.map((m) => m.key);

/**
 * Chuẩn hoá mức client gửi lên.
 *
 * `hasOwnProperty` chứ không `in`: `in` nhận cả khoá kế thừa từ
 * `Object.prototype`, nên `level: 'constructor'` sẽ lọt qua và về sau tra bảng
 * ra `undefined`.
 *
 * Giá trị lạ → `medium`, KHÔNG ném lỗi: mức khó chỉ ảnh hưởng độ khó của đề,
 * sai một nhịp thì bài vẫn dùng được — chặn cả lượt vì nó thì không đáng.
 */
function chuanHoaMuc(v) {
    const k = String(v || '').trim().toLowerCase();
    return KEYS.includes(k) ? k : 'medium';
}

/** Dòng chỉ thị trình độ để chèn vào prompt. */
function chiThiMuc(v) {
    const k = chuanHoaMuc(v);
    return MUC.find((m) => m.key === k).prompt;
}

/** Nhãn tiếng Việt. Mức lạ vẫn ra nhãn, không trả `undefined`. */
function nhanMuc(v) {
    const k = chuanHoaMuc(v);
    return MUC.find((m) => m.key === k).vi;
}

module.exports = { MUC, KEYS, chuanHoaMuc, chiThiMuc, nhanMuc };
