import { useEffect, useState } from 'react';
import { ConversationAPI } from '@api/conversation.js';
import { EssayAPI } from '@api/essay.js';
import { TranslationAPI } from '@api/translation.js';
import { ReadingAPI } from '@api/reading.js';
import { ListeningAPI } from '@api/listening.js';

/**
 * Tab "Lịch sử" dùng chung cho các màn AI: danh sách bài đã làm, bấm vào để
 * XEM LẠI đầy đủ (bài làm, kết quả chấm, lỗi, đáp án).
 *
 * Mỗi chế độ khai báo ở `CHE_DO`: cách tải danh sách, cách mở một bài, cách
 * hiện một dòng, và màn xem lại. Server lọc theo người dùng ở cả hai đường.
 */

const KHUNG_NGAY = (t) => (t ? new Date(t).toLocaleString('vi-VN') : '');
const MUC = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' };
const NHAN = ['A', 'B', 'C', 'D'];

/** Điểm hội thoại kèm Đạt / Chưa đạt. */
function DiemHoiThoai({ fb }) {
    if (!fb) return null;
    return (
        <>
            {fb.label} · {fb.overall}/9
            <em style={{ color: fb.dat ? '#16a34a' : '#dc2626' }}>{' '}{fb.dat ? 'Đạt' : 'Chưa đạt'}</em>
        </>
    );
}

const CHE_DO = {
    hoithoai: {
        tai: () => ConversationAPI.history(),
        xem: (id) => ConversationAPI.detail(id),
        dong: (r) => ({
            id: r.id,
            tieuDe: r.scenario || r.topic || 'Hội thoại tự do',
            phu: `dùng ${r.usedCount}/${r.totalTargets} từ`,
            diem: <DiemHoiThoai fb={r.feedback} />,
        }),
        ChiTiet: ({ bai }) => <ChiTietHoiThoai phien={bai} />,
    },
    viet: {
        tai: () => EssayAPI.history(),
        xem: (id) => EssayAPI.detail(id),
        dong: (r) => ({
            id: r._id,
            tieuDe: r.prompt || 'Bài viết',
            phu: `${r.wordCount || 0} từ`,
            diem: r.overall != null ? `${r.overall}/9` : null,
        }),
        ChiTiet: ({ bai }) => <ChiTietViet bai={bai} />,
    },
    dich: {
        tai: () => TranslationAPI.history(),
        xem: (id) => TranslationAPI.detail(id),
        dong: (r) => ({
            id: r._id,
            tieuDe: r.topic || String(r.passage || '').slice(0, 80) || 'Bài dịch',
            phu: [MUC[r.level], r.unitCount ? `${r.unitCount} từ` : ''].filter(Boolean).join(' · '),
            diem: r.overall != null ? `${r.overall}/9` : null,
        }),
        ChiTiet: ({ bai }) => <ChiTietDich bai={bai} />,
    },
    doc: {
        tai: () => ReadingAPI.history(),
        xem: (id) => ReadingAPI.detail(id),
        dong: (r) => ({
            id: r._id,
            tieuDe: r.title || 'Bài đọc',
            phu: MUC[r.level] || '',
            diem: `${r.correct ?? 0}/${r.total ?? 0} câu`,
        }),
        ChiTiet: ({ bai }) => <ChiTietDoc bai={bai} />,
    },
    nghe: {
        tai: () => ListeningAPI.history(),
        xem: (id) => ListeningAPI.detail(id),
        dong: (r) => ({
            id: r._id,
            tieuDe: r.dangVi || 'Nghe với AI',
            phu: [MUC[r.level], `${(r.targetWords || []).length} từ mục tiêu`].filter(Boolean).join(' · '),
            diem: `${r.score ?? 0}/100`,
        }),
        ChiTiet: ({ bai }) => <ChiTietNghe bai={bai} />,
    },
};

