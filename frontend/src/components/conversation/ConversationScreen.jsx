import { useState, useRef, useEffect, useCallback } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { GameState } from '@game/state.js';
import { GameLogic, ttsLang } from '@game/gameLogic.js';
import { Notification } from '@ui/Toaster.jsx';
import { ConversationAPI } from '@api/conversation.js';
import { getVocabLang } from '@api/vocabulary.js';
import { TopicSelector } from '@components/vocab/topic/topicSelector.js';
import { isSpeechSupported, speechLangFor, createSpeechInput } from '@lib/speechInput.js';

/**
 * Chế độ HỘI THOẠI — luyện dùng lại từ vựng vừa học.
 *
 * NPC nói bằng ngôn ngữ đang học và cố tình dùng những từ trong bộ người học vừa
 * luyện; nhiệm vụ của người học là đáp lại có dùng được càng nhiều từ càng tốt.
 *
 * Điểm KHÔNG do màn này tính. Server chấm và trả về `matched` / `usedWords`;
 * ở đây chỉ hiển thị. Chép luật chấm sang client là mời gọi hai bên lệch nhau —
 * tô sáng một đằng, ăn điểm một nẻo, mà người dùng chỉ thấy "máy tính sai".
 */
export default function ConversationScreen({ active }) {
    const { showScreen, syncFromState } = useGame();

    const [convo, setConvo] = useState(null);       // { id, targetWords, turns, usedWords }
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);        // đang chờ server
    const [starting, setStarting] = useState(false);
    const [result, setResult] = useState(null);     // kết quả sau khi chốt
    const [speechOn, setSpeechOn] = useState(false);

    const speechRef = useRef(null);
    const scrollRef = useRef(null);
    const lang = getVocabLang();

    // Cuộn xuống lượt mới nhất. Không cuộn thì câu vừa hiện nằm dưới màn và
    // người dùng tưởng máy chưa trả lời.
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [convo?.turns?.length, result]);

    // Dừng micro khi rời màn. Thiếu thì micro chạy tiếp ở màn khác — vừa tốn
    // pin vừa là chuyện riêng tư.
    useEffect(() => {
        if (active) return;
        speechRef.current?.stop?.();
        setSpeechOn(false);
    }, [active]);

    /** Đọc câu của NPC. Dùng đúng bộ TTS sẵn có của app. */
    const speak = useCallback((text) => {
        if (!text) return;
        try { GameLogic.speakWord(text, ttsLang()); } catch { /* không đọc được thì thôi */ }
    }, []);

    const handleStart = useCallback(async () => {
        if (starting) return;
        // Đề đang chọn nằm ở `TopicSelector.currentTopic` (module vanilla), KHÔNG
        // ở `settings` — settings chỉ giữ `selectedPart`.
        const source = TopicSelector.currentTopic || '';
        const part = GameState.state?.settings?.selectedPart || '';

        if (!source) {
            Notification.error('Hãy chọn đề từ vựng trước khi luyện hội thoại');
            return;
        }

        setStarting(true);
        setResult(null);
        try {
            const data = await ConversationAPI.start({ source, part, lang });
            // Chốt cuối: không có `id` thì KHÔNG phải phiên hợp lệ.
            //
            // `unwrap` đã ném lỗi cho mọi thất bại đã biết, nhưng nếu server đổi
            // hình dạng phản hồi thì chỗ này là thứ chặn "phiên rỗng 0/0" —
            // trạng thái tệ nhất, vì người dùng tưởng tính năng chạy mà không
            // gõ được gì, và năng lượng thì đã trừ rồi.
            if (!data?.id) {
                throw new Error('Server trả về dữ liệu không hợp lệ');
            }
            setConvo({
                id: data.id,
                targetWords: data.targetWords || [],
                turns: data.turns || [],
                usedWords: data.usedWords || [],
            });
            // Năng lượng đã bị server trừ — đồng bộ lại ngay, không thì thanh
            // năng lượng vẫn hiện số cũ cho tới lần tải trang sau.
            if (typeof data.energyRemaining === 'number') {
                GameState.setEnergy?.(data.energyRemaining);
                syncFromState?.();
            }
            speak(data.turns?.[0]?.content);
        } catch (err) {
            Notification.error(String(err?.message || 'Không mở được hội thoại'));
        } finally {
            setStarting(false);
        }
    }, [starting, lang, speak, syncFromState]);

    const handleSend = useCallback(async () => {
        const text = draft.trim();
        if (!text || busy || !convo) return;

        setBusy(true);
        // Hiện câu của mình NGAY, không chờ server: chờ round-trip mới thấy chữ
        // thì cảm giác như máy treo.
        setConvo(c => ({ ...c, turns: [...c.turns, { role: 'user', content: text }] }));
        setDraft('');

        try {
            const data = await ConversationAPI.reply(convo.id, text);
            setConvo(c => {
                const turns = [...c.turns];
                // Gắn `matched` (server chấm) vào chính lượt vừa gửi để tô sáng.
                const last = turns.length - 1;
                if (turns[last]?.role === 'user') turns[last] = { ...turns[last], matched: data.matched || [] };
                if (data.npcReply) turns.push({ role: 'npc', content: data.npcReply });
                return { ...c, turns, usedWords: data.usedWords || c.usedWords };
            });
            if (data.npcReply) speak(data.npcReply);
            if (data.aiFailed) {
                // Câu của người học VẪN được chấm và lưu — chỉ mất câu đáp. Nói
                // rõ để họ không tưởng mất lượt.
                Notification.warning?.('Máy chưa trả lời được, nhưng câu của bạn đã được tính');
            }
        } catch (err) {
            Notification.error(String(err?.message || 'Không gửi được'));
        } finally {
            setBusy(false);
        }
    }, [draft, busy, convo, speak]);

    const handleFinish = useCallback(async () => {
        if (!convo || busy) return;
        setBusy(true);
        try {
            const data = await ConversationAPI.finish(convo.id);
            setResult(data);
            if (!data.alreadyClaimed) {
                // Cộng thưởng vào state để thanh XP/xu nhảy ngay.
                GameState.creditServerRewards?.({
                    xp: data.reward?.xp || 0,
                    coins: data.reward?.coins || 0,
                });
                syncFromState?.();
            }
        } catch (err) {
            Notification.error(String(err?.message || 'Không kết thúc được'));
        } finally {
            setBusy(false);
        }
    }, [convo, busy, syncFromState]);

    /** Bật/tắt micro — điền thẳng vào ô nhập. */
    const toggleMic = useCallback(() => {
        if (!isSpeechSupported()) {
            Notification.warning?.('Trình duyệt này không hỗ trợ nhập giọng nói — dùng Chrome hoặc Edge');
            return;
        }
        if (speechOn) {
            speechRef.current?.stop?.();
            setSpeechOn(false);
            return;
        }
        const s = createSpeechInput({
            lang: speechLangFor(lang),
            onText: (text) => setDraft(text),
            onStateChange: (on) => setSpeechOn(!!on),
        });
        speechRef.current = s;
        s.start?.();
        setSpeechOn(true);
    }, [speechOn, lang]);

    const used = new Set(convo?.usedWords || []);

    return (
        <div id="conversation-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-comments"></i> Hội thoại</h2>
            </div>

            {!convo ? (
                <div className="convo-intro">
                    <p>
                        Luyện nói bằng chính bộ từ bạn vừa học. Máy sẽ trò chuyện và
                        dùng những từ đó — bạn đáp lại, càng dùng được nhiều từ
                        càng nhiều thưởng.
                    </p>
                    <button className="btn btn-primary" onClick={handleStart} disabled={starting}>
                        {starting
                            ? <><i className="fas fa-spinner fa-spin"></i> Đang tạo…</>
                            : <><i className="fas fa-play"></i> Bắt đầu</>}
                    </button>
                </div>
            ) : (
                <>
                    {/* Bảng từ mục tiêu — tô sáng từ đã dùng được.
                        Đây là thứ cho người học biết PHẢI làm gì; không có nó thì
                        họ chỉ chat vu vơ và không hiểu điểm ở đâu ra. */}
                    <div className="convo-targets">
                        <div className="convo-targets-head">
                            Từ cần dùng · <strong>{used.size}/{convo.targetWords.length}</strong>
                        </div>
                        <div className="convo-target-list">
                            {convo.targetWords.map(w => (
                                <span key={w} className={`convo-chip${used.has(w) ? ' is-used' : ''}`}>
                                    {used.has(w) && <i className="fas fa-check"></i>} {w}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="convo-log" ref={scrollRef}>
                        {convo.turns.map((t, i) => (
                            <div key={i} className={`convo-turn convo-turn--${t.role}`}>
                                <div className="convo-bubble">
                                    {t.content}
                                    {t.role === 'npc' && (
                                        <button
                                            className="convo-speak"
                                            title="Đọc lại"
                                            onClick={() => speak(t.content)}
                                        >
                                            <i className="fas fa-volume-up"></i>
                                        </button>
                                    )}
                                </div>
                                {t.matched?.length > 0 && (
                                    <div className="convo-matched">
                                        +{t.matched.length} từ: {t.matched.join(', ')}
                                    </div>
                                )}
                            </div>
                        ))}
                        {busy && (
                            <div className="convo-turn convo-turn--npc">
                                <div className="convo-bubble"><i className="fas fa-ellipsis-h fa-fade"></i></div>
                            </div>
                        )}
                    </div>

                    {result ? (
                        <div className="convo-result">
                            <h3>Xong!</h3>
                            <p>
                                Dùng được <strong>{result.usedWords?.length ?? used.size}</strong>
                                /{result.totalTargets ?? convo.targetWords.length} từ
                            </p>
                            {!result.alreadyClaimed && (
                                <p className="convo-reward">
                                    +{result.reward?.xp || 0} XP · +{result.reward?.coins || 0} xu
                                </p>
                            )}
                            <div className="convo-actions">
                                <button className="btn btn-primary" onClick={() => { setConvo(null); setResult(null); }}>
                                    <i className="fas fa-rotate-right"></i> Luyện tiếp
                                </button>
                                <button className="btn btn-secondary" onClick={() => showScreen('home-screen')}>
                                    Về trang chủ
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="convo-input-row">
                            <input
                                className="convo-input"
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                                placeholder={speechOn ? '🎤 Đang nghe…' : 'Nhập câu trả lời…'}
                                disabled={busy}
                            />
                            <button
                                className={`convo-mic${speechOn ? ' is-listening' : ''}`}
                                onClick={toggleMic}
                                title="Nói"
                            >
                                <i className={`fas ${speechOn ? 'fa-stop' : 'fa-microphone'}`}></i>
                            </button>
                            <button className="btn btn-primary" onClick={handleSend} disabled={busy || !draft.trim()}>
                                <i className="fas fa-paper-plane"></i>
                            </button>
                            <button className="btn btn-secondary convo-finish" onClick={handleFinish} disabled={busy}>
                                Kết thúc
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
