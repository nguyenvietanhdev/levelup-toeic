import { useState, useCallback, useEffect, useRef } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { GameState } from '@game/state.js';
import { resolveAvatarSrc } from '@game/avatars.js';
import { frameStyle, frameOverlayUrl } from '@game/frames.js';
import { loadUnlocks, lockInfo } from '@game/featureUnlocks.js';
import { Notification } from '@ui/Toaster.jsx';
import { useMenuBadges } from './useMenuBadges.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import NotificationPanel from '@components/notifications/NotificationPanel.jsx';
import FavoritesModal from '@components/favorites/FavoritesModal.jsx';
import TopicModal from '@components/vocab/topic/TopicModal.jsx';
import SpinWheelModal from '@components/spin/SpinWheelModal.jsx';
import TranslateModal from '@components/translate/TranslateModal.jsx';
import { isSpeechSupported, speechLangFor, createSpeechInput } from '@lib/speechInput.js';
import { createHoldGesture } from '@lib/holdGesture.js';
import { getVocabLang } from '@api/vocabulary.js';
import { useHideOnScrollDown } from './useHideOnScrollDown.js';
import { useKeyboardInset } from './useKeyboardInset.js';
import { useStatusBarHeight } from './useStatusBarHeight.js';

export default function TopNav() {
    const { user, resources, setMenuOpen, showScreen, menuOpen, currentScreen } = useGame();
    // Khiên bảo vệ streak: đổi màu theo số lượng (≥3 xanh dương, 2 vàng, 1 đỏ).
    const shields = resources?.shields || 0;
    const shieldColor = shields >= 3 ? '#3b82f6' : shields === 2 ? '#eab308' : '#ef4444';
    // Xếp hạng bảng xếp hạng (all-time): top 1/2/3 = vàng/bạc/đồng, còn lại tím.
    const [rank, setRank] = useState(null);
    const rankColor = rank === 1 ? '#fbbf24' : rank === 2 ? '#cbd5e1' : rank === 3 ? '#d97706' : '#a78bfa';
    // Khoá khi đang làm Full Test TOEIC (mini/đục lỗ không khoá) — báo qua EventBus.
    const [toeicFullTestLock, setToeicFullTestLock] = useState(false);
    const isInPractice = currentScreen === 'practice-screen' || currentScreen === 'toeic-test-screen' || toeicFullTestLock;

    // Đang THI thật (bài TOEIC) — khác với đang luyện từ vựng.
    //
    // Hai thứ này gộp chung trong `isInPractice` để khoá ô tìm kiếm, nhưng với
    // việc TRA NGHĨA thì chúng ngược nhau hoàn toàn:
    //   · luyện từ vựng → tra nghĩa CHÍNH LÀ học, chặn là cản trở người dùng;
    //   · làm bài thi   → tra nghĩa là xem đáp án, phải chặn.
    const isInExam = currentScreen === 'toeic-test-screen' || toeicFullTestLock;
    const { isLoggedIn, setAuthModal } = useAuth();
    const { badges: menuBadges } = useMenuBadges(isLoggedIn, { listenEvents: true });
    // Number = unclaimed quest + achievement rewards; dot = other menu items have badges
    const menuRewardCount = menuBadges.quest + menuBadges.achievement;
    const menuHasDot = menuRewardCount === 0 && (menuBadges.online > 0 || menuBadges.shopDiscount > 0);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    const navHidden = useHideOnScrollDown();
    // Đẩy nav lên trên bàn phím ảo — không thì gõ tìm là bị nó che mất.
    useKeyboardInset();
    // Đo thanh trạng thái để ô tìm bám ngay dưới nó (khổ điện thoại).
    useStatusBarHeight();
    // Nhập bằng giọng nói. `speechOn` là trạng thái ĐANG NGHE để vẽ nút; bản thân
    // phiên nhận dạng nằm trong ref vì nó không phải dữ liệu render.
    const [speechOn, setSpeechOn] = useState(false);
    const speechRef = useRef(null);
    // Chữ cuối cùng nghe được trong phiên đang chạy. Phải là ref chứ không phải
    // state: callback `onStateChange` do effect tạo một lần, closure của nó giữ
    // giá trị `searchQuery` của lần render đó và không bao giờ thấy chữ mới.
    const lastHeardRef = useRef('');
    // Nói xong có TỰ mở popup dịch không. Bật khi vào bằng cử chỉ giữ Shift, tắt
    // khi bấm nút micro — bấm nút là muốn điền vào ô tìm kiếm, tự nhảy popup lên
    // là cướp thao tác.
    const autoTranslateRef = useRef(false);
    // Hàm mở popup dịch, đặt trong ref để `onStateChange` gọi được mà không phải
    // dựng lại phiên nhận dạng mỗi lần hàm đó đổi.
    const openTranslateRef = useRef(null);
    const speechSupported = isSpeechSupported();
    // readOnly cho tới khi user tương tác → chặn Edge autofill email lúc load trang
    const [searchReadOnly, setSearchReadOnly] = useState(true);
    const [favOpen, setFavOpen] = useState(false);
    const [topicOpen, setTopicOpen] = useState(false);
    // Chế độ đang chờ chọn đề — STATE chứ không chỉ ref, vì popup phải render
    // lại để khoá đúng tab: `review-mistakes` chỉ dùng được "Từ vựng sai", mọi
    // chế độ khác thì ngược lại.
    const [topicMode, setTopicMode] = useState(null);
    const [spinOpen, setSpinOpen] = useState(false);
    const [translateText, setTranslateText] = useState(null); // từ đang dịch (popup)
    // Bản ghi đang SỬA (null = popup dịch bình thường). Modal Từ vựng riêng dựng
    // bằng vanilla JS nên không truyền prop xuống được — mở qua cửa toàn cục.
    const [translateEdit, setTranslateEdit] = useState(null);

    useEffect(() => {
        window._reactOpenTranslate = ({ text, editWord = null, onSaved = null } = {}) => {
            setTranslateEdit(editWord ? { word: editWord, onSaved } : null);
            setTranslateText(text || '');
        };
        return () => { delete window._reactOpenTranslate; };
    }, []);
    const [spinAvailable, setSpinAvailable] = useState(false);
    const pendingModeRef = useRef(null);

    // Nghe tín hiệu khoá/mở thanh tìm kiếm khi vào/ra Full Test TOEIC.
    useEffect(() => {
        const unsub = EventBus.on(GameEvents.TOEIC_SEARCH_LOCK, (lock) => setToeicFullTestLock(!!lock));
        return unsub;
    }, []);
    const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');

    // Mở popup chọn đề khi user click 1 chế độ mà chưa chọn đề
    useEffect(() => {
        const unsub = EventBus.on(GameEvents.TOPIC_MODAL_REQUESTED, ({ pendingMode } = {}) => {
            pendingModeRef.current = pendingMode || null;
            setTopicMode(pendingMode || null);
            setTopicOpen(true);
        });
        return unsub;
    }, []);

    // Lấy xếp hạng all-time của user (cạnh khiên); refresh sau mỗi lượt luyện tập.
    useEffect(() => {
        const uid = user?.id || user?._id;
        if (!uid) { setRank(null); return; }
        let cancelled = false;
        const fetchRank = () => {
            fetch(`/api/leaderboard/rank/${uid}/all-time`)
                .then(r => r.json())
                .then(j => { if (!cancelled && j.success) setRank(j.data?.rank ?? null); })
                .catch(() => {});
        };
        fetchRank();
        const unsub = EventBus.on(GameEvents.PRACTICE_COMPLETED, fetchRank);
        return () => { cancelled = true; unsub?.(); };
    }, [user?.id, user?._id]);

    const handleTopicSelected = useCallback(() => {
        const mode = pendingModeRef.current;
        pendingModeRef.current = null;
        setTopicMode(null);

        if (mode) {
            // Chọn đề xong → mở Part selector với pendingMode,
            // PartSelector.selectPart() sẽ emit PRACTICE_REQUESTED sau khi user chọn part.
            //
            // Hai popup dùng chung `id="modal-container"`. `TopicModal` gọi
            // `onSelected()` (hàm này) RỒI mới `onClose()`, mà React gỡ khỏi cây
            // là việc bất đồng bộ — nên có lúc TỒN TẠI ĐỒNG THỜI hai phần tử
            // cùng id. Khi đó mọi truy vấn DOM của popup Part trúng cái CŨ: thẻ
            // Part hiện ra nhưng bấm không ăn, phải đóng rồi mở lại mới chọn được.
            //
            // `setTimeout` cho React kịp dọn. Nhưng chỉ dựa vào thời gian là
            // đoán mò, nên PartSelector còn tự neo truy vấn vào modal CUỐI CÙNG
            // (xem `root()` trong partSelector.js) — hai lớp cùng chặn.
            setTimeout(() => {
                PartSelector.pendingMode = mode;
                PartSelector.showPartSelectionModal();
            }, 200);
        }
    }, []);

    /**
     * Về trang chủ, hoặc cuộn lên đầu nếu ĐÃ ở đó.
     *
     * Hai ý định khác nhau tuỳ chỗ đang đứng:
     *   · Đang ở màn khác → "cho tôi ra khỏi đây", và về ĐÚNG chỗ đã cuộn.
     *     Thoát luyện tập rồi phải cuộn tìm lại thẻ chế độ vừa bấm là mất chỗ.
     *   · Đã ở trang chủ → bấm nút Trang chủ không còn nghĩa "điều hướng" nữa;
     *     thứ duy nhất nó có thể làm là đưa lên đầu trang.
     *
     * Không bắt bấm hai lần: người dùng đã ở trang chủ thì cú bấm ĐẦU TIÊN phải
     * ăn ngay. Bắt bấm lần nữa là thêm một bước cho việc chỉ có một nghĩa.
     */
    const handleHomeClick = useCallback(() => {
        showScreen('home-screen', { scrollTop: currentScreen === 'home-screen' });
    }, [showScreen, currentScreen]);

    const handleTopicClose = useCallback(() => {
        // Đóng mà không chọn → bỏ pending, không auto-start
        pendingModeRef.current = null;
        setTopicMode(null);
        setTopicOpen(false);
    }, []);

    const handlePartSelector = useCallback(() => {
        PartSelector.showPartSelectionModal();
    }, []);


    // Mốc mở khoá — nạp khi đăng nhập & khi lên cấp (để nút tự mở/khoá).
    const [unlockTick, setUnlockTick] = useState(0);
    useEffect(() => {
        if (!isLoggedIn) return;
        const reload = () => loadUnlocks(true).then(() => setUnlockTick(t => t + 1));
        reload();
        const unsub = EventBus.on(GameEvents.USER_LEVEL_UP, reload);
        return () => unsub?.();
    }, [isLoggedIn]);
    // Khách chưa login: các tính năng CẦN TÀI KHOẢN (từ vựng riêng, yêu thích)
    // hiện ổ khoá, bấm ra popup đăng nhập — không lưu server được thì mở cũng vô ích.
    const favLock = isLoggedIn ? lockInfo('feature:favorites') : { locked: true, guest: true };
    const translateLock = isLoggedIn ? lockInfo('feature:translate') : { locked: false };

    // Bấm nút khoá-khách → mời đăng nhập.
    const promptLogin = () => {
        Notification.show({ type: 'info', title: '🔒 Đăng nhập để mở khoá', message: 'Tính năng này cần đăng nhập.', duration: 3000 });
        setAuthModal('login');
    };

    // Báo mốc còn thiếu (dùng chung cho các nút bị khoá trên nav).
    const warnLocked = (name, requiredLevel) => Notification.show({
        type: 'warning',
        title: `🔒 Cần Level ${requiredLevel}`,
        message: `${name} mở khi bạn đạt Level ${requiredLevel}.`,
        duration: 3500,
    });

    // ── Nhập bằng giọng nói ───────────────────────────────────────────────────
    // Phiên nhận dạng tạo MỘT lần và giữ trong ref: tạo lại mỗi lần render sẽ ngắt
    // giữa chừng lúc người dùng đang nói (mỗi ký tự nghe được là một lần setState).
    useEffect(() => {
        if (!speechSupported) return;
        const s = createSpeechInput({
            lang: speechLangFor(getVocabLang()),
            onText: (text) => {
                setSearchReadOnly(false);
                setSearchQuery(text);
                // Nhớ lại chữ cuối cùng nghe được, để lúc dừng còn biết mở popup
                // dịch với nội dung gì. Không đọc `searchQuery` trong onStateChange
                // được: closure ở đó giữ giá trị cũ của lần render tạo ra nó.
                lastHeardRef.current = text;
            },
            onStateChange: (listening) => {
                setSpeechOn(listening);
                if (listening) {
                    // Bắt đầu phiên mới thì quên chữ của phiên trước, không thì
                    // bấm nói rồi im lặng sẽ mở popup với nội dung nói lần trước.
                    lastHeardRef.current = '';
                    return;
                }
                // Vừa dừng nghe = người dùng nói xong. Mở popup dịch.
                //
                // Mốc là lúc DỪNG chứ không phải `isFinal`: một phiên có thể chốt
                // nhiều đoạn giữa chừng, mở popup ở đó là cắt ngang lúc còn đang nói.
                const text = (lastHeardRef.current || '').trim();
                lastHeardRef.current = '';
                if (!text || !autoTranslateRef.current) return;
                autoTranslateRef.current = false;
                openTranslateRef.current?.(text);
            },
            onError: (code) => {
                Notification.show({
                    type: 'warning',
                    title: code === 'not-allowed' ? '🎤 Chưa cấp quyền micro' : '🎤 Không nghe được',
                    message: code === 'not-allowed'
                        ? 'Cho phép trang này dùng micro trong cài đặt trình duyệt rồi thử lại.'
                        : 'Trình duyệt báo lỗi khi nhận giọng nói. Thử lại hoặc gõ tay.',
                    duration: 4000,
                });
            },
        });
        speechRef.current = s;
        return () => { s.destroy(); speechRef.current = null; };
    }, [speechSupported]);

    // Firefox chưa cài đặt SpeechRecognition (tính tới 2026). Nói thẳng tên trình
    // duyệt dùng được, đừng chỉ báo "không hỗ trợ" rồi để người dùng tự đoán.
    const warnNoSpeech = useCallback(() => Notification.show({
        type: 'info',
        title: '🎤 Trình duyệt chưa hỗ trợ',
        message: 'Nhập bằng giọng nói cần Chrome, Edge hoặc Safari. Firefox chưa có tính năng này — bạn vẫn gõ tay bình thường nhé.',
        duration: 5000,
    }), []);

    // Đặt vào ref để callback nhận dạng giọng nói (tạo một lần trong effect) luôn
    // gọi được bản mới nhất, mà không phải dựng lại cả phiên mỗi lần khoá đổi.
    openTranslateRef.current = (text) => {
        if (translateLock.locked) return warnLocked('Dịch nhanh', translateLock.requiredLevel);
        setTranslateEdit(null);     // vào bằng giọng nói luôn là dịch mới, không phải sửa
        setTranslateText(text);
    };

    // Chế độ luyện tập dựng HTML thuần nên không gọi thẳng được `setTranslateText`.
    // Nó phát sự kiện, TopNav mở hộ — và đi qua `openTranslateRef` nên vẫn chịu
    // cùng một khoá theo Level như mọi lối vào khác.
    useEffect(() => {
        const unsub = EventBus.on(GameEvents.TRANSLATE_REQUESTED, ({ text } = {}) => {
            // Chặn khi đang THI, không chặn lúc luyện tập — cùng luật với phím
            // tắt Shift+Z ở dưới: tra nghĩa giữa bài luyện là HỌC, còn giữa bài
            // thi thì tra chính là xem đáp án.
            if (isInExam) return;
            const t = String(text || '').trim();
            if (t) openTranslateRef.current?.(t);
        });
        return unsub;
    }, [isInExam]);

    const stopSpeech = useCallback(() => speechRef.current?.stop(), []);
    const startSpeech = useCallback(() => {
        if (isInPractice) return;   // đang luyện tập thì ô tìm kiếm khoá

        // Kéo con trỏ về ô tìm kiếm trước khi nghe. Không có bước này thì đang ở
        // giữa trang bấm phím nói xong, chữ hiện ra ở một ô mà con trỏ không nằm
        // trong đó — gõ sửa tiếp là gõ vào chỗ khác.
        setSearchReadOnly(false);
        document.getElementById('search-input')?.focus();

        // Xoá chữ cũ trước khi nghe. Không xoá thì chữ mới NỐI ĐUÔI chữ cũ —
        // ô còn `管家爱华。` mà nói `你好` sẽ ra một câu vô nghĩa, và popup dịch
        // mở lên với nội dung đó.
        setSearchQuery('');

        speechRef.current?.start();
    }, [isInPractice]);
    const toggleSpeech = useCallback(() => {
        if (speechRef.current?.isListening()) stopSpeech();
        else {
            // Bấm nút micro = muốn điền vào ô tìm kiếm. Tự nhảy popup dịch lên
            // là cướp thao tác, nên KHÔNG bật cờ tự dịch ở đây.
            autoTranslateRef.current = false;
            startSpeech();
        }
    }, [startSpeech, stopSpeech]);

    // NHẤN GIỮ để nói, NHẢ ra thì dừng và điền — cùng cử chỉ với giữ Shift.
    //
    // `heldRef` phân biệt hai lối dùng trên CÙNG một nút: giữ lâu thì nhả là
    // dừng; chạm nhanh thì rơi về bật/tắt như cũ. Không phân biệt thì người
    // quen chạm nhanh sẽ bật micro rồi không biết tắt kiểu gì.
    const micHeldRef = useRef(false);
    const micJustHeldRef = useRef(false);

    const handleMicDown = useCallback((e) => {
        if (!speechSupported) return warnNoSpeech();
        // Chặn chuỗi chuột giả lập sau cú chạm, và chặn việc nút cướp focus khỏi
        // ô nhập — mất focus là ô tìm tự thu lại giữa chừng.
        e.preventDefault();
        if (speechRef.current?.isListening()) return;
        micHeldRef.current = true;
        // GIỮ = nói xong vào thẳng popup dịch, giống hệt cử chỉ giữ Shift.
        // Giữ để nói là muốn TRA NGHĨA ngay, không phải điền chữ vào ô rồi còn
        // phải bấm thêm một lần nữa. (Chạm nhanh thì `handleMicClick` tắt cờ
        // này — bấm nút là muốn điền vào ô tìm, tự nhảy popup lên là cướp
        // thao tác.)
        autoTranslateRef.current = true;
        startSpeech();
    }, [speechSupported, warnNoSpeech, startSpeech]);

    const handleMicUp = useCallback(() => {
        if (!micHeldRef.current) return;
        micHeldRef.current = false;
        // `click` LUÔN bắn sau `pointerup`. Không đánh dấu thì nó chạy
        // `toggleSpeech` ngay sau khi ta vừa dừng — tức là BẬT LẠI micro, và
        // người dùng thấy nhả tay xong micro vẫn chạy.
        micJustHeldRef.current = true;
        stopSpeech();
    }, [stopSpeech]);

    const handleMicClick = useCallback(() => {
        if (!speechSupported) return warnNoSpeech();
        if (micJustHeldRef.current) { micJustHeldRef.current = false; return; }
        // Chạm nhanh = điền vào ô tìm, KHÔNG tự nhảy popup. `handleMicDown` đã
        // bật cờ trước đó (mọi cú chạm đều đi qua `pointerdown`), phải tắt lại
        // ở đây — không thì chạm nhanh cũng bị kéo vào popup dịch.
        autoTranslateRef.current = false;
        toggleSpeech();
    }, [speechSupported, warnNoSpeech, toggleSpeech]);

    /**
     * Đóng ô tìm: xoá chữ, dọn kết quả, và THU ô lại.
     *
     * Ba việc luôn đi cùng nhau — nút × trước đây chỉ làm việc đầu, nên xoá
     * xong bàn phím vẫn ở đó và người dùng phải chạm ra ngoài mới đóng được.
     *
     * Ở khổ điện thoại ô tìm giờ là DÒNG CỐ ĐỊNH luôn hiện, nên `blur()` không
     * còn thu ô nữa — nó chỉ đóng bàn phím ảo, đúng thứ người dùng muốn khi
     * bấm ×. Ô vẫn nằm đó chờ lần gõ sau.
     */
    const closeSearch = useCallback(() => {
        setSearchQuery('');
        window._reactClearSearch?.();
        document.getElementById('search-input')?.blur();
    }, []);

    /**
     * Nuốt đúng MỘT cú `click` sắp tới — chống bấm xuyên thấu.
     *
     * Nút × bị gỡ khỏi DOM ngay khi ô đóng (điều kiện hiện nó phụ thuộc
     * `searchFocused`). Lúc ngón tay nhấc lên, trình duyệt bắn `click` vào phần
     * tử đang nằm ở TOẠ ĐỘ đó — giờ là thẻ chế độ luyện tập bên dưới, nên bấm ×
     * lại mở luôn Flashcard.
     *
     * Chỉ gọi từ đường CHẠM. Phím Escape cũng đóng ô nhưng không sinh `click`
     * nào — gọi ở đó là nuốt oan cú bấm hợp lệ kế tiếp của người dùng.
     */
    const swallowNextClick = useCallback(() => {
        const swallow = (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
        };
        // `capture: true` để bắt TRƯỚC khi sự kiện tới đích; `once` tự gỡ sau
        // một lần. Kèm hẹn giờ dọn cho trường hợp chạm rồi kéo ngón ra ngoài —
        // lúc đó KHÔNG có `click` nào bắn và listener sẽ nằm lại vĩnh viễn.
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 400);
    }, []);

    // Không còn cử chỉ GIỮ nên `pointerup` chẳng phải dọn gì: chạm đúp xử lý
    // trọn vẹn ngay ở `pointerdown`. Giữ hàm rỗng thì thừa — bỏ hẳn handler.

    // GIỮ Shift để nói, thả ra thì dừng — và thả xong TỰ MỞ popup dịch với nội
    // dung vừa nói (xem autoTranslateRef trong onStateChange). Dùng được ở bất kỳ
    // đâu trong trang, không cần bấm vào ô tìm kiếm trước: `startSpeech` tự kéo
    // con trỏ về đó.
    //
    // Ngưỡng giữ + huỷ khi có phím khác nằm trong `createHoldGesture` — không có
    // hai lớp đó thì mỗi lần gõ chữ hoa là một lần bật micro.
    useEffect(() => {
        if (!speechSupported) return;

        const gesture = createHoldGesture({
            thresholdMs: 350,
            // Vào bằng phím tắt thì nói xong tự mở popup dịch; bấm nút micro thì
            // không (xem toggleSpeech).
            onStart: () => { autoTranslateRef.current = true; startSpeech(); },
            onStop: stopSpeech,
        });

        // Chỉ nhận cử chỉ khi người dùng KHÔNG đang gõ ở ô nhập nào khác — dictate
        // vào ô tìm kiếm thì được, chứ đang soạn trong popup dịch mà Shift cướp
        // micro thì rất khó chịu.
        const busyElsewhere = () => {
            // Có cửa sổ khác đang CHIẾM phím nói (popup Dịch nhanh) thì nav đứng
            // im. Không có lớp này thì hai listener cùng nghe một phím: popup mở
            // ra, giữ Shift, chữ chui vào ô tìm kiếm sau lưng người dùng.
            //
            // Kiểm bằng quyền sở hữu chứ không bằng focus: popup vừa mở thì
            // activeElement còn là <body>, kiểm focus không phát hiện được gì.
            if (window._speechOwner) return true;

            const el = document.activeElement;
            if (!el || el.id === 'search-input') return false;
            // `!!` vì `isContentEditable` không có trên mọi phần tử (undefined trên
            // <body>) — thiếu nó thì hàm trả undefined thay vì false. Ở đây
            // undefined vẫn falsy nên hành vi không đổi, nhưng một hàm tên
            // `busyElsewhere` mà trả undefined là chỗ dễ đọc nhầm về sau.
            return !!(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
        };

        /**
         * Đoạn chữ người dùng đang bôi đen — '' nếu không nên tra nghĩa.
         *
         * Loại bỏ ba trường hợp:
         *  - Bôi đen TRONG ô nhập (input/textarea/contentEditable): ở đó Shift+Z
         *    là gõ chữ "Z" hoa. Cướp mất thì đang soạn dở bị nuốt phím, mà lỗi
         *    kiểu đó rất khó đoán ra nguyên nhân.
         *  - Đang mở popup dịch: tra tiếp trong chính popup là vòng lặp vô nghĩa.
         *  - Đoạn quá dài: bôi nhầm cả trang (Ctrl+A) mà gửi đi dịch là tốn
         *    token AI cho thứ người dùng không định tra.
         */
        const MAX_SELECTION = 300;
        const readSelection = () => {
            const sel = window.getSelection?.();
            const raw = sel ? String(sel).trim() : '';
            if (!raw || raw.length > MAX_SELECTION) return '';

            // Vùng chọn nằm trong ô nhập nào không? Kiểm theo NODE của vùng chọn
            // chứ không theo `activeElement`: bôi đen bằng chuột thì tiêu điểm
            // có thể vẫn ở chỗ khác.
            const node = sel.anchorNode;
            const el = node?.nodeType === 3 ? node.parentElement : node;
            if (el?.closest?.('input, textarea, [contenteditable="true"]')) return '';
            // Popup dịch đang mở thì để nó tự xử lý.
            if (el?.closest?.('#modal-container, .translate-modal')) return '';

            return raw;
        };

        const onKeyDown = (e) => {
            // ── Bôi đen chữ + Shift+Z = tra nghĩa đoạn đó ────────────────────
            //
            // Đặt TRƯỚC nhánh Shift: bấm Z trong lúc giữ Shift sẽ rơi vào nhánh
            // `else` bên dưới và gọi `gesture.otherKeyDown()` — tức là huỷ cử
            // chỉ nói. Xử lý xong thì `return` luôn, không để lọt xuống.
            //
            // `e.repeat` bỏ qua các lần lặp khi GIỮ phím, không thì giữ một giây
            // là popup mở đi mở lại hàng chục lần.
            //
            // Chỉ chặn khi đang THI (`isInExam`), KHÔNG chặn lúc luyện từ vựng.
            //
            // Bản đầu dùng `isInPractice` — gộp cả hai — nên tra nghĩa chết luôn
            // ở màn luyện tập, đúng nơi cần nó nhất: gặp từ lạ trong câu hỏi thì
            // tra là HỌC. Còn giữa bài thi thì tra chính là xem đáp án.
            if (e.shiftKey && (e.key === 'Z' || e.key === 'z')) {
                if (e.repeat || isInExam) return;
                const picked = readSelection();
                if (!picked) return;   // không bôi gì thì coi như không có phím tắt

                // Bỏ bôi đen NGAY: giữ lại thì bấm lần nữa vẫn thấy vùng chọn cũ
                // và mở lại popup của từ đã tra rồi.
                window.getSelection?.()?.removeAllRanges();
                e.preventDefault();
                // Qua `openTranslateRef` chứ KHÔNG gọi thẳng `setTranslateText`:
                // hàm đó mới kiểm khoá theo Level và dọn trạng thái "đang sửa
                // từ". Gọi thẳng là mở được popup cả khi tính năng chưa mở khoá.
                openTranslateRef.current?.(picked);
                return;
            }

            if (e.key === 'Shift') {
                if (busyElsewhere() || isInPractice) return;
                gesture.keyDown({ repeat: e.repeat });
            } else {
                gesture.otherKeyDown();
            }
        };
        const onKeyUp = (e) => { if (e.key === 'Shift') gesture.keyUp(); };
        // Alt-Tab ra khỏi trang khi đang giữ Shift → không bao giờ nhận được keyup,
        // micro sẽ kẹt ở trạng thái nghe. Dừng chủ động.
        const onBlur = () => { gesture.reset(); stopSpeech(); };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
            gesture.reset();
        };
        // `isInExam` phải có mặt: listener đóng gói giá trị của lần render này,
        // thiếu nó thì vào/ra màn thi mà handler vẫn dùng giá trị cũ.
    }, [speechSupported, isInPractice, isInExam, startSpeech, stopSpeech]);

    // Vào màn luyện tập giữa chừng thì ngắt luôn, không để micro chạy nền.
    useEffect(() => { if (isInPractice) stopSpeech(); }, [isInPractice, stopSpeech]);

    // Expose spin opener globally + check availability
    useEffect(() => {
        // Khoá theo Level: chặn mở Vòng quay ở MỌI nơi gọi (Cửa hàng, Túi đồ…).
        window._openSpinWheel = () => {
            const lv = lockInfo('feature:spin');
            if (lv.locked) {
                Notification.show({
                    type: 'warning',
                    title: `🔒 Cần Level ${lv.requiredLevel}`,
                    message: `Vòng quay mở khi bạn đạt Level ${lv.requiredLevel}.`,
                    duration: 3500,
                });
                return;
            }
            setSpinOpen(true); setSpinAvailable(false);
        };
        return () => { delete window._openSpinWheel; };
    }, []);

    useEffect(() => {
        const token = user ? localStorage.getItem('authToken') : null;
        if (!token) return;
        const parsed = (() => { try { return JSON.parse(token); } catch { return {}; } })();
        const t = parsed.token || token;
        if (!t) return;
        fetch('/api/spin/status', { headers: { Authorization: `Bearer ${t}` } })
            .then(r => r.json())
            .then(d => { if (d.success) setSpinAvailable(d.canSpin); })
            .catch(() => {});
    }, [user]);

    const avatarSrc = resolveAvatarSrc(GameState.state?.equippedImages?.avatar, user?.avatar);
    const isAvatarImg = !!avatarSrc;
    // Khung cosmetic đang trang bị — đồng bộ với Hồ sơ / Bảng xếp hạng.
    const equippedFrame = GameState.state?.equipped?.frame;
    const avatarFrameStyle = frameStyle(equippedFrame);
    const frameImg = frameOverlayUrl(equippedFrame);

    return (
        <>
        <nav className={[
            'top-nav',
            // Ẩn khi cuộn XUỐNG, hiện lại khi cuộn LÊN (chỉ có tác dụng ở khổ
            // điện thoại — xem responsive.css). Nhưng KHÔNG ẩn khi đang gõ tìm:
            // ô nhập nằm trong chính thanh này, ẩn đi là người dùng mất chỗ gõ
            // giữa chừng.
            navHidden && !searchFocused ? 'nav-hidden' : '',
        ].filter(Boolean).join(' ')}>
            <div className="nav-left">
                <button id="menu-btn" className="icon-btn" onClick={() => setMenuOpen(!menuOpen)} style={{ position: 'relative' }}>
                    <i className="fas fa-bars"></i>
                    {menuRewardCount > 0
                        ? <span className="notif-badge">{menuRewardCount > 99 ? '99+' : menuRewardCount}</span>
                        : menuHasDot
                        ? <span className="notif-badge notif-badge-dot" />
                        : null
                    }
                </button>
                <button id="home-btn" className="icon-btn nav-home-btn" title="Trang chủ" onClick={handleHomeClick}>
                    <i className="fas fa-home"></i>
                </button>

                <NotificationPanel isLoggedIn={isLoggedIn} />

                <div className="user-info" onClick={handleHomeClick} style={{ cursor: 'pointer' }} title="Trang chủ">
                    <div className="avatar-small" id="user-avatar" style={avatarFrameStyle || undefined}>
                        {isAvatarImg
                            ? <img src={avatarSrc} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            : (avatarSrc || user?.username?.charAt(0)?.toUpperCase() || 'P')
                        }
                        {frameImg && <span className="frame-overlay" style={{ backgroundImage: `url("${frameImg}")` }} aria-hidden="true" />}
                    </div>
                    <div className="user-details">
                        <span id="username" className="username">{user?.username || 'Player'}</span>
                        <div className="level-badge">
                            <i className="fas fa-star"></i>
                            <span>Level </span>
                            <span id="user-level">{user?.level || 1}</span>
                            {shields > 0 && (
                                <span
                                    className="shield-badge"
                                    style={{ color: shieldColor }}
                                    title={`${shields} khiên bảo vệ streak`}
                                >
                                    <i className="fas fa-shield-alt"></i>
                                    <span className="shield-count">{shields}</span>
                                </span>
                            )}
                            {rank != null && (
                                <span
                                    className="rank-badge"
                                    style={{ color: rankColor }}
                                    title={`Xếp hạng #${rank} toàn hệ thống`}
                                >
                                    <i className="fas fa-trophy"></i>
                                    <span className="rank-count">#{rank}</span>
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="nav-center">
                {/* Ô tìm. Ở khổ điện thoại CSS kéo nó ra khỏi đây thành một
                    dòng cố định ngay dưới thanh trạng thái (xem responsive.css),
                    còn chỗ này chỉ giữ lại nút mic ở giữa nav.

                    KHÔNG còn class `is-recording`: dấu hiệu đang thu nằm trên
                    chính nút mic (`.mic-btn.is-listening` — đỏ + nhịp đập, kèm
                    cả bản cho người bật "giảm chuyển động"). Nhấp nháy thêm ở
                    ô tìm là báo cùng một việc ở hai chỗ, mà ô tìm thì không
                    liên quan gì tới việc ghi âm nữa. */}
                <div className={`search-bar ${isInPractice ? 'disabled' : ''}`}>
                    {/* KÍNH LÚP — icon này nói ô dùng để làm gì, chấm hết.

                        Trước đây nó là hình micro, từ hồi ô tìm còn kiêm luôn
                        việc ghi âm (giữ vào ô là nói). Ghi âm giờ có nút riêng
                        trên nav, nên hình micro ở đây chỉ gợi ý sai: người dùng
                        chạm vào ô là để GÕ, không ai giữ vào đây để nói cả.

                        Đang luyện tập thì đổi thành ổ khoá — ô bị vô hiệu hoá
                        thật, hiện kính lúp là hứa một thứ không bấm được. */}
                    <i className={`fas ${isInPractice ? 'fa-lock' : 'fa-search'}`}></i>
                    <input
                        type="text"
                        id="search-input"
                        placeholder={isInPractice
                            ? 'Đang luyện tập — tạm khoá tìm kiếm'
                            : speechOn
                                ? '🎤 Đang nghe... nói từ bạn muốn tìm'
                                : translateLock.locked
                                    ? `Tìm từ vựng... (Dịch nhanh mở ở Level ${translateLock.requiredLevel})`
                                    : 'Tìm từ vựng... (Enter: dịch · giữ Shift: nói · bôi đen + Shift+Z: tra nghĩa)'}
                        /* "off" bị Chrome/Edge bỏ qua cho ô trông giống ô đăng
                           nhập; token vô nghĩa thì chúng không biết điền gì.
                           `readOnly` bên dưới là lớp chắc chắn, đây là lớp hai. */
                        autoComplete="nope-vocab-search"
                        readOnly={searchReadOnly || isInPractice}
                        disabled={isInPractice}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onFocus={() => { setSearchReadOnly(false); setSearchFocused(true); }}
                        onMouseDown={() => setSearchReadOnly(false)}
                        onBlur={() => setSearchFocused(false)}
                        // KHÔNG gắn cử chỉ giữ ở đây nữa. Ô tìm giờ là dòng cố
                        // định luôn hiện, người dùng chạm vào là để GÕ — giữ lâu
                        // trên chữ là để bôi đen, cướp mất là không sửa được.
                        // Việc ghi âm đã chuyển hẳn sang nút mic trên nav.
                        onKeyDown={(e) => {
                            // Esc → xoá ô tìm kiếm và bỏ focus. Đặt TRƯỚC nhánh Enter
                            // vì đây là lối thoát, phải luôn chạy được.
                            if (e.key === 'Escape') {
                                e.preventDefault();
                                // Cùng một đường với nút × — xoá chữ, dọn kết
                                // quả, thu ô lại. Chép tay ba dòng ở hai nơi thì
                                // sửa một chỗ là hai lối lệch nhau.
                                closeSearch();
                                return;
                            }
                            // Enter → mở Dịch nhanh. Trước đây phải Shift+Enter, nhưng
                            // Enter thường KHÔNG làm gì cả (tìm kiếm lọc theo onChange),
                            // nên gán Enter cho việc này không cướp mất hành vi nào.
                            // Vẫn nhận Shift+Enter để thói quen cũ không gãy.
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (translateLock.locked) return warnLocked('Dịch nhanh', translateLock.requiredLevel);
                                const q = searchQuery.trim();
                                if (q) setTranslateText(q);
                            }
                        }}
                    />
                    {/* HAI nút, hai việc khác nhau — trước đây gộp làm một nên
                        xoá chữ là ô đóng luôn, gõ nhầm phải mở lại từ đầu.

                        · Cây chổi = XOÁ chữ, ô Ở NGUYÊN (gõ tiếp được ngay).
                          Chỉ hiện khi có chữ — ô rỗng thì nó vô nghĩa.
                        · Dấu × = ĐÓNG ô. Hiện cả khi ô rỗng, vì đó mới là lối
                          thoát: chạm mở ô rồi đổi ý thì phải có chỗ bấm.

                        `onPointerDown` + `preventDefault` chứ không phải `onClick`:
                        chạm/bấm xuống là input mất focus NGAY, React gỡ nút khỏi
                        DOM trước khi `click` kịp bắn — nút coi như không bấm
                        được. Chặn hành vi mặc định thì focus ở nguyên chỗ.
                        Dùng `pointerdown` (không phải `mousedown`) vì trên cảm
                        ứng nó bắn TRƯỚC, còn `mousedown` chỉ là sự kiện giả lập
                        sinh ra sau — lúc đó nút đã biến mất rồi. */}
                    {/* MỘT nút × duy nhất: xoá chữ + đóng bàn phím.
                        Trước đây là hai nút cạnh nhau (cục tẩy "xoá chữ" và ×
                        "đóng ô"). Ô tìm giờ LUÔN HIỆN nên không còn gì để đóng —
                        hai nút làm gần như cùng một việc, đặt cạnh nhau chỉ tổ
                        bấm nhầm.

                        `swallowNextClick()` là phần BẮT BUỘC: nút vừa bị gỡ khỏi
                        DOM (nó chỉ hiện khi có chữ), nên khi nhấc ngón tay trình
                        duyệt bắn `click` vào thứ đang nằm ở toạ độ đó — thẻ chế
                        độ luyện tập bên dưới. Bấm × mà mở luôn Flashcard là lỗi
                        này. */}
                    {searchQuery && !isInPractice && (
                        <button
                            id="close-search-btn"
                            className="clear-search-btn close-search-btn"
                            type="button"
                            title="Xoá nội dung"
                            aria-label="Xoá nội dung"
                            onPointerDown={(e) => {
                                // `pointerdown` chứ không `mousedown`: trên cảm
                                // ứng nó bắn TRƯỚC, còn `mousedown` là sự kiện
                                // giả lập sinh ra sau — lúc đó nút đã biến mất.
                                e.preventDefault();
                                e.stopPropagation();
                                closeSearch();
                                swallowNextClick();
                            }}
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    )}
                </div>

                {/* Nút ghi âm nằm NGOÀI `.search-bar`, là anh em của nó.
                    Trước đây nó là CON của ô tìm. Trên điện thoại ô tìm thu lại
                    thành nút kính lúp và mic bị `display: none` — bấm vào chỗ đó
                    là bấm trúng input, nên nút ghi âm coi như không tồn tại.
                    Ra ngoài thì nó là đích chạm riêng, độc lập với việc ô tìm
                    đang thu hay đang bung.

                    Trên máy tính vẫn TRÔNG như nằm trong ô: layout.css kéo nó
                    chồng lên mép phải ô tìm bằng margin âm, không phải absolute.

                    Trình duyệt không hỗ trợ (Firefox) thì VẪN HIỆN nút, ở dạng mờ
                    + gạch chéo, bấm vào nói rõ lý do. Bản đầu tôi ẩn hẳn — và nó
                    lặp đúng lỗi của nút đăng nhập Google: tính năng biến mất mà
                    người dùng phải mở Console mới biết vì sao. Ẩn im lặng khiến
                    người ta nghĩ app hỏng; nút mờ khiến người ta biết phải đổi
                    trình duyệt. */}
                {!isInPractice && (
                    <button
                        type="button"
                        className={`mic-btn${speechOn ? ' is-listening' : ''}${speechSupported ? '' : ' is-unsupported'}`}
                        // Giữ để nói, nhả để điền. `onClick` vẫn còn cho lối chạm
                        // nhanh — `handleMicUp` đã nuốt trường hợp giữ nên hai lối
                        // không chồng nhau.
                        onPointerDown={handleMicDown}
                        onPointerUp={handleMicUp}
                        // Kéo ngón ra ngoài nút rồi nhả: `pointerup` bắn ở chỗ khác,
                        // không có dòng này là micro chạy mãi.
                        onPointerLeave={handleMicUp}
                        onPointerCancel={handleMicUp}
                        onClick={handleMicClick}
                        aria-pressed={speechSupported ? speechOn : undefined}
                        aria-label={!speechSupported
                            ? 'Nhập bằng giọng nói — trình duyệt này không hỗ trợ'
                            : speechOn ? 'Dừng nhập bằng giọng nói' : 'Nhập bằng giọng nói'}
                        title={!speechSupported
                            ? 'Trình duyệt này không hỗ trợ nhập giọng nói — dùng Chrome hoặc Edge'
                            : speechOn ? 'Đang nghe — nhả ra để điền' : 'Nhấn GIỮ để nói (hoặc giữ Shift)'}
                    >
                        <i className={`fas ${!speechSupported ? 'fa-microphone-slash' : speechOn ? 'fa-stop' : 'fa-microphone'}`}></i>
                    </button>
                )}
            </div>

            <div className="nav-right">
                <button id="topic-selector-btn" className="icon-btn" title="Chọn chủ đề từ vựng" onClick={() => setTopicOpen(true)}>
                    <i className="fas fa-book"></i>
                </button>
                <button id="part-selector-btn" className="icon-btn" title="Chọn Part" onClick={handlePartSelector}>
                    <i className="fas fa-layer-group"></i>
                </button>
                {/* Nút "Từ vựng riêng" đã chuyển sang MENU BÊN (SideMenu.jsx).
                    Nav bớt một nút thì icon tìm kiếm về được giữa hàng, và nút
                    này không mang huy hiệu nào nên nằm trong menu không giấu mất
                    thông tin gì — khác nút chuông, cái đó có số quà chưa nhận. */}
                <button
                    id="nav-favorite-btn"
                    className={`icon-btn${favLock.locked ? ' icon-btn--locked' : ''}`}
                    title={favLock.guest ? 'Đăng nhập để mở khoá'
                        : favLock.locked ? `Mở ở Level ${favLock.requiredLevel}` : 'Danh sách từ yêu thích'}
                    onClick={() => {
                        if (favLock.guest) return promptLogin();
                        if (favLock.locked) return warnLocked('Từ vựng yêu thích', favLock.requiredLevel);
                        setFavOpen(true);
                    }}
                >
                    <i className={`fas ${favLock.locked ? 'fa-lock' : 'fa-star'}`}></i>
                </button>
                <button
                    id="theme-toggle-btn"
                    className="icon-btn"
                    title={isDark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
                    onClick={() => {
                        const newTheme = isDark ? 'light' : 'dark';
                        document.documentElement.setAttribute('data-theme', newTheme);
                        localStorage.setItem('theme', newTheme);
                        setIsDark(!isDark);
                    }}
                >
                    <i className={`fas ${isDark ? 'fa-sun' : 'fa-moon'}`}></i>
                </button>
            </div>
        </nav>
        <FavoritesModal open={favOpen} onClose={() => setFavOpen(false)} />
        <TopicModal open={topicOpen} mode={topicMode} onClose={handleTopicClose} onSelected={handleTopicSelected} />
        <SpinWheelModal open={spinOpen} onClose={() => setSpinOpen(false)} />
        {translateText && (
            <TranslateModal
                text={translateText}
                // Xoá luôn translateEdit khi đóng — giữ lại thì lần sau mở popup
                // dịch bình thường lại rơi vào chế độ sửa của từ cũ.
                onClose={() => { setTranslateText(null); setTranslateEdit(null); }}
                editWord={translateEdit?.word || null}
                onSaved={translateEdit?.onSaved}
            />
        )}
        </>
    );
}
