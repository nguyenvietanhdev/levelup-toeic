/**
 * Giọng người dùng đã CHỌN trong Cài đặt, quy về mã mà `/api/tts` hiểu.
 *
 * Vì sao tách ra: bảng ánh xạ này vốn nằm trong `gameLogic.speakWord`, nên chỉ
 * phần luyện tập dùng được. Popup Dịch nhanh có bộ phát âm riêng và gọi
 * `/api/tts` bằng mã chung (`'en'` / `'zh'`) — tức là luôn giọng mặc định, bất
 * kể người dùng đã chọn Aria hay Guy, Xiaoxiao hay Yunxi.
 *
 * Chép bảng sang đó là hai bản sẽ lệch: thêm một giọng mới ở Cài đặt thì phải
 * nhớ sửa cả hai chỗ, mà không có gì nhắc.
 */

/** Khoá giọng trong localStorage → mã `lang` của `/api/tts`. */
export const MA_GIONG = {
    // English — nữ
    '__gtts_us__': 'en-us-f',
    '__gtts_uk__': 'en-gb-f',
    '__gtts_au__': 'en-au-f',
    '__gtts_ca__': 'en-ca-f',
    // English — nam
    '__gtts_us_m__': 'en-us-m',
    '__gtts_uk_m__': 'en-gb-m',
    '__gtts_au_m__': 'en-au-m',
    '__gtts_ca_m__': 'en-ca-m',
    '__gtts_random__': 'en-random',
    // Chinese — nữ
    '__gtts_zh_xiaoxiao__': 'zh-cn-xiaoxiao',
    '__gtts_zh_xiaoyi__': 'zh-cn-xiaoyi',
    '__gtts_zh_tw__': 'zh-tw',
    // Chinese — nam
    '__gtts_zh_yunxi__': 'zh-cn-yunxi',
    '__gtts_zh_yunyang__': 'zh-cn-yunyang',
    '__gtts_zh_tw_m__': 'zh-tw-m',
    '__gtts_zh_random__': 'zh-cn-random',
    // Vietnamese
    '__gtts_vi__': 'vi-vn-f',
    '__gtts_vi_m__': 'vi-vn-m',
    '__gtts_vi_random__': 'vi-random',
};

/** Mã mặc định khi người dùng chưa chọn gì. */
const MAC_DINH = { en: 'en-random', zh: 'zh-cn-random', vi: 'vi-random' };

/**
 * Mã `lang` cho `/api/tts` theo giọng người dùng đã chọn.
 *
 * @param {'en'|'zh'|'vi'} heChu ngôn ngữ của đoạn chữ sắp đọc.
 * @returns {string} mã `/api/tts` nhận, vd `'en-us-f'`.
 */
export function maGiongDaChon(heChu) {
    const khoa = heChu === 'zh' ? 'toeic_voice_zh'
        : heChu === 'vi' ? 'toeic_voice_vi'
        : 'toeic_voice_en';

    let daChon = '';
    try {
        daChon = localStorage.getItem(khoa)
            // Khoá cũ, giữ cho hồ sơ chưa đổi sang khoá tách theo ngôn ngữ.
            || localStorage.getItem('toeic_voice')
            || '';
    } catch { /* chế độ riêng tư chặn đọc */ }

    const ma = MA_GIONG[daChon];
    // Giọng đã chọn phải KHỚP hệ chữ mới dùng: người dùng chọn giọng Anh rồi
    // bấm nghe một câu chữ Hán thì gán giọng đó vào là đọc sai hẳn.
    const tienTo = heChu === 'zh' ? 'zh' : heChu === 'vi' ? 'vi' : 'en';
    if (ma && ma.startsWith(tienTo)) return ma;

    return MAC_DINH[heChu] || MAC_DINH.en;
}
