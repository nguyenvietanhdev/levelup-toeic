import { useState, useEffect, useCallback, useRef } from 'react';
import { ToeicSeriesAPI } from '@api/toeicSeries.js';

/**
 * Danh mục bộ đề TOEIC. Lỗi mạng / chưa khai bộ nào đều trả mảng rỗng — nơi
 * dùng tự rơi về cách cũ (suy tên bộ từ tên đề), nên màn TOEIC không bao giờ
 * hỏng chỉ vì danh mục chưa sẵn sàng.
 *
 * Trả kèm `reload` để nút làm mới của màn TOEIC nạp lại được: sửa tên/thứ tự bộ
 * bên admin mà app chỉ fetch đúng một lần lúc mount thì bấm làm mới vẫn ra danh
 * mục cũ, phải F5 mới thấy — dễ tưởng thứ tự không có tác dụng.
 */
export function useToeicSeries() {
    const [series, setSeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const alive = useRef(true);

    // setState nằm trong .then chứ không gọi thẳng trong thân effect — gọi đồng
    // bộ sẽ kích thêm một lượt render thừa (react-hooks/set-state-in-effect).
    const reload = useCallback(() => (
        ToeicSeriesAPI.list().then((list) => {
            if (!alive.current) return;
            setSeries(list);
            setLoading(false);
        })
    ), []);

    useEffect(() => {
        alive.current = true;
        reload();
        return () => { alive.current = false; };
    }, [reload]);

    return { series, loading, reload };
}
