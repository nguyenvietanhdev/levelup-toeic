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

    const loadPersonal = useCallback(async () => {
        if (!getToken()) { setPersonal([]); return; }
        setLoadingPersonal(true);
        try {
            const res = await UploadVocabAPI.myTopics();
            setPersonal(res.success ? (res.data || []) : []);
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

    useEffect(() => {
        if (enabled) loadShared();
    }, [enabled, loadShared]);

    return {
        shared, personal, wrong, current,
        loadingShared, loadingPersonal, loadingWrong,
        loadShared, loadPersonal, loadWrong,
        selectShared, selectPersonal, selectWrong,
    };
}
