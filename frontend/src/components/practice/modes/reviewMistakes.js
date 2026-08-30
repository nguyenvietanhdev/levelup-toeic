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
import { chenViDu } from '../exampleBlock.js';
import { maCapHoc } from '../nhanNgonNgu.js';
// Dùng lại bộ chấm của chế độ Phát âm: nó là logic thuần (vào chuỗi, ra điểm)
// và đã xử lý những ca thật mà `===` bỏ sót — vd máy tự thêm trợ từ tiếng Trung.
import { scoreAttempt, feedbackMessage } from './pronunciationScoring.js';

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
/**
 * `hanzi-writer` nạp THEO YÊU CẦU, không import tĩnh: gói này ~40KB và chỉ dùng
 * khi lượt ôn thật sự có chữ Hán — người học tiếng Anh không bao giờ chạm tới.
 */
let HanziWriter = null;
async function ensureHanziWriter() {
    if (!HanziWriter) {
        const mod = await import('hanzi-writer');
        HanziWriter = mod.default;
    }
    return HanziWriter;
}

// Xếp theo ĐỘ KHÓ tăng dần: `chonKieu` lùi về phía TRÁI khi kiểu được chọn
// đang bị tắt, nên thứ tự ở đây là thứ tự ưu tiên khi lùi.
//
// `flashcard` đứng đầu vì nó dễ nhất: không phải chọn, không phải gõ — chỉ lật
// thẻ rồi tự đánh giá. Đó cũng là bước đầu tiên của việc học một từ vừa sai.
// `speak` xếp giữa `listen` và `scramble`: nói ra được là hơn nhận mặt chữ,
// nhưng vẫn dễ hơn tự gõ đúng chính tả.
const KIEU_HOI = ['flashcard', 'choice', 'truefalse', 'listen', 'speak', 'scramble', 'fill', 'hanzi'];

/**
 * Số lần được thử ở câu PHÁT ÂM.
 *
 * Nhận dạng giọng nói không phải phép đo chính xác: micro rè, tiếng ồn, hay
 * máy nghe hụt một âm là trượt — mà người học không sai gì cả. Một lần duy
 * nhất biến những ca đó thành "sai", rồi lịch ôn đẩy từ ấy quay lại sớm hơn
 * mức cần.
 *
 * Ba lần: đủ để vượt qua nhiễu, mà vẫn ít hơn số lần cần để đoán mò.
 */
const SO_LAN_NOI = 3;

/** Chữ Hán — dùng để biết một từ có viết được không. */
const HAN_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

/** Các nét của một chữ Hán đơn. Chỉ viết được từng chữ một. */
function chuHanDau(text) {
    const m = String(text || '').match(HAN_RE);
    return m ? m[0] : '';
}

/**
 * Chữ Hán của một từ, xét CẢ HAI mặt.
 *
 * Kho song ngữ để mặt đang học ở `en` và MẶT KIA ở `vn`, theo `hienThi` của
 * từng bản ghi. Bản ghi `hienThi: 'en'` thì `en` là từ tiếng Anh còn chữ Hán
 * nằm ở `vn` — soi mỗi `en` là kiểu "Viết chữ Hán" bị lọc bỏ, dù bản ghi có
 * chữ Hán hẳn hoi.
 *
 * Không đọc `matZh` được ở đây: từ sai lấy từ bảng `user_wrongwords`, mà bản
 * ghi đó chỉ lưu `en`/`vn`/`lang` — không có trường nào của kho song ngữ.
 */
function chuHanCuaTu(word) {
    return chuHanDau(word?.en) || chuHanDau(word?.vn);
}

