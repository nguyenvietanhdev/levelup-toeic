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

/**
 * Ba kiểu hỏi, xếp theo ĐỘ KHÓ tăng dần.
 *
 *   choice    — nhìn thấy đáp án đúng trong 4 lựa chọn: chỉ cần NHẬN RA.
 *   truefalse — thấy một nghĩa, quyết định đúng/sai: PHÂN BIỆT.
 *   fill      — không gợi ý gì, tự gõ ra: NHỚ LẠI, khó nhất.
 *
 * Một từ trả lời đúng ở trắc nghiệm chưa chắc gõ ra được — mà đây là chế độ ôn
 * từ ĐÃ SAI, nên cần biết người học thật sự nhớ hay chỉ nhận mặt chữ.
 */
const KIEU_HOI = ['choice', 'truefalse', 'fill'];

/** Nhãn hiện trên thẻ trạng thái, cho biết câu này đang hỏi kiểu gì. */
const NHAN_KIEU = {
    choice: 'Chọn nghĩa',
    truefalse: 'Đúng / Sai',
    fill: 'Gõ từ',
};

/**
 * Chọn kiểu hỏi cho MỘT từ, dựa trên mức thuộc SM-2 của chính từ đó.
 *
 * Mỗi câu một kiểu, đan xen liên tục trong cùng một lượt — không phải làm hết
 * trắc nghiệm rồi mới sang gõ từ. Từ vừa sai lần đầu và từ sắp thuộc nằm cạnh
 * nhau trong danh sách, nên hai câu liền kề thường khác kiểu.
 *
 *   mastery 0–1 → `choice`     Vừa sai xong, chưa nhớ mặt chữ. Bắt gõ ngay là
 *                              chắc chắn sai lần nữa, không học được gì.
 *   mastery 2–3 → `truefalse`  Đã nhận ra được, giờ kiểm xem có phân biệt nổi
 *                              với nghĩa gần giống không.
 *   mastery 4–5 → `fill`       Sắp thuộc. Chỉ khi gõ ra được mới là thuộc thật.
 *
 * Dùng SM-2 thay vì gọi AI: bảng `user_wrongwords` đã lưu sẵn `masteryLevel`
 * của từng từ, tính từ lịch sử đúng/sai THẬT. AI phải đoán lại đúng thứ đó, mà
 * còn tốn tiền và độ trễ mạng cho mỗi lượt.
 */
function kieuTheoMucThuoc(word, viTri = 0) {
    // XOAY VÒNG đủ ba kiểu theo vị trí câu: câu 1 chọn nghĩa, câu 2 đúng/sai,
    // câu 3 gõ từ, rồi lặp lại.
    //
    // Bản đầu chọn kiểu theo `masteryLevel`, nhưng 208/208 từ trong DB đang ở
    // mastery 0–1 nên MỌI câu đều ra `choice`: về lý thuyết là hỗn hợp, thực tế
    // là một kiểu duy nhất suốt cả lượt. Mức thuộc chỉ phân hoá được sau nhiều
    // lượt ôn — mà người học cần thấy biến thể ngay từ lượt đầu.
    //
    // Xoay vòng chứ không ngẫu nhiên: ngẫu nhiên có thể ra bốn câu gõ liên tiếp,
    // mệt và nản đúng ở chế độ vốn đã khó.
    //
    // `word` giữ trong chữ ký cho các quy tắc theo từ về sau (và để `chonKieu`
    // gọi thống nhất), hiện chưa dùng tới.
    void word;
    const i = Math.abs(Number(viTri) || 0) % KIEU_HOI.length;
    return KIEU_HOI[i];
}


/**
 * Những kiểu hỏi người dùng CHO PHÉP, đọc từ Cài đặt.
 *
 * `settings.reviewKinds` là mảng tên kiểu. Không có / rỗng / toàn giá trị lạ →
 * dùng cả ba: người chưa vào Cài đặt bao giờ phải nhận được trải nghiệm đầy đủ,
 * không phải một màn hình trống.
 */
function kieuDuocPhep() {
    const chon = GameState.state?.settings?.reviewKinds;
    if (!Array.isArray(chon)) return [...KIEU_HOI];
    const hopLe = chon.filter((k) => KIEU_HOI.includes(k));
    return hopLe.length ? hopLe : [...KIEU_HOI];
}

