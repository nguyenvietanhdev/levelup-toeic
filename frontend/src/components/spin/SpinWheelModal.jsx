import { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { GameState } from '@game/state.js';
import { Notification } from '@ui/Toaster.jsx';
import { getToken } from '@/auth/token.js';
import ItemThumb from '@ui/ItemThumb.jsx';

function playSound(file, { loop = false, volume = 0.6 } = {}) {
    if (GameState.state?.settings?.soundEnabled === false) return null;
    const audio = new Audio(`/assets/sounds/${file}`);
    audio.volume = volume;
    audio.loop = loop;
    audio.play().catch(() => {});
    return audio;
}

// Phải khớp thứ tự với PRIZES trong backend/routes/spin.js
const PRIZES = [
    { label: '50 Xu',   icon: '🪙', type: 'coins',  amount: 50,  color: '#f59e0b' },
    { label: '5 Đá',    icon: '💎', type: 'gems',   amount: 5,   color: '#8b5cf6' },
    { label: '100 XP',  icon: '⭐', type: 'xp',     amount: 100, color: '#06b6d4' },
    { label: '100 Xu',  icon: '🪙', type: 'coins',  amount: 100, color: '#f97316' },
    { label: '200 Xu',  icon: '🪙', type: 'coins',  amount: 200, color: '#ef4444' },
    { label: '10 Đá',   icon: '💎', type: 'gems',   amount: 10,  color: '#ec4899' },
    { label: 'Nạp NL',  icon: '⚡', type: 'energy', amount: 100, color: '#10b981' },
    { label: '2 Gợi ý', icon: '💡', type: 'hints',  amount: 2,   color: '#3b82f6' },
];

function drawWheel(canvas, rotationDeg, prizes = PRIZES, imgs = {}) {
    const ctx = canvas.getContext('2d');
    const S = canvas.width;
    const cx = S / 2, cy = S / 2;
    const R = cx - 4;
    const rot = (rotationDeg * Math.PI) / 180;
    const n = prizes.length || 1;

    ctx.clearRect(0, 0, S, S);

    prizes.forEach((prize, i) => {
        const start = rot + (i * 2 * Math.PI) / n - Math.PI / 2;
        const end = start + (2 * Math.PI) / n;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, start, end);
        ctx.closePath();
        ctx.fillStyle = prize.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(start + Math.PI / n);
        // Chỉ hiển thị ẢNH (hoặc icon emoji) — không còn chữ nhãn.
        const img = prize.image ? imgs[prize.image] : null;
        if (img && img.complete && img.naturalWidth) {
            const size = 42;
            ctx.drawImage(img, R - 18 - size, -size / 2, size, size);
        } else {
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.font = '32px sans-serif';
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 3;
            ctx.fillText(prize.icon, R - 18, 0);
        }
        ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 0;
    ctx.fillText('🌟', cx, cy);
}

export default function SpinWheelModal({ open, onClose }) {
    const { syncFromState } = useGame();
    const canvasRef = useRef(null);
    const rotRef = useRef(0);
    const animRef = useRef(null);
    const spinSoundRef = useRef(null);
    const [spinning, setSpinning] = useState(false);
    const [result, setResult] = useState(null);
    const [spinSummary, setSpinSummary] = useState(null);
    const [canFreeSpin, setCanFreeSpin] = useState(true);
    const [nextSpinAt, setNextSpinAt] = useState(null);
    const [countdown, setCountdown] = useState('');
    const [coins, setCoins] = useState(0);
    const [gems, setGems] = useState(0);
    const [tickets, setTickets] = useState(0);
    const [costs, setCosts] = useState({ coin: 100, gem: 5 });
    const [qty, setQty] = useState(1);
    const [skipAnim, setSkipAnim] = useState(false);
    const [prizes, setPrizes] = useState(PRIZES); // phần thưởng động (từ backend), fallback PRIZES
    const phaseRef = useRef('idle');
    const prizeImgsRef = useRef({}); // cache ảnh phần thưởng (url → HTMLImageElement)

    // Preload ảnh phần thưởng → vẽ lại bánh xe khi tải xong.
    useEffect(() => {
        let alive = true;
        prizes.forEach(p => {
            if (p.image && !prizeImgsRef.current[p.image]) {
                const img = new Image();
                img.onload = () => { if (alive && canvasRef.current) drawWheel(canvasRef.current, rotRef.current, prizes, prizeImgsRef.current); };
                img.src = p.image;
                prizeImgsRef.current[p.image] = img;
            }
        });
        return () => { alive = false; };
    }, [prizes]);

    useEffect(() => {
        if (!open || !canvasRef.current) return;
        drawWheel(canvasRef.current, rotRef.current, prizes, prizeImgsRef.current);
    }, [open, prizes]);

    useEffect(() => {
        if (!open) return;
        const token = getToken();
        if (!token) return;
        fetch('/api/spin/status', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    setCanFreeSpin(data.canFreeSpin ?? data.canSpin);
                    setNextSpinAt(data.nextSpinAt ? new Date(data.nextSpinAt) : null);
                    setCoins(data.coins || 0);
                    setGems(data.gems || 0);
                    setTickets(data.tickets || 0);
                    if (data.costs) setCosts(data.costs);
                    if (data.prizes?.length) setPrizes(data.prizes);
                }
            })
            .catch(() => {});
    }, [open]);

    useEffect(() => {
        if (!nextSpinAt) return;
        const tick = () => {
            const diff = nextSpinAt - Date.now();
            if (diff <= 0) { setCanFreeSpin(true); setNextSpinAt(null); setCountdown(''); return; }
            const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
            const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
            const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
            setCountdown(`${h}:${m}:${s}`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [nextSpinAt]);

    const doSpin = useCallback(async (mode) => {
        if (spinning) return;
        setSpinning(true);
        setResult(null);
        setSpinSummary(null);

        const SEG = 360 / (prizes.length || 1);
        const draw = () => { if (canvasRef.current) drawWheel(canvasRef.current, rotRef.current, prizes, prizeImgsRef.current); };
        const stopAll = () => {
            phaseRef.current = 'idle';
            if (animRef.current) cancelAnimationFrame(animRef.current);
            if (spinSoundRef.current) { spinSoundRef.current.pause(); spinSoundRef.current = null; }
            setSpinning(false);
        };

        // Áp dụng phần thưởng + cập nhật state (dùng chung cho cả 2 chế độ).
        const applyResults = (results, nextAt) => {
            let totalCoinsWon = 0, totalGemsWon = 0, totalXpWon = 0, totalHints = 0;
            let totalCoinCost = 0, totalGemCost = 0;
            for (const r of results) {
                if (mode === 'coin') totalCoinCost += costs.coin;
                if (mode === 'gem')  totalGemCost  += costs.gem;
                if (r.prize.type === 'coins')  totalCoinsWon += r.prize.amount;
                if (r.prize.type === 'gems')   totalGemsWon  += r.prize.amount;
                if (r.prize.type === 'xp')     totalXpWon    += r.prize.amount;
                if (r.prize.type === 'hints')  totalHints    += r.prize.amount;
            }
            if (results.length > 1) {
                setSpinSummary({ spins: results.length, coins: totalCoinsWon, gems: totalGemsWon, xp: totalXpWon, hints: totalHints });
            }
            if (mode === 'free') { setCanFreeSpin(false); setNextSpinAt(nextAt); }
            if (mode === 'ticket') setTickets(t => Math.max(0, t - results.length));
            setCoins(c => c - totalCoinCost + totalCoinsWon);
            setGems(g  => g - totalGemCost  + totalGemsWon);

            const rs = GameState.state?.resources;
            if (rs) {
                if (mode === 'coin') rs.coins = (rs.coins || 0) - totalCoinCost;
                if (mode === 'gem')  rs.gems  = (rs.gems  || 0) - totalGemCost;
                for (const r of results) {
                    if (r.prize.type === 'coins')  rs.coins  = (rs.coins  || 0) + r.prize.amount;
                    if (r.prize.type === 'gems')   rs.gems   = (rs.gems   || 0) + r.prize.amount;
                    if (r.prize.type === 'hints')  rs.hints  = (rs.hints  || 0) + r.prize.amount;
                    if (r.prize.type === 'energy') rs.energy = 100;
                    if (r.prize.type === 'xp' && GameState.state?.user)
                        GameState.state.user.xp = (GameState.state.user.xp || 0) + r.prize.amount;
                }
            }
            syncFromState();
        };

        // Bánh xe QUAY NGAY khi bấm (không chờ API) — chỉ khi không bỏ hoạt ảnh.
        if (!skipAnim) {
            spinSoundRef.current = playSound('spin.mp3', { loop: true, volume: 0.7 });
            phaseRef.current = 'spin';
            const spinLoop = () => {
                if (phaseRef.current !== 'spin') return;
                rotRef.current += 16;
                draw();
                animRef.current = requestAnimationFrame(spinLoop);
            };
            animRef.current = requestAnimationFrame(spinLoop);
        }

        const token = getToken();
        const spins = mode === 'free' ? 1 : Math.max(1, qty);
        const results = [];
        for (let i = 0; i < spins; i++) {
            try {
                const res = await fetch('/api/spin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ mode }),
                }).then(r => r.json());
                if (!res.success) {
                    if (i === 0) { Notification.error(res.message || 'Không thể quay'); stopAll(); return; }
                    break;
                }
                results.push(res);
            } catch {
                if (i === 0) { Notification.error('Lỗi kết nối'); stopAll(); return; }
                break;
            }
        }
        if (results.length === 0) { stopAll(); return; }

        const lastResult = results[results.length - 1];
        const prizeIndex = lastResult.prizeIndex;
        const nextAt = lastResult.nextSpinAt ? new Date(lastResult.nextSpinAt) : null;
        const segCenter = prizeIndex * SEG + SEG / 2;
        const desiredMod = (((360 - segCenter) % 360) + 360) % 360;

        const finish = () => {
            if (spinSoundRef.current) { spinSoundRef.current.pause(); spinSoundRef.current = null; }
            playSound('achieve.mp3', { volume: 0.7 });
            phaseRef.current = 'idle';
            setSpinning(false);
            setResult(lastResult.prize);
            applyResults(results, nextAt);
        };

        if (skipAnim) {
            // Nhận ngay, đặt bánh xe đúng ô trúng, không hoạt ảnh.
            rotRef.current = desiredMod;
            draw();
            finish();
            return;
        }

        // Giảm tốc dừng vào ô trúng (ít nhất 2 vòng nữa).
        phaseRef.current = 'land';
        const startRot = rotRef.current;
        let target = startRot - (startRot % 360) + desiredMod;
        while (target < startRot + 2 * 360) target += 360;
        const delta = target - startRot;
        const duration = 2200;
        const t0 = performance.now();
        const easeOut = t => 1 - Math.pow(1 - t, 3);
        const landLoop = (now) => {
            const t = Math.min((now - t0) / duration, 1);
            rotRef.current = startRot + delta * easeOut(t);
            draw();
            if (t < 1) { animRef.current = requestAnimationFrame(landLoop); }
            else { rotRef.current = target; draw(); finish(); }
        };
        animRef.current = requestAnimationFrame(landLoop);
    }, [spinning, qty, skipAnim, costs, prizes, syncFromState]);

    useEffect(() => () => {
        if (animRef.current) cancelAnimationFrame(animRef.current);
        if (spinSoundRef.current) { spinSoundRef.current.pause(); spinSoundRef.current = null; }
    }, []);

    if (!open) return null;

    const resultPrize = result ? prizes.find(p => p.type === result.type && p.amount === result.amount) : null;
    const totalCoinCost = costs.coin * qty;
    const totalGemCost  = costs.gem  * qty;

    return (
        <div className="spin-overlay" onClick={(e) => { if (e.target === e.currentTarget && !spinning) onClose(); }}>
            <div className="spin-modal spin-modal-wide">
                <button className="spin-close-btn" onClick={onClose} disabled={spinning}>
                    <i className="fas fa-times"></i>
                </button>

                {/* ── 2-column layout ── */}
                <div className="spin-layout">

                    {/* COL 1: wheel + qty input */}
                    <div className="spin-col-left">
                        <h2 className="spin-title">🎰 Vòng Quay</h2>
                        <div className="spin-wheel-container">
                            <div className="spin-pointer">▼</div>
                            <canvas ref={canvasRef} width={260} height={260} className="spin-canvas" />
                        </div>
                        <div className="spin-qty-row">
                            <label className="spin-qty-label">Số lượt quay</label>
                            <div className="spin-qty-controls">
                                <button
                                    className="spin-qty-btn"
                                    onClick={() => setQty(q => Math.max(1, q - 1))}
                                    disabled={spinning || qty <= 1}
                                >−</button>
                                <input
                                    type="number"
                                    className="spin-qty-input"
                                    min={1} max={50}
                                    value={qty}
                                    disabled={spinning}
                                    onChange={e => {
                                        const v = parseInt(e.target.value) || 1;
                                        setQty(Math.min(50, Math.max(1, v)));
                                    }}
                                />
                                <button
                                    className="spin-qty-btn"
                                    onClick={() => setQty(q => Math.min(50, q + 1))}
                                    disabled={spinning || qty >= 50}
                                >+</button>
                                <button
                                    className={`spin-qty-quick${qty === 5 ? ' active' : ''}`}
                                    onClick={() => setQty(5)}
                                    disabled={spinning}
                                >x5</button>
                                <button
                                    className={`spin-qty-quick${qty === 10 ? ' active' : ''}`}
                                    onClick={() => setQty(10)}
                                    disabled={spinning}
                                >x10</button>
                            </div>
                        </div>
                        <label className="spin-skip-anim">
                            <input
                                type="checkbox"
                                checked={skipAnim}
                                onChange={e => setSkipAnim(e.target.checked)}
                                disabled={spinning}
                            />
                            Bỏ qua hoạt ảnh (nhận thưởng ngay)
                        </label>
                    </div>

                    {/* COL 2: prizes + result + all spin buttons */}
                    <div className="spin-col-right">
                        <h3 className="spin-prizes-title">🎁 Phần thưởng</h3>
                        <div className="spin-prizes-grid">
                            {prizes.map((p, i) => (
                                <div key={i} className="spin-prize-row" style={{ borderLeftColor: p.color }}>
                                    <span><ItemThumb image={p.image} imgClassName="spin-prize-img">{p.icon}</ItemThumb></span>
                                    <span>{p.label}</span>
                                </div>
                            ))}
                        </div>

                        {spinSummary ? (
                            <div className="spin-result spin-result-summary">
                                <span className="spin-result-icon">🎊</span>
                                <div className="spin-result-text">
                                    <strong>{spinSummary.spins} lượt</strong> —{' '}
                                    {[
                                        spinSummary.coins  && `+${spinSummary.coins} Xu`,
                                        spinSummary.gems   && `+${spinSummary.gems} Đá`,
                                        spinSummary.xp     && `+${spinSummary.xp} XP`,
                                        spinSummary.hints  && `+${spinSummary.hints} Gợi ý`,
                                    ].filter(Boolean).join(', ') || 'Phần thưởng nhận được'}
                                </div>
                            </div>
                        ) : result ? (
                            <div className="spin-result">
                                <span className="spin-result-icon"><ItemThumb image={resultPrize?.image} imgClassName="spin-prize-img spin-prize-img--lg">{resultPrize?.icon || '🎁'}</ItemThumb></span>
                                <span className="spin-result-text">Nhận được <strong>{result.label}</strong>!</span>
                            </div>
                        ) : null}

                        <div className="spin-paid-btns">
                            {canFreeSpin ? (
                                <button
                                    className={`spin-action-btn spin-free-btn${spinning ? ' spinning' : ''}`}
                                    onClick={() => doSpin('free')}
                                    disabled={spinning}
                                >
                                    {spinning ? <><i className="fas fa-spinner fa-spin"></i> Đang quay...</> : '🎁 Quay Miễn Phí'}
                                </button>
                            ) : (
                                <div className="spin-cooldown">
                                    <i className="fas fa-clock"></i>
                                    {countdown ? ` Miễn phí sau: ${countdown}` : ' Hết lượt miễn phí hôm nay'}
                                </div>
                            )}
                            <button
                                className="spin-action-btn spin-coin-btn"
                                onClick={() => doSpin('coin')}
                                disabled={spinning || coins < totalCoinCost}
                                title={`Số dư: ${coins} xu`}
                            >
                                🪙 {totalCoinCost} Xu
                                <span className="spin-balance">({coins} xu)</span>
                            </button>
                            <button
                                className="spin-action-btn spin-gem-btn"
                                onClick={() => doSpin('gem')}
                                disabled={spinning || gems < totalGemCost}
                                title={`Số dư: ${gems} đá · Tỷ lệ cao hơn!`}
                            >
                                💎 {totalGemCost} Đá
                                <span className="spin-balance">({gems} đá) ✨</span>
                            </button>
                            {tickets > 0 && (
                                <button
                                    className="spin-action-btn spin-ticket-btn"
                                    onClick={() => doSpin('ticket')}
                                    disabled={spinning || tickets < qty}
                                    title={`Bạn có ${tickets} vé quay`}
                                >
                                    🎟️ Quay bằng vé ×{qty}
                                    <span className="spin-balance">(còn {tickets} vé)</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
