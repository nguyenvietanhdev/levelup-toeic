import { useState, useEffect, useCallback, useRef } from 'react';
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
    // Những bộ được chia sẻ mà mình ĐÃ sao chép về, dạng `ownerEmail|source`.
    // Chỉ sống trong phiên: chép xong thì thẻ gốc biến khỏi danh sách, tránh bấm
    // nhầm lần nữa và đẻ ra `-copy`, `-copy-copy`…
    const [copied, setCopied] = useState(() => new Set());
    // Bản mới nhất cho `loadPersonal` đọc — hàm đó có deps rỗng nên closure
    // của nó không bao giờ thấy state mới.
    const copiedRef = useRef(copied);
    useEffect(() => { copiedRef.current = copied; }, [copied]);

    // `force` = bỏ qua bộ nhớ đệm và gọi lại server.
    //
    // Mở popup thì KHÔNG force: đã có sẵn thì hiện ngay, không bắt chờ mạng.
    // Nhưng nút "Tải lại" thì phải force — không có cờ này, bấm nút chỉ set lại
    // đúng mảng đang có, danh sách y nguyên và người dùng tưởng nút hỏng.
    const loadShared = useCallback(async (force = false) => {
        if (!force && TopicSelector.getAvailableTopics()?.length > 0) {
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
            const got = (shared?.success ? shared.data || [] : [])
                .map(t => ({ ...t, isShared: true }))
                // Đã sao chép về rồi thì ẩn thẻ gốc. Đọc qua REF chứ không qua
                // state: `loadPersonal` là useCallback deps rỗng, closure của nó
                // giữ `copied` của lần render đầu và lọc theo tập RỖNG mãi mãi.
                .filter(t => !copiedRef.current.has(`${t.ownerEmail}|${t.source}`));
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
            // Gom theo source — mỗi source là một thẻ riêng. Đếm luôn phân bố
            // độ khó A/B/C trong CÙNG vòng lặp để vẽ dải màu: API đã trả về
            // nguyên từng từ (kèm `level`), không phải gọi thêm gì.
            const bySource = new Map();
            for (const w of list) {
                const key = w.source || '';
                let g = bySource.get(key);
                if (!g) bySource.set(key, g = { wordCount: 0, levelStats: { a: 0, b: 0, c: 0 } });
                g.wordCount++;
                // Chỉ lấy CHỮ CÁI ĐẦU: dữ liệu thật có cả "A", "A1", "a2"…
                const lv = String(w.level || '').trim().toUpperCase()[0];
                if (lv === 'A') g.levelStats.a++;
                else if (lv === 'B') g.levelStats.b++;
                else if (lv === 'C') g.levelStats.c++;
            }
            const groups = [...bySource.entries()]
                .map(([source, g]) => ({ source, ...g }))
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
        if (res?.success) {
            // Ghi nhớ đã chép rồi. Grant vẫn còn nên `sharedTopics` vẫn trả bộ
            // đó về — không đánh dấu thì tải lại xong thẻ vẫn nằm nguyên đấy,
            // người dùng bấm tiếp và mỗi lần lại tạo thêm một bản `-copy`.
            // Cập nhật REF TRƯỚC, không đợi effect đồng bộ: `setCopied` chỉ xếp
            // hàng một lần render, mà `loadPersonal()` chạy NGAY sau đây — lúc đó
            // effect chưa kịp chạy nên ref vẫn là tập cũ và thẻ vẫn hiện lại.
            copiedRef.current = new Set(copiedRef.current).add(`${ownerEmail}|${source}`);
            setCopied(copiedRef.current);
            await loadPersonal();
        }
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
