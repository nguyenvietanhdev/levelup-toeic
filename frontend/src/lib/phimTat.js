/**
 * SỔ TAY PHÍM TẮT — danh mục MỌI phím tắt của hệ thống, một nguồn duy nhất.
 *
 * Phím tắt nằm rải rác trong từng chế độ (Flashcard, Tốc độ, Hội thoại giọng nói,
 * ô tìm kiếm…) và chỉ ai đọc mã mới biết. Gom về đây để màn "Phím tắt" hiển thị.
 *
 * KHI THÊM / ĐỔI PHÍM TẮT Ở ĐÂU ĐÓ, SỬA LUÔN Ở ĐÂY. Test `phimTat.test.js` soi
 * lại mã nguồn của từng chế độ để bắt chỗ sổ tay nói một đằng, mã làm một nẻo.
 *
 * `phim`: mảng các phím bấm CÙNG LÚC; `hoac`: cách bấm khác cho cùng việc.
 * `screens`: màn mà nhóm này áp dụng — đang ở màn đó thì nhóm được đưa lên đầu.
 */
export const NHOM_PHIM_TAT = [
    {
        key: 'chung',
        ten: 'Mọi nơi',
        icon: 'fa-globe',
        screens: [],
        phim: [
            { phim: ['?'], viec: 'Mở sổ tay phím tắt này' },
            { phim: ['Esc'], viec: 'Đóng popup / cửa sổ đang mở' },
            { phim: ['Shift', 'Z'], viec: 'Dịch đoạn đang bôi đen', ghiChu: 'Tắt khi đang thi TOEIC' },
            { phim: ['Giữ Ctrl', 'bôi đen chuột'], viec: 'Dịch ngay đoạn vừa bôi đen', ghiChu: 'Tắt khi đang thi TOEIC' },
        ],
    },
    {
        key: 'tim-kiem',
        ten: 'Ô tìm kiếm',
        icon: 'fa-magnifying-glass',
        screens: [],
        phim: [
            { phim: ['Giữ Shift'], viec: 'Nói từ cần tìm (nhả ra là dừng nghe)', ghiChu: 'Tắt khi đang luyện tập' },
            { phim: ['Enter'], viec: 'Mở Dịch nhanh với chữ vừa gõ' },
            { phim: ['Esc'], viec: 'Xoá ô tìm kiếm và thoát ra' },
        ],
    },
    {
        key: 'dich-nhanh',
        ten: 'Popup Dịch nhanh',
        icon: 'fa-language',
        screens: [],
        phim: [
            { phim: ['Giữ Shift'], viec: 'Nói câu cần dịch' },
            { phim: ['Enter'], viec: 'Dịch chữ trong ô nguồn' },
            { phim: ['Enter'], viec: 'Ở ô Source / Part: lưu từ vào Từ vựng riêng' },
        ],
    },
    {
        key: 'luyen-tap',
        ten: 'Luyện tập (mọi chế độ)',
        icon: 'fa-dumbbell',
        screens: ['practice-screen'],
        phim: [
            { phim: ['Ctrl'], viec: 'Bấm nhanh rồi nhả: phát lại âm thanh vừa đọc' },
            { phim: ['←'], hoac: ['→'], viec: 'Câu trước / câu sau', ghiChu: 'Khi bật chuyển câu thủ công' },
            { phim: ['Enter'], viec: 'Kiểm tra đáp án', ghiChu: 'Điền từ, Chép chính tả, Xếp câu, Ôn lại từ sai' },
        ],
    },
    {
        key: 'flashcard',
        ten: 'Flashcard',
        icon: 'fa-clone',
        screens: ['practice-screen'],
        phim: [
            { phim: ['Cách'], hoac: ['Enter'], viec: 'Lật thẻ' },
            { phim: ['←'], hoac: ['1'], viec: 'Chưa biết' },
            { phim: ['→'], hoac: ['2'], viec: 'Đã biết' },
            { phim: ['P'], viec: 'Phát âm mặt thẻ đang hiện' },
        ],
    },
    {
        key: 'toc-do',
        ten: 'Tốc độ',
        icon: 'fa-bolt',
        screens: ['practice-screen'],
        phim: [
            { phim: ['←'], hoac: ['1'], viec: 'Chọn ĐÚNG' },
            { phim: ['→'], hoac: ['2'], viec: 'Chọn SAI' },
        ],
    },
    {
        key: 'xem-lai',
        ten: 'Xem lại bài đã làm',
        icon: 'fa-list-check',
        screens: ['practice-screen', 'toeic-result-screen'],
        phim: [
            { phim: ['←'], hoac: ['→'], viec: 'Câu trước / câu sau' },
            { phim: ['Esc'], viec: 'Đóng phần xem lại / lưới câu hỏi' },
        ],
    },
    {
        key: 'chua-bai',
        ten: 'Chữa bài (Viết, Dịch)',
        icon: 'fa-marker',
        screens: ['essay-screen', 'translation-screen'],
        phim: [
            { phim: ['←'], hoac: ['→'], viec: 'Lỗi trước / lỗi sau' },
            { phim: ['Enter'], viec: 'Kiểm tra câu tự sửa' },
        ],
    },
    {
        key: 'hoi-thoai',
        ten: 'Hội thoại giọng nói',
        icon: 'fa-microphone-lines',
        screens: ['voice-conversation-screen'],
        phim: [
            { phim: ['Giữ Cách'], viec: 'Ghi âm câu trả lời — nhả ra là dừng và GỬI luôn' },
            { phim: ['Enter'], viec: 'Gửi bản ghi đang xem lại' },
            { phim: ['Delete'], hoac: ['Backspace'], viec: 'Bỏ bản ghi, ghi lại' },
        ],
    },
];

/** Mở sổ tay từ bất kỳ đâu (menu, nút…). Sổ tay lắng nghe sự kiện này. */
export const SU_KIEN_MO = 'phim-tat:mo';

export function moSoTayPhimTat() {
    window.dispatchEvent(new Event(SU_KIEN_MO));
}

/** Đưa nhóm áp dụng cho màn hiện tại lên đầu, giữ nguyên thứ tự còn lại. */
export function xepTheoMan(nhom, screen) {
    const hop = nhom.filter((n) => n.screens.includes(screen));
    return [...hop, ...nhom.filter((n) => !n.screens.includes(screen))];
}
