import { useState, useRef, useCallback } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { GameState } from '@game/state.js';
import { GameLogic } from '@game/gameLogic.js';
import { Energy } from '@game/energy.js';
import { Notification } from '@ui/Toaster.jsx';
import { TranslationAPI } from '@api/translation.js';
import MistakeLog from './MistakeLog.jsx';

/**
 * Luyện DỊCH — đọc một đoạn tiếng Việt, viết lại bằng tiếng Anh (hoặc Trung).
 *
 * Khác Viết luận ở chỗ quan trọng nhất: nội dung bị ẤN ĐỊNH sẵn. Viết luận thì
 * người học tự chọn nói gì, nên khi bí ý họ viết vòng quanh bằng vốn từ an toàn
 * và chỗ yếu không lộ ra. Dịch thì muốn đúng phải gọi tên đúng thứ trong bản
 * gốc — không né được.
 *
 * Ba trục điểm chứ không một điểm tổng: lỗi hay gặp nhất khi dịch là câu ĐÚNG
 * NGỮ PHÁP HOÀN TOÀN nhưng người bản ngữ không nói thế. Một điểm tổng giấu mất
 * đúng chuyện đó.
 */

/** Ba trục chấm. Trùng `CRITERIA` ở server. */
const CRITERIA = [
    { key: 'accuracy', vi: 'Đủ ý & đúng nghĩa', icon: 'fa-bullseye' },
    { key: 'grammar', vi: 'Ngữ pháp & chính tả', icon: 'fa-spell-check' },
    { key: 'naturalness', vi: 'Tự nhiên như người bản ngữ', icon: 'fa-comment-dots' },
];

const MUC_KHO = [
    { key: 'easy', label: 'Dễ', desc: '3 câu' },
    { key: 'medium', label: 'Vừa', desc: '4 câu' },
    { key: 'hard', label: 'Khó', desc: '5 câu' },
];

/** Ngưỡng mặc định khi CHƯA có đề (server gửi số thật kèm đoạn văn). */
const MIN_EN = 15;
const MIN_ZH = 20;

/**
 * Đếm theo đơn vị ĐÚNG với ngôn ngữ.
 *
 * Tiếng Trung không đặt khoảng trắng giữa các từ, nên đếm theo khoảng trắng thì
 * cả bản dịch ra đúng 1 — người học viết 30 chữ vẫn thấy "1 / 20" và nút Chấm
 * không bao giờ bật. Chỉ đếm chữ Hán, bỏ dấu câu để không nhồi 。，được.
 */
