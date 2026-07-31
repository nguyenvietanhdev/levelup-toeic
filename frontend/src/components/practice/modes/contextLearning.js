import { GameLogic } from '@game/gameLogic.js';
import { GameState } from '@game/state.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { Notification } from '@ui/Toaster.jsx';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';

export const ContextLearning = {

    config: null,
    questions: [],
    currentIndex: 0,
    selectedAnswer: null,
    hintUsed: false,

    async start(config) {
        this.config = config;
        this.currentIndex = 0;
        this.hintUsed = false;

        await this.generateQuestions();

        this.setupHintSkipListeners();

        if (this.questions.length > 0) {
            this.showQuestion();
        } else {
            PracticeManager.complete();
            Notification.show({
                type: 'warning',
                title: 'Không có từ vựng',
                message: 'Không tìm thấy từ vựng có câu ví dụ để luyện tập.',
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

        const wordsWithExamples = words.filter(w => w.example && w.example.trim() !== '');

        const selectedWords = selectedPart
            ? wordsWithExamples
            : wordsWithExamples.slice(0, this.config.questionsPerRound || 20);

        this.questions = selectedWords.map(word => {
            return this.generateContextQuestion(word, wordsWithExamples);
        });
    },

    generateContextQuestion(word, allWords) {
        const otherWords = allWords.filter(w => w.en !== word.en && w.vn !== word.vn);
        const shuffled = [...otherWords].sort(() => Math.random() - 0.5);
        const wrongOptions = shuffled.slice(0, 3).map(w => w.vn);

        const options = [...wrongOptions];
        const correctIndex = Math.floor(Math.random() * (options.length + 1));
        options.splice(correctIndex, 0, word.vn);

        const highlightedExample = word.example.replace(
            new RegExp(`\\b${word.en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
            `<strong style="color: var(--primary-color); text-decoration: underline;">${word.en}</strong>`
        );

        return {
            word: word,
            example: word.example,
            highlightedExample: highlightedExample,
            options: options,
            correctIndex: correctIndex,
            correctAnswer: word.vn
        };
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
    },

    render(question) {
        const container = document.getElementById('practice-content');
        if (!container) return;

        container.innerHTML = `
            <div class="question-container">
                <div class="context-example-box">
                    <div class="context-label">
                        <i class="fas fa-headphones"></i> Nghe câu ví dụ:
                    </div>
                    <div class="context-sentence" id="context-sentence" style="display: none;">
                        ${question.highlightedExample}
                    </div>
                    <div class="context-listen-hint" id="listen-hint">
                        <i class="fas fa-ear-listen" style="font-size: 28px; color: var(--primary-color); margin-bottom: 8px;"></i>
                        <div>Hãy nghe và đoán nghĩa</div>
                    </div>
                    <button class="btn-speak" id="speak-example-btn" title="Nghe lại câu ví dụ">
                        <i class="fas fa-volume-up"></i>
                    </button>
                </div>

                <div class="question-prompt" id="question-prompt">
                    <button class="btn-reveal-word" id="reveal-word-btn">
                        <i class="fas fa-eye"></i> Hiện từ
                    </button>
                    <span id="word-reveal-text" style="display: none;">
                        Từ <strong style="color: var(--primary-color);">"${question.word.en}"</strong> nghĩa là gì?
                    </span>
                </div>

                <div class="choices-container">
                    ${question.options.map((option, index) => `
                        <button class="choice-btn" data-index="${index}">
                            ${option}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;

        this.attachListeners(question);

        setTimeout(() => {
            GameLogic.speakWord(question.example, 'en-US');
        }, 300);
    },

    attachListeners(question) {
        const choices = document.querySelectorAll('.choice-btn');
        choices.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                this.selectAnswer(index);
            });
        });

        const speakBtn = document.getElementById('speak-example-btn');
        if (speakBtn) {
            speakBtn.addEventListener('click', () => {
                GameLogic.speakWord(question.example, 'en-US');
            });
        }

        const listenHint = document.getElementById('listen-hint');
        if (listenHint) {
            listenHint.style.cursor = 'pointer';
            listenHint.addEventListener('click', () => {
                GameLogic.speakWord(question.example, 'en-US');
            });
        }

        const revealBtn = document.getElementById('reveal-word-btn');
        if (revealBtn) {
            revealBtn.addEventListener('click', () => {
                revealBtn.style.display = 'none';
                document.getElementById('word-reveal-text').style.display = '';
            });
        }
    },

    selectAnswer(index) {
        if (this.selectedAnswer !== null) return;

        const question = this.questions[this.currentIndex];
        this.selectedAnswer = index;

        const choices = document.querySelectorAll('.choice-btn');
        choices.forEach(btn => btn.disabled = true);

        const isCorrect = index === question.correctIndex;

        if (isCorrect) {
            choices[index].classList.add('correct');
            PracticeManager.recordAnswer(true, question.word);

            if (GameState.state.settings.soundEnabled) {
                Utils.playSound(Config.sounds.correct, 0.5);
            }
        } else {
            choices[index].classList.add('wrong');
            choices[question.correctIndex].classList.add('correct');
            PracticeManager.recordAnswer(false, question.word);

            if (GameState.state.settings.soundEnabled) {
                Utils.playSound(Config.sounds.wrong, 0.5);
            }
        }

        const sentenceEl = document.getElementById('context-sentence');
        const listenHint = document.getElementById('listen-hint');
        const revealBtn = document.getElementById('reveal-word-btn');
        const wordText = document.getElementById('word-reveal-text');
        if (sentenceEl) sentenceEl.style.display = '';
        if (listenHint) listenHint.style.display = 'none';
        if (revealBtn) revealBtn.style.display = 'none';
        if (wordText) wordText.style.display = '';

        this.showWordInfo(question.word);

        setTimeout(() => {
            this.nextQuestion();
        }, 2000);
    },

    showWordInfo(word) {
        const container = document.querySelector('.question-container');
        if (!container) return;

        const infoPanel = document.createElement('div');
        infoPanel.className = 'word-info-panel';
        infoPanel.innerHTML = `
            <div class="word-info-reveal">
                <strong>${word.en}</strong> - ${word.vn}
                <span class="word-info-phonetic">${word.phonetic || ''}</span>
                ${word.type ? `<span class="word-info-type">(${word.type})</span>` : ''}
            </div>
        `;
        container.appendChild(infoPanel);
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
    },

    showHint() {
        const question = this.questions[this.currentIndex];
        if (!question || this.hintUsed) return;

        const choices = document.querySelectorAll('.choice-btn');
        let removed = 0;

        choices.forEach((btn, index) => {
            if (index !== question.correctIndex && removed < 2) {
                btn.style.opacity = '0.3';
                btn.disabled = true;
                removed++;
            }
        });

        this.hintUsed = true;

        Notification.show({
            type: 'info',
            title: '💡 Gợi ý',
            message: 'Đã loại bỏ 2 đáp án sai'
        });
    },

    finish() {
        PracticeManager.complete();
    },

    cleanup() {
        EventBus.off(GameEvents.HINT_USED);
        this.questions = [];
        this.currentIndex = 0;
        this.selectedAnswer = null;
        this.hintUsed = false;
    }
};

