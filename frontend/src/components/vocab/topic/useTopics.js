import { useState, useEffect, useCallback } from 'react';
import { TopicSelector } from '@components/vocab/topic/topicSelector.js';
import { getToken } from '@/auth/token.js';
import { UploadVocabAPI } from '@api/uploadVocab.js';
import { WrongWordsAPI } from '@api/wrongWords.js';

export function useTopics({ enabled = true } = {}) {
    const [shared, setShared] = useState(() => TopicSelector.getAvailableTopics() || []);
    const [personal, setPersonal] = useState([]);
    const [wrong, setWrong] = useState([]);
    const [loadingShared, setLoadingShared] = useState(false);
    const [loadingPersonal, setLoadingPersonal] = useState(false);
    const [loadingWrong, setLoadingWrong] = useState(false);
    const [current, setCurrent] = useState(() => TopicSelector.getCurrentTopic());

    const loadShared = useCallback(async () => {
        if (TopicSelector.getAvailableTopics()?.length > 0) {
            setShared(TopicSelector.getAvailableTopics());
            return;
        }
        setLoadingShared(true);
        await TopicSelector.loadAvailableTopics();
        setShared(TopicSelector.getAvailableTopics() || []);
        setLoadingShared(false);
    }, []);

    // Gộp kho CỦA MÌNH và kho ĐƯỢC CHIA SẺ vào cùng một danh sách.
    //
    // Không tách tab thứ tư: thanh tab đã 3 nút chữ dài ("Từ vựng chung" / "Từ
    // vựng riêng" / "Từ vựng sai"), thêm nữa là xuống dòng trên mobile. Với người
    // học thì cả hai đều là "bộ từ tôi luyện được" — khác nhau ở nguồn gốc, mà
    // đó là việc của cái badge.
    const loadPersonal = useCallback(async () => {
        if (!getToken()) { setPersonal([]); return; }
        setLoadingPersonal(true);
        try {
            const [mine, shared] = await Promise.all([
                UploadVocabAPI.myTopics(),
                UploadVocabAPI.sharedTopics(),
            ]);
            const own = (mine?.success ? mine.data || [] : []).map(t => ({ ...t, isShared: false }));
            const got = (shared?.success ? shared.data || [] : []).map(t => ({ ...t, isShared: true }));
            // Kho của mình lên trước — đó là thứ người dùng tìm thường xuyên hơn.
            setPersonal([...own, ...got]);
        } catch {
            setPersonal([]);
        }
        setLoadingPersonal(false);
    }, []);

    const loadWrong = useCallback(async () => {
        if (!getToken()) { setWrong([]); return; }
        setLoadingWrong(true);
        try {
            const res = await WrongWordsAPI.list();
            const list = res.success ? (res.data || []) : [];
            // Gom theo source — mỗi source là một thẻ riêng.
            const bySource = new Map();
            for (const w of list) {
                const key = w.source || '';
                bySource.set(key, (bySource.get(key) || 0) + 1);
            }
            const groups = [...bySource.entries()]
                .map(([source, wordCount]) => ({ source, wordCount }))
                .sort((a, b) => b.wordCount - a.wordCount);
            setWrong(groups);
        } catch {
            setWrong([]);
        }
        setLoadingWrong(false);
    }, []);

    const selectWrong = useCallback(async (source) => {
        const topic = await TopicSelector.selectWrongWordsTopic(source);
        setCurrent(topic);
        return topic;
    }, []);

    const selectShared = useCallback(async (topicId) => {
        const topic = await TopicSelector.selectTopic(topicId);
        setCurrent(topic);
        return topic;
    }, []);

    const selectPersonal = useCallback(async (source) => {
        const topic = await TopicSelector.selectPersonalTopic(source);
        setCurrent(topic);
        return topic;
    }, []);

    // Tên là `selectSharedWithMe`, KHÔNG phải `selectShared` — cái tên đó đã dùng
    // cho "từ vựng chung" (đề công khai) ở trên. Hai nghĩa của chữ "shared" trong
    // cùng một file: đề dùng chung cho mọi người, và bộ riêng được ai đó chia sẻ.
    const selectSharedWithMe = useCallback(async (ownerEmail, source) => {
        const topic = await TopicSelector.selectSharedTopic(ownerEmail, source);
        setCurrent(topic);
        return topic;
    }, []);

    /** Sao chép bộ được chia sẻ về kho riêng, rồi tải lại danh sách. */
    const copyShared = useCallback(async (ownerEmail, source) => {
        const res = await UploadVocabAPI.copySharedSource(ownerEmail, source);
        if (res?.success) await loadPersonal();
        return res;
    }, [loadPersonal]);

    useEffect(() => {
        if (enabled) loadShared();
    }, [enabled, loadShared]);

    return {
        shared, personal, wrong, current,
        loadingShared, loadingPersonal, loadingWrong,
        loadShared, loadPersonal, loadWrong,
        selectShared, selectPersonal, selectWrong,
        selectSharedWithMe, copyShared,
    };
}
