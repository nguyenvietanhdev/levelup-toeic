// Chốt chặn rời màn khi ĐANG LÀM BÀI TOEIC.
//
// Bài thi TOEIC chạy trong ToeicScreen (mode 'runner'), KHÔNG qua PracticeManager
// nên chokepoint luyện từ vựng ở GameContext.showScreen không bắt được. Bấm avatar
// / Trang chủ / menu → showScreen('home-screen') sẽ unmount cả ToeicScreen, thoát
// bài mà không hỏi. Module này để runner ĐĂNG KÝ một hàm xác nhận; showScreen gọi
// nó trước khi rời 'toeic-screen'.
let confirmFn = null;

/** Runner gọi khi đang làm bài: fn(proceed) hiện popup, accept thì gọi proceed(). */
export function registerToeicExitGuard(fn) {
    confirmFn = fn;
}

export function clearToeicExitGuard() {
    confirmFn = null;
}

/** GameContext.showScreen dùng: có guard đang bật không. */
export function getToeicExitGuard() {
    return confirmFn;
}
