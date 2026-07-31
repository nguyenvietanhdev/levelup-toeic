import { GameLogic } from '@game/gameLogic.js';
import { GameState } from '@game/state.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { Notification } from '@ui/Toaster.jsx';
import { PartSelector } from '@components/vocab/part/partSelector.js';

export const SpeedQuiz = {

    config: null,
    questions: [],
    currentIndex: 0,
    timeRemaining: 0,
    timerId: null,
    boundHandleKeyboard: null,

    async start(config) {
        this.config = config;
        this.currentIndex = 0;

        await this.generateQuestions();

        if (this.questions.length > 0) {
            this.showQuestion();
        } else {
            PracticeManager.complete();
            Notification.show({
                type: 'warning',
                title: 'Không có từ vựng',
                message: 'Không tìm thấy từ vựng nào để luyện tập.',
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
            GameLogic.generateSpeedQuiz(word)
        );
    },

    showQuestion() {
        if (this.boundHandleKeyboard) {
            document.removeEventListener('keydown', this.boundHandleKeyboard);
            this.boundHandleKeyboard = null;
        }

        if (this.currentIndex >= this.questions.length) {
            this.finish();
            return;
        }

        const question = this.questions[this.currentIndex];

        PracticeManager.updateProgress(
            this.currentIndex + 1,
            this.questions.length
        );

        this.timeRemaining = this.config.timePerQuestion;

        this.render(question);

        this.startTimer();
    },

    render(question) {
        const container = document.getElementById('practice-content');
        if (!container) return;

        container.innerHTML = `
            <div class="speed-quiz-container">
                <div class="countdown-timer" id="countdown-timer">
                    ${this.timeRemaining}
                </div>

                <div class="speed-question">
                    <div class="word-display">
                        ${question.question}
                        <button class="btn-speak" id="speak-word-btn" title="Nghe phát âm">
                            <i class="fas fa-volume-up"></i>
                        </button>
                    </div>
                    <div class="arrow">→</div>
                    <div class="shown-answer">${question.shownAnswer}</div>
                </div>

                <div class="question-prompt">
                    Đây có phải nghĩa đúng không?
                </div>

                <div class="speed-choices">
                    <button class="speed-choice-btn correct-btn" data-answer="true">
                        <i class="fas fa-check"></i>
                        Đúng
                    </button>
                    <button class="speed-choice-btn wrong-btn" data-answer="false">
                        <i class="fas fa-times"></i>
                        Sai
                    </button>
                </div>
            </div>
        `;

        this.attachListeners(question);
    },

    attachListeners(question) {
        const buttons = document.querySelectorAll('.speed-choice-btn');

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const userAnswer = btn.dataset.answer === 'true';
                this.checkAnswer(userAnswer, question);
            });
        });

        const speakBtn = document.getElementById('speak-word-btn');
        if (speakBtn) {
            speakBtn.addEventListener('click', () => {
                // Luôn đọc từ tiếng Anh (kể cả khi đảo chiều prompt đang là tiếng Việt).
                if (question?.word?.en) {
                    GameLogic.speakWord(question.word.en, 'en-US');
                }
            });
        }

        this.boundHandleKeyboard = this.handleKeyboard.bind(this, question);
        document.addEventListener('keydown', this.boundHandleKeyboard);
    },

    handleKeyboard(question, e) {
        const buttons = document.querySelectorAll('.speed-choice-btn');
        if (buttons.length > 0 && buttons[0].disabled) return;

        let userAnswer = null;

        if (e.key === 'ArrowLeft' || e.key === '1') {
            userAnswer = true;
        } else if (e.key === 'ArrowRight' || e.key === '2') {
            userAnswer = false;
        }

        if (userAnswer !== null) {
            e.preventDefault();
            this.checkAnswer(userAnswer, question);
        }
    },

    startTimer() {
        const timerEl = document.getElementById('countdown-timer');

        if (timerEl) {
            timerEl.style.color = 'inherit';
        }

        this.timerId = setInterval(() => {
            this.timeRemaining--;

            if (timerEl) {
                timerEl.textContent = this.timeRemaining;

                if (this.timeRemaining <= 3) {
                    timerEl.style.color = 'var(--error-color)';
                }
            }

            if (this.timeRemaining <= 0) {
                this.stopTimer();
                this.timeOut();
            }
        }, 1000);
    },

    stopTimer() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    },

    timeOut() {
        const question = this.questions[this.currentIndex];

        const buttons = document.querySelectorAll('.speed-choice-btn');
        buttons.forEach(btn => btn.disabled = true);

        if (this.boundHandleKeyboard) {
            document.removeEventListener('keydown', this.boundHandleKeyboard);
        }

        PracticeManager.recordAnswer(false, question.word);

        Notification.show({
            type: 'warning',
            title: 'Hết giờ!',
            message: `Đáp án đúng: ${question.correctAnswer}`
        });

        setTimeout(() => {
            this.nextQuestion();
        }, 1000);
    },

    checkAnswer(userAnswer, question) {
        this.stopTimer();

        if (this.boundHandleKeyboard) {
            document.removeEventListener('keydown', this.boundHandleKeyboard);
        }

        const buttons = document.querySelectorAll('.speed-choice-btn');
        buttons.forEach(btn => btn.disabled = true);

        const isCorrect = GameLogic.checkSpeedQuiz(userAnswer, question.isCorrect);

        if (isCorrect) {
            PracticeManager.recordAnswer(true, question.word);

            if (userAnswer) {
                document.querySelector('.correct-btn')?.classList.add('selected', 'correct');
            } else {
                document.querySelector('.wrong-btn')?.classList.add('selected', 'correct');
            }

            if (GameState.state.settings.soundEnabled) {
                Utils.playSound(Config.sounds.correct, 0.5);
            }
        } else {
            PracticeManager.recordAnswer(false, question.word);

            if (question.isCorrect) {
                document.querySelector('.correct-btn')?.classList.add('correct');
                document.querySelector('.wrong-btn')?.classList.add('wrong');
            } else {
                document.querySelector('.wrong-btn')?.classList.add('correct');
                document.querySelector('.correct-btn')?.classList.add('wrong');
            }

            if (GameState.state.settings.soundEnabled) {
                Utils.playSound(Config.sounds.wrong, 0.5);
            }
        }

        setTimeout(() => {
            this.nextQuestion();
        }, 1000);
    },

    nextQuestion() {
        this.currentIndex++;
        this.showQuestion();
    },

    finish() {
        this.stopTimer();
        if (this.boundHandleKeyboard) {
            document.removeEventListener('keydown', this.boundHandleKeyboard);
        }
        PracticeManager.complete();
    },

    cleanup() {
        this.stopTimer();
        if (this.boundHandleKeyboard) {
            document.removeEventListener('keydown', this.boundHandleKeyboard);
            this.boundHandleKeyboard = null;
        }
        this.questions = [];
        this.currentIndex = 0;
        this.timeRemaining = 0;
    }
};

