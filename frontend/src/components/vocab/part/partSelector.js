import { Storage } from '@lib/storage.js';
import { GameState } from '@game/state.js';
import { Utils } from '@lib/utils.js';
import { GameLogic } from '@game/gameLogic.js';
import { EventBus, GameEvents } from '@game/eventBus.js';
import { Notification } from '@ui/Toaster.jsx';
import { Modal } from '@ui/Modal.jsx';

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
                const lv = (w.level || '')[0];
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

        // Tự phục hồi: vocab rỗng nhưng ĐÃ chọn đề trước đó (currentSource) →
        // nạp lại nguồn thay vì bắt user F5. 'vocab:loaded' sẽ dựng lại lưới Part.
        if ((GameLogic.vocabularyData?.length || 0) === 0 && GameLogic.currentSource) {
            GameLogic.loadVocabularyBySource(GameLogic.currentSource).catch(() => {});
        }

        const getLevelBar = (part) => {
            const s = this.partStats?.[part];
            if (!s) return '';
            const total = s.count;
            if (!total) return '';
            const { a, b, c } = s;
            const pA = Math.round(a / total * 100);
            const pB = Math.round(b / total * 100);
            const pC = 100 - pA - pB;
            const segments = [
                a ? `<div style="flex:${pA};background:#22c55e;height:100%;border-radius:${b||c?'3px 0 0 3px':'3px'}" title="A: ${a} từ"></div>` : '',
                b ? `<div style="flex:${pB};background:#f59e0b;height:100%" title="B: ${b} từ"></div>` : '',
                c ? `<div style="flex:${pC};background:#ef4444;height:100%;border-radius:${a||b?'0 3px 3px 0':'3px'}" title="C: ${c} từ"></div>` : '',
            ].join('');
            const labels = [
                a ? `<span style="color:#22c55e">A: ${a}</span>` : '',
                b ? `<span style="color:#f59e0b">B: ${b}</span>` : '',
                c ? `<span style="color:#ef4444">C: ${c}</span>` : '',
            ].filter(Boolean).join(' • ');
            return `
                <div style="margin-top:6px">
                    <div style="display:flex;height:5px;border-radius:3px;overflow:hidden;gap:1px">${segments}</div>
                    <div style="display:flex;gap:6px;font-size:10px;margin-top:3px;opacity:0.85">${labels}</div>
                </div>`;
        };

        const renderModal = () => {
            const partsHTML = this.parts.map(part => {
                const isSelected = this.selectedPart === part;
                const disabled = currentMode === 'random-all';
                return `
                    <div class="topic-card ${isSelected ? 'selected' : ''} ${disabled ? 'part-card-disabled' : ''}"
                         data-part="${part}" style="cursor:${disabled ? 'not-allowed' : 'pointer'}">
                        <div class="topic-icon"><i class="fas fa-layer-group"></i></div>
                        <div class="topic-info">
                            <h3 title="${part}">${part}</h3>
                            <p>${this.partCounts[part]} từ vựng</p>
                            ${!disabled ? getLevelBar(part) : ''}
                        </div>
                        ${isSelected ? '<div class="topic-action"><i class="fas fa-check-circle" style="color:#10b981;font-size:20px"></i></div>' : ''}
                    </div>`;
            }).join('');

            const modes = [
                { id: 'sequential',  icon: 'fa-list-ol', label: 'Tuần tự',           sub: 'Học lần lượt từ đầu đến cuối Part' },
                { id: 'random-part', icon: 'fa-shuffle', label: 'Ngẫu nhiên 1 Part', sub: 'Lấy ngẫu nhiên trong Part đã chọn' },
                { id: 'random-all',  icon: 'fa-globe',   label: 'Ngẫu nhiên tất cả', sub: 'Lấy ngẫu nhiên từ toàn bộ Parts' },
            ];

            return `
                <div class="part-selector-modal">
                    <div class="pmode-group">
                        ${modes.map(m => `
                            <button class="pmode-btn ${currentMode === m.id ? 'pmode-btn--active' : ''}" data-mode="${m.id}">
                                <i class="fas ${m.icon}"></i>
                                <span class="pmode-label">${m.label}</span>
                                <span class="pmode-sub">${m.sub}</span>
                            </button>`).join('')}
                    </div>
                    ${currentMode === 'random-all'
                        ? `<p class="pmode-hint pmode-hint--disabled"><i class="fas fa-lock"></i> Chế độ này không cần chọn Part</p>`
                        : !this.selectedPart
                            ? `<p class="pmode-hint pmode-hint--warn"><i class="fas fa-triangle-exclamation"></i> Chưa chọn Part — sẽ lấy ngẫu nhiên toàn bộ</p>`
                            : `<p class="pmode-hint"><i class="fas fa-info-circle"></i> Chọn Part bên dưới để áp dụng</p>`}
                    <div class="topics-grid ${currentMode === 'random-all' ? 'topics-grid--disabled' : ''}">
                        ${(GameLogic.vocabularyData?.length || 0) === 0
                            ? `<div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;text-align:center;color:var(--text-secondary);padding:28px 0">
                                    <i class="fas fa-book-open" style="font-size:32px;opacity:.4;margin-bottom:10px"></i>
                                    <p style="margin:0 0 12px">Chưa có từ vựng — vui lòng chọn đề luyện tập trước.</p>
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
        const onVocabLoaded = () => {
            if (!this._modalOpen) return;
            this.loadParts();
            const body = document.querySelector('#modal-container .modal-body');
            if (body) { body.innerHTML = renderModal(); setupHeaderSearch(); attachListeners(); }
        };
        this._unsubVocab?.();
        this._unsubVocab = EventBus.on('vocab:loaded', onVocabLoaded);

        Modal.show({
            title: '📚 Chọn Part để luyện tập',
            content: renderModal(),
            onClose: () => {
                this.pendingMode = null;
                this._modalOpen = false;
                this._unsubVocab?.();
                this._unsubVocab = null;
            },
        });

        const applyPartFilter = () => {
            const kw = searchQuery.trim().toLowerCase();
            document.querySelectorAll('.topic-card[data-part]').forEach(card => {
                const part = (card.dataset.part || '').toLowerCase();
                card.style.display = (!kw || part.includes(kw)) ? '' : 'none';
            });
        };

        // Inject a search box into the modal header (cạnh tiêu đề, giống popup Chọn đề)
        const setupHeaderSearch = () => {
            const header = document.querySelector('#modal-container .modal-header');
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
            const input = document.getElementById('part-search-input');
            if (input) input.style.display = currentMode === 'random-all' ? 'none' : '';
        };

        const attachListeners = () => {
            applyPartFilter();           // re-apply filter after body re-render
            updateHeaderSearchVisibility();

            document.querySelectorAll('.pmode-btn').forEach(btn => {
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
                    const body = document.querySelector('.modal-body');
                    if (body) { body.innerHTML = renderModal(); attachListeners(); }
                });
            });

            document.querySelectorAll('.topic-card[data-part]').forEach(card => {
                card.addEventListener('click', async () => {
                    if (currentMode === 'random-all') {
                        currentMode = 'random-part';
                        this.practiceMode = 'random-part';
                        await Storage.set('practiceMode', 'random-part');
                        await this._saveSetting('randomQuestions', true);
                        const body = document.querySelector('.modal-body');
                        if (body) { body.innerHTML = renderModal(); attachListeners(); }
                        return;
                    }
                    this.selectPart(card.dataset.part);
                });
            });

            // Chưa có từ vựng → nút mở popup chọn đề (giữ pendingMode để quay lại luyện tập).
            document.getElementById('part-choose-topic')?.addEventListener('click', () => {
                const mode = this.pendingMode;
                Modal.close();
                EventBus.emit(GameEvents.TOPIC_MODAL_REQUESTED, { pendingMode: mode });
            });
        };

        setTimeout(() => { setupHeaderSearch(); attachListeners(); }, 50);
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
        const badge = document.getElementById('part-badge');
        const badgeText = document.getElementById('part-badge-text');
        if (this.selectedPart) {
            if (badge) badge.style.display = 'flex';
            if (badgeText) badgeText.textContent = this.selectedPart;
        } else {
            if (badge) badge.style.display = 'none';
        }
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
