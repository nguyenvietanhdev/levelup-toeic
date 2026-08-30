import { vocabLang } from '@game/gameLogic.js';
import { nhanKho, maKho } from '@lib/nhanKho.js';

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
    return nhanKho(vocabLang());
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

/**
 * Mã giọng đọc của HAI MẶT trong cặp học hiện tại.
 *
 * Song sinh với `nhanCapHoc`: chỗ đó trả NHÃN để hiện, chỗ này trả MÃ để đọc.
 * Cùng một hiểu biết ("mặt này ngôn ngữ gì"), nên phải nằm cạnh nhau — tách ra
 * là sửa được nhãn mà quên giọng.
 *
 * Vì sao cần: `speakWord` tự nhận diện ngôn ngữ theo mặt chữ, mà nhận diện chỉ
 * là ĐOÁN. Nghĩa tiếng Việt không dấu ("hoa", "ban", "cam") trông y hệt tiếng
 * Anh, nên bị đọc bằng giọng Anh. Trong khi chỗ gọi BIẾT CHẮC đoạn chữ đó lấy
 * từ khoá nào — đã biết thì đừng đoán.
 *
 * @returns {{tu: string, nghia: string}} mã BCP-47 cho `/api/tts`.
 */
export function maCapHoc(word = null) {
    return maKho(vocabLang(), word);
}

/**
 * Mã giọng theo CHIỀU đang luyện — cặp với `nhanTheoChieu`.
 *
 * @returns {{trai: string, phai: string}}
 */
export function maTheoChieu(dao = false, word = null) {
    const { tu, nghia } = maCapHoc(word);
    return dao ? { trai: nghia, phai: tu } : { trai: tu, phai: nghia };
}
