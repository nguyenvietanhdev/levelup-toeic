import { useState, useRef, useCallback } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { GameLogic } from '@game/gameLogic.js';
import { GameState } from '@game/state.js';
import { Energy } from '@game/energy.js';
import { Notification } from '@ui/Toaster.jsx';
import { ReadingAPI } from '@api/reading.js';
import LichSuMode from '../history/LichSuMode.jsx';
import DanhSachVai from '../roles/DanhSachVai.jsx';
import { getVocabLang } from '@api/vocabulary.js';
import { TopicSelector } from '@components/vocab/topic/topicSelector.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';

/**
 * Luyện ĐỌC HIỂU dạng TOEIC Part 7.
 *
 * Đây là phần chiếm tỉ trọng lớn nhất của đề Reading (54/200 câu) mà ngân hàng
 * đề trong app không có câu nào. Mọi chế độ khác hỏi TỪ đơn lẻ hoặc một câu;
 * chỗ này là nơi duy nhất luyện đọc một văn bản dài rồi suy ra thông tin.
 *
 * Đáp án nằm ở SERVER cho tới lúc nộp — client chỉ có đề và bốn lựa chọn.
 */

const NHAN = ['A', 'B', 'C', 'D'];

const MUC_KHO = [
    { key: 'easy', label: 'Dễ', desc: '2 câu · bài ngắn' },
    { key: 'medium', label: 'Vừa', desc: '3 câu' },
    { key: 'hard', label: 'Khó', desc: '4 câu · bài dài' },
];

const DANG = [
    { key: '', label: 'Ngẫu nhiên' },
    { key: 'email', label: 'Email' },
    { key: 'notice', label: 'Thông báo' },
    { key: 'advertisement', label: 'Quảng cáo' },
    { key: 'article', label: 'Bài báo' },
];

/**
 * Vài từ trong bộ đang học, để bài đọc bám vào vốn từ vừa luyện.
 *
 * Lấy NGẪU NHIÊN chứ không lấy 8 từ đầu: bộ từ xếp cố định, nên lấy đầu danh
 * sách thì mọi bài đọc đều xoay quanh đúng ngần ấy từ.
 */
function layTuGoiY(soLuong = 6) {
    const pool = Array.isArray(GameLogic.vocabularyData) ? GameLogic.vocabularyData : [];
    if (!pool.length) return [];
    return [...pool].sort(() => Math.random() - 0.5).slice(0, soLuong)
        .map((w) => String(w?.en || '')).filter(Boolean);
}