/** Nhãn hiện trên thẻ trạng thái, cho biết câu này đang hỏi kiểu gì. */
const NHAN_KIEU = {
    flashcard: 'Lật thẻ',
    choice: 'Chọn nghĩa',
    truefalse: 'Đúng / Sai',
    listen: 'Nghe & chọn',
    speak: 'Phát âm',
    scramble: 'Xếp chữ cái',
    fill: 'Gõ từ',
    hanzi: 'Viết chữ Hán',
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
 * Lọc bỏ những kiểu KHÔNG dùng được với từ này.
 *
 * `hanzi` chỉ có nghĩa khi từ thật sự chứa chữ Hán — bắt viết "due" thì không
 * có nét nào để tô. Lọc theo TỪNG TỪ chứ không theo ngôn ngữ đang học: bộ từ
 * tiếng Trung vẫn có thể lẫn từ Latin, và ngược lại.
 */
function locTheoTu(choPhep, word) {
    const mat = String(word?.en || '');
    // HAI khái niệm khác nhau, đừng gộp:
    //   `vietDuoc` — bản ghi CÓ chữ Hán ở đâu đó (mặt nào cũng được) → tô nét được;
    //   `matLaHan` — MẶT ĐANG HIỆN là chữ Hán → không xé thành chữ cái được.
    // Dùng chung một biến thì bản ghi song ngữ đảo chiều (`en: 'hello'`,
    // `vn: '你好'`) mất luôn kiểu Xếp chữ cái, dù `hello` xếp được bình thường.
    const vietDuoc = !!chuHanCuaTu(word);
    const matLaHan = !!chuHanDau(mat);
    // Web Speech API chỉ có ở Chrome/Edge. Chế độ Phát âm riêng thoát cả lượt
    // được, nhưng ở đây các kiểu ĐAN XEN — một câu nói giữa lượt trên Firefox
    // là kẹt cứng, không có nút nào đi tiếp.
    const noiDuoc = typeof window !== 'undefined'
        && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
    // Xếp chữ cái chỉ có nghĩa với từ Latin đủ dài: chữ Hán không tách được
    // thành chữ cái, mà từ 1–2 ký tự thì xáo lên vẫn đoán ra ngay.
    const xepDuoc = !matLaHan && mat.replace(/\s/g, '').length >= 4;

    const loc = choPhep.filter((k) => {
        if (k === 'hanzi') return vietDuoc;
        if (k === 'scramble') return xepDuoc;
        if (k === 'speak') return noiDuoc;
        return true;
    });
    // Không còn kiểu nào (người dùng chỉ bật `hanzi` mà từ lại là tiếng Anh) →
    // rơi về `choice`: một câu dễ vẫn hơn một lượt trống.
    return loc.length ? loc : ['choice'];
}

/**
 * Kiểu hỏi cuối cùng cho một từ: SM-2 đề xuất, cài đặt của người dùng quyết.
 *
 * Nếu kiểu SM-2 chọn đang bị tắt thì LÙI VỀ kiểu dễ hơn còn bật, chứ không nhảy
 * lên kiểu khó hơn — người tắt "Gõ từ" là người không muốn gõ, ép họ gõ vì
 * không còn lựa chọn nào khác là làm ngược ý họ.
 */
function chonKieu(word, choPhep, viTri = 0) {
    // Lọc theo TỪ trước: kiểu vòng xoay chỉ ra có thể không dùng được với từ này.
    const duoc = locTheoTu(choPhep, word);

    const muon = kieuTheoMucThuoc(word, viTri);
    if (duoc.includes(muon)) return muon;

    // Đi ngược từ vị trí của `muon` về phía dễ hơn.
    const i = KIEU_HOI.indexOf(muon);
    for (let k = i - 1; k >= 0; k--) {
        if (duoc.includes(KIEU_HOI[k])) return KIEU_HOI[k];
    }
    // Không còn kiểu nào dễ hơn → lấy kiểu bật đầu tiên (danh sách luôn khác rỗng).
    return duoc[0];
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

            if (kieu === 'flashcard') {
                // Không có bộ sinh: thẻ lật chỉ cần mặt trước (từ) và mặt sau
                // (nghĩa). `correctAnswer` giữ nghĩa để `ketThucCau` báo được
                // đáp án như mọi kiểu khác.
                return { word, kieu, correctAnswer: word.vn };
            }
            if (kieu === 'listen') {
                // Cùng bộ sinh với trắc nghiệm; khác ở chỗ CHE mặt chữ và phát
                // âm — người học phải nhận ra từ qua tai, không qua mắt.
                return { ...GameLogic.generateListening(word, this.config.optionsCount), kieu };
            }
            if (kieu === 'scramble') {
                return { ...GameLogic.generateWordScramble(word), kieu };
            }
            if (kieu === 'speak') {
                // Không có bộ sinh: chỉ cần từ để đọc và nghĩa để đối chiếu.
                return { word, kieu, correctAnswer: word.vn };
            }
            if (kieu === 'hanzi') {
                // Không có bộ sinh sẵn cho kiểu này — nó chỉ cần chữ để tô, và
                // nghĩa để người học biết đang viết chữ nào.
                return { word, kieu, chuCanViet: chuHanCuaTu(word), correctAnswer: word.vn };
            }
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
        // `options` chỉ có ở kiểu trắc nghiệm/nghe — thẻ lật, gõ từ, viết chữ
        // Hán đều không có. Đọc thẳng là `undefined.indexOf` → vỡ đúng lúc hết
        // giờ, tức là lúc người dùng không bấm gì để cứu.
        const ci = Array.isArray(question.options)
            ? question.options.indexOf(question.correctAnswer)
            : -1;
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
                    <!-- Có CHỮ "Thuộc", không chỉ mỗi "0/5": năm chấm cạnh một
                         phân số đọc thành "câu 0 trên 5" — tiến độ lượt chơi —
                         chứ không ai đoán ra đó là mức thuộc. Lời giải thích
                         đặt trong thuộc tính title thì trên điện thoại không
                         hover được. (Không dùng dấu backtick trong khối này:
                         nó nằm trong template string, backtick đóng chuỗi.) -->
                    <span class="rm-mastery" title="Mức thuộc từ này theo lịch ôn giãn cách: ${mucThuoc}/5. Trả lời đúng thì tăng, sai thì giảm.">
                        <span class="rm-status-label">Thuộc</span>
                        ${[0, 1, 2, 3, 4].map(k =>
                            `<i class="fas fa-circle rm-dot${k < mucThuoc ? ' is-on' : ''}"></i>`
                        ).join('')}
                        <span class="rm-mastery-text">${mucThuoc}/5</span>
                    </span>
                    <span class="rm-wrong" title="Số lần bạn đã trả lời sai từ này">
                        <i class="fas fa-rotate-left"></i> đã sai ${soLanSai} lần
                    </span>
                    <span class="rm-kind">${NHAN_KIEU[question.kieu] || ''}</span>
                </div>

                <div class="rm-word">
                    <!-- Kiểu NGHE che mặt chữ: thấy chữ thì không còn phải nghe,
                         và đó đúng là kỹ năng kiểu này kiểm tra. -->
                    <span class="rm-word-text">${question.kieu === 'listen' ? '🔊 ? ? ?' : deBai(question)}</span>
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

        if (question.kieu === 'flashcard') {
            // Hai bước trong CÙNG một khối, đổi bằng class chứ không dựng lại
            // DOM: dựng lại thì mất hiệu ứng lật và ô chữ nhảy một nhịp.
            return `
                <p class="rm-prompt">Nhớ nghĩa của từ này không? Lật thẻ để đối chiếu.</p>
                <div class="rm-flash" id="rm-flash">
                    <div class="rm-flash-back" id="rm-flash-back">${question.correctAnswer}</div>
                </div>
                <div class="rm-flash-actions" id="rm-flash-reveal-row">
                    <button class="btn btn-primary" id="rm-flash-reveal">
                        <i class="fas fa-eye"></i> Lật thẻ
                    </button>
                </div>
                <div class="rm-flash-actions is-hidden" id="rm-flash-judge-row">
                    <button class="btn btn-secondary" id="rm-flash-no">
                        <i class="fas fa-times"></i> Chưa nhớ
                    </button>
                    <button class="btn btn-primary" id="rm-flash-yes">
                        <i class="fas fa-check"></i> Tôi nhớ
                    </button>
                </div>`;
        }

        if (question.kieu === 'listen') {
            return `
                <p class="rm-prompt">Nghe rồi chọn nghĩa đúng</p>
                <div class="choices-container rm-choices">
                    ${question.options.map((opt, k) => `
                        <button class="choice-btn" data-index="${k}">${opt}</button>
                    `).join('')}
                </div>`;
        }

        if (question.kieu === 'scramble') {
            return `
                <p class="rm-prompt">Xếp lại các chữ cái thành từ đúng</p>
                <div class="rm-scramble" id="rm-scramble-pool">
                    ${question.scrambledLetters.map((ch, k) => `
                        <button class="rm-letter" data-k="${k}">${ch}</button>
                    `).join('')}
                </div>
                <div class="rm-scramble-answer" id="rm-scramble-answer"></div>
                <div class="rm-fill-row">
                    <button class="btn btn-secondary" id="rm-scramble-clear">
                        <i class="fas fa-redo"></i> Làm lại
                    </button>
                    <button class="btn btn-primary" id="rm-scramble-check" disabled>
                        <i class="fas fa-check"></i> Kiểm tra
                    </button>
                </div>`;
        }

        if (question.kieu === 'speak') {
            return `
                <p class="rm-prompt">Bấm mic rồi đọc to từ này — có ${SO_LAN_NOI} lần thử</p>
                <div class="rm-speak">
                    <button class="rm-mic-btn" id="rm-mic">
                        <i class="fas fa-microphone"></i>
                    </button>
                    <div class="rm-mic-status" id="rm-mic-status">Bấm để bắt đầu nói</div>
                    <div class="rm-heard" id="rm-heard"></div>
                </div>
                <div class="rm-hanzi-actions">
                    <button class="btn btn-secondary" id="rm-speak-skip">
                        <i class="fas fa-forward"></i> Bỏ qua từ này
                    </button>
                </div>`;
        }

        if (question.kieu === 'hanzi') {
            return `
                <p class="rm-prompt">Viết lại chữ này theo nét mẫu</p>
                <div class="rm-hanzi" id="rm-hanzi-box"></div>
                <div class="rm-hanzi-actions">
                    <button class="btn btn-secondary" id="rm-hanzi-demo">
                        <i class="fas fa-play"></i> Xem mẫu
                    </button>
                    <button class="btn btn-secondary" id="rm-hanzi-skip">
                        <i class="fas fa-forward"></i> Bỏ qua chữ này
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

        if (question.kieu === 'speak') {
            this.ganPhatAm(question);
            return;
        }

        if (question.kieu === 'hanzi') {
            this.dungOVe(question);
            return;
        }

        if (question.kieu === 'scramble') {
            this.ganXepChuCai(question);
            return;
        }

        if (question.kieu === 'flashcard') {
            this.ganLatThe(question);
            return;
        }

        if (question.kieu === 'listen') {
            // Phát ngay khi câu hiện — không nghe thì không có gì để chọn.
            setTimeout(() => GameLogic.speakWord(question.word.en), 300);
            document.querySelectorAll('.rm-choices .choice-btn').forEach((btn, k) => {
                btn.addEventListener('click', () => this.selectAnswer(k));
            });
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

    /**
     * Câu PHÁT ÂM: bấm mic, đọc to, máy chấm bằng Web Speech API.
     *
     * Ngôn ngữ nhận dạng lấy theo CHÍNH CHỮ của từ, không theo cài đặt: lượt ôn
     * trộn từ của mọi bộ, mà đặt `en-US` cho một từ chữ Hán thì máy nghe ra một
     * tràng vô nghĩa và người học bị chấm sai dù đọc chuẩn.
     *
     * Không nghe được gì thì KHÔNG chấm sai — chỉ mời thử lại. Phạt phải dành
     * cho lỗi phát âm, không phải cho việc mic chưa bắt được tiếng.
     */
    ganPhatAm(question) {
        const tu = String(question.word?.en || '');

        // Ngôn ngữ nghe lấy theo MẶT ĐANG HỎI của cặp đang học, KHÔNG đoán theo
        // mặt chữ.
        //
        // Đoán bằng `HAN_RE.test(tu)` sai ở những chỗ không nhìn ra ngay: từ tiếng
        // Trung viết bằng chữ số hay ký tự Latin (2002年, Tầng 1, OK), từ đã bị
        // cắt mất phần Hán — đều rơi vào nhánh 'en-US', và người học nói tiếng
        // Trung mà máy nghe bằng tiếng Anh. Kho đang học thì BIẾT CHẮC, không
        // phải đoán.
        const maNghe = maCapHoc(question.word).tu;
        const laZh = maNghe.startsWith('zh');

        const nut = document.getElementById('rm-mic');
        const trangThai = document.getElementById('rm-mic-status');
        const oNghe = document.getElementById('rm-heard');

        const nutBoQua = document.getElementById('rm-speak-skip');

        /**
         * Câu này đã chấm xong chưa.
         *
         * Cờ đặt trên `this`, KHÔNG phải biến cục bộ trong `bat()`: mỗi lần bấm
         * mic là một lần gọi `bat()` mới, nên biến cục bộ chỉ chặn được trùng
         * trong CÙNG một lượt nghe — chấm xong bấm mic lần nữa là chấm lại từ
         * đầu, ăn thêm một lần cộng/trừ điểm cho cùng một câu.
         *
         * Đặt lại ở đây (không phải chỉ khi chấm) vì mỗi câu gọi `ganPhatAm`
         * một lần: câu mới phải bắt đầu với cờ sạch.
         */
        this._daChamNoi = false;

        // Số lần ĐÃ thử ở câu này. Đặt lại cùng chỗ với cờ trên: câu mới phải
        // bắt đầu lại từ 0, không thì câu trước dùng hết lượt là câu sau chấm
        // sai ngay lần nói đầu.
        this._soLanNoi = 0;

        /** Khoá mọi điều khiển sau khi đã chấm — không cho làm lại. */
        const khoaLai = () => {
            this._daChamNoi = true;
            if (nut) { nut.disabled = true; nut.classList.add('is-done'); }
            if (nutBoQua) nutBoQua.disabled = true;
        };

        nutBoQua?.addEventListener('click', () => {
            if (this._daChamNoi) return;
            khoaLai();
            this._dungNghe();
            this.ketThucCau(false, question, tu);
        });

        const SR = typeof window !== 'undefined'
            && (window.SpeechRecognition || window.webkitSpeechRecognition);
        if (!SR || !nut) {
            // `locTheoTu` đã lọc kiểu này ra khi trình duyệt không hỗ trợ, nên
            // tới đây là ngoài dự kiến — vẫn phải có lối thoát, không để kẹt.
            if (trangThai) trangThai.textContent = 'Trình duyệt không hỗ trợ nhận dạng giọng nói';
            return;
        }

        // Đọc mẫu một lần cho người học nghe trước khi nói.
        setTimeout(() => GameLogic.speakWord(tu), 300);

        const bat = () => {
            if (this._rec) return;         // đang nghe rồi
            if (this._daChamNoi) return;   // đã chấm — một câu chỉ chấm MỘT lần

            const rec = new SR();
            rec.lang = maNghe;
            rec.continuous = false;
            rec.interimResults = true;
            rec.maxAlternatives = 5;


            rec.onstart = () => {
                nut.classList.add('is-listening');
                // Ghi RÕ mã đang nghe.
                //
                // Không hiện thì khi máy nghe sai ngôn ngữ, không ai biết là app
                // xin sai mã hay trình duyệt phớt lờ mã đúng — hai nguyên nhân
                // khác hẳn nhau mà nhìn màn hình thì giống hệt.
                if (trangThai) trangThai.textContent = `Đang nghe… (${maNghe})`;
            };

            rec.onresult = (e) => {
                if (this._daChamNoi) return;
                const kq = e.results[e.resultIndex] ?? e.results[0];
                if (!kq) return;
                const chu = String(kq[0]?.transcript || '').trim();

                if (!kq.isFinal) {
                    // Bản tạm ĐỔI LIÊN TỤC trong lúc nói — chỉ hiện cho người
                    // học thấy máy đang nghe được gì, tuyệt đối không chấm.
                    if (oNghe) oNghe.textContent = chu;
                    return;
                }

                if (oNghe) oNghe.textContent = chu;
                this._dungNghe();
                nut.classList.remove('is-listening');

                // Máy trả về SAI HỆ CHỮ → coi như KHÔNG nghe được, không chấm.
                //
                // Xin nghe tiếng Trung mà nhận lại toàn chữ Latin ("How how?")
                // nghĩa là bộ nhận dạng không chạy bằng ngôn ngữ ta yêu cầu —
                // đó là lỗi của khâu nhận dạng, không phải người học phát âm
                // sai. Chấm sai ở đây là phạt oan, mà còn đẩy từ đó quay lại
                // sớm hơn mức cần trong lịch ôn.
                //
                // Không trừ lượt thử: cùng lý do với "chưa nghe thấy gì".
                if (laZh && chu && !HAN_RE.test(chu)) {
                    if (trangThai) {
                        trangThai.textContent =
                            `Máy nghe ra chữ Latin, không phải tiếng Trung — bấm mic nói lại (${maNghe})`;
                    }
                    return;
                }

                const diem = scoreAttempt(chu, Array.from(kq), tu, laZh);
                this._soLanNoi += 1;
                const conLai = SO_LAN_NOI - this._soLanNoi;

                // `correct` đã bao gồm cả ca "gần đúng" (xem `scoreAttempt`:
                // nhánh cuối trả `correct: near`), không cần kiểm `near` nữa.
                if (!diem.correct && conLai > 0) {
                    // Sai nhưng CÒN LƯỢT → chưa chấm, mời nói lại.
                    //
                    // Chưa gọi `khoaLai()` ở đây là điểm mấu chốt: nó vừa đặt
                    // cờ "đã chấm" vừa vô hiệu hoá nút mic, nên gọi sớm là
                    // người học không bấm lại được và lượt thử còn lại thành vô
                    // nghĩa.
                    if (trangThai) {
                        trangThai.textContent =
                            `${feedbackMessage(diem, tu, laZh)} — còn ${conLai} lần thử`;
                    }
                    return;
                }

                khoaLai();
                if (trangThai) trangThai.textContent = feedbackMessage(diem, tu, laZh);
                this.ketThucCau(diem.correct, question, tu);
            };

            rec.onend = () => {
                this._rec = null;
                nut.classList.remove('is-listening');
                if (!this._daChamNoi && trangThai) {
                    trangThai.textContent = 'Chưa nghe thấy gì — bấm mic thử lại';
                }
            };

            rec.onerror = (e) => {
                this._rec = null;
                nut.classList.remove('is-listening');
                // Đã chấm rồi thì giữ nguyên câu nhận xét — ghi đè bằng "chưa
                // nghe thấy gì" là xoá mất kết quả người học vừa nhận được.
                if (!trangThai || this._daChamNoi) return;
                trangThai.textContent = e.error === 'not-allowed'
                    ? 'Chưa cho phép dùng micro'
                    : 'Chưa nghe thấy gì — bấm mic thử lại';
            };

            this._rec = rec;
            try { rec.start(); } catch { this._rec = null; }
        };

        nut.addEventListener('click', bat);
    },

    /** Dừng nhận dạng đang chạy — gọi trước khi rời câu. */
    _dungNghe() {
        if (!this._rec) return;
        try { this._rec.abort(); } catch { /* đã dừng */ }
        this._rec = null;
    },

    /**
     * Dọn cờ "đã chấm" khi rời câu.
     *
     * `ganPhatAm` đặt lại cờ mỗi lần dựng câu NÓI, nhưng câu kế có thể là kiểu
     * khác — cờ bật còn treo lại thì không sao (không ai đọc), song để sạch cho
     * lần sau quay lại kiểu nói vẫn hơn.
     */
    _donCoNoi() {
        this._daChamNoi = false;
    },

    /**
     * Dựng ô tô nét cho câu VIẾT CHỮ HÁN.
     *
     * Bất đồng bộ vì thư viện nạp theo yêu cầu. Người dùng có thể bấm "Tiếp"
     * trước khi nạp xong, nên phải kiểm lại chỉ số câu trước khi vẽ — không thì
     * ô vẽ của câu cũ hiện trên câu mới.
     */
    async dungOVe(question) {
        const idxLucGoi = this.currentIndex;
        const box = document.getElementById('rm-hanzi-box');
        if (!box || !question.chuCanViet) return;

        const W = await ensureHanziWriter();
        if (!W || this.currentIndex !== idxLucGoi) return;
        // Ô có thể đã bị gỡ khỏi DOM trong lúc chờ nạp.
        if (!box.isConnected) return;

        // Ô vuông theo BỀ RỘNG THẬT của ô đã dựng — CSS quyết định cỡ
        // (`.rm-hanzi` dùng chung công thức với chế độ viết chữ Hán), ở đây chỉ
        // đọc lại.
        //
        // Kẹp dưới ở 140 cho khớp `clamp` bên CSS: nhỏ hơn thì nét chen nhau
        // không tô nổi bằng ngón tay. KHÔNG kẹp trên nữa — CSS đã chặn ở 220,
        // đặt thêm một con số ở đây là hai nơi phải sửa song song.
        const size = Math.max(140, box.clientWidth || 200);
        box.style.height = `${size}px`;

        this.writer = W.create(box, question.chuCanViet, {
            width: size,
            height: size,
            padding: 10,
            showCharacter: false,
            showOutline: true,          // nét mờ để tô theo
            strokeColor: '#e11d48',
            outlineColor: '#d4d4d8',
            drawingWidth: 22,
            // Dữ liệu nét lấy từ `public/hanzi`, không phải CDN ngoài: CSP của
            // app chặn connect-src lạ, và để trong repo thì không phụ thuộc mạng.
            charDataLoader: (char, onLoad, onErr) => {
                fetch(`/hanzi/${encodeURIComponent(char)}.json`)
                    .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
                    .then(onLoad)
                    .catch(onErr);
            },
        });

        let saiNet = 0;
        this.writer?.quiz({
            showHintAfterMisses: 2,
            onMistake: () => { saiNet += 1; },
            // Tô xong cả chữ = đúng, nhưng chỉ khi không sai quá 2 nét: tô đúng
            // sau khi máy gợi ý từng nét thì chưa gọi là nhớ.
            onComplete: () => this.ketThucCau(saiNet <= 2, question, question.word.en),
        });

        document.getElementById('rm-hanzi-demo')?.addEventListener('click', () => {
            // `animateCharacter` HUỶ quiz đang chạy (hành vi của thư viện) —
            // phải mở lại, không thì tô tiếp không ăn và bài đứng im.
            this.writer?.animateCharacter({
                onComplete: () => {
                    this.writer?.quiz({
                        showHintAfterMisses: 2,
                        onMistake: () => { saiNet += 1; },
                        onComplete: () => this.ketThucCau(false, question, question.word.en),
                    });
                },
            });
        });

        document.getElementById('rm-hanzi-skip')?.addEventListener('click', () => {
            this.ketThucCau(false, question, question.word.en);
        });
    },

    /**
     * Câu XẾP CHỮ CÁI: bấm từng chữ để ghép, bấm lại để bỏ ra.
     *
     * Giữ trạng thái trên `this._xep` chứ không đọc ngược từ DOM: đọc từ DOM thì
     * hai chữ cái giống nhau ("ee") không phân biệt được cái nào đã dùng.
     */
    ganXepChuCai(question) {
        this._xep = [];
        const pool = document.getElementById('rm-scramble-pool');
        const oDap = document.getElementById('rm-scramble-answer');
        const btnCheck = document.getElementById('rm-scramble-check');

        const veLai = () => {
            if (oDap) oDap.textContent = this._xep.map((x) => x.ch).join('');
            if (btnCheck) btnCheck.disabled = this._xep.length === 0;
        };

        pool?.querySelectorAll('.rm-letter').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                btn.disabled = true;
                btn.classList.add('is-used');
                this._xep.push({ k: btn.dataset.k, ch: btn.textContent, btn });
                veLai();
            });
        });

        document.getElementById('rm-scramble-clear')?.addEventListener('click', () => {
            this._xep.forEach((x) => {
                x.btn.disabled = false;
                x.btn.classList.remove('is-used');
            });
            this._xep = [];
            veLai();
        });

        btnCheck?.addEventListener('click', () => {
            if (btnCheck.disabled) return;
            btnCheck.disabled = true;
            pool?.querySelectorAll('.rm-letter').forEach((b) => { b.disabled = true; });

            const traLoi = this._xep.map((x) => x.ch).join('');
            // So không phân biệt hoa/thường và bỏ khoảng trắng — cụm từ nhiều
            // chữ ("take off") xáo lên thì người học không biết đặt dấu cách đâu.
            const chuan = (t) => String(t || '').toLowerCase().replace(/\s/g, '');
            const dung = chuan(traLoi) === chuan(question.correctAnswer);

            if (oDap) oDap.classList.add(dung ? 'is-correct' : 'is-wrong');
            this.ketThucCau(dung, question, question.correctAnswer);
        });

        veLai();
    },

    /** Chấm câu GÕ TỪ. */
    chamFill(traLoi) {
        const question = this.questions[this.currentIndex];
        const input = document.getElementById('rm-input');
        if (!question || !input || input.disabled) return;

        // Ô TRỐNG thì không nộp — nhấn Enter khi chưa gõ gì là mất câu oan.
        // `calculateSimilarity` còn trả 100 khi cả hai chuỗi rỗng (nhánh
        // `longer.length === 0`), nên bỏ trống có thể thành "đúng".
        if (!String(traLoi).trim()) {
            Notification.show({
                type: 'warning',
                title: 'Chưa nhập đáp án',
                message: 'Vui lòng nhập câu trả lời',
                duration: 2000,
            });
            return;
        }

        // `.correct` — KHÔNG dùng thẳng giá trị trả về.
        //
        // `checkFillBlank` trả OBJECT `{ correct, similarity }`, mà object thì
        // luôn truthy: bản cũ chấm đúng cho MỌI câu trả lời, kể cả gõ một chữ
        // hay bỏ trống. Cả lượt ôn hiện "Chính xác!" nên không có gì gợi ra là
        // sai — mà đây lại là chế độ ôn từ ĐÃ SAI, tức là hỏng đúng chỗ cần
        // chấm nghiêm nhất.
        const { correct: dung } = GameLogic.checkFillBlank(traLoi, question.correctAnswer);
        input.disabled = true;
        input.classList.add(dung ? 'is-correct' : 'is-wrong');
        const btn = document.getElementById('rm-check-btn');
        if (btn) btn.disabled = true;

        this.ketThucCau(dung, question, question.correctAnswer);
    },

    /** Chấm câu ĐÚNG/SAI. */
    /**
     * Thẻ lật: hiện nghĩa rồi để người học TỰ chấm.
     *
     * Không có đáp án khách quan như sáu kiểu kia — đây là kiểu duy nhất tin
     * vào lời tự đánh giá. Đổi lại nó kiểm được thứ không kiểu nào kiểm được:
     * NHỚ LẠI tự do, không có bốn lựa chọn để loại trừ và không bắt gõ đúng
     * chính tả. Với từ vừa sai lần đầu thì đó là bước học, chưa phải bước thi.
     *
     * Chỉ chấm được SAU khi đã lật: chấm trước khi thấy nghĩa thì người học
     * không có gì để đối chiếu, và "Tôi nhớ" lúc đó là vô nghĩa.
     */
    ganLatThe(question) {
        const the = document.getElementById('rm-flash');
        const hangLat = document.getElementById('rm-flash-reveal-row');
        const hangCham = document.getElementById('rm-flash-judge-row');

        document.getElementById('rm-flash-reveal')?.addEventListener('click', () => {
            the?.classList.add('is-open');
            hangLat?.classList.add('is-hidden');
            hangCham?.classList.remove('is-hidden');
            // Đọc luôn khi lật: nghe và thấy nghĩa cùng lúc thì hai đường vào
            // trí nhớ cùng được củng cố.
            if (GameState.state?.settings?.soundEnabled) GameLogic.speakWord(question.word.en);
        });

        const cham = (nho) => {
            document.querySelectorAll('#rm-flash-judge-row .btn')
                .forEach((b) => { b.disabled = true; });
            this.ketThucCau(nho, question, question.correctAnswer);
        };
        document.getElementById('rm-flash-yes')?.addEventListener('click', () => cham(true));
        document.getElementById('rm-flash-no')?.addEventListener('click', () => cham(false));
    },

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
        // MỘT CÂU CHỈ CHẤM MỘT LẦN.
        //
        // Chặn ở đây chứ không ở từng kiểu: đây là điểm chung DUY NHẤT mà tám
        // kiểu đều đi qua, nên một chỗ là đủ cho cả tám — và cho mọi kiểu thêm
        // về sau. Vá từng kiểu thì lần nào cũng phải nhớ, mà đã có kiểu quên:
        //
        //   · `speak`  — chấm xong bấm mic lần nữa là chấm lại từ đầu;
        //   · `hanzi`  — ba đường vào (tô xong / xem mẫu rồi tô / "Bỏ qua chữ
        //                này") không chặn nhau, bấm Bỏ qua rồi tô nốt là hai lần;
        //   · `flashcard` — nút bị vô hiệu hoá SAU khi chấm, hai cú bấm thật
        //                nhanh vẫn lọt cả hai.
        //
        // Chấm hai lần không chỉ sai điểm: `recordAnswer` đẩy `masteryLevel`
        // của từ đi hai bậc, nên từ vừa ôn bị coi là thuộc hơn thực tế và lịch
        // ôn giãn ra sai.
        //
        // Cờ đặt trên CHÍNH câu hỏi, không phải trên `this`: đối tượng câu hỏi
        // sống đúng bằng một câu nên không phải nhớ dọn ở đâu cả.
        if (question?._daCham) return;
        if (question) question._daCham = true;

        // Huỷ ô vẽ trước khi sang câu kế: thư viện giữ listener trên SVG, để lại
        // thì mỗi câu chữ Hán cộng thêm một bộ và nét tô của câu cũ vẫn ăn.
        this.huyOVe();
        // Cùng lý do với mic: bỏ chạy thì nó còn nghe sang câu sau và đèn mic
        // của trình duyệt vẫn sáng.
        this._dungNghe();
        // KHÔNG dọn `_daChamNoi` ở đây: hàm này chạy NGAY KHI chấm xong, dọn
        // lúc này là mở lại đường chấm lần hai — đúng thứ vừa chặn. Cờ được đặt
        // lại ở đầu `ganPhatAm` cho câu kế, và ở `cleanup` khi rời chế độ.

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

    /** Huỷ ô tô nét đang mở, nếu có. */
    huyOVe() {
        try { this.writer?.cancelQuiz?.(); } catch { /* thư viện chưa nạp */ }
        this.writer = null;
    },

    cleanup() {
        EventBus.off(GameEvents.HINT_USED, this._onHint);
        this._onHint = null;
        // Rời chế độ giữa lúc đang tô nét thì thư viện còn giữ listener trên SVG.
        this.huyOVe();
        this._dungNghe();
        this._donCoNoi();
        this.questions = [];
        this.currentIndex = 0;
        this.selectedAnswer = null;
        this.hintUsed = false;
    }
};