/**
 * Kiểu hỏi cuối cùng cho một từ: SM-2 đề xuất, cài đặt của người dùng quyết.
 *
 * Nếu kiểu SM-2 chọn đang bị tắt thì LÙI VỀ kiểu dễ hơn còn bật, chứ không nhảy
 * lên kiểu khó hơn — người tắt "Gõ từ" là người không muốn gõ, ép họ gõ vì
 * không còn lựa chọn nào khác là làm ngược ý họ.
 */
function chonKieu(word, choPhep, viTri = 0) {
    const muon = kieuTheoMucThuoc(word, viTri);
    if (choPhep.includes(muon)) return muon;

    // Đi ngược từ vị trí của `muon` về phía dễ hơn.
    const i = KIEU_HOI.indexOf(muon);
    for (let k = i - 1; k >= 0; k--) {
        if (choPhep.includes(KIEU_HOI[k])) return KIEU_HOI[k];
    }
    // Không còn kiểu nào dễ hơn → lấy kiểu bật đầu tiên (danh sách luôn khác rỗng).
    return choPhep[0];
}

/**
 * Chữ đem ra hỏi, lấy đúng trường mà mỗi bộ sinh trả về.
 *
 * Ba bộ sinh KHÔNG thống nhất tên trường:
 *   generateMultipleChoice → `question`
 *   generateSpeedQuiz      → `question`
 *   generateFillBlank      → `displayWord`
 *
 * Đọc thiếu một trường thì ở chế độ ĐẢO CHIỀU (VN→EN) màn hình hiện sai vế:
 * đáng lẽ hỏi nghĩa tiếng Việt thì lại hiện từ tiếng Anh — tức lộ luôn đáp án.
 * Rơi về `word.en` chỉ khi cả hai đều trống.
 */
