import { useEffect, useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { ConversationAPI } from '@api/conversation.js';
import { EssayAPI } from '@api/essay.js';

/**
 * Lịch sử các chế độ AI, chia TAB theo chế độ.
 *
 * Mỗi tab chỉ hiện những gì app THẬT SỰ đã lưu:
 *   · Hội thoại — danh sách + xem lại đầy đủ lời thoại và kết quả chấm.
 *   · Luyện viết — danh sách bài đã chấm (chưa xem lại được bài viết).
 *   · Dịch đoạn văn, Đọc hiểu — chưa lưu lịch sử, nên ghi rõ thay vì để trống.
 */
const TAB = [
    { key: 'hoithoai', label: 'Hội thoại' },
    { key: 'viet', label: 'Luyện viết' },
    { key: 'dich', label: 'Dịch đoạn văn', chuaLuu: true },
    { key: 'doc', label: 'Đọc hiểu Part 7', chuaLuu: true },
];

const KHUNG_NGAY = (t) => (t ? new Date(t).toLocaleString('vi-VN') : '');

export default function HistoryScreen({ active }) {
    const { showScreen } = useGame();
    const [tab, setTab] = useState('hoithoai');
    const [rows, setRows] = useState(null);      // null = đang tải
    const [chiTiet, setChiTiet] = useState(null); // phiên hội thoại đang xem
    const [loi, setLoi] = useState('');

    useEffect(() => {
        if (!active) return;
        setChiTiet(null);
        setLoi('');
        setRows(null);
        let huy = false;
        const tai = tab === 'hoithoai'
            ? ConversationAPI.history()
            : tab === 'viet'
                ? EssayAPI.history()
                : Promise.resolve([]);
        tai.then((data) => { if (!huy) setRows(Array.isArray(data) ? data : []); })
            .catch((e) => { if (!huy) { setRows([]); setLoi(e?.message || 'Không tải được lịch sử'); } });
        return () => { huy = true; };
    }, [tab, active]);

    const xemPhien = async (id) => {
        try {
            setChiTiet(await ConversationAPI.detail(id));
        } catch (e) {
            setLoi(e?.message || 'Không mở được phiên này');
        }
    };

    const dangTab = TAB.find((t) => t.key === tab);

    return (
        <div id="history-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => (chiTiet ? setChiTiet(null) : showScreen('home-screen'))}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-clock-rotate-left"></i> Lịch sử AI</h2>
            </div>

            <div className="tr-levels">
                {TAB.map((t) => (
                    <button
                        key={t.key}
                        className={`tr-level${tab === t.key ? ' is-on' : ''}`}
                        onClick={() => setTab(t.key)}
                    >
                        <strong>{t.label}</strong>
                    </button>
                ))}
            </div>

            {loi && <p className="tr-intro-note">{loi}</p>}

            {dangTab?.chuaLuu ? (
                <p className="tr-intro-note">
                    Chế độ này chưa lưu lịch sử, nên chưa có gì để xem lại.
                </p>
            ) : chiTiet ? (
                <ChiTietHoiThoai phien={chiTiet} />
            ) : rows === null ? (
                <p className="tr-intro-note"><i className="fas fa-spinner fa-spin"></i> Đang tải…</p>
            ) : rows.length === 0 ? (
                <p className="tr-intro-note">Chưa có phiên nào. Hoàn thành một phiên để thấy lịch sử ở đây.</p>
            ) : tab === 'hoithoai' ? (
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
        </div>
    );
}

/** Xem lại một phiên hội thoại: tình huống, lời thoại, kết quả chấm. */
function ChiTietHoiThoai({ phien }) {
    return (
        <div className="ai-history-detail">
            <p className="tr-intro-note">
                {KHUNG_NGAY(phien.createdAt)}
                {phien.scenario ? ` · Tình huống: ${phien.scenario}` : ''}
            </p>

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

            <div className="ai-history-turns">
                {phien.turns.map((t, i) => (
                    <div key={i} className={`ai-history-turn ai-history-turn--${t.role}`}>
                        <span>{t.role === 'user' ? 'Bạn' : 'AI'}</span>
                        <p>{t.content}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
