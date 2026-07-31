export const ReviewOverlay = {
    answers: [],
    currentIdx: 0,
    wrongIndices: [],
    wrongPos: 0,
    _keyHandler: null,

    show(answers) {
        this.answers = answers;
        this.wrongIndices = answers.reduce((acc, a, i) => { if (!a.isCorrect) acc.push(i); return acc; }, []);
        this.wrongPos = 0;
        this.currentIdx = this.wrongIndices.length > 0 ? this.wrongIndices[0] : 0;

        document.getElementById('review-overlay')?.remove();
        const el = document.createElement('div');
        el.id = 'review-overlay';
        document.body.appendChild(el);

        this._render(el);
        this._attachKeys();
    },

    close() {
        document.getElementById('review-overlay')?.remove();
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
    },

    _render(el) {
        el.innerHTML = `
            <div class="review-backdrop"></div>
            <div class="review-modal">
                <div class="review-header">
                    <span class="review-title"><i class="fas fa-eye"></i> Xem lại đáp án</span>
                    <button class="review-close-btn" id="review-close"><i class="fas fa-times"></i></button>
                </div>

                <div class="review-body">
                    <!-- Cột trái: danh sách số câu dọc -->
                    <div class="review-sidebar">
                        <div class="review-sidebar-legend">
                            <span class="legend-correct"><i class="fas fa-check-circle"></i> Đúng</span>
                            <span class="legend-wrong"><i class="fas fa-times-circle"></i> Sai</span>
                        </div>
                        <div class="review-num-list">
                            ${this.answers.map((a, i) => `
                                <button class="review-num-btn ${a.isCorrect ? 'correct' : 'wrong'} ${i === this.currentIdx ? 'active' : ''}"
                                    data-idx="${i}">
                                    <span class="num-label">${i + 1}</span>
                                    <i class="fas fa-${a.isCorrect ? 'check' : 'times'}"></i>
                                </button>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Cột phải: card + nav -->
                    <div class="review-main">
                        <div class="review-card-section">
                            ${this._buildCard()}
                        </div>
                        <div class="review-nav">
                            <button class="review-nav-btn" id="review-prev" ${this.wrongPos === 0 ? 'disabled' : ''}>
                                <i class="fas fa-chevron-left"></i> Câu trước
                            </button>
                            <span class="review-nav-info">
                                ${this.wrongIndices.length > 0
                                    ? `Câu sai ${this.wrongPos + 1} / ${this.wrongIndices.length}`
                                    : 'Không có câu sai 🎉'}
                            </span>
                            <button class="review-nav-btn" id="review-next" ${this.wrongPos >= this.wrongIndices.length - 1 ? 'disabled' : ''}>
                                Câu tiếp <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        el.querySelector('#review-close').addEventListener('click', () => this.close());
        el.querySelector('.review-backdrop').addEventListener('click', () => this.close());
        el.querySelector('#review-prev')?.addEventListener('click', () => this._navigate(-1));
        el.querySelector('#review-next')?.addEventListener('click', () => this._navigate(1));
        el.querySelectorAll('.review-num-btn').forEach(btn => {
            btn.addEventListener('click', () => this._jumpTo(Number(btn.dataset.idx)));
        });
    },

    _buildCard() {
        const a = this.answers[this.currentIdx];
        if (!a) return '<div class="review-card-empty">Không có dữ liệu</div>';

        const word = a.word;
        const num = this.currentIdx + 1;
        const questionPrompt = a.questionText || word?.en || '';
        const correctAnswer = a.correctAnswer || word?.vn || word?.vi || '—';

        const optionsHTML = a.options
            ? a.options.map(opt => {
                const isCorrect = opt === correctAnswer;
                const isChosen  = opt === a.userAnswer;
                let cls = 'review-option';
                if (isCorrect)             cls += ' review-option--correct';
                else if (isChosen)         cls += ' review-option--wrong';
                const icon = isCorrect
                    ? '<i class="fas fa-check-circle"></i>'
                    : isChosen
                        ? '<i class="fas fa-times-circle"></i>'
                        : '<i class="far fa-circle"></i>';
                return `<div class="${cls}">${icon}<span>${opt}</span></div>`;
            }).join('')
            : `<div class="review-option review-option--correct">
                   <i class="fas fa-check-circle"></i><span>${correctAnswer}</span>
               </div>
               ${!a.isCorrect && a.userAnswer ? `
               <div class="review-option review-option--wrong">
                   <i class="fas fa-times-circle"></i><span>${a.userAnswer}</span>
               </div>` : ''}`;

        return `
            <div class="review-card ${a.isCorrect ? 'correct' : 'wrong'}">
                <div class="review-card-num">Câu ${num}</div>

                ${word?.image ? `<img src="${word.image}" class="review-card-img" alt="${word.en}" onerror="this.style.display='none'">` : ''}

                <div class="review-card-question">
                    ${questionPrompt}
                    ${word?.phonetic ? `<div class="review-card-phonetic">${word.phonetic}</div>` : ''}
                </div>

                <div class="review-card-options">${optionsHTML}</div>

                ${word?.example ? `
                <div class="review-card-example">
                    <i class="fas fa-quote-left"></i> ${word.example}
                </div>` : ''}
            </div>
        `;
    },

    _navigate(dir) {
        const newPos = this.wrongPos + dir;
        if (newPos < 0 || newPos >= this.wrongIndices.length) return;
        this.wrongPos = newPos;
        this.currentIdx = this.wrongIndices[newPos];
        this._update();
    },

    _jumpTo(idx) {
        this.currentIdx = idx;
        const wp = this.wrongIndices.indexOf(idx);
        if (wp >= 0) this.wrongPos = wp;
        this._update();
    },

    _update() {
        const el = document.getElementById('review-overlay');
        if (!el) return;

        // update sidebar active state + scroll active into view
        el.querySelectorAll('.review-num-btn').forEach((btn, i) => {
            btn.classList.toggle('active', i === this.currentIdx);
        });
        el.querySelector('.review-num-btn.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

        // update card
        el.querySelector('.review-card-section').innerHTML = this._buildCard();

        // update nav
        el.querySelector('#review-prev').disabled = this.wrongPos === 0;
        el.querySelector('#review-next').disabled = this.wrongPos >= this.wrongIndices.length - 1;
        el.querySelector('.review-nav-info').textContent =
            this.wrongIndices.length > 0
                ? `Câu sai ${this.wrongPos + 1} / ${this.wrongIndices.length}`
                : 'Không có câu sai 🎉';
    },

    _attachKeys() {
        if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
        this._keyHandler = (e) => {
            if (!document.getElementById('review-overlay')) return;
            if (e.key === 'ArrowRight') { e.preventDefault(); this._navigate(1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); this._navigate(-1); }
            if (e.key === 'Escape') this.close();
        };
        document.addEventListener('keydown', this._keyHandler);
    },
};
