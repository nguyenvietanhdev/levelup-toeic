import { GameLogic } from '@game/gameLogic.js';
import { GameState } from '@game/state.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { Notification } from '@ui/Toaster.jsx';
import { Modal } from '@ui/Modal.jsx';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import { FavoritesAPI } from '@api/favorites.js';

export const Flashcard = {

    config: null,
    words: [],
    currentIndex: 0,
    isFlipped: false,
    knownWords: [],
    unknownWords: [],
    batchOffset: 0,   // sequential cursor — advanced by "Học tiếp"

    async start(config) {
        this.config = config;
        this.currentIndex = 0;
        this.isFlipped = false;
        this.knownWords = [];
        this.unknownWords = [];
        this.batchOffset = 0;   // fresh entry → first batch

        await this.loadWords();

        if (this.words.length === 0) {
            Notification.show({
                type: 'warning',
                message: 'Không tìm thấy từ vựng phù hợp cho phần luyện tập này.'
            });
            PracticeManager.complete();
            return;
        }

        this.showCard();
    },

    // "Học tiếp": move the cursor forward by one batch and load the NEXT
    // set (sequential) instead of repeating. Keeps config + batchOffset.
    async continueNextBatch() {
        // Advance by however many cards this batch actually had (respects
        // the "số câu" setting / 'auto'); fall back to 20 if empty.
        this.batchOffset += (this.words.length || 20);
        this.currentIndex = 0;
        this.isFlipped = false;
        this.knownWords = [];
        this.unknownWords = [];

        await this.loadWords();

        if (this.words.length === 0) {
            Notification.show({
                type: 'warning',
                message: 'Không tìm thấy từ vựng phù hợp cho phần luyện tập này.'
            });
            PracticeManager.complete();
            return;
        }

        this.showCard();
    },

    async loadWords() {
        const selectedPart = GameState.state?.settings?.selectedPart || null;
        const requestCount = selectedPart ? 9999 : (this.config.questionsPerRound || 20);
        const words = await PartSelector.getWordsForPractice(requestCount, this.batchOffset);

        // getWordsForPractice already applies the "số câu" setting
        // (questionsPerSession: a number, or 'auto' = whole pool) and the
        // sequential offset — don't re-cap here (that forced 20).
        this.words = Array.isArray(words) ? words : [];
    },

    showCard() {
        if (this.currentIndex >= this.words.length) {
            this.finish();
            return;
        }

        const word = this.words[this.currentIndex];
        this.isFlipped = false;

        PracticeManager.updateProgress(
            this.currentIndex + 1,
            this.words.length
        );
        PracticeManager.setCurrentWord(word);

        this.render(word);
    },

    render(word) {
        const container = document.getElementById('practice-content');
        if (!container) return;

        // reversed = VN→EN: mặt trước hiện nghĩa tiếng Việt, mặt sau hiện từ
        // tiếng Anh + phiên âm. Ảnh giữ nguyên ở mặt trước (không phụ thuộc ngôn ngữ).
        const reversed = GameLogic.isReversed();
        const meaning = word.vi || word.vn || '';
        const frontMain = reversed ? meaning : word.en;
        const frontBadge = reversed ? 'VI' : 'EN';
        const backBadge = reversed ? 'EN' : 'VI';

        const extrasHtml = `
                                ${word.example ? `
                                    <div class="card-example">
                                        <strong>Ví dụ:</strong>
                                        <p>${word.example}</p>
                                    </div>
                                ` : ''}

                                ${word.synonyms ? `
                                    <div class="card-synonyms">
                                        <strong>Từ đồng nghĩa:</strong>
                                        <p>${word.synonyms}</p>
                                    </div>
                                ` : ''}`;

        container.innerHTML = `
            <div class="flashcard-container">
                <div class="flashcard-progress">
                    <div class="progress-indicator">
                        <span class="progress-current">${this.currentIndex + 1}</span>
                        <span class="progress-separator">/</span>
                        <span class="progress-total">${this.words.length}</span>
                    </div>
                    <div class="progress-stats">
                        <span class="stat-known">
                            Known ${this.knownWords.length}
                        </span>
                        <span class="stat-unknown">
                            Unknown ${this.unknownWords.length}
                        </span>
                    </div>
                </div>

                <div class="flashcard-stage">
                <div class="flashcard" id="flashcard">
                    <div class="flashcard-inner" id="flashcard-inner">
                        <div class="flashcard-front">
                            <div class="card-corner-badge">${frontBadge}</div>
                            <div class="card-content card-content--split">
                                ${word.image ? `
                                    <div class="card-image-col">
                                        <img src="${word.image}" class="card-image" alt="${word.en}"
                                             onerror="this.closest('.card-image-col').style.display='none'">
                                    </div>
                                ` : ''}
                                <div class="card-text-col">
                                    <h2 class="card-word">${frontMain}</h2>
                                    ${!reversed ? `<p class="card-phonetic">${word.phonetic || ''}</p>` : ''}
                                    <div class="card-type-row">
                                        <span class="card-type">${word.type || ''}</span>
                                        <button class="card-fav-btn${this._isFavorite(word.en) ? ' active' : ''}" id="fav-btn" title="${this._isFavorite(word.en) ? 'Bỏ yêu thích' : 'Thêm yêu thích'}">
                                            <i class="${this._isFavorite(word.en) ? 'fas' : 'far'} fa-heart"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div class="card-hint">
                                Click / Space để lật thẻ
                            </div>
                        </div>

                        <div class="flashcard-back">
                            <div class="card-corner-badge">${backBadge}</div>
                            <div class="card-content">
                                ${reversed ? `
                                    <h2 class="card-meaning">${word.en}</h2>
                                    ${word.phonetic ? `<p class="card-phonetic">${word.phonetic}</p>` : ''}
                                ` : `
                                    <h2 class="card-meaning">${meaning}</h2>
                                `}
                                ${extrasHtml}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flashcard-actions">
                    <button class="rating-btn btn-unknown" id="unknown-btn">
                        <span>Chưa biết</span>
                        </button>
                    <button class="flashcard-btn flip-btn" id="flip-btn">
                        <span>Lật thẻ</span>
                    </button>
                    <button class="flashcard-btn pronounce-btn" id="pronounce-btn">
                        <span>Phát âm</span>
                    </button>
                    <button class="rating-btn btn-known" id="known-btn">
                        <span>Đã biết</span>
                    </button>
                </div>
                </div>

            </div>
        `;

        this.attachListeners(word);

        const inner = document.getElementById('flashcard-inner');
        if (inner && this.isFlipped) {
            setTimeout(() => this.pronounce(word.en), 300);
        }

        // Khi đảo chiều, mặt trước là tiếng Việt → không tự phát âm từ tiếng Anh ở đây.
        if (!this.isFlipped && GameState.state.settings.autoPronunciation && !reversed) {
            setTimeout(() => this.pronounce(word.en), 500);
        }
    },

    attachListeners(word) {
        const flipBtn = document.getElementById('flip-btn');
        flipBtn?.addEventListener('click', () => {
            this.flipCard();
        });

        const flashcard = document.getElementById('flashcard');
        flashcard?.addEventListener('click', () => {
            this.flipCard();
        });

        const pronounceBtn = document.getElementById('pronounce-btn');
        pronounceBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.pronounce(word.en);
        });

        const knownBtn = document.getElementById('known-btn');
        knownBtn?.addEventListener('click', () => {
            this.markAsKnown(word);
        });

        const unknownBtn = document.getElementById('unknown-btn');
        unknownBtn?.addEventListener('click', () => {
            this.markAsUnknown(word);
        });

        const favBtn = document.getElementById('fav-btn');
        favBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleFavorite(word);
        });

        if (!this.boundKeyboardHandler) {
            this.boundKeyboardHandler = this.handleKeyboard.bind(this);
        }
        document.addEventListener('keydown', this.boundKeyboardHandler);
    },

    handleKeyboard(e) {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            this.flipCard();
        } else if (e.key === 'ArrowLeft' || e.key === '1') {
            this.markAsUnknown(this.words[this.currentIndex]);
        } else if (e.key === 'ArrowRight' || e.key === '2') {
            this.markAsKnown(this.words[this.currentIndex]);
        } else if (e.key === 'p' || e.key === 'P') {
            this.pronounce(this.words[this.currentIndex].en);
        }
    },

    flipCard() {
        const inner = document.getElementById('flashcard-inner');
        if (!inner) return;

        this.isFlipped = !this.isFlipped;

        if (this.isFlipped) {
            inner.classList.add('flipped');
            const currentWord = this.words[this.currentIndex];
            setTimeout(() => {
                this.pronounce(currentWord.en);
            }, 350);
            setTimeout(() => {
                const chineseSection = document.querySelector('.card-chinese-section');
                if (chineseSection) chineseSection.classList.add('chinese-collapsed');
            }, 2000);
        } else {
            inner.classList.remove('flipped');
            const chineseSection = document.querySelector('.card-chinese-section');
            if (chineseSection) chineseSection.classList.remove('chinese-collapsed');
        }
    },

    markAsKnown(word) {
        this.knownWords.push(word);
        PracticeManager.recordAnswer(true, word);
        GameState.learnWord(word.en);

        if (GameState.state.settings.soundEnabled) {
            Utils.playSound(Config.sounds.correct, 0.3);
        }

        this.showFeedback('known');

        setTimeout(() => {
            this.nextCard();
        }, 500);
    },

    pronounce(text) {
        if (!text) return;
        GameLogic.speakWord(text, 'en-US');

        const btn = document.getElementById('pronounce-btn');
        if (btn) {
            btn.classList.add('active');
            setTimeout(() => btn.classList.remove('active'), 500);
        }
    },

    markAsUnknown(word) {
        this.unknownWords.push(word);
        PracticeManager.recordAnswer(false, word);

        if (GameState.state.settings.soundEnabled) {
            Utils.playSound(Config.sounds.wrong, 0.3);
        }

        this.showFeedback('unknown');

        setTimeout(() => {
            this.nextCard();
        }, 500);
    },

    showFeedback(type) {
        const flashcard = document.getElementById('flashcard');
        if (!flashcard) return;

        if (type === 'known') {
            flashcard.classList.add('feedback-known');
            setTimeout(() => {
                flashcard.classList.remove('feedback-known');
            }, 500);
        } else {
            flashcard.classList.add('feedback-unknown');
            setTimeout(() => {
                flashcard.classList.remove('feedback-unknown');
            }, 500);
        }
    },

    nextCard() {
        if (this.boundKeyboardHandler) {
            document.removeEventListener('keydown', this.boundKeyboardHandler);
        }

        this.currentIndex++;
        this.showCard();
    },

    async finish() {
        if (this.boundKeyboardHandler) {
            document.removeEventListener('keydown', this.boundKeyboardHandler);
        }

        // Chạy side-effect cuối session (lịch sử, modeStats, quest, leaderboard,
        // achievements) qua đường unified — trước đây Flashcard chỉ gọi
        // showSummary() nên hoàn toàn bỏ qua → bài thống kê không thấy
        // Flashcard, quest/achievement không tăng.
        let results = null;
        try { results = await PracticeManager.finalizeSession(); } catch (_) {}

        this.showSummary(results);
    },

    // Dùng CHUNG popup kết quả của PracticeManager (đồng bộ với mọi chế độ khác),
    // chỉ đổi nhãn cho đúng ngữ nghĩa Flashcard + thêm nút riêng.
    showSummary(results) {
        const extraButtons = [
            ...(this.unknownWords.length > 0 ? [{
                text: `Ôn lại ${this.unknownWords.length} từ chưa biết`,
                className: 'btn-warning',
                onClick: () => { Modal.close(); this.reviewUnknown(); },
            }] : []),
            {
                text: 'Học tiếp',
                className: 'btn-secondary',
                onClick: () => { Modal.close(); this.continueNextBatch(); },
            },
        ];

        const opts = {
            title: '🃏 Hoàn thành Flashcard!',
            correctLabel: 'Đã biết',
            wrongLabel: 'Chưa biết',
            accuracyLabel: 'Độ thuộc',
            extraButtons,
            hideRetry: true, // đã có nút "Ôn lại từ chưa biết" riêng
        };

        if (results) {
            PracticeManager.showResults(
                results.scoreData, results.xpReward, results.coinsReward,
                results.isPerfect, results.gemsBonus, opts,
            );
            return;
        }

        // Session đã kết thúc trước đó (vd học tiếp batch) → vẫn hiện kết quả cùng layout.
        PracticeManager.showResults({ totalScore: 0 }, 0, 0, this.unknownWords.length === 0, 0, opts);
    },

    reviewUnknown() {
        this.words = [...this.unknownWords];
        this.currentIndex = 0;
        this.knownWords = [];
        this.unknownWords = [];

        Notification.show({
            type: 'info',
            title: 'Ôn tập',
            message: `Bắt đầu ôn lại ${this.words.length} từ chưa biết`,
        });

        this.showCard();
    },

    _isFavorite(en) {
        const favs = GameState.state?.progress?.favoriteWords || [];
        return favs.some(w => (w.en || w.word) === en);
    },

    _toggleFavorite(word) {
        const favs = GameState.state?.progress?.favoriteWords || [];
        const isFav = this._isFavorite(word.en);
        if (!GameState.state.progress) GameState.state.progress = {};
        if (isFav) {
            GameState.state.progress.favoriteWords = favs.filter(w => (w.en || w.word) !== word.en);
            FavoritesAPI.remove(word.en).catch(() => {});
        } else {
            const entry = { en: word.en, vn: word.vn || word.vi || '', phonetic: word.phonetic || '', synonyms: word.synonyms || '', part: word.part || '' };
            GameState.state.progress.favoriteWords = [...favs, entry];
            FavoritesAPI.add(entry).catch(() => {});
        }
        GameState.save?.();
        // Cập nhật trạng thái nút mà không re-render toàn bộ card
        const btn = document.getElementById('fav-btn');
        if (btn) {
            const nowFav = !isFav;
            btn.classList.toggle('active', nowFav);
            btn.title = nowFav ? 'Bỏ yêu thích' : 'Thêm yêu thích';
            btn.querySelector('i').className = nowFav ? 'fas fa-heart' : 'far fa-heart';
        }
        Notification.show({ type: isFav ? 'info' : 'success', message: isFav ? `Đã bỏ "${word.en}" khỏi yêu thích` : `Đã thêm "${word.en}" vào yêu thích`, duration: 1500 });
    },

    cleanup() {
        if (this.boundKeyboardHandler) {
            document.removeEventListener('keydown', this.boundKeyboardHandler);
            this.boundKeyboardHandler = null;
        }
        this.words = [];
        this.currentIndex = 0;
        this.knownWords = [];
        this.unknownWords = [];
        this.isFlipped = false;
    }
};

