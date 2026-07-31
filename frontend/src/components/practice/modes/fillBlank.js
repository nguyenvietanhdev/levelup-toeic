import { GameLogic, wordPk, ttsLang } from '@game/gameLogic.js';
import { GameState } from '@game/state.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { Notification } from '@ui/Toaster.jsx';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import { afterAnswer } from '@components/practice/practiceNav.js';
import { startQuestionTimer } from '@components/practice/questionTimer.js';
import { timeoutQuestion } from '@components/practice/questionTimeout.js';

export const FillBlank = {
    config: null,
    questions: [],
    currentIndex: 0,
    hintsRevealed: 0,

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
                message: 'Không tìm thấy từ vựng nào để luyện tập.',
            });
        }
    },

    async generateQuestions() {
        const selectedPart = GameState.state?.settings?.selectedPart || null;
        const requestCount = selectedPart
            ? 9999
            : this.config.questionsPerRound || 20;

        const words = await PartSelector.getWordsForPractice(requestCount);

        if (!Array.isArray(words)) {
            this.questions = [];
            return;
        }

        const selectedWords = selectedPart
            ? words
            : words.slice(0, this.config.questionsPerRound || 20);

        this.questions = selectedWords.map(word =>
            GameLogic.generateFillBlank(word)
        );
    },

    showQuestion() {
        if (this.currentIndex >= this.questions.length) {
            this.finish();
            return;
        }

        const question = this.questions[this.currentIndex];
        this.hintsRevealed = 0;

        PracticeManager.updateProgress(
            this.currentIndex + 1,
            this.questions.length
        );
        PracticeManager.setCurrentWord(question.word);

        this.render(question);

        // Phát âm từ ngay khi hiện câu mới (chỉ khi từ tiếng Anh đang hiển thị —
        // chiều EN→VN; chiều đảo VN→EN không đọc để khỏi lộ đáp án).
        if (GameState.state.settings.soundEnabled && !question.reversed) {
            setTimeout(() => GameLogic.speakWord(wordPk(question.word), ttsLang()), 300);
        }

        // Đếm ngược cho RIÊNG câu này; hết giờ → tính sai + chuyển/khoá.
        startQuestionTimer('fill-blank', () => this.onQuestionTimeout());
    },

    // Hết giờ mà chưa trả lời.
    onQuestionTimeout() {
        const question = this.questions[this.currentIndex];
        if (!question) return;
        timeoutQuestion(this, 'fill-blank', {
            selector: '#answer-input, #submit-btn', word: question.word,
            reveal: () => {
                const input = document.getElementById('answer-input');
                if (input) { input.value = question.correctAnswer; input.classList.add('wrong'); }
            },
        });
    },

    render(question) {
        const container = document.getElementById('practice-content');
        if (!container) return;

        container.innerHTML = `
            <div class="fill-blank-container">
                <div class="question-word">
                    <div class="word-display">${question.displayWord}</div>
                    <div class="word-type">${question.word.type}</div>
                    ${!question.reversed ? `<div class="word-phonetic" style="font-size:13px;color:var(--text-secondary)">${question.word.phonetic || ''}</div>` : ''}
                </div>

                <div class="sentence-display">
                    ${question.prompt} <input
                        type="text"
                        class="blank-input"
                        id="answer-input"
                        placeholder="${question.placeholder}"
                        autocomplete="off"
                    />
                </div>

                <button class="submit-answer-btn btn btn-primary" id="submit-btn">
                    Kiểm tra
                </button>
            </div>
        `;

        this.attachListeners();

        setTimeout(() => {
            const input = document.getElementById('answer-input');
            if (input) input.focus();
        }, 100);
    },

    attachListeners() {
        const input = document.getElementById('answer-input');
        const submitBtn = document.getElementById('submit-btn');

        input?.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                this.checkAnswer();
            }
        });

        submitBtn?.addEventListener('click', () => {
            this.checkAnswer();
        });
    },

    checkAnswer() {
        const question = this.questions[this.currentIndex];
        const input = document.getElementById('answer-input');
        const submitBtn = document.getElementById('submit-btn');

        if (!input) return;

        const userAnswer = input.value.trim();

        if (!userAnswer) {
            Notification.show({
                type: 'warning',
                title: 'Chưa nhập đáp án',
                message: 'Vui lòng nhập câu trả lời',
            });
            return;
        }

        const result = GameLogic.checkFillBlank(userAnswer, question.correctAnswer);

        input.disabled = true;
        submitBtn.disabled = true;

        if (result.correct) {
            input.classList.add('correct');
            PracticeManager.recordAnswer(true, question.word);

            if (GameState.state.settings.soundEnabled) {
                Utils.playSound(Config.sounds.correct, 0.5);
            }

            Notification.show({
                type: 'success',
                title: 'Chính xác!',
                message: `Đáp án: ${question.correctAnswer}`,
            });
        } else {
            input.classList.add('wrong');
            PracticeManager.recordAnswer(false, question.word);

            if (GameState.state.settings.soundEnabled) {
                Utils.playSound(Config.sounds.wrong, 0.5);
            }

            Notification.show({
                type: 'error',
                title: 'Sai rồi!',
                message: `Đáp án đúng: ${question.correctAnswer}`,
            });
        }

        // Không hiện panel ví dụ (lộ đáp án trong câu) sau khi trả lời nữa —
        // toast đã báo "Đáp án đúng: ..." rồi.
        afterAnswer(this, 'fill-blank');
    },

    nextQuestion() {
        this.currentIndex++;
        this.showQuestion();
    },

    finish() {
        PracticeManager.complete();
    },

    setupHintSkipListeners() {
        EventBus.on(GameEvents.HINT_USED, () => {
            if (this.currentIndex < this.questions.length) {
                this.showHint();
            }
        });

        EventBus.on(GameEvents.QUESTION_SKIPPED, () => {
            if (this.currentIndex < this.questions.length) {
                this.skipCurrentQuestion();
            }
        });
    },

    showHint() {
        const question = this.questions[this.currentIndex];
        if (!question) return;

        const answer = question.correctAnswer;

        if (this.hintsRevealed >= answer.length) return;

        this.hintsRevealed++;

        const revealed = answer.slice(0, this.hintsRevealed);
        const input = document.getElementById('answer-input');

        if (input) {
            input.value = revealed;
            input.setSelectionRange(revealed.length, revealed.length);
            input.focus();
        }

        const remaining = answer.length - this.hintsRevealed;
        Notification.show({
            type: 'info',
            title: '💡 Gợi ý',
            message:
                remaining > 0
                    ? `"${revealed}..." — còn ${remaining} ký tự`
                    : `Đáp án đầy đủ: ${answer}`,
            duration: 1500,
        });
    },

    skipCurrentQuestion() {
        const question = this.questions[this.currentIndex];
        if (!question) return;

        const input = document.getElementById('answer-input');
        const submitBtn = document.getElementById('submit-btn');

        if (input) {
            input.value = question.correctAnswer;
            input.disabled = true;
            input.classList.add('wrong');
        }

        if (submitBtn) {
            submitBtn.disabled = true;
        }

        PracticeManager.recordAnswer(false, question.word);

        setTimeout(() => {
            this.nextQuestion();
        }, 2000);
    },

    cleanup() {
        EventBus.off(GameEvents.HINT_USED);
        EventBus.off(GameEvents.QUESTION_SKIPPED);

        this.questions = [];
        this.currentIndex = 0;
        this.hintsRevealed = 0;
    }
};

