import { GameLogic } from '@game/gameLogic.js';
import { GameState } from '@game/state.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { Notification } from '@ui/Toaster.jsx';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { afterAnswer } from '../practiceNav.js';

export const SentenceBuilder = {

    config: null,
    questions: [],
    currentIndex: 0,
    selectedWords: [],
    correctSentence: '',
    hintUsed: false,

    async start(config) {
        this.config = config;
        this.currentIndex = 0;

        await this.generateQuestions();

        this.setupHintSkipListeners();

        // Không có câu nào thì PHẢI báo và thoát — xem ghi chú cùng nội dung ở
        // pronunciationMode. `if (length > 0)` không else = màn hình trắng câm.
        if (this.questions.length === 0) {
            PracticeManager.complete();
            Notification.show({
                type: 'warning',
                title: 'Không có câu ví dụ',
                message: 'Bộ từ đang chọn không có từ nào kèm câu ví dụ. Thử đổi chủ đề khác.',
                duration: 4000,
            });
            return;
        }
        this.showQuestion();
    },

    async generateQuestions() {
        // Qua PartSelector để tôn trọng chủ đề đang chọn — getRandomWords() đọc
        // thẳng vocabularyData và bỏ qua bộ lọc. Lấy dư rồi cắt, vì phía dưới còn
        // lọc tiếp những từ có câu ví dụ.
        const selectedPart = GameState.state?.settings?.selectedPart || null;
        const perRound = this.config?.questionsPerRound || 10;
        const all = await PartSelector.getWordsForPractice(selectedPart ? 9999 : perRound * 4);
        const words = Array.isArray(all) ? all : [];

        this.questions = words.filter(word => {
            return word.example && word.example.length > 0;
        }).map(word => {
            let sentence;
            if (Array.isArray(word.example)) {
                sentence = word.example[0];
            } else {
                sentence = word.example;
            }

            const phrases = this.splitIntoPhrases(sentence);
            const shuffledPhrases = this.shuffleArray([...phrases]);

            return {
                word: word,
                correctSentence: sentence,
                correctPhrases: phrases,
                shuffledPhrases: shuffledPhrases,
                wordVn: word.vn,
                wordEn: word.en,
                translation: this.getVietnameseTranslation(word)
            };
        }).slice(0, perRound);   // lấy dư 4× ở trên nên phải cắt lại
    },

    splitIntoPhrases(sentence) {
        // Tiếng Trung: không có khoảng trắng → tách theo từng ký tự Hán (bỏ dấu
        // câu) để người học sắp lại đúng thứ tự câu.
        if (/[㐀-鿿]/.test(sentence)) {
            return sentence.split('').filter(ch => /[㐀-鿿々A-Za-z0-9]/.test(ch));
        }
        const cleanSentence = sentence.replace(/[.,!?;:]$/, '');
        const words = cleanSentence.split(' ');

        if (words.length <= 4) {
            return words;
        }

        const phrases = [];
        let i = 0;

        while (i < words.length) {
            let phraseLength;
            const remainingWords = words.length - i;

            if (remainingWords <= 2) {
                phraseLength = remainingWords;
            } else if (remainingWords === 3) {
                phraseLength = Math.random() > 0.5 ? 2 : 3;
            } else {
                phraseLength = Math.random() > 0.5 ? 2 : 3;
            }

            const phrase = words.slice(i, i + phraseLength).join(' ');
            phrases.push(phrase);
            i += phraseLength;
        }

        return phrases;
    },

    getVietnameseTranslation(word) {
        if (word.exampleVn) {
            return word.exampleVn;
        }
        return null;
    },

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    },

    showQuestion() {
        if (this.currentIndex >= this.questions.length) {
            this.finish();
            return;
        }

        const question = this.questions[this.currentIndex];
        this.selectedWords = [];
        this.correctSentence = question.correctSentence;
        this.hintUsed = false;

        PracticeManager.updateProgress(
            this.currentIndex + 1,
            this.questions.length
        );

        this.render(question);
    },

    render(question) {
        const container = document.getElementById('practice-content');
        if (!container) return;

        container.innerHTML = `
            <div class="question-container sentence-builder-container">
                <!-- Ba khối gợi ý gộp thành MỘT HÀNG NGANG.
                     Xếp chồng như cũ chúng chiếm 294px — gần một nửa màn hình —
                     trong khi vùng chơi thật (ô thả câu + kho từ + nút) chỉ 232px
                     và bị đẩy xuống dưới mép, phải cuộn mới thấy.

                     Hướng dẫn "Cách chơi" bỏ hẳn khỏi luồng: nó lặp lại đúng
                     điều tiêu đề đã nói ("Sắp xếp các cụm từ thành câu"), đọc
                     một lần là thuộc, mà chiếm nguyên một khối mỗi câu. Chuyển
                     thành thuộc tính title trên tiêu đề cho ai cần. -->
                <div class="question-prompt sb-prompt">
                    <h3 class="sb-title" title="Click vào các cụm từ bên dưới theo thứ tự đúng để ghép thành câu có nghĩa">
                        🧩 Sắp xếp các cụm từ thành câu hoàn chỉnh
                    </h3>

                    <div class="sb-hints">
                        ${question.translation ? `
                            <div class="sb-hint sb-hint--translation">
                                <span class="sb-hint-label"><i class="fas fa-language"></i> Nghĩa</span>
                                <span class="sb-hint-value">${question.translation}</span>
                            </div>
                        ` : ''}

                        <div class="sb-hint sb-hint--word">
                            <span class="sb-hint-label"><i class="fas fa-lightbulb"></i> Từ khoá</span>
                            <span class="sb-hint-value">
                                <span class="highlight-word">${question.word.en}</span>
                                ${question.word.phonetic ? `<span class="sb-phonetic">${question.word.phonetic}</span>` : ''}
                                <span class="word-translation">= ${question.wordVn}</span>
                                <button class="btn-speak-mini sb-key-speak" title="Nghe phát âm từ khoá">
                                    <i class="fas fa-volume-up"></i>
                                </button>
                            </span>
                        </div>
                    </div>
                </div>

                <div class="sentence-area" id="sentence-area">
                    <div class="sentence-placeholder">
                        <i class="fas fa-hand-pointer"></i>
                        Click vào các từ bên dưới để xếp thành câu...
                    </div>
                </div>

                <div class="words-pool-container">
                    <div class="words-pool" id="words-pool">
                        ${question.shuffledPhrases.map((phrase, index) => `
                            <button class="word-btn phrase-btn" data-phrase="${phrase}" data-index="${index}">
                                ${phrase}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div class="sentence-actions">
                    <button class="btn btn-secondary" id="clear-btn">
                        <i class="fas fa-redo"></i> Làm lại
                    </button>
                    <button class="btn btn-primary" id="check-btn" disabled>
                        <i class="fas fa-check"></i> Kiểm tra
                    </button>
                </div>

                <div class="hint-area" id="hint-area" style="display: none;">
                    <i class="fas fa-lightbulb"></i>
                    <span id="hint-text"></span>
                </div>
            </div>
        `;

        this.attachListeners();
    },

    attachListeners() {
        // Nút nghe TỪ KHOÁ. Đọc câu hỏi từ state chứ không nhận tham số:
        // `attachListeners()` được gọi không đối số, nên dùng thẳng `question`
        // là một biến tự do — `ReferenceError` ngay khi bấm, mà build không bắt.
        //
        // Không truyền ngôn ngữ: `speakWord` tự nhận chữ Hán và đổi sang zh-CN.
        document.querySelector('.sb-key-speak')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const tu = this.questions[this.currentIndex]?.word?.en;
            if (tu) GameLogic.speakWord(tu);
        });

        const phraseBtns = document.querySelectorAll('.phrase-btn');
        const clearBtn = document.getElementById('clear-btn');
        const checkBtn = document.getElementById('check-btn');

        phraseBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectPhrase(btn.dataset.phrase, btn);
            });
        });

        clearBtn?.addEventListener('click', () => {
            this.clearSentence();
        });

        checkBtn?.addEventListener('click', () => {
            this.checkAnswer();
        });

        // Enter = Kiểm tra. Xếp xong cụm cuối thì tay đang ở chuột/bàn phím,
        // với xuống nút Kiểm tra là một thao tác thừa cho mỗi câu.
        //
        // Gắn MỘT lần cho cả lượt chứ không mỗi câu: `attachListeners` chạy lại
        // sau mỗi `showQuestion`, gắn ở đó thì sau 10 câu có 10 listener và một
        // phím Enter gọi `checkAnswer` 10 lần.
        if (!this._onKey) {
            this._onKey = (e) => {
                if (e.key !== 'Enter') return;
                // Không cướp Enter khi con trỏ đang trong ô nhập (ô tìm ở nav).
                const tag = (e.target?.tagName || '').toUpperCase();
                if (tag === 'INPUT' || tag === 'TEXTAREA') return;

                // Chỉ khi nút đang bấm được: chưa xếp cụm nào, hoặc đã kiểm tra
                // rồi thì nút `disabled` — Enter cũng phải im như cú bấm chuột.
                const btn = document.getElementById('check-btn');
                if (!btn || btn.disabled) return;

                e.preventDefault();
                this.checkAnswer();
            };
            document.addEventListener('keydown', this._onKey);
        }
    },

    selectPhrase(phrase, btn) {
        if (btn.disabled) return;

        this.selectedWords.push(phrase);
        btn.disabled = true;
        btn.classList.add('selected');

        this.updateSentenceArea();
        this.updateCheckButton();
    },

    updateSentenceArea() {
        const sentenceArea = document.getElementById('sentence-area');
        if (!sentenceArea) return;

        // Gỡ chế độ xếp dọc: hàm này chạy khi bấm "Làm lại" hoặc khi thêm/bớt
        // cụm từ. Không gỡ thì khung kẹt ở dạng dọc và các cụm từ đang xếp bị
        // đổ thành một cột — mỗi cụm một dòng, không còn nhìn ra câu.
        sentenceArea.classList.remove('has-result');

        if (this.selectedWords.length === 0) {
            sentenceArea.innerHTML = `
                <div class="sentence-placeholder">
                    <i class="fas fa-hand-pointer"></i>
                    <div>
                        <div>Click vào các cụm từ bên dưới theo thứ tự đúng</div>
                        <small style="opacity: 0.7; margin-top: 4px; display: block;">Ví dụ: Click "She had to" → "search in" → "her handbag" → "for her keys"</small>
                    </div>
                </div>
            `;
        } else {
            sentenceArea.innerHTML = `
                <div class="selected-sentence">
                    ${this.selectedWords.map((phrase, index) => `
                        <span class="selected-word selected-phrase animate-pop" data-index="${index}">
                            ${phrase}
                            <!-- Không inline onclick: CSP production chặn
                                 (script-src-attr 'none'). Nó còn phụ thuộc
                                 window.SentenceBuilder tồn tại đúng lúc bấm —
                                 hai điều kiện ngầm cho một cái nút. -->
                            <button class="remove-word js-remove-phrase" title="Xóa cụm">
                                <i class="fas fa-times"></i>
                            </button>
                        </span>
                    `).join(' ')}
                </div>
            `;
        }

        // Uỷ quyền trên sentenceArea: innerHTML ở trên dựng lại toàn bộ mỗi lần
        // chọn/bỏ một cụm, nên gắn listener vào từng nút là gắn lại liên tục.
        // Cờ tránh gắn chồng khi hàm này chạy nhiều lần trên cùng phần tử.
        if (sentenceArea && !sentenceArea._removeBound) {
            sentenceArea._removeBound = true;
            sentenceArea.addEventListener('click', (e) => {
                const btn = e.target.closest('.js-remove-phrase');
                if (!btn) return;
                const idx = Number(btn.closest('[data-index]')?.dataset.index);
                if (Number.isInteger(idx)) this.removeWord(idx);
            });
        }
    },

    removeWord(index) {
        const phrase = this.selectedWords[index];
        this.selectedWords.splice(index, 1);

        const phraseBtns = document.querySelectorAll('.phrase-btn');
        phraseBtns.forEach(btn => {
            if (btn.dataset.phrase === phrase && btn.disabled) {
                btn.disabled = false;
                btn.classList.remove('selected');
            }
        });

        this.updateSentenceArea();
        this.updateCheckButton();
    },

    clearSentence() {
        this.selectedWords = [];

        const phraseBtns = document.querySelectorAll('.phrase-btn');
        phraseBtns.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('selected');
        });

        this.updateSentenceArea();
        this.updateCheckButton();
    },

    updateCheckButton() {
        const checkBtn = document.getElementById('check-btn');
        if (!checkBtn) return;

        const question = this.questions[this.currentIndex];
        checkBtn.disabled = this.selectedWords.length !== question.correctPhrases.length;
    },

    normalizeSentence(sentence, isZh = false) {
        const s = sentence.trim();
        if (isZh) {
            // Bỏ mọi khoảng trắng và dấu câu — chỉ so phần ký tự Hán.
            return s.replace(/[\s，。！？、；：""''「」『』（）()]/g, '');
        }
        return s
            .replace(/\s+/g, ' ')
            .replace(/[.,!?;:]+$/g, '')
            .toLowerCase();
    },

    checkAnswer() {
        // Tiếng Trung ghép không khoảng trắng; tiếng Anh ghép bằng dấu cách.
        const isZh = /[㐀-鿿]/.test(this.correctSentence);
        const userSentence = this.selectedWords.join(isZh ? '' : ' ');

        const normalizedUserSentence = this.normalizeSentence(userSentence, isZh);
        const normalizedCorrectSentence = this.normalizeSentence(this.correctSentence, isZh);
        const isCorrect = normalizedUserSentence === normalizedCorrectSentence;

        const question = this.questions[this.currentIndex];

        const phraseBtns = document.querySelectorAll('.phrase-btn');
        phraseBtns.forEach(btn => btn.disabled = true);

        const checkBtn = document.getElementById('check-btn');
        if (checkBtn) checkBtn.disabled = true;

        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) clearBtn.disabled = true;

        const sentenceArea = document.getElementById('sentence-area');
        if (sentenceArea) {
            // Chuyển khung sang xếp DỌC: ở trạng thái làm bài nó xếp ngang (các
            // cụm từ ghép thành câu), nhưng kết quả là hai câu để so sánh —
            // cạnh nhau thì trên điện thoại bị bóp thành hai cột chữ dựng đứng.
            sentenceArea.classList.add('has-result');
            // Hai nút CHỈ gắn vào câu ĐÚNG, không gắn vào câu sai.
            //
            // Câu sai là thứ người học vừa tự ghép ra — nghe lại nó là học
            // thuộc cái sai, còn dịch nó thì ra một câu tiếng Việt lộn xộn
            // không giúp gì. Câu đúng mới là thứ đáng nghe và đáng hiểu.
            //
            // Nút DỊCH trước nút LOA, cùng thứ tự với Flashcard và Trắc nghiệm.
            const nutHoTro = `
                <div class="result-actions">
                    <button class="btn-speak-mini rs-translate" title="Dịch câu này">
                        <i class="fas fa-language"></i>
                    </button>
                    <button class="btn-speak-mini rs-speak" title="Nghe câu này">
                        <i class="fas fa-volume-up"></i>
                    </button>
                </div>`;

            // Bọc nhãn + câu trong MỘT khối `.rs-body`, thay cho `<br>` trần.
            //
            // `<br>` giữa các mục flex không xuống dòng như trong văn bản
            // thường: icon, nhãn và câu thành ba mục riêng, căn lệch nhau và
            // nhãn trôi khỏi câu — đúng thứ trông như hỏng trong ảnh.
            const than = (nhan, cau) => `
                <div class="rs-body">
                    <strong>${nhan}</strong>
                    <div class="rs-text">"${cau}"</div>
                </div>`;

            if (isCorrect) {
                sentenceArea.innerHTML = `
                    <div class="result-sentence correct animate-pop">
                        <i class="fas fa-check-circle"></i>
                        ${than('Chính xác!', userSentence)}
                        ${nutHoTro}
                    </div>
                `;
            } else {
                sentenceArea.innerHTML = `
                    <div class="result-sentence wrong animate-pop">
                        <i class="fas fa-times-circle"></i>
                        ${than('Chưa đúng — câu của bạn:', userSentence)}
                        <div class="result-actions">
                            <button class="btn-speak-mini rs-speak-wrong"
                                    title="Nghe câu bạn vừa xếp">
                                <i class="fas fa-volume-up"></i>
                            </button>
                        </div>
                    </div>
                    <div class="result-sentence correct" style="animation-delay: 0.3s;">
                        <i class="fas fa-check-circle"></i>
                        ${than('Đáp án đúng:', this.correctSentence)}
                        ${nutHoTro}
                    </div>
                `;
            }

            // Câu để nghe/dịch LUÔN là câu đúng — kể cả khi trả lời đúng, vì
            // lúc đó `userSentence` và `correctSentence` là một.
            const cauDung = this.correctSentence;
            sentenceArea.querySelector('.rs-speak')?.addEventListener('click', (e) => {
                e.stopPropagation();
                GameLogic.speakWord(cauDung);
            });
            sentenceArea.querySelector('.rs-translate')?.addEventListener('click', (e) => {
                e.stopPropagation();
                EventBus.emit(GameEvents.TRANSLATE_REQUESTED, { text: cauDung });
            });

            // Nút loa cho câu SAI đọc chính câu họ vừa xếp, không phải câu
            // đúng: nghe câu mình sai ngay cạnh câu đúng mới thấy được sai ở
            // đâu. Không có nút dịch — dịch một câu hỏng ra tiếng Việt hỏng
            // thì học nhầm.
            sentenceArea.querySelector('.rs-speak-wrong')?.addEventListener('click', (e) => {
                e.stopPropagation();
                GameLogic.speakWord(userSentence);
            });
        }

        PracticeManager.recordAnswer(isCorrect, question.word);

        if (GameState.state.settings.soundEnabled) {
            Utils.playSound(isCorrect ? Config.sounds.correct : Config.sounds.wrong, 0.5);
        }

        if (isCorrect) {
            Notification.show({
                type: 'success',
                title: '🎉 Chính xác!',
                message: 'Câu của bạn hoàn toàn đúng!',
                duration: 2000
            });
        } else {
            Notification.show({
                type: 'error',
                title: '❌ Chưa đúng',
                message: `Đáp án: ${this.correctSentence}`,
                duration: 3000
            });
        }

        setTimeout(() => {
            GameLogic.speakWord(this.correctSentence, 'en-US');
        }, 500);

        // Xem `contextLearning`: tôn trọng cài đặt "Tự động chuyển câu".
        afterAnswer(this, 'sentence-builder');
    },

    nextQuestion() {
        this.currentIndex++;
        this.showQuestion();
    },

    setupHintSkipListeners() {
        // Giữ tham chiếu handler để cleanup() gỡ ĐÚNG cái của mình — EventBus.off
        // không kèm handler sẽ XOÁ SẠCH listener của sự kiện, kể cả của chế độ khác.
        this._onHint = () => {
            if (!this.hintUsed && this.currentIndex < this.questions.length) {
                this.showHint();
            }
        };
        EventBus.off(GameEvents.HINT_USED, this._onHint);
        EventBus.on(GameEvents.HINT_USED, this._onHint);

        const skipBtn = document.getElementById('skip-btn');
        if (skipBtn) {
            skipBtn.onclick = () => this.skipQuestion();
        }
    },

    showHint() {
        const question = this.questions[this.currentIndex];
        if (!question || this.hintUsed) return;

        // Gợi ý XẾP HỘ hai cụm đầu, không chỉ đọc ra.
        //
        // Đọc ra rồi bắt tự tìm lại trong đống nút là bắt làm việc hai lần mà
        // không học thêm được gì: chỗ khó của chế độ này là THỨ TỰ, không phải
        // dò chữ. Xếp hộ phần mở đầu để họ tiếp tục từ đó.
        const cumDau = (question.correctPhrases || []).slice(0, 2);

        // Dọn trước: đang xếp dở mà chèn vào cuối thì thứ tự sai ngay từ đầu,
        // và họ sẽ tưởng gợi ý cho sai.
        if (this.selectedWords.length) this.clearSentence();

        for (const cum of cumDau) {
            // Đi qua đúng đường bấm nút thật: `selectPhrase` mới khoá nút gốc
            // lại. Đẩy thẳng vào `selectedWords` thì cụm đó còn bấm được lần
            // nữa và câu thừa từ.
            const btn = [...document.querySelectorAll('.phrase-btn')]
                .find((b) => b.dataset.phrase === cum && !b.disabled);
            if (btn) this.selectPhrase(cum, btn);
        }

        const hintArea = document.getElementById('hint-area');
        const hintText = document.getElementById('hint-text');

        if (hintArea && hintText) {
            hintArea.style.display = 'flex';
            hintText.textContent = `Đã xếp sẵn phần mở đầu: "${cumDau.join(' ')}"`;
        }

        this.hintUsed = true;

        Notification.show({
            type: 'info',
            title: '💡 Gợi ý',
            message: 'Đã xếp sẵn 2 cụm đầu câu'
        });
    },

    skipQuestion() {
        const question = this.questions[this.currentIndex];

        PracticeManager.recordAnswer(false, question.word);

        Notification.show({
            type: 'info',
            title: 'Đã bỏ qua',
            message: `Đáp án: ${this.correctSentence}`
        });

        setTimeout(() => {
            this.nextQuestion();
        }, 1500);
    },

    finish() {
        PracticeManager.complete();
    },

    cleanup() {
        EventBus.off(GameEvents.HINT_USED, this._onHint);
        this._onHint = null;

        // Gỡ phím Enter: không gỡ thì nó còn sống sau khi rời chế độ và bấm
        // Enter ở màn khác vẫn gọi `checkAnswer` của bài đã đóng.
        if (this._onKey) {
            document.removeEventListener('keydown', this._onKey);
            this._onKey = null;
        }
        this.questions = [];
        this.currentIndex = 0;
        this.selectedWords = [];
        this.correctSentence = '';
        this.hintUsed = false;
    }
};

