import { GameLogic } from '@game/gameLogic.js';
import { GameState } from '@game/state.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { Notification } from '@ui/Toaster.jsx';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { WrongWordsManager } from '@components/vocab/wrongWords/wrongWordsManager.js';
import { afterAnswer } from '@components/practice/practiceNav.js';
import { startQuestionTimer } from '@components/practice/questionTimer.js';
import { timeoutQuestion } from '@components/practice/questionTimeout.js';

export const ReviewMistakes = {

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
                type: 'info',
                title: 'Tuyệt vời!',
                message: 'Bạn chưa có từ nào làm sai. Hãy tiếp tục luyện tập!',
                duration: 4000
            });
        }
    },

    async generateQuestions() {
        let wrongWords = [];

        wrongWords = await WrongWordsManager.getWordsToReview(this.config.questionsPerRound);

        if (wrongWords.length === 0 && typeof GameState !== 'undefined') {
            const oldWrongWords = GameState.getWrongWords();
            if (oldWrongWords && oldWrongWords.length > 0) {
                wrongWords = oldWrongWords.slice(0, this.config.questionsPerRound);
            }
        }

        if (wrongWords.length === 0) {
            this.questions = [];
            return;
        }

        const formattedWords = wrongWords.map(w => ({
            id: w.wordId || w.id,
            en: w.en || w.word,
            vn: w.vn || w.meaning || w.vi,
            phonetic: w.phonetic,
            type: w.type,
            level: w.level,
            part: w.part,
            example: w.example,
            image: w.image,
            wrongCount: w.wrongCount,
            priorityScore: w.priorityScore,
            masteryLevel: w.masteryLevel
        }));

        this.questions = formattedWords.map(word =>
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
        startQuestionTimer('review-mistakes', () => this.onQuestionTimeout());
    },

    // Hết giờ mà chưa trả lời.
    onQuestionTimeout() {
        const question = this.questions[this.currentIndex];
        if (!question) return;
        const ci = question.options.indexOf(question.correctAnswer);
        timeoutQuestion(this, 'review-mistakes', { correctIndex: ci >= 0 ? ci : undefined, word: question.word });
    },

    render(question) {
        const container = document.getElementById('practice-content');
        if (!container) return;

        const wrongCount = question.word.wrongCount || 1;

        container.innerHTML = `
            <div class="question-container">
                <div class="review-badge">
                    <span class="badge badge-warning">Luyện lại</span>
                    <span class="wrong-count">Đã sai ${wrongCount} lần</span>
                </div>

                <div class="question-word">
                    <div class="word-display">${question.word.en}</div>
                    <div class="word-phonetic">${question.word.phonetic || ''}</div>
                    <div class="word-type">${question.word.type || ''}</div>
                    ${question.word.image ? `
                        <img src="${question.word.image}" class="word-image" alt="${question.word.en}"
                              onerror="this.style.display='none'">
                    ` : ''}
                </div>

                <div class="question-prompt">
                    Nghĩa của từ này là gì?
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

        this.attachListeners();

        if (GameState.state?.settings?.autoPronunciation) {
            setTimeout(() => {
                GameLogic.speakWord(question.word.en, 'en-US');
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
    },

    selectAnswer(index) {
        const question = this.questions[this.currentIndex];
        this.selectedAnswer = index;

        const choices = document.querySelectorAll('.choice-btn');
        choices.forEach(btn => btn.disabled = true);

        const isCorrect = question.options[index] === question.correctAnswer;

        choices[index].classList.add(isCorrect ? 'correct' : 'wrong');

        if (!isCorrect) {
            const correctIndex = question.options.indexOf(question.correctAnswer);
            if (correctIndex !== -1) {
                choices[correctIndex].classList.add('correct');
            }
        }

        PracticeManager.recordAnswer(isCorrect, question.word);

        if (GameState.state.settings.soundEnabled) {
            Utils.playSound(isCorrect ? Config.sounds.correct : Config.sounds.wrong, 0.5);
        }

        if (isCorrect) {
            Notification.show({
                type: 'success',
                title: 'Chính xác!',
                message: 'Từ này đã được xóa khỏi danh sách cần ôn lại',
                duration: 2000
            });
        } else {
            Notification.show({
                type: 'error',
                title: 'Chưa đúng',
                message: `Đáp án đúng: ${question.correctAnswer}`,
                duration: 3000
            });
        }

        if (GameState.state.settings.soundEnabled && question.word.en) {
            setTimeout(() => {
                GameLogic.speakWord(question.word.en, 'en-US');
            }, 500);
        }

        this.showWordInfo(question.word);

        afterAnswer(this, 'review-mistakes');
    },

    showWordInfo(word) {
        if (!word.example) return;

        const container = document.querySelector('.question-container');
        if (!container) return;

        const infoPanel = document.createElement('div');
        infoPanel.className = 'word-info-panel';
        infoPanel.innerHTML = `
            <div class="word-info-example">
                <i class="fas fa-quote-left" style="color: var(--primary-color); margin-right: 6px;"></i>
                <span>${word.example}</span>
                <button class="btn-speak-mini" id="speak-example-btn" title="Nghe phát âm câu ví dụ">
                    <i class="fas fa-volume-up"></i>
                </button>
            </div>
        `;
        const prompt = container.querySelector('.question-prompt');
        if (prompt) {
            container.insertBefore(infoPanel, prompt);
        } else {
            container.appendChild(infoPanel);
        }

        const speakBtn = document.getElementById('speak-example-btn');
        if (speakBtn) {
            speakBtn.addEventListener('click', () => {
                GameLogic.speakWord(word.example, 'en-US');
            });
        }
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

        const correctIndex = question.options.indexOf(question.correctAnswer);

        const choices = document.querySelectorAll('.choice-btn');
        let removed = 0;

        choices.forEach((btn, index) => {
            if (index !== correctIndex && removed < 2) {
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

    skipQuestion() {
        const question = this.questions[this.currentIndex];

        PracticeManager.recordAnswer(false, question.word);

        Notification.show({
            type: 'info',
            title: 'Đã bỏ qua',
            message: `Đáp án: ${question.correctAnswer}`
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
        this.selectedAnswer = null;
        this.hintUsed = false;
    }
};

