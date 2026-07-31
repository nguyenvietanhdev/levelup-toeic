import { Storage } from '@lib/storage.js';
import { EventBus } from '@game/eventBus.js';
import { GameLogic } from '@game/gameLogic.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import { Notification } from '@ui/Toaster.jsx';
import { TopicsAPI } from '@api/topics.js';
import { normalizeVocabularyWords } from '@api/vocabulary.js';
import { UploadVocabAPI } from '@api/uploadVocab.js';
import { WrongWordsAPI } from '@api/wrongWords.js';

export const TopicSelector = {
    availableTopics: [],
    currentTopic: null,

    async init() {
        await this.loadAvailableTopics();
        if (!this.currentTopic && this.availableTopics.length > 0) {
            this.currentTopic = this.availableTopics[0];
        }
    },

    async loadAvailableTopics() {
        try {
            const res = await TopicsAPI.listRaw();
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            this.availableTopics = data.data.map(t => ({
                id: t._id,
                name: t.displayName,
                source: t.sourceKeys[0],
                wordCount: t.wordCount || 0,
                icon: t.icon || '📚',
                color: t.color || '#3b82f6',
                description: t.description || '',
            }));
        } catch (err) {
            console.warn('Không thể tải topics từ server:', err);
            this.availableTopics = [];
        }
        return this.availableTopics;
    },

    getAvailableTopics() { return this.availableTopics; },
    getCurrentTopic() { return this.currentTopic; },

    async selectTopic(topicId, options = {}) {
        const topic = this.availableTopics.find(t => t.id === topicId);
        if (!topic) throw new Error(`Topic ${topicId} not found`);

        this.currentTopic = topic;

        PartSelector.clearSelection();

        await GameLogic.loadVocabularyBySource(topic.source);

        await PartSelector.reloadParts();

        await Storage.set('selectedTopic', topicId);
        EventBus.emit('topic:changed', { topic });

        if (!options.silent) {
            Notification.success(`${topic.name} — ${topic.wordCount} từ`);
        }
        return topic;
    },

    async selectPersonalTopic(source) {
        const data = await UploadVocabAPI.myVocabulary(source);
        if (!data.success) throw new Error(data.message);
        const words = normalizeVocabularyWords(data.data || []);
        if (words.length === 0) throw new Error('Source trống, không có từ nào');

        GameLogic.vocabularyData = words;
        GameLogic.currentSource = source;
        const topic = { id: `personal:${source}`, name: source, source, wordCount: words.length, icon: '📤', isPersonal: true };
        this.currentTopic = topic;

        PartSelector.clearSelection();
        await PartSelector.reloadParts();

        await Storage.set('selectedTopic', topic.id);
        EventBus.emit('topic:changed', { topic });
        Notification.success(`${source} — ${words.length} từ`);
        return topic;
    },

    // "Từ vựng sai" — nạp các từ active trong user_wrongwords thuộc một
    // source làm pool luyện tập, giống selectPersonalTopic.
    async selectWrongWordsTopic(source = '') {
        const data = await WrongWordsAPI.list();
        if (!data.success) throw new Error(data.message || 'Không tải được từ sai');
        const all = data.data || [];
        const raw = all.filter(w => (w.source || '') === source);
        if (raw.length === 0) throw new Error('Nhóm từ sai này trống');

        const words = normalizeVocabularyWords(raw.map(w => ({
            id: w.wordId || w._id,
            en: w.en,
            zh: w.zh,
            vn: w.vn,
            phonetic: w.phonetic || '',
            type: w.type || '',
            level: w.level || '',
            part: w.part || '',
            example: w.example || '',
            image: w.image || '',
            synonyms: w.synonyms || '',
        })));

        const label = source || 'Chưa rõ nguồn';
        GameLogic.vocabularyData = words;
        GameLogic.currentSource = source;
        const topic = {
            id: `wrong:${source}`,
            name: `Từ sai · ${label}`,
            source,
            wordCount: words.length,
            icon: '❌',
            isWrong: true,
        };
        this.currentTopic = topic;

        PartSelector.clearSelection();
        await PartSelector.reloadParts();

        await Storage.set('selectedTopic', topic.id);
        EventBus.emit('topic:changed', { topic });
        Notification.success(`Từ sai · ${label} — ${words.length} từ`);
        return topic;
    },

    addTopic(topicConfig) {
        if (this.availableTopics.find(t => t.id === topicConfig.id)) return false;
        this.availableTopics.push(topicConfig);
        return true;
    },

    async restoreLastTopic() {
        const lastTopicId = await Storage.get('selectedTopic');
        if (lastTopicId && this.availableTopics.find(t => t.id === lastTopicId)) {
            try { await this.selectTopic(lastTopicId, { silent: true }); }
            catch { await this._loadDefaultTopic(); }
        } else {
            await this._loadDefaultTopic();
        }
    },

    async _loadDefaultTopic() {
        if (this.availableTopics.length === 0) return;
        try { await this.selectTopic(this.availableTopics[0].id, { silent: true }); } catch { }
    },
};
