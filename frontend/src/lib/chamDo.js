/**
 * Chấm đỏ trên menu: đọc dữ liệu server (`/api/tien-bo/cham-do`) và tự ẩn chấm của
 * "Lộ trình hôm nay" / "Tiến bộ của tôi" khi người học đã mở màn đó trong ngày /
 * trong tuần. Đánh dấu "đã xem" theo trình duyệt — chỉ là lời nhắc, mất cũng không sao.
 */
const KHOA = { 'lo-trinh': 'levelup.daXem.loTrinh', 'tien-bo': 'levelup.daXem.tienBo' };

function doc(k) {
    try { return localStorage.getItem(k) || ''; } catch { return ''; }
}

/**
 * Ghi "đã xem" khi mở màn. `moc` = ngày (Lộ trình) hoặc tuần (Tiến bộ) theo giờ VN,
 * lấy từ server; không có thì dùng ngày máy (chỉ để ẩn chấm, sai một chút không sao).
 */
export function danhDauDaXem(man, moc) {
    const k = KHOA[man];
    if (!k) return;
    const gt = moc || new Date().toISOString().slice(0, 10);
    try { localStorage.setItem(k, gt); } catch { /* chế độ riêng tư: chấm hiện lại lần sau */ }
}

/**
 * Từ dữ liệu server → cờ chấm cho từng MÀN của menu.
 * @returns {Object<string, boolean>} khoá là `screen` của mục menu
 */
export function chamTheoMan(d) {
    if (!d) return {};
    const dd = d.dangDo || {};
    return {
        'listening-screen': !!dd.nghe,
        'reading-screen': !!dd.doc,
        'essay-screen': !!dd.viet,
        'translation-screen': !!dd.dich,
        'conversation-screen': !!dd.chat,
        'voice-conversation-screen': !!dd.hoiThoai,
        // Ẩn khi đã mở trong ngày / tuần này.
        'lo-trinh-screen': !!d.loTrinh && doc(KHOA['lo-trinh']) !== d.ngay,
        'tien-bo-screen': !!d.tongKet && doc(KHOA['tien-bo']) !== d.tuan,
    };
}
