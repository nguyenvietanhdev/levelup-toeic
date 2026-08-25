// Chế độ LUYỆN VIẾT CHỮ HÁN — người học tô theo nét mẫu, hệ thống chấm từng nét.
//
// Vì sao dùng thư viện thay vì tự viết: phần khó của luyện viết không phải vẽ lên
// canvas, mà là CHẤM NÉT — so hình dạng, THỨ TỰ và HƯỚNG của từng nét. Viết đúng
// hình mà sai thứ tự nét là học sai từ gốc, và chỉ máy mới bắt được.
// `hanzi-writer` (MIT) làm sẵn phần đó; dữ liệu nét lấy từ Make Me a Hanzi
// (Arphic Public License), đã chép 3.030 chữ vào `public/hanzi/`.
//
// Dữ liệu tải THEO YÊU CẦU: mỗi chữ một file ~2,8 KB. Cả bộ là 8,1 MB nên không
// thể nhét vào bundle — người học chữ nào thì tải chữ đó.

/**
 * `hanzi-writer` nạp THEO YÊU CẦU, không import tĩnh.
 *
 * Import tĩnh kéo cả thư viện (~35 kB, 11 kB gzip) vào chunk khởi động, nên
 * MỌI người dùng tải nó — kể cả người chỉ học tiếng Anh và không bao giờ mở
 * chế độ này (nó còn bị chặn hẳn khi ngôn ngữ từ vựng không phải tiếng Trung).
 *
 * Giữ trong biến module: nạp một lần rồi dùng lại cho mọi lượt luyện sau.
 */
let HanziWriter = null;

/** Bảo đảm thư viện sẵn sàng. Gọi lại nhiều lần chỉ tải một lần. */
async function ensureHanziWriter() {
    if (!HanziWriter) {
        const mod = await import('hanzi-writer');
        HanziWriter = mod.default;
    }
    return HanziWriter;
}
import { GameState } from '@game/state.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { Notification } from '@ui/Toaster.jsx';
import { PracticeManager } from '../practiceManager.js';
import { startQuestionTimer, stopQuestionTimer } from '../questionTimer.js';
import { afterAnswer } from '../practiceNav.js';

/** Tách một từ ghép thành các chữ Hán đơn — luyện viết `你好` nghĩa là viết `你` rồi `好`. */
export function splitHanzi(text) {
    return [...String(text || '')].filter(ch => /[一-鿿]/.test(ch));
}

