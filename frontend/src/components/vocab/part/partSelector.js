import { Storage } from '@lib/storage.js';
import { GameState } from '@game/state.js';
import { Utils } from '@lib/utils.js';
import { GameLogic } from '@game/gameLogic.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { Notification } from '@ui/Toaster.jsx';
import { Modal } from '@ui/Modal.jsx';
import { toBand } from '@lib/levelBands.js';
import { theoDoiCuon } from '@lib/scrollMemory.js';

export const PartSelector = {
    parts: [],
    selectedPart: null,
    practiceMode: 'sequential',
    partCounts: {},
    partStats: {},
    retryWords: null,
    pendingMode: null,

    async init() {
        await this.loadParts();
        this.updateSessionBadge();
        await this.loadSelectedPart();
    },

    async loadParts() {
        try {
            const vocabulary = GameLogic.vocabularyData || [];
            // Gộp count + phân bố level (A/B/C) trong MỘT vòng lặp O(N) — trước đây
            // filter toàn bộ vocab cho mỗi part (O(part × từ)) → đơ khi source lớn.
            const stats = {};
            for (const w of vocabulary) {
                if (!w.part) continue;
                let s = stats[w.part];
                if (!s) s = stats[w.part] = { count: 0, a: 0, b: 0, c: 0 };
                s.count++;
                // `toBand` hiểu CẢ hai khung: CEFR (A1/B2…) và HSK (HSK1…HSK7-9).
                //
                // Bản cũ lấy CHỮ CÁI ĐẦU — đúng với CEFR nhưng "HSK1" ra chữ
                // "H", không rơi vào nhóm nào. Sau khi kho tiếng Trung chuyển
                // sang HSK thì MỌI thẻ Part mất dải phân bố độ khó, mà không có
                // lỗi nào báo: dữ liệu vẫn đủ, chỉ là không phân loại được.
                const lv = toBand(w.level);
                if (lv === 'A') s.a++; else if (lv === 'B') s.b++; else if (lv === 'C') s.c++;
            }
            this.partStats = stats;
            this.parts = Object.keys(stats).sort();
            this.partCounts = {};
            this.parts.forEach(part => { this.partCounts[part] = stats[part].count; });
        } catch {
            this.parts = [];
            this.partStats = {};
        }
    },

    async loadSelectedPart() {
        const [savedPart, savedMode] = await Promise.all([
            Storage.get('selectedPart'),
            Storage.get('practiceMode'),
        ]);
        if (savedPart && this.parts.includes(savedPart)) {
            this.selectedPart = savedPart;
            GameState.state.settings.selectedPart = savedPart;
            this.updatePartBadge();
        }
        // Mặc định Tuần tự nếu chưa có lựa chọn lưu trước đó
        this.practiceMode = savedMode || 'sequential';
        GameState.state.settings.randomQuestions = this.practiceMode !== 'sequential';
        this.updateSessionBadge();
    },

    showPartSelectionModal() {
        // Reload parts in case vocabulary finished loading after init
        this.loadParts();
        let currentMode = this.practiceMode || 'sequential';
        let searchQuery = '';

        // Tự phục hồi: vocab rỗng nhưng ĐÃ chọn đề trước đó → nạp lại thay vì bắt
        // user F5. 'vocab:loaded' sẽ dựng lại lưới Part.
        //
        // Chỉ PHÁT YÊU CẦU, không tự gọi API. Trước đây chỗ này gọi thẳng
        // `GameLogic.loadVocabularyBySource()`, mà hàm đó đi `/api/vocabulary` —
        // kho CHUNG. Bộ từ riêng, bộ được chia sẻ và nhóm từ sai không nằm ở đó,
        // nên nó trả về rỗng, `.catch(() => {})` nuốt luôn, và người dùng thấy
        // lưới Part trống không kèm lời giải thích nào.
        //
        // TopicSelector biết nguồn đang chọn đi đường nào; nó nghe sự kiện này.
        if ((GameLogic.vocabularyData?.length || 0) === 0 && GameLogic.currentSource) {
            EventBus.emit('vocab:reload-requested');
        }

        // Thanh phân bố độ khó: CHỈ dải màu, không chữ.
        //
        // Bản cũ in kèm dòng "A: 18 • B: 5" bên dưới — ba con số đó làm mỗi thẻ
        // cao thêm một dòng mà không ai đọc. Dải màu thì liếc một cái là thấy
        // ngay Part nào nhiều từ khó. Con số vẫn còn ở `title` của từng đoạn,
        // rê chuột là ra (desktop mới có chuột — hợp lý vì thanh này cũng chỉ
        // hiện ở desktop, xem `.part-level-bar` trong topicSelector.css).
        const getLevelBar = (part) => {
            const s = this.partStats?.[part];
            if (!s || !s.count) return '';
            const total = s.count;
            const { a, b, c } = s;
            const pA = Math.round(a / total * 100);
            const pB = Math.round(b / total * 100);
            const pC = 100 - pA - pB;
            const segments = [
                a ? `<div style="flex:${pA};background:#22c55e;height:100%;border-radius:${b||c?'3px 0 0 3px':'3px'}" title="A: ${a} từ"></div>` : '',
                b ? `<div style="flex:${pB};background:#f59e0b;height:100%" title="B: ${b} từ"></div>` : '',
                c ? `<div style="flex:${pC};background:#ef4444;height:100%;border-radius:${a||b?'0 3px 3px 0':'3px'}" title="C: ${c} từ"></div>` : '',
            ].join('');
            return `<div class="part-level-bar">${segments}</div>`;
        };

        const renderModal = () => {
            // Thẻ Part: TÊN + số từ + dải màu độ khó (dải chỉ hiện ở desktop).
            //
            // Số từ dùng đúng khuôn `.topic-meta > .word-count` của popup "Chọn
            // đề luyện tập" (kèm icon sách) để hai popup trông như một, thay vì
            // thẻ <p> tự chế như bản cũ.
            const partsHTML = this.parts.map(part => {
                const isSelected = this.selectedPart === part;
                const disabled = currentMode === 'random-all';
                return `
                    <div class="topic-card ${isSelected ? 'selected' : ''} ${disabled ? 'part-card-disabled' : ''}"
                         data-part="${part}" style="cursor:${disabled ? 'not-allowed' : 'pointer'}">
                        <div class="topic-icon"><i class="fas fa-layer-group"></i></div>
                        <div class="topic-info">
                            <h3 title="${part}">${part}</h3>
                            <div class="topic-meta">
                                <span class="word-count"><i class="fas fa-book"></i> ${this.partCounts[part]} từ</span>
                            </div>
                            ${!disabled ? getLevelBar(part) : ''}
                        </div>
                        ${isSelected ? '<div class="topic-action"><i class="fas fa-check-circle" style="color:#10b981;font-size:20px"></i></div>' : ''}
                    </div>`;
            }).join('');

            // Không còn dòng `sub` mô tả dưới mỗi nút: ba cái nhãn đã tự nói hết
            // ý ("Tuần tự" / "Ngẫu nhiên 1 Part" / "Ngẫu nhiên tất cả"), thêm một
            // câu giải thích nữa chỉ làm dày thanh chọn và đẩy lưới Part xuống
            // dưới nếp gấp. Giữ lại ở `title` cho ai cần rê chuột xem.
            const modes = [
                { id: 'sequential',  icon: 'fa-list-ol', label: 'Tuần tự',           sub: 'Học lần lượt từ đầu đến cuối Part' },
                { id: 'random-part', icon: 'fa-shuffle', label: 'Ngẫu nhiên 1 Part', sub: 'Lấy ngẫu nhiên trong Part đã chọn' },
                { id: 'random-all',  icon: 'fa-globe',   label: 'Ngẫu nhiên tất cả', sub: 'Lấy ngẫu nhiên từ toàn bộ Parts' },
            ];

            return `
                <div class="part-selector-modal">
                    <div class="pmode-group">
                        ${modes.map(m => `
                            <button class="pmode-btn ${currentMode === m.id ? 'pmode-btn--active' : ''}" data-mode="${m.id}" title="${m.sub}">
                                <i class="fas ${m.icon}"></i>
                                <span class="pmode-label">${m.label}</span>
                            </button>`).join('')}
                    </div>
                    ${currentMode === 'random-all'
                        ? `<p class="pmode-hint pmode-hint--disabled"><i class="fas fa-lock"></i> Chế độ này không cần chọn Part</p>`
                        : !this.selectedPart
                            ? `<p class="pmode-hint pmode-hint--warn"><i class="fas fa-triangle-exclamation"></i> Chưa chọn Part — sẽ lấy ngẫu nhiên toàn bộ</p>`
                            : `<p class="pmode-hint"><i class="fas fa-info-circle"></i> Chọn Part bên dưới để áp dụng</p>`}
                    <div class="topics-grid ${currentMode === 'random-all' ? 'topics-grid--disabled' : ''}">
                        ${(GameLogic.vocabularyData?.length || 0) === 0
                            ? `<div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;text-align:center;color:var(--text-secondary);padding:16px 0">
                                    <i class="fas fa-book-open" style="font-size:26px;opacity:.4;margin-bottom:8px"></i>
                                    <p style="margin:0 0 10px">Chưa có từ vựng — vui lòng chọn đề luyện tập trước.</p>
                                    <button class="btn btn-primary" id="part-choose-topic"><i class="fas fa-list"></i> Chọn đề luyện tập</button>
                               </div>`
                            : (partsHTML || '<p style="text-align:center;color:#999">Không có Parts</p>')}
                    </div>
                </div>`;
        };

        // Khi vocab tải xong (nếu modal mở trước lúc nạp xong) → dựng lại lưới Part.
        // Chỉ đụng DOM khi part-modal VẪN là modal đang mở (tránh listener cũ ghi
        // đè popup khác → "đơ"). Huỷ subscription cũ trước khi đăng ký mới (chống chồng).
        this._modalOpen = true;

        /**
         * Gốc DOM của ĐÚNG popup này.
         *
         * Có lúc tồn tại HAI phần tử `#modal-container` cùng lúc: `TopicModal`
         * là component React, nó chưa được gỡ khỏi cây thì popup Part (dựng
         * bằng `Modal.show`) đã mọc lên. Đúng tình huống "chọn đề xong → popup
         * Part tự mở".
         *
         * Khi đó `document.querySelector('#modal-container .modal-body')` trả về
         * cái ĐẦU TIÊN — tức modal CŨ. Listener gắn vào thẻ Part của modal cũ,
         * còn thẻ đang hiển thị thì không có listener nào: bấm không ăn, phải
         * đóng popup mở lại mới chọn được Part.
         *
         * Lấy cái CUỐI cùng vì popup mới luôn được thêm vào sau.
         */
        const root = () => {
            const all = document.querySelectorAll('#modal-container');
            return all[all.length - 1] || document;
        };
        const q = (sel) => root().querySelector(sel);
        const qa = (sel) => root().querySelectorAll(sel);

        // Khai báo TRƯỚC `Modal.show`: `onClose` và `onVocabLoaded` bên dưới đều
        // đụng tới nó.
        let _refreshTimer = null;
        const onVocabLoaded = () => {
            if (!this._modalOpen) return;
            this.loadParts();
            const body = q('.modal-body');
            if (body) { body.innerHTML = renderModal(); setupHeaderSearch(); attachListeners(); }
            // Tải xong thì trả nút về trạng thái bấm được. Đặt ở đây chứ không
            // hẹn giờ trong hàm bấm: chỉ chỗ này mới biết dữ liệu đã thực sự về.
            setRefreshing(false);
        };
        // Nghe CẢ HAI sự kiện, vì mỗi đường tải phát một cái khác nhau:
        //
        //   `vocab:loaded`   — chỉ gameLogic phát, tức là kho CHUNG.
        //   `topic:changed`  — topicSelector phát ở cả 4 nhánh (đề chung, bộ
        //                      riêng, bộ được chia sẻ, nhóm từ sai).
        //
        // Chỉ nghe `vocab:loaded` là lỗi đang gặp: đang dùng bộ từ RIÊNG mà bấm
        // Tải lại thì `selectPersonalTopic` đặt thẳng `GameLogic.vocabularyData`
        // rồi phát `topic:changed` — không có `vocab:loaded` nào cả. Lưới Part
        // không dựng lại, nút quay đủ 10 giây rồi báo "không tải lại được",
        // TRONG KHI dữ liệu đã về xong từ lâu.
        this._unsubVocab?.();
        const offLoaded = EventBus.on('vocab:loaded', onVocabLoaded);
        const offChanged = EventBus.on('topic:changed', onVocabLoaded);
        this._unsubVocab = () => { offLoaded?.(); offChanged?.(); };

        Modal.show({
            title: '📚 Chọn Part để luyện tập',
            content: renderModal(),
            // Nút Đóng ở đáy — giống popup "Chọn đề luyện tập". Trên điện thoại
            // nút × ở góc trên phải nằm ngoài tầm ngón cái, mà đây là popup dài
            // phải cuộn: đọc tới cuối rồi còn phải vuốt ngược lên mới đóng được.
            buttons: [{ text: 'Đóng', className: 'btn-secondary' }],
            onClose: () => {
                // Gỡ theo dõi cuộn TRƯỚC mọi thứ khác: listener treo trên phần
                // tử đã bị Modal gỡ khỏi cây thì không ai dọn nữa.
                this._goCuon?.();
                this._goCuon = null;
                this.pendingMode = null;
                this._modalOpen = false;
                this._unsubVocab?.();
                this._unsubVocab = null;
                // Đóng lúc đang tải mà không huỷ thì 10 giây sau vẫn nhảy ra
                // thông báo lỗi cho một popup đã biến mất.
                clearTimeout(_refreshTimer);
            },
        });

        // Nhớ vị trí cuộn qua các lần mở lại. Popup này có hàng chục Part; cuộn
        // lại từ đầu mỗi lần mở là việc lặp đi lặp lại mà máy làm được.
        //
        // Bám `.modal-body` chứ KHÔNG phải `.topics-grid`: lưới Part không có
        // `overflow` riêng (xem `layout.css`), phần cuộn thật là thân modal.
        // Bám nhầm thì `scrollTop` luôn bằng 0 và tính năng im lặng không chạy.
        //
        // Gắn SAU `Modal.show` vì trước đó chưa có DOM để bám vào; `root()` neo
        // vào modal CUỐI CÙNG nên không trúng popup cũ còn sót lại một nhịp.
        this._goCuon?.();
        this._goCuon = theoDoiCuon('part-selector', q('.modal-body'));

        const applyPartFilter = () => {
            const kw = searchQuery.trim().toLowerCase();
            qa('.topic-card[data-part]').forEach(card => {
                const part = (card.dataset.part || '').toLowerCase();
                card.style.display = (!kw || part.includes(kw)) ? '' : 'none';
            });
        };

        /** Bật/tắt trạng thái "đang tải" của nút Tải lại. */
        const setRefreshing = (busy) => {
            const btn = q('#part-refresh-btn');
            clearTimeout(_refreshTimer);
            _refreshTimer = null;
            if (!btn) return;
            btn.disabled = busy;
            const icon = btn.querySelector('i');
            if (icon) icon.className = `fas fa-rotate-right${busy ? ' fa-spin' : ''}`;

            // Chốt chặn: `vocab:loaded` chỉ phát khi tải THÀNH CÔNG. Nguồn lỗi
            // mạng hoặc trả về rỗng thì `loadVocabularyBySource` return false
            // lặng lẽ, không có sự kiện nào — nút sẽ quay mãi không dừng. Hết
            // giờ thì trả nút về và nói rõ là không tải được.
            if (busy) {
                _refreshTimer = setTimeout(() => {
                    _refreshTimer = null;
                    setRefreshing(false);
                    Notification.error('Không tải lại được — thử lại sau');
                }, 10000);
            }
        };

        // Nút "Tải lại" — NGAY TRƯỚC nút đóng, giống popup "Chọn đề luyện tập".
        //
        // Chỉ PHÁT YÊU CẦU như chỗ tự phục hồi ở trên, không tự gọi API: nguồn
        // đang chọn có thể là kho chung / bộ riêng / bộ được chia sẻ / nhóm từ
        // sai, mỗi thứ một đường API mà file này không được biết (import ngược
        // `topicSelector` là vòng phụ thuộc). `vocab:loaded` sẽ dựng lại lưới.
        const setupHeaderRefresh = () => {
            const header = q('.modal-header');
            if (!header || header.querySelector('#part-refresh-btn')) return;
            const closeBtn = header.querySelector('.modal-close-btn');
            const btn = document.createElement('button');
            btn.id = 'part-refresh-btn';
            btn.type = 'button';
            btn.className = 'icon-btn modal-header-refresh';
            btn.title = 'Tải lại danh sách Part';
            btn.setAttribute('aria-label', 'Tải lại danh sách Part');
            btn.innerHTML = '<i class="fas fa-rotate-right"></i>';
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                if (!GameLogic.currentSource) {
                    Notification.info('Chưa chọn đề — không có gì để tải lại');
                    return;
                }
                setRefreshing(true);
                EventBus.emit('vocab:reload-requested');
            });
            header.insertBefore(btn, closeBtn);
        };

        // Inject a search box into the modal header (cạnh tiêu đề, giống popup Chọn đề)
        const setupHeaderSearch = () => {
            const header = q('.modal-header');
            if (!header || header.querySelector('#part-search-input')) return;
            const closeBtn = header.querySelector('.modal-close-btn');
            const input = document.createElement('input');
            input.id = 'part-search-input';
            input.type = 'search';
            input.autocomplete = 'off';
            input.placeholder = 'Tìm Part...';
            input.value = searchQuery;
            // Khớp đúng style search của popup Chọn đề (TopicModal): class + max-width 320px
            input.className = 'modal-header-search';
            input.style.cssText = 'flex:1;max-width:320px;margin-left:16px;margin-right:8px;padding:6px 10px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font-size:13px;outline:none';
            input.addEventListener('input', (e) => {
                searchQuery = e.target.value;
                applyPartFilter();
            });
            header.insertBefore(input, closeBtn);
            updateHeaderSearchVisibility();
        };

        const updateHeaderSearchVisibility = () => {
            const input = q('#part-search-input');
            if (input) input.style.display = currentMode === 'random-all' ? 'none' : '';
        };

        const attachListeners = () => {
            applyPartFilter();           // re-apply filter after body re-render
            updateHeaderSearchVisibility();

            qa('.pmode-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const mode = btn.dataset.mode;
                    currentMode = mode;
                    this.practiceMode = mode;
                    await Storage.set('practiceMode', mode);
                    await this._saveSetting('randomQuestions', mode !== 'sequential');
                    if (mode === 'random-all') {
                        this.selectedPart = null;
                        GameState.state.settings.selectedPart = null;
                        await Storage.remove('selectedPart');
                        this.updatePartBadge();
                        await GameState.save();
                    }
                    const body = q('.modal-body');
                    if (body) { body.innerHTML = renderModal(); attachListeners(); }
                });
            });

            qa('.topic-card[data-part]').forEach(card => {
                card.addEventListener('click', async () => {
                    if (currentMode === 'random-all') {
                        currentMode = 'random-part';
                        this.practiceMode = 'random-part';
                        await Storage.set('practiceMode', 'random-part');
                        await this._saveSetting('randomQuestions', true);
                        const body = q('.modal-body');
                        if (body) { body.innerHTML = renderModal(); attachListeners(); }
                        return;
                    }
                    this.selectPart(card.dataset.part);
                });
            });

            // Chưa có từ vựng → nút mở popup chọn đề (giữ pendingMode để quay lại luyện tập).
            q('#part-choose-topic')?.addEventListener('click', () => {
                const mode = this.pendingMode;
                Modal.close();
                EventBus.emit(GameEvents.TOPIC_MODAL_REQUESTED, { pendingMode: mode });
            });
        };

        // Thứ tự gọi QUYẾT ĐỊNH thứ tự hiển thị: cả hai đều chèn ngay trước nút
        // đóng, nên cái gọi sau nằm sát nút đóng hơn. Muốn "tìm · tải lại · đóng"
        // thì phải gọi search trước.
        setTimeout(() => { setupHeaderSearch(); setupHeaderRefresh(); attachListeners(); }, 50);
    },

    async _saveSetting(key, value) {
        GameState.state.settings[key] = value;
        await GameState.save();
        this.updateSessionBadge();
    },

    async selectPart(part) {
        this.selectedPart = part;
        GameState.state.settings.selectedPart = part;
        await Storage.set('selectedPart', part);

        const partWords = GameLogic.getWordsByPart(part) || [];
        this.updatePartBadge();
        await GameState.save();
        // Chốt pendingMode TRƯỚC khi đóng modal — onClose sẽ xoá nó (timing React
        // không đảm bảo chạy trước/sau dòng dưới).
        const pendingMode = this.pendingMode;
        Modal.close();

        if (pendingMode) {
            const mode = pendingMode;
            this.pendingMode = null;
            Notification.success(`Đã chọn ${part} — Bắt đầu luyện tập với ${partWords.length} từ...`);
            setTimeout(() => EventBus.emit(GameEvents.PRACTICE_REQUESTED, { mode }), 300);
        } else {
            Notification.success(`Đã chọn ${part} — ${partWords.length} từ vựng sẵn sàng!`);
        }
    },

    updatePartBadge() {
        // KHÔNG sờ vào DOM nữa. Thẻ badge do StatusBar (React) render; đặt tay
        // `style.display` lên nó thì lần render sau React ghi đè về giá trị
        // trong JSX và badge biến mất bất chợt. Lúc khởi động còn tệ hơn: hàm
        // này chạy trước khi StatusBar kịp gắn vào cây nên ghi vào hư không.
        //
        // `updateSessionBadge()` đồng bộ `settings.selectedPart` rồi phát sự
        // kiện — React tự đọc và hiện đúng.
        this.updateSessionBadge();
    },

    updateSessionBadge() {
        // Đồng bộ settings để StatusBar (React) tự tính label, rồi báo nó refresh.
        const s = GameState.state?.settings;
        if (s) {
            s.randomQuestions = this.practiceMode !== 'sequential';
            s.selectedPart = this.selectedPart || null;
        }
        EventBus.emit(GameEvents.SESSION_BADGE_UPDATED);
    },

    async clearPart() {
        this.selectedPart = null;
        await Storage.remove('selectedPart');
        this.updatePartBadge();
        Notification.info('Đã xóa Part — Quay về chế độ ngẫu nhiên');
    },

    clearSelection() {
        this.selectedPart = null;
        this.updatePartBadge();
        Storage.remove('selectedPart');
    },

    async reloadParts() {
        await this.loadParts();
    },

    async getWordsForPractice(requestedCount, offset = 0) {
        if (this.retryWords?.length > 0) {
            const words = [...this.retryWords];
            this.retryWords = null;
            return words;
        }

        const settings = GameState.state.settings;
        const isRandom = settings.randomQuestions !== false;
        this.selectedPart = settings.selectedPart || null;

        let pool;
        if (this.selectedPart) {
            pool = GameLogic.getWordsByPart(this.selectedPart) || [];
        } else {
            const levelFilter = settings.levelFilter;
            const vocab = GameLogic.vocabularyData || [];
            pool = (levelFilter?.length > 0)
                ? vocab.filter(w => w.level && levelFilter.includes(w.level))
                : [...vocab];
        }

        const rawQPS = settings.questionsPerSession;
        const isAuto = rawQPS === 'auto';
        const limit = isAuto ? pool.length : (rawQPS || requestedCount || 20);
        const count = Math.min(limit, pool.length);

        if (isRandom) {
            // Random already varies each session — offset is irrelevant.
            return Utils.randomSample(pool, count);
        }
        // Sequential: serve the next `count` from `offset` so "Học tiếp"
        // advances to the next batch instead of repeating. Wrap to the
        // start once the dataset is exhausted.
        if (pool.length === 0) return [];
        const start = offset % pool.length;
        const slice = pool.slice(start, start + count);
        return slice.length > 0 ? slice : pool.slice(0, count);
    },

    reset() { this.clearPart(); },
};
