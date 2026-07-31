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

export const SentenceListening = {

    config: null,
    questions: [],
    currentIndex: 0,
    selectedWords: null,
    answered: false,
    hintUsed: false,

    async start(config) {
        this.config = config;
        this.currentIndex = 0;
        this.hintUsed = false;
        this.answered = false;
        this.selectedWords = new Set();

        await this.generateQuestions();

        this.setupHintSkipListeners();

        if (this.questions.length > 0) {
            this.showQuestion();
        } else {
            PracticeManager.complete();
            Notification.show({
                type: 'warning',
                title: 'Không có từ vựng',
                message: 'Không tìm thấy đủ từ vựng để luyện tập.',
            });
        }
    },

    async generateQuestions() {
        const selectedPart = GameState.state?.settings?.selectedPart || null;
        const questionsNeeded = this.config.questionsPerRound || 10;
        const requestCount = selectedPart ? 9999 : questionsNeeded * 3 + 10;

        const allWords = await PartSelector.getWordsForPractice(requestCount);
        if (!allWords || allWords.length < 8) return;

        const shuffled = [...allWords].sort(() => Math.random() - 0.5);
        const limit = selectedPart
            ? Math.floor(shuffled.length / 3)
            : Math.min(questionsNeeded, Math.floor(shuffled.length / 3));

        this.questions = [];
        for (let i = 0; i < limit; i++) {
            const targetWords = shuffled.slice(i * 3, i * 3 + 3);
            if (targetWords.length < 3) break;

            const distractors = shuffled
                .filter(w => !targetWords.find(t => t.en === w.en))
                .sort(() => Math.random() - 0.5)
                .slice(0, 5);

            const grid = [...targetWords, ...distractors].sort(() => Math.random() - 0.5);
            this.questions.push({ targetWords, grid });
        }
    },

    showQuestion() {
        if (this.currentIndex >= this.questions.length) {
            PracticeManager.complete();
            return;
        }

        this.answered = false;
        this.hintUsed = false;
        this.selectedWords = new Set();

        const question = this.questions[this.currentIndex];
        PracticeManager.updateProgress(this.currentIndex + 1, this.questions.length);
        this.render(question);

        setTimeout(() => this.playSequence(question.targetWords), 700);

        // Đếm ngược cho RIÊNG câu này; hết giờ → tính sai + chuyển/khoá.
        startQuestionTimer('sentence-listening', () => this.onQuestionTimeout());
    },

    // Hết giờ mà chưa trả lời.
    onQuestionTimeout() {
        const question = this.questions[this.currentIndex];
        if (!question) return;
        const targets = new Set(question.targetWords || []);
        timeoutQuestion(this, 'sentence-listening', {
            selector: '.sl-grid-word-btn', word: question.targetWords?.[0],
            reveal: (btns) => btns.forEach(b => {
                if (targets.has(b.dataset.word)) b.classList.add('sl-missed');
            }),
        });
    },

    render(question) {
        const container = document.getElementById('practice-content');
        if (!container) return;

        container.innerHTML = `
            <div class="sentence-listening-container">
                <div class="sl-audio-area">
                    <button class="sl-play-btn" id="sl-play-btn" title="Nghe lại 3 từ">
                        <i class="fas fa-headphones"></i>
                    </button>
                    <div class="sl-listen-info">
                        <div class="sl-listen-label">Nghe 3 từ được đọc lần lượt</div>
                        <div class="sl-listen-sub">Chọn đúng 3 từ trong lưới bên dưới</div>
                    </div>
                </div>

                <div class="sl-selected-count" id="sl-selected-count">
                    Đã chọn: <strong>0</strong> / 3
                </div>

                <div class="sl-word-grid" id="sl-word-grid">
                    ${question.grid.map(word => `
                        <button class="sl-grid-word-btn" data-word="${word.en}">
                            ${word.en}
                        </button>
                    `).join('')}
                </div>

                <button class="btn btn-primary sl-submit-btn" id="sl-submit-btn" disabled>
                    <i class="fas fa-check"></i> Xác nhận
                </button>

                <div class="sl-result" id="sl-result" style="display:none;"></div>
            </div>
        `;

        this.attachListeners(question);
    },

    attachListeners(question) {
        document.getElementById('sl-play-btn')?.addEventListener('click', () => {
            this.playSequence(question.targetWords);
        });

        document.querySelectorAll('.sl-grid-word-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.answered) return;
                this.toggleWord(btn.dataset.word, btn);
            });
        });

        document.getElementById('sl-submit-btn')?.addEventListener('click', () => {
            if (!this.answered) this.submitAnswer(question);
        });
    },

    playSequence(words) {
        const btn = document.getElementById('sl-play-btn');
        if (btn) btn.classList.add('playing');

        const gap = 400;

        const playWord = (index) => {
            if (index >= words.length) {
                btn?.classList.remove('playing');
                return;
            }
            GameLogic.speakWord(words[index].en, 'en-US', () => {
                setTimeout(() => playWord(index + 1), gap);
            });
        };

        playWord(0);
    },

    toggleWord(wordEn, btn) {
        if (this.selectedWords.has(wordEn)) {
            this.selectedWords.delete(wordEn);
            btn.classList.remove('sl-selected');
        } else {
            if (this.selectedWords.size >= 3) return;
            this.selectedWords.add(wordEn);
            btn.classList.add('sl-selected');
        }

        const count = this.selectedWords.size;
        const countEl = document.getElementById('sl-selected-count');
        if (countEl) countEl.innerHTML = `Đã chọn: <strong>${count}</strong> / 3`;

        const submitBtn = document.getElementById('sl-submit-btn');
        if (submitBtn) submitBtn.disabled = count !== 3;
    },

    submitAnswer(question) {
        this.answered = true;

        document.querySelectorAll('.sl-grid-word-btn').forEach(b => b.disabled = true);
        const submitBtn = document.getElementById('sl-submit-btn');
        if (submitBtn) submitBtn.disabled = true;

        const targetSet = new Set(question.targetWords.map(w => w.en));
        let correctCount = 0;
        this.selectedWords.forEach(w => {
            if (targetSet.has(w)) correctCount++;
        });

        const isFullyCorrect = correctCount === 3;

        document.querySelectorAll('.sl-grid-word-btn').forEach(btn => {
            const word = btn.dataset.word;
            const isTarget = targetSet.has(word);
            const isSelected = this.selectedWords.has(word);

            if (isTarget && isSelected) btn.classList.add('correct');
            else if (isTarget && !isSelected) btn.classList.add('sl-missed');
            else if (!isTarget && isSelected) btn.classList.add('wrong');
        });

        PracticeManager.recordAnswer(isFullyCorrect, question.targetWords[0], this.config.pointsPerCorrect || 130);

        if (GameState.state.settings.soundEnabled) {
            Utils.playSound(isFullyCorrect ? Config.sounds.correct : Config.sounds.wrong, 0.5);
        }

        this.showResult(question, correctCount);
        afterAnswer(this, 'sentence-listening');
    },

    showResult(question, correctCount) {
        const resultEl = document.getElementById('sl-result');
        if (!resultEl) return;

        const isFullyCorrect = correctCount === 3;
        resultEl.style.display = 'block';
        resultEl.innerHTML = `
            <div class="sl-result-header ${isFullyCorrect ? 'correct' : 'wrong'}">
                <i class="fas fa-${isFullyCorrect ? 'check-circle' : 'times-circle'}"></i>
                ${isFullyCorrect ? 'Hoàn hảo! Bạn nghe đúng cả 3 từ!' : `Đúng ${correctCount}/3 từ`}
            </div>
            <div class="sl-words-reveal">
                <div class="sl-words-label">3 từ được đọc:</div>
                ${question.targetWords.map(w => `
                    <div class="sl-word-reveal-item">
                        <strong style="color: var(--primary-color);">${w.en}</strong>
                        ${w.phonetic ? `<span class="dictation-phonetic">/${w.phonetic}/</span>` : ''}
                        — <span>${w.vn}</span>
                    </div>
                `).join('')}
            </div>
        `;
    },

    nextQuestion() {
        this.currentIndex++;
        this.showQuestion();
    },

    setupHintSkipListeners() {
        this._hintHandler = () => {
            if (this.hintUsed || this.answered) return;
            const question = this.questions[this.currentIndex];
            if (!question) return;

            this.hintUsed = true;
            const unrevealed = question.targetWords.find(w => !this.selectedWords.has(w.en));
            if (unrevealed) {
                const btn = document.querySelector(`.sl-grid-word-btn[data-word="${unrevealed.en}"]`);
                if (btn) {
                    btn.style.borderColor = 'var(--primary-color)';
                    btn.style.boxShadow = '0 0 0 2px rgba(var(--primary-rgb), 0.3)';
                }
                Notification.show({ type: 'info', title: 'Gợi ý', message: `Một trong 3 từ là: "${unrevealed.en}"`, duration: 2000 });
            }
        };

        EventBus.on(GameEvents.HINT_USED, this._hintHandler);
    },

    cleanup() {
        if (this._hintHandler) {
            EventBus.off(GameEvents.HINT_USED, this._hintHandler);
            this._hintHandler = null;
        }
        this.questions = [];
        this.currentIndex = 0;
        this.hintUsed = false;
        this.answered = false;
        this.selectedWords = new Set();
    }
};

