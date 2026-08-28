import { EventBus, GameEvents } from '@game/eventBus.js';

/**
 * Bấm vào ICON của thẻ đề/Part → mở popup dịch tên đề.
 *
 * Vì sao cần: tên đề nhiều khi là chữ Hán (`基本问候`, `食物`) hoặc tiếng Anh
 * chuyên ngành (`ADVERBS OF FREQUENCY`, `CONVERSATIONAL WORDS`). Nhìn vào
 * không đoán được nội dung, mà phải chọn thử rồi thoát ra mới biết.
 *
 * Vì sao gắn vào ICON chứ không thêm nút riêng:
 *
 *   · Thẻ đã dày (tên + số từ + thanh tiến độ). Thêm một nút nữa là chật, và
 *     trên điện thoại thì hai vùng bấm sát nhau rất dễ chạm nhầm.
 *   · Icon vốn chỉ để trang trí — nó không mang chức năng nào nên gán việc mới
 *     vào đó không lấy mất gì.
 *   · Bấm chỗ khác trên thẻ vẫn CHỌN như cũ: thao tác quen thuộc không đổi.
 *
 * `stopPropagation` là bắt buộc: thẻ cha có handler chọn đề, không chặn thì một
 * cú bấm vừa dịch vừa chọn — và popup dịch mở ra trên một màn hình vừa chuyển.
 */
export function dichTenDe(e, ten) {
    e.stopPropagation();
    const text = String(ten || '').trim();
    if (!text) return;
    EventBus.emit(GameEvents.TRANSLATE_REQUESTED, { text });
}

/** Thuộc tính dùng chung cho icon: gợi ý + con trỏ + nhãn cho trình đọc màn hình. */
export function thuocTinhIconDich(ten) {
    return {
        title: `Dịch "${ten}"`,
        role: 'button',
        tabIndex: 0,
        style: { cursor: 'help' },
    };
}
