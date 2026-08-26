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
import { chenViDu } from '../exampleBlock.js';

export const WordTypeCheck = {

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

        const optionsCount = this.config.optionsCount || 4;

        // Từ loại lấy từ TẬP ĐANG LUYỆN trước — nhiễu cùng bộ thì sát thực tế hơn.
        const uniqueTypes = [...new Set(selectedWords.map(w => w.type).filter(Boolean))];

        // Nhưng có nguồn quá hẹp: `部首` chỉ có ĐÚNG MỘT từ loại, `zh_giaotiep_cau`
        // có hai. Lúc đó hàng đáp án chỉ hiện 1–2 ô — gần như lộ đáp án. Bù thêm
        // từ loại của TOÀN KHO cho đủ số lựa chọn.
        if (uniqueTypes.length < optionsCount) {
            const pool = new Set(uniqueTypes);
            for (const w of (GameLogic.vocabularyData || [])) {
                if (pool.size >= optionsCount) break;
                if (w.type) pool.add(w.type);
            }
            uniqueTypes.length = 0;
            uniqueTypes.push(...pool);
        }

        this.questions = selectedWords.map(word =>
            GameLogic.generateWordTypeCheck(word, optionsCount, uniqueTypes)
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
        startQuestionTimer('word-type-check', () => this.onQuestionTimeout());
    },

    // Hết giờ mà chưa trả lời.
    onQuestionTimeout() {
        const question = this.questions[this.currentIndex];
        if (!question) return;
        timeoutQuestion(this, 'word-type-check', { correctIndex: question.correctIndex, word: question.word });
    },

    render(question) {
        const container = document.getElementById('practice-content');
        if (!container) return;

        const TYPE_LABELS_VI = {
            'noun': 'Danh từ',
            'verb': 'Động từ',
            'adjective': 'Tính từ',
            'adverb': 'Trạng từ',
            'preposition': 'Giới từ',
            'conjunction': 'Liên từ',
            'pronoun': 'Đại từ',
            'interjection': 'Thán từ',
            'article': 'Mạo từ',
            'determiner': 'Từ hạn định',
            'auxiliary': 'Trợ động từ',
            'noun phrase': 'Cụm danh từ',
            'verb phrase': 'Cụm động từ',
            'adjective phrase': 'Cụm tính từ',
            'adverb phrase': 'Cụm trạng từ',
            'prepositional phrase': 'Cụm giới từ',
            'participle phrase': 'Cụm phân từ',
            'gerund phrase': 'Cụm danh động từ',
            'infinitive phrase': 'Cụm động từ nguyên thể',
            'unknown': 'Không rõ',

            // ── Từ loại tiếng Trung (chữ Hán) ────────────────────────────
            // Kho tiếng Trung lưu `名词`, `动词`… chứ không phải `noun`/`verb`.
            // Thiếu mấy dòng này thì Proxy bên dưới trả về CHÍNH KEY làm nhãn,
            // và ô đáp án in ra "数词 数词" — nhãn và chú thích trùng nhau.
            '名词': 'Danh từ',
            '动词': 'Động từ',
            '形容词': 'Tính từ',
            '副词': 'Trạng từ',
            '代词': 'Đại từ',
            '介词': 'Giới từ',
            '连词': 'Liên từ',
            '助词': 'Trợ từ',
            '助动词': 'Trợ động từ',
            '叹词': 'Thán từ',
            '量词': 'Lượng từ',
            '数词': 'Số từ',
            '数量词': 'Số lượng từ',
            '拟声词': 'Từ tượng thanh',
            '成语': 'Thành ngữ',
            '短语': 'Cụm từ',
            '名词短语': 'Cụm danh từ',
            '动词短语': 'Cụm động từ',
            '形容词短语': 'Cụm tính từ',
            '副词短语': 'Cụm trạng từ',
            '连词短语': 'Cụm liên từ',
            '代词短语': 'Cụm đại từ',
            '前缀': 'Tiền tố',
            '后缀': 'Hậu tố',
            'bộ thủ': 'Bộ thủ',
        };

        /**
         * Nhãn tiếng Việt cho một `type`.
         *
         * Từ loại GHÉP (`名词/动词`) không nằm trong bảng — dịch từng thành phần
         * rồi nối lại, thay vì trả về nguyên chuỗi Hán. Có 331 từ mang
         * `名词/动词`, bỏ qua là chúng hiện ra chữ Hán trần giữa danh sách tiếng
         * Việt.
         */
        const labelOf = (type) => {
            const key = String(type ?? '');
            if (TYPE_LABELS_VI[key]) return TYPE_LABELS_VI[key];
            if (key.includes('/')) {
                return key.split('/')
                    .map(p => TYPE_LABELS_VI[p.trim()] || p.trim())
                    .join(' / ');
            }
            // Type lạ vẫn hiện được — dùng chính nó làm nhãn.
            return key;
        };

        container.innerHTML = `
            <div class="question-container">
                <div class="question-word question-word--split">
                    <div class="question-text-col">
                        <div class="word-display">
                            ${question.word.en}
                            <button class="btn-speak" id="speak-word-btn" title="Nghe phát âm">
                                <i class="fas fa-volume-up"></i>
                            </button>
                        </div>
                        <div class="word-phonetic">${question.word.phonetic}</div>
                        <div class="word-meaning">${question.word.vn}</div>
                    </div>
                    <div class="question-synonyms-col">
                        ${question.word.synonyms ? `
                            <div class="synonyms-label">Đồng nghĩa</div>
                            <div class="synonyms-list">${question.word.synonyms}</div>
                        ` : `<div class="synonyms-prompt">${question.question}</div>`}
                    </div>
                    ${question.word.image ? `
                        <div class="question-image-col">
                            <img src="${question.word.image}" class="word-image" alt="${question.word.en}"
                                 class="js-hide-on-error" data-hide-closest=".question-image-col">
                        </div>
                    ` : ''}
                </div>

                <div class="choices-container word-type-choices">
                    ${question.options.map((option, index) => {
                        const label = labelOf(option);
                        // Chỉ hiện dòng phụ khi nó KHÁC nhãn chính. Type lạ
                        // (không có trong bảng) thì nhãn = chính nó, in cả hai
                        // là ra "数词 数词" — đúng lỗi đã gặp.
                        const sub = label === option ? '' :
                            `<span class="type-english">${option}</span>`;
                        return `
                        <button class="choice-btn word-type-btn" data-index="${index}">
                            <span class="type-label">${label}</span>
                            ${sub}
                        </button>`;
                    }).join('')}
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

        this.showWordInfo(question.word);

        afterAnswer(this, 'word-type-check');
    },

    showWordInfo(word) {
        if (!word.example) return;

        const container = document.querySelector('.question-container');
        if (!container) return;

        // Dùng khối ví dụ CHUNG: câu + nút Dịch + nút Nghe + phiên âm.
        //
        // Trước đây mỗi chế độ tự dựng, và chỉ có nút loa — người học đọc được
        // mặt chữ nhưng không hiểu nghĩa và không biết đọc thế nào, mà câu ví
        // dụ vốn là chỗ dạy CÁCH DÙNG từ, tức chỗ cần hiểu nhất.
        const infoPanel = document.createElement('div');
        const prompt = container.querySelector('.question-prompt');
        if (prompt) {
            container.insertBefore(infoPanel, prompt);
        } else {
            container.appendChild(infoPanel);
        }

        chenViDu(infoPanel, word.example, { modeObj: this });
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
        EventBus.off(GameEvents.HINT_USED, this._onHint);
        this._onHint = null;
        this.questions = [];
        this.currentIndex = 0;
        this.selectedAnswer = null;
        this.hintUsed = false;
    }
};

