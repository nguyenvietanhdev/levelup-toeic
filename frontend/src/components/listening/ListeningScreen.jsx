import { useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { Notification } from '@ui/Toaster.jsx';
import { ListeningAPI } from '@api/listening.js';
import { TopicSelector } from '@components/vocab/topic/topicSelector.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';

/** Mức khó của đoạn nghe (khoá gửi server; server chọn dải CEFR tương ứng). */
const MUC = [
    { key: 'easy', label: 'Dễ', desc: 'Câu ngắn, từ thông dụng' },
    { key: 'medium', label: 'Vừa', desc: 'Câu đầy đủ, từ công sở' },
    { key: 'hard', label: 'Khó', desc: 'Câu phức, từ ít gặp' },
];

/** Tốc độ đọc. Đổi tốc độ là đọc lại đoạn đó, không mất bài. */
const TOC_DO = [
    { v: 0.7, label: 'Chậm' },
    { v: 0.9, label: 'Vừa' },
    { v: 1.1, label: 'Nhanh' },
];

/**
 * Nghe với AI (TTS): nghe đoạn do AI viết từ bộ từ đang học, gõ lại những gì nghe
 * được, nhận điểm theo từ và đoạn gốc sau khi nộp.
 */
export default function ListeningScreen({ active }) {
    const { showScreen, syncFromState } = useGame();

    const [level, setLevel] = useState('medium');
    const [phien, setPhien] = useState(null);     // { id, totalTargets }
    const [tocDo, setTocDo] = useState(0.9);
    const [typed, setTyped] = useState('');
    const [ketQua, setKetQua] = useState(null);   // kết quả chấm sau khi nộp
    const [busy, setBusy] = useState(false);

    const source = TopicSelector.currentTopic?.source || '';
    const part = PartSelector.selectedPart || '';

    const batDau = async () => {
        setBusy(true);
        try {
            const d = await ListeningAPI.start({ level });
            setPhien(d);
            setTyped('');
            setKetQua(null);
            setTocDo(0.9);
            syncFromState?.();
        } catch (err) {
            Notification.error(String(err?.message || 'Không mở được bài nghe'));
        } finally {
            setBusy(false);
        }
    };

    const nop = async () => {
        if (!phien || !typed.trim()) return;
        setBusy(true);
        try {
            const d = await ListeningAPI.grade(phien.id, typed);
            setKetQua(d);
            syncFromState?.();
        } catch (err) {
            Notification.error(String(err?.message || 'Không chấm được bài'));
        } finally {
            setBusy(false);
        }
    };

    const baiMoi = () => {
        setPhien(null);
        setKetQua(null);
        setTyped('');
    };

    return (
        <div id="listening-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-headphones"></i> Nghe với AI</h2>
            </div>

            {!phien ? (
                <div className="essay-intro essay-intro--wide">
                    <p>
                        Nghe một đoạn ngắn do AI viết từ <strong>bộ từ bạn đang học</strong>, rồi
                        gõ lại những gì bạn nghe được. Bạn có thể nghe lại và đổi tốc độ.
                    </p>
                    {!source && (
                        <p className="tr-intro-note">
                            Chọn đề và Part ở thanh trên trước khi bắt đầu.
                        </p>
                    )}
                    <div className="ai-setup-title">Độ khó</div>
                    <div className="ai-setup-list tr-levels">
                        {MUC.map((m) => (
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
                    <button className="btn btn-primary" onClick={batDau} disabled={busy}>
                        <i className="fas fa-play"></i> {busy ? 'Đang chuẩn bị…' : 'Bắt đầu nghe'}
                    </button>
                </div>
            ) : (
                <div className="listening-body">
                    <p className="tr-intro-note">
                        {phien.totalTargets} từ mục tiêu trong đoạn này.
                    </p>

                    {/* Âm thanh: đổi tốc độ là đổi `src`, nên đoạn được đọc lại từ đầu. */}
                    <div className="listening-player">
                        <audio
                            key={`${phien.id}-${tocDo}`}
                            controls
                            autoPlay
                            src={ListeningAPI.audioUrl(phien.id, tocDo)}
                        />
                        <div className="listening-speed">
                            {TOC_DO.map((t) => (
                                <button
                                    key={t.v}
                                    className={`tr-level${tocDo === t.v ? ' is-on' : ''}`}
                                    onClick={() => setTocDo(t.v)}
                                >
                                    <strong>{t.label}</strong>
                                </button>
                            ))}
                        </div>
                    </div>

                    {!ketQua ? (
                        <>
                            <label className="ai-role-label">Gõ lại những gì bạn nghe được</label>
                            <textarea
                                className="ai-role-input"
                                rows={4}
                                maxLength={1000}
                                value={typed}
                                onChange={(e) => setTyped(e.target.value)}
                                placeholder="Gõ đoạn bạn nghe được bằng tiếng Anh…"
                            />
                            <div className="ai-role-actions">
                                <button className="btn btn-primary" onClick={nop} disabled={busy || !typed.trim()}>
                                    <i className="fas fa-check"></i> Nộp bài
                                </button>
                                <button className="btn btn-secondary" onClick={baiMoi} disabled={busy}>
                                    Bỏ bài này
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="listening-result">
                            <p>
                                Điểm <strong>{ketQua.score}</strong>/100 · đúng{' '}
                                <strong>{ketQua.correct}</strong>/{ketQua.total} từ
                            </p>
                            {ketQua.reward && !ketQua.alreadyClaimed && (
                                <p className="convo-reward">
                                    +{ketQua.reward.xp} XP · +{ketQua.reward.coins} xu
                                </p>
                            )}
                            {ketQua.missing?.length > 0 && (
                                <p>
                                    <strong>Bỏ sót:</strong> {ketQua.missing.join(', ')}
                                </p>
                            )}
                            {ketQua.extra?.length > 0 && (
                                <p>
                                    <strong>Gõ thừa:</strong> {ketQua.extra.join(', ')}
                                </p>
                            )}
                            <div className="ai-role-foot"><strong>Đoạn gốc</strong></div>
                            <p className="listening-passage">{ketQua.passage}</p>
                            <div className="ai-role-actions">
                                <button className="btn btn-primary" onClick={baiMoi}>
                                    <i className="fas fa-rotate-right"></i> Bài mới
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
