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

export const PhoneticQuiz = {

    config: null,
    questions: [],
    currentIndex: 0,
    hintUsed: false,
    audioUsed: 0,

    async start(config) {
        this.config = config;
        this.currentIndex = 0;
        this.hintUsed = false;
        this.audioUsed = 0;

        await this.generateQuestions();

        this.setupHintSkipListeners();

        if (this.questions.length > 0) {
            this.showQuestion();
        } else {
            PracticeManager.complete();
            Notification.show({
                type: 'warning',
                title: 'Không đủ dữ liệu',
                message: 'Không tìm thấy đủ từ có phiên âm IPA để luyện tập.',
            });
        }
    },

    async generateQuestions() {
        const selectedPart = GameState.state?.settings?.selectedPart || null;
        const requestCount = selectedPart ? 9999 : (this.config.questionsPerRound || 10) * 4;

        const allWords = await PartSelector.getWordsForPractice(requestCount);
        if (!allWords || allWords.length === 0) return;

        const withPhonetic = allWords.filter(w => w.phonetic && w.phonetic.trim().length > 0);

        if (withPhonetic.length < 4) {
            this._buildFallbackQuestions(allWords);
            return;
        }

        const limit = selectedPart
            ? withPhonetic.length
            : Math.min(this.config.questionsPerRound || 10, withPhonetic.length);
        const selected = withPhonetic.slice(0, limit);

        this.questions = selected.map(word => {
            const distractorPool = withPhonetic.filter(w => w.en !== word.en);
            const distractors = distractorPool
                .sort(() => Math.random() - 0.5)
                .slice(0, 3);

            const options = [word, ...distractors].sort(() => Math.random() - 0.5);
            const correctIndex = options.findIndex(o => o.en === word.en);

            return { word, options, correctIndex, mode: 'ipa-to-word' };
        });
    },

    _buildFallbackQuestions(allWords) {
        const limit = Math.min(this.config.questionsPerRound || 10, allWords.length);
        const selected = allWords.slice(0, limit);

        this.questions = selected.map(word => {
            const distractors = allWords
                .filter(w => w.en !== word.en)
                .sort(() => Math.random() - 0.5)
                .slice(0, 3);

            const options = [word, ...distractors].sort(() => Math.random() - 0.5);
            const correctIndex = options.findIndex(o => o.en === word.en);

            return { word, options, correctIndex, mode: 'meaning' };
        });
    },

    showQuestion() {
        if (this.currentIndex >= this.questions.length) {
            PracticeManager.complete();
            return;
        }

        this.hintUsed = false;
        this.audioUsed = 0;
        const question = this.questions[this.currentIndex];
        PracticeManager.updateProgress(this.currentIndex + 1, this.questions.length);
        PracticeManager.setCurrentWord(question.word);
        PracticeManager.setCurrentWord(question.word);
        this.render(question);

        if (question.mode === 'meaning') {
            setTimeout(() => this.playAudio(question.word.en), 600);
        }

        // Đếm ngược cho RIÊNG câu này; hết giờ → tính sai + chuyển/khoá.
        startQuestionTimer('phonetic-quiz', () => this.onQuestionTimeout());
    },

    // Hết giờ mà chưa trả lời.
    onQuestionTimeout() {
        const question = this.questions[this.currentIndex];
        if (!question) return;
        timeoutQuestion(this, 'phonetic-quiz', {
            selector: '#pq-choices .choice-btn',
            correctIndex: question.correctIndex, word: question.word,
        });
    },

    render(question) {
        const container = document.getElementById('practice-content');
        if (!container) return;

        const isIpaMode = question.mode === 'ipa-to-word';

        container.innerHTML = `
            <div class="phonetic-quiz-container">
                <div class="pq-ipa-display">
                    ${isIpaMode
                        ? `<div class="pq-ipa-big">/${question.word.phonetic}/</div>
                           <div class="pq-ipa-side">
                               <div class="pq-ipa-label"><i class="fas fa-language"></i> Phiên âm IPA</div>
                               <div class="pq-ipa-hint-area">
                                   <button class="pq-play-btn" id="pq-play-btn" title="Nghe phát âm">
                                       <i class="fas fa-volume-up"></i>
                                   </button>
                               </div>
                           </div>`
                        : `<div class="pq-word">${question.word.en}</div>
                           <button class="pq-play-btn" id="pq-play-btn" title="Nghe lại">
                               <i class="fas fa-volume-up"></i>
                           </button>`
                    }
                </div>

                <div class="pq-instruction">
                    ${isIpaMode
                        ? '<i class="fas fa-search"></i> Từ tiếng Anh nào có phiên âm trên?'
                        : '<i class="fas fa-headphones"></i> Nghe từ và chọn nghĩa đúng:'
                    }
                </div>

                <div class="choices-container pq-options" id="pq-choices">
                    ${question.options.map((opt, i) => `
                        <button class="choice-btn pq-word-choice-btn" data-index="${i}">
                            <span class="pq-choice-word">${opt.en}</span>
                            ${opt.vn ? `<span class="pq-choice-vn">${opt.vn}</span>` : ''}
                        </button>
                    `).join('')}
                </div>

                <div class="pq-result" id="pq-result" style="display:none;"></div>
            </div>
        `;

        this.attachListeners(question);
    },

    attachListeners(question) {
        const playBtn = document.getElementById('pq-play-btn');
        playBtn?.addEventListener('click', () => {
            this.playAudio(question.word.en);
        });

        document.querySelectorAll('#pq-choices .choice-btn').forEach((btn, i) => {
            btn.addEventListener('click', () => this.selectAnswer(i, question));
        });
    },

    playAudio(text) {
        GameLogic.speakWord(text, 'en-US');
        const btn = document.getElementById('pq-play-btn');
        if (btn) {
            btn.classList.add('playing');
            setTimeout(() => btn.classList.remove('playing'), 1200);
        }
    },

    selectAnswer(index, question) {
        const buttons = document.querySelectorAll('#pq-choices .choice-btn');
        buttons.forEach(b => b.disabled = true);

        const isCorrect = index === question.correctIndex;

        buttons[index].classList.add(isCorrect ? 'correct' : 'wrong');
        if (!isCorrect) buttons[question.correctIndex].classList.add('correct');

        PracticeManager.recordAnswer(isCorrect, question.word, this.config.pointsPerCorrect || 140);

        if (GameState.state.settings.soundEnabled) {
            Utils.playSound(isCorrect ? Config.sounds.correct : Config.sounds.wrong, 0.5);
        }

        setTimeout(() => this.playAudio(question.word.en), 400);

        this.showResult(question, isCorrect);

        afterAnswer(this, 'phonetic-quiz');
    },

    showResult(question, isCorrect) {
        const resultEl = document.getElementById('pq-result');
        if (!resultEl) return;

        const word = question.word;
        resultEl.style.display = 'block';
        resultEl.innerHTML = `
            <div class="pq-result-header ${isCorrect ? 'correct' : 'wrong'}">
                <i class="fas fa-${isCorrect ? 'check-circle' : 'times-circle'}"></i>
                ${isCorrect ? 'Chính xác!' : `Đáp án đúng: <strong>${word.en}</strong>`}
            </div>
            <div class="pq-word-full">
                <strong style="color: var(--primary-color); font-size: 1.3rem;">${word.en}</strong>
                ${word.phonetic ? `<span class="dictation-phonetic" style="font-size: 1rem;">/${word.phonetic}/</span>` : ''}
                ${word.type ? `<span class="word-type-badge">${word.type}</span>` : ''}
            </div>
            <div class="pq-meaning">${word.vn}</div>
            ${word.example ? `
                <div class="dictation-example">
                    <i class="fas fa-quote-left" style="color: var(--primary-color); margin-right: 6px;"></i>
                    <em>${word.example}</em>
                </div>
            ` : ''}
        `;
    },

    nextQuestion() {
        this.currentIndex++;
        this.showQuestion();
    },

    setupHintSkipListeners() {
        this._hintHandler = () => {
            if (this.hintUsed) return;
            const question = this.questions[this.currentIndex];
            if (!question) return;

            this.hintUsed = true;
            const buttons = document.querySelectorAll('#pq-choices .choice-btn');
            let eliminated = 0;
            buttons.forEach((btn, i) => {
                if (i !== question.correctIndex && eliminated < 2 && !btn.disabled) {
                    btn.style.opacity = '0.3';
                    btn.disabled = true;
                    eliminated++;
                }
            });
            Notification.show({ type: 'info', title: 'Gợi ý', message: 'Đã loại bỏ 2 đáp án sai.', duration: 1500 });
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
        this.audioUsed = 0;
    }
};

