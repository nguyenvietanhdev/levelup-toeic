import { useEffect, useRef, useState } from 'react';
import { SeasonAPI } from '@api/season.js';

function fmt(ms) {
    if (ms <= 0) return 'Đã hết';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const p = (n) => String(n).padStart(2, '0');
    return d > 0 ? `${d}d ${p(h)}:${p(m)}:${p(sec)}` : `${p(h)}:${p(m)}:${p(sec)}`;
}

/** Đồng hồ đếm ngược mùa giải "SSn: dd hh:mm:ss" (đồng bộ giờ với server). */
export default function SeasonCountdown() {
    const [num, setNum] = useState(null);
    const endRef = useRef(null);
    const offRef = useRef(0);
    const [, force] = useState(0);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            const j = await SeasonAPI.current();
            if (alive && j?.success) {
                setNum(j.data.seasonNumber);
                endRef.current = new Date(j.data.endAt).getTime();
                offRef.current = new Date(j.data.serverNow).getTime() - Date.now();
            }
        };
        load();
        const tick = setInterval(() => force((x) => x + 1), 1000);
        const refetch = setInterval(load, 60000);
        return () => { alive = false; clearInterval(tick); clearInterval(refetch); };
    }, []);

    if (num == null || endRef.current == null) return null;
    const remain = endRef.current - (Date.now() + offRef.current);

    return (
        <div className="season-countdown" title="Thời gian còn lại của mùa giải">
            <i className="fas fa-trophy"></i> SS{num}: {fmt(remain)}
        </div>
    );
}
