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
    const kho = vocabLang();
    // Kho song ngữ: hai mặt là Hán ↔ Anh, KHÔNG có tiếng Việt nào.
    //
    // Mặt đang học do CHÍNH BẢN GHI khai (`hienThi` → `ttsLang` từ mapper),
    // không phải do kho: một kho chứa cả hai chiều, nên hỏi "kho này mặt trước
    // là gì" là câu hỏi sai. Không có bản ghi thì lấy chiều mặc định 'zh'.
    if (kho === 'bi') {
        const tu = word?.ttsLang === 'en-US' ? 'en-US' : 'zh-CN';
        return { tu, nghia: tu === 'zh-CN' ? 'en-US' : 'zh-CN' };
    }
    if (kho === 'zh') return { tu: 'zh-CN', nghia: 'vi-VN' };
    return { tu: 'en-US', nghia: 'vi-VN' };
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
