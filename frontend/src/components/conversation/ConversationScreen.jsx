import { useState, useRef, useEffect, useCallback } from 'react';
import { goiYCauTraLoi } from '@lib/conversationHint.js';
import { dichSangViet } from '@lib/dichNhanh.js';
import { useGame } from '@game/GameContext.jsx';
import { GameState } from '@game/state.js';
import { GameLogic, ttsLang } from '@game/gameLogic.js';
import { Energy } from '@game/energy.js';
import { Notification } from '@ui/Toaster.jsx';
import { ConversationAPI } from '@api/conversation.js';
import LichSuMode from '../history/LichSuMode.jsx';
import VaiAITab from '../roles/VaiAITab.jsx';
import DanhSachVai from '../roles/DanhSachVai.jsx';
import KieuChamDoKho from '../ai/KieuChamDoKho.jsx';
import ChonDangBai, { useGoiYDang, dangGui } from '../ai/ChonDangBai.jsx';
import { KIEU_CHAM, DO_KHO_THEO_KIEU, doKhoChoKieu } from '@lib/kieuCham.js';
import { getVocabLang } from '@api/vocabulary.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { TopicSelector } from '@components/vocab/topic/topicSelector.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import { isSpeechSupported, speechLangFor, createSpeechInput } from '@lib/speechInput.js';
import { useGhiAm } from './useGhiAm.js';
import { BongThoaiAI, BongThoaiCuaToi } from './BongThoai.jsx';
import NutBatDau from '../ai/NutBatDau.jsx';
import { useNhamYeu, NutNhamYeu, NhanNham } from '../ai/NhamDiemYeu.jsx';
import { useHoiKhiThoat } from '../ai/aiExitGuard.js';

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
 * Kiểu chấm và độ khó dùng chung cho mọi chế độ AI (lib/kieuCham.js). Đặt tên ngắn
 * ở đây để phần còn lại của màn không đổi.
 */
const BO_TIEU_CHI_CHON = KIEU_CHAM;
const MUC_CHAM_CHON = DO_KHO_THEO_KIEU;

/**
 * Kho tình huống hội thoại — GHÉP với vai (vai = AI là ai, tình huống = đang ở
 * đâu, làm gì). Khoá khớp `NHOM_TINH_HUONG` ở backend/services/conversationAi.js.
 * "Ngẫu nhiên" (không gợi ý) giữ như trước: AI tự dựng tình huống từ bộ từ.
 */
const NHOM_DANG = [
    {
        key: 'doi-thuong', label: 'Đời thường', hop: ['giaotiep', 'hsk'],
        dang: [
            { key: 'order-food', label: 'Gọi món' },
            { key: 'directions', label: 'Hỏi đường' },
            { key: 'shopping', label: 'Mua sắm / trả giá' },
            { key: 'small-talk', label: 'Làm quen' },
            { key: 'invite', label: 'Rủ đi chơi' },
            { key: 'phone-friend', label: 'Gọi điện cho bạn' },
        ],
    },
    {
        key: 'dich-vu', label: 'Dịch vụ', hop: ['giaotiep', 'toeic', 'hsk'],
        dang: [
            { key: 'hotel', label: 'Khách sạn' },
            { key: 'booking', label: 'Đặt chỗ' },
            { key: 'doctor', label: 'Khám bệnh' },
            { key: 'bank', label: 'Ngân hàng' },
            { key: 'airport', label: 'Sân bay' },
            { key: 'complaint', label: 'Khiếu nại' },
        ],
    },
    {
        key: 'cong-viec', label: 'Công việc', hop: ['toeic'],
        dang: [
            { key: 'interview', label: 'Phỏng vấn xin việc' },
            { key: 'meeting', label: 'Họp nhóm' },
            { key: 'negotiate', label: 'Đàm phán' },
            { key: 'client-call', label: 'Gọi cho khách hàng' },
            { key: 'leave', label: 'Xin nghỉ phép' },
            { key: 'progress', label: 'Báo cáo tiến độ' },
        ],
    },
    {
        key: 'thao-luan', label: 'Thảo luận', hop: ['ielts'],
        dang: [
            { key: 'opinion', label: 'Bày tỏ ý kiến' },
            { key: 'debate', label: 'Tranh luận hai mặt' },
            { key: 'experience', label: 'Kể trải nghiệm' },
            { key: 'describe', label: 'Mô tả nơi chốn' },
            { key: 'future', label: 'Kế hoạch tương lai' },
            { key: 'compare', label: 'So sánh xưa – nay' },
        ],
    },
];

