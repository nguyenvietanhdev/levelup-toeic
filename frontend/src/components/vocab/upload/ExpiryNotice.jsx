import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { UploadVocabAPI } from '@api/uploadVocab.js';
import { downloadWords } from '@/services/vocabExport.js';
import { Notification } from '@ui/Toaster.jsx';
import { GameState } from '@game/state.js';
import { EventBus, GameEvents } from '@game/eventBus.js';

// Ghi nhớ các nguồn đã "xử lý" (đóng/xuất) theo chữ ký nguồn+hạn → không nhắc lại
// khi F5. Chỉ hiện lại khi có nguồn mới sắp hết hạn hoặc hạn đổi (vd sau gia hạn).
const HANDLED_KEY = 'expiryHandledSigs';
const sigOf = (s) => `${s.source}:${new Date(s.expiresAt).getTime()}`;
const loadHandled = () => { try { return new Set(JSON.parse(localStorage.getItem(HANDLED_KEY)) || []); } catch { return new Set(); } };
const saveHandled = (set) => { try { localStorage.setItem(HANDLED_KEY, JSON.stringify([...set])); } catch { /* ignore */ } };

/**
 * Nhắc (không chặn) khi từ vựng riêng sắp hết hạn: cho XUẤT (JSON/Excel — không
 * xoá) hoặc GIA HẠN. Đóng/Xuất = ngừng nhắc cho nguồn đó tới khi tình huống đổi.
 */
export default function ExpiryNotice() {
    const { isLoggedIn } = useAuth();
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
            Notification.success(`Đã xuất "${s.source}" (${n} từ, ${fmts.map(f => f === 'csv' ? 'Excel' : 'JSON').join(' + ')}).`);
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
            Notification.success(res.message || `Đã gia hạn "${source}"`);
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

    if (!isLoggedIn || visible.length === 0) return null;

    return (
        <div style={{
            position: 'fixed', right: 16, bottom: 16, zIndex: 9000,
            width: 380, maxWidth: 'calc(100vw - 32px)',
            background: 'var(--bg-secondary, #1e1e2e)',
            border: '1px solid var(--border-color, #333)',
            borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
            overflow: 'hidden',
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border-color,#333)' }}>
                <i className="fas fa-triangle-exclamation" style={{ color: '#f59e0b', marginTop: 2 }}></i>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary,#fff)' }}>
                        Từ vựng riêng sắp hết hạn
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary,#aaa)', marginTop: 2 }}>
                        Xuất để lưu lại, hoặc gia hạn để khỏi mất.
                    </div>
                </div>
                <button onClick={close} title="Đóng (không nhắc lại tới khi có thay đổi)"
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary,#888)', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>
                    <i className="fas fa-times"></i>
                </button>
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visible.map(s => (
                    <div key={s.source} style={{
                        border: '1px solid var(--border-color,#333)', borderRadius: 8,
                        padding: '10px 12px', background: 'var(--bg-tertiary,var(--bg-secondary))',
                    }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary,#fff)', wordBreak: 'break-word' }}>{s.source}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary,#aaa)', margin: '2px 0 8px' }}>
                            {s.wordCount} từ · còn ~{s.daysLeft} ngày
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className="btn btn-secondary btn-sm" disabled={busy === s.source}
                                onClick={() => doExport(s, ['json', 'csv'])}>
                                <i className="fas fa-file-export"></i> {busy === s.source ? 'Đang xuất…' : 'Xuất (JSON + Excel)'}
                            </button>
                            <button className="btn btn-primary btn-sm" disabled={busy === s.source}
                                onClick={() => handleExtend(s.source)}>
                                <i className="fas fa-clock-rotate-left"></i> {busy === s.source
                                    ? 'Đang xử lý…'
                                    : (GameState.state?.vip?.active
                                        ? 'Gia hạn +30 ngày (VIP miễn phí)'
                                        : `Gia hạn +30 ngày (${(s.wordCount || 0) * 100} 🪙)`)}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
