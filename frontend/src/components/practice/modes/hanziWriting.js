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

import HanziWriter from 'hanzi-writer';
import { GameState } from '@game/state.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { Notification } from '@ui/Toaster.jsx';
import { PracticeManager } from '../practiceManager.js';
import { startQuestionTimer, stopQuestionTimer } from '../questionTimer.js';

/** Tách một từ ghép thành các chữ Hán đơn — luyện viết `你好` nghĩa là viết `你` rồi `好`. */
export function splitHanzi(text) {
    return [...String(text || '')].filter(ch => /[一-鿿]/.test(ch));
}

export const HanziWriting = {
    config: null,
    questions: [],
    currentIndex: 0,
    writer: null,
    mistakesThisChar: 0,

    async start(config) {
        this.config = config;
        this.currentIndex = 0;

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

        const seen = new Set();
        const out = [];

        // Một câu hỏi = MỘT chữ đơn. Bỏ trùng: `好` xuất hiện trong rất nhiều từ,
        // luyện lại cùng một chữ năm lần trong một lượt thì vừa chán vừa vô ích.
        for (const w of words) {
            for (const ch of splitHanzi(w.zh || w.word)) {
                if (seen.has(ch)) continue;
                seen.add(ch);
                out.push({ char: ch, pinyin: w.phonetic || '', meaning: w.vn || '', from: w.zh || '' });
            }
        }
        this.questions = out.slice(0, this.config?.questionCount || 10);
    },

    showQuestion() {
        const q = this.questions[this.currentIndex];
        if (!q) return this.finish();
        this.mistakesThisChar = 0;

        const container = document.getElementById('practice-content');
        if (!container) return;

        container.innerHTML = `
            <div class="hanzi-mode">
                <div class="hanzi-prompt">
                    <div class="hanzi-pinyin">${escapeText(q.pinyin)}</div>
                    <div class="hanzi-meaning">${escapeText(q.meaning)}</div>
                </div>
                <div class="hanzi-canvas" id="hanzi-target"></div>
                <div class="hanzi-actions">
                    <button class="btn btn-secondary" id="hanzi-demo">Xem mẫu</button>
                    <span class="hanzi-progress" id="hanzi-strokes"></span>
                </div>
            </div>
        `;

        this.mountWriter(q);
        startQuestionTimer('hanzi-writing', () => this.timeUp());
    },

    mountWriter(q) {
        const target = document.getElementById('hanzi-target');
        if (!target) return;

        this.writer = HanziWriter.create(target, q.char, {
            width: 260,
            height: 260,
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

        this.writer.quiz({
            onMistake: (s) => {
                this.mistakesThisChar++;
                this.updateStrokeInfo(s);
            },
            onCorrectStroke: (s) => this.updateStrokeInfo(s),
            onComplete: () => this.completeChar(q),
        });

        document.getElementById('hanzi-demo')?.addEventListener('click', () => {
            // Xem mẫu = dùng một lượt gợi ý, tính như các chế độ khác.
            this.writer?.animateCharacter();
        });
    },

    updateStrokeInfo(s) {
        const el = document.getElementById('hanzi-strokes');
        if (el) el.textContent = `Nét ${s.strokeNum + 1}/${s.strokesRemaining + s.strokeNum + 1}`;
    },

    completeChar(q) {
        stopQuestionTimer();
        // Sai càng ít nét thì điểm càng cao. Chấm ở CLIENT là tạm chấp nhận được vì
        // đây là bài luyện, không phải thi — nhưng XP phải do server cộng, giống mọi
        // chế độ khác (xem practiceManager).
        const perfect = this.mistakesThisChar === 0;
        PracticeManager.recordAnswer?.(perfect);

        Notification.show({
            type: perfect ? 'success' : 'info',
            title: perfect ? '✅ Viết đúng!' : '✍️ Hoàn thành',
            message: perfect
                ? `${q.char} — ${q.pinyin}`
                : `${q.char} — sai ${this.mistakesThisChar} nét, thử lại lần sau nhé`,
            duration: 1600,
        });

        setTimeout(() => this.nextQuestion(), 1200);
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
        this._onHint = () => this.writer?.animateCharacter();
        this._onSkip = () => this.nextQuestion();
        EventBus.off(GameEvents.HINT_USED, this._onHint);
        EventBus.off(GameEvents.QUESTION_SKIPPED, this._onSkip);
        EventBus.on(GameEvents.HINT_USED, this._onHint);
        EventBus.on(GameEvents.QUESTION_SKIPPED, this._onSkip);
    },

    cleanupWriter() {
        // HanziWriter gắn SVG + listener vào DOM; không huỷ thì mỗi câu để lại một
        // bộ, và chuột vẽ vào chữ cũ vẫn ăn.
        try { this.writer?.cancelQuiz(); } catch { /* chưa mở quiz */ }
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
