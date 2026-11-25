/**
 * Pinyin cho lời bài hát tiếng Trung — chạy ngay trên máy (thư viện pinyin-pro), không gọi mạng,
 * không tốn AI. Đọc đúng chữ đa âm theo ngữ cảnh (银行 háng / 不行 xíng) và biến thanh của 一/不.
 *
 * Thư viện khá nặng (~ vài trăm KB) nên chỉ tải khi mở một bài tiếng Trung.
 */
let napThuVien = null;

/** Tải thư viện một lần; lỗi thì cho tải lại lần sau. */
export function napPinyin() {
    if (!napThuVien) {
        napThuVien = import('pinyin-pro').then((m) => m.pinyin).catch((e) => { napThuVien = null; throw e; });
    }
    return napThuVien;
}

/**
 * Pinyin của TỪNG KÝ TỰ trong câu (thuần, nhận hàm `pinyin` đã tải): mảng cùng độ dài với
 * `[...text]`, ký tự không phải chữ Hán thì ''. Tính trên cả câu (không từng chữ rời) để chữ đa âm
 * đọc theo ngữ cảnh.
 */
export function pinyinTheoChu(pinyinFn, text) {
    const s = String(text || '');
    if (!s) return [];
    const all = pinyinFn(s, { type: 'all' });
    const ds = [...s];
    // Phòng thư viện gộp ký tự khác cách đếm: lệch độ dài thì bỏ, không gắn pinyin sai chữ.
    if (!Array.isArray(all) || all.length !== ds.length) return ds.map(() => '');
    return all.map((x) => (x?.isZh ? String(x.pinyin || '') : ''));
}

/** Pinyin của một từ (thuần), các âm cách nhau bằng khoảng trắng: "péng you". */
export const pinyinCuaTu = (pinyinFn, tu) => pinyinTheoChu(pinyinFn, tu).filter(Boolean).join(' ');
