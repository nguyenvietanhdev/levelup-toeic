import { useState, useEffect, useCallback } from 'react';
import { TranslationAPI } from '@api/translation.js';

/**
 * NHẬT KÝ LỖI NGỮ PHÁP — gom lỗi từ mọi bài AI đã chấm.
 *
 * Đây là thứ ChatGPT không làm được cho người học: nó không nhớ họ đã sai gì
 * tháng trước. Ba chế độ AI trong app đang chấm bài rồi vứt hết lỗi đi; gom lại
 * thì trả lời được câu người học thật sự cần — "tôi hay sai gì nhất, và luyện
 * gì để hết".
 *
 * Mỗi nhóm hiện kèm VÍ DỤ THẬT của chính người học: "bạn sai mạo từ 14 lần"
 * không dạy được gì nếu không thấy lại câu mình đã viết.
 */

/** Khoảng thời gian xét. Lỗi quá cũ có thể đã sửa được rồi. */
const KHOANG = [
    { days: 30, label: '30 ngày' },
    { days: 90, label: '3 tháng' },
    { days: 365, label: '1 năm' },
];

export default function MistakeLog() {
    const [days, setDays] = useState(90);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    // Nhóm đang mở để xem ví dụ. Chỉ một nhóm mở tại một thời điểm: mở hết thì
    // danh sách dài ra và mất luôn cái nhìn tổng quan vốn là mục đích của màn này.
    const [moNhom, setMoNhom] = useState('');

    const nap = useCallback(async (soNgay) => {
        setLoading(true);
        setErr('');
        try {
            const d = await TranslationAPI.mistakes(soNgay);
            setData(d);
        } catch (e) {
            setErr(String(e?.message || 'Không tải được nhật ký lỗi'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { nap(days); }, [days, nap]);

    if (loading && !data) {
        return (
            <div className="ml-empty">
                <i className="fas fa-spinner fa-spin"></i> Đang tổng hợp…
            </div>
        );
    }

    if (err) {
        return (
            <div className="ml-empty">
                <i className="fas fa-triangle-exclamation"></i> {err}
                <button className="btn btn-secondary" onClick={() => nap(days)}>Thử lại</button>
            </div>
        );
    }

    const stats = data?.stats || [];
    // Nhóm nhiều nhất, để tính bề rộng thanh. Không có thì mọi thanh đầy 100%
    // và biểu đồ thôi không nói lên gì.
    const nhieuNhat = stats[0]?.count || 1;

    return (
        <div className="mistake-log">
            <div className="ml-head">
                <div>
                    <h3><i className="fas fa-clipboard-list"></i> Nhật ký lỗi</h3>
                    <p>
                        Gom từ mọi bài Dịch và Viết luận đã chấm.
                        {data?.total ? ` ${data.total} lỗi trong ${data.days} ngày qua.` : ''}
                    </p>
                </div>
                <div className="ml-range">
                    {KHOANG.map((k) => (
                        <button
                            key={k.days}
                            className={`ml-range-btn${days === k.days ? ' is-on' : ''}`}
                            onClick={() => setDays(k.days)}
                        >
                            {k.label}
                        </button>
                    ))}
                </div>
            </div>

            {!stats.length ? (
                // Không có lỗi nào KHÔNG phải là tin xấu — nói rõ, thay vì để
                // một màn trống làm người dùng tưởng tính năng hỏng.
                <div className="ml-empty">
                    <i className="fas fa-seedling"></i>
                    <p>Chưa có dữ liệu trong {days} ngày qua.</p>
                    <p className="ml-empty-hint">
                        Làm vài bài Dịch đoạn văn hoặc Viết luận — lỗi AI tìm ra sẽ
                        được gom về đây.
                    </p>
                </div>
            ) : (
                <div className="ml-list">
                    {stats.map((s) => {
                        const dangMo = moNhom === s.key;
                        const viDu = data?.examples?.[s.key] || [];
                        return (
                            <div key={s.key} className={`ml-item${dangMo ? ' is-open' : ''}`}>
                                <button
                                    className="ml-row"
                                    onClick={() => setMoNhom(dangMo ? '' : s.key)}
                                    aria-expanded={dangMo}
                                >
                                    <span className="ml-name">{s.vi}</span>
                                    {/* Thanh dài theo tỉ lệ với nhóm nhiều nhất: con số
                                        đứng một mình không cho thấy "14" là nhiều hay ít
                                        so với các lỗi khác. */}
                                    <span className="ml-bar">
                                        <span
                                            className="ml-bar-fill"
                                            style={{ width: `${Math.round((s.count / nhieuNhat) * 100)}%` }}
                                        />
                                    </span>
                                    <span className="ml-count">{s.count}</span>
                                    <i className={`fas fa-chevron-${dangMo ? 'up' : 'down'} ml-caret`}></i>
                                </button>

                                {dangMo && (
                                    <div className="ml-detail">
                                        {s.hint && (
                                            <p className="ml-hint">
                                                <i className="fas fa-lightbulb"></i> {s.hint}
                                            </p>
                                        )}
                                        {viDu.length > 0 ? (
                                            viDu.map((v, i) => (
                                                <div key={i} className="ml-example">
                                                    {v.quote && <code>{v.quote}</code>}
                                                    {v.issue && <div className="ml-example-issue">{v.issue}</div>}
                                                    {v.fix && <div className="ml-example-fix">→ {v.fix}</div>}
                                                </div>
                                            ))
                                        ) : (
                                            <p className="ml-example-empty">
                                                Chưa lưu được ví dụ cụ thể cho nhóm này.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