/** Chưa gõ gì sau bấy nhiêu giây kể từ câu AI → tự mở gợi ý (một lần mỗi câu). */
const GOI_Y_SAU_GIAY = 30;

/**
 * `voice` = Hội thoại GIỌNG NÓI: AI gửi tin nhắn thoại (chỉ nút phát, không chữ),
 * người học trả lời bằng ghi âm. Không có `voice` = Chat chữ như trước. Hai chế độ
 * dùng chung toàn bộ phần chọn vai/tình huống/kiểu chấm, chấm điểm và lịch sử.
 */
export default function ConversationScreen({ active, voice = false }) {
    const { showScreen, syncFromState } = useGame();
    // Mã màn của ROUTE (khác nhau giữa Chat và Hội thoại) — dùng cho chốt chặn thoát.
    const screenId = voice ? 'voice-conversation-screen' : 'conversation-screen';

    const [convo, setConvo] = useState(null);       // { id, targetWords, turns, usedWords, aiUsedWords }
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
    const [dangGoiY, setDangGoiY] = useState(false);     // đang chờ AI tạo khung
    const [conLaiGoiY, setConLaiGoiY] = useState(null);  // số lượt gợi ý AI còn lại (server báo)
    const [hetGoiY, setHetGoiY] = useState('');          // thông báo hết lượt gợi ý AI
    const tuMoChoLuotRef = useRef(-1);                   // đã TỰ mở gợi ý cho lượt nào
    // Bản dịch tiếng Việt theo chỉ số lượt NPC: { [i]: { dangDich, text, mo } }.
    const [banDich, setBanDich] = useState({});
    const inputRef = useRef(null);
    const [dang, setDang] = useState('');     // tình huống; '' = ngẫu nhiên
    const [tuChon, setTuChon] = useState(''); // tình huống tự nhập, ưu tiên hơn `dang`
    // Tình huống AI gợi ý hợp bộ từ của Part — nhóm đầu tiên, và "Ngẫu nhiên" bốc trong đó.
    const goiY = useGoiYDang('conversation', active);

    const speechRef = useRef(null);
    // Trỏ tới `handleStart` để `onBought` của popup nạp năng lượng gọi lại được.
    // Không thể đưa `handleStart` vào deps của chính nó.
    const handleStartRef = useRef(null);
    const scrollRef = useRef(null);
    const lang = getVocabLang();
    const [nhamYeu, doiNhamYeu] = useNhamYeu();
    // Hội thoại giọng nói: tin nhắn thoại AI đang phát (chỉ số lượt) và bộ ghi âm.
    const [dangPhat, setDangPhat] = useState(null);
    const ghiAm = useGhiAm(speechLangFor(lang));
    const coNhanGiong = isSpeechSupported();
    // Giữ-để-nói bằng phím Cách: đang giữ (bắt đầu ghi bằng phím) và "nhả ra thì gửi".
    const giuCachRef = useRef(false);
    const guiKhiXongRef = useRef(false);

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
    const speak = useCallback((text, onEnd) => {
        if (!text) return;
        speechRef.current?.stop?.();
        setSpeechOn(false);
        try { GameLogic.speakWord(text, ttsLang(), onEnd); } catch { /* không đọc được thì thôi */ }
    }, []);

    /** Phát tin nhắn thoại thứ `i` của AI (Hội thoại giọng nói), giữ trạng thái nút. */
    const phatTin = useCallback((i, text) => {
        try { GameLogic.stopSpeaking?.(); } catch { /* chưa phát gì */ }
        setDangPhat(i);
        speak(text, () => setDangPhat((d) => (d === i ? null : d)));
    }, [speak]);
    const dungPhat = useCallback(() => {
        try { GameLogic.stopSpeaking?.(); } catch { /* chưa phát gì */ }
        setDangPhat(null);
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
                ...dangGui({ dang, tuChon, goiY }),
                voice,
                nhamYeu: lang !== 'zh' && nhamYeu,
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
                aiUsedWords: data.aiUsedWords || [],
                nhamLoi: data.nhamLoi || [],
            });
            // Năng lượng đã bị server trừ — đồng bộ lại ngay, không thì thanh
            // năng lượng vẫn hiện số cũ cho tới lần tải trang sau.
            if (typeof data.energyRemaining === 'number') {
                GameState.setEnergy?.(data.energyRemaining);
                syncFromState?.();
            }
            if (voice) phatTin(0, data.turns?.[0]?.content);
            else speak(data.turns?.[0]?.content);
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
    }, [starting, lang, speak, phatTin, voice, syncFromState, level, context, rubric, strictGrammar, dang, tuChon, goiY, nhamYeu]);

    handleStartRef.current = handleStart;

    // `chuGui`: chữ gửi thay cho ô nhập (Hội thoại giọng nói gửi chữ nhận dạng được);
    // `them`: dữ liệu gắn vào lượt của người học (vd `audioUrl` để phát lại giọng).
    // Gắn thẳng vào onClick thì đối số đầu là sự kiện chuột — nên kiểm kiểu chuỗi.
    const handleSend = useCallback(async (chuGui, them) => {
        const text = (typeof chuGui === 'string' ? chuGui : draft).trim();
        if (!text || busy || !convo) return;
        // Chỉ số lượt AI sắp đáp: sau lượt của người học vừa thêm.
        const viTriDap = convo.turns.length + 1;

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
        setConvo(c => ({ ...c, turns: [...c.turns, { role: 'user', content: text, ...(them || {}) }] }));
        setDraft('');

        try {
            const data = await ConversationAPI.reply(convo.id, text);
            setConvo(c => {
                const turns = [...c.turns];
                // Gắn `matched` (server chấm) vào chính lượt vừa gửi để tô sáng.
                const last = turns.length - 1;
                if (turns[last]?.role === 'user') turns[last] = { ...turns[last], matched: data.matched || [] };
                if (data.npcReply) turns.push({ role: 'npc', content: data.npcReply });
                return {
                    ...c, turns,
                    usedWords: data.usedWords || c.usedWords,
                    aiUsedWords: data.aiUsedWords || c.aiUsedWords || [],
                };
            });
            if (data.npcReply) {
                if (voice) phatTin(viTriDap, data.npcReply);
                else speak(data.npcReply);
            }
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
    }, [draft, busy, convo, speak, phatTin, voice, speechOn]);

    /** Bật/tắt bản dịch tiếng Việt của một lượt NPC. Dịch một lần, bấm lại chỉ ẩn/hiện. */
    const toggleDich = useCallback(async (i, text) => {
        const cu = banDich[i];
        if (cu?.text) {
            setBanDich((b) => ({ ...b, [i]: { ...cu, mo: !cu.mo } }));
            return;
        }
        if (cu?.dangDich) return;
        setBanDich((b) => ({ ...b, [i]: { dangDich: true, text: '', mo: true } }));
        try {
            const vi = await dichSangViet(text);
            setBanDich((b) => ({ ...b, [i]: { dangDich: false, text: vi || '(Không có bản dịch)', mo: true } }));
        } catch {
            setBanDich((b) => ({ ...b, [i]: undefined }));
            Notification.error('Không dịch được câu này');
        }
    }, [banDich]);

    /**
     * Mở bảng gợi ý. Khung dựng bằng luật hiện NGAY; khung AI chỉ được xin khi
     * mở bảng (không phải ở mọi lượt) và chỉ một lần cho mỗi câu AI — server lưu
     * lại, mở lần nữa không tốn thêm.
     */
    const moGoiY = useCallback(async () => {
        setShowHint(true);
        if (!convo || dangGoiY || hetGoiY) return;
        const idx = convo.turns.length - 1;
        const cuoi = convo.turns[idx];
        if (!cuoi || cuoi.role !== 'npc' || cuoi.khung?.length) return;
        setDangGoiY(true);
        try {
            const d = await ConversationAPI.hint(convo.id);
            if (typeof d?.conLai === 'number') setConLaiGoiY(d.conLai);
            if (Array.isArray(d?.khung) && d.khung.length) {
                setConvo((c) => {
                    if (!c || c.id !== convo.id || !c.turns[idx]) return c;
                    const turns = [...c.turns];
                    turns[idx] = { ...turns[idx], khung: d.khung };
                    return { ...c, turns };
                });
            }
        } catch (err) {
            // Hết lượt hay AI lỗi: vẫn còn khung dựng bằng luật, không chặn gì.
            if (err?.limit) setHetGoiY(String(err.message || 'Đã hết lượt gợi ý AI.'));
        } finally {
            setDangGoiY(false);
        }
    }, [convo, dangGoiY, hetGoiY]);
    const moGoiYRef = useRef(null);
    moGoiYRef.current = moGoiY;

    // Mỗi lần AI trả lời (hay người học gửi câu) thì ĐÓNG gợi ý — để không dựa
    // vào gợi ý cho mọi câu; muốn xem thì bấm lại.
    useEffect(() => { setShowHint(false); }, [convo?.turns?.length]);

    // Ngồi im (chưa gõ gì) quá GOI_Y_SAU_GIAY sau câu AI → tự mở gợi ý, MỘT lần
    // cho mỗi câu AI. Đóng đi rồi thì không tự mở lại câu đó nữa.
    useEffect(() => {
        if (!convo || busy || starting || result || showHint || draft.trim()) return undefined;
        const n = convo.turns.length;
        if (convo.turns[n - 1]?.role !== 'npc' || tuMoChoLuotRef.current === n) return undefined;
        const t = setTimeout(() => {
            tuMoChoLuotRef.current = n;
            moGoiYRef.current?.();
        }, GOI_Y_SAU_GIAY * 1000);
        return () => clearTimeout(t);
    }, [convo, busy, starting, result, showHint, draft]);

    // Phiên mới: bỏ trạng thái gợi ý của phiên cũ.
    useEffect(() => { setHetGoiY(''); setConLaiGoiY(null); tuMoChoLuotRef.current = -1; }, [convo?.id]);

    // Phiên mới thì bỏ bản dịch của phiên cũ — khoá theo CHỈ SỐ lượt nên giữ lại là
    // hiện nhầm bản dịch của câu khác.
    useEffect(() => { setBanDich({}); }, [convo?.id]);

    // AI trả lời xong → con trỏ về ô nhập để gõ luôn, khỏi phải bấm chuột.
    // Chỉ trên máy có chuột (pointer: fine): trên điện thoại, focus là bật bàn
    // phím ảo che mất câu AI vừa nói.
    useEffect(() => {
        if (busy || starting || !convo || result) return;
        if (!window.matchMedia?.('(pointer: fine)')?.matches) return;
        inputRef.current?.focus();
    }, [busy, starting, convo?.id, convo?.turns?.length, result]);

    /** Gửi bản ghi âm đang xem lại (Hội thoại giọng nói) — nút Gửi và phím Enter dùng chung. */
    const guiThoai = useCallback(() => {
        if (busy || !ghiAm.chu.trim()) return;
        handleSend(ghiAm.chu, ghiAm.url ? { audioUrl: ghiAm.url } : undefined);
        ghiAm.xongGui();
    }, [busy, ghiAm, handleSend]);

    // Phím tắt của Hội thoại giọng nói (suốt phiên, tới khi kết thúc):
    //   · GIỮ Cách = ghi âm (dừng giọng AI trước); NHẢ ra = dừng và GỬI LUÔN — như bộ
    //     đàm, phản xạ nhanh như nói chuyện thật. Máy không nghe được chữ nào thì không
    //     gửi, để lại bước xem lại ("Không nghe rõ — hãy ghi lại").
    //   · Enter = Gửi, Delete (hoặc Backspace — phím "delete" trên Mac) = Ghi lại —
    //     chỉ khi đang XEM LẠI bản ghi (ghi bằng chuột, hoặc giữ Cách mà không nghe rõ).
    // Bỏ qua khi con trỏ đang ở ô nhập (ô tìm kiếm, ô tự nhập tình huống…) hoặc có
    // popup đang mở: phím ở đó là việc của ô/popup đó.
    useEffect(() => {
        if (!voice || !active || !convo || result) return undefined;
        const laCach = (e) => e.code === 'Space' || e.key === ' ';
        const onKey = (e) => {
            if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
            const el = e.target;
            if (el?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
            if (document.querySelector('#modal-container.active')) return;
            if (laCach(e)) {
                // Chặn mặc định CẢ lượt lặp khi giữ: Cách cuộn trang hoặc "bấm" nút đang focus.
                e.preventDefault();
                if (e.repeat) return;
                if (ghiAm.trangThai === 'nghi' && !busy) {
                    // Dừng giọng AI trước khi ghi: micro không thu lại tiếng loa.
                    dungPhat();
                    giuCachRef.current = true;
                    ghiAm.batDau();
                } else if (ghiAm.trangThai === 'ghi' && !giuCachRef.current) {
                    // Đang ghi bằng chuột: Cách dừng (không tự gửi — sang bước xem lại).
                    ghiAm.dung();
                }
                return;
            }
            if (e.repeat || ghiAm.trangThai !== 'xong') return;
            if (e.key === 'Enter') {
                e.preventDefault();
                guiThoai();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                if (!busy) ghiAm.lamLai();
            }
        };
        // NHẢ Cách: dừng ghi và đánh dấu "xong thì gửi" — chữ cuối còn về trễ sau khi
        // dừng (xem `useGhiAm`), nên gửi ở effect bên dưới khi trạng thái thành 'xong'.
        const onKeyUp = (e) => {
            if (!laCach(e) || !giuCachRef.current) return;
            e.preventDefault();
            giuCachRef.current = false;
            guiKhiXongRef.current = true;
            ghiAm.dung();
        };
        // Đang giữ Cách mà rời cửa sổ thì không bao giờ nhận được keyup: dừng ghi và
        // để lại bước xem lại thay vì tự gửi một câu có thể đang nói dở.
        const onBlur = () => {
            if (!giuCachRef.current) return;
            giuCachRef.current = false;
            guiKhiXongRef.current = false;
            ghiAm.dung();
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
        };
    }, [voice, active, convo, result, ghiAm, busy, guiThoai, dungPhat]);

    // Nhả Cách → bản ghi xong thì GỬI LUÔN (nếu máy nghe được chữ nào).
    useEffect(() => {
        if (ghiAm.trangThai !== 'xong' || !guiKhiXongRef.current) return;
        guiKhiXongRef.current = false;
        if (ghiAm.chu.trim()) guiThoai();
    }, [ghiAm.trangThai, ghiAm.chu, guiThoai]);

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
    // Từ AI đã nói mà người học chưa dùng: tính là XONG cho tiến độ (khỏi phải lặp
    // lại gượng), nhưng không có thưởng — server chỉ thưởng theo `usedWords`.
    const aiUsed = new Set(convo?.aiUsedWords || []);

    // Đang làm dở mà rời màn (quay về, menu, Trang chủ…) → hỏi trước, như 16 chế độ luyện tập.
    useHoiKhiThoat(screenId, !!convo && !result, {
        tieuDe: 'Thoát hội thoại?',
        noiDung: 'Phiên hội thoại chưa kết thúc sẽ không được chấm và không nhận thưởng. Năng lượng đã trừ khi bắt đầu sẽ không được hoàn lại. Bạn có chắc chắn muốn thoát?',
    });

    return (
        // Cùng id DOM cho Chat và Hội thoại: hai màn không bao giờ cùng mount, và CSS bố cục
        // toàn màn (`#conversation-screen.active`) dùng chung.
        <div id="conversation-screen" className={`screen ${active ? 'active' : ''}${voice ? ' is-thoai' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2>
                    {voice
                        ? <><i className="fas fa-microphone-lines"></i> Hội thoại</>
                        : <><i className="fas fa-comments"></i> Chat</>}
                </h2>
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
                    {voice ? (
                        <p>
                            AI gửi <strong>tin nhắn thoại</strong> — chỉ có nút phát, không có chữ. Nghe
                            hiểu rồi <strong>trả lời bằng giọng nói</strong> như gọi điện thật; lời
                            thoại hiện ra sau khi kết thúc. Càng dùng được nhiều từ càng nhiều thưởng.
                        </p>
                    ) : (
                        <p>
                            Luyện nói bằng chính bộ từ bạn vừa học. Máy sẽ trò chuyện và
                            dùng những từ đó — bạn đáp lại, càng dùng được nhiều từ
                            càng nhiều thưởng.
                        </p>
                    )}
                    {voice && !coNhanGiong && (
                        <p className="tr-intro-note">
                            <i className="fas fa-circle-info"></i>{' '}
                            Trình duyệt này chưa nhận được giọng nói — hãy dùng Chrome hoặc Edge.
                        </p>
                    )}
                    {/* Hai cột: TRÁI là vai của Part đang học (sửa, xoá, dùng vai AI đã lưu)
                        rồi TÌNH HUỐNG (ghép với vai); PHẢI là KIỂU CHẤM và ĐỘ KHÓ, sát mép phải. */}
                    <div className="ai-setup">
                        <div className="ai-setup-col">
                            <div className="ai-setup-title">Vai của Part</div>
                            <DanhSachVai
                                source={TopicSelector.currentTopic?.source || ''}
                                part={PartSelector.selectedPart || ''}
                                lang={lang}
                            />
                            <ChonDangBai
                                tieuDe="Tình huống"
                                nhom={NHOM_DANG}
                                goiY={goiY}
                                kieu={rubric}
                                kieuLabel={KIEU_CHAM.find((k) => k.key === rubric)?.label || ''}
                                dang={dang}
                                onDang={setDang}
                                tuChon={tuChon}
                                onTuChon={setTuChon}
                                placeholder="Hoặc tự nhập: khách phàn nàn đồ uống, xin tăng lương…"
                            />
                        </div>
                        <div className="ai-setup-col">
                            {/* Kiểu chấm + độ khó: dùng CHUNG component với Luyện viết và Dịch.
                                Riêng Giao tiếp có thêm "Ngữ pháp chấm" (văn nói hay chuẩn viết). */}
                            <KieuChamDoKho
                                kieuList={BO_TIEU_CHI_CHON.filter((b) => b.langs.includes(lang))}
                                kieuDangChon={rubric}
                                onKieu={setRubric}
                                doKhoList={doKhoChoKieu(rubric)}
                                doKhoDangChon={level}
                                onDoKho={setLevel}
                                giua={rubric === 'giaotiep' ? (
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
                                ) : null}
                            />
                        </div>
                    </div>

                    {/* AI cài chỗ luyện đúng lỗi hay mắc (từ hồ sơ Tiến bộ) — chỉ tiếng Anh. */}
                    {lang !== 'zh' && <NutNhamYeu bat={nhamYeu} onDoi={doiNhamYeu} />}

                    {/* Nút bắt đầu nổi cố định giữa đáy khung nhìn (portal vào body). */}
                    <NutBatDau active={active} onClick={handleStart} disabled={starting || (voice && !coNhanGiong)}>
                        {starting
                            ? <><i className="fas fa-spinner fa-spin"></i> Đang tạo…</>
                            : <><i className="fas fa-play"></i> Bắt đầu</>}
                    </NutBatDau>
                </div>
            ) : (
                <div className={`convo-body${result ? ' convo-body--split' : ''}`}>
                    {/* Bảng từ mục tiêu — tô sáng từ đã dùng được.
                        Đây là thứ cho người học biết PHẢI làm gì; không có nó thì
                        họ chỉ chat vu vơ và không hiểu điểm ở đâu ra. */}
                    <div className="convo-targets">
                        <div className="convo-targets-head">
                            Từ cần dùng · <strong>{used.size + aiUsed.size}/{convo.targetWords.length}</strong>
                            {aiUsed.size > 0 && (
                                <span className="convo-targets-note"> · {aiUsed.size} từ AI đã nói (dùng lại để nhận thưởng)</span>
                            )}
                        </div>
                        <NhanNham ds={convo.nhamLoi} />
                        <div className="convo-target-list">
                            {convo.targetWords.map((w, i) => (
                                // `key` kèm chỉ số: server đã khử trùng mặt chữ
                                // (`pickTargets`), nhưng các phiên LƯU TỪ TRƯỚC
                                // vẫn còn danh sách cũ có `地` hai lần — đọc lại
                                // phiên đó mà key trùng là React cảnh báo và có
                                // thể bỏ sót ô khi cập nhật.
                                <span
                                    key={`${w}-${i}`}
                                    className={`convo-chip${used.has(w) ? ' is-used' : aiUsed.has(w) ? ' is-ai' : ''}`}
                                    title={!used.has(w) && aiUsed.has(w) ? 'AI đã nói từ này — tính là xong. Tự dùng lại để nhận thưởng.' : undefined}
                                >
                                    {used.has(w) && <i className="fas fa-check"></i>}
                                    {!used.has(w) && aiUsed.has(w) && <i className="fas fa-robot"></i>} {w}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="convo-log" ref={scrollRef}>
                        {convo.turns.map((t, i) => (
                            <div key={i} className={`convo-turn convo-turn--${t.role}`}>
                                {voice && t.role === 'npc' ? (
                                    <>
                                        <BongThoaiAI
                                            dangPhat={dangPhat === i}
                                            onBam={() => (dangPhat === i ? dungPhat() : phatTin(i, t.content))}
                                        />
                                        {/* Lời thoại chỉ hiện SAU khi kết thúc — trong lúc nói phải nghe hiểu. */}
                                        {result && <div className="convo-thoai-chu">{t.content}</div>}
                                    </>
                                ) : voice && t.role === 'user' && t.audioUrl ? (
                                    <>
                                        <BongThoaiCuaToi url={t.audioUrl} />
                                        <div className="convo-thoai-nghe">Máy nghe được: “{t.content}”</div>
                                    </>
                                ) : (
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
                                    {t.role === 'npc' && (
                                        <button
                                            className={`convo-speak convo-dich-btn${banDich[i]?.mo ? ' is-on' : ''}`}
                                            title="Dịch sang tiếng Việt"
                                            onClick={() => toggleDich(i, t.content)}
                                        >
                                            <i className={`fas ${banDich[i]?.dangDich ? 'fa-spinner fa-spin' : 'fa-language'}`}></i>
                                        </button>
                                    )}
                                </div>
                                )}
                                {!voice && t.role === 'npc' && banDich[i]?.mo && banDich[i]?.text && (
                                    <div className="convo-dich">{banDich[i].text}</div>
                                )}
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
                            {(result.aiUsedWords?.length ?? aiUsed.size) > 0 && (
                                <p className="convo-targets-note">
                                    + {result.aiUsedWords?.length ?? aiUsed.size} từ AI đã nói (tính là xong, không cộng thưởng)
                                </p>
                            )}
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
                            const goiY = goiYCauTraLoi(npcCuoi?.content, convo.targetWords, [...used, ...aiUsed], npcCuoi?.khung);
                            return (
                                <div className="convo-hint">
                                    <div className="convo-hint-loai">
                                        {/* Hội thoại giọng nói: KHÔNG hiện lại câu hỏi bằng chữ. */}
                                        {!voice && goiY.cauHoi && <>Trả lời câu: <strong>“{goiY.cauHoi}”</strong> · </>}
                                        {goiY.tuAI
                                            ? <><i className="fas fa-wand-magic-sparkles"></i> Khung theo đúng câu AI hỏi</>
                                            : <>Dạng: <strong>{goiY.loai}</strong></>}
                                    </div>
                                    {/* Bấm một khung để đưa vào ô nhập rồi tự điền chỗ ___ — luyện phản xạ. */}
                                    <div className="convo-hint-khung-list">
                                        {goiY.cacKhung.map((k) => (
                                            <button
                                                key={k}
                                                type="button"
                                                className="convo-hint-khung"
                                                title="Đưa khung này vào ô nhập"
                                                onClick={() => { if (!voice) { setDraft(k); inputRef.current?.focus(); } }}
                                            >
                                                {k}
                                            </button>
                                        ))}
                                    </div>
                                    {dangGoiY && !goiY.tuAI && (
                                        <div className="convo-hint-loai">
                                            <i className="fas fa-spinner fa-spin"></i> Đang tạo khung theo đúng câu AI…
                                        </div>
                                    )}
                                    {hetGoiY && !goiY.tuAI && <div className="convo-hint-loai">{hetGoiY}</div>}
                                    {goiY.tuAI && typeof conLaiGoiY === 'number' && (
                                        <div className="convo-hint-loai">Còn {conLaiGoiY} lượt gợi ý AI trong phiên này.</div>
                                    )}
                                    {goiY.tuGoiY.length > 0 ? (
                                        <div className="convo-hint-tu">
                                            <span>Dùng một trong các từ:</span>
                                            {goiY.tuGoiY.map((w) => (
                                                <button
                                                    key={w}
                                                    type="button"
                                                    className="convo-chip convo-chip--tap"
                                                    onClick={() => { if (!voice) setDraft((d) => (d ? `${d} ${w}` : w)); }}
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
                        {voice ? (
                        <>
                        {ghiAm.loi && <p className="tr-intro-note convo-thoai-loi">{ghiAm.loi}</p>}
                        <div className="convo-input-row convo-input-row--thoai">
                            <button
                                type="button"
                                className={`btn btn-secondary convo-hint-btn${showHint ? ' is-on' : ''}`}
                                onClick={() => (showHint ? setShowHint(false) : moGoiY())}
                                title="Gợi ý cách trả lời"
                            >
                                <i className="fas fa-lightbulb"></i>
                            </button>
                            {ghiAm.trangThai === 'xong' ? (
                                <>
                                    {/* Nghe lại / xem máy nghe được gì trước khi gửi. */}
                                    <div className="convo-thoai-xem">
                                        {ghiAm.url && <BongThoaiCuaToi url={ghiAm.url} />}
                                        <span className="convo-thoai-nghe">
                                            {ghiAm.chu ? `Máy nghe được: “${ghiAm.chu}”` : 'Không nghe rõ — hãy ghi lại.'}
                                        </span>
                                        <span className="convo-thoai-phim">
                                            <kbd>Enter</kbd> gửi · <kbd>Delete</kbd> ghi lại
                                        </span>
                                    </div>
                                    <button type="button" className="btn btn-secondary" onClick={ghiAm.lamLai} disabled={busy} title="Phím Delete">
                                        <i className="fas fa-rotate-left"></i> Ghi lại
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        disabled={busy || !ghiAm.chu.trim()}
                                        onClick={guiThoai}
                                        title="Phím Enter"
                                    >
                                        <i className="fas fa-paper-plane"></i> Gửi
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className={`convo-ghi-am${ghiAm.trangThai === 'ghi' ? ' is-ghi' : ''}`}
                                        disabled={busy}
                                        onClick={() => {
                                            if (ghiAm.trangThai === 'ghi') { ghiAm.dung(); return; }
                                            // Dừng giọng AI trước khi ghi: micro không thu lại tiếng loa.
                                            dungPhat();
                                            ghiAm.batDau();
                                        }}
                                    >
                                        <i className={`fas ${ghiAm.trangThai === 'ghi' ? 'fa-stop' : 'fa-microphone'}`}></i>
                                        {ghiAm.trangThai === 'ghi'
                                            ? ` Dừng · ${Math.floor(ghiAm.giay / 60)}:${String(ghiAm.giay % 60).padStart(2, '0')}`
                                            : ' Bấm để trả lời'}
                                        <kbd className="convo-thoai-kbd">Giữ Cách</kbd>
                                    </button>
                                    {ghiAm.trangThai === 'ghi' && ghiAm.chu && (
                                        <span className="convo-thoai-tam">{ghiAm.chu}</span>
                                    )}
                                </>
                            )}
                            <button className="btn btn-secondary convo-finish" onClick={handleFinish} disabled={busy}>
                                Kết thúc
                            </button>
                        </div>
                        </>
                        ) : (
                        <div className="convo-input-row">
                            <button
                                type="button"
                                className={`btn btn-secondary convo-hint-btn${showHint ? ' is-on' : ''}`}
                                onClick={() => (showHint ? setShowHint(false) : moGoiY())}
                                title="Gợi ý cách trả lời"
                            >
                                <i className="fas fa-lightbulb"></i>
                            </button>
                            <input
                                ref={inputRef}
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
                        )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
