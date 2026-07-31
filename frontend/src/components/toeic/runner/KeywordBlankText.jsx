/**
 * Renders text with a keyword replaced by an input field.
 * Returns an array of React nodes.
 */
export default function KeywordBlankText({ text, keyword, inputId, value, onChange, onSubmit, status }) {
    if (!text || !keyword) return text;

    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const parts = [];
    let lastIndex = 0;
    let m;
    let counter = 0;
    let match = null;

    // Find first match (engine only blanks first occurrence per regex global flag,
    // but visually multiple inputs are confusing — keep first only)
    regex.lastIndex = 0;
    while ((m = regex.exec(text)) !== null) {
        if (lastIndex < m.index) parts.push(text.substring(lastIndex, m.index));
        if (!match) match = m[0];
        const id = `${inputId}-${counter}`;
        counter++;
        const className = `keyword-blank-input${status === 'correct' ? ' keyword-correct' : status === 'wrong' ? ' keyword-wrong' : ''}`;
        parts.push(
            <input
                key={id}
                type="text"
                id={id}
                className={className}
                data-correct={m[0]}
                value={value || ''}
                placeholder="..."
                autoComplete="off"
                style={{ width: Math.max(m[0].length * 12, 80) }}
                onChange={(e) => onChange?.(inputId, e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        onSubmit?.();
                    }
                }}
                onClick={(e) => e.stopPropagation()}
            />
        );
        lastIndex = m.index + m[0].length;
    }
    if (lastIndex < text.length) parts.push(text.substring(lastIndex));

    return parts.length > 0 ? <>{parts}</> : text;
}