export default function LichSuMode({ mode }) {
    const cd = CHE_DO[mode];
    const [rows, setRows] = useState(null);       // null = đang tải
    const [chiTiet, setChiTiet] = useState(null); // bài đang xem lại
    const [dangMo, setDangMo] = useState('');     // id bài đang mở (hiện vòng quay)
    const [loi, setLoi] = useState('');

    useEffect(() => {
        setChiTiet(null);
        setLoi('');
        if (!cd) { setRows([]); return undefined; }
        setRows(null);
        let huy = false;
        cd.tai()
            .then((data) => { if (!huy) setRows(Array.isArray(data) ? data : []); })
            .catch((e) => { if (!huy) { setRows([]); setLoi(e?.message || 'Không tải được lịch sử'); } });
        return () => { huy = true; };
    }, [mode]);

    const xemBai = async (id) => {
        if (!id || dangMo) return;
        setDangMo(id);
        setLoi('');
        try {
            setChiTiet(await cd.xem(id));
        } catch (e) {
            setLoi(e?.message || 'Không mở được bài này');
        } finally {
            setDangMo('');
        }
    };

    if (!cd) return <p className="tr-intro-note">Chế độ này chưa có lịch sử.</p>;

    if (chiTiet) {
        const ChiTiet = cd.ChiTiet;
        return (
            <>
                <button className="btn btn-secondary" onClick={() => setChiTiet(null)} style={{ margin: '8px 0' }}>
                    <i className="fas fa-arrow-left"></i> Quay lại danh sách
                </button>
                <ChiTiet bai={chiTiet} />
            </>
        );
    }

    return (
        <>
            {loi && <p className="tr-intro-note">{loi}</p>}
            {rows === null ? (
                <p className="tr-intro-note"><i className="fas fa-spinner fa-spin"></i> Đang tải…</p>
            ) : rows.length === 0 ? (
                <p className="tr-intro-note">Chưa có bài nào. Hoàn thành một bài để thấy lịch sử ở đây.</p>
            ) : (
                <div className="ai-history-list">
                    {rows.map((r, i) => {
                        const d = cd.dong(r);
                        return (
                            <button key={d.id || i} className="ai-history-row" onClick={() => xemBai(d.id)} disabled={!!dangMo}>
                                <span className="ai-history-main">
                                    <strong>{d.tieuDe}</strong>
                                    <em>{KHUNG_NGAY(r.createdAt)}{d.phu ? ` · ${d.phu}` : ''}</em>
                                </span>
                                <span className="ai-history-score">
                                    {dangMo === d.id ? <i className="fas fa-spinner fa-spin"></i> : d.diem}
                                </span>
                            </button>
                        );
                    })}
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

/** Điểm từng tiêu chí (Viết, Dịch): nhãn tiếng Việt + điểm + nhận xét nếu có. */
function DiemTieuChi({ criteria = [], scores = {}, comments = {} }) {
    if (!criteria.length) return null;
    return (
        <div className="essay-criteria">
            {criteria.map((c) => (
                <div key={c.key} className="essay-criterion">
                    <div className="essay-criterion-head">
                        <strong>{scores?.[c.key] ?? '—'}</strong>
                        <span>{c.vi || c.label}</span>
                    </div>
                    {comments?.[c.key] && <p>{comments[c.key]}</p>}
                </div>
            ))}
        </div>
    );
}

/** Xem lại một bài viết: đề, bài đã viết, điểm từng tiêu chí, lỗi, gợi ý viết lại. */
function ChiTietViet({ bai }) {
    return (
        <div className="ai-history-detail ai-history-doc">
            <p className="tr-intro-note">{KHUNG_NGAY(bai.createdAt)} · {bai.wordCount || 0} từ</p>
            <div className="essay-section">
                <h4><i className="fas fa-file-lines"></i> Đề bài</h4>
                <p>{bai.prompt}</p>
            </div>
            <div className="essay-section">
                <h4><i className="fas fa-pen"></i> Bài của bạn</h4>
                <p className="ai-history-text">{bai.essay}</p>
            </div>
            <div className="essay-band">
                <div className="essay-band-num">{bai.overall}</div>
                <div className="essay-band-label">Điểm tổng /9</div>
            </div>
            <DiemTieuChi criteria={bai.criteria} scores={bai.scores} comments={bai.comments} />
            {bai.strengths?.length > 0 && (
                <div className="essay-section">
                    <h4><i className="fas fa-thumbs-up"></i> Làm tốt</h4>
                    <ul>{bai.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
            )}
            {bai.issues?.length > 0 && (
                <div className="essay-section">
                    <h4><i className="fas fa-triangle-exclamation"></i> Lỗi cần sửa</h4>
                    {bai.issues.map((e, i) => (
                        <div key={i} className="essay-issue">
                            {e?.quote && <code>{e.quote}</code>}
                            <div className="essay-issue-note">{e?.issue}</div>
                            {e?.fix && <div className="essay-issue-fix">→ {e.fix}</div>}
                        </div>
                    ))}
                </div>
            )}
            {bai.improved && (
                <div className="essay-section">
                    <h4><i className="fas fa-wand-magic-sparkles"></i> Gợi ý viết lại</h4>
                    <p className="essay-improved">{bai.improved}</p>
                </div>
            )}
        </div>
    );
}

/** Xem lại một bài dịch: đoạn gốc, bản dịch, điểm, lỗi, bản dịch tham khảo. */
function ChiTietDich({ bai }) {
    return (
        <div className="ai-history-detail ai-history-doc">
            <p className="tr-intro-note">
                {KHUNG_NGAY(bai.createdAt)}{bai.level ? ` · ${MUC[bai.level] || bai.level}` : ''}
            </p>
            <div className="essay-section">
                <h4><i className="fas fa-file-lines"></i> Đoạn văn cần dịch</h4>
                <p className="ai-history-text">{bai.passage}</p>
            </div>
            <div className="essay-section">
                <h4><i className="fas fa-language"></i> Bản dịch của bạn</h4>
                <p className="ai-history-text">{bai.translation}</p>
            </div>
            <div className="essay-band">
                <div className="essay-band-num">{bai.overall}</div>
                <div className="essay-band-label">Điểm tổng /9</div>
            </div>
            <DiemTieuChi criteria={bai.criteria} scores={bai.scores} />
            {bai.summary && <p className="tr-summary">{bai.summary}</p>}
            {bai.notes?.length > 0 && (
                <div className="essay-section">
                    <h4><i className="fas fa-triangle-exclamation"></i> Chỗ cần sửa</h4>
                    {bai.notes.map((n, i) => (
                        <div key={i} className="essay-issue">
                            {n.quote && <code>{n.quote}</code>}
                            <div className="essay-issue-note">{n.issue}</div>
                            {n.better && <div className="essay-issue-fix">→ {n.better}</div>}
                        </div>
                    ))}
                </div>
            )}
            {bai.reference && (
                <div className="essay-section">
                    <h4><i className="fas fa-book"></i> Bản dịch tham khảo</h4>
                    <p className="essay-improved">{bai.reference}</p>
                </div>
            )}
        </div>
    );
}

/** Xem lại một bài đọc: đoạn văn, từng câu hỏi với đáp án đúng và đáp án đã chọn. */
function ChiTietDoc({ bai }) {
    return (
        <div className="ai-history-detail ai-history-doc">
            <p className="tr-intro-note">
                {KHUNG_NGAY(bai.createdAt)} · Đúng <strong>{bai.correct ?? 0}/{bai.total ?? (bai.questions || []).length}</strong> câu
            </p>
            <div className="rd-passage">
                <div className="essay-prompt-head"><span>{bai.title || 'Bài đọc'}</span></div>
                <p className="rd-passage-text">{bai.passage}</p>
            </div>
            <div className="rd-questions">
                {(bai.questions || []).map((q, i) => {
                    const dung = q.chose && q.chose === q.answer;
                    return (
                        <div key={i} className={`rd-q${dung ? ' is-right' : ' is-wrong'}`}>
                            <div className="rd-q-text"><span className="rd-q-num">{i + 1}</span>{q.question}</div>
                            <div className="rd-opts">
                                {(q.options || []).map((opt, k) => {
                                    const nhan = NHAN[k];
                                    const laDapAn = q.answer === nhan;
                                    const chonSai = q.chose === nhan && !laDapAn;
                                    return (
                                        <div
                                            key={k}
                                            className={`rd-opt${q.chose === nhan ? ' is-picked' : ''}${laDapAn ? ' is-right' : ''}${chonSai ? ' is-wrong' : ''}`}
                                        >
                                            <span className="rd-opt-label">{nhan}</span>
                                            <span>{opt}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            {!q.chose && <p className="rd-explain">Bạn bỏ trống câu này.</p>}
                            {q.explain && <p className="rd-explain"><i className="fas fa-lightbulb"></i> {q.explain}</p>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** Xem lại một lượt nghe: điểm, từ bỏ sót / gõ thừa, đoạn gốc, bài đã gõ. */
function ChiTietNghe({ bai }) {
    const kq = bai.ketQua || {};
    return (
        <div className="ai-history-detail ai-history-doc">
            <p className="tr-intro-note">
                {KHUNG_NGAY(bai.createdAt)}{bai.dangVi ? ` · ${bai.dangVi}` : ''}{bai.level ? ` · ${MUC[bai.level] || bai.level}` : ''}
            </p>
            <div className="essay-band">
                <div className="essay-band-num">{bai.score ?? kq.score ?? 0}</div>
                <div className="essay-band-label">Điểm /100 · đúng {kq.correct ?? 0}/{kq.total ?? 0} từ</div>
            </div>
            {kq.missing?.length > 0 && <p className="tr-intro-note"><strong>Bỏ sót:</strong> {kq.missing.join(', ')}</p>}
            {kq.extra?.length > 0 && <p className="tr-intro-note"><strong>Gõ thừa:</strong> {kq.extra.join(', ')}</p>}
            <div className="essay-section">
                <h4><i className="fas fa-headphones"></i> Đoạn gốc</h4>
                <p className="listening-passage">{bai.passage}</p>
            </div>
            <div className="essay-section">
                <h4><i className="fas fa-keyboard"></i> Bạn đã gõ</h4>
                <p className="ai-history-text">{bai.typed || '(trống)'}</p>
            </div>
        </div>
    );
}
