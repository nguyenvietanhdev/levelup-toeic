import { vocabLang } from '@game/gameLogic.js';

/**
 * Nhãn hai mặt của cặp học hiện tại.
 *
 * Nhiều chế độ viết cứng "Tiếng Anh" / "Tiếng Việt" trong giao diện. Đúng với
 * hai kho cũ, nhưng ở kho song ngữ thì sai cả hai vế: mặt trước là chữ HÁN,
 * mặt sau là tiếng ANH — không có tiếng Việt nào trong đó.
 *
 * Gom về một chỗ vì lỗi này lặp ở nhiều chế độ, và chép tay thì sửa được chỗ
 * này lại sót chỗ kia.
 *
 * @returns {{tu: string, nghia: string}} `tu` = mặt hỏi, `nghia` = mặt đáp.
 */
export function nhanCapHoc() {
    const kho = vocabLang();
    if (kho === 'bi') return { tu: 'Tiếng Trung', nghia: 'Tiếng Anh' };
    if (kho === 'zh') return { tu: 'Tiếng Trung', nghia: 'Tiếng Việt' };
    return { tu: 'Tiếng Anh', nghia: 'Tiếng Việt' };
}

/**
 * Nhãn theo CHIỀU đang luyện.
 *
 * Đảo chiều thì hai cột đổi chỗ cho nhau — nhãn phải đi theo, nếu không người
 * học đọc tiêu đề một đằng thấy nội dung một nẻo.
 */
export function nhanTheoChieu(dao = false) {
    const { tu, nghia } = nhanCapHoc();
    return dao ? { trai: nghia, phai: tu } : { trai: tu, phai: nghia };
}
