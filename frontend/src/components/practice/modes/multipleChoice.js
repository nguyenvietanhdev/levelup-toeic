import { GameLogic } from '@game/gameLogic.js';
import { GameState } from '@game/state.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { Notification } from '@ui/Toaster.jsx';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import { afterAnswer, isAutoAdvance } from '@components/practice/practiceNav.js';
import { startQuestionTimer, stopQuestionTimer } from '@components/practice/questionTimer.js';
import { getTransitionDelay } from '@components/practice/transitionDelay.js';
import { timeoutQuestion } from '@components/practice/questionTimeout.js';
import { layPhienAmCau, coChuHan } from '@lib/sentencePinyin.js';

/**
 * Hoãn bao lâu sau khi chọn đáp án rồi mới đọc câu ví dụ (ms).
 *
 * Không đọc ngay: đúng lúc ấy tiếng "đúng"/"sai" đang kêu, hai âm chồng nhau
 * thì không nghe rõ cái nào.
 */
const HOAN_DOC_VI_DU = 350;

/**
 * Chờ tối đa bao lâu cho câu ví dụ đọc xong (ms).
 *
 * Lưới an toàn cho nhịp tự chuyển câu: `onEnd` KHÔNG bao giờ về nếu lượt đọc bị
 * một lượt sau chiếm chỗ, hoặc trình duyệt chặn tự phát tiếng. Không có mốc này
 * thì cả lượt đứng im giữa chừng, không có nút nào đi tiếp.
 */
const CHO_DOC_TOI_DA = 8000;

