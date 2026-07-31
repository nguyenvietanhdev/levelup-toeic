import { GameLogic, wordPk, ttsLang, vocabLang } from '@game/gameLogic.js';
import { GameState } from '@game/state.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { Notification } from '@ui/Toaster.jsx';

export const PronunciationMode = {

    config: null,
    questions: [],
    currentIndex: 0,
    currentAttempts: 0,
    recognition: null,
    isListening: false,
    currentWord: null,
    wordCompleted: false,

    _isZh() {
        return vocabLang() === 'zh';
    },

    _recogLang() {
        return this._isZh() ? 'zh-CN' : 'en-US';
    },

    async start(config) {
        this.config = config;
        this.currentIndex = 0;

        if (!this.checkBrowserSupport()) {
            Notification.show({
                type: 'error',
                title: 'Không hỗ trợ',
                message: 'Trình duyệt của bạn không hỗ trợ nhận dạng giọng nói. Vui lòng sử dụng Chrome hoặc Edge.',
                duration: 5000
            });
            PracticeManager.exitPractice();
            return;
        }

        this.initSpeechRecognition();

        await this.generateQuestions();

        if (this.questions.length > 0) {
            this.showQuestion();
        }
    },

    checkBrowserSupport() {
        return ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);
    },

    initSpeechRecognition() {
        this._SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this._resultHandled = false;
        // Không tạo recognition ngay — tạo mới mỗi lần startListening()
        // để đảm bảo lang luôn đúng và tránh state stale giữa các lần gọi.
    },

    _createRecognition() {
        if (this.recognition) {
            try { this.recognition.abort(); } catch (_) {}
            this.recognition.onstart = null;
            this.recognition.onresult = null;
            this.recognition.onend = null;
            this.recognition.onerror = null;
        }

        const rec = new this._SpeechRecognition();
        rec.lang = this._recogLang();
        rec.continuous = false;
        rec.interimResults = false;
        rec.maxAlternatives = 5;

        rec.onstart = () => {
            this.isListening = true;
            this._resultHandled = false;
            this.updateMicButton(true);
        };

        rec.onresult = (event) => {
            if (this._resultHandled) return;

            const result = event.results[0];
            const transcript = result[0].transcript.trim();
            const isFinal = result.isFinal;

            if (isFinal) {
                this._resultHandled = true;
                const results = Array.from(result);
                this.handleRecognitionResult(transcript, results);
            }
        };

        rec.onend = () => {
            this.isListening = false;
            this.updateMicButton(false);
            // Nếu onresult không fire → nói không rõ/ngôn ngữ sai → tính 1 lần thử thất bại
            if (!this._resultHandled && !this.wordCompleted) {
                this.handleRecognitionResult('', []);
            }
        };

        rec.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this._resultHandled = true;
            this.isListening = false;
            this.updateMicButton(false);

            if (event.error === 'no-speech') {
                // no-speech: user chưa nói gì → không tính lượt
                this._resultHandled = false;
                Notification.show({ type: 'warning', title: 'Không nghe thấy', message: 'Vui lòng nói rõ hơn và thử lại', duration: 2000 });
            } else if (event.error === 'not-allowed') {
                Notification.show({ type: 'error', title: 'Không có quyền truy cập', message: 'Vui lòng cho phép truy cập microphone', duration: 3000 });
            } else if (event.error === 'language-not-supported') {
                Notification.show({ type: 'error', title: 'Ngôn ngữ không hỗ trợ', message: 'Trình duyệt không nhận dạng được ngôn ngữ này', duration: 3000 });
            }
        };

        this.recognition = rec;
    },

    async generateQuestions() {
        const words = GameLogic.getRandomWords(this.config.questionsPerRound);
        this.questions = words.map(word => ({
            word,
            wordPk:   wordPk(word),
            wordVn:   word.vn,
            wordType: word.type || '',
        }));
    },

    showQuestion() {
        if (this.currentIndex >= this.questions.length) {
            this.finish();
            return;
        }

        const question = this.questions[this.currentIndex];
        this.currentWord = question.wordPk;
        this.currentAttempts = 0;
        this.wordCompleted = false;

        PracticeManager.updateProgress(
            this.currentIndex + 1,
            this.questions.length
        );

        this.render(question);

        setTimeout(() => {
            GameLogic.speakWord(question.wordPk, ttsLang());
        }, 500);
    },

    render(question) {
        const container = document.getElementById('practice-content');
        if (!container) return;

        const isZh = this._isZh();
        const langLabel = isZh ? 'tiếng Trung' : 'tiếng Anh';
        const langFlag  = isZh ? '🇨🇳' : '🇬🇧';

        container.innerHTML = `
            <div class="question-container pronunciation-container" style="display:flex;flex-direction:column;gap:16px;padding:16px 12px;">

                <!-- Word card + mic side by side -->
                <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">

                    <!-- Word info -->
                    <div class="pronunciation-word-display" style="flex:1;min-width:0;">
                        <div class="word-to-pronounce" style="padding:16px 20px;">
                            <div class="word-text" id="word-text-speak" title="Nhấn để nghe phát âm"
                                style="cursor:pointer;${isZh ? 'font-size:2em;letter-spacing:4px;' : 'font-size:1.8em;'};margin-bottom:4px;">
                                ${question.wordPk}
                                <i class="fas fa-volume-up" style="font-size:0.4em;opacity:0.5;margin-left:6px;"></i>
                            </div>
                            ${question.word.phonetic ? `<div style="color:var(--text-secondary);font-size:0.85em;margin-bottom:6px;">[${question.word.phonetic}]</div>` : ''}
                            <div class="word-meaning" style="margin-top:4px;">
                                <span class="word-type-badge">${question.wordType}</span>
                                <span class="word-translation">${question.wordVn}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Mic + status + attempts + replay stacked -->
                    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;flex-shrink:0;">
                        <button class="mic-button" id="mic-btn" title="Click để phát âm" style="width:72px;height:72px;font-size:1.6em;">
                            <i class="fas fa-microphone"></i>
                        </button>
                        <div class="mic-status" id="mic-status" style="font-size:0.75em;text-align:center;max-width:120px;">
                            Click mic để bắt đầu
                        </div>
                        <div id="attempts-dots" style="display:flex;gap:6px;align-items:center;">
                            ${Array(this.config.maxAttempts).fill(0).map((_, i) =>
                                `<span class="attempt-dot ${i < this.currentAttempts ? 'used' : ''}"></span>`
                            ).join('')}
                        </div>
                        <button class="btn btn-secondary" id="replay-btn" style="font-size:0.85em;padding:6px 14px;margin-top:2px;">
                            <i class="fas fa-volume-up"></i> Nghe lại
                        </button>
                        <span style="font-size:0.72em;color:var(--text-secondary);text-align:center;max-width:130px;">
                            Phát âm ${langLabel} ${langFlag}<br>tối đa ${this.config.maxAttempts} lần thử
                        </span>
                    </div>
                </div>

                <div class="recognition-result" id="recognition-result" style="display:none;margin-top:4px;"></div>
            </div>
        `;

        this.attachListeners();
    },

    attachListeners() {
        const micBtn = document.getElementById('mic-btn');
        const replayBtn = document.getElementById('replay-btn');
        const toolbarSkipBtn = document.getElementById('skip-btn');

        micBtn?.addEventListener('click', () => this.toggleListening());
        replayBtn?.addEventListener('click', () => this.replayWord());
        document.getElementById('word-text-speak')?.addEventListener('click', () => {
            GameLogic.speakWord(this.currentWord, ttsLang());
        });

        // Toolbar skip-btn → dùng PronunciationMode.skipQuestion thay vì PracticeManager.skipQuestion
        if (toolbarSkipBtn) toolbarSkipBtn.onclick = () => this.skipQuestion();
    },

    toggleListening() {
        if (this.isListening) {
            try { this.recognition?.stop(); } catch (_) {}
        } else {
            if (this.currentAttempts >= this.config.maxAttempts) {
                Notification.show({
                    type: 'warning',
                    title: 'Hết lượt thử',
                    message: 'Đang chuyển sang câu tiếp theo...',
                    duration: 2000
                });
                return;
            }
            this.startListening();
        }
    },

    startListening() {
        try {
            this._createRecognition(); // tạo mới mỗi lần — lang luôn đúng
            this.recognition.start();
            const micStatus = document.getElementById('mic-status');
            if (micStatus) {
                micStatus.textContent = `Đang nghe... Hãy nói ${this._isZh() ? 'tiếng Trung' : 'tiếng Anh'}!`;
                micStatus.className = 'mic-status listening';
            }
        } catch (error) {
            console.error('Failed to start recognition:', error);
            Notification.show({
                type: 'error',
                title: 'Lỗi',
                message: 'Không thể khởi động nhận dạng giọng nói',
                duration: 2000
            });
        }
    },

    updateMicButton(listening) {
        const micBtn = document.getElementById('mic-btn');
        if (!micBtn) return;

        if (listening) {
            micBtn.classList.add('listening');
            micBtn.innerHTML = '<i class="fas fa-stop"></i>';
        } else {
            micBtn.classList.remove('listening');
            micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        }
    },

    handleRecognitionResult(transcript, alternatives) {
        if (this.wordCompleted) return;
        this.currentAttempts++;
        this.updateAttemptsDisplay();

        const isZh = this._isZh();
        const normalize = (t) => isZh
            ? t.replace(/[\s　　-〿＀-￯.,!?;:'"。！？，、：；""'']/g, '')
            : t.toLowerCase().replace(/[.,!?;:'"]/g, '').replace(/\s+/g, ' ').trim();

        const normalizedTranscript = normalize(transcript);
        const normalizedTarget    = normalize(this.currentWord);

        const isCorrect = normalizedTranscript === normalizedTarget;
        const isAlternativeCorrect = alternatives.some(alt =>
            normalize(alt.transcript.trim()) === normalizedTarget
        );

        const finalCorrect = isCorrect || isAlternativeCorrect;

        this.showRecognitionResult(transcript, finalCorrect);

        if (finalCorrect) {
            this.handleCorrectAnswer();
        } else {
            this.handleWrongAnswer(transcript);
        }
    },

    showRecognitionResult(transcript, isCorrect) {
        const resultDiv = document.getElementById('recognition-result');
        if (!resultDiv) return;

        resultDiv.style.display = 'block';
        resultDiv.className = `recognition-result ${isCorrect ? 'correct' : 'wrong'}`;
        resultDiv.innerHTML = `
            <div class="result-icon">
                <i class="fas fa-${isCorrect ? 'check-circle' : 'times-circle'}"></i>
            </div>
            <div class="result-text">
                <strong>${isCorrect ? 'Chính xác!' : 'Chưa đúng'}</strong><br>
                Bạn nói: "<span class="heard-text">${transcript}</span>"
            </div>
        `;

        const micStatus = document.getElementById('mic-status');
        if (micStatus) {
            micStatus.textContent = isCorrect ? '✓ Chính xác!' : '✗ Thử lại';
            micStatus.className = `mic-status ${isCorrect ? 'correct' : 'wrong'}`;
        }
    },

    updateAttemptsDisplay() {
        const attemptsDotsContainer = document.getElementById('attempts-dots');
        if (!attemptsDotsContainer) return;

        attemptsDotsContainer.innerHTML = Array(this.config.maxAttempts)
            .fill(0)
            .map((_, i) =>
                `<span class="attempt-dot ${i < this.currentAttempts ? 'used' : ''}"></span>`
            )
            .join('');
    },

    handleCorrectAnswer() {
        this.wordCompleted = true;
        if (this.recognition && this.isListening) this.recognition.stop();
        const question = this.questions[this.currentIndex];

        const micBtn = document.getElementById('mic-btn');
        if (micBtn) micBtn.disabled = true;

        PracticeManager.recordAnswer(true, question.word);

        if (GameState.state.settings.soundEnabled) {
            Utils.playSound(Config.sounds.correct, 0.5);
        }

        Notification.show({
            type: 'success',
            title: '🎉 Chính xác!',
            message: 'Phát âm của bạn rất tốt!',
            duration: 2000
        });

        setTimeout(() => {
            this.nextQuestion();
        }, 2500);
    },

    handleWrongAnswer(_transcript) {
        const question = this.questions[this.currentIndex];

        if (GameState.state.settings.soundEnabled) {
            Utils.playSound(Config.sounds.wrong, 0.3);
        }

        if (this.currentAttempts >= this.config.maxAttempts) {
            this.wordCompleted = true;
            if (this.recognition && this.isListening) this.recognition.stop();
            const micBtn = document.getElementById('mic-btn');
            if (micBtn) micBtn.disabled = true;

            PracticeManager.recordAnswer(false, question.word);

            Notification.show({
                type: 'error',
                title: '❌ Hết lượt thử',
                message: `Đáp án đúng: "${this.currentWord}"`,
                duration: 3000
            });

            setTimeout(() => {
                GameLogic.speakWord(this.currentWord, ttsLang());
            }, 500);

            setTimeout(() => {
                this.nextQuestion();
            }, 3500);
        } else {
            const remainingAttempts = this.config.maxAttempts - this.currentAttempts;
            Notification.show({
                type: 'warning',
                title: 'Chưa đúng',
                message: `Còn ${remainingAttempts} lần thử. Hãy thử lại!`,
                duration: 2000
            });

            const micStatus = document.getElementById('mic-status');
            if (micStatus) {
                micStatus.textContent = `Còn ${remainingAttempts} lần thử - Click mic để thử lại`;
                micStatus.className = 'mic-status';
            }
        }
    },

    replayWord() {
        GameLogic.speakWord(this.currentWord, ttsLang());

        Notification.show({
            type: 'info',
            title: '🔊 Phát lại',
            message: 'Đang phát âm từ...',
            duration: 1000
        });
    },

    skipQuestion() {
        const question = this.questions[this.currentIndex];

        PracticeManager.recordAnswer(false, question.word);

        Notification.show({
            type: 'info',
            title: 'Đã bỏ qua',
            message: `Đáp án: "${this.currentWord}"`,
            duration: 2000
        });

        setTimeout(() => {
            GameLogic.speakWord(this.currentWord, ttsLang());
        }, 500);

        setTimeout(() => {
            this.nextQuestion();
        }, 2500);
    },

    nextQuestion() {
        this.currentIndex++;
        this.showQuestion();
    },

    finish() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }

        PracticeManager.complete();
    },

    cleanup() {
        if (this.recognition) {
            try { this.recognition.abort(); } catch (_) {}
            this.recognition.onstart = null;
            this.recognition.onend = null;
            this.recognition.onresult = null;
            this.recognition.onerror = null;
            this.recognition = null;
        }

        this.questions = [];
        this.currentIndex = 0;
        this.currentAttempts = 0;
        this.isListening = false;
        this.currentWord = null;
        this._resultHandled = false;
    }
};
