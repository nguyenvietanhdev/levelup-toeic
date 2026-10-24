import { useEffect, useRef } from 'react';
import { Modal } from '@ui/Modal.jsx';

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
}
