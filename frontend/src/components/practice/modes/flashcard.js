import { GameLogic } from '@game/gameLogic.js';
import { nhanCapHoc } from '../nhanNgonNgu.js';
import { GameState } from '@game/state.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { Notification } from '@ui/Toaster.jsx';
import { Modal } from '@ui/Modal.jsx';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import { FavoritesAPI } from '@api/favorites.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { layPhienAmCau } from '@lib/sentencePinyin.js';

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

        // Hết part hiện tại → tự sang part KẾ TIẾP thay vì báo "không tìm
        // thấy từ vựng" rồi thoát. Người học bấm "Học tiếp" là muốn học tiếp,
        // không phải muốn biết part này đã hết.
        //
        // `sangPartKe` trả `null` khi đang ở chế độ "ngẫu nhiên tất cả" (không
        // khoá part nào) hoặc khi đây đã là part cuối — lúc đó giữ nguyên hành
        // vi cũ.
        if (this.words.length === 0) {
            const partMoi = await PartSelector.sangPartKe();
            if (partMoi) {
                // Part mới bắt đầu từ đầu, không mang theo con trỏ của part cũ.
                this.batchOffset = 0;
                await this.loadWords();
                if (this.words.length > 0) {
                    Notification.show({
                        type: 'info',
                        message: `Đã học hết phần trước — chuyển sang ${partMoi}.`,
                    });
                }
            }
        }

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

    /**
     * Chữ đang hiện ở MỘT mặt của thẻ — thứ nút loa phải đọc.
     *
     * Không phải lúc nào cũng `word.en`. Đảo chiều thì mặt trước là nghĩa, mà
     * đọc nghĩa lúc đang hỏi là đọc mất đáp án ra loa. Kho song ngữ còn đặt
     * chữ HÁN vào `word.en`, nên "en" ở đây không có nghĩa là tiếng Anh.
     */
    chuMat(word, matSau = false) {
        const dao = GameLogic.isReversed();
        const nghia = word.vi || word.vn || '';
        // Mặt trước: đảo chiều → nghĩa, thường → từ. Mặt sau ngược lại.
        return (dao !== matSau) ? nghia : word.en;
    },

    render(word) {
        const container = document.getElementById('practice-content');
        if (!container) return;

        // reversed = VN→EN: mặt trước hiện nghĩa tiếng Việt, mặt sau hiện từ
        // tiếng Anh + phiên âm. Ảnh giữ nguyên ở mặt trước (không phụ thuộc ngôn ngữ).
        const reversed = GameLogic.isReversed();
        const meaning = word.vi || word.vn || '';
        const frontMain = reversed ? meaning : word.en;

        // Nhãn góc thẻ theo CẶP ĐANG HỌC, không cứng EN/VI.
        //
        // Kho song ngữ học Trung ↔ Anh: mặt sau là tiếng Anh, không có tiếng
        // Việt nào — mà nhãn vẫn ghi "VI". Kho tiếng Trung thì mặt trước là chữ
        // Hán nhưng nhãn ghi "EN".
        const { tu, nghia } = nhanCapHoc();
        const viTat = { 'Tiếng Anh': 'EN', 'Tiếng Trung': 'ZH', 'Tiếng Việt': 'VI' };
        const frontBadge = viTat[reversed ? nghia : tu] || 'EN';
        const backBadge = viTat[reversed ? tu : nghia] || 'VI';

        // ── Kho SONG NGỮ: mỗi mặt một bộ ĐẦY ĐỦ ────────────────────────────
        //
        // Thẻ có hai mặt là hai NGÔN NGỮ (Trung / Anh), không phải từ và nghĩa.
        // Nên mỗi mặt phải tự đủ: từ + ví dụ + đồng nghĩa của chính ngôn ngữ
        // đó. Lật sang mặt Anh mà thấy ví dụ tiếng Trung thì mặt đó không dạy
        // được gì.
        //
        // CHỈ áp dụng cho kho song ngữ. Hai kho cũ giữ nguyên bố cục "từ ở mặt
        // trước, nghĩa + ví dụ ở mặt sau" — ở đó ví dụ chỉ có MỘT thứ tiếng nên
        // tách đôi là chép thừa.
        const laSongNgu = !!word.songNgu && !!word.matZh && !!word.matEn;
        // Mặt trước = ngôn ngữ đang học; đảo chiều thì hai mặt đổi chỗ.
        const boTruoc = laSongNgu ? (reversed ? word.matEn : word.matZh) : null;
        const boSau = laSongNgu ? (reversed ? word.matZh : word.matEn) : null;

        /**
         * Hàng phiên âm + loại từ của MỘT mặt.
         *
         * Dùng chung cho cả hai mặt để chúng trình bày y hệt nhau: từ lớn →
         * hàng meta → khối ví dụ. Trước đây mặt sau không có hàng này nên hai
         * mặt nhìn lệch hẳn, mà mặt sau mới là bố cục người dùng thấy gọn.
         *
         * Ẩn hẳn khi rỗng — chừa một dải trống không hiểu vì sao lại có.
         */
        const hangMeta = (ph, loai) => {
            if (!ph && !loai) return '';
            return `<div class="card-meta-row">
                ${ph ? `<span class="card-phonetic">${ph}</span>` : ''}
                ${loai ? `<span class="card-type">${loai}</span>` : ''}
            </div>`;
        };

        /**
         * Khối "Ví dụ" + "Từ đồng nghĩa" cho MỘT mặt thẻ.
         *
         * `hau` để mỗi mặt có id phiên âm riêng — hai mặt cùng id thì
         * `napPhienAm` ghi vào phần tử đầu tiên tìm thấy, tức là mặt kia.
         */
        const khoiPhu = (viDu, dongNghia, hau = '') => {
            if (!viDu && !dongNghia) return '';
            return `
                            <div class="card-extras">
                                ${viDu ? `
                                    <div class="card-example">
                                        <strong>Ví dụ:</strong>
                                        <div class="card-extra-row">
                                            <p>${viDu}</p>
                                            <!-- Nút DỊCH đứng TRƯỚC nút loa: đọc hiểu rồi mới
                                                 nghe. Cùng thứ tự với chế độ Trắc nghiệm để
                                                 tay quen một chỗ là quen mọi chỗ. -->
                                            <button class="btn-speak-mini card-translate" data-tr="${viDu}" title="Dịch cả câu">
                                                <i class="fas fa-language"></i>
                                            </button>
                                            <button class="btn-speak-mini card-speak" data-speak="${viDu}" title="Nghe câu ví dụ">
                                                <i class="fas fa-volume-up"></i>
                                            </button>
                                        </div>
                                        <div class="card-extra-phonetic" id="fc-ph-example${hau}"></div>
                                    </div>
                                ` : ''}

                                ${dongNghia ? `
                                    <div class="card-synonyms">
                                        <strong>Từ đồng nghĩa:</strong>
                                        <div class="card-extra-row">
                                            <p>${dongNghia}</p>
                                            <button class="btn-speak-mini card-translate" data-tr="${dongNghia}" title="Dịch từ đồng nghĩa">
                                                <i class="fas fa-language"></i>
                                            </button>
                                            <button class="btn-speak-mini card-speak" data-speak="${dongNghia}" title="Nghe từ đồng nghĩa">
                                                <i class="fas fa-volume-up"></i>
                                            </button>
                                        </div>
                                        <div class="card-extra-phonetic" id="fc-ph-synonyms${hau}"></div>
                                    </div>
                                ` : ''}
                            </div>`;
        };

        // Kho song ngữ: mỗi mặt bộ riêng. Hai kho cũ: chỉ mặt sau có, như cũ.
        const phuTruoc = laSongNgu ? khoiPhu(boTruoc.example, boTruoc.synonyms, '-truoc') : '';
        const phuSau = laSongNgu
            ? khoiPhu(boSau.example, boSau.synonyms, '-sau')
            : khoiPhu(word.example, word.synonyms);

        container.innerHTML = `
            <div class="flashcard-container">
                <!-- KHÔNG lặp lại số câu và Known/Unknown ở đây.
                     Thanh trên đầu màn luyện tập đã hiện đúng cùng những con số
                     đó: updateProgress đẩy số câu lên, còn markAsKnown /
                     markAsUnknown đều gọi recordAnswer nên ✓/✗ trên đó chính là
                     Known/Unknown. Hiện hai lần chỉ tốn chiều cao và đẩy thẻ
                     xuống dưới mép màn hình. -->
                <div class="flashcard-stage">
                <div class="flashcard" id="flashcard">
                    <div class="flashcard-inner" id="flashcard-inner">
                        <div class="flashcard-front">
                            <!-- Nút tim nằm CẠNH badge ngôn ngữ, không phải giữa
                                 thân thẻ: cả hai đều là điều khiển ở góc, gom
                                 lại thì thân thẻ dành trọn cho nội dung. -->
                            <div class="card-corner-group">
                                <button class="card-fav-btn${this._isFavorite(word.en) ? ' active' : ''}" id="fav-btn" title="${this._isFavorite(word.en) ? 'Bỏ yêu thích' : 'Thêm yêu thích'}">
                                    <i class="${this._isFavorite(word.en) ? 'fas' : 'far'} fa-heart"></i>
                                </button>
                                <div class="card-corner-badge">${frontBadge}</div>
                            </div>
                            <!-- Lớp --split là bố cục CÓ ẢNH (ảnh trái, chữ phải)
                                 nên nó căn trái. Gắn vô điều kiện thì thẻ không
                                 ảnh cũng bị đẩy lệch trái, trong khi mặt sau căn
                                 giữa — hai mặt nhìn như hai kiểu khác nhau. -->
                            <div class="card-content${word.image ? ' card-content--split' : ''}">
                                ${word.image ? `
                                    <div class="card-image-col">
                                        <img src="${word.image}" class="card-image" alt="${word.en}"
                                             class="js-hide-on-error" data-hide-closest=".card-image-col">
                                    </div>
                                ` : ''}
                                <div class="card-text-col">
                                    <h2 class="card-word">${frontMain}</h2>
                                    ${hangMeta(
                                        // Kho song ngữ lấy phiên âm của CHÍNH mặt
                                        // trước: `word.phonetic` đã bị chọn theo
                                        // `hienThi`, đảo chiều là nó thuộc mặt kia.
                                        laSongNgu
                                            ? boTruoc.phonetic
                                            : (!reversed ? (word.phonetic || '') : ''),
                                        word.type || ''
                                    )}
                                </div>
                            </div>
                            ${phuTruoc}
                        </div>

                        <div class="flashcard-back">
                            <!-- Cùng cụm góc như mặt trước: nút tim có ở CẢ HAI
                                 mặt, người dùng lật sang mặt kia vẫn đánh dấu
                                 được mà không phải lật về. -->
                            <div class="card-corner-group">
                                <button class="card-fav-btn${this._isFavorite(word.en) ? ' active' : ''}" id="fav-btn-sau" title="${this._isFavorite(word.en) ? 'Bỏ yêu thích' : 'Thêm yêu thích'}">
                                    <i class="${this._isFavorite(word.en) ? 'fas' : 'far'} fa-heart"></i>
                                </button>
                                <div class="card-corner-badge">${backBadge}</div>
                            </div>
                            <div class="card-content">
                                <h2 class="card-meaning">${reversed ? word.en : meaning}</h2>
                                ${hangMeta(
                                    // Phiên âm của MẶT SAU, ở cả hai chiều.
                                    // Trước đây chỉ hiện khi `reversed` — nên ở kho
                                    // song ngữ chiều thường, mặt EN không có phiên
                                    // âm nào dù dữ liệu có sẵn.
                                    laSongNgu ? boSau.phonetic : (reversed ? word.phonetic : ''),
                                    // Loại từ chỉ hiện ở mặt sau khi là kho song ngữ:
                                    // hai mặt đều là TỪ nên đều có loại. Ở hai kho cũ
                                    // mặt sau là NGHĨA, gắn loại từ vào đó là sai.
                                    laSongNgu ? (word.type || '') : ''
                                )}
                                ${phuSau}
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
            // Đọc MẶT SAU — thứ vừa lật ra. Trước đây luôn đọc `word.en`, nên
            // đảo chiều thì lật ra nghĩa mà loa lại đọc từ, còn ở kho song ngữ
            // thì đọc chữ Hán bằng giọng Anh.
            setTimeout(() => this.pronounce(this.chuMat(word, true)), 300);
        }

        // Tự phát âm mặt TRƯỚC khi vừa hiện thẻ.
        //
        // Trước đây bỏ hẳn khi đảo chiều vì mặt trước là tiếng Việt mà hệ thống
        // chỉ có giọng Anh/Trung. Nay `speakWord` nhận diện được tiếng Việt và
        // có giọng riêng, nên chiều nào cũng đọc được.
        if (!this.isFlipped && GameState.state.settings.autoPronunciation) {
            setTimeout(() => this.pronounce(this.chuMat(word)), 500);
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
            // Đọc mặt ĐANG hiện, không phải luôn `word.en`.
            this.pronounce(this.chuMat(word, this.isFlipped));
        });

        // Nút loa cho câu ví dụ và từ đồng nghĩa.
        // `stopPropagation` là BẮT BUỘC: cả thẻ đã có listener lật thẻ
        // (`flashcard?.addEventListener` ở trên), không chặn thì mỗi lần nghe là
        // thẻ lật một cái.
        // Không truyền ngôn ngữ — `speakWord` tự nhận chữ Hán và đổi sang zh-CN.
        document.querySelectorAll('.card-speak').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Đọc THẲNG nội dung trong `data-speak`, không tra lại
                // `word.example`/`word.synonyms`: kho song ngữ có HAI bộ (một
                // cho mỗi mặt) nên tra theo tên khoá luôn ra bộ của mặt kia.
                const text = btn.dataset.speak;
                if (text) this.pronounceText(text);
            });
        });

        // Nút DỊCH. `stopPropagation` vì cả thẻ là nút lật — không chặn thì mỗi
        // lần bấm dịch là thẻ lật một cái, cùng lý do với nút loa ở trên.
        document.querySelectorAll('.card-translate').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const text = btn.dataset.tr;
                if (text) EventBus.emit(GameEvents.TRANSLATE_REQUESTED, { text });
            });
        });

        this.napPhienAm(word);

        const knownBtn = document.getElementById('known-btn');
        knownBtn?.addEventListener('click', () => {
            this.markAsKnown(word);
        });

        const unknownBtn = document.getElementById('unknown-btn');
        unknownBtn?.addEventListener('click', () => {
            this.markAsUnknown(word);
        });

        // Gắn theo CLASS, không theo id: nút tim có ở cả hai mặt thẻ, mà
        // `getElementById` chỉ trả về một — mặt sau bấm sẽ không có tác dụng.
        document.querySelectorAll('.card-fav-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                // Cả thẻ là nút lật; không chặn thì bấm tim là thẻ lật một cái.
                e.stopPropagation();
                this._toggleFavorite(word);
            });
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
            // Phím P: đọc mặt ĐANG hiện.
            this.pronounce(this.chuMat(this.words[this.currentIndex], this.isFlipped));
        }
    },

    flipCard() {
        const inner = document.getElementById('flashcard-inner');
        if (!inner) return;

        this.isFlipped = !this.isFlipped;

        // NGẮT tiếng đang phát trước khi đọc mặt mới.
        //
        // Không ngắt thì giọng mặt cũ còn đang đọc mà mặt mới đã bắt đầu — hai
        // tiếng chồng nhau, và lật nhanh vài lần là chồng ba bốn lớp.
        GameLogic.stopSpeaking();

        const currentWord = this.words[this.currentIndex];
        const chineseSection = document.querySelector('.card-chinese-section');

        inner.classList.toggle('flipped', this.isFlipped);
        if (chineseSection) {
            chineseSection.classList.remove('chinese-collapsed');
        }

        // Đọc mặt VỪA LẬT RA, ở CẢ HAI chiều lật.
        //
        // Trước đây chỉ đọc khi lật SANG mặt sau; lật về mặt trước thì im lặng,
        // nên hành vi khác nhau tuỳ chiều mà không có lý do gì.
        //
        // Hoãn 350ms cho khớp hiệu ứng lật (`transition: transform 0.6s`): đọc
        // ngay thì tiếng đi trước hình.
        setTimeout(() => {
            // Bỏ nếu người dùng đã lật tiếp hoặc sang thẻ khác trong lúc chờ.
            if (this.words[this.currentIndex] !== currentWord) return;
            this.pronounce(this.chuMat(currentWord, this.isFlipped));
        }, 350);

        if (this.isFlipped) {
            setTimeout(() => {
                const cs = document.querySelector('.card-chinese-section');
                if (cs) cs.classList.add('chinese-collapsed');
            }, 2000);
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

    /**
     * Đọc một đoạn bất kỳ trên thẻ (câu ví dụ, từ đồng nghĩa).
     *
     * Tách khỏi `pronounce`: hàm kia gắn cứng hiệu ứng vào nút `#pronounce-btn`
     * của mặt trước, dùng lại thì bấm nghe câu ví dụ lại làm nút kia nhấp nháy.
     *
     * KHÔNG truyền ngôn ngữ: `speakWord` tự phát hiện chữ Hán và chuyển sang
     * zh-CN (gameLogic.js:304). Truyền cứng 'en-US' là đọc câu tiếng Trung bằng
     * giọng tiếng Anh.
     */
    /**
     * Phiên âm cho câu ví dụ và từ đồng nghĩa — IPA (Anh) hoặc pinyin (Trung).
     *
     * KHÔNG `await`: đây là thông tin phụ trợ, chờ nó là chặn cả thẻ. Điền vào
     * sau khi mạng trả về.
     *
     * Kiểm lại chỉ số thẻ trước khi ghi: người dùng bấm "Tiếp" nhanh hơn mạng
     * thì phiên âm của thẻ trước hiện dưới thẻ sau.
     */
    napPhienAm(word) {
        const idxLucGoi = this.currentIndex;
        // Quét theo phần tử ĐANG CÓ trên thẻ thay vì gõ cứng hai khoá.
        //
        // Kho song ngữ dựng bốn ô (`-truoc` / `-sau` × ví dụ / đồng nghĩa), hai
        // kho cũ chỉ dựng hai ô không hậu tố. Gõ cứng thì hoặc bỏ sót hai mặt,
        // hoặc tìm phần tử không tồn tại.
        const oPhienAm = [...document.querySelectorAll('[id^="fc-ph-"]')].map((el) => {
            // Text lấy từ chính khối chứa nó — đúng bộ của mặt đó.
            const nut = el.closest('.card-example, .card-synonyms')?.querySelector('.card-speak');
            return [el.id, nut?.dataset.speak || ''];
        });

        for (const [khoa, text] of oPhienAm) {
            if (!text) continue;
            layPhienAmCau(text).then((ph) => {
                if (!ph || this.currentIndex !== idxLucGoi) return;
                const el = document.getElementById(khoa);
                if (el) el.textContent = ph;
            });
        }
    },

    pronounceText(text) {
        if (!text) return;
        GameLogic.speakWord(text);
    },

    pronounce(text) {
        if (!text) return;
        // KHÔNG truyền ngôn ngữ: `speakWord` tự nhận diện hệ chữ (Hán / có dấu
        // tiếng Việt / Latin) rồi chọn giọng. Truyền cứng 'en-US' là ghi đè mất
        // phần đó — kho song ngữ đặt chữ Hán vào `word.en`, nên đọc bằng giọng
        // Mỹ ra một tràng vô nghĩa.
        GameLogic.speakWord(text);

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
        // Cập nhật CẢ HAI nút mà không re-render toàn bộ thẻ.
        //
        // Chỉ sửa một cái thì lật sang mặt kia sẽ thấy trái tim rỗng dù từ đã
        // được đánh dấu — và bấm lần nữa là bỏ mất luôn.
        const nowFav = !isFav;
        document.querySelectorAll('.card-fav-btn').forEach((btn) => {
            btn.classList.toggle('active', nowFav);
            btn.title = nowFav ? 'Bỏ yêu thích' : 'Thêm yêu thích';
            const icon = btn.querySelector('i');
            if (icon) icon.className = nowFav ? 'fas fa-heart' : 'far fa-heart';
        });
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

