import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { useGame } from '@game/GameContext.jsx';
import { UploadVocabAPI } from '@api/uploadVocab.js';
import { downloadWords } from '@/services/vocabExport.js';
import { Notification } from '@ui/Toaster.jsx';
import { GameState } from '@game/state.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { yeuCauMoTuVungRieng } from '@lib/moTuVungRieng.js';
import { sourceLabel } from './openUploadModal.js';

// Ghi nhớ các nguồn đã "xử lý" (đóng/xuất) theo chữ ký nguồn+hạn → không nhắc lại
// khi F5. Chỉ hiện lại khi có nguồn mới sắp hết hạn hoặc hạn đổi (vd sau gia hạn).
const HANDLED_KEY = 'expiryHandledSigs';
const sigOf = (s) => `${s.source}:${new Date(s.expiresAt).getTime()}`;
const loadHandled = () => { try { return new Set(JSON.parse(localStorage.getItem(HANDLED_KEY)) || []); } catch { return new Set(); } };
const saveHandled = (set) => { try { localStorage.setItem(HANDLED_KEY, JSON.stringify([...set])); } catch { /* ignore */ } };

/** Nhãn thời hạn còn lại (thuần). */
export function nhanConLai(daysLeft) {
    if (daysLeft <= 0) return 'Hết hạn hôm nay';
    if (daysLeft === 1) return 'Còn 1 ngày';
    return `Còn ${daysLeft} ngày`;
}

/**
 * Nhắc (không chặn) khi từ vựng riêng sắp hết hạn.
 *
 * Bấm vào một bộ là sang thẳng màn Từ vựng riêng, mở sẵn đúng bộ đó (xem lib/moTuVungRieng.js) —
 * ở đó có đủ việc: xem từ, xuất, xoá, gia hạn. Gia hạn / Xuất nhanh vẫn có ngay trong popup.
 * Đóng/Xuất = ngừng nhắc cho nguồn đó tới khi tình huống đổi. Đang ở màn Từ vựng riêng thì ẩn.
 */