export const HanziWriting = {
    config: null,
    questions: [],
    currentIndex: 0,
    writer: null,
    _writers: [],          // mọi writer của TỪ hiện tại — để huỷ hết khi sang câu
    charIndex: 0,          // đang viết chữ thứ mấy TRONG TỪ
    strokeNum: 0,          // nét kế tiếp cần tô — để mở lại quiz sau khi Xem mẫu
    _demoing: false,       // đang diễn mẫu, chặn bấm dồn
    mistakesThisWord: 0,   // đếm theo TỪ, không theo chữ — điểm tính trọn từ

    async start(config) {
        this.config = config;
        this.currentIndex = 0;

        // Nạp thư viện TRƯỚC khi dựng câu hỏi đầu tiên.
        //
        // `mountWriter` là hàm ĐỒNG BỘ và được gọi lại cho từng chữ — biến nó
        // thành async là phải sửa cả hai nơi gọi và dễ sinh tình trạng chạy
        // chồng. Nạp một lần ở đây thì mọi chỗ sau đó dùng như cũ.
        try {
            await ensureHanziWriter();
        } catch {
            // Mất mạng giữa chừng: nói rõ lý do rồi thoát, thay vì để người dùng
            // nhìn ô trống và tưởng chế độ hỏng.
            PracticeManager.complete();
            Notification.show({
                type: 'error',
                title: 'Không tải được bộ vẽ chữ',
                message: 'Kiểm tra kết nối mạng rồi thử lại.',
                duration: 4000,
            });
            return;
        }

        await this.generateQuestions();
        this.setupHintSkipListeners();

        if (this.questions.length === 0) {
            PracticeManager.complete();
            Notification.show({
                type: 'warning',
                title: 'Không có chữ Hán',
                message: 'Chế độ này cần bộ từ vựng tiếng Trung. Đổi Ngôn ngữ từ vựng sang Tiếng Trung trong Cài đặt.',
                duration: 4000,
            });
            return;
        }
        this.showQuestion();
    },

    async generateQuestions() {
        // Lấy từ qua PartSelector giống mọi chế độ khác. Bản đầu tôi đọc
        // `this.config.words` — trường đó KHÔNG TỒN TẠI, nên mảng luôn rỗng, lượt
        // luyện kết thúc ngay lúc bắt đầu mà không hiện chữ nào.
        const selectedPart = GameState.state?.settings?.selectedPart || null;
        const requestCount = selectedPart ? 9999 : (this.config?.questionsPerRound || 8);
        const words = await PartSelector.getWordsForPractice(requestCount);
        if (!Array.isArray(words)) { this.questions = []; return; }

        // Một câu hỏi = MỘT TỪ, viết lần lượt từng chữ trong từ đó.
        //
        // Bản đầu tôi tách mỗi chữ thành một câu riêng, nghĩ rằng luyện `你` rồi
        // `好` ở hai lượt khác nhau là đủ. Sai về mặt học: người học thấy pinyin
        // "nǐ hǎo" và nghĩa "Xin chào" nhưng chỉ được viết một chữ — mất luôn mối
        // liên hệ giữa mặt chữ và từ. Viết trọn `你好` mới là thứ họ cần làm được.
        const out = [];
        for (const w of words) {
            const chars = splitHanzi(w.zh || w.word);
            if (chars.length === 0) continue;
            out.push({
                word: w.zh || w.word,
                chars,
                pinyin: w.phonetic || '',
                meaning: w.vn || '',
            });
        }
        this.questions = out.slice(0, this.config?.questionsPerRound || 8);
    },

    showQuestion() {
        const q = this.questions[this.currentIndex];
        if (!q) return this.finish();
        this.charIndex = 0;
        this.mistakesThisWord = 0;
        this._demoing = false;

        const container = document.getElementById('practice-content');
        if (!container) return;

        // Một ô cho mỗi chữ trong từ. Ô đang viết sáng lên, ô đã xong giữ nét đã
        // viết để người học nhìn thấy cả từ dần hiện ra — đó là phần thưởng thị
        // giác của việc viết trọn một từ.
        const boxes = q.chars.map((_, i) =>
            `<div class="hanzi-canvas${i === 0 ? ' is-active' : ''}" id="hanzi-box-${i}"></div>`
        ).join('');

        container.innerHTML = `
            <div class="hanzi-mode">
                <div class="hanzi-prompt">
                    <div class="hanzi-pinyin">${escapeText(q.pinyin)}</div>
                    <div class="hanzi-meaning">${escapeText(q.meaning)}</div>
                </div>
                <div class="hanzi-boxes">${boxes}</div>
                <div class="hanzi-actions">
                    <button class="btn btn-secondary" id="hanzi-demo">Xem mẫu</button>
                    <span class="hanzi-progress" id="hanzi-strokes"></span>
                </div>
            </div>
        `;

        // Gắn ở ĐÂY chứ không trong mountWriter: mountWriter chạy lại cho từng chữ,
        // gắn trong đó thì từ 3 chữ có 3 listener chồng lên nhau và bấm một lần chạy
        // ba lần. Nút do showQuestion tạo nên mỗi câu đúng một listener.
        document.getElementById('hanzi-demo')?.addEventListener('click', () => this.showDemo());

        this.mountWriter(q);
        startQuestionTimer('hanzi-writing', () => this.timeUp());
    },

    mountWriter(q) {
        const i = this.charIndex;
        const target = document.getElementById(`hanzi-box-${i}`);
        if (!target) return;


        // Ô đang viết sáng, các ô khác mờ đi — không thì người học không biết phải
        // vẽ vào ô nào, và HanziWriter chỉ nhận chuột ở ô đang gắn.
        q.chars.forEach((_, k) => {
            document.getElementById(`hanzi-box-${k}`)?.classList.toggle('is-active', k === i);
        });

        // HanziWriter nhận kích thước LÚC TẠO, không đọc CSS — truyền số lệch với
        // CSS thì SVG tràn ra ngoài hoặc để lại viền trống.
        //
        // Đọc thẳng từ ô đã dựng thay vì chép lại bảng ngưỡng của CSS. Chép tay
        // là hai nơi phải sửa song song, mà lệch nhau thì hỏng ÂM THẦM: chữ vẫn
        // hiện, chỉ là lệch khỏi khung hoặc chừa viền trống. Lấy từ DOM thì CSS
        // đổi ngưỡng lúc nào cũng tự khớp.
        const size = Math.round(target.getBoundingClientRect().width) || 260;

        // Chỉ bỏ qua phần DỰNG BỘ VẼ khi thư viện chưa sẵn sàng — phần tô sáng ô
        // và cuộn tới ô đang viết vẫn phải chạy, chúng không phụ thuộc vào nó.
        //
        // `start()` đã `await ensureHanziWriter()` nên đường chạy bình thường
        // luôn có. Nhưng hàm này còn được gọi trực tiếp lúc chuyển sang chữ kế
        // tiếp, nên vẫn tự bảo vệ: thiếu lớp này thì `HanziWriter.create` ném
        // "Cannot read properties of null" và cả lượt luyện chết giữa chừng.
        this.writer = HanziWriter?.create(target, q.chars[i], {
            width: size,
            height: size,
            padding: 12,
            showCharacter: false,
            showOutline: true,          // nét mờ để tô theo — đây là mức "tô mẫu"
            strokeAnimationSpeed: 1,
            delayBetweenStrokes: 120,
            strokeColor: '#e11d48',
            outlineColor: '#d4d4d8',
            drawingWidth: 22,
            // Tải dữ liệu từ public/hanzi thay vì CDN ngoài: CSP của app chặn
            // connect-src lạ, và để trong repo thì không phụ thuộc mạng bên thứ ba.
            charDataLoader: (char, onLoad, onErr) => {
                fetch(`/hanzi/${encodeURIComponent(char)}.json`)
                    .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
                    .then(onLoad)
                    .catch(onErr);
            },
        });

        // Chỉ gom writer THẬT: thư viện chưa nạp thì `create` không chạy, đẩy
        // `undefined` vào danh sách huỷ là rác.
        if (this.writer) this._writers.push(this.writer);
        this.strokeNum = 0;
        this.openQuiz(q);

        // Từ dài thì ô kế tiếp nằm NGOÀI vùng nhìn. Không cuộn tới thì người học
        // viết xong một chữ là màn hình đứng im — ô kế đã sẵn sàng nhưng không ai
        // thấy nó ở đâu.
        //
        // Trục cuộn khác nhau theo khổ màn: máy tính xếp ô ngang (cuộn ngang),
        // điện thoại xếp dọc (cuộn dọc — xem responsive.css). Truyền cả hai trục
        // để màn nào cũng cuộn đúng.
        //
        // Trục dọc để `nearest` chứ không `center`: scrollIntoView cuộn MỌI tổ
        // tiên cuộn được, nên `center` còn kéo cả trang để đưa ô vào giữa
        // viewport — màn hình giật lên xuống sau mỗi chữ. `nearest` cuộn tối
        // thiểu, đủ để ô lọt vào vùng nhìn mà không đụng tới trang.
        target.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    },

    /**
     * Mở quiz trên chữ đang viết, bắt đầu từ nét `this.strokeNum`.
     *
     * Tách riêng vì "Xem mẫu" phải mở LẠI quiz sau khi diễn: animateCharacter()
     * huỷ quiz đang chạy (hành vi của thư viện), nên trước đây bấm Xem mẫu xong
     * là không tô tiếp được nữa — chữ vẫn hiện, chuột vẫn di, mà không nét nào ăn.
     * Không có thông báo lỗi nào; người học chỉ thấy bài luyện chết đứng.
     */
    openQuiz(q) {
        this.writer?.quiz({
            // Mở lại từ đúng nét đang dở, không bắt tô lại từ đầu.
            quizStartStrokeNum: this.strokeNum,
            onMistake: (s) => {
                this.mistakesThisWord++;
                this.strokeNum = s.strokeNum;
                this.updateStrokeInfo(q, s);
            },
            onCorrectStroke: (s) => {
                // +1: nét vừa xong, lần mở lại phải bắt đầu từ nét KẾ.
                this.strokeNum = s.strokeNum + 1;
                this.updateStrokeInfo(q, s);
            },
            onComplete: () => this.completeChar(q),
        });
    },

    showDemo() {
        const q = this.questions[this.currentIndex];
        if (!q || !this.writer) return;
        if (this._demoing) return;          // bấm dồn thì bỏ qua, không xếp chồng
        this._demoing = true;

        this.writer.animateCharacter({
            onComplete: () => {
                this._demoing = false;
                // Diễn xong PHẢI mở lại quiz — đây chính là chỗ hỏng trước đây.
                this.openQuiz(q);
            },
        });
    },

    updateStrokeInfo(q, s) {
        const el = document.getElementById('hanzi-strokes');
        if (!el) return;
        const total = s.strokesRemaining + s.strokeNum + 1;
        const chuOf = q.chars.length > 1 ? `Chữ ${this.charIndex + 1}/${q.chars.length} · ` : '';
        el.textContent = `${chuOf}Nét ${s.strokeNum + 1}/${total}`;
    },

    completeChar(q) {
        // Còn chữ nữa trong từ → sang ô kế, CHƯA tính điểm. Điểm tính theo TỪ.
        if (this.charIndex < q.chars.length - 1) {
            // KHÔNG cleanup ở đây: chữ vừa viết xong phải ở lại trên màn hình để
            // người học nhìn thấy cả từ dần thành hình. Writer cũ được giữ trong
            // `_writers` và huỷ một thể khi sang câu sau.
            this.charIndex++;
            this.mountWriter(q);
            return;
        }

        stopQuestionTimer();
        // Sai càng ít nét thì điểm càng cao. Chấm ở CLIENT là tạm chấp nhận được vì
        // đây là bài luyện, không phải thi — nhưng XP phải do server cộng, giống mọi
        // chế độ khác (xem practiceManager).
        const perfect = this.mistakesThisWord === 0;
        PracticeManager.recordAnswer?.(perfect);

        Notification.show({
            type: perfect ? 'success' : 'info',
            title: perfect ? '✅ Viết đúng!' : '✍️ Hoàn thành',
            message: perfect
                ? `${q.word} — ${q.pinyin}`
                : `${q.word} — sai ${this.mistakesThisWord} nét, thử lại lần sau nhé`,
            duration: 1600,
        });

        // Xem `contextLearning`: tôn trọng cài đặt "Tự động chuyển câu".
        afterAnswer(this, 'hanzi-writing');
    },

    timeUp() {
        Notification.show({ type: 'warning', title: '⏰ Hết giờ', message: 'Sang chữ tiếp theo', duration: 1400 });
        this.nextQuestion();
    },

    nextQuestion() {
        this.cleanupWriter();
        this.currentIndex++;
        if (this.currentIndex >= this.questions.length) return this.finish();
        window._reactSetPracticeProgress?.({ current: this.currentIndex + 1, total: this.questions.length });
        this.showQuestion();
    },

    finish() {
        PracticeManager.complete();
    },

    setupHintSkipListeners() {
        // Giữ tham chiếu handler để cleanup() gỡ ĐÚNG cái của mình — `EventBus.off`
        // không kèm handler sẽ XOÁ SẠCH listener của sự kiện, kể cả của chế độ khác.
        // Qua showDemo() chứ không gọi thẳng animateCharacter: gọi thẳng là huỷ
        // quiz và không mở lại — bài luyện chết đứng y như nút "Xem mẫu" từng bị.
        this._onHint = () => this.showDemo();
        this._onSkip = () => this.nextQuestion();
        EventBus.off(GameEvents.HINT_USED, this._onHint);
        EventBus.off(GameEvents.QUESTION_SKIPPED, this._onSkip);
        EventBus.on(GameEvents.HINT_USED, this._onHint);
        EventBus.on(GameEvents.QUESTION_SKIPPED, this._onSkip);
    },

    cleanupWriter() {
        // HanziWriter gắn SVG + listener vào DOM; không huỷ thì mỗi câu để lại một
        // bộ, và chuột vẽ vào chữ cũ vẫn ăn.
        //
        // Một TỪ tạo nhiều writer (mỗi chữ một cái). Chỉ huỷ `this.writer` là bỏ sót
        // các chữ đã viết xong trước đó — chúng vẫn còn quiz đang mở, listener vẫn
        // sống, và sang câu sau thì rò ra cả đống. Nên gom lại mà huỷ hết.
        for (const w of this._writers) {
            try { w.cancelQuiz(); } catch { /* chưa mở quiz */ }
        }
        this._writers = [];
        this.writer = null;
    },

    cleanup() {
        stopQuestionTimer();
        this.cleanupWriter();
        EventBus.off(GameEvents.HINT_USED, this._onHint);
        EventBus.off(GameEvents.QUESTION_SKIPPED, this._onSkip);
        this._onHint = null;
        this._onSkip = null;
        this.questions = [];
        this.currentIndex = 0;
    },
};

/** Escape trước khi đưa vào innerHTML — pinyin/nghĩa đến từ DB, có thể do admin nhập. */
function escapeText(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

void GameState;
