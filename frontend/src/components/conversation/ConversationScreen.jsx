import { useState, useRef, useEffect, useCallback } from 'react';
import { goiYCauTraLoi } from '@lib/conversationHint.js';
import { useGame } from '@game/GameContext.jsx';
import { GameState } from '@game/state.js';
import { GameLogic, ttsLang } from '@game/gameLogic.js';
import { Energy } from '@game/energy.js';
import { Notification } from '@ui/Toaster.jsx';
import { ConversationAPI } from '@api/conversation.js';
import LichSuMode from '../history/LichSuMode.jsx';
import VaiAITab from '../roles/VaiAITab.jsx';
import DanhSachVai from '../roles/DanhSachVai.jsx';
import { getVocabLang } from '@api/vocabulary.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { TopicSelector } from '@components/vocab/topic/topicSelector.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';
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
/**
 * Ba mức khó, khớp `services/aiLevel.js` ở server.
 *
 * Mô tả nói rõ nó ảnh hưởng CÁI GÌ — "Dễ/Vừa/Khó" một mình không cho biết là
 * khó ở từ vựng, ở tốc độ, hay ở độ dài.
 */
const MUC_KHO = [
    { key: 'easy', label: 'Dễ', desc: 'Từ thông dụng, câu ngắn' },
    { key: 'medium', label: 'Vừa', desc: 'Từ công sở' },
    { key: 'hard', label: 'Khó', desc: 'Từ ít gặp, câu phức' },
];

/**
 * Bộ tiêu chí chấm cuối phiên. Khoá khớp `BO_TIEU_CHI` ở server
 * (services/conversationGrader.js).
 */
const BO_TIEU_CHI_CHON = [
    { key: 'giaotiep', label: 'Giao tiếp', desc: 'Rõ ý, tự nhiên, đúng ngữ cảnh', langs: ['en', 'zh', 'bi'] },
    { key: 'toeic', label: 'TOEIC', desc: 'Ngữ pháp, mạch lạc, vốn từ', langs: ['en', 'bi'] },
    { key: 'ielts', label: 'IELTS', desc: 'Mạch lạc, vốn từ, ngữ pháp', langs: ['en', 'bi'] },
    { key: 'hsk', label: 'HSK', desc: 'Từ vựng, ngữ pháp, lưu loát', langs: ['zh', 'bi'] },
];

/**
 * Mức chấm theo TỪNG bộ tiêu chí. Khoá easy/medium/hard giữ nguyên để gửi server;
 * nhãn là thang của chính bộ đó (TOEIC điểm, IELTS band, HSK cấp). Khớp `MUC_CHAM`
 * ở services/conversationGrader.js.
 */
const MUC_CHAM_CHON = {
    giaotiep: MUC_KHO,
    toeic: [
        { key: 'easy', label: '400–500', desc: 'Ngữ pháp cơ bản, từ công sở đơn giản' },
        { key: 'medium', label: '600–700', desc: 'Ngữ pháp đa dạng hơn' },
        { key: 'hard', label: '800+', desc: 'Vốn từ công sở phong phú' },
    ],
    ielts: [
        { key: 'easy', label: 'Band 5.0–5.5', desc: 'Ý rõ, đủ ngữ pháp' },
        { key: 'medium', label: 'Band 6.0–6.5', desc: 'Mạch lạc, từ đa dạng' },
        { key: 'hard', label: 'Band 7.0+', desc: 'Từ tinh tế, ít lỗi' },
    ],
    hsk: [
        { key: 'easy', label: 'HSK 2–3', desc: 'Câu đơn giản' },
        { key: 'medium', label: 'HSK 4', desc: 'Câu dài, bổ ngữ' },
        { key: 'hard', label: 'HSK 5+', desc: 'Câu phức, lưu loát' },
    ],
};

