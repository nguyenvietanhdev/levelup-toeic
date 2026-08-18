import { useState, useRef, useCallback } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { GameState } from '@game/state.js';
import { Energy } from '@game/energy.js';
import { Notification } from '@ui/Toaster.jsx';
import { EssayAPI } from '@api/essay.js';

/**
 * Luyện VIẾT LUẬN — chấm theo 4 tiêu chí IELTS Writing Task 2.
 *
 * Đếm từ chạy ở client cho phản hồi tức thì, nhưng con số quyết định (đủ 250 từ
 * hay chưa, band bao nhiêu) do SERVER tính lại — client chỉ hiển thị.
 */

/** Bốn tiêu chí, kèm nhãn tiếng Việt. Trùng với `CRITERIA` ở server. */
const CRITERIA = [
    { key: 'taskResponse', label: 'Task Response', vi: 'Trả lời đúng đề' },
    { key: 'coherence', label: 'Coherence & Cohesion', vi: 'Mạch lạc & liên kết' },
    { key: 'lexical', label: 'Lexical Resource', vi: 'Vốn từ vựng' },
    { key: 'grammar', label: 'Grammatical Range', vi: 'Ngữ pháp' },
];

const MIN_WORDS = 250;

/** Đếm từ — chỉ để hiện số cho người viết, server tự đếm lại. */
function countWords(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

export default function EssayScreen({ active }) {
    const { showScreen, syncFromState } = useGame();

    const [prompt, setPrompt] = useState(null);   // { prompt, type, topicHint }
    const [essay, setEssay] = useState('');
    const [result, setResult] = useState(null);
    const [loadingPrompt, setLoadingPrompt] = useState(false);
    const [grading, setGrading] = useState(false);

    // `onBought` của popup nạp năng lượng gọi lại chính `handleGrade` — không
    // đưa được `handleGrade` vào deps của chính nó.
    const gradeRef = useRef(null);

    const words = countWords(essay);
    const enough = words >= MIN_WORDS;

    const handleNewPrompt = useCallback(async () => {
        if (loadingPrompt) return;
        setLoadingPrompt(true);
        try {
            const d = await EssayAPI.prompt();
            if (!d?.prompt) throw new Error('Server trả về đề không hợp lệ');
            setPrompt(d);
            // Đề mới thì bỏ bài cũ — giữ lại là người dùng nộp nhầm bài của đề
            // trước, và AI sẽ chấm Task Response rất thấp mà họ không hiểu vì sao.
            setEssay('');
            setResult(null);
        } catch (err) {
            Notification.error(String(err?.message || 'Không lấy được đề'));
        } finally {
            setLoadingPrompt(false);
        }
    }, [loadingPrompt]);

    const handleGrade = useCallback(async () => {
        if (grading || !prompt) return;
        if (!enough) {
            // Chặn ở client cho nhanh — server vẫn kiểm lại, đây chỉ để đỡ một
            // vòng mạng và nói rõ còn thiếu bao nhiêu từ.
            Notification.warning(`Cần ít nhất ${MIN_WORDS} từ — bài của bạn đang có ${words} từ`);
            return;
        }

        setGrading(true);
        try {
            const d = await EssayAPI.grade({
                prompt: prompt.prompt,
                essay,
                promptType: prompt.type || '',
                topicHint: prompt.topicHint || '',
            });
            if (!d?.scores) throw new Error('Server trả về kết quả không hợp lệ');
            setResult(d);
            if (typeof d.energyRemaining === 'number') {
                GameState.setEnergy?.(d.energyRemaining);
            }
            GameState.creditServerRewards?.({
                xp: d.reward?.xp || 0,
                coins: d.reward?.coins || 0,
            });
            syncFromState?.();
        } catch (err) {
            // Thiếu năng lượng → mở popup nạp, mua xong chấm luôn. Chỉ báo lỗi
            // là bắt người dùng tự đi tìm cửa hàng rồi quay lại bấm lại — mà họ
            // vừa bỏ 40 phút viết bài.
            if (err?.energyNeeded) {
                Energy.showRefillModal({
                    needed: err.energyNeeded,
                    onBought: () => { gradeRef.current?.(); },
                });
                return;
            }
            Notification.error(String(err?.message || 'Không chấm được bài'));
        } finally {
            setGrading(false);
        }
    }, [grading, prompt, essay, enough, words, syncFromState]);

    gradeRef.current = handleGrade;

    return (
        <div id="essay-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-pen-nib"></i> Luyện viết luận</h2>
            </div>

            {!prompt ? (
                <div className="essay-intro">
                    <p>
                        Viết một bài luận IELTS Task 2 và được chấm theo <strong>4 tiêu chí
                        chính thức</strong>: trả lời đúng đề, mạch lạc, vốn từ và ngữ pháp.
                        Đề bài bám theo bộ từ bạn đang học.
                    </p>
                    <button className="btn btn-primary" onClick={handleNewPrompt} disabled={loadingPrompt}>
                        {loadingPrompt
                            ? <><i className="fas fa-spinner fa-spin"></i> Đang lấy đề…</>
                            : <><i className="fas fa-file-lines"></i> Lấy đề</>}
                    </button>
                </div>
            ) : (
                <div className="essay-body">
                    <div className="essay-prompt">
                        <div className="essay-prompt-head">
                            <span>Đề bài{prompt.type ? ` · ${prompt.type}` : ''}</span>
                            <button
                                className="icon-btn"
                                title="Đổi đề khác"
                                onClick={handleNewPrompt}
                                disabled={loadingPrompt || grading}
                            >
                                <i className={`fas fa-rotate-right${loadingPrompt ? ' fa-spin' : ''}`}></i>
                            </button>
                        </div>
                        <p>{prompt.prompt}</p>
                    </div>

                    {!result && (
                        <>
                            <textarea
                                className="essay-input"
                                value={essay}
                                onChange={e => setEssay(e.target.value)}
                                placeholder="Viết bài của bạn ở đây… (tối thiểu 250 từ)"
                                disabled={grading}
                                spellCheck={false}
                            />
                            <div className="essay-actions">
                                {/* Số từ đổi màu theo ngưỡng — người viết cần biết còn
                                    thiếu bao nhiêu mà không phải tự đếm. */}
                                <span className={`essay-count${enough ? ' is-ok' : ''}`}>
                                    {words} / {MIN_WORDS} từ
                                </span>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleGrade}
                                    disabled={grading || !enough}
                                >
                                    {grading
                                        ? <><i className="fas fa-spinner fa-spin"></i> Đang chấm…</>
                                        : <><i className="fas fa-check-double"></i> Chấm bài</>}
                                </button>
                            </div>
                        </>
                    )}

                    {result && (
                        <div className="essay-result">
                            <div className="essay-band">
                                <div className="essay-band-num">{result.overall}</div>
                                <div className="essay-band-label">Band tổng</div>
                            </div>

                            {/* Nói rõ đây là ƯỚC LƯỢNG. Band do AI chấm lệch 0.5–1.0 so
                                với giám khảo thật là bình thường — để người dùng tin đó
                                là điểm thi thật thì họ vào phòng thi mới vỡ mộng. */}
                            <p className="essay-disclaimer">
                                <i className="fas fa-circle-info"></i> Band do AI ước lượng,
                                dùng để theo dõi tiến bộ. Điểm thi thật có thể chênh lệch.
                            </p>

                            <div className="essay-criteria">
                                {CRITERIA.map(c => (
                                    <div key={c.key} className="essay-criterion">
                                        <div className="essay-criterion-head">
                                            <strong>{result.scores[c.key]}</strong>
                                            <span>{c.vi}</span>
                                        </div>
                                        {result.comments?.[c.key] && (
                                            <p>{result.comments[c.key]}</p>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {result.strengths?.length > 0 && (
                                <div className="essay-section">
                                    <h4><i className="fas fa-thumbs-up"></i> Làm tốt</h4>
                                    <ul>{result.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                                </div>
                            )}

                            {result.issues?.length > 0 && (
                                <div className="essay-section">
                                    <h4><i className="fas fa-triangle-exclamation"></i> Lỗi cần sửa</h4>
                                    {result.issues.map((e, i) => (
                                        <div key={i} className="essay-issue">
                                            <code>{e.quote}</code>
                                            <div className="essay-issue-note">{e.issue}</div>
                                            {e.fix && <div className="essay-issue-fix">→ {e.fix}</div>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {result.improved && (
                                <div className="essay-section">
                                    <h4><i className="fas fa-wand-magic-sparkles"></i> Gợi ý viết lại</h4>
                                    <p className="essay-improved">{result.improved}</p>
                                </div>
                            )}

                            <p className="essay-reward">
                                +{result.reward?.xp || 0} XP · +{result.reward?.coins || 0} xu
                            </p>

                            <div className="essay-result-actions">
                                <button className="btn btn-primary" onClick={handleNewPrompt}>
                                    <i className="fas fa-rotate-right"></i> Viết bài khác
                                </button>
                                <button className="btn btn-secondary" onClick={() => setResult(null)}>
                                    <i className="fas fa-pen"></i> Xem lại bài viết
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
