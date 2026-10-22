import { useEffect, useState } from 'react';
import { ConversationAPI } from '@api/conversation.js';
import { EssayAPI } from '@api/essay.js';

/**
 * Tab "Lịch sử" dùng chung cho các màn AI (giống "Nhật ký lỗi" của Dịch đoạn văn).
 *
 * Chỉ hiện những gì app THẬT SỰ đã lưu:
 *   · hoithoai — danh sách + xem lại đầy đủ lời thoại và kết quả chấm.
 *   · viet     — danh sách bài đã chấm (chưa xem lại được bài viết).
 *   · dich, doc — chưa lưu lịch sử, nên ghi rõ thay vì để trống.
 */
const CHUA_LUU = { dich: 'Dịch đoạn văn', doc: 'Đọc hiểu Part 7' };

const KHUNG_NGAY = (t) => (t ? new Date(t).toLocaleString('vi-VN') : '');

export default function LichSuMode({ mode }) {
    const [rows, setRows] = useState(null);       // null = đang tải
    const [chiTiet, setChiTiet] = useState(null); // phiên hội thoại đang xem
    const [loi, setLoi] = useState('');

    useEffect(() => {
        setChiTiet(null);
        setLoi('');
        if (CHUA_LUU[mode]) { setRows([]); return; }
        setRows(null);
        let huy = false;
        const tai = mode === 'hoithoai' ? ConversationAPI.history() : EssayAPI.history();
        tai.then((data) => { if (!huy) setRows(Array.isArray(data) ? data : []); })
            .catch((e) => { if (!huy) { setRows([]); setLoi(e?.message || 'Không tải được lịch sử'); } });
        return () => { huy = true; };
    }, [mode]);

    const xemPhien = async (id) => {
        try {
            setChiTiet(await ConversationAPI.detail(id));
        } catch (e) {
            setLoi(e?.message || 'Không mở được phiên này');
        }
    };

    if (CHUA_LUU[mode]) {
        return (
            <p className="tr-intro-note">
                {CHUA_LUU[mode]} chưa lưu lịch sử, nên chưa có gì để xem lại.
            </p>
        );
    }

    if (mode === 'hoithoai' && chiTiet) {
        return (
            <>
                <button className="btn btn-secondary" onClick={() => setChiTiet(null)} style={{ margin: '8px 0' }}>
                    <i className="fas fa-arrow-left"></i> Quay lại danh sách
                </button>
                <ChiTietHoiThoai phien={chiTiet} />
            </>
        );
    }

    return (
        <>
            {loi && <p className="tr-intro-note">{loi}</p>}
            {rows === null ? (
                <p className="tr-intro-note"><i className="fas fa-spinner fa-spin"></i> Đang tải…</p>
            ) : rows.length === 0 ? (
                <p className="tr-intro-note">Chưa có phiên nào. Hoàn thành một phiên để thấy lịch sử ở đây.</p>
            ) : mode === 'hoithoai' ? (
                <div className="ai-history-list">
                    {rows.map((r) => (
                        <button key={r.id} className="ai-history-row" onClick={() => xemPhien(r.id)}>
                            <span className="ai-history-main">
                                <strong>{r.scenario || r.topic || 'Hội thoại tự do'}</strong>
                                <em>{KHUNG_NGAY(r.createdAt)} · dùng {r.usedCount}/{r.totalTargets} từ</em>
                            </span>
                            {r.feedback && (
                                <span className="ai-history-score">
                                    {r.feedback.label} · {r.feedback.overall}/9
                                    <em style={{ color: r.feedback.dat ? '#16a34a' : '#dc2626' }}>
                                        {' '}{r.feedback.dat ? 'Đạt' : 'Chưa đạt'}
                                    </em>
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            ) : (
                <div className="ai-history-list">
                    {rows.map((r, i) => (
                        <div key={r._id || i} className="ai-history-row">
                            <span className="ai-history-main">
                                <strong>{r.prompt || 'Bài viết'}</strong>
                                <em>{KHUNG_NGAY(r.createdAt)} · {r.wordCount || 0} từ</em>
                            </span>
                            {r.overall != null && <span className="ai-history-score">{r.overall}/9</span>}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}

/** Xem lại một phiên hội thoại: tình huống, kết quả chấm, lời thoại. */
function ChiTietHoiThoai({ phien }) {
    // Hai cột: trái là đoạn chat (bong bóng như màn luyện), phải là nhận xét.
    // Trên màn hẹp hai cột xếp chồng (xem CSS `.ai-history-split`).
    return (
        <div className="ai-history-detail">
            <p className="tr-intro-note">
                {KHUNG_NGAY(phien.createdAt)}
                {phien.scenario ? ` · Tình huống: ${phien.scenario}` : ''}
            </p>

            <div className="ai-history-split">
                <div className="ai-history-chat">
                    {phien.turns.map((t, i) => (
                        <div key={i} className={`ai-history-bubble ai-history-bubble--${t.role === 'user' ? 'user' : 'npc'}`}>
                            <span className="ai-history-who">{t.role === 'user' ? 'Bạn' : 'AI'}</span>
                            <p>{t.content}</p>
                        </div>
                    ))}
                </div>

                <div className="ai-history-feedback">
                    {!phien.feedback && (
                        <p className="tr-intro-note">Phiên này chưa có kết quả chấm.</p>
                    )}
                    {phien.feedback && (
                <div className="convo-feedback">
                    <div className="convo-feedback-head">
                        Chấm theo <strong>{phien.feedback.label}</strong> · trung bình <strong>{phien.feedback.overall}</strong>/9
                        {phien.feedback.muc && (
                            <> · Mức <strong>{phien.feedback.muc}</strong>:{' '}
                                <strong style={{ color: phien.feedback.dat ? '#16a34a' : '#dc2626' }}>
                                    {phien.feedback.dat ? 'Đạt' : 'Chưa đạt'}
                                </strong> (ngưỡng {phien.feedback.nguong}/9)
                            </>
                        )}
                    </div>
                    {phien.feedback.criteria.map((c) => (
                        <div key={c.key} className="convo-feedback-row">
                            <span className="convo-feedback-label">{c.label}</span>
                            <strong>{c.score ?? '—'}</strong>/9
                            {c.comment && <span className="convo-feedback-note"> — {c.comment}</span>}
                        </div>
                    ))}
                    {phien.feedback.summary && <p className="convo-feedback-summary">{phien.feedback.summary}</p>}
                </div>
                    )}
                </div>
            </div>
        </div>
    );
}