export default function ReadingScreen({ active }) {
    const { showScreen, syncFromState } = useGame();

    const [de, setDe] = useState(null);      // { readingId, title, passage, questions[] }
    const [chon, setChon] = useState([]);    // nhãn A–D theo thứ tự câu
    const [result, setResult] = useState(null);
    const [level, setLevel] = useState('medium');
    const [tab, setTab] = useState('luyen'); // 'luyen' | 'lichsu'
    const [dang, setDang] = useState('');
    const [loadingDe, setLoadingDe] = useState(false);
    const [grading, setGrading] = useState(false);

    // `onBought` của popup nạp năng lượng gọi lại chính `handleNop` — không đưa
    // được `handleNop` vào deps của chính nó.
    const nopRef = useRef(null);

    const handleDeMoi = useCallback(async () => {
        if (loadingDe) return;
        setLoadingDe(true);
        try {
            const d = await ReadingAPI.passage({ words: layTuGoiY(), level, dang });
            if (!d?.questions?.length) throw new Error('Server trả về bài đọc không hợp lệ');
            setDe(d);
            // Bài mới thì xoá lựa chọn cũ — giữ lại là các câu đã tick sẵn đáp
            // án của bài trước, mà thứ tự câu hoàn toàn khác.
            setChon(new Array(d.questions.length).fill(''));
            setResult(null);
        } catch (err) {
            Notification.error(String(err?.message || 'Không lấy được bài đọc'));
        } finally {
            setLoadingDe(false);
        }
    }, [loadingDe, level, dang]);

    const handleNop = useCallback(async () => {
        if (grading || !de) return;

        setGrading(true);
        try {
            const d = await ReadingAPI.grade({ readingId: de.readingId, answers: chon });
            if (!d?.details) throw new Error('Server trả về kết quả không hợp lệ');
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
            // Đề hết hạn (server khởi động lại, hoặc để quá 1 giờ). Chưa trừ
            // năng lượng nên chỉ cần xin bài mới — nói rõ thay vì báo lỗi chung.
            if (err?.expired) {
                Notification.warning('Bài đọc đã hết hạn — đang lấy bài mới.');
                setDe(null);
                setResult(null);
                return;
            }
            if (err?.energyNeeded) {
                Energy.showRefillModal({
                    needed: err.energyNeeded,
                    onBought: () => { nopRef.current?.(); },
                });
                return;
            }
            Notification.error(String(err?.message || 'Không chấm được bài'));
        } finally {
            setGrading(false);
        }
    }, [grading, de, chon, syncFromState]);

    nopRef.current = handleNop;

    const daLam = chon.filter(Boolean).length;
    const tongCau = de?.questions?.length || 0;

    return (
        <div id="reading-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-book-open-reader"></i> Đọc hiểu Part 7</h2>
            </div>

            <div className="tr-tabs">
                <button className={`tr-tab${tab === 'luyen' ? ' is-on' : ''}`} onClick={() => setTab('luyen')}>
                    <i className="fas fa-pen"></i> Luyện
                </button>
                <button className={`tr-tab${tab === 'lichsu' ? ' is-on' : ''}`} onClick={() => setTab('lichsu')}>
                    <i className="fas fa-clock-rotate-left"></i> Lịch sử
                </button>
            </div>

            {tab === 'lichsu' ? <LichSuMode mode="doc" /> : !de ? (
                <div className="essay-intro">
                    <DanhSachVai
                        source={TopicSelector.currentTopic?.source || ''}
                        part={PartSelector.selectedPart || ''}
                        lang={getVocabLang()}
                    />
                    <p>
                        Đọc một văn bản công sở (email, thông báo, quảng cáo…) rồi trả lời
                        câu hỏi — <strong>đúng dạng TOEIC Part 7</strong>, phần chiếm tỉ
                        trọng lớn nhất của bài Reading.
                    </p>
                    <p className="tr-intro-note">
                        <i className="fas fa-circle-info"></i>{' '}
                        Bài đọc dùng chính bộ từ bạn đang học, và mỗi câu sai đều có giải
                        thích kèm dẫn chứng trong bài.
                    </p>

                    {/* Hai cột như Hội thoại: trái = loại bài, phải = độ khó. */}
                    <div className="ai-setup">
                        <div className="ai-setup-col">
                            <div className="ai-setup-title">Loại bài</div>
                            <div className="ai-setup-list rd-types">
                                {DANG.map((d) => (
                                    <button
                                        key={d.key}
                                        className={`tr-level${dang === d.key ? ' is-on' : ''}`}
                                        onClick={() => setDang(d.key)}
                                    >
                                        <strong>{d.label}</strong>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="ai-setup-col">
                            <div className="ai-setup-title">Độ khó</div>
                            <div className="ai-setup-list tr-levels">
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
                        </div>
                    </div>

                    <button className="btn btn-primary" onClick={handleDeMoi} disabled={loadingDe}>
                        {loadingDe
                            ? <><i className="fas fa-spinner fa-spin"></i> Đang soạn bài…</>
                            : <><i className="fas fa-file-lines"></i> Lấy bài đọc</>}
                    </button>
                </div>
            ) : (
                <div className="essay-body">
                    <div className="rd-passage">
                        <div className="essay-prompt-head">
                            <span>
                                {de.title || 'Bài đọc'}
                                {de.dangVi ? ` · ${de.dangVi}` : ''}
                            </span>
                            <button
                                className="icon-btn"
                                title="Đổi bài khác"
                                onClick={handleDeMoi}
                                disabled={loadingDe || grading}
                            >
                                <i className={`fas fa-rotate-right${loadingDe ? ' fa-spin' : ''}`}></i>
                            </button>
                        </div>
                        {/* `white-space: pre-wrap` giữ xuống dòng của email/thông báo —
                            gộp thành một khối chữ liền thì mất luôn bố cục vốn là một
                            phần của việc đọc hiểu Part 7. */}
                        <p className="rd-passage-text">{de.passage}</p>
                    </div>

                    <div className="rd-questions">
                        {de.questions.map((q, i) => {
                            const ket = result?.details?.[i];
                            return (
                                <div
                                    key={i}
                                    className={`rd-q${ket ? (ket.correct ? ' is-right' : ' is-wrong') : ''}`}
                                >
                                    <div className="rd-q-text">
                                        <span className="rd-q-num">{i + 1}</span>
                                        {q.question}
                                    </div>
                                    <div className="rd-opts">
                                        {q.options.map((opt, k) => {
                                            const nhan = NHAN[k];
                                            const dangChon = chon[i] === nhan;
                                            // Sau khi chấm: tô đáp án ĐÚNG màu xanh dù
                                            // người học chọn gì — thấy đáp án đúng ở đâu
                                            // mới học được, chỉ biết mình sai thì không.
                                            const laDapAn = ket && ket.answer === nhan;
                                            const chonSai = ket && ket.chose === nhan && !ket.correct;
                                            return (
                                                <button
                                                    key={k}
                                                    className={`rd-opt${dangChon ? ' is-picked' : ''}${laDapAn ? ' is-right' : ''}${chonSai ? ' is-wrong' : ''}`}
                                                    disabled={!!result || grading}
                                                    onClick={() => setChon((c) => {
                                                        const n = [...c];
                                                        n[i] = nhan;
                                                        return n;
                                                    })}
                                                >
                                                    <span className="rd-opt-label">{nhan}</span>
                                                    <span>{opt}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {ket?.explain && (
                                        <p className="rd-explain">
                                            <i className="fas fa-lightbulb"></i> {ket.explain}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {!result ? (
                        <div className="essay-actions">
                            <span className={`essay-count${daLam === tongCau ? ' is-ok' : ''}`}>
                                Đã chọn {daLam} / {tongCau}
                            </span>
                            {/* KHÔNG chặn nộp khi còn bỏ trống: trong đề thi thật vẫn
                                nộp được, và câu bỏ trống tính sai. Chặn ở đây là dạy
                                một thói quen không tồn tại trong phòng thi. */}
                            <button className="btn btn-primary" onClick={handleNop} disabled={grading}>
                                {grading
                                    ? <><i className="fas fa-spinner fa-spin"></i> Đang chấm…</>
                                    : <><i className="fas fa-check-double"></i> Nộp bài</>}
                            </button>
                        </div>
                    ) : (
                        <div className="essay-result">
                            <div className="essay-band">
                                <div className="essay-band-num">{result.correct}/{result.total}</div>
                                <div className="essay-band-label">Số câu đúng</div>
                            </div>
                            <p className="essay-reward">
                                +{result.reward?.xp || 0} XP · +{result.reward?.coins || 0} xu
                            </p>
                            <div className="essay-result-actions">
                                <button className="btn btn-primary" onClick={handleDeMoi}>
                                    <i className="fas fa-rotate-right"></i> Bài đọc khác
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
