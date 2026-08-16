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
                // Phân bố độ khó A/B/C để vẽ dải màu trên thẻ đề (chỉ desktop).
                // Server cũ chưa trả trường này → về `null`, thẻ đơn giản là
                // không có dải, không vỡ gì.
                levelStats: t.levelStats || null,
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

        // KHÔI PHỤC lúc khởi động thì GIỮ Part đã chọn (`keepPart`).
        //
        // Xoá vô điều kiện là xung đột với nút "Luyện tập ngay": nút đó vào
        // thẳng chế độ, nhưng `start()` thấy chưa có Part lại bật popup chọn
        // Part — mở app lần nào cũng phải chọn lại dù đã chọn từ hôm trước.
        // Người dùng CHỦ ĐỘNG đổi đề thì vẫn xoá: Part của đề cũ không còn nghĩa.
        if (!options.keepPart) PartSelector.clearSelection();

        await GameLogic.loadVocabularyBySource(topic.source);

        await PartSelector.reloadParts();

        await Storage.set('selectedTopic', topicId);
        EventBus.emit('topic:changed', { topic });

        if (!options.silent) {
            Notification.success(`${topic.name} — ${topic.wordCount} từ`);
        }
        return topic;
    },

    async selectPersonalTopic(source, options = {}) {
        const data = await UploadVocabAPI.myVocabulary(source);
        if (!data.success) throw new Error(data.message);
        const words = normalizeVocabularyWords(data.data || []);
        if (words.length === 0) throw new Error('Source trống, không có từ nào');

        GameLogic.vocabularyData = words;
        GameLogic.currentSource = source;
        const topic = { id: `personal:${source}`, name: source, source, wordCount: words.length, icon: '📤', isPersonal: true };
        this.currentTopic = topic;

        if (!options.keepPart) PartSelector.clearSelection();
        await PartSelector.reloadParts();

        await Storage.set('selectedTopic', topic.id);
        EventBus.emit('topic:changed', { topic });
        Notification.success(`${source} — ${words.length} từ`);
        return topic;
    },

    // Bộ từ NGƯỜI KHÁC chia sẻ cho mình. Cùng khuôn với selectPersonalTopic, chỉ
    // khác đường lấy dữ liệu (route riêng có kiểm quyền) và `id` mang cả email
    // chủ sở hữu — bộ được chia sẻ có thể TRÙNG TÊN với bộ của chính mình.
    async selectSharedTopic(ownerEmail, source, options = {}) {
        const data = await UploadVocabAPI.sharedVocabulary(ownerEmail, source);
        if (!data.success) throw new Error(data.message || 'Không tải được bộ từ');
        const words = normalizeVocabularyWords(data.data || []);
        if (words.length === 0) throw new Error('Bộ từ này đã hết hạn, không còn từ nào');

        GameLogic.vocabularyData = words;
        GameLogic.currentSource = source;
        const topic = {
            id: `shared:${ownerEmail}:${source}`,
            name: source, source, ownerEmail,
            wordCount: words.length, icon: '🤝', isShared: true,
        };
        this.currentTopic = topic;

        if (!options.keepPart) PartSelector.clearSelection();
        await PartSelector.reloadParts();

        await Storage.set('selectedTopic', topic.id);
        EventBus.emit('topic:changed', { topic });
        Notification.success(`${source} (của ${ownerEmail}) — ${words.length} từ`);
        return topic;
    },

    // "Từ vựng sai" — nạp các từ active trong user_wrongwords thuộc một
    // source làm pool luyện tập, giống selectPersonalTopic.
    async selectWrongWordsTopic(source = '', options = {}) {
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

        if (!options.keepPart) PartSelector.clearSelection();
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

    /**
     * Khôi phục đề đang học sau khi tải lại trang.
     *
     * `availableTopics` chỉ chứa đề CÔNG KHAI. Bộ từ riêng (`personal:`), bộ
     * được chia sẻ (`shared:`) và nhóm từ sai (`wrong:`) không nằm trong đó, nên
     * trước đây mọi lần F5 khi đang học chúng đều tụt về đề mặc định — im lặng,
     * không có thông báo nào, và người học tưởng mình bấm nhầm.
     *
     * Định tuyến theo TIỀN TỐ của id, mỗi loại về đúng hàm nạp của nó.
     */
    async restoreLastTopic() {
        const lastTopicId = await Storage.get('selectedTopic');
        if (!lastTopicId) return this._loadDefaultTopic();

        try {
            if (lastTopicId.startsWith('personal:')) {
                await this.selectPersonalTopic(lastTopicId.slice('personal:'.length), { keepPart: true });
                return;
            }
            if (lastTopicId.startsWith('shared:')) {
                // `shared:<email>:<source>`. Cắt ở dấu ':' ĐẦU TIÊN sau tiền tố:
                // email không chứa ':' nhưng tên bộ thì có thể, nên `split(':')`
                // sẽ băm nát tên bộ. `sep <= 0` là id hỏng → rơi xuống mặc định.
                const rest = lastTopicId.slice('shared:'.length);
                const sep = rest.indexOf(':');
                if (sep > 0) {
                    await this.selectSharedTopic(rest.slice(0, sep), rest.slice(sep + 1), { keepPart: true });
                    return;
                }
            }
            if (lastTopicId.startsWith('wrong:')) {
                await this.selectWrongWordsTopic(lastTopicId.slice('wrong:'.length), { keepPart: true });
                return;
            }
            if (this.availableTopics.find(t => t.id === lastTopicId)) {
                await this.selectTopic(lastTopicId, { silent: true, keepPart: true });
                return;
            }
        } catch {
            // Bộ có thể đã bị xoá, hết hạn, hoặc quyền chia sẻ bị thu hồi —
            // những chuyện xảy ra được giữa hai lần mở app. Về đề mặc định.
        }
        await this._loadDefaultTopic();
    },

    async _loadDefaultTopic() {
        if (this.availableTopics.length === 0) return;
        try { await this.selectTopic(this.availableTopics[0].id, { silent: true }); } catch { }
    },
};

// PartSelector cần nạp lại kho từ khi nó rỗng, nhưng KHÔNG biết nguồn đang chọn
// đi đường API nào (kho chung / bộ riêng / bộ được chia sẻ / nhóm từ sai) — và
// cũng không được biết: file này đã import `partSelector`, import ngược lại là
// vòng phụ thuộc. Nên bên đó chỉ YÊU CẦU, còn định tuyến nằm ở đây.
//
// Đăng ký ở CẤP MODULE chứ không trong `init()`: `TopicSelector.init()` hiện
// không được gọi từ đâu cả (chỉ `restoreLastTopic()` được gọi, ở
// GameContext.jsx). Đặt vào đó là listener không bao giờ chạy, mà triệu chứng
// vẫn y hệt lúc chưa sửa gì.
EventBus.on('vocab:reload-requested', () => {
    TopicSelector.restoreLastTopic().catch(() => {});
});