export default function ExpiryNotice() {
    const { isLoggedIn } = useAuth();
    const { showScreen, currentScreen } = useGame();
    const [sources, setSources] = useState([]); // [{source,wordCount,expiresAt,daysLeft}]
    const [busy, setBusy] = useState('');
    const [handled, setHandled] = useState(loadHandled);

    useEffect(() => {
        if (!isLoggedIn) { setSources([]); return; }
        let alive = true;
        UploadVocabAPI.expiring().then(res => {
            if (!alive || !res?.success || !Array.isArray(res.data)) return;
            const now = Date.now();
            const list = res.data.map(s => ({
                ...s,
                daysLeft: Math.max(0, Math.ceil((new Date(s.expiresAt).getTime() - now) / (24 * 60 * 60 * 1000))),
            }));
            setSources(list);
            // Dọn chữ ký cũ không còn trong danh sách (giữ localStorage gọn).
            setHandled(prev => {
                const valid = new Set(list.map(sigOf));
                const next = new Set([...prev].filter(sig => valid.has(sig)));
                if (next.size !== prev.size) saveHandled(next);
                return next;
            });
        });
        return () => { alive = false; };
    }, [isLoggedIn]);

    // Chỉ hiện nguồn CHƯA xử lý.
    const visible = useMemo(() => sources.filter(s => !handled.has(sigOf(s))), [sources, handled]);

    const markHandled = useCallback((s) => {
        setHandled(prev => { const next = new Set(prev); next.add(sigOf(s)); saveHandled(next); return next; });
    }, []);

    /** Sang màn Từ vựng riêng, mở sẵn bộ `source` (bỏ trống = chỉ mở danh sách). */
    const moTrang = useCallback((source = '') => {
        yeuCauMoTuVungRieng(source);
        showScreen('vocab-screen');
    }, [showScreen]);

    // Tải từ 1 lần rồi tải xuống theo (các) định dạng.
    const doExport = useCallback(async (s, fmts) => {
        if (busy) return;
        setBusy(s.source);
        try {
            const res = await UploadVocabAPI.myVocabulary(s.source);
            if (!res.success) throw new Error(res.message || 'Không tải được từ vựng');
            const data = res.data || [];
            let n = 0;
            for (const fmt of fmts) n = downloadWords(s.source, data, fmt);
            if (n === 0) throw new Error('Nguồn rỗng, không có gì để xuất');
            markHandled(s); // đã lưu → ngừng nhắc nguồn này
            Notification.success(`Đã xuất "${sourceLabel(s.source)}" (${n} từ, ${fmts.map(f => f === 'csv' ? 'Excel' : 'JSON').join(' + ')}).`);
        } catch (err) {
            Notification.error(err.message || 'Lỗi khi xuất file');
        } finally {
            setBusy('');
        }
    }, [busy, markHandled]);

    const handleExtend = useCallback(async (source) => {
        if (busy) return;
        setBusy(source);
        try {
            const res = await UploadVocabAPI.extendSource(source);
            if (!res.success) throw new Error(res.message || 'Gia hạn thất bại');
            if (typeof res.newBalance === 'number' && GameState.state?.resources) {
                GameState.state.resources.coins = res.newBalance;
                EventBus.emit(GameEvents.STATE_CHANGED);
            }
            Notification.success(res.message || `Đã gia hạn "${sourceLabel(source)}"`);
            setSources(prev => prev.filter(s => s.source !== source));
        } catch (err) {
            Notification.error(err.message || 'Lỗi khi gia hạn');
        } finally {
            setBusy('');
        }
    }, [busy]);

    // Đóng = đánh dấu tất cả nguồn đang hiện là đã xử lý (không nhắc lại khi F5).
    const close = () => {
        setHandled(prev => {
            const next = new Set(prev);
            visible.forEach(s => next.add(sigOf(s)));
            saveHandled(next);
            return next;
        });
    };

    // Đang ở chính màn Từ vựng riêng: popup chỉ che mất nội dung.
    if (!isLoggedIn || visible.length === 0 || currentScreen === 'vocab-screen') return null;

    const tongTu = visible.reduce((n, s) => n + (s.wordCount || 0), 0);
    const ganNhat = Math.min(...visible.map(s => s.daysLeft));
    const vip = !!GameState.state?.vip?.active;

    return (
        <section className="het-han" role="region" aria-label="Từ vựng riêng sắp hết hạn">
            <div className="het-han-dau">
                <span className="het-han-bieu-tuong" aria-hidden="true"><i className="fas fa-hourglass-half"></i></span>
                <div className="het-han-tieu-de">
                    <strong>Từ vựng riêng sắp hết hạn</strong>
                    <span>{visible.length} bộ · {tongTu} từ · {nhanConLai(ganNhat).toLowerCase()}</span>
                </div>
                <button type="button" className="het-han-dong" onClick={close} aria-label="Đóng"
                    title="Đóng (không nhắc lại tới khi có thay đổi)">
                    <i className="fas fa-xmark"></i>
                </button>
            </div>

            <ul className="het-han-ds">
                {visible.map(s => (
                    <li key={s.source} className={s.daysLeft <= 1 ? 'is-gap' : ''}>
                        <button type="button" className="het-han-the" onClick={() => moTrang(s.source)}
                            title="Mở bộ này trong Từ vựng riêng">
                            <span className="het-han-ten">{sourceLabel(s.source)}</span>
                            <span className="het-han-phu">
                                {s.wordCount} từ · <b>{nhanConLai(s.daysLeft)}</b>
                            </span>
                            <i className="fas fa-chevron-right" aria-hidden="true"></i>
                        </button>
                        <div className="het-han-nut">
                            <button type="button" className="btn btn-primary btn-sm" disabled={busy === s.source}
                                onClick={() => handleExtend(s.source)}>
                                <i className="fas fa-clock-rotate-left"></i> {busy === s.source ? 'Đang xử lý…'
                                    : vip ? 'Gia hạn 30 ngày (VIP miễn phí)' : `Gia hạn 30 ngày · ${(s.wordCount || 0) * 100} 🪙`}
                            </button>
                            <button type="button" className="btn btn-secondary btn-sm" disabled={busy === s.source}
                                onClick={() => doExport(s, ['json', 'csv'])} title="Tải về JSON + Excel để lưu lại">
                                <i className="fas fa-file-export"></i> Xuất
                            </button>
                        </div>
                    </li>
                ))}
            </ul>

            <button type="button" className="het-han-mo" onClick={() => moTrang('')}>
                Mở Từ vựng riêng <i className="fas fa-arrow-right" aria-hidden="true"></i>
            </button>
        </section>
    );
}
