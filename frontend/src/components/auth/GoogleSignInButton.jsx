import { useEffect, useRef } from 'react';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Nạp script Google Identity Services một lần, dùng chung mọi nơi.
let gisPromise = null;
function loadGis() {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = GIS_SRC;
        s.async = true;
        s.defer = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Không tải được Google Identity Services'));
        document.head.appendChild(s);
    });
    return gisPromise;
}

/**
 * Nút "Đăng nhập bằng Google".
 * @param {(credential: string) => void} onCredential - nhận ID token khi user chọn tài khoản.
 */
export default function GoogleSignInButton({ onCredential }) {
    const divRef = useRef(null);
    const cbRef = useRef(onCredential);
    cbRef.current = onCredential;

    useEffect(() => {
        if (!CLIENT_ID) return; // chưa cấu hình → không render
        let cancelled = false;
        loadGis()
            .then(() => {
                if (cancelled || !divRef.current) return;
                window.google.accounts.id.initialize({
                    client_id: CLIENT_ID,
                    callback: (resp) => { if (resp?.credential) cbRef.current?.(resp.credential); },
                });
                window.google.accounts.id.renderButton(divRef.current, {
                    type: 'standard',
                    theme: 'outline',
                    size: 'large',
                    text: 'continue_with',
                    shape: 'pill',
                    width: 320,
                    locale: 'vi',
                });
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    if (!CLIENT_ID) return null;

    return (
        <div className="google-signin-wrap">
            <div className="auth-divider"><span>hoặc</span></div>
            <div ref={divRef} className="google-signin-btn"></div>
        </div>
    );
}