export default function ConversationScreen({ active }) {
    const { showScreen, syncFromState } = useGame();

    const [convo, setConvo] = useState(null);       // { id, targetWords, turns, usedWords }
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);        // đang chờ server
    const [starting, setStarting] = useState(false);
    const [result, setResult] = useState(null);     // kết quả sau khi chốt
    const [speechOn, setSpeechOn] = useState(false);
    const [level, setLevel] = useState('medium');
    const [tab, setTab] = useState('luyen'); // 'luyen' | 'lichsu'
    // Không còn chọn vai ở màn này: vai đi theo Part (tab Vai AI), nên phiên luôn gửi ''.
    const context = '';
    const [rubric, setRubric] = useState('giaotiep'); // bộ tiêu chí chấm cuối phiên
    const [strictGrammar, setStrictGrammar] = useState(false); // ngữ pháp văn nói hay chuẩn viết
    const [feedbackClosed, setFeedbackClosed] = useState(false); // người học đã đóng popup kết quả
    const [showHint, setShowHint] = useState(false);

    const speechRef = useRef(null);
    // Trỏ tới `handleStart` để `onBought` của popup nạp năng lượng gọi lại được.
    // Không thể đưa `handleStart` vào deps của chính nó.
    const handleStartRef = useRef(null);
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

    /**
     * Đọc câu của NPC. Dùng đúng bộ TTS sẵn có của app.
     *
     * DỪNG ghi âm trước khi đọc: người dùng không đeo tai nghe thì mic thu được
     * chính tiếng loa, và câu của NPC bị ghi vào ô nhập như thể họ vừa nói ra.
     * Cùng lỗi với chế độ Phát âm (xem `PronunciationMode.speakSample`).
     */
    const speak = useCallback((text) => {
        if (!text) return;
        speechRef.current?.stop?.();
        setSpeechOn(false);
        try { GameLogic.speakWord(text, ttsLang()); } catch { /* không đọc được thì thôi */ }
    }, []);

    const handleStart = useCallback(async () => {
        if (starting) return;

        // CHƯA CHỌN ĐỀ → mở popup chọn đề, y như 12 chế độ luyện tập.
        //
        // Báo lỗi "hãy chọn đề" rồi để người dùng tự đi tìm popup là đẩy việc
        // sang họ: họ đang ở màn Hội thoại, không biết popup nằm ở nút nào.
        if (!TopicSelector.currentTopic) {
            EventBus.emit(GameEvents.TOPIC_MODAL_REQUESTED, {});
            return;
        }
        // Đã có đề nhưng chưa chọn Part → mở popup Part.
        //
        // KHÔNG chặn khi đang ở chế độ "ngẫu nhiên tất cả": lúc đó không chọn
        // Part là CÓ Ý, và server hiểu part rỗng = lấy toàn bộ đề.
        if (!PartSelector.selectedPart && PartSelector.practiceMode !== 'random-all') {
            PartSelector.showPartSelectionModal();
            return;
        }

        // KHÔNG gửi đề/part/ngôn ngữ lên — SERVER tự đọc từ hồ sơ người dùng.
        //
        // Bản trước client phải gom ba thứ đó rồi gửi, và cả ba đều từng sai:
        // `currentTopic` là OBJECT chứ không phải chuỗi (gửi lên thành CastError
        // → lỗi 404 chẳng liên quan bệnh), `settings.selectedPart` thì bị
        // Mongoose strip nên luôn rỗng, còn `lang` client tự suy từ localStorage.
        //
        // Bỏ hết tham số là bỏ hết cơ hội đoán sai hình dạng dữ liệu ở ranh giới
        // — đó là gốc của cả chuỗi lỗi trước đó, không phải logic hội thoại.
        setStarting(true);
        setResult(null);
        try {
            // Bộ đã chọn có thể không hợp ngôn ngữ hiện tại (chọn TOEIC rồi đổi sang
            // tiếng Trung) — gửi về Giao tiếp để không lệch giữa giao diện và chấm.
            const bo = BO_TIEU_CHI_CHON.find((b) => b.key === rubric && b.langs.includes(lang));
            const rubricGui = bo ? bo.key : 'giaotiep';
            const data = await ConversationAPI.start({
                context,
                level,
                rubric: rubricGui,
                strictGrammar: rubricGui === 'giaotiep' && strictGrammar,
            });
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
            // THIẾU NĂNG LƯỢNG → mở popup nạp, y như các chế độ luyện tập.
            //
            // Chỉ báo "Không đủ năng lượng" là đẩy việc sang người dùng: họ phải
            // tự nhớ cửa hàng ở đâu, mua gói nào, rồi quay lại đây bấm lại.
            // Popup nạp đã có sẵn và `onBought` đưa họ vào thẳng hội thoại.
            if (err?.energyNeeded) {
                Energy.showRefillModal({
                    needed: err.energyNeeded,
                    onBought: () => { handleStartRef.current?.(); },
                });
                return;
            }
            // CHƯA CHỌN ĐỀ → mở popup chọn đề. Server cũng chặn (client đã kiểm
            // trước, nhưng đề có thể bị xoá giữa chừng ở thiết bị khác).
            if (err?.needTopic) {
                EventBus.emit(GameEvents.TOPIC_MODAL_REQUESTED, {});
                return;
            }
            Notification.error(String(err?.message || 'Không mở được hội thoại'));
        } finally {
            setStarting(false);
        }
    }, [starting, lang, speak, syncFromState, level, context, rubric, strictGrammar]);

    handleStartRef.current = handleStart;

    const handleSend = useCallback(async () => {
        const text = draft.trim();
        if (!text || busy || !convo) return;

        // Gửi thì DỪNG ghi âm. Để micro chạy tiếp có ba cái hại: nó ghi đè ô
        // nhập vừa xoá bằng câu đang nghe dở, nó nghe luôn câu NPC đọc ra loa,
        // và người dùng tưởng đã tắt trong khi micro vẫn bật — chuyện riêng tư.
        if (speechOn) {
            speechRef.current?.stop?.();
            setSpeechOn(false);
        }

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
        // `speechOn` PHẢI có trong deps: thiếu thì closure giữ giá trị của lần
        // render đầu (luôn false) và micro không bao giờ được tắt.
    }, [draft, busy, convo, speak, speechOn]);

    const handleFinish = useCallback(async () => {
        if (!convo || busy) return;
        setBusy(true);
        try {
            const data = await ConversationAPI.finish(convo.id);
            setResult(data);
            setFeedbackClosed(false);
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

            <div className="tr-tabs">
                <button className={`tr-tab${tab === 'luyen' ? ' is-on' : ''}`} onClick={() => setTab('luyen')}>
                    <i className="fas fa-comments"></i> Luyện
                </button>
                <button className={`tr-tab${tab === 'lichsu' ? ' is-on' : ''}`} onClick={() => setTab('lichsu')}>
                    <i className="fas fa-clock-rotate-left"></i> Lịch sử
                </button>
                <button className={`tr-tab${tab === 'vai' ? ' is-on' : ''}`} onClick={() => setTab('vai')}>
                    <i className="fas fa-user-tie"></i> Vai AI
                </button>
            </div>

            {tab === 'lichsu' ? <LichSuMode mode="hoithoai" />
                : tab === 'vai' ? (
                    <VaiAITab
                        source={TopicSelector.currentTopic?.source || ''}
                        part={PartSelector.selectedPart || ''}
                        lang={lang}
                    />
                )
                : !convo ? (
                <div className="convo-intro">
                    <p>
                        Luyện nói bằng chính bộ từ bạn vừa học. Máy sẽ trò chuyện và
                        dùng những từ đó — bạn đáp lại, càng dùng được nhiều từ
                        càng nhiều thưởng.
                    </p>
                    {/* Hai cột: TRÁI là vai của Part đang học (sửa, xoá, dùng vai AI đã lưu);
                        PHẢI là KIỂU CHẤM và ĐỘ KHÓ, sát mép phải. */}
                    <div className="ai-setup">
                        <div className="ai-setup-col">
                            <div className="ai-setup-title">Vai của Part</div>
                            <DanhSachVai
                                source={TopicSelector.currentTopic?.source || ''}
                                part={PartSelector.selectedPart || ''}
                                lang={lang}
                            />
                        </div>
                        <div className="ai-setup-col" style={{ gridColumn: 2 }}>
                            <div className="ai-setup-title">Kiểu chấm</div>
                            <div className="ai-setup-list tr-levels">
                                {BO_TIEU_CHI_CHON.filter((b) => b.langs.includes(lang)).map((b) => (
                                    <button
                                        key={b.key}
                                        className={`tr-level${rubric === b.key ? ' is-on' : ''}`}
                                        onClick={() => setRubric(b.key)}
                                    >
                                        <strong>{b.label}</strong>
                                        <em>{b.desc}</em>
                                    </button>
                                ))}
                            </div>

                            {/* Chỉ với Giao tiếp: ngữ pháp văn nói (nới lỏng) hay chuẩn viết (nghiêm). */}
                            {rubric === 'giaotiep' && (
                                <>
                                    <div className="ai-setup-title">Ngữ pháp chấm</div>
                                    <div className="ai-setup-list tr-levels">
                                        <button
                                            className={`tr-level${!strictGrammar ? ' is-on' : ''}`}
                                            onClick={() => setStrictGrammar(false)}
                                        >
                                            <strong>Văn nói</strong>
                                            <em>Bỏ qua rút gọn, tiếng lóng, lối nói đời thường</em>
                                        </button>
                                        <button
                                            className={`tr-level${strictGrammar ? ' is-on' : ''}`}
                                            onClick={() => setStrictGrammar(true)}
                                        >
                                            <strong>Chuẩn viết</strong>
                                            <em>Chấm theo ngữ pháp viết đầy đủ</em>
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Ba mức dùng CHUNG một bảng với Dịch và Đọc hiểu (server:
                                `services/aiLevel.js`), nên "Khó" ở đây và "Khó" ở đó là
                                cùng một trình độ — người học so được giữa các chế độ. */}
                            <div className="ai-setup-title">Độ khó</div>
                            <div className="ai-setup-list tr-levels">
                                {(MUC_CHAM_CHON[rubric] || MUC_KHO).map((m) => (
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

                    <button className="btn btn-primary" onClick={handleStart} disabled={starting}>
                        {starting
                            ? <><i className="fas fa-spinner fa-spin"></i> Đang tạo…</>
                            : <><i className="fas fa-play"></i> Bắt đầu</>}
                    </button>
                </div>
            ) : (
                <div className={`convo-body${result ? ' convo-body--split' : ''}`}>
                    {/* Bảng từ mục tiêu — tô sáng từ đã dùng được.
                        Đây là thứ cho người học biết PHẢI làm gì; không có nó thì
                        họ chỉ chat vu vơ và không hiểu điểm ở đâu ra. */}
                    <div className="convo-targets">
                        <div className="convo-targets-head">
                            Từ cần dùng · <strong>{used.size}/{convo.targetWords.length}</strong>
                        </div>
                        <div className="convo-target-list">
                            {convo.targetWords.map((w, i) => (
                                // `key` kèm chỉ số: server đã khử trùng mặt chữ
                                // (`pickTargets`), nhưng các phiên LƯU TỪ TRƯỚC
                                // vẫn còn danh sách cũ có `地` hai lần — đọc lại
                                // phiên đó mà key trùng là React cảnh báo và có
                                // thể bỏ sót ô khi cập nhật.
                                <span key={`${w}-${i}`} className={`convo-chip${used.has(w) ? ' is-used' : ''}`}>
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
                        // Kết quả nằm sát mép phải, cuộn riêng; chat vẫn xem được bên trái.
                        <div className="convo-result convo-side">
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
                            {/* Chấm theo bộ tiêu chí. Không có `feedback` (AI lỗi hoặc
                                phiên không có lời nói) thì bỏ qua — từ vựng vẫn tính. */}
                            {result.feedback && !feedbackClosed && (
                                <div className="convo-feedback">
                                    {/* Đóng chỉ ẩn khung này. Kết quả vẫn được lưu và xem lại ở tab Lịch sử. */}
                                    <button
                                        type="button"
                                        className="convo-feedback-close"
                                        onClick={() => setFeedbackClosed(true)}
                                        aria-label="Đóng kết quả chấm"
                                        title="Đóng"
                                    >
                                        <i className="fas fa-xmark"></i>
                                    </button>
                                    <div className="convo-feedback-head">
                                        Chấm theo <strong>{result.feedback.label}</strong>
                                        {' · '}trung bình <strong>{result.feedback.overall}</strong>/9
                                    </div>
                                    {result.feedback.muc && (
                                        <div className="convo-feedback-head">
                                            Mức <strong>{result.feedback.muc}</strong>:{' '}
                                            <strong style={{ color: result.feedback.dat ? '#16a34a' : '#dc2626' }}>
                                                {result.feedback.dat ? 'Đạt' : 'Chưa đạt'}
                                            </strong>{' '}
                                            (ngưỡng {result.feedback.nguong}/9)
                                        </div>
                                    )}
                                    {result.feedback.criteria.map((c) => (
                                        <div key={c.key} className="convo-feedback-row">
                                            <span className="convo-feedback-label">{c.label}</span>
                                            <strong>{c.score ?? '—'}</strong>/9
                                            {c.comment && <span className="convo-feedback-note"> — {c.comment}</span>}
                                        </div>
                                    ))}
                                    {result.feedback.summary && (
                                        <p className="convo-feedback-summary">{result.feedback.summary}</p>
                                    )}
                                    <p className="convo-feedback-foot">
                                        Chấm qua chữ: không đánh giá phát âm hay ngữ điệu.
                                    </p>
                                </div>
                            )}
                            {/* Đã đóng nhận xét: vẫn mở lại được ngay trong phiên. */}
                            {result.feedback && feedbackClosed && (
                                <button className="btn btn-secondary" onClick={() => setFeedbackClosed(false)}>
                                    <i className="fas fa-clipboard-check"></i> Xem nhận xét
                                </button>
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
                        <>
                        {/* Gợi ý cấu trúc trả lời cho câu AI vừa hỏi — tính ở client,
                            không tốn lượt AI. Chỉ hiện khi người học bấm mở. */}
                        {showHint && (() => {
                            const npcCuoi = [...convo.turns].reverse().find((t) => t.role === 'npc');
                            const goiY = goiYCauTraLoi(npcCuoi?.content, convo.targetWords, [...used]);
                            return (
                                <div className="convo-hint">
                                    <div className="convo-hint-loai">Dạng câu hỏi: <strong>{goiY.loai}</strong></div>
                                    <div className="convo-hint-khung">{goiY.khung}</div>
                                    {goiY.tuGoiY.length > 0 ? (
                                        <div className="convo-hint-tu">
                                            <span>Dùng một trong các từ:</span>
                                            {goiY.tuGoiY.map((w) => (
                                                <button
                                                    key={w}
                                                    type="button"
                                                    className="convo-chip convo-chip--tap"
                                                    onClick={() => setDraft((d) => (d ? `${d} ${w}` : w))}
                                                >
                                                    {w}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="convo-hint-tu">Bạn đã dùng hết từ cần dùng.</div>
                                    )}
                                </div>
                            );
                        })()}
                        <div className="convo-input-row">
                            <button
                                type="button"
                                className={`btn btn-secondary convo-hint-btn${showHint ? ' is-on' : ''}`}
                                onClick={() => setShowHint((v) => !v)}
                                title="Gợi ý cách trả lời"
                            >
                                <i className="fas fa-lightbulb"></i>
                            </button>
                            <input
                                className="convo-input"
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key !== 'Enter') return;
                                    // Đang gõ qua BỘ NHẬP (IME) thì Enter là để
                                    // CHỌN CHỮ, không phải gửi. Người học tiếng
                                    // Trung gõ pinyin rồi Enter chọn 汉字 —
                                    // gửi ở đó là cắt ngang giữa câu.
                                    if (e.nativeEvent?.isComposing) return;
                                    // Chặn hành vi mặc định: input trong form sẽ
                                    // submit và tải lại trang, mất cả phiên.
                                    e.preventDefault();
                                    handleSend();
                                }}
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
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
