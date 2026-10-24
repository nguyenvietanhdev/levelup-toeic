import { useEffect, useRef } from 'react';
import { Modal } from '@ui/Modal.jsx';
import { GameLogic } from '@game/gameLogic.js';

/**
 * Chốt chặn rời màn khi ĐANG LÀM DỞ một chế độ AI (Hội thoại, Đọc hiểu, Viết,
 * Dịch, Nghe) — cùng popup "Thoát …?" như 16 chế độ luyện tập.
 *
 * Các màn AI không chạy qua PracticeManager nên chokepoint luyện tập ở
 * `GameContext.showScreen` không bắt được: bấm quay về / avatar / Trang chủ /
 * menu là màn bị gỡ và mất bài đang làm mà không hỏi. Màn đang làm dở ĐĂNG KÝ
 * một guard ở đây; `showScreen` gọi nó trước khi rời màn đó (giống TOEIC).
 */
let guard = null; // { screen, fn(proceed) }

/**
 * Dừng MỌI âm thanh đang phát của màn AI.
 *
 * Giọng đọc phát qua một đối tượng `Audio` KHÔNG gắn vào trang (`GameLogic`) — gỡ
 * màn khỏi DOM không dừng được nó, nên thoát rồi mà tiếng vẫn chạy. Dừng cả ba
 * đường: giọng TTS của GameLogic (kèm bỏ qua lượt đang tải dở), giọng trình duyệt,
 * và các thẻ <audio> trên trang (trình phát của bài Nghe).
 */
export function dungMoiAmThanh() {
    try { GameLogic.stopSpeaking?.(); } catch { /* chưa phát gì */ }
    try { window.speechSynthesis?.cancel(); } catch { /* không hỗ trợ */ }
    try { document.querySelectorAll('audio').forEach((a) => a.pause()); } catch { /* không có */ }
}

/** GameContext.showScreen dùng: guard đang bật (hoặc null). */
export function getAiExitGuard() {
    return guard;
}

/**
 * Màn AI gọi: khi `dangLamDo` thì rời màn `screen` phải xác nhận.
 * `noiDung` là chữ CỐ ĐỊNH của app (đưa vào Modal dạng HTML) — không truyền chữ
 * người dùng nhập vào đây.
 */
export function useHoiKhiThoat(screen, dangLamDo, { tieuDe = 'Thoát chế độ này?', noiDung = '' } = {}) {
    // Giữ chữ mới nhất mà không phải đăng ký lại guard mỗi lần render.
    const chu = useRef({ tieuDe, noiDung });
    chu.current = { tieuDe, noiDung };

    useEffect(() => {
        if (!dangLamDo) return undefined;
        const g = {
            screen,
            fn: (proceed) => Modal.show({
                title: chu.current.tieuDe,
                content: `<p>${chu.current.noiDung}</p>`,
                buttons: [
                    { text: 'Hủy', className: 'btn-secondary', onClick: () => Modal.close() },
                    {
                        text: 'Thoát',
                        className: 'btn-primary',
                        onClick: () => {
                            // Dừng tiếng NGAY khi bấm Thoát, như luyện tập (`stopAllSounds`).
                            dungMoiAmThanh();
                            Modal.close();
                            // Đóng popup xong mới chuyển màn, như luyện tập.
                            setTimeout(proceed, 0);
                        },
                    },
                ],
            }),
        };
        guard = g;
        // Chỉ gỡ guard CỦA MÌNH: màn khác có thể đã đăng ký guard mới trong lúc này.
        return () => { if (guard === g) guard = null; };
    }, [screen, dangLamDo]);

    // Rời màn bằng BẤT KỲ đường nào (kể cả khi đã làm xong, không có popup) thì
    // cũng dừng tiếng — màn đã gỡ mà giọng đọc vẫn phát là lỗi người dùng gặp.
    useEffect(() => () => dungMoiAmThanh(), []);
}
