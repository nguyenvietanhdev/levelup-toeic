import { useCallback, useEffect, useState } from 'react';
import { RolesAPI } from '@api/roles.js';

const DO_DAI_TOI_THIEU = 10;
const DO_DAI_TOI_DA = 400;

/** Nhãn nguồn của vai đang áp dụng. */
const NHAN_NGUON = {
    user: 'Vai của bạn',
    ai: 'Vai AI đề xuất',
};

/**
 * Tab "Vai AI" của một màn AI: đặt vai cho Part đang học.
 *
 * Vai gắn với Part (đề + Part + ngôn ngữ). Vai người học tự viết thay vai AI của
 * Part đó với riêng họ; xoá đi thì quay về vai AI. Vai AI dùng chung, chỉ được AI
 * tạo một lần cho mỗi Part.
 */
export default function VaiAITab({ source, part, lang }) {
    const [vai, setVai] = useState(null);     // { vai, nguon } | null
    const [dang, setDang] = useState(false);
    const [nhap, setNhap] = useState('');
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
        setThongBao(null);
        setNhap('');
        tai();
    }, [tai]);

    const thucHien = async (fn, thanhCong) => {
        setDang(true);
        setThongBao(null);
        try {
            const kq = await fn();
            setVai(kq);
            if (thanhCong) setThongBao({ loai: 'ok', noi: thanhCong });
        } catch (e) {
            setThongBao({ loai: 'loi', noi: e.message });
        } finally {
            setDang(false);
        }
    };

    if (!coPart) {
        return (
            <p className="tr-intro-note">
                Chọn đề và Part ở thanh trên để đặt vai cho Part đó.
            </p>
        );
    }

    const soKyTu = nhap.trim().length;
    const nguon = vai?.nguon || null;

    return (
        <div className="ai-role">
            <p className="tr-intro-note">
                Part <strong>{part}</strong> · đề <strong>{source}</strong>
            </p>

            <div className="ai-role-current">
                <div className="ai-role-tag">
                    {nguon ? NHAN_NGUON[nguon] : 'Chưa có vai cho Part này'}
                </div>
                <p className="ai-role-text">
                    {dang && !vai ? 'Đang tải…' : (vai?.vai || 'Chưa có vai. Bấm “AI đề xuất” hoặc tự viết một vai bên dưới.')}
                </p>
            </div>

            <div className="ai-role-actions">
                <button
                    className="btn btn-secondary"
                    disabled={dang}
                    onClick={() => thucHien(
                        () => RolesAPI.suggest({ source, part, lang }),
                        'Đã có vai AI cho Part này.',
                    )}
                >
                    <i className="fas fa-wand-magic-sparkles"></i> AI đề xuất
                </button>
                {/* Luôn hiện khi có vai. Chỉ xoá được vai RIÊNG của người học; vai AI
                    là vai dùng chung của mọi người nên không xoá từ đây. */}
                {nguon && (
                    <button
                        className="btn btn-secondary"
                        disabled={dang || nguon !== 'user'}
                        title={nguon === 'user' ? 'Xoá vai riêng, quay về vai AI' : 'Vai AI dùng chung, không xoá'}
                        onClick={() => thucHien(async () => {
                            await RolesAPI.remove({ source, part, lang });
                            return RolesAPI.get({ source, part, lang });
                        }, 'Đã xoá vai của bạn, quay về vai AI.')}
                    >
                        <i className="fas fa-trash"></i> Xoá vai của tôi
                    </button>
                )}
            </div>

            <label className="ai-role-label">Tự viết vai của bạn</label>
            <textarea
                className="ai-role-input"
                value={nhap}
                onChange={(e) => setNhap(e.target.value)}
                maxLength={DO_DAI_TOI_DA}
                rows={3}
                placeholder="Ví dụ: A strict auditor reviewing my monthly ledger."
            />
            <div className="ai-role-foot">
                <span>{soKyTu}/{DO_DAI_TOI_DA}</span>
                <button
                    className="btn btn-primary"
                    disabled={dang || soKyTu < DO_DAI_TOI_THIEU}
                    onClick={() => thucHien(async () => {
                        await RolesAPI.save({ source, part, lang, text: nhap });
                        setNhap('');
                        return RolesAPI.get({ source, part, lang });
                    }, 'Đã lưu vai của bạn. Phiên mới sẽ dùng vai này.')}
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
