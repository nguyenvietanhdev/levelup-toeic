/**
 * Tín hiệu "nên xuất báo cáo" — dùng chung cho nút Xuất báo cáo và chấm đỏ
 * trên mục "Thống kê" ở side menu.
 *
 * Thống kê reset vào 0h ngày mùng 1 hàng tháng (xem GameState._monthlyStatsMaintenance).
 * Nếu tháng hiện tại có dữ liệu luyện tập mà người dùng CHƯA xuất báo cáo tháng
 * này → bật chấm đỏ nhắc xuất trước khi dữ liệu bị reset.
 */
import { GameState } from '@game/state.js';

const STORAGE_KEY = 'statsExportedMonth';

export function currentMonthKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Có dữ liệu luyện tập trong tháng hiện tại chưa? */
export function hasStatsThisMonth() {
    const key = currentMonthKey();
    const hist = GameState.state?.practiceHistory || [];
    return hist.some(e => (e?.date || '').startsWith(key));
}

/** Nên hiện chấm đỏ nhắc xuất báo cáo? */
export function shouldExportStats() {
    let exported = null;
    try { exported = localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }
    return hasStatsThisMonth() && exported !== currentMonthKey();
}

/** Đánh dấu đã xuất báo cáo cho tháng hiện tại → tắt chấm đỏ. */
export function markStatsExported() {
    try { localStorage.setItem(STORAGE_KEY, currentMonthKey()); } catch { /* ignore */ }
}
