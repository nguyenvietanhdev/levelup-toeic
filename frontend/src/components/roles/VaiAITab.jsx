import { useCallback, useEffect, useState } from 'react';
import { RolesAPI } from '@api/roles.js';

const TIEU_DE_TOI_THIEU = 2;
const TIEU_DE_TOI_DA = 80;
const MO_TA_TOI_THIEU = 10;
const MO_TA_TOI_DA = 400;

/** Nhãn nguồn của vai đang áp dụng. */
const NHAN_NGUON = {
    user: 'Vai của bạn',
    ai: 'Vai AI đã lưu',
};

/**
 * Tab "Vai AI" của một màn AI: đặt vai cho Part đang học.
 *
 * Mỗi vai có TIÊU ĐỀ (để nhận ra) và MÔ TẢ NGẮN (AI đóng vai ai, nói với ai).
 *   · "AI đề xuất" chỉ tạo BẢN NHÁP trên màn hình — chưa lưu.
 *   · "Lưu vai AI" mới lưu bản nháp đó cho Part. Mỗi lần lưu là một vai riêng,
 *     trùng nội dung thì không lưu thêm.
 *   · Vai người học tự viết thay vai AI của Part với riêng họ.
 */
export default function VaiAITab({ source, part, lang }) {
    const [vai, setVai] = useState(null);      // vai đang áp dụng: { title, vai, nguon }
    const [banNhap, setBanNhap] = useState(null); // bản nháp AI, chưa lưu: { title, vai }
    const [dang, setDang] = useState(false);
    const [tieuDe, setTieuDe] = useState('');  // ô người học tự viết
    const [moTa, setMoTa] = useState('');
    const [thongBao, setThongBao] = useState(null); // { loai: 'ok'|'loi', noi }

    const coPart = !!(source && part);

    const tai = useCallback(async () => {
        if (!coPart) return;
        setDang(true);
        try {
            setVai(await RolesAPI.get({ source, part, lang }));
        } catch (e) {
            setThongBao({ loai: 'loi', noi: e.message });
        } finally {
            setDang(false);
        }
    }, [source, part, lang, coPart]);

    useEffect(() => {
        // Đổi đề hoặc Part thì bản nháp và ô nhập của Part cũ không còn áp dụng.
        setThongBao(null);
        setBanNhap(null);
        setTieuDe('');
        setMoTa('');
        tai();
    }, [tai]);

    const thucHien = async (fn, thanhCong) => {
        setDang(true);
        setThongBao(null);
        try {
            const kq = await fn();
            return kq;
        } catch (e) {
            setThongBao({ loai: 'loi', noi: e.message });
            return undefined;
        } finally {
            setDang(false);
            if (thanhCong) setThongBao((t) => (t?.loai === 'loi' ? t : { loai: 'ok', noi: thanhCong }));
        }
    };

    if (!coPart) {
        return (
            <p className="tr-intro-note">
                Chọn đề và Part ở thanh trên để đặt vai cho Part đó.
            </p>
        );
    }

    const nguon = vai?.nguon || null;
    const soTieuDe = tieuDe.trim().length;
    const soMoTa = moTa.trim().length;

    return (
        <div className="ai-role">
            <p className="tr-intro-note">
                Part <strong>{part}</strong> · đề <strong>{source}</strong>
            </p>

            {/* Vai đang áp dụng cho Part này */}
            <div className="ai-role-current">
                <div className="ai-role-tag">
                    {nguon ? NHAN_NGUON[nguon] : 'Chưa có vai cho Part này'}
                </div>
                {vai?.vai ? (
                    <>
                        <p className="ai-role-title">{vai.title || 'Vai'}</p>
                        <p className="ai-role-text">{vai.vai}</p>
                    </>
                ) : (
                    <p className="ai-role-text">
                        {dang ? 'Đang tải…' : 'Chưa có vai. Bấm “AI đề xuất” hoặc tự viết một vai bên dưới.'}
                    </p>
                )}
            </div>

            {/* Bản nháp AI: chưa lưu, người học xem rồi mới quyết định */}
            {banNhap && (
                <div className="ai-role-draft">
                    <div className="ai-role-tag">Bản nháp AI — chưa lưu</div>
                    <p className="ai-role-title">{banNhap.title}</p>
                    <p className="ai-role-text">{banNhap.vai}</p>
                    <div className="ai-role-actions">
                        <button
                            className="btn btn-primary"
                            disabled={dang}
                            onClick={async () => {
                                const kq = await thucHien(() => RolesAPI.saveAi({
                                    source, part, lang, title: banNhap.title, text: banNhap.vai,
                                }), 'Đã lưu vai AI. Vai này đang dùng cho Part này.');
                                if (kq) {
                                    setBanNhap(null);
                                    setVai(await RolesAPI.get({ source, part, lang }));
                                }
                            }}
                        >
                            <i className="fas fa-floppy-disk"></i> Lưu vai AI
                        </button>
                        <button className="btn btn-secondary" disabled={dang} onClick={() => setBanNhap(null)}>
                            Bỏ bản nháp
                        </button>
                    </div>
                </div>
            )}

            <div className="ai-role-actions">
                <button
                    className="btn btn-secondary"
                    disabled={dang}
                    onClick={async () => {
                        const kq = await thucHien(() => RolesAPI.suggest({ source, part, lang }));
                        if (kq) setBanNhap({ title: kq.title, vai: kq.vai });
                    }}
                >
                    <i className="fas fa-wand-magic-sparkles"></i> AI đề xuất
                </button>
                {/* Luôn hiện khi có vai. Chỉ xoá được vai RIÊNG; vai AI đã lưu là dùng
                    chung nên không xoá từ đây. */}
                {nguon && (
                    <button
                        className="btn btn-secondary"
                        disabled={dang || nguon !== 'user'}
                        title={nguon === 'user' ? 'Xoá vai riêng, quay về vai AI' : 'Vai AI đã lưu dùng chung, không xoá'}
                        onClick={async () => {
                            const kq = await thucHien(async () => {
                                await RolesAPI.remove({ source, part, lang });
                                return RolesAPI.get({ source, part, lang });
                            }, 'Đã xoá vai của bạn, quay về vai AI.');
                            if (kq) setVai(kq);
                        }}
                    >
                        <i className="fas fa-trash"></i> Xoá vai của tôi
                    </button>
                )}
            </div>

            {/* Người học tự viết vai: tiêu đề + mô tả ngắn */}
            <label className="ai-role-label">Tự viết vai của bạn</label>
            <input
                className="ai-role-input-title"
                value={tieuDe}
                onChange={(e) => setTieuDe(e.target.value)}
                maxLength={TIEU_DE_TOI_DA}
                placeholder="Tiêu đề, ví dụ: Strict auditor"
            />
            <textarea
                className="ai-role-input"
                value={moTa}
                onChange={(e) => setMoTa(e.target.value)}
                maxLength={MO_TA_TOI_DA}
                rows={3}
                placeholder="Mô tả ngắn, ví dụ: A strict auditor reviewing my monthly ledger."
            />
            <div className="ai-role-foot">
                <span>Tiêu đề {soTieuDe}/{TIEU_DE_TOI_DA} · Mô tả {soMoTa}/{MO_TA_TOI_DA}</span>
                <button
                    className="btn btn-primary"
                    disabled={dang || soTieuDe < TIEU_DE_TOI_THIEU || soMoTa < MO_TA_TOI_THIEU}
                    onClick={async () => {
                        const kq = await thucHien(() => RolesAPI.save({
                            source, part, lang, title: tieuDe, text: moTa,
                        }), 'Đã lưu vai của bạn. Phiên mới sẽ dùng vai này.');
                        if (kq) {
                            setTieuDe('');
                            setMoTa('');
                            setVai(kq);
                        }
                    }}
                >
                    <i className="fas fa-floppy-disk"></i> Lưu vai của tôi
                </button>
            </div>

            {thongBao && (
                <p className={thongBao.loai === 'ok' ? 'ai-role-ok' : 'ai-role-loi'}>{thongBao.noi}</p>
            )}
        </div>
    );
}
