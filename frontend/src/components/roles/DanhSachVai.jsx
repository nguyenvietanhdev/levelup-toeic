import { useCallback, useEffect, useState } from 'react';
import { RolesAPI } from '@api/roles.js';

const TIEU_DE_TOI_THIEU = 2;
const MO_TA_TOI_THIEU = 10;
/**
 * Tạm ẩn mô tả tình huống trên thẻ vai (chỉ hiện tiêu đề), để danh sách gọn và
 * đỡ phải cuộn. Mô tả vẫn được lưu và dùng trong hội thoại; đặt true để hiện lại.
 */
const HIEN_MO_TA = false;

/**
 * Danh sách vai của Part đang học, nằm ở cột trái của màn Hội thoại.
 *
 *   · Vai đang dùng có viền dày màu nổi bật. Bấm một vai AI để chọn nó làm vai dùng.
 *   · Vai của bạn (nếu có) luôn là vai đang dùng; muốn dùng vai AI thì xoá vai riêng.
 *   · Mỗi thẻ có Sửa (tạo bản riêng để chỉnh) và Xoá.
 *     Xoá vai AI đồng nghĩa xoá nó khỏi danh sách của mọi người học Part này.
 */
export default function DanhSachVai({ source, part, lang }) {
    const [ds, setDs] = useState(null);       // { vai, ai } sau khi tải
    const [dang, setDang] = useState(false);
    const [loi, setLoi] = useState('');
    const [soan, setSoan] = useState(null);   // { id, tieuDe, moTa } đang sửa, hoặc null

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

    // Có vai riêng thì vai riêng là vai đang dùng; vai AI khoá chọn cho đến khi xoá vai riêng.
    const coVaiRieng = !!ds?.vai;
    const soTieuDe = (soan?.tieuDe || '').trim().length;
    const soMoTa = (soan?.moTa || '').trim().length;

    return (
        <div className="ai-role-list">
            {ds === null && !loi && <p className="tr-intro-note">Đang tải vai…</p>}

            {ds && !coVaiRieng && ds.ai.length === 0 && (
                <p className="tr-intro-note">
                    Chưa có vai cho Part này. Mở tab <strong>Vai AI</strong> để AI đề xuất và lưu một vai.
                </p>
            )}

            {ds?.vai && (
                <VaiCard
                    loai="user"
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
                    loai="ai"
                    dang={v.dang}
                    chonDuoc={!coVaiRieng && !v.dang}
                    onChon={() => lam(() => RolesAPI.saveAi({ source, part, lang, title: v.title, text: v.text }))}
                    title={v.title}
                    text={v.text}
                    onSua={() => setSoan({ id: null, tieuDe: v.title, moTa: v.text })}
                    onXoa={() => lam(() => RolesAPI.removeAi(v.id))}
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
                        placeholder="Vai trò, ví dụ: Lễ tân"
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

/**
 * Một thẻ vai. Icon nhỏ góc trên bên trái cho biết loại vai (AI hay của bạn).
 * Vai đang dùng có viền dày màu. Vai AI chưa dùng bấm được để chọn.
 */
function VaiCard({ loai, dang, chonDuoc = false, onChon, title, text, onSua, onXoa, dangLam }) {
    const bamDuoc = chonDuoc && !dangLam;
    // Mô tả có độ cao CỐ ĐỊNH (2 dòng). Quá dài thì cắt và hiện dấu "...", rê chuột
    // xem đủ nội dung. Không có nút mở rộng, nên bố cục các nút không bao giờ đổi.
    return (
        <div
            className={`ai-role-card${dang ? ' is-dang' : ''}${bamDuoc ? ' is-chon' : ''}`}
            onClick={bamDuoc ? onChon : undefined}
            title={bamDuoc ? 'Bấm để dùng vai này' : undefined}
        >
            <i
                className={`fas ${loai === 'user' ? 'fa-user' : 'fa-robot'} ai-role-icon`}
                title={loai === 'user' ? 'Vai của bạn' : 'Vai AI đã lưu'}
            ></i>
            <div className="ai-role-card-main">
                <p className="ai-role-title">{title || 'Vai'}</p>
                {HIEN_MO_TA && <p className="ai-role-text" title={text}>{text}</p>}
            </div>
            <div className="ai-role-card-actions" onClick={(e) => e.stopPropagation()}>
                {onSua && (
                    <button className="btn btn-secondary" disabled={dangLam} onClick={onSua}>
                        <i className="fas fa-pen"></i> Sửa
                    </button>
                )}
                {onXoa && (
                    <button className="btn btn-secondary" disabled={dangLam} onClick={onXoa}>
                        <i className="fas fa-trash"></i> Xoá
                    </button>
                )}
            </div>
        </div>
    );
}
