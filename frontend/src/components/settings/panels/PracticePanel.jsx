// "Practice" panel. Presentational — state/handlers passed from SettingsScreen.
import { useState } from 'react';
import Toggle from './Toggle.jsx';
import { QUESTION_TIME_MODES, getQuestionTimeDefault } from '@components/practice/questionTime.js';
import { bandLabel, BANDS, levelsFor } from '@lib/levelBands.js';

const SEC_OPTIONS = [10, 15, 20, 25, 30, 45, 60, 90, 120];

/**
 * Ba kiểu hỏi của chế độ "Ôn lại từ sai", xếp theo độ khó tăng dần.
 * Khớp `KIEU_HOI` trong `reviewMistakes.js` — đổi một bên phải đổi bên kia.
 */
const REVIEW_KINDS = [
    { key: 'choice',    label: 'Chọn nghĩa', desc: 'Chọn đáp án đúng trong 4 lựa chọn' },
    { key: 'truefalse', label: 'Đúng / Sai', desc: 'Xem một nghĩa và quyết định đúng hay sai' },
    { key: 'fill',      label: 'Gõ từ',      desc: 'Tự gõ ra, không có gợi ý — khó nhất' },
    // Chỉ xuất hiện với từ CÓ chữ Hán — từ tiếng Anh tự bỏ qua kiểu này.
    { key: 'hanzi',     label: 'Viết chữ Hán', desc: 'Tô lại nét chữ; chỉ dùng cho từ tiếng Trung' },
];

// Thụt lề + vạch trái cho cài đặt PHỤ THUỘC một toggle phía trên → nhìn ra quan hệ cha–con.
const NESTED = { paddingLeft: 14, borderLeft: '2px solid var(--border-color)' };

