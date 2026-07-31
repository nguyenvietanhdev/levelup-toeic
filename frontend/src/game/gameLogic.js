import { Http } from '@api/http.js';
import { getVocabLang, normalizeVocabularyWords, VocabularyAPI } from '@api/vocabulary.js';
import { TtsAPI } from '@api/tts.js';
import { GameState } from './state.js';
import { EventBus } from '@game/eventBus.js';
import { Utils } from '@lib/utils.js';
import { Config } from '@game/config.js';
import { Notification } from '@ui/Toaster.jsx';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import { logger } from '@lib/logger.js';

export function vocabLang() {
    return GameState.state?.settings?.vocabLang || getVocabLang() || 'en';
}
export function wordPk(word) {
    return vocabLang() === 'zh' ? (word?.zh || word?.en || '') : (word?.en || '');
}
export function ttsLang() {
    return vocabLang() === 'zh' ? 'zh-CN' : 'en-US';
}

export const GameLogic = {

    vocabularyData: [],

    async init() {
        // Nạp sẵn toàn bộ hiệu ứng âm thanh vào cache để phát tức thì — tránh
        // độ trễ fetch/decode (đặc biệt tiếng "complete" chỉ phát 1 lần cuối
        // session nên hay bị vang chậm hơn popup).
        try { Utils.preloadSounds(Object.values(Config.sounds)); } catch { /* ignore */ }
        await this.loadVocabulary();
    },

    async loadVocabulary() {
        const result = await Http.loadVocabulary();

        if (!result || !result.success || !Array.isArray(result.data)) {
            console.error("Vocabulary load failed or invalid. Using empty array.");
            this.vocabularyData = [];
            return false;
        }

        this.vocabularyData = normalizeVocabularyWords(result.data);
        logger.log(`Loaded ${this.vocabularyData.length} vocabulary words`);
        EventBus.emit('vocab:loaded');
        return true;
    },

    async loadVocabularyBySource(source) {
        logger.log(`🔄 GameLogic: Loading vocabulary for source "${source}"...`);
        try {
            const words = await VocabularyAPI.getWordsBySource(source);
            if (!Array.isArray(words) || words.length === 0) {
                console.error(`❌ No words found for source: ${source}`);
                return false;
            }
            this.vocabularyData = normalizeVocabularyWords(words);
            logger.log(`✅ GameLogic: Loaded ${this.vocabularyData.length} words (source: ${source})`);
            EventBus.emit('vocab:loaded');
            return true;
        } catch (err) {
            console.error(`❌ Failed to load source "${source}":`, err);
            return false;
        }
    },

    getVocabulary() {
        return [...this.vocabularyData];
    },

    getRandomWords(count) {
        if (PartSelector.retryWords && PartSelector.retryWords.length > 0) {
            const words = [...PartSelector.retryWords];
            PartSelector.retryWords = null;
            logger.log(`🔁 Retry mode (getRandomWords): returning ${words.length} wrong words`);
            return words;
        }

        const settings = GameState.state?.settings || {};
        const levelFilter = settings.levelFilter;

        logger.log('🔍 getRandomWords DEBUG:', {
            difficulty: settings.difficulty,
            levelFilter: levelFilter,
            totalVocab: this.vocabularyData.length
        });

        let filteredData = this.vocabularyData;

        if (levelFilter && Array.isArray(levelFilter) && levelFilter.length > 0) {
            filteredData = this.vocabularyData.filter(word => {
                return word.level && levelFilter.includes(word.level);
            });

            logger.log(`🎯 Filtered vocabulary by levels [${levelFilter.join(', ')}]: ${filteredData.length} words`);

            if (filteredData.length > 0) {
                logger.log('📋 Sample filtered words:', filteredData.slice(0, 3).map(w => `${w.en} (${w.level})`));
            }

            if (filteredData.length === 0) {
                console.warn('⚠️ No words found with selected levels, using all vocabulary');
                Notification.show({
                    type: 'warning',
                    title: 'Không tìm thấy từ vựng',
                    message: `Không có từ vựng nào ở level ${levelFilter.join(', ')}. Sử dụng tất cả từ vựng.`,
                    duration: 4000
                });
                filteredData = this.vocabularyData;
            }
            else if (filteredData.length < count) {
                console.warn(`⚠️ Not enough words (${filteredData.length}/${count}), using all available words at this level`);
                Notification.show({
                    type: 'info',
                    title: 'Số từ vựng hạn chế',
                    message: `Chỉ có ${filteredData.length} từ ở level ${levelFilter.join(', ')}. Sẽ lấy tất cả.`,
                    duration: 4000
                });
            }
        } else {
            logger.log('ℹ️ No level filter applied (adaptive mode or not set)');
        }

        return Utils.randomSample(filteredData, count);
    },

    getWord(id) {
        return this.vocabularyData.find(word => word.en === id) || this.vocabularyData[id];
    },

    getWordsByPart(part) {
        const settings = GameState.state?.settings || {};
        const levelFilter = settings.levelFilter;

        logger.log(`🔍 getWordsByPart("${part}") DEBUG:`, {
            difficulty: settings.difficulty,
            levelFilter: levelFilter
        });

        let words = this.vocabularyData.filter(word => word.part === part);
        logger.log(`📚 Total words in ${part}: ${words.length}`);

        if (levelFilter && Array.isArray(levelFilter) && levelFilter.length > 0) {
            const beforeFilter = words.length;
            words = words.filter(word => {
                return word.level && levelFilter.includes(word.level);
            });

            logger.log(`🎯 Filtered ${part} by levels [${levelFilter.join(', ')}]: ${beforeFilter} → ${words.length} words`);

            if (words.length === 0) {
                console.warn(`⚠️ No words found in ${part} with levels ${levelFilter.join(', ')}`);
                Notification.show({
                    type: 'warning',
                    title: 'Không tìm thấy từ vựng',
                    message: `${part} không có từ vựng nào ở level ${levelFilter.join(', ')}.`,
                    duration: 4000
                });
            }
            else if (words.length > 0) {
                logger.log('📋 Sample words:', words.slice(0, 3).map(w => `${w.en} (${w.level})`));
            }
        } else {
            logger.log('ℹ️ No level filter applied to Part');
        }

        return words;
    },

    searchWords(query) {
        const lowerQuery = query.toLowerCase();
        return this.vocabularyData.filter(word =>
            word.en.toLowerCase().includes(lowerQuery) ||
            word.vn.toLowerCase().includes(lowerQuery)
        );
    },

    isReversed() {
        return localStorage.getItem('reverseMode') === 'true';
    },

    generateMultipleChoice(word, optionsCount = 4) {
        const reversed = this.isReversed();
        const correctAnswer = reversed ? word.en : word.vn;
        const otherWords = this.vocabularyData.filter(w => w.en !== word.en);
        const wrongAnswers = Utils.randomSample(otherWords, optionsCount - 1).map(w => reversed ? w.en : w.vn);
        const options = Utils.shuffleArray([correctAnswer, ...wrongAnswers]);

        return {
            word,
            question: reversed ? word.vn : word.en,
            options,
            correctAnswer,
            correctIndex: options.indexOf(correctAnswer),
            reversed
        };
    },

    checkMultipleChoice(selectedAnswer, correctAnswer) {
        return selectedAnswer === correctAnswer;
    },

    generateFillBlank(word) {
        const reversed = this.isReversed();
        // Convention (giống generateMultipleChoice): reversed = VN→EN — hiện
        // nghĩa tiếng Việt, người dùng gõ từ tiếng Anh. Mặc định = EN→VN.
        if (reversed) {
            return {
                word,
                displayWord: word.vn,
                prompt: `Từ tiếng Anh của từ trên là:`,
                placeholder: 'Nhập từ tiếng Anh',
                correctAnswer: word.en,
                acceptableAnswers: [word.en.toLowerCase()],
                reversed: true
            };
        }
        return {
            word,
            displayWord: word.en,
            prompt: `Nghĩa tiếng Việt của từ trên là:`,
            placeholder: 'Nhập nghĩa tiếng Việt',
            correctAnswer: word.vn,
            acceptableAnswers: [word.vn.toLowerCase()],
            reversed: false
        };
    },

    checkFillBlank(userAnswer, correctAnswer) {
        const normalized = userAnswer.toLowerCase().trim();
        const correct = correctAnswer.toLowerCase().trim();

        if (normalized === correct) {
            return { correct: true, similarity: 100 };
        }

        const similarity = this.calculateSimilarity(normalized, correct);

        if (similarity >= 80) {
            return { correct: true, similarity };
        }

        return { correct: false, similarity };
    },

    calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;

        if (longer.length === 0) {
            return 100;
        }

        const distance = this.levenshteinDistance(longer, shorter);
        return Math.round((longer.length - distance) / longer.length * 100);
    },

    levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
        for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    },

    generateListening(word, optionsCount = 4) {
        return this.generateMultipleChoice(word, optionsCount);
    },

    _gttsAudio: null,
    _replayCallback: null,

    replayLast() {
        if (this._replayCallback) this._replayCallback();
    },

    // Gắn mục tiêu phát âm cho phím Ctrl theo ĐÚNG từ hiện tại. Dùng wordPk()
    // (zh khi học Tiếng Trung, ngược lại là en) + ttsLang() nên luôn đúng ngôn
    // ngữ và không phụ thuộc chiều hiển thị (đảo ngược). Mỗi câu mới gọi lại để
    // tránh replay bị trễ sang từ của câu trước. Các chế độ đọc cả câu ví dụ
    // (chính tả, ngữ cảnh…) sẽ tự ghi đè _replayCallback sau khi speakWord(câu).
    setReplayWord(word) {
        const text = wordPk(word);
        if (!text) return;
        this._replayCallback = () => this.speakWord(text, ttsLang());
    },

    speakWord(text, lang = 'en-US', onEnd = null) {
        const isZhText = /[\u3400-\u9fff]/.test(String(text || ''));
        if (getVocabLang() === 'zh' && isZhText) {
            lang = 'zh-CN';
        }
        const isZhMode = getVocabLang() === 'zh';
        const voiceKey = isZhMode ? 'toeic_voice_zh' : 'toeic_voice_en';
        const savedVoiceName = localStorage.getItem(voiceKey)
            || localStorage.getItem('toeic_voice')  // backward compat
            || (isZhMode ? '__gtts_zh_random__' : '__gtts_random__');

        this._replayCallback = () => this.speakWord(text, lang);

        if (savedVoiceName.startsWith('__gtts_')) {
            // Nếu text là tiếng Trung nhưng giọng đang chọn là EN → tự động dùng ZH random
            const isZhVoice = savedVoiceName.startsWith('__gtts_zh');
            const effectiveVoice = (isZhText && !isZhVoice) ? '__gtts_zh_random__' : savedVoiceName;
            this._speakGoogleTTS(text, effectiveVoice, onEnd);
            return;
        }

        if (!('speechSynthesis' in window)) {
            if (onEnd) onEnd();
            return;
        }
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;

        const savedRate = localStorage.getItem('toeic_speech_rate');
        utterance.rate = savedRate ? parseInt(savedRate) / 100 : 0.8;

        if (onEnd) {
            utterance.onend = onEnd;
            utterance.onerror = onEnd;
        }

        const voices = window.speechSynthesis.getVoices();

        if (savedVoiceName === '__random__' && voices.length > 0) {
            const toeicAccents = lang === 'zh-CN' ? ['zh-CN', 'zh-Hans', 'zh'] : ['en-US', 'en-GB', 'en-AU', 'en-CA'];
            const toeicVoices = voices.filter(v => toeicAccents.some(a => v.lang.startsWith(a)));
            const pool = toeicVoices.length > 0 ? toeicVoices : voices.filter(v => v.lang.startsWith(lang === 'zh-CN' ? 'zh' : 'en'));
            if (pool.length > 0) {
                const picked = pool[Math.floor(Math.random() * pool.length)];
                utterance.voice = picked;
            }
        } else if (savedVoiceName) {
            const selectedVoice = voices.find(v => v.name === savedVoiceName);
            if (selectedVoice) utterance.voice = selectedVoice;
        }

        window.speechSynthesis.speak(utterance);
    },

    async _speakGoogleTTS(text, voiceKey, onEnd = null) {
        if (this._gttsAudio) {
            this._gttsAudio.pause();
            this._gttsAudio = null;
        }
        window.speechSynthesis.cancel();

        // Tăng speakId để cancel mọi request cũ đang chờ fetch
        const myId = (this._gttsSpeak = (this._gttsSpeak || 0) + 1);

        this._replayCallback = () => this._speakGoogleTTS(text, voiceKey, null);

        const accentMap = {
            // English female
            '__gtts_us__':      'en-us-f',
            '__gtts_uk__':      'en-gb-f',
            '__gtts_au__':      'en-au-f',
            '__gtts_ca__':      'en-ca-f',
            // English male
            '__gtts_us_m__':    'en-us-m',
            '__gtts_uk_m__':    'en-gb-m',
            '__gtts_au_m__':    'en-au-m',
            '__gtts_ca_m__':    'en-ca-m',
            // Chinese female
            '__gtts_zh_xiaoxiao__': 'zh-cn-xiaoxiao',
            '__gtts_zh_xiaoyi__':   'zh-cn-xiaoyi',
            '__gtts_zh_tw__':       'zh-tw',
            // Chinese male
            '__gtts_zh_yunxi__':    'zh-cn-yunxi',
            '__gtts_zh_yunyang__':  'zh-cn-yunyang',
            '__gtts_zh_tw_m__':     'zh-tw-m',
            // Chinese random
            '__gtts_zh_random__':   'zh-cn-random',
        };

        let lang = 'en-us';
        if (voiceKey === '__gtts_random__') {
            lang = 'en-random';
        } else {
            lang = accentMap[voiceKey] || 'en-us';
        }

        const savedRate = localStorage.getItem('toeic_speech_rate');
        const rate = savedRate ? parseInt(savedRate) / 100 : 0.8;

        try {
            const data = await TtsAPI.synthesize(text, lang, rate);

            // Nếu có request mới hơn được gọi trong lúc đang fetch → bỏ qua kết quả cũ
            if (this._gttsSpeak !== myId) return;

            if (data.url) {
                const audio = new Audio();
                audio.preload = 'auto';
                this._gttsAudio = audio;
                const revoke = () => { try { URL.revokeObjectURL(data.url); } catch (_) {} };
                audio.onended = () => { revoke(); if (onEnd) onEnd(); };
                audio.onerror = () => { revoke(); if (onEnd) onEnd(); };
                audio.src = data.url;
                audio.load();
                await audio.play();
            } else if (data.urls) {
                for (let i = 0; i < data.urls.length; i++) {
                    const isLast = i === data.urls.length - 1;
                    await new Promise((resolve) => {
                        const audio = new Audio();
                        audio.preload = 'auto';
                        this._gttsAudio = audio;
                        audio.onended = () => { if (isLast && onEnd) onEnd(); resolve(); };
                        audio.onerror = () => { if (isLast && onEnd) onEnd(); resolve(); };
                        audio.src = data.urls[i];
                        audio.load();
                        audio.play().catch(() => { if (isLast && onEnd) onEnd(); resolve(); });
                    });
                }
            } else {
                if (onEnd) onEnd();
            }
        } catch (err) {
            console.warn('Google TTS API failed, falling back to browser:', err);
            const utterance = new SpeechSynthesisUtterance(text);
            const isZhVoice = lang.startsWith('zh');
            utterance.lang = isZhVoice ? 'zh-CN' : 'en-US';
            utterance.rate = rate;
            if (onEnd) {
                utterance.onend = onEnd;
                utterance.onerror = onEnd;
            }
            window.speechSynthesis.speak(utterance);
        }
    },

    generateMatching(pairsCount = 8, wordsPool = null) {
        const words = wordsPool
            ? Utils.randomSample(wordsPool, Math.min(pairsCount, wordsPool.length))
            : this.getRandomWords(pairsCount);

        const leftColumn = words.map(w => ({
            id: Utils.generateId(),
            text: w.en,
            wordData: w
        }));

        const rightColumn = Utils.shuffleArray(words.map(w => ({
            id: Utils.generateId(),
            text: w.vn,
            wordData: w
        })));

        return {
            leftColumn,
            rightColumn,
            pairs: words.length
        };
    },

    checkMatching(leftItem, rightItem) {
        return leftItem.wordData.en === rightItem.wordData.en;
    },

    generateWordScramble(word) {
        const letters = word.en.split('');
        const scrambled = Utils.shuffleArray(letters);
        let attempts = 0;

        while (scrambled.join('') === word.en && attempts < 10) {
            Utils.shuffleArray(scrambled);
            attempts++;
        }

        return {
            word,
            scrambledLetters: scrambled,
            correctAnswer: word.en,
            hint: word.vn
        };
    },

    checkWordScramble(userAnswer, correctAnswer) {
        return userAnswer.toLowerCase() === correctAnswer.toLowerCase();
    },

    generateSpeedQuiz(word, optionsCount = 2) {
        const isCorrect = Math.random() > 0.5;
        const reversed = this.isReversed();
        // reversed = VN→EN: hiện nghĩa tiếng Việt, đánh giá từ tiếng Anh.
        const ask = reversed ? word.vn : word.en;
        const right = reversed ? word.en : word.vn;

        if (isCorrect) {
            return {
                word,
                question: ask,
                shownAnswer: right,
                isCorrect: true,
                correctAnswer: right,
                reversed
            };
        } else {
            const otherWords = this.vocabularyData.filter(w => w.en !== word.en);
            const wrongWord = Utils.randomElement(otherWords);
            return {
                word,
                question: ask,
                shownAnswer: reversed ? wrongWord.en : wrongWord.vn,
                isCorrect: false,
                correctAnswer: right,
                reversed
            };
        }
    },

    checkSpeedQuiz(userSaidCorrect, actuallyCorrect) {
        return userSaidCorrect === actuallyCorrect;
    },

    calculateScore(correctAnswers, totalQuestions, timeSpent, timeLimit, mode) {
        const modeConfig = (Config.practice && Config.practice[mode]) || {};
        const basePoints = modeConfig.pointsPerCorrect || 100;
        if (!totalQuestions || totalQuestions === 0) {
            return { totalScore: 0, baseScore: 0, accuracyBonus: 0, speedBonus: 0, perfectBonus: 0 };
        }
        let score = correctAnswers * basePoints;
        const accuracy = correctAnswers / totalQuestions;
        const accuracyBonus = Math.floor(accuracy * 500);
        score += accuracyBonus;

        if (timeSpent < timeLimit) {
            const timeRatio = 1 - timeSpent / timeLimit;
            const speedBonus = Math.floor(timeRatio * 300);
            score += speedBonus;
        }

        if (correctAnswers === totalQuestions) score += 500;

        return {
            totalScore: score,
            baseScore: correctAnswers * basePoints,
            accuracyBonus,
            speedBonus: timeSpent < timeLimit ? Math.floor((1 - timeSpent / timeLimit) * 300) : 0,
            perfectBonus: correctAnswers === totalQuestions ? 500 : 0
        };
    },

    calculateXpReward(correctAnswers, totalQuestions, isPerfect) {
        let xp = correctAnswers * Config.xpRewards.correctAnswer;
        if (isPerfect) xp += Config.xpRewards.perfectRound;
        return xp;
    },

    calculateCoinsReward(correctAnswers, totalQuestions, isPerfect) {
        let coins = correctAnswers * Config.coinsRewards.correctAnswer;
        if (isPerfect) coins += Config.coinsRewards.perfectRound;
        return coins;
    },

    getPerformanceRating(correctAnswers, totalQuestions) {
        const a = (correctAnswers / totalQuestions) * 100;
        if (a === 100) return { rating: 'PERFECT', stars: 3, message: 'Hoàn hảo!' };
        if (a >= 90) return { rating: 'EXCELLENT', stars: 3, message: 'Xuất sắc!' };
        if (a >= 80) return { rating: 'GREAT', stars: 2, message: 'Rất tốt!' };
        if (a >= 70) return { rating: 'GOOD', stars: 2, message: 'Tốt!' };
        if (a >= 60) return { rating: 'PASS', stars: 1, message: 'Đạt!' };
        return { rating: 'FAIL', stars: 0, message: 'Cần cố gắng thêm!' };
    },

    getHint(word, hintLevel = 1) {
        switch (hintLevel) {
            case 1: return `Loại từ: ${word.type}`;
            case 2: return `Gợi ý: ${word.vn.charAt(0)}...`;
            case 3: return word.synonyms ? `Từ đồng nghĩa: ${word.synonyms}` : 'Không có gợi ý thêm';
            default: return word.type;
        }
    },

    getHintCost() {
        return 50;
    },

    adjustDifficulty(userLevel, accuracy) {
        if (accuracy >= 90) return 1.2;
        if (accuracy < 60) return 0.8;
        return 1.0;
    },

    getRecommendedWords(learnedWords, count = 10) {
        const unlearned = this.vocabularyData.filter(w => !learnedWords.includes(w.en));
        if (unlearned.length === 0) return this.getRandomWords(count);
        return Utils.randomSample(unlearned, count);
    },

    // Split a `synonyms` field into clean unique tokens.
    _synonymTokens(raw) {
        if (!raw) return [];
        const seen = new Set();
        const out = [];
        for (const t of String(raw).split(',').map(s => s.trim()).filter(Boolean)) {
            const k = t.toLowerCase();
            if (!seen.has(k)) { seen.add(k); out.push(t); }
        }
        return out;
    },

    // Build (once per vocabulary set) a global index of synonym tokens,
    // also grouped by word `type`. Reused across every question in a
    // generation pass → distractor lookup is O(1)-ish instead of scanning
    // the whole vocabulary per question (was O(N²) + per-call string split).
    _buildSynIndex() {
        const vocab = this.vocabularyData || [];
        if (this._synIndexRef === vocab && this._synIndex) return this._synIndex;
        const all = [];
        const byType = {};
        const seen = new Set();
        for (const w of vocab) {
            if (!w.synonyms) continue;
            const type = (w.type || '').toLowerCase().trim();
            for (const tok of this._synonymTokens(w.synonyms)) {
                const k = tok.toLowerCase();
                if (seen.has(k)) continue;
                seen.add(k);
                const entry = { tok, k };
                all.push(entry);
                if (type) (byType[type] = byType[type] || []).push(entry);
            }
        }
        this._synIndex = { all, byType };
        this._synIndexRef = vocab;
        return this._synIndex;
    },

    /**
     * Question = the word (en + vn shown by the mode). Options = English
     * synonym tokens: 1 from THIS word's `synonyms` (the only correct one)
     * + 3 distractors. Distractors are pulled preferentially from words of
     * the SAME `type` (so they're plausible, not obviously off-topic),
     * falling back to the global pool. Single-select.
     * Falls back to plain MC when the word has no synonyms.
     */
    generateSynonymCheck(word, optionsCount = 4) {
        const correctPool = this._synonymTokens(word.synonyms);
        if (correctPool.length < 1) {
            return this.generateMultipleChoice(word, optionsCount);
        }

        const correctAnswers = Utils.shuffleArray([...correctPool]).slice(0, 1);
        const exclude = new Set([
            ...correctPool.map(s => s.toLowerCase()),
            (word.en || '').toLowerCase(),
            (word.vn || '').toLowerCase(),
        ]);

        const idx = this._buildSynIndex();
        const wt = (word.type || '').toLowerCase().trim();
        const pick = (entries) => Utils.shuffleArray(
            (entries || []).filter(e => !exclude.has(e.k))
        );

        // Smart distractors: same type first, then top up from global pool.
        const ordered = [...pick(idx.byType[wt]), ...pick(idx.all)];
        const need = Math.max(0, optionsCount - correctAnswers.length);
        const distractors = [];
        const used = new Set(exclude);
        for (const e of ordered) {
            if (used.has(e.k)) continue;
            used.add(e.k);
            distractors.push(e.tok);
            if (distractors.length >= need) break;
        }
        if (distractors.length < need) {
            // Last-resort pad with other headwords.
            const pad = Utils.shuffleArray(
                this.vocabularyData
                    .map(w => w.en)
                    .filter(en => en && !used.has(en.toLowerCase()))
            );
            for (const en of pad) {
                distractors.push(en);
                if (distractors.length >= need) break;
            }
        }

        const options = Utils.shuffleArray([...correctAnswers, ...distractors]);

        return {
            word,
            question: 'Chọn từ đồng nghĩa (tiếng Anh):',
            options,
            correctAnswers,                          // single correct token
            correctIndex: options.indexOf(correctAnswers[0]),
        };
    },

    // Multi-select: correct only when the selected set equals the correct
    // set exactly (both correct chosen, no wrong chosen).
    checkSynonymCheck(selectedAnswers, correctAnswers) {
        const norm = a => (Array.isArray(a) ? a : [a])
            .map(x => String(x).trim().toLowerCase());
        const sel = new Set(norm(selectedAnswers));
        const cor = norm(correctAnswers);
        return sel.size === cor.length && cor.every(c => sel.has(c));
    },

    generateWordTypeCheck(word, optionsCount = 6, availableTypes = null) {
        const correctAnswer = word.type || 'unknown';

        // Dùng hoàn toàn từ dữ liệu thực — không hardcode.
        // availableTypes là unique types collect từ tập từ đang luyện.
        const allTypes = availableTypes || [correctAnswer];

        const wrongTypes = allTypes.filter(t => t.toLowerCase() !== correctAnswer.toLowerCase());

        const selectedWrongTypes = Utils.randomSample(wrongTypes, Math.min(optionsCount - 1, wrongTypes.length));

        const options = Utils.shuffleArray([correctAnswer, ...selectedWrongTypes]);

        return {
            word,
            question: `Từ loại của "${word.en}" là gì?`,
            options,
            correctAnswer,
            correctIndex: options.indexOf(correctAnswer)
        };
    },

    checkWordTypeCheck(selectedAnswer, correctAnswer) {
        return selectedAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
    }
};

