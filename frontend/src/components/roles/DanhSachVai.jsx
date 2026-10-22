import { useCallback, useEffect, useState } from 'react';
import { RolesAPI } from '@api/roles.js';

const TIEU_DE_TOI_THIEU = 2;
const MO_TA_TOI_THIEU = 10;

/**
 * Danh sách vai của Part đang học, hiện ngay ở phần giới thiệu của mọi chế độ AI.
 *
 *   · Vai của bạn: sửa được, xoá được.
 *   · Vai AI đã lưu: dùng chung nên KHÔNG xoá từ đây. "Dùng" đưa nó lên làm vai
 *     đang dùng; "Sửa" tạo một bản riêng của bạn để chỉnh.
 */
export default function DanhSachVai({ source, part, lang }) {
    const [ds, setDs] = useState(null);       // { vai, ai } sau khi tải
    const [dang, setDang] = useState(false);
    const [loi, setLoi] = useState('');
    const [soan, setSoan] = useState(null);   // { tieuDe, moTa } đang sửa, hoặc null

    const coPart = !!(source && part);

    const tai = useCallback(async () => {
        if (!coPart) return;
        try {
            setDs(await RolesAPI.list({ source, part, lang }));
        } catch (e) {
            setLoi(e.message);
        }
    }, [source, part, lang, coPart]);

    useEffect(() => {
        setSoan(null);
        setLoi('');
        setDs(null);
        tai();
    }, [tai]);

    const lam = async (fn, thanhCong) => {
        setDang(true);
        setLoi('');
        try {
            await fn();
            if (thanhCong) setSoan(null);
            await tai();
        } catch (e) {
            setLoi(e.message);
        } finally {
            setDang(false);
        }
    };

    if (!coPart) return null;

    const co = !!(ds && (ds.vai || ds.ai.length));
    const soTieuDe = (soan?.tieuDe || '').trim().length;
    const soMoTa = (soan?.moTa || '').trim().length;

    return (
        <div className="ai-role-list">
            <div className="ai-role-list-head">
                <span>Vai của Part <strong>{part}</strong></span>
            </div>

            {ds === null && !loi && <p className="tr-intro-note">Đang tải vai…</p>}

            {ds && !co && (
                <p className="tr-intro-note">
                    Chưa có vai cho Part này. Mở tab <strong>Vai AI</strong> để AI đề xuất và lưu một vai.
                </p>
            )}

            {ds?.vai && (
                <VaiCard
                    tag="Vai của bạn"
                    dang
                    title={ds.vai.title}
                    text={ds.vai.text}
                    onSua={() => setSoan({ id: ds.vai.id, tieuDe: ds.vai.title, moTa: ds.vai.text })}
                    onXoa={() => lam(() => RolesAPI.remove({ source, part, lang }), 'Đã xoá vai của bạn.')}
                    dangLam={dang}
                />
            )}

            {ds?.ai.map((v) => (
                <VaiCard
                    key={v.id}
                    tag="Vai AI đã lưu"
                    dang={v.dang}
                    title={v.title}
                    text={v.text}
                    onDung={!v.dang && !ds.vai
                        ? () => lam(() => RolesAPI.saveAi({ source, part, lang, title: v.title, text: v.text }))
                        : null}
                    onSua={() => setSoan({ id: null, tieuDe: v.title, moTa: v.text })}
                    onXoa={null}
                    dangLam={dang}
                />
            ))}

            {soan && (
                <div className="ai-role-editor">
                    <div className="ai-role-tag">{soan.id ? 'Sửa vai của bạn' : 'Tạo bản riêng từ vai này'}</div>
                    <input
                        className="ai-role-input-title"
                        value={soan.tieuDe}
                        maxLength={80}
                        onChange={(e) => setSoan({ ...soan, tieuDe: e.target.value })}
                        placeholder="Tiêu đề"
                    />
                    <textarea
                        className="ai-role-input"
                        rows={3}
                        maxLength={400}
                        value={soan.moTa}
                        onChange={(e) => setSoan({ ...soan, moTa: e.target.value })}
                        placeholder="Mô tả ngắn"
                    />
                    <div className="ai-role-actions">
                        <button
                            className="btn btn-primary"
                            disabled={dang || soMoTa < MO_TA_TOI_THIEU || soTieuDe < TIEU_DE_TOI_THIEU}
                            onClick={() => lam(
                                () => RolesAPI.save({ source, part, lang, title: soan.tieuDe, text: soan.moTa }),
                                'Đã lưu vai của bạn.',
                            )}
                        >
                            <i className="fas fa-floppy-disk"></i> Lưu vai của tôi
                        </button>
                        <button className="btn btn-secondary" disabled={dang} onClick={() => setSoan(null)}>
                            Hủy
                        </button>
                    </div>
                </div>
            )}

            {loi && <p className="ai-role-loi">{loi}</p>}
        </div>
    );
}

/** Một thẻ vai với các nút phù hợp. Nút nào không áp dụng thì không hiện. */
function VaiCard({ tag, dang, title, text, onDung, onSua, onXoa, dangLam }) {
    return (
        <div className={`ai-role-card${dang ? ' is-dang' : ''}`}>
            <div className="ai-role-card-main">
                <div className="ai-role-tag">
                    {tag}{dang ? ' · đang dùng' : ''}
                </div>
                <p className="ai-role-title">{title || 'Vai'}</p>
                <p className="ai-role-text">{text}</p>
            </div>
            <div className="ai-role-card-actions">
                {onDung && (
                    <button className="btn btn-secondary" disabled={dangLam} onClick={onDung}>Dùng</button>
                )}
                {onSua && (
                    <button className="btn btn-secondary" disabled={dangLam} onClick={onSua}>
                        <i className="fas fa-pen"></i> Sửa
                    </button>
                )}
                {onXoa ? (
                    <button className="btn btn-secondary" disabled={dangLam} onClick={onXoa}>
                        <i className="fas fa-trash"></i> Xoá
                    </button>
                ) : (
                    tag === 'Vai AI đã lưu' && (
                        <span className="ai-role-note" title="Vai AI dùng chung, không xoá từ đây">Dùng chung</span>
                    )
                )}
            </div>
        </div>
    );
}
