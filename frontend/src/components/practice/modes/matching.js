import { GameLogic } from '@game/gameLogic.js';
import { GameState } from '@game/state.js';
import { Config } from '@game/config.js';
import { Utils } from '@lib/utils.js';
import { Notification } from '@ui/Toaster.jsx';
import { PartSelector } from '@components/vocab/part/partSelector.js';

export const Matching = {

    config: null,
    matchingData: null,
    selectedLeft: null,
    selectedRight: null,
    matchedPairs: [],
    allWords: [],
    currentBatch: 0,
    batchSize: 5,
    totalBatches: 0,

    async start(config) {
        this.config = config;
        this.matchedPairs = [];
        this.selectedLeft = null;
        this.selectedRight = null;
        this.currentBatch = 0;

        const requestCount = config.questionsPerRound || config.pairsCount || 20;
        const words = await PartSelector.getWordsForPractice(requestCount);

        if (!Array.isArray(words) || words.length === 0) {
            PracticeManager.complete();
            return;
        }

        const selectedWords = words;

        if (selectedWords.length < 1) {
            PracticeManager.complete();
            return;
        }

        this.allWords = selectedWords;
        this.totalBatches = Math.ceil(selectedWords.length / this.batchSize);

        this.loadBatch(0);
    },

    loadBatch(batchIndex) {
        this.currentBatch = batchIndex;

        const startIndex = batchIndex * this.batchSize;
        const endIndex = Math.min(startIndex + this.batchSize, this.allWords.length);
        const batchWords = this.allWords.slice(startIndex, endIndex);

        if (batchWords.length === 0) {
            this.finish();
            return;
        }

        this.matchingData = GameLogic.generateMatching(batchWords.length, batchWords);

        this.matchedPairs = [];
        this.selectedLeft = null;
        this.selectedRight = null;

        const totalProgress = (batchIndex * this.batchSize);
        PracticeManager.updateProgress(totalProgress, this.allWords.length);

        this.render();
    },

    render() {
        const container = document.getElementById('practice-content');
        if (!container) return;

        const batchInfo = this.totalBatches > 1
            ? `<div class="batch-info" style="text-align: center; margin-bottom: 15px; color: #666; font-size: 14px;">
                   <i class="fas fa-layer-group"></i> Nhóm ${this.currentBatch + 1}/${this.totalBatches}
                   <span style="margin-left: 10px;">(${this.matchedPairs.length}/${this.matchingData.pairs} cặp)</span>
               </div>`
            : '';

        container.innerHTML = `
            ${batchInfo}
            <div class="matching-container">
                <div class="matching-column">
                    <h4>Tiếng Anh</h4>
                    <div class="matching-items">
                        ${this.matchingData.leftColumn.map(item => `
                            <div class="matching-item" data-id="${item.id}" data-side="left">
                                <span class="matching-word-text" data-word="${item.text}">${item.text}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="matching-column">
                    <h4>Tiếng Việt</h4>
                    <div class="matching-items">
                        ${this.matchingData.rightColumn.map(item => `
                            <div class="matching-item" data-id="${item.id}" data-side="right">
                                ${item.text}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        this.attachListeners();
    },

    attachListeners() {
        const items = document.querySelectorAll('.matching-item');

        items.forEach(item => {
            item.addEventListener('click', (e) => {
                const id = item.dataset.id;
                const side = item.dataset.side;

                if (side === 'left') {
                    const wordEl = item.querySelector('.matching-word-text');
                    if (wordEl) GameLogic.speakWord(wordEl.dataset.word, 'en-US');
                }

                this.selectItem(id, side, item);
            });
        });
    },

    selectItem(id, side, element) {
        if (element.classList.contains('matched')) return;

        if (side === 'left') {
            if (this.selectedLeft) {
                this.selectedLeft.classList.remove('selected');
            }

            this.selectedLeft = element;
            element.classList.add('selected');

            const leftData = this.matchingData.leftColumn.find(item => item.id === id);

            if (this.selectedRight) {
                const rightId = this.selectedRight.dataset.id;
                const rightData = this.matchingData.rightColumn.find(item => item.id === rightId);

                this.checkMatch(leftData, rightData);
            }

        } else {
            if (this.selectedRight) {
                this.selectedRight.classList.remove('selected');
            }

            this.selectedRight = element;
            element.classList.add('selected');

            const rightData = this.matchingData.rightColumn.find(item => item.id === id);

            if (this.selectedLeft) {
                const leftId = this.selectedLeft.dataset.id;
                const leftData = this.matchingData.leftColumn.find(item => item.id === leftId);

                this.checkMatch(leftData, rightData);
            }
        }
    },

    checkMatch(leftData, rightData) {
        const isCorrect = GameLogic.checkMatching(leftData, rightData);

        if (isCorrect) {
            this.selectedLeft.classList.remove('selected');
            this.selectedRight.classList.remove('selected');
            this.selectedLeft.classList.add('matched');
            this.selectedRight.classList.add('matched');

            this.matchedPairs.push({ left: leftData, right: rightData });

            PracticeManager.recordAnswer(true, leftData.wordData);

            const totalProgress = (this.currentBatch * this.batchSize) + this.matchedPairs.length;
            PracticeManager.updateProgress(totalProgress, this.allWords.length);

            if (GameState.state.settings.soundEnabled) {
                Utils.playSound(Config.sounds.correct, 0.5);
            }

            if (this.matchedPairs.length === this.matchingData.pairs) {
                const nextBatch = this.currentBatch + 1;

                if (nextBatch < this.totalBatches) {
                    setTimeout(() => {
                        Notification.show({
                            type: 'success',
                            title: '🎉 Hoàn thành nhóm!',
                            message: `Đang chuyển sang nhóm ${nextBatch + 1}/${this.totalBatches}...`,
                            duration: 1500
                        });

                        setTimeout(() => {
                            this.loadBatch(nextBatch);
                        }, 800);
                    }, 500);
                } else {
                    setTimeout(() => {
                        this.finish();
                    }, 500);
                }
            }

        } else {
            this.selectedLeft.classList.add('animate-shake');
            this.selectedRight.classList.add('animate-shake');

            PracticeManager.recordAnswer(false, leftData.wordData);

            if (GameState.state.settings.soundEnabled) {
                Utils.playSound(Config.sounds.wrong, 0.5);
            }

            setTimeout(() => {
                this.selectedLeft?.classList.remove('animate-shake');
                this.selectedRight?.classList.remove('animate-shake');
            }, 400);
        }

        this.selectedLeft = null;
        this.selectedRight = null;
    },

    finish() {
        PracticeManager.complete();
    },

    cleanup() {
        this.matchingData = null;
        this.selectedLeft = null;
        this.selectedRight = null;
        this.matchedPairs = [];
        this.allWords = [];
        this.currentBatch = 0;
        this.totalBatches = 0;
    }
};

