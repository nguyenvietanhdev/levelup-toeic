/**
 * Chuyển bản ghi song ngữ về ĐÚNG hình dạng mà 16 chế độ đã biết đọc.
 *
 * Đây là chỗ quyết định cả tính năng này tốn 1 file hay tốn 94 chỗ sửa.
 *
 * Các chế độ luyện tập đọc `word.en`, `word.vn`, `word.phonetic`,
 * `word.example` — hình dạng của hai kho cũ. Nếu trả thẳng bản ghi song ngữ
 * (có `zh`, `phoneticZh`, `exampleEn`…) thì mọi chế độ phải học thêm một hình
 * dạng thứ ba, và mỗi chế độ quên là một lỗi im lặng.
 *
 * Nên ĐỔI HÌNH ở đây một lần. Chế độ không cần biết kho song ngữ tồn tại.
 *
 * Bản ghi song ngữ           →   Hình dạng chế độ hiểu
 *   { zh:'你好',                    { en: '你好',        ← từ phải nhớ
 *     en:'hello',                    vn: 'hello',      ← đáp án (mặt kia)
 *     hienThi:'zh', … }              phonetic:'nǐ hǎo',
 *                                    ttsLang:'zh-CN',  ← giọng đọc
 *                                    … }
 *
 * Kho này KHÔNG có nghĩa tiếng Việt — học Trung ↔ Anh thì `en` chính là đáp
 * án. Đặt nó vào ô `vn` là mẹo quan trọng nhất ở đây: 13/16 chế độ đọc
 * `word.vn` làm đáp án, và nhờ vậy không chế độ nào phải sửa một dòng.
 */

/**
 * Mặt "từ phải nhớ" của một bản ghi, theo `hienThi`.
 *
 * Trả về `en` (tên trường mà chế độ đọc) chứ không phải `zh`, kể cả khi nội
 * dung là chữ Hán — vì `word.en` là khoá chính xuyên suốt hệ thống
 * (`wordPk`, `WrongWord.en`, `modeStats`). Đổi tên trường ở đây là phải đổi cả
 * chuỗi lưu từ sai, thống kê, và mọi so sánh `w.en !== word.en`.
 */
function doiHinh(doc) {
    if (!doc) return null;
    const d = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    const laZh = (d.hienThi || 'zh') === 'zh';

    return {
        _id: d._id,

        // Từ phải nhớ + phiên âm của ĐÚNG mặt đó.
        en: laZh ? d.zh : d.en,
        phonetic: laZh ? d.phoneticZh : d.phoneticEn,

        // MẶT KIA nằm ở ô `vn` — ô mà 13/16 chế độ đọc làm đáp án.
        //
        // Kho này không có nghĩa tiếng Việt: học Trung ↔ Anh thì `en` chính là
        // đáp án. Đặt nó vào `vn` để chế độ thấy một cặp (từ, nghĩa) như mọi
        // khi, chỉ là "nghĩa" ở đây bằng tiếng Anh — không chế độ nào phải sửa.
        vn: laZh ? d.en : d.zh,
        // Phiên âm của mặt kia, để hiện cạnh đáp án khi cần.
        vnPhonetic: laZh ? d.phoneticEn : d.phoneticZh,

        // Câu ví dụ cùng mặt với từ, để loa đọc đúng giọng.
        example: laZh ? d.exampleZh : d.exampleEn,
        examplePhonetic: laZh ? d.examplePhoneticZh : d.examplePhoneticEn,
        // Câu ví dụ mặt kia — đóng vai "bản dịch" của câu ví dụ.
        exampleVn: laZh ? d.exampleEn : d.exampleZh,

        part: d.part,
        type: d.type,
        level: d.level,
        source: d.source,
        image: d.image,

        // Cờ để client biết đây là từ song ngữ mà không phải đoán.
        songNgu: true,
        // Giọng đọc — `ttsLang()` ở client là nhị phân zh/en nên phải nói rõ.
        ttsLang: laZh ? 'zh-CN' : 'en-US',
    };
}

/** Đổi hình cả danh sách. */
function doiHinhNhieu(docs) {
    return (docs || []).map(doiHinh).filter(Boolean);
}

module.exports = { doiHinh, doiHinhNhieu };