export default function PracticePanel({ s, handleQPS, updateSetting, handleDifficulty }) {
    // Thời gian mỗi câu (per-mode). Select 1 chọn chế độ ("all" = toàn bộ).
    // Fallback: giá trị cũ timePerQuestion (dùng chung) nếu chế độ chưa có riêng.
    const [tmMode, setTmMode] = useState('all');
    const qt = s.questionTime || {};
    const legacy = (typeof s.timePerQuestion === 'number' && s.timePerQuestion > 0) ? s.timePerQuestion : null;
    const effSec = (id) => (typeof qt[id] === 'number' ? qt[id] : (legacy ?? getQuestionTimeDefault(id)));
    const firstSec = effSec(QUESTION_TIME_MODES[0].id);
    const allSame = QUESTION_TIME_MODES.every(m => effSec(m.id) === firstSec) ? firstSec : null;

    // Kiểu hỏi đang bật. Chưa đặt gì → coi như bật CẢ BA: người chưa vào Cài đặt
    // bao giờ phải thấy ba ô đều tick, không phải ba ô trống rồi tự hỏi mình đã
    // tắt cái gì.
    const kindsChon = Array.isArray(s.reviewKinds) && s.reviewKinds.length
        ? s.reviewKinds
        : REVIEW_KINDS.map(k => k.key);

    const toggleKind = (key) => {
        const sau = kindsChon.includes(key)
            ? kindsChon.filter(k => k !== key)
            : [...kindsChon, key];
        // Bỏ tick cái cuối → lưu mảng RỖNG, và `kieuDuocPhep()` hiểu đó là "dùng
        // cả ba". Chặn không cho bỏ thì người dùng kẹt ở một ô không tắt được;
        // để rỗng nghĩa là "không giới hạn", đúng hơn là một lượt không có câu nào.
        updateSetting('reviewKinds', sau);
    };
    const tmVal = tmMode === 'all' ? (allSame ?? '') : effSec(tmMode);
    const tmOptions = (typeof tmVal === 'number' && !SEC_OPTIONS.includes(tmVal))
        ? [tmVal, ...SEC_OPTIONS].sort((a, b) => a - b) : SEC_OPTIONS;
    const applyTmTime = (secStr) => {
        const sec = parseInt(secStr);
        if (!Number.isFinite(sec)) return;
        if (tmMode === 'all') {
            const next = {};
            QUESTION_TIME_MODES.forEach(m => { next[m.id] = sec; });
            updateSetting('questionTime', next);
        } else {
            // Ghi kèm giá trị đang hiệu lực của các chế độ khác để không rơi về mặc định.
            const base = {};
            QUESTION_TIME_MODES.forEach(m => { base[m.id] = effSec(m.id); });
            updateSetting('questionTime', { ...base, [tmMode]: sec });
        }
    };

    return (
        <div className="settings-section">
            <h3>Cài đặt luyện tập</h3>
            <div className="setting-item">
                <label>Số câu mỗi lượt</label>
                <select value={s.questionsPerSession ?? 'auto'} onChange={e => handleQPS(e.target.value)}>
                    <option value={5}>5 — Khởi động</option>
                    <option value={10}>10 — Dễ</option>
                    <option value={20}>20 — Bình thường</option>
                    <option value={30}>30 — Tập trung</option>
                    <option value={50}>50 — Khó</option>
                    <option value={100}>100 — Rất khó</option>
                    <option value={200}>200 — Thử thách</option>
                    <option value="auto">Toàn bộ</option>
                </select>
            </div>
            <div className="setting-item">
                <div className="setting-info"><h4>Giới hạn thời gian</h4><p>Đếm ngược cho mỗi câu hỏi</p></div>
                <Toggle checked={s.timeLimitEnabled !== false} onChange={v => updateSetting('timeLimitEnabled', v)} />
            </div>
            {/* Phụ thuộc "Giới hạn thời gian" — đặt riêng cho từng chế độ. */}
            {s.timeLimitEnabled !== false && (
                <div className="setting-item" style={{ display: 'block', ...NESTED }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div className="setting-info">
                            <h4>Thời gian mỗi câu</h4>
                            <p>Chọn chế độ (hoặc “Toàn bộ”) rồi đặt số giây cho mỗi câu hỏi</p>
                        </div>
                        {/* Hai select cạnh nhau — cả CỤM rộng đúng bằng một
                            select thường, rồi chia đôi bên trong. Không ghim thì
                            mỗi cái tự lấy 240px và hàng này rộng gấp đôi. */}
                        <div className="setting-inline-group" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <select value={tmMode} onChange={e => setTmMode(e.target.value)} title="Áp dụng cho chế độ nào">
                                <option value="all">Toàn bộ</option>
                                {QUESTION_TIME_MODES.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                            <select value={tmVal} onChange={e => applyTmTime(e.target.value)} title="Số giây mỗi câu">
                                {/* Rỗng = các chế độ đang KHÁC nhau, không phải "chưa đặt". */}
                                {tmVal === '' && <option value="" disabled>— đang khác nhau —</option>}
                                {tmOptions.map(sec => <option key={sec} value={sec}>{sec}s</option>)}
                            </select>
                        </div>
                    </div>
                    <div style={{ marginTop: 10, borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
                        {QUESTION_TIME_MODES.map(m => {
                            const isDef = typeof qt[m.id] !== 'number';
                            return (
                                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '3px 0', color: 'var(--text-secondary)' }}>
                                    <span>{m.name}</span>
                                    <span style={{ color: isDef ? 'var(--text-tertiary, #94a3b8)' : 'var(--primary-color)', fontWeight: 600 }}>
                                        {effSec(m.id)}s{isDef ? ' (mặc định)' : ''}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            {/* Kiểu hỏi cho chế độ "Ôn lại từ sai".
                Chế độ đó trộn ba kiểu trong CÙNG một lượt — câu này chọn nghĩa,
                câu sau gõ từ. Mặc định hệ thống tự chọn theo mức thuộc SM-2 của
                từng từ; ai muốn chủ động thì bỏ tick để tắt kiểu không thích. */}
            <div className="setting-item setting-item--column">
                <div className="setting-info">
                    <h4>Kiểu hỏi khi ôn từ sai</h4>
                    <p>Bỏ tick để tắt kiểu không muốn gặp. Bỏ hết = dùng cả ba.</p>
                </div>
                <div className="review-kinds">
                    {REVIEW_KINDS.map(k => {
                        const dangBat = kindsChon.includes(k.key);
                        return (
                            <label key={k.key} className="review-kind">
                                <input
                                    type="checkbox"
                                    checked={dangBat}
                                    onChange={() => toggleKind(k.key)}
                                />
                                <span className="review-kind-body">
                                    <strong>{k.label}</strong>
                                    <em>{k.desc}</em>
                                </span>
                            </label>
                        );
                    })}
                </div>
            </div>

            <div className="setting-item">
                <div className="setting-info">
                    <h4>Tự động chuyển câu</h4>
                    <p>Tắt để tự bấm ← Trước / Tiếp → sau mỗi câu</p>
                </div>
                <Toggle checked={s.autoAdvance !== false} onChange={v => updateSetting('autoAdvance', v)} />
            </div>
            <div className="setting-item">
                <label>Độ khó</label>
                {/* Nhãn đổi theo ngôn ngữ: tiếng Trung phân cấp theo HSK, không
                    phải khung châu Âu — ghi "A1-A2" ở đó là sai hẳn hệ quy chiếu. */}
                <select value={s.difficulty || 'adaptive'} onChange={e => handleDifficulty(e.target.value)}>
                    {BANDS.map(b => (
                        <option key={b} value={b}>{bandLabel(b, s.vocabLang || 'en')}</option>
                    ))}
                </select>
            </div>
            <div className="setting-item">
                <div className="setting-info">
                    <h4>Ngôn ngữ từ vựng</h4>
                    <p>Chọn bộ từ vựng để luyện tập</p>
                </div>
                <select value={s.vocabLang || 'en'} onChange={async e => {
                    const next = e.target.value;
                    updateSetting('vocabLang', next);
                    try {
                        localStorage.setItem('vocabLang', next);
                    } catch {}
                    // Dịch bộ lọc độ khó sang khung của ngôn ngữ MỚI (en → CEFR,
                    // zh → HSK). Bộ lọc so khớp CHÍNH XÁC từng chuỗi nên giữ
                    // nguyên `['A1','A2']` khi sang tiếng Trung là lọc ra 0 từ.
                    const st = window.GameState?.state?.settings;
                    if (st?.difficulty && st.difficulty !== 'adaptive') {
                        updateSetting('levelFilter', levelsFor(st.difficulty, next));
                    }
                    // ĐỢI ghi xong mới reload: `updateSetting` gọi `save()` vốn
                    // hoãn 100ms rồi trả về ngay, reload giết trang trước khi nó
                    // kịp gửi → server vẫn giữ ngôn ngữ cũ, load lại nhảy về.
                    try {
                        await window.GameState?.saveNow?.();
                    } catch { /* mạng hỏng — localStorage đã đúng, save sau đẩy lên */ }
                    window.location.reload();
                }}>
                    <option value="en">🇬🇧 Tiếng Anh (EN)</option>
                    <option value="zh">🇨🇳 Tiếng Trung (ZH)</option>
                </select>
            </div>
        </div>
    );
}
