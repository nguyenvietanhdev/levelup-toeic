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

// Dịch cả câu sang tiếng Việt qua Google Translate (gtx) — cùng API popup Dịch nhanh,
// không cần backend/API key.
const _trCache = new Map(); // cache dịch trong phiên → khỏi gọi lại gtx cho câu đã dịch
async function translateToVi(text) {
    if (_trCache.has(text)) return _trCache.get(text);
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
    // Hủy request nếu quá 4s → tránh fetch treo tích luỹ khi gtx bị rate-limit.
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4000);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error('translate failed');
        const data = await res.json();
        const out = (data[0] || []).map(seg => seg[0]).filter(Boolean).join('');
        if (_trCache.size > 300) _trCache.clear(); // chặn cache phình
        _trCache.set(text, out);
        return out;
    } finally {
        clearTimeout(to);
    }
}

export const ExampleFillBlank = {

    config: null,
    questions: [],
    currentIndex: 0,
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

        const wordsWithExample = words.filter(word => word.example && word.example.trim() !== '');

        if (wordsWithExample.length === 0) {
            this.questions = [];
            return;
        }

        const selectedWords = selectedPart
            ? wordsWithExample
            : wordsWithExample.slice(0, this.config.questionsPerRound || 20);

        this.questions = selectedWords.map(word => {
            const question = this.createQuestionFromExample(word);
            return question;
        }).filter(q => q !== null);
    },

    createQuestionFromExample(word) {
        if (!word.example || !word.en) return null;

        const example = word.example;
        const targetWord = word.en;

        // Tiếng Trung: câu ví dụ không có ranh giới từ (\b) hay khoảng trắng →
        // khoét chỗ trống bằng cách so khớp trực tiếp chuỗi ký tự Hán.
        const isZh = /[㐀-鿿]/.test(example);
        let blankedSentence;
        if (isZh) {
            if (!targetWord || !example.includes(targetWord)) return null;
            blankedSentence = example.split(targetWord).join('______');
        } else {
            const esc = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${esc}\\b`, 'gi');
            if (!regex.test(example)) return null;
            blankedSentence = example.replace(new RegExp(`\\b${esc}\\b`, 'gi'), '______');
        }

        const allWords = GameLogic.getVocabulary();
        const otherWords = allWords.filter(w =>
            (w.en || w.zh) !== targetWord &&
            w.type === word.type
        );

        const wrongAnswers = Utils.shuffleArray(otherWords)
            .slice(0, 3)
            .map(w => w.en || w.zh);

        const allOptions = Utils.shuffleArray([targetWord, ...wrongAnswers]);

        return {
            word: word,
            sentence: blankedSentence,
            correctAnswer: targetWord,
            options: allOptions,
            originalExample: example
        };
    },

    showQuestion() {
        if (this.currentIndex >= this.questions.length) {
            this.finish();
            return;
        }

        const question = this.questions[this.currentIndex];
        this.hintUsed = false;

        PracticeManager.updateProgress(
            this.currentIndex + 1,
            this.questions.length
        );
        PracticeManager.setCurrentWord(question.word);

        this.render(question);

        // Đếm ngược cho RIÊNG câu này; hết giờ → tính sai + chuyển/khoá.
        startQuestionTimer('example-fill-blank', () => this.onQuestionTimeout());
    },

    // Hết giờ mà chưa trả lời.
    onQuestionTimeout() {
        const question = this.questions[this.currentIndex];
        if (!question) return;
        timeoutQuestion(this, 'example-fill-blank', {
            selector: '.option-btn', word: question.word,
            reveal: (btns) => btns.forEach(b => {
                if (b.dataset.answer === question.correctAnswer) b.classList.add('correct');
            }),
        });
    },

    render(question) {
        const container = document.getElementById('practice-content');
        if (!container) return;

        const hintInfo = `
            <div class="word-hint">
                <i class="fas fa-lightbulb"></i>
                <span>${question.word.vn}</span>
            </div>
        `;

        container.innerHTML = `
            <div class="example-fill-blank-container">
                <div class="question-header">
                    <h3>Điền từ đúng vào chỗ trống</h3>
                    ${hintInfo}
                </div>

                <div class="sentence-with-blank">
                    ${question.sentence}
                </div>

                <div class="options-grid">
                    ${question.options.map(option => `
                        <button class="option-btn" data-answer="${option}">
                            ${option}
                        </button>
                    `).join('')}
                </div>

                <div class="feedback-area" id="feedback-area"></div>
            </div>
        `;

        this.attachListeners();
    },

    attachListeners() {
        const optionBtns = document.querySelectorAll('.option-btn');

        optionBtns.forEach(btn => {
            btn.addEventListener('click', e => {
                const selectedAnswer = e.target.dataset.answer;
                this.checkAnswer(selectedAnswer, e.target);
            });
        });
    },

    async checkAnswer(selectedAnswer, btnElement) {
        const question = this.questions[this.currentIndex];
        const allBtns = document.querySelectorAll('.option-btn');
        const feedbackArea = document.getElementById('feedback-area');

        allBtns.forEach(btn => btn.disabled = true);

        const isCorrect = selectedAnswer === question.correctAnswer;

        if (GameState.state.settings.soundEnabled) {
            setTimeout(() => {
                GameLogic.speakWord(question.originalExample, 'en-US');
            }, 300);
        }

        // Điền đáp án đúng vào chính câu ở trên (highlight) + chỗ chờ bản dịch —
        // người dùng không phải cuộn xuống xem câu đầy đủ.
        const filled = question.sentence.split('______').join(
            `<strong class="filled-answer">${question.correctAnswer}</strong>`
        );
        const sentenceEl = document.querySelector('.sentence-with-blank');
        if (sentenceEl) {
            sentenceEl.classList.add('answered');
            sentenceEl.innerHTML = `${filled}
                <div class="sentence-translation" id="sentence-translation">
                    <i class="fas fa-spinner fa-spin"></i> Đang dịch...
                </div>`;
        }

        // Feedback gọn: chỉ báo đúng/sai (câu đầy đủ đã nằm ở trên).
        feedbackArea.innerHTML = `
            <div class="feedback ${isCorrect ? 'correct' : 'wrong'}">
                <i class="fas fa-${isCorrect ? 'check' : 'times'}-circle"></i>
                <span>${isCorrect ? 'Chính xác!' : `Sai rồi! Đáp án đúng là: <strong>${question.correctAnswer}</strong>`}</span>
            </div>
        `;

        if (isCorrect) {
            btnElement.classList.add('correct');
            PracticeManager.recordAnswer(true, question.word);

            if (GameState.state.settings.soundEnabled) {
                Utils.playSound(Config.sounds.correct, 0.5);
            }
        } else {
            btnElement.classList.add('wrong');

            allBtns.forEach(btn => {
                if (btn.dataset.answer === question.correctAnswer) {
                    btn.classList.add('correct');
                }
            });

            PracticeManager.recordAnswer(false, question.word);

            if (GameState.state.settings.soundEnabled) {
                Utils.playSound(Config.sounds.wrong, 0.5);
            }
        }

        // Chờ dịch xong (tối đa 5s) rồi mới chuyển câu / hiện nút điều hướng.
        let done = false;
        const finishStep = () => {
            if (done) return;
            done = true;
            afterAnswer(this, 'example-fill-blank');
        };
        const fallback = setTimeout(() => {
            const d = document.getElementById('sentence-translation');
            if (d) d.innerHTML = '';
            finishStep();
        }, 5000);

        try {
            const translation = await translateToVi(question.originalExample);
            const d = document.getElementById('sentence-translation');
            if (translation && d) {
                d.innerHTML = `<i class="fas fa-language"></i> ${translation}`;
                d.classList.add('translation-success');
            } else if (d) {
                d.innerHTML = '';
            }
        } catch (error) {
            console.error('Translation error:', error);
            const d = document.getElementById('sentence-translation');
            if (d) d.innerHTML = '';
        }

        clearTimeout(fallback);
        finishStep();
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

        const options = document.querySelectorAll('.option-btn');
        let removed = 0;

        options.forEach(btn => {
            if (btn.dataset.answer !== question.correctAnswer && removed < 2) {
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
        this.hintUsed = false;
    }
};

