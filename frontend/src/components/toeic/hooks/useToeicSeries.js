import { useState, useEffect } from 'react';
import { ToeicSeriesAPI } from '@api/toeicSeries.js';

/**
 * Danh mục bộ đề TOEIC. Lỗi mạng / chưa khai bộ nào đều trả mảng rỗng — nơi
 * dùng tự rơi về cách cũ (suy tên bộ từ tên đề), nên màn TOEIC không bao giờ
 * hỏng chỉ vì danh mục chưa sẵn sàng.
 */
export function useToeicSeries() {
    const [series, setSeries] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        ToeicSeriesAPI.list().then((list) => {
            if (!alive) return;
            setSeries(list);
            setLoading(false);
        });
        return () => { alive = false; };
    }, []);

    return { series, loading };
}
