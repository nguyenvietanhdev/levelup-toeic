import { GameLogic } from '@game/gameLogic.js';
import { GameState } from '@game/state.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { Notification } from '@ui/Toaster.jsx';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import { afterAnswer } from '@components/practice/practiceNav.js';
import { startQuestionTimer } from '@components/practice/questionTimer.js';
import { timeoutQuestion } from '@components/practice/questionTimeout.js';

export const SynonymCheck = {

    config: null,
    questions: [],
    currentIndex: 0,
    selected: new Set(),   // multi-select: chosen option indices
    answered: false,
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
            GameLogic.generateSynonymCheck(word, this.config.optionsCount)
        );
    },

    showQuestion() {
        if (this.currentIndex >= this.questions.length) {
            this.finish();
            return;
        }

        const question = this.questions[this.currentIndex];
        this.selected = new Set();
        this.answered = false;
        this.hintUsed = false;

        PracticeManager.updateProgress(
            this.currentIndex + 1,
            this.questions.length
        );
        PracticeManager.setCurrentWord(question.word);

        this.render(question);

        // Đếm ngược cho RIÊNG câu này; hết giờ → tính sai + chuyển/khoá.
        startQuestionTimer('synonym-check', () => this.onQuestionTimeout());
    },

    // Hết giờ mà chưa trả lời.
    onQuestionTimeout() {
        const question = this.questions[this.currentIndex];
        if (!question) return;
        const norm = s => String(s).trim().toLowerCase();
        const correctSet = new Set((question.correctAnswers || []).map(norm));
        timeoutQuestion(this, 'synonym-check', {
            word: question.word,
            reveal: (btns) => btns.forEach((b, i) => {
                if (correctSet.has(norm(question.options[i]))) b.classList.add('correct');
            }),
        });
    },

    render(question) {
        const container = document.getElementById('practice-content');
        if (!container) return;

        container.innerHTML = `
            <div class="question-container">
                <div class="question-word question-word--split">
                    <div class="question-text-col">
                        <div class="word-display" style="font-size:1.8rem; font-weight:700">
                            ${question.word.en}
                            <button class="btn-speak" id="speak-word-btn" title="Nghe phát âm" style="margin-left:6px">
                                <i class="fas fa-volume-up"></i>
                            </button>
                        </div>
                        <div class="word-meaning" style="color:var(--text-secondary); margin-top:4px">
                            ${question.word.vn || ''}
                        </div>
                    </div>
                    <div class="question-synonyms-col">
                        <div class="synonyms-prompt">${question.question}</div>
                    </div>
                    ${question.word.image ? `
                        <div class="question-image-col">
                            <img src="${question.word.image}" class="word-image" alt="${question.word.en}"
                                 onerror="this.closest('.question-image-col').style.display='none'">
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
        document.querySelectorAll('.choice-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => this.pickOption(index));
        });

        document.getElementById('speak-word-btn')?.addEventListener('click', e => {
            e.stopPropagation();
            const q = this.questions?.[this.currentIndex];
            if (q?.word?.en) GameLogic.speakWord(q.word.en, 'en-US');
        });
    },

    // Instant feedback: tap a cell → if correct it locks green; collect all
    // correct → pass. Any wrong tap → reveal answers + fail. Max picks =
    // number of correct answers (no submit button).
    pickOption(index) {
        if (this.answered) return;
        const btn = document.querySelector(`.choice-btn[data-index="${index}"]`);
        if (!btn || btn.disabled) return;

        const question = this.questions[this.currentIndex];
        const correctTexts = question.correctAnswers
            || [question.options[question.correctIndex]];
        const norm = s => String(s).trim().toLowerCase();
        const correctSet = new Set(correctTexts.map(norm));

        const isOptCorrect = correctSet.has(norm(question.options[index]));
        btn.disabled = true;

        if (!isOptCorrect) {
            btn.classList.add('wrong');
            return this.concludeQuestion(false, correctSet, norm);
        }

        // Correct pick → lock it in.
        btn.classList.add('correct');
        this.selected.add(index);
        if (this.selected.size >= correctSet.size) {
            this.concludeQuestion(true, correctSet, norm);
        }
    },

    concludeQuestion(isCorrect, correctSet, norm) {
        this.answered = true;
        const question = this.questions[this.currentIndex];
        const choices = document.querySelectorAll('.choice-btn');
        choices.forEach((b, i) => {
            b.disabled = true;
            // On a miss, reveal every correct option.
            if (!isCorrect && correctSet.has(norm(question.options[i]))) {
                b.classList.add('correct');
            }
        });

        PracticeManager.recordAnswer(isCorrect, question.word);
        if (GameState.state.settings.soundEnabled) {
            Utils.playSound(isCorrect ? Config.sounds.correct : Config.sounds.wrong, 0.5);
        }

        this.showWordInfo(question.word);

        afterAnswer(this, 'synonym-check');
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
    },

    showHint() {
        const question = this.questions[this.currentIndex];
        if (!question || this.hintUsed || this.answered) return;

        const correctTexts = question.correctAnswers
            || [question.options[question.correctIndex]];
        const norm = s => String(s).trim().toLowerCase();
        const correctSet = new Set(correctTexts.map(norm));

        // Remove exactly ONE wrong option per use — with 2 correct + 2 wrong,
        // removing more would reveal the answer.
        const choices = document.querySelectorAll('.choice-btn');
        for (let i = 0; i < choices.length; i++) {
            const btn = choices[i];
            if (btn.disabled) continue;
            if (correctSet.has(norm(question.options[i]))) continue; // never hide a correct one
            btn.style.opacity = '0.3';
            btn.disabled = true;
            this.selected.delete(i);
            btn.classList.remove('selected');
            break;
        }

        this.hintUsed = true;

        Notification.show({
            type: 'info',
            title: '💡 Gợi ý',
            message: 'Đã loại bỏ 1 đáp án sai',
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

