import { useState, useEffect } from 'react';

// Thân modal có tab do REACT STATE quản lý (không bị re-render định kỳ ghi đè như khi
// tự đổi innerHTML trong dangerouslySetInnerHTML → hết lỗi "tự nhảy về tab đầu").
// Nội dung mỗi tab vẫn là HTML string (tái dùng builder cũ) + gắn handler ở onEnterTab.
//   tabs: [{ key, label, icon }]  — các tab hiện trên thanh tab
//   renderBody(tab) -> html string; onEnterTab(tab) sau khi inject; onLeaveTab(prev) trước khi rời.
// Tab ngoài thanh (vd "Quản lý" ở header) đổi qua sự kiện: document.dispatchEvent(
//   new CustomEvent('upload-set-tab', { detail: 'manage' })).
export default function TabbedModalBody({ tabs, initialTab, renderBody, onEnterTab, onLeaveTab }) {
    const [tab, setTab] = useState(initialTab);

    useEffect(() => { onEnterTab?.(tab); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const h = (e) => {
            const next = e.detail;
            if (!next) return;
            setTab(cur => { if (next !== cur) onLeaveTab?.(cur); return next; });
        };
        document.addEventListener('upload-set-tab', h);
        return () => document.removeEventListener('upload-set-tab', h);
    }, [onLeaveTab]);

    const go = (next) => { if (next === tab) return; onLeaveTab?.(tab); setTab(next); };

    return (
        <div style={{ padding: 0 }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
                {tabs.map(t => {
                    const active = tab === t.key;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            id={`upload-tab-${t.key}`}
                            onClick={() => go(t.key)}
                            style={{
                                flex: 1, padding: 10, border: 'none', cursor: 'pointer',
                                fontSize: 13, fontWeight: 600, borderRadius: 0,
                                background: active ? 'var(--primary-color)' : 'var(--bg-secondary)',
                                color: active ? '#fff' : 'var(--text-primary)',
                            }}
                        >
                            <i className={`fas ${t.icon}`}></i> {t.label}
                        </button>
                    );
                })}
            </div>
            {/* key={tab} → đổi tab thì remount (chạy onEnterTab); cùng tab thì string bằng nhau
                nên React bỏ qua, KHÔNG ghi đè input người dùng khi re-render. */}
            <div key={tab} style={{ padding: 16 }} dangerouslySetInnerHTML={{ __html: renderBody(tab) }} />
        </div>
    );
}
