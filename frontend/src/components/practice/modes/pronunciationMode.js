import { GameLogic, wordPk, ttsLang, vocabLang } from '@game/gameLogic.js';
import { GameState } from '@game/state.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { Notification } from '@ui/Toaster.jsx';
import { scoreAttempt, feedbackMessage, scoreSentence, sentenceFeedback } from './pronunciationScoring.js';

export const PronunciationMode = {

    /**
     * Đệm sau khi mẫu phát âm kết thúc, trước khi cho ghi âm lại.
     *
     * Loa ngoài còn vang một chút sau khi file audio kết thúc, và bộ nhận dạng
     * bắt được cả phần đuôi đó. 400ms đủ để tiếng tắt hẳn mà người dùng gần như
     * không thấy phải chờ.
     */
    ECHO_GUARD_MS: 400,

    config: null,
    questions: [],
    currentIndex: 0,
    currentAttempts: 0,
    recognition: null,
    isListening: false,
    currentWord: null,
    wordCompleted: false,

    /**
     * Đang phát mẫu phát âm ra loa hay không.
     *
     * Khi `true` thì KHÔNG cho ghi âm: người dùng không đeo tai nghe thì mic thu
     * được chính tiếng loa, bộ nhận dạng nghe giọng TTS đọc "gate" và chấm là
     * người học nói đúng — được điểm mà chưa hề mở miệng.
     */
    _speaking: false,
    _speakFallback: null,

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
            // `complete()` chứ KHÔNG phải `exitPractice()`: hàm đó chưa từng tồn
            // tại trên PracticeManager. Gọi trần nó ném TypeError ngay giữa
            // start(), không câu nào render — mà header "Phát âm 1/10" và đồng hồ
            // đã dựng từ trước nên vẫn chạy. Nhìn màn hình y như bài luyện đang
            // mở, chỉ là trống trơn. Firefox không có Web Speech API nên nhánh
            // này chạy mỗi lần vào chế độ Phát âm bằng Firefox.
            PracticeManager.complete();
            return;
        }

        this.initSpeechRecognition();

        await this.generateQuestions();

        // Không có từ thì PHẢI báo và thoát. Trước đây chỉ có `if (length > 0)`
        // mà không có else: không từ nào là không render gì, không báo gì, không
        // thoát — màn hình trắng trơn, console sạch, người dùng ngồi nhìn.
        if (this.questions.length === 0) {
            PracticeManager.complete();
            Notification.show({
                type: 'warning',
                title: 'Không có từ vựng',
                message: 'Bộ từ đang chọn không có từ nào. Thử đổi chủ đề hoặc bỏ bớt bộ lọc cấp độ.',
                duration: 4000,
            });
            return;
        }
        this.showQuestion();
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
        // Bật kết quả tạm để hiện chữ NGAY khi người học đang nói. Tắt nó thì
        // màn hình đứng im 1–2 giây sau khi nói xong (thời gian Google chốt kết
        // quả cuối) — khoảng lặng đó khiến người dùng tưởng mic không ăn và bấm
        // lại, huỷ mất lượt đang nhận.
        rec.interimResults = true;
        rec.maxAlternatives = 5;

        rec.onstart = () => {
            this.isListening = true;
            this._resultHandled = false;
            this.updateMicButton(true);
        };

        rec.onresult = (event) => {
            if (this._resultHandled) return;

            const result = event.results[event.resultIndex] ?? event.results[0];
            if (!result) return;
            const transcript = result[0].transcript.trim();

            if (!result.isFinal) {
                // Kết quả tạm: chỉ hiện chữ cho người học thấy máy đang nghe được
                // gì. TUYỆT ĐỐI không chấm ở đây — bản tạm thay đổi liên tục
                // trong lúc nói, chấm sớm là ăn ngay một lượt thử oan.
                this.showInterim(transcript);
                return;
            }

            this._resultHandled = true;
            this.handleRecognitionResult(transcript, Array.from(result));
        };

        rec.onend = () => {
            this.isListening = false;
            this.updateMicButton(false);
            // Không nghe được gì thì KHÔNG trừ lượt — chỉ có 3 lượt, mà lỡ tay bấm
            // mic rồi chưa kịp nói là mất luôn 1/3 dù chưa phát âm sai chữ nào.
            // Phạt phải dành cho lỗi phát âm, không phải cho việc mic không bắt
            // được tiếng. Vẫn báo để người học biết máy chưa nghe thấy gì.
            if (!this._resultHandled && !this.wordCompleted) {
                const el = document.getElementById('mic-status');
                if (el) {
                    el.textContent = 'Chưa nghe thấy gì — bấm mic thử lại';
                    el.className = 'mic-status';
                }
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
        // Lấy từ qua PartSelector giống 15 chế độ khác.
        //
        // Trước đây dùng GameLogic.getRandomWords(), hàm này đọc thẳng
        // `vocabularyData` và KHÔNG biết tới bộ chủ đề đang chọn. Chọn chủ đề
        // 动物 rồi vào luyện phát âm thì ra từ của chủ đề khác, hoặc không ra từ
        // nào cả — mà không có dấu hiệu gì báo là đã bỏ qua bộ lọc.
        const selectedPart = GameState.state?.settings?.selectedPart || null;
        const requestCount = selectedPart ? 9999 : (this.config?.questionsPerRound || 10);
        const all = await PartSelector.getWordsForPractice(requestCount);
        const words = Array.isArray(all) ? all.slice(0, this.config?.questionsPerRound || 10) : [];

        // Chế độ ĐỌC CÂU: đọc cả câu ví dụ thay vì một từ.
        //
        // Bật cho CẢ HAI ngôn ngữ. Bản đầu chặn tiếng Trung vì `scoreSentence`
        // tách theo khoảng trắng, mà câu tiếng Trung không có — cả câu tính là
        // một "từ", sai một chữ thành sai cả câu. Giờ hàm đó tách theo CHỮ khi
        // `isZh`, nên chỉ ra được đúng chữ nào chưa rõ.
        //
        // Bỏ qua câu quá dài: đọc liền 25 từ thì Web Speech hay tự ngắt giữa
        // chừng, và người học sai một từ ở cuối phải đọc lại từ đầu.
        const docCau = GameState.state?.settings?.pronounceSentence === true;

        this.questions = words.map(word => {
            const cau = docCau ? String(word.example || '').trim() : '';
            // Đơn vị đo khác nhau: 18 TỪ tiếng Anh, 30 CHỮ tiếng Trung. Đo câu
            // tiếng Trung bằng số "từ" thì mọi câu đều ra 1 và không câu nào bị
            // loại, kể cả câu dài 80 chữ.
            const dungCau = cau && (this._isZh()
                ? [...cau.replace(/\s/g, '')].length <= 30
                : cau.split(/\s+/).length <= 18);
            return {
                word,
                wordPk:   wordPk(word),
                wordVn:   word.vn,
                wordType: word.type || '',
                // `cauDoc` rỗng nghĩa là câu này vẫn đọc theo TỪ — từ không có
                // câu ví dụ, hoặc câu quá dài. Trộn lẫn được: mỗi câu tự quyết.
                cauDoc:   dungCau ? cau : '',
            };
        });
    },

    showQuestion() {
        if (this.currentIndex >= this.questions.length) {
            this.finish();
            return;
        }

        const question = this.questions[this.currentIndex];
        this.currentWord = question.wordPk;
        // Đích ĐỌC có thể là câu, trong khi `currentWord` vẫn là từ — hai thứ
        // khác nhau: `currentWord` còn dùng cho thông báo đáp án và phát mẫu.
        this.cauDoc = question.cauDoc || '';
        this.currentAttempts = 0;
        this.wordCompleted = false;

        PracticeManager.updateProgress(
            this.currentIndex + 1,
            this.questions.length
        );

        this.render(question);

        setTimeout(() => {
            this.speakSample(question.cauDoc || question.wordPk);
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

                <!-- Word card + mic side by side.
                     Có class để responsive.css xếp dọc lại trên điện thoại.
                     flex-wrap KHÔNG tự lo được việc đó: thẻ chữ đặt flex:1 với
                     min-width:0 nên nó co được vô hạn và không bao giờ xuống
                     dòng, chỉ bị bóp hẹp dần cho tới khi chữ Hán xếp dọc. -->
                <div class="pronunciation-row" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">

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
                            <!-- Câu cần đọc. Từ ở trên vẫn giữ nguyên: nó là từ
                                 đang học, còn câu chỉ là ngữ cảnh để đọc — bỏ từ
                                 đi thì chế độ này thôi không còn luyện từ vựng. -->
                            ${question.cauDoc ? `
                                <div class="pron-sentence" id="pron-sentence" title="Nhấn để nghe mẫu">
                                    <i class="fas fa-quote-left"></i>
                                    <span>${escapeText(question.cauDoc)}</span>
                                </div>` : ''}
                        </div>
                    </div>

                    <!-- Mic + status + attempts + replay stacked -->
                    <div class="pronunciation-mic-col" style="display:flex;flex-direction:column;align-items:center;gap:8px;flex-shrink:0;">
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
        // Nghe mẫu cả câu: đọc câu dài mà không nghe trước thì người học tự đoán
        // ngữ điệu, và đó là thứ chế độ này định dạy.
        document.getElementById('pron-sentence')
            ?.addEventListener('click', () => this.speakSample(this.cauDoc));
        replayBtn?.addEventListener('click', () => this.replayWord());
        document.getElementById('word-text-speak')?.addEventListener('click', () => {
            this.speakSample(this.currentWord);
        });

        // Toolbar skip-btn → dùng PronunciationMode.skipQuestion thay vì PracticeManager.skipQuestion
        if (toolbarSkipBtn) toolbarSkipBtn.onclick = () => this.skipQuestion();
    },

    /**
     * Phát mẫu phát âm, có KHOÁ MIC trong lúc phát.
     *
     * Vì sao cần: người dùng không đeo tai nghe thì mic thu được chính tiếng loa.
     * Bộ nhận dạng nghe thấy giọng TTS đọc "gate" và chấm là người học nói đúng
     * — được điểm mà chưa hề mở miệng. Không có cách nào phân biệt giọng máy với
     * giọng người ở phía nhận dạng, nên phải chặn ở phía phát: đang phát thì
     * không cho ghi âm, và ai bấm phát giữa lúc đang ghi thì dừng ghi trước.
     *
     * Không dùng khử tiếng vọng của trình duyệt (`echoCancellation`): nó chỉ khử
     * được âm do CHÍNH trang này phát qua WebRTC, còn Web Speech API không cho
     * ta chạm vào luồng âm thanh của nó.
     */
    speakSample(text) {
        if (!text) return;

        // Đang ghi âm mà bấm phát → dừng ghi trước, nếu không hai việc chồng
        // nhau đúng vào tình huống đang muốn tránh.
        if (this.isListening) {
            try { this.recognition?.stop(); } catch (_) {}
        }

        this._speaking = true;
        this._syncMicDisabled();

        // `onEnd` bắn ở CẢ hai đường phát (Google TTS và giọng hệ điều hành),
        // xem `gameLogic.speakWord`. Cộng thêm một khoảng đệm nhỏ: loa ngoài còn
        // vang một chút sau khi file kết thúc.
        // Giọng đọc lấy theo TỪ đang luyện, không theo cả kho: bộ song ngữ có
        // cả chữ Hán lẫn chữ Latin nên quyết theo kho là đọc sai một nửa.
        const tuHienTai = this.questions?.[this.currentIndex]?.word;
        GameLogic.speakWord(text, ttsLang(tuHienTai), () => {
            setTimeout(() => {
                this._speaking = false;
                this._syncMicDisabled();
            }, PronunciationMode.ECHO_GUARD_MS);
        });

        // Chốt chặn cuối: nếu `onEnd` không bao giờ bắn (lỗi mạng, thẻ audio bị
        // treo) thì mic sẽ khoá vĩnh viễn. Mở lại sau một khoảng đủ dài.
        clearTimeout(this._speakFallback);
        this._speakFallback = setTimeout(() => {
            this._speaking = false;
            this._syncMicDisabled();
        }, 15000);
    },

    /** Bật/tắt nút mic theo trạng thái đang phát mẫu. */
    _syncMicDisabled() {
        const micBtn = document.getElementById('mic-btn');
        const micStatus = document.getElementById('mic-status');
        if (!micBtn) return;

        micBtn.disabled = !!this._speaking;
        micBtn.classList.toggle('is-muted-by-audio', !!this._speaking);

        // Nói RÕ vì sao nút không bấm được. Nút mờ đi mà không giải thích thì
        // người dùng tưởng hỏng.
        if (this._speaking) {
            if (micStatus) {
                micStatus.textContent = 'Đang phát mẫu… chờ một chút';
                micStatus.className = 'mic-status';
            }
        } else if (micStatus && micStatus.textContent === 'Đang phát mẫu… chờ một chút') {
            micStatus.textContent = 'Click mic để bắt đầu';
        }
    },

    toggleListening() {
        // Chặn cả ở đây, không chỉ dựa vào `disabled` của nút: còn phím tắt và
        // các lối gọi khác, mà `disabled` chỉ chặn được cú bấm chuột.
        if (this._speaking) return;

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

    /** Hiện chữ máy đang nghe được, theo thời gian thực. Chưa chấm gì cả. */
    showInterim(transcript) {
        const el = document.getElementById('mic-status');
        if (!el || !transcript) return;
        el.textContent = `Nghe: ${transcript}`;
        el.className = 'mic-status listening';
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

        // Chấm qua pronunciationScoring: so `===` tuyệt đối coi `你好` nghe thành
        // `你好吗` (máy tự chèn trợ từ) là SAI hoàn toàn, ngang với nói sai hẳn.
        const alts = (alternatives || []).map(a => a?.transcript?.trim()).filter(Boolean);

        if (this.cauDoc) {
            // Chấm theo TỪNG TỪ. `scoreAttempt` cho cả câu thì sai 1/10 từ vẫn
            // ra ~0.9 và tính "gần đúng" — người học không biết sai từ nào.
            //
            // Ngưỡng đạt 0.8: câu dài nói trượt một từ vẫn nên được đi tiếp,
            // nhưng phản hồi vẫn chỉ đích danh từ đó để lần sau sửa. Bắt phải
            // đúng 100% thì một từ khó chặn cả lượt.
            const cau = scoreSentence(transcript, this.cauDoc, this._isZh());
            const dat = cau.ratio >= 0.8;
            this._lastResult = cau;

            this.showSentenceResult(transcript, dat, cau);
            if (dat) this.handleCorrectAnswer();
            else this.handleWrongAnswer(transcript);
            return;
        }

        const result = scoreAttempt(transcript, alts, this.currentWord, this._isZh());
        this._lastResult = result;

        this.showRecognitionResult(transcript, result.correct, result);

        if (result.correct) {
            this.handleCorrectAnswer();
        } else {
            this.handleWrongAnswer(transcript);
        }
    },

    /**
     * Hiện kết quả đọc CÂU: tô màu từng từ.
     *
     * Danh sách từ xanh/đỏ dạy nhiều hơn một câu chữ — người học nhìn một cái
     * là thấy chỗ nào cần luyện, không phải đọc rồi tự dò lại trong câu.
     */
    showSentenceResult(transcript, dat, cau) {
        const resultDiv = document.getElementById('recognition-result');
        if (!resultDiv) return;

        const tu = cau.words.map(w =>
            `<span class="pron-word${w.ok ? '' : ' is-bad'}">${escapeText(w.word)}</span>`
        ).join(' ');

        resultDiv.style.display = 'block';
        resultDiv.className = `recognition-result ${dat ? 'correct' : 'wrong'}`;
        resultDiv.innerHTML = `
            <div class="result-icon">
                <i class="fas fa-${dat ? 'check-circle' : 'times-circle'}"></i>
            </div>
            <div class="result-text">
                <strong>${escapeText(dat ? 'Đạt!' : 'Chưa đạt')}</strong>
                <div class="pron-words">${tu}</div>
                <div style="margin-top:4px;font-size:0.9em;opacity:0.85;">
                    ${escapeText(sentenceFeedback(cau))}
                </div>
                <div style="margin-top:4px;font-size:0.85em;opacity:0.7;">
                    Máy nghe: "${escapeText(transcript)}"
                </div>
            </div>
        `;

        const micStatus = document.getElementById('mic-status');
        if (micStatus) {
            micStatus.textContent = dat ? '✓ Đạt!' : '✗ Thử lại';
            micStatus.className = `mic-status ${dat ? 'correct' : 'wrong'}`;
        }
    },

    showRecognitionResult(transcript, isCorrect, result = null) {
        const resultDiv = document.getElementById('recognition-result');
        if (!resultDiv) return;

        // "Chưa đúng" không dạy được gì. Nói rõ máy nghe thành cái gì và sai kiểu
        // gì thì người học biết phải sửa gì ở lần sau.
        const detail = result ? feedbackMessage(result, this.currentWord, this._isZh()) : '';
        const title = isCorrect
            ? (result?.near ? 'Gần đúng!' : 'Chính xác!')
            : 'Chưa đúng';

        resultDiv.style.display = 'block';
        resultDiv.className = `recognition-result ${isCorrect ? 'correct' : 'wrong'}`;
        resultDiv.innerHTML = `
            <div class="result-icon">
                <i class="fas fa-${isCorrect ? 'check-circle' : 'times-circle'}"></i>
            </div>
            <div class="result-text">
                <strong>${escapeText(title)}</strong><br>
                Bạn nói: "<span class="heard-text">${escapeText(transcript)}</span>"
                ${detail ? `<div style="margin-top:4px;font-size:0.9em;opacity:0.85;">${escapeText(detail)}</div>` : ''}
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
                this.speakSample(this.currentWord);
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
        this.speakSample(this.currentWord);

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
            this.speakSample(this.currentWord);
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

        // Dọn cờ và timer khoá mic: rời chế độ giữa lúc đang phát mẫu thì
        // `_speaking` còn true, và lần vào sau mic bị khoá ngay từ đầu.
        clearTimeout(this._speakFallback);
        this._speakFallback = null;
        this._speaking = false;

        this.questions = [];
        this.currentIndex = 0;
        this.currentAttempts = 0;
        this.isListening = false;
        this.currentWord = null;
        this._resultHandled = false;
        this._lastResult = null;
    }
};

/** Escape trước khi đưa vào innerHTML — transcript là chuỗi do máy nhận dạng
 *  trả về từ tiếng nói của người dùng, không phải hằng số trong code. */
function escapeText(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