function deBai(question) {
    return question?.displayWord || question?.question || question?.word?.en || '';
}

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

        // XEN KẼ ba kiểu hỏi thay vì chỉ trắc nghiệm.
        //
        // Mỗi kiểu kiểm tra một cách nhớ khác nhau: chọn đáp án là NHẬN RA (dễ
        // nhất — nhìn thấy đáp án đúng trong bốn lựa chọn), gõ từ là NHỚ LẠI
        // (khó nhất, không có gợi ý), đúng/sai là PHÂN BIỆT. Một từ trả lời
        // đúng ở trắc nghiệm chưa chắc gõ ra được — mà chế độ này để ôn từ ĐÃ
        // SAI, nên cần biết người học thật sự nhớ hay chỉ nhận mặt chữ.
        //
        // Xoay vòng theo chỉ số chứ không ngẫu nhiên: ngẫu nhiên có thể ra bốn
        // câu gõ liên tiếp, mệt và nản đúng ở chế độ vốn đã khó.
        // Kiểu hỏi CHỌN THEO TỪNG TỪ, không xoay vòng theo vị trí: một từ vừa
        // sai lần đầu và một từ sắp thuộc cần hai cách kiểm tra khác nhau, dù
        // chúng đứng cạnh nhau trong lượt.
        //
        // Người dùng bật/tắt kiểu nào ở Cài đặt thì chỉ những kiểu đó được dùng;
        // nếu kiểu được SM-2 chọn đang tắt thì lùi về kiểu dễ hơn còn bật.
        const choPhep = kieuDuocPhep();

        this.questions = formattedWords.map((word, i) => {
            const kieu = chonKieu(word, choPhep, i);

            if (kieu === 'fill') {
                return { ...GameLogic.generateFillBlank(word), kieu };
            }
            if (kieu === 'truefalse') {
                return { ...GameLogic.generateSpeedQuiz(word, 2), kieu };
            }
            return { ...GameLogic.generateMultipleChoice(word, this.config.optionsCount), kieu };
        });
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

        const w = question.word;
        const soLanSai = w.wrongCount || 1;
        // 0–5 theo SM-2. Đây là thứ người học không nhìn thấy ở đâu khác, mà nó
        // trả lời đúng câu họ quan tâm: "từ này tôi thuộc chưa?"
        const mucThuoc = Math.max(0, Math.min(5, w.masteryLevel || 0));

        container.innerHTML = `
            <div class="question-container rm-container">
                <!-- Một hàng: mức thuộc + số lần sai + kiểu câu hỏi.
                     Gộp lại thay vì mỗi thứ một khối — chế độ này còn phải chừa
                     chỗ cho ô nhập/đáp án và thanh ba nút bên dưới. -->
                <div class="rm-status">
                    <span class="rm-mastery" title="Mức thuộc theo lịch giãn cách: ${mucThuoc}/5">
                        ${[0, 1, 2, 3, 4].map(k =>
                            `<i class="fas fa-circle rm-dot${k < mucThuoc ? ' is-on' : ''}"></i>`
                        ).join('')}
                        <span class="rm-mastery-text">${mucThuoc}/5</span>
                    </span>
                    <span class="rm-wrong" title="Số lần bạn đã sai từ này">
                        <i class="fas fa-rotate-left"></i> sai ${soLanSai} lần
                    </span>
                    <span class="rm-kind">${NHAN_KIEU[question.kieu] || ''}</span>
                </div>

                <div class="rm-word">
                    <span class="rm-word-text">${deBai(question)}</span>
                    <button class="btn-speak-mini" id="rm-speak-btn" title="Nghe phát âm">
                        <i class="fas fa-volume-up"></i>
                    </button>
                    ${w.phonetic ? `<span class="rm-phonetic">/${w.phonetic}/</span>` : ''}
                </div>

                <div class="rm-body">${this.bodyHtml(question)}</div>
            </div>
        `;

        this.attachListeners();

        if (GameState.state?.settings?.autoPronunciation) {
            setTimeout(() => GameLogic.speakWord(w.en), 300);
        }
    },

    /** Phần hỏi–đáp, khác nhau theo kiểu câu hỏi. */
    bodyHtml(question) {
        if (question.kieu === 'fill') {
            return `
                <p class="rm-prompt">${question.prompt}</p>
                <div class="rm-fill-row">
                    <input type="text" id="rm-input" class="rm-input"
                           placeholder="${question.placeholder}"
                           autocomplete="nope-review-answer" autocorrect="off"
                           autocapitalize="off" spellcheck="false" />
                    <button class="btn btn-primary" id="rm-check-btn">
                        <i class="fas fa-check"></i> Kiểm tra
                    </button>
                </div>`;
        }

        if (question.kieu === 'truefalse') {
            return `
                <p class="rm-prompt">Nghĩa dưới đây có đúng không?</p>
                <div class="rm-shown">${question.shownAnswer}</div>
                <div class="rm-tf">
                    <button class="choice-btn rm-tf-btn" data-tf="true">
                        <i class="fas fa-check"></i> Đúng
                    </button>
                    <button class="choice-btn rm-tf-btn" data-tf="false">
                        <i class="fas fa-times"></i> Sai
                    </button>
                </div>`;
        }

        return `
            <p class="rm-prompt">Nghĩa của từ này là gì?</p>
            <div class="choices-container rm-choices">
                ${question.options.map((opt, k) => `
                    <button class="choice-btn" data-index="${k}">${opt}</button>
                `).join('')}
            </div>`;
    },

    attachListeners() {
        const question = this.questions[this.currentIndex];
        if (!question) return;

        document.getElementById('rm-speak-btn')?.addEventListener('click', () => {
            // Không truyền ngôn ngữ — `speakWord` tự nhận chữ Hán.
            GameLogic.speakWord(question.word.en);
        });

        if (question.kieu === 'fill') {
            const input = document.getElementById('rm-input');
            const btn = document.getElementById('rm-check-btn');
            const nop = () => this.chamFill(input?.value || '');

            btn?.addEventListener('click', nop);
            input?.addEventListener('keydown', (e) => {
                // Enter để nộp. `isComposing` là BẮT BUỘC với tiếng Trung: bộ gõ
                // dùng Enter để chọn chữ trong danh sách gợi ý, không chặn thì
                // vừa gõ pinyin xong nhấn Enter là nộp luôn chuỗi chưa thành chữ.
                if (e.key === 'Enter' && !e.isComposing) {
                    e.preventDefault();
                    nop();
                }
            });
            setTimeout(() => input?.focus(), 100);
            return;
        }

        if (question.kieu === 'truefalse') {
            document.querySelectorAll('.rm-tf-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    this.chamTruocSau(btn.dataset.tf === 'true', btn);
                });
            });
            return;
        }

        document.querySelectorAll('.rm-choices .choice-btn').forEach((btn, k) => {
            btn.addEventListener('click', () => this.selectAnswer(k));
        });
    },

    /** Chấm câu GÕ TỪ. */
    chamFill(traLoi) {
        const question = this.questions[this.currentIndex];
        const input = document.getElementById('rm-input');
        if (!question || !input || input.disabled) return;

        const dung = GameLogic.checkFillBlank(traLoi, question.correctAnswer);
        input.disabled = true;
        input.classList.add(dung ? 'is-correct' : 'is-wrong');
        const btn = document.getElementById('rm-check-btn');
        if (btn) btn.disabled = true;

        this.ketThucCau(dung, question, question.correctAnswer);
    },

    /** Chấm câu ĐÚNG/SAI. */
    chamTruocSau(chonDung, btnDaBam) {
        const question = this.questions[this.currentIndex];
        if (!question) return;

        const nut = document.querySelectorAll('.rm-tf-btn');
        if (btnDaBam?.disabled) return;
        nut.forEach((b) => { b.disabled = true; });

        const dung = chonDung === question.isCorrect;
        btnDaBam?.classList.add(dung ? 'correct' : 'wrong');

        this.ketThucCau(dung, question, question.isCorrect ? 'Đúng' : 'Sai');
    },

    /**
     * Phần chung sau khi chấm: ghi điểm, phát âm, báo kết quả, sang câu kế.
     *
     * Ba kiểu hỏi trước đây mỗi cái tự lặp lại đoạn này; gom vào một chỗ thì
     * sửa luật tính điểm chỉ phải sửa một nơi.
     */
    ketThucCau(dung, question, dapAn) {
        PracticeManager.recordAnswer(dung, question.word);

        if (GameState.state.settings.soundEnabled) {
            Utils.playSound(dung ? Config.sounds.correct : Config.sounds.wrong, 0.5);
        }

        Notification.show(dung
            ? { type: 'success', title: 'Chính xác!',
                message: 'Từ này sẽ quay lại muộn hơn theo lịch ôn', duration: 2000 }
            : { type: 'error', title: 'Chưa đúng',
                message: `Đáp án đúng: ${dapAn}`, duration: 3000 });

        if (GameState.state.settings.soundEnabled && question.word.en) {
            setTimeout(() => GameLogic.speakWord(question.word.en), 500);
        }

        this.showWordInfo(question.word);
        afterAnswer(this, 'review-mistakes');
    },

    selectAnswer(index) {
        const question = this.questions[this.currentIndex];
        this.selectedAnswer = index;

        const choices = document.querySelectorAll('.rm-choices .choice-btn');
        if (choices[index]?.disabled) return;
        choices.forEach((btn) => { btn.disabled = true; });

        const dung = question.options[index] === question.correctAnswer;
        choices[index].classList.add(dung ? 'correct' : 'wrong');

        if (!dung) {
            const iDung = question.options.indexOf(question.correctAnswer);
            if (iDung !== -1) choices[iDung].classList.add('correct');
        }

        this.ketThucCau(dung, question, question.correctAnswer);
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
        // Giữ tham chiếu handler để cleanup() gỡ ĐÚNG cái của mình — EventBus.off
        // không kèm handler sẽ XOÁ SẠCH listener của sự kiện, kể cả của chế độ khác.
        this._onHint = () => {
            if (!this.hintUsed && this.currentIndex < this.questions.length) {
                this.showHint();
            }
        };
        EventBus.off(GameEvents.HINT_USED, this._onHint);
        EventBus.on(GameEvents.HINT_USED, this._onHint);

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
        EventBus.off(GameEvents.HINT_USED, this._onHint);
        this._onHint = null;
        this.questions = [];
        this.currentIndex = 0;
        this.selectedAnswer = null;
        this.hintUsed = false;
    }
};

