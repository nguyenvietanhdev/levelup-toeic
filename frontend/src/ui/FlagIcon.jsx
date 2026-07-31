// Cờ quốc gia dạng SVG inline — hiển thị đồng nhất trên MỌI trình duyệt.
// (Windows không có glyph emoji cờ nên Edge/Chrome hiện "CN"/"GB" thay vì cờ;
//  Firefox tự kèm font emoji nên ra cờ. Dùng SVG để khỏi phụ thuộc font.)

// Toạ độ ngôi sao 5 cánh tâm (cx,cy), bán kính ngoài r.
function starPoints(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 5; i++) {
        const ao = ((-90 + i * 72) * Math.PI) / 180;
        pts.push(`${(cx + r * Math.cos(ao)).toFixed(2)},${(cy + r * Math.sin(ao)).toFixed(2)}`);
        const ai = ((-90 + i * 72 + 36) * Math.PI) / 180;
        const ri = r * 0.382;
        pts.push(`${(cx + ri * Math.cos(ai)).toFixed(2)},${(cy + ri * Math.sin(ai)).toFixed(2)}`);
    }
    return pts.join(' ');
}

export default function FlagIcon({ lang, size = 18, style }) {
    const h = Math.round(size * 0.7);
    const common = {
        width: size,
        height: h,
        style: { borderRadius: 2, flexShrink: 0, display: 'inline-block', verticalAlign: 'middle', ...style },
        'aria-hidden': true,
    };

    if (lang === 'zh') {
        return (
            <svg viewBox="0 0 30 20" {...common}>
                <rect width="30" height="20" fill="#de2910" />
                <g fill="#ffde00">
                    <polygon points={starPoints(5, 5, 3)} />
                    <polygon points={starPoints(10, 2, 1.2)} />
                    <polygon points={starPoints(12, 4.5, 1.2)} />
                    <polygon points={starPoints(12, 7.5, 1.2)} />
                    <polygon points={starPoints(10, 10, 1.2)} />
                </g>
            </svg>
        );
    }

    if (lang === 'en') {
        return (
            <svg viewBox="0 0 60 30" {...common}>
                <clipPath id="flag-gb-clip"><rect width="60" height="30" /></clipPath>
                <g clipPath="url(#flag-gb-clip)">
                    <rect width="60" height="30" fill="#012169" />
                    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
                    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="4" />
                    <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
                    <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
                </g>
            </svg>
        );
    }

    return null;
}
