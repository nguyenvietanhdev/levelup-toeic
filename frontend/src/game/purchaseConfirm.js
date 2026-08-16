/**
 * Tuỳ chọn "không hỏi lại" khi mua bằng xu trong lúc luyện tập.
 *
 * Áp cho hai popup tiêu tiền giữa phiên: mua gợi ý (50 xu) và mua gói năng
 * lượng (150–250 xu). Người dùng bấm gợi ý liên tục thì mỗi lần một hộp xác
 * nhận là phiền, nên cho họ tắt.
 *
 * CHỈ SỐNG TRONG PHIÊN — cố ý:
 *
 *   · Đây là tuỳ chọn BỎ chốt an toàn cho việc trừ tiền. Lưu vĩnh viễn thì
 *     người dùng tắt một lần rồi quên, vài tuần sau bấm nhầm mất xu mà không
 *     hiểu vì sao không thấy hỏi nữa.
 *   · Sống trong biến ở bộ nhớ nên F5 / thoát ra vào lại là hỏi tiếp. Không
 *     ghi localStorage, không đồng bộ server — không có gì phải dọn.
 *
 * Đặt riêng một module vì hai popup nằm ở hai file khác nhau (practiceManager
 * và energyShop) mà phải dùng CHUNG một công tắc: tắt ở popup này thì popup kia
 * cũng thôi hỏi, đúng như người dùng vừa yêu cầu.
 */

let _skip = false;

export const PurchaseConfirm = {
    /** Người dùng đã chọn bỏ qua xác nhận cho phiên này chưa? */
    shouldSkip() {
        return _skip;
    },

    /** Ghi lựa chọn từ ô tick trong popup. */
    setSkip(value) {
        _skip = !!value;
    },

    /**
     * Trả về mặc định. Gọi khi BẮT ĐẦU một phiên luyện tập mới.
     *
     * Không có hàm này thì "chỉ trong phiên" thành "cho tới khi F5": thoát bài,
     * vào bài khác, vẫn không bị hỏi.
     */
    reset() {
        _skip = false;
    },
};
