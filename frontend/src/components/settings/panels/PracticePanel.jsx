// "Practice" panel. Presentational — state/handlers passed from SettingsScreen.
import { useState } from 'react';
import Toggle from './Toggle.jsx';
import { QUESTION_TIME_MODES, getQuestionTimeDefault } from '@components/practice/questionTime.js';

const SEC_OPTIONS = [10, 15, 20, 25, 30, 45, 60, 90, 120];

// Thụt lề + vạch trái cho cài đặt PHỤ THUỘC một toggle phía trên → nhìn ra quan hệ cha–con.
const NESTED = { paddingLeft: 14, borderLeft: '2px solid var(--border-color)' };

export default function PracticePanel({ s, handleQPS, updateSetting, handleDifficulty, reverseMode, handleReverseMode }) {
    // Thời gian mỗi câu (per-mode). Select 1 chọn chế độ ("all" = toàn bộ).
    // Fallback: giá trị cũ timePerQuestion (dùng chung) nếu chế độ chưa có riêng.
    const [tmMode, setTmMode] = useState('all');
    const qt = s.questionTime || {};
    const legacy = (typeof s.timePerQuestion === 'number' && s.timePerQuestion > 0) ? s.timePerQuestion : null;
    const effSec = (id) => (typeof qt[id] === 'number' ? qt[id] : (legacy ?? getQuestionTimeDefault(id)));
    const firstSec = effSec(QUESTION_TIME_MODES[0].id);
    const allSame = QUESTION_TIME_MODES.every(m => effSec(m.id) === firstSec) ? firstSec : null;
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
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
            <div className="setting-item">
                <div className="setting-info">
                    <h4>Tự động chuyển câu</h4>
                    <p>Tắt để tự bấm ← Trước / Tiếp → sau mỗi câu</p>
                </div>
                <Toggle checked={s.autoAdvance !== false} onChange={v => updateSetting('autoAdvance', v)} />
            </div>
            {/* Chuyển từ tab Chung sang: đây là cài đặt cách LUYỆN TẬP, không phải
                giao diện — trước nó nằm dưới mục "Giao diện" nên không ai tìm ra. */}
            <div className="setting-item">
                <div className="setting-info">
                    <h4>Đảo chiều luyện tập</h4>
                    <p>Chuyển EN→VN ⇄ VN→EN. Áp dụng cho: Trắc nghiệm, Điền từ, Nghe &amp; chọn, Thẻ từ vựng, Tốc độ, Ôn lại từ sai.</p>
                </div>
                <Toggle checked={reverseMode} onChange={handleReverseMode} />
            </div>
            <div className="setting-item">
                <label>Độ khó</label>
                <select value={s.difficulty || 'adaptive'} onChange={e => handleDifficulty(e.target.value)}>
                    <option value="easy">Dễ (A1-A2)</option>
                    <option value="medium">Trung bình (B1-B2)</option>
                    <option value="hard">Khó (C1-C2)</option>
                    <option value="adaptive">Toàn bộ</option>
                </select>
            </div>
            <div className="setting-item">
                <div className="setting-info">
                    <h4>Ngôn ngữ từ vựng</h4>
                    <p>Chọn bộ từ vựng để luyện tập</p>
                </div>
                <select value={s.vocabLang || 'en'} onChange={e => {
                    const next = e.target.value;
                    updateSetting('vocabLang', next);
                    try {
                        localStorage.setItem('vocabLang', next);
                    } catch {}
                    window.location.reload();
                }}>
                    <option value="en">🇬🇧 Tiếng Anh (EN)</option>
                    <option value="zh">🇨🇳 Tiếng Trung (ZH)</option>
                </select>
            </div>
        </div>
    );
}