function countUnits(text, lang) {
    if (lang === 'zh') {
        const m = String(text || '').match(/[一-鿿㐀-䶿]/g);
        return m ? m.length : 0;
    }
    return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Vài từ trong bộ đang học, để server ra đề bám vào đúng vốn từ vừa luyện.
 *
 * Lấy NGẪU NHIÊN chứ không lấy 8 từ đầu: bộ từ xếp cố định, nên lấy đầu danh
 * sách thì mọi lượt dịch đều xoay quanh đúng ngần ấy từ.
 */
function layTuGoiY(soLuong = 6) {
    const pool = Array.isArray(GameLogic.vocabularyData) ? GameLogic.vocabularyData : [];
    if (!pool.length) return [];
    const chon = [...pool].sort(() => Math.random() - 0.5).slice(0, soLuong);
    return chon.map((w) => String(w?.en || '')).filter(Boolean);
}

export default function TranslationScreen({ active }) {
    const { showScreen, syncFromState } = useGame();

    const [de, setDe] = useState(null);       // { passage, topic, words, level, lang, minUnits }
    const [banDich, setBanDich] = useState('');
    const [result, setResult] = useState(null);
    const [level, setLevel] = useState('medium');
    const [loadingDe, setLoadingDe] = useState(false);
    const [grading, setGrading] = useState(false);
    // 'lam' = làm bài · 'loi' = nhật ký lỗi. Đặt chung màn thay vì tách riêng:
    // xem mình hay sai gì rồi làm bài ngay là một mạch, tách ra thì phải nhớ
    // đường quay lại.
    const [tab, setTab] = useState('lam');

    // `onBought` của popup nạp năng lượng gọi lại chính `handleGrade` — không
    // đưa được `handleGrade` vào deps của chính nó.
    const gradeRef = useRef(null);

    // Ngôn ngữ và ngưỡng do SERVER quyết, gửi kèm đề. TRƯỚC khi có đề thì đọc
    // tạm từ GameState để màn giới thiệu nói đúng ngôn ngữ ngay từ đầu.
    const langLocal = GameState.state?.settings?.vocabLang === 'zh' ? 'zh' : 'en';
    const lang = de ? (de.lang === 'zh' ? 'zh' : 'en') : langLocal;
    const minUnits = Number(de?.minUnits) || (lang === 'zh' ? MIN_ZH : MIN_EN);
    const unit = lang === 'zh' ? 'chữ' : 'từ';
    const tenNgonNgu = lang === 'zh' ? 'tiếng Trung' : 'tiếng Anh';

    const soDonVi = countUnits(banDich, lang);
    const enough = soDonVi >= minUnits;

    const handleDeMoi = useCallback(async () => {
        if (loadingDe) return;
        setLoadingDe(true);
        try {
            const d = await TranslationAPI.passage({ words: layTuGoiY(), level });
            if (!d?.passage) throw new Error('Server trả về đoạn văn không hợp lệ');
            setDe(d);
            // Đề mới thì bỏ bài cũ — giữ lại là người dùng nộp nhầm bản dịch của
            // đoạn trước, và AI chấm "đủ ý" rất thấp mà họ không hiểu vì sao.
            setBanDich('');
            setResult(null);
        } catch (err) {
            Notification.error(String(err?.message || 'Không lấy được đoạn văn'));
        } finally {
            setLoadingDe(false);
        }
    }, [loadingDe, level]);

    const handleGrade = useCallback(async () => {
        if (grading || !de) return;
        if (!enough) {
            // Chặn ở client cho nhanh — server vẫn kiểm lại, đây chỉ để đỡ một
            // vòng mạng và nói rõ còn thiếu bao nhiêu.
            Notification.warning(
                `Cần ít nhất ${minUnits} ${unit} — bản dịch của bạn đang có ${soDonVi} ${unit}`);
            return;
        }

        setGrading(true);
        try {
            const d = await TranslationAPI.grade({
                passage: de.passage,
                translation: banDich,
                topic: de.topic || '',
                words: de.words || [],
                level: de.level || 'medium',
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
            // Thiếu năng lượng → mở popup nạp, mua xong chấm luôn. Chỉ báo lỗi là
            // bắt người dùng tự đi tìm cửa hàng rồi quay lại bấm lại — mà họ vừa
            // ngồi dịch xong cả đoạn.
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
    }, [grading, de, banDich, enough, soDonVi, minUnits, unit, syncFromState]);

    gradeRef.current = handleGrade;

    return (
        <div id="translation-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-language"></i> Dịch đoạn văn</h2>
            </div>

            <div className="tr-tabs">
                <button
                    className={`tr-tab${tab === 'lam' ? ' is-on' : ''}`}
                    onClick={() => setTab('lam')}
                >
                    <i className="fas fa-pen"></i> Làm bài
                </button>
                <button
                    className={`tr-tab${tab === 'loi' ? ' is-on' : ''}`}
                    onClick={() => setTab('loi')}
                >
                    <i className="fas fa-clipboard-list"></i> Nhật ký lỗi
                </button>
            </div>

            {tab === 'loi' ? <MistakeLog /> : (
            <>
            {!de ? (
                <div className="essay-intro">
                    <p>
                        Đọc một đoạn <strong>tiếng Việt</strong> rồi viết lại bằng{' '}
                        <strong>{tenNgonNgu}</strong>. Bài được chấm theo{' '}
                        <strong>3 tiêu chí</strong>: đủ ý, ngữ pháp, và mức tự nhiên — kèm một
                        bản dịch tham khảo để bạn đối chiếu.
                    </p>
                    <p className="tr-intro-note">
                        <i className="fas fa-circle-info"></i>{' '}
                        Đoạn văn bám theo bộ từ bạn đang học, nên dịch xong là ôn lại luôn
                        vốn từ vừa luyện.
                    </p>

                    <div className="tr-levels">
                        {MUC_KHO.map((m) => (
                            <button
                                key={m.key}
                                className={`tr-level${level === m.key ? ' is-on' : ''}`}
                                onClick={() => setLevel(m.key)}
                            >
                                <strong>{m.label}</strong>
                                <em>{m.desc}</em>
                            </button>
                        ))}
                    </div>

                    <button className="btn btn-primary" onClick={handleDeMoi} disabled={loadingDe}>
                        {loadingDe
                            ? <><i className="fas fa-spinner fa-spin"></i> Đang lấy đoạn văn…</>
                            : <><i className="fas fa-file-lines"></i> Lấy đoạn văn</>}
                    </button>
                </div>
            ) : (
                <div className="essay-body">
                    <div className="essay-prompt">
                        <div className="essay-prompt-head">
                            <span>Đoạn văn cần dịch{de.topic ? ` · ${de.topic}` : ''}</span>
                            <button
                                className="icon-btn"
                                title="Đổi đoạn khác"
                                onClick={handleDeMoi}
                                disabled={loadingDe || grading}
                            >
                                <i className={`fas fa-rotate-right${loadingDe ? ' fa-spin' : ''}`}></i>
                            </button>
                        </div>
                        <p>{de.passage}</p>
                    </div>

                    {!result && (
                        <>
                            <textarea
                                className="essay-input"
                                value={banDich}
                                onChange={e => setBanDich(e.target.value)}
                                placeholder={`Viết bản dịch ${tenNgonNgu} của bạn ở đây…`}
                                disabled={grading}
                                spellCheck={false}
                            />
                            <div className="essay-actions">
                                <span className={`essay-count${enough ? ' is-ok' : ''}`}>
                                    {soDonVi} / {minUnits} {unit}
                                </span>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleGrade}
                                    disabled={grading || !enough}
                                >
                                    {grading
                                        ? <><i className="fas fa-spinner fa-spin"></i> Đang chấm…</>
                                        : <><i className="fas fa-check-double"></i> Chấm bản dịch</>}
                                </button>
                            </div>
                        </>
                    )}

                    {result && (
                        <div className="essay-result">
                            <div className="essay-band">
                                <div className="essay-band-num">{result.overall}</div>
                                <div className="essay-band-label">Điểm tổng (thang 9)</div>
                            </div>

                            {/* Nói rõ đây là ƯỚC LƯỢNG — để người dùng tin đó là điểm
                                thi thật thì họ vào phòng thi mới vỡ mộng. */}
                            <p className="essay-disclaimer">
                                <i className="fas fa-circle-info"></i>{' '}
                                Điểm do AI ước lượng theo thang 9 của app, dùng để theo dõi
                                tiến bộ.
                            </p>

                            <div className="essay-criteria">
                                {CRITERIA.map(c => (
                                    <div key={c.key} className="essay-criterion">
                                        <div className="essay-criterion-head">
                                            <strong>{result.scores[c.key]}</strong>
                                            <span><i className={`fas ${c.icon}`}></i> {c.vi}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {result.summary && (
                                <p className="tr-summary">{result.summary}</p>
                            )}

                            {result.notes?.length > 0 && (
                                <div className="essay-section">
                                    <h4><i className="fas fa-triangle-exclamation"></i> Chỗ nên sửa</h4>
                                    {result.notes.map((n, i) => (
                                        <div key={i} className="essay-issue">
                                            {n.quote && <code>{n.quote}</code>}
                                            <div className="essay-issue-note">{n.issue}</div>
                                            {n.better && <div className="essay-issue-fix">→ {n.better}</div>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Bản dịch tham khảo đặt CUỐI, sau phần lỗi: đọc đáp án
                                trước thì phần nhận xét về bài mình thành ra thừa. Với
                                dịch thuật, thấy một cách diễn đạt khác dạy nhiều hơn
                                đọc lời phê. */}
                            {result.reference && (
                                <div className="essay-section">
                                    <h4><i className="fas fa-wand-magic-sparkles"></i> Bản dịch tham khảo</h4>
                                    <p className="essay-improved">{result.reference}</p>
                                </div>
                            )}

                            <p className="essay-reward">
                                +{result.reward?.xp || 0} XP · +{result.reward?.coins || 0} xu
                            </p>

                            <div className="essay-result-actions">
                                <button className="btn btn-primary" onClick={handleDeMoi}>
                                    <i className="fas fa-rotate-right"></i> Dịch đoạn khác
                                </button>
                                <button className="btn btn-secondary" onClick={() => setResult(null)}>
                                    <i className="fas fa-pen"></i> Xem lại bản dịch
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
            </>
            )}
        </div>
    );
}
