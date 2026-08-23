/**
 * Phân loại LỖI NGỮ PHÁP thành nhóm cố định, để thống kê được.
 *
 * Vì sao cần: AI trả về `issue` là văn xuôi tự do ("Sử dụng từ 'overwhelming'
 * không rõ ràng trong ngữ cảnh này"). Đọc từng bài thì hiểu, nhưng không trả
 * lời được câu quan trọng nhất: "tôi hay sai gì nhất?". Hai bài viết cách nhau
 * một tháng cùng sai mạo từ sẽ mô tả bằng hai câu chữ khác hẳn nhau.
 *
 * Nhãn do AI gán NGAY KHI CHẤM chứ không suy ra sau bằng từ khoá: nó đang đọc
 * bài và biết chính xác lỗi là gì, còn dò từ khoá trên câu tiếng Việt là đoán
 * mò trên một bản dịch của điều nó đã biết.
 *
 * Danh sách CỐ ĐỊNH và ngắn. Để AI tự đặt tên nhóm thì mỗi lần chấm ra một tên
 * khác ("mạo từ", "articles", "a/an/the") và thống kê lại vô nghĩa như cũ.
 */

/**
 * Các nhóm lỗi, xếp theo mức phổ biến với người Việt học tiếng Anh.
 *
 * `vi` là thứ hiện cho người học; `hint` là gợi ý luyện tập khi nhóm đó nổi lên
 * — biết mình sai nhiều mà không biết làm gì tiếp thì thống kê chỉ để ngắm.
 */
const LOAI_LOI = [
    { key: 'article', vi: 'Mạo từ (a/an/the)', hint: 'Danh từ đếm được số ít gần như luôn cần mạo từ.' },
    { key: 'tense', vi: 'Thì của động từ', hint: 'Xác định mốc thời gian của câu trước khi chọn thì.' },
    { key: 'agreement', vi: 'Hoà hợp chủ ngữ – động từ', hint: 'Tìm chủ ngữ thật, đừng lấy danh từ đứng gần động từ nhất.' },
    { key: 'preposition', vi: 'Giới từ', hint: 'Giới từ đi liền với từ đứng trước — học theo cụm, không học rời.' },
    { key: 'word-order', vi: 'Trật tự từ', hint: 'Tiếng Anh: chủ ngữ – động từ – tân ngữ; trạng ngữ hiếm khi chen giữa.' },
    { key: 'word-choice', vi: 'Chọn từ chưa đúng', hint: 'Từ đúng nghĩa chưa chắc đúng ngữ cảnh — tra cụm đi kèm.' },
    { key: 'plural', vi: 'Số ít / số nhiều', hint: 'Danh từ không đếm được không thêm -s.' },
    { key: 'spelling', vi: 'Chính tả', hint: 'Đọc lại một lượt trước khi nộp.' },
    { key: 'punctuation', vi: 'Dấu câu', hint: 'Hai mệnh đề độc lập không nối bằng dấu phẩy.' },
    // Nhóm hứng: AI gán nhãn lạ, hoặc lỗi không thuộc nhóm nào ở trên. Có nó
    // thì mọi lỗi đều đếm được; thiếu nó thì lỗi lạ bị VỨT ÂM THẦM và tổng số
    // trong thống kê nhỏ hơn số lỗi thật mà không ai biết.
    { key: 'other', vi: 'Khác', hint: '' },
];

const KEYS = new Set(LOAI_LOI.map((l) => l.key));

/** Nhãn tiếng Việt của một nhóm. Nhóm lạ → 'Khác', không trả undefined. */
function nhanLoi(key) {
    return (LOAI_LOI.find((l) => l.key === key) || LOAI_LOI[LOAI_LOI.length - 1]).vi;
}

/** Gợi ý luyện tập cho một nhóm. */
function goiYLoi(key) {
    return (LOAI_LOI.find((l) => l.key === key) || {}).hint || '';
}

/**
 * Chuẩn hoá nhãn AI trả về.
 *
 * AI hay trả `"Article"`, `"articles"`, `"ARTICLE"` cho cùng một nhóm — ba
 * chuỗi khác nhau thì thống kê tách thành ba dòng. Hạ chữ thường, bỏ `-s`
 * số nhiều, và nhãn nào không nhận ra thì về `other` chứ không vứt đi.
 */
function chuanHoaLoai(raw) {
    const k = String(raw || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
    if (KEYS.has(k)) return k;
    // `articles` → `article`, `prepositions` → `preposition`.
    const boS = k.replace(/s$/, '');
    if (KEYS.has(boS)) return boS;
    return 'other';
}

/**
 * Dòng chỉ thị chèn vào prompt chấm bài, để AI gán nhãn ngay.
 *
 * Đặt ở đây thay vì chép vào từng bộ chấm: hai bản sao thì thêm một nhóm lỗi
 * phải sửa hai chỗ, và quên một chỗ thì nhóm mới im lặng không bao giờ xuất
 * hiện từ nguồn đó.
 */
function chiThiPhanLoai() {
    return [
        `Also tag each item with "type", one of: ${LOAI_LOI.map((l) => l.key).join(', ')}.`,
        'Use exactly these keys, lowercase. Use "other" if none fits.',
    ].join('\n');
}

/**
 * Gom danh sách lỗi thành thống kê theo nhóm, nhiều nhất trước.
 *
 * @param {Array<{type?:string}>} items lỗi từ nhiều bài gộp lại
 * @returns {Array<{key:string, vi:string, hint:string, count:number}>}
 */
function thongKe(items) {
    const dem = new Map();
    for (const it of Array.isArray(items) ? items : []) {
        // Hai nguồn dùng hai tên trường: Translation lưu `loai` (vì `type` là
        // từ khoá Mongoose), Essay lưu `type` trong mảng Mixed nên giữ nguyên
        // tên AI trả về. Đọc cả hai thay vì ép một nguồn đổi tên.
        const k = chuanHoaLoai(it?.loai ?? it?.type);
        dem.set(k, (dem.get(k) || 0) + 1);
    }
    return [...dem.entries()]
        .map(([key, count]) => ({ key, vi: nhanLoi(key), hint: goiYLoi(key), count }))
        // Nhiều nhất trước; bằng nhau thì theo thứ tự trong `LOAI_LOI` để kết
        // quả ổn định giữa các lần gọi — thứ tự nhảy lung tung trông như dữ
        // liệu đang đổi trong khi không có gì đổi cả.
        .sort((a, b) => b.count - a.count
            || LOAI_LOI.findIndex((l) => l.key === a.key) - LOAI_LOI.findIndex((l) => l.key === b.key));
}

module.exports = { LOAI_LOI, chuanHoaLoai, nhanLoi, goiYLoi, chiThiPhanLoai, thongKe };