export const MultipleChoice = {

    config: null,
    questions: [],
    currentIndex: 0,
    selectedAnswer: null,
    hintUsed: false,

    async start(config) {
        this.config = config;
        this.currentIndex = 0;

        await this.generateQuestions();

        this.setupHintSkipListeners();

        if (this.questions.length > 0) {
            this.showQuestion();
        } else {
            PracticeManager.complete();
            Notification.show({
                type: 'warning',
                title: 'Không có từ vựng',
                message: 'Không tìm thấy từ vựng nào để luyện tập trong Part này.',
            });
        }
    },

    async generateQuestions() {
        const selectedPart = GameState.state?.settings?.selectedPart || null;
        const requestCount = selectedPart ? 9999 : (this.config.questionsPerRound || 20);

        const words = await PartSelector.getWordsForPractice(requestCount);

        if (!Array.isArray(words)) {
            this.questions = [];
            return;
        }

        const selectedWords = selectedPart
            ? words
            : words.slice(0, this.config.questionsPerRound || 20);

        this.questions = selectedWords.map(word =>
            GameLogic.generateMultipleChoice(word, this.config.optionsCount)
        );
    },

    showQuestion() {
        if (this.currentIndex >= this.questions.length) {
            this.finish();
            return;
        }

        const question = this.questions[this.currentIndex];
        this.selectedAnswer = null;
        this.hintUsed = false;

        PracticeManager.updateProgress(
            this.currentIndex + 1,
            this.questions.length
        );
        PracticeManager.setCurrentWord(question.word);

        this.render(question);

        // Đếm ngược cho RIÊNG câu này; hết giờ → tính sai + chuyển/khoá.
        startQuestionTimer('multiple-choice', () => this.onQuestionTimeout());
    },

    // Hết giờ mà chưa trả lời.
    onQuestionTimeout() {
        const question = this.questions[this.currentIndex];
        if (!question) return;
        timeoutQuestion(this, 'multiple-choice', { correctIndex: question.correctIndex, word: question.word });
    },

    render(question) {
        const container = document.getElementById('practice-content');
        if (!container) return;

        const isReversed = question.reversed;
        container.innerHTML = `
            <div class="question-container">
                <div class="question-word question-word--split">
                    <div class="question-text-col">
                        <div class="word-display">
                            ${question.question}
                            <!-- Nút loa hiện ở CẢ HAI chiều.
                                 Trước đây ẩn khi đảo chiều vì mặt hỏi là nghĩa
                                 tiếng Việt mà hệ thống chỉ có giọng Anh/Trung.
                                 Nay speakWord nhận diện được tiếng Việt và có
                                 giọng riêng, nên nghe được cả hai chiều. -->
                            <button class="btn-speak" id="speak-word-btn" title="Nghe phát âm">
                                <i class="fas fa-volume-up"></i>
                            </button>
                        </div>
                        ${!isReversed && question.word.phonetic ? `<div class="word-phonetic">/${question.word.phonetic}/</div>` : ''}
                        <div class="word-type">${question.word.type}</div>
                    </div>
                    <div class="question-synonyms-col">
                        ${question.word.synonyms ? `
                            <div class="synonyms-label">Đồng nghĩa</div>
                            <div class="synonyms-list">${question.word.synonyms}</div>
                            ${question.word.synonyms_vn ? `<div class="synonyms-list-vn">${question.word.synonyms_vn}</div>` : ''}
                        ` : ''}
                    </div>
                    ${question.word.image ? `
                        <div class="question-image-col">
                            <img src="${question.word.image}" class="word-image" alt="${question.word.en}"
                                 class="js-hide-on-error" data-hide-closest=".question-image-col">
                        </div>
                    ` : ''}
                </div>

                <div class="choices-container">
                    ${question.options.map((option, index) => `
                        <button class="choice-btn" data-index="${index}">
                            ${option}
                        </button>
                    `).join('')}
                </div>

                <!-- Câu ví dụ nằm DƯỚI 4 ô đáp án và chỉ hiện SAU khi trả lời.
                     Câu ví dụ chứa chính từ đang hỏi ("多少钱?" lộ thẳng đáp án
                     多少), nên hiện sẵn là cho không đáp án. Hiện sau thì nó
                     thành phần GIẢI THÍCH: xem lại từ vừa chọn dùng thế nào
                     trong câu thật. Cùng quy ước với Từ đồng nghĩa và Loại từ. -->
                <div id="mc-example-slot"></div>
            </div>
        `;

        this.attachListeners();

        if (!question.reversed && GameState.state?.settings?.autoPronunciation) {
            setTimeout(() => {
                GameLogic.speakWord(question.word.en);
            }, 300);
        }
    },

    attachListeners() {
        const choices = document.querySelectorAll('.choice-btn');

        choices.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                this.selectAnswer(index);
            });
        });

        const speakBtn = document.getElementById('speak-word-btn');
        if (speakBtn) {
            speakBtn.addEventListener('click', () => {
                const q = this.questions[this.currentIndex];
                if (!q?.word) return;
                // Đọc thứ ĐANG HIỆN, không phải luôn luôn `word.en`.
                //
                // Đảo chiều thì mặt hỏi là nghĩa (tiếng Việt, hoặc tiếng Anh ở
                // kho song ngữ) — đọc `en` là đọc mất đáp án ra loa.
                //
                // KHÔNG truyền cứng 'en-US': `speakWord` tự nhận diện hệ chữ và
                // chọn giọng, truyền vào là ghi đè mất phần đó.
                GameLogic.speakWord(q.question || q.word.en);
            });
        }

        // Nút dịch cả câu — mở popup Dịch nhanh với câu ví dụ điền sẵn. Đứng
        // TRƯỚC nút loa: đọc hiểu rồi mới nghe là thứ tự tự nhiên hơn.
        const trExBtn = document.getElementById('translate-example-btn');
        if (trExBtn) {
            trExBtn.addEventListener('click', () => {
                const q = this.questions[this.currentIndex];
                const cau = q?.word?.example;
                if (cau) EventBus.emit(GameEvents.TRANSLATE_REQUESTED, { text: cau });
            });
        }

        const speakExBtn = document.getElementById('speak-example-btn');
        if (speakExBtn) {
            speakExBtn.addEventListener('click', () => {
                const q = this.questions[this.currentIndex];
                if (q?.word?.example) GameLogic.speakWord(q.word.example);
            });
        }
    },

    selectAnswer(index) {
        const question = this.questions[this.currentIndex];
        this.selectedAnswer = index;

        const choices = document.querySelectorAll('.choice-btn');
        choices.forEach(btn => btn.disabled = true);

        const isCorrect = index === question.correctIndex;
        const meta = {
            userAnswer: question.options[index],
            correctAnswer: question.correctAnswer,
            questionText: question.question,
            options: question.options,
        };

        if (isCorrect) {
            choices[index].classList.add('correct');
            PracticeManager.recordAnswer(true, question.word, meta);

            if (GameState.state.settings.soundEnabled) {
                Utils.playSound(Config.sounds.correct, 0.5);
            }
        } else {
            choices[index].classList.add('wrong');
            choices[question.correctIndex].classList.add('correct');
            PracticeManager.recordAnswer(false, question.word, meta);

            if (GameState.state.settings.soundEnabled) {
                Utils.playSound(Config.sounds.wrong, 0.5);
            }
        }

        // Lộ câu ví dụ SAU khi trả lời — cho MỌI câu, không riêng chế độ đảo
        // chiều. Câu ví dụ chứa chính từ đang hỏi nên hiện sẵn là cho không đáp
        // án; hiện ở đây thì nó thành phần giải thích.
        const seDoc = this.revealExample(question);

        // Tự chuyển câu phải ĐỢI câu ví dụ đọc xong.
        //
        // Nhịp mặc định của chế độ này là 1000ms, ngắn hơn mọi câu ví dụ —
        // chuyển đúng hẹn là cắt tiếng giữa chừng, lần nào cũng vậy.
        if (seDoc && isAutoAdvance()) {
            this.chuyenSauKhiDocXong();
            return;
        }

        afterAnswer(this, 'multiple-choice');
    },

    // Che từ khoá trong câu ví dụ bằng `______`.
    //
    // HIỆN KHÔNG CÒN AI GỌI: câu ví dụ giờ chỉ hiện SAU khi trả lời, nên không
    // còn gì để che. Giữ lại vì nó là logic khó viết lại — che được cả dạng biến
    // đổi (chia thì / số nhiều / -e, -y) lẫn chuỗi con tiếng Trung — và sẽ cần
    // ngay nếu chuyển sang hướng "hiện sẵn nhưng che từ khoá".
    // Câu nào KHÔNG che nổi (bất quy tắc / không tìm thấy từ) → trả về CẢ CÂU.
    maskTarget(sentence, target) {
        if (!sentence || !target) return sentence || '';
        const BLANK = '______';

        // Tiếng Trung / ký tự ngoài ASCII: không chia thì → che chuỗi con chính xác.
        if (/[^\x00-\x7F]/.test(target)) {
            return sentence.includes(target) ? sentence.split(target).join(BLANK) : sentence;
        }

        // Tiếng Anh: dựng biến thể đuôi cho 1 từ (số nhiều/chia thì + xử lý -e, -y).
        const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const variantsOf = (w) => {
            const v = new Set([w, w + 's', w + 'es', w + 'ed', w + 'd', w + 'ing']);
            if (w.endsWith('e')) { const s = w.slice(0, -1); v.add(s + 'ed'); v.add(s + 'ing'); }
            if (w.endsWith('y')) { const s = w.slice(0, -1); v.add(s + 'ies'); v.add(s + 'ied'); }
            return [...v].sort((a, b) => b.length - a.length).map(esc); // dài trước → khớp tham lam
        };

        const words = target.trim().split(/\s+/);
        let pattern;
        if (words.length === 1) {
            pattern = `\\b(?:${variantsOf(words[0]).join('|')})\\b`;
        } else {
            // Phrasal verb: từ đầu (động từ) biến đổi, các từ sau giữ nguyên.
            const first = `(?:${variantsOf(words[0]).join('|')})`;
            const rest = words.slice(1).map(esc).join('\\s+');
            pattern = `\\b${first}\\s+${rest}\\b`;
        }

        const re = new RegExp(pattern, 'gi');
        return re.test(sentence) ? sentence.replace(new RegExp(pattern, 'gi'), BLANK) : sentence;
    },

    // Câu ví dụ hiển thị NGAY từ đầu câu hỏi (không đợi chọn xong). Chế độ
    // thường (EN→VN) hiện đủ + nút nghe; chế độ đảo chiều che từ đáp án, ẩn
    // nút nghe (đọc sẽ lộ từ) — sẽ mở đủ sau khi trả lời.
    /**
     * Lộ câu ví dụ SAU khi người dùng trả lời, ngay dưới 4 ô đáp án.
     *
     * Không hiện sẵn từ đầu: câu ví dụ chứa chính từ đang hỏi — "多少钱?" lộ
     * thẳng đáp án 多少. Hiện ở đây thì nó thành phần GIẢI THÍCH: xem lại từ vừa
     * chọn được dùng thế nào trong câu thật. Cùng quy ước với Từ đồng nghĩa và
     * Loại từ (`showWordInfo` của hai chế độ đó).
     */
    revealExample(question) {
        const cau = question?.word?.example;
        const slot = document.getElementById('mc-example-slot');
        if (!cau || !slot || slot.childElementCount) return;   // đã lộ rồi thì thôi

        slot.innerHTML = `
            <div class="word-info-panel" id="mc-example-panel">
                <div class="word-info-example">
                    <i class="fas fa-quote-left" style="color: var(--primary-color); margin-right: 6px;"></i>
                    <span id="mc-example-text">${cau}</span>
                    <button class="btn-speak-mini" id="translate-example-btn" title="Dịch cả câu"><i class="fas fa-language"></i></button>
                    <button class="btn-speak-mini" id="speak-example-btn" title="Nghe phát âm câu ví dụ"><i class="fas fa-volume-up"></i></button>
                </div>
                <div class="word-info-example-pinyin" id="mc-example-pinyin"></div>
            </div>`;

        // Nút dịch đứng TRƯỚC nút loa — đọc hiểu rồi mới nghe.
        slot.querySelector('#translate-example-btn')?.addEventListener('click', () => {
            EventBus.emit(GameEvents.TRANSLATE_REQUESTED, { text: cau });
        });
        slot.querySelector('#speak-example-btn')?.addEventListener('click', () => {
            // Không truyền ngôn ngữ: `speakWord` tự phát hiện chữ Hán và đổi
            // sang zh-CN (gameLogic.js:304). Truyền cứng 'en-US' như các chế độ
            // khác là đọc câu tiếng Trung bằng giọng tiếng Anh.
            GameLogic.speakWord(cau);
        });

        // TỰ ĐỘNG đọc câu ví dụ ngay khi nó lộ ra.
        //
        // Câu ví dụ là chỗ dạy CÁCH DÙNG từ, và nó chỉ hiện đúng một khoảnh khắc
        // này — sau đó câu trôi mất. Bắt bấm thêm nút loa mới nghe được nghĩa là
        // hầu như không ai nghe: người học đang nhìn kết quả đúng/sai, không đi
        // tìm nút.
        //
        // Không cần theo `autoPronunciation`: cài đặt đó nói về việc đọc TỪ lúc
        // hiện câu hỏi (dễ lộ đáp án ở chiều đảo), còn đây là phần giải thích
        // sau khi đã chấm xong.
        const idxLucDoc = this.currentIndex;
        setTimeout(() => {
            // Bỏ nếu đã sang câu khác — người học bấm "Tiếp" nhanh hơn khoảng hoãn.
            if (this.currentIndex !== idxLucDoc) return;
            GameLogic.speakWord(cau, null, () => {
                // Chốt LẠI ở đây nữa: `onEnd` của câu trước về muộn sẽ gọi đúng
                // `_docXong` của câu SAU và đẩy câu đó đi sớm.
                if (this.currentIndex !== idxLucDoc) return;
                this._docXong?.();
            });
        }, HOAN_DOC_VI_DU);

        // Phiên âm cả câu (IPA cho tiếng Anh, pinyin cho tiếng Trung).
        const idxLucGoi = this.currentIndex;
        layPhienAmCau(cau).then((pinyin) => {
            // Bỏ nếu đã sang câu khác: người dùng bấm "Tiếp" nhanh hơn mạng thì
            // phiên âm câu trước sẽ hiện dưới câu sau.
            if (!pinyin || this.currentIndex !== idxLucGoi) return;
            const el = document.getElementById('mc-example-pinyin');
            if (el) el.textContent = pinyin;
        });

        // Báo cho nơi gọi biết CÓ đọc — nhịp chuyển câu phải đợi đọc xong.
        return true;
    },

    /**
     * Chuyển câu khi câu ví dụ đọc XONG, hoặc khi hết nhịp chờ — cái nào SAU thì
     * cái đó quyết định.
     *
     * Lấy mốc muộn hơn chứ không cộng dồn: câu ví dụ ngắn thì vẫn giữ đúng nhịp
     * người dùng đặt trong Cài đặt, câu dài thì giãn ra vừa đủ để nghe hết.
     */
    chuyenSauKhiDocXong() {
        // Câu này chấm xong rồi → dừng đếm ngược, tránh "hết giờ" nổ trong lúc chờ.
        stopQuestionTimer();

        const idx = this.currentIndex;
        const hen = Date.now() + getTransitionDelay('multiple-choice');
        let daChuyen = false;

        const chuyen = () => {
            // Chốt theo CHỈ SỐ CÂU: `onEnd` của lượt đọc trước có thể về muộn,
            // và lưới an toàn dưới đây cũng nổ sau khi đã chuyển rồi.
            if (daChuyen || this.currentIndex !== idx) return;
            daChuyen = true;
            setTimeout(() => {
                if (this.currentIndex !== idx) return;
                this.nextQuestion();
            }, Math.max(0, hen - Date.now()));
        };

        this._docXong = chuyen;
        setTimeout(chuyen, CHO_DOC_TOI_DA);
    },

    nextQuestion() {
        this.currentIndex++;
        this.showQuestion();
    },

    finish() {
        PracticeManager.complete();
    },

    setupHintSkipListeners() {
        // Giữ tham chiếu handler để cleanup() gỡ ĐÚNG cái của mình — EventBus.off
        // không kèm handler sẽ XOÁ SẠCH listener của sự kiện, kể cả của chế độ khác.
        this._onHint = () => {
            if (!this.hintUsed && this.currentIndex < this.questions.length) {
                this.showHint();
            }
        };
        this._onSkip = () => {
            if (this.currentIndex < this.questions.length) {
                this.skipCurrentQuestion();
            }
        };
        EventBus.off(GameEvents.HINT_USED, this._onHint);
        EventBus.off(GameEvents.QUESTION_SKIPPED, this._onSkip);
        EventBus.on(GameEvents.HINT_USED, this._onHint);
        EventBus.on(GameEvents.QUESTION_SKIPPED, this._onSkip);
    },

    showHint() {
        const question = this.questions[this.currentIndex];
        if (!question || this.hintUsed) return;

        this.hintUsed = true;

        const choices = document.querySelectorAll('.choice-btn');
        const wrongIndexes = [];

        choices.forEach((btn, index) => {
            if (index !== question.correctIndex) {
                wrongIndexes.push(index);
            }
        });

        const shuffled = wrongIndexes.sort(() => Math.random() - 0.5);
        const toRemove = shuffled.slice(0, 2);

        toRemove.forEach(index => {
            choices[index].style.opacity = '0.3';
            choices[index].style.pointerEvents = 'none';
            choices[index].disabled = true;
        });

        Notification.show({
            type: 'info',
            title: '💡 Gợi ý',
            message: 'Đã loại bỏ 2 đáp án sai',
            duration: 2000
        });
    },

    skipCurrentQuestion() {
        const question = this.questions[this.currentIndex];
        if (!question) return;

        const choices = document.querySelectorAll('.choice-btn');
        choices.forEach(btn => btn.disabled = true);

        choices[question.correctIndex].classList.add('correct');

        PracticeManager.recordAnswer(false, question.word);

        setTimeout(() => {
            this.nextQuestion();
        }, 1500);
    },

    cleanup() {
        EventBus.off(GameEvents.HINT_USED, this._onHint);
        EventBus.off(GameEvents.QUESTION_SKIPPED, this._onSkip);
        this._onHint = null;
        this._onSkip = null;

        this.questions = [];
        this.currentIndex = 0;
        this.selectedAnswer = null;
        this.hintUsed = false;
        // Rời chế độ giữa lúc đang đọc câu ví dụ: `onEnd` về sau đó mà còn giữ
        // callback là gọi `nextQuestion` trên một lượt đã đóng.
        this._docXong = null;
    }
};

