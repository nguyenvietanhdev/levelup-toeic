import { GameLogic } from '@game/gameLogic.js';
import { GameState } from '@game/state.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { Notification } from '@ui/Toaster.jsx';
import { EventBus, GameEvents } from '@game/eventBus.js';

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

        if (this.questions.length > 0) {
            this.showQuestion();
        }
    },

    async generateQuestions() {
        const words = GameLogic.getRandomWords(this.config.questionsPerRound);

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
        });
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
                <div class="question-prompt">
                    <h3>🧩 Sắp xếp các cụm từ thành câu hoàn chỉnh</h3>
                    <div class="instruction-box">
                        <p><i class="fas fa-info-circle"></i> <strong>Cách chơi:</strong> Click vào các cụm từ bên dưới theo thứ tự đúng để ghép thành câu tiếng Anh có nghĩa</p>
                    </div>

                    ${question.translation ? `
                        <div class="translation-hint-box">
                            <div class="translation-label">
                                <i class="fas fa-language"></i>
                                <strong>Nghĩa của câu:</strong>
                            </div>
                            <div class="translation-text">${question.translation}</div>
                        </div>
                    ` : ''}

                    <div class="word-hint-box">
                        <div class="word-hint-label">
                            <i class="fas fa-lightbulb"></i>
                            <strong>Gợi ý từ vựng chính:</strong>
                        </div>
                        <div class="word-meaning">
                            <span class="highlight-word">${question.word.en}</span>
                            <span class="word-translation">= ${question.wordVn}</span>
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
                            <button class="remove-word" onclick="SentenceBuilder.removeWord(${index})" title="Xóa cụm">
                                <i class="fas fa-times"></i>
                            </button>
                        </span>
                    `).join(' ')}
                </div>
            `;
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
            if (isCorrect) {
                sentenceArea.innerHTML = `
                    <div class="result-sentence correct animate-pop">
                        <i class="fas fa-check-circle"></i>
                        <strong>Chính xác!</strong><br>
                        "${userSentence}"
                    </div>
                `;
            } else {
                sentenceArea.innerHTML = `
                    <div class="result-sentence wrong animate-pop">
                        <i class="fas fa-times-circle"></i>
                        <strong>Chưa đúng</strong><br>
                        Câu của bạn: "${userSentence}"
                    </div>
                    <div class="result-sentence correct" style="margin-top: 10px; animation-delay: 0.3s;">
                        <i class="fas fa-check-circle"></i>
                        <strong>Đáp án đúng:</strong><br>
                        "${this.correctSentence}"
                    </div>
                `;
            }
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

        setTimeout(() => {
            this.nextQuestion();
        }, 3500);
    },

    nextQuestion() {
        this.currentIndex++;
        this.showQuestion();
    },

    setupHintSkipListeners() {
        EventBus.on(GameEvents.HINT_USED, () => {
            if (!this.hintUsed && this.currentIndex < this.questions.length) {
                this.showHint();
            }
        });

        const skipBtn = document.getElementById('skip-btn');
        if (skipBtn) {
            skipBtn.onclick = () => this.skipQuestion();
        }
    },

    showHint() {
        const question = this.questions[this.currentIndex];
        if (!question || this.hintUsed) return;

        const hintArea = document.getElementById('hint-area');
        const hintText = document.getElementById('hint-text');

        if (hintArea && hintText) {
            hintArea.style.display = 'flex';
            hintText.textContent = `Câu bắt đầu bằng: "${question.words[0]} ${question.words[1]}"`;
        }

        this.hintUsed = true;

        Notification.show({
            type: 'info',
            title: '💡 Gợi ý',
            message: 'Đã hiển thị 2 từ đầu tiên'
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
        EventBus.off(GameEvents.HINT_USED);
        this.questions = [];
        this.currentIndex = 0;
        this.selectedWords = [];
        this.correctSentence = '';
        this.hintUsed = false;
    }
};

