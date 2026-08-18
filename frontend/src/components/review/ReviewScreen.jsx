import { useState, useEffect, useCallback, useRef } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { GameState } from '@game/state.js';
import { Notification } from '@ui/Toaster.jsx';
import { WrongWordsAPI } from '@api/wrongWords.js';

/**
 * ÔN TỪ ĐÃ SAI — lặp lại ngắt quãng (SM-2).
 *
 * Khác mọi chế độ luyện khác ở ba điểm, và đều có lý do:
 *
 *  1. KHÔNG tốn năng lượng. Ôn lại từ mình đã sai là việc nên khuyến khích;
 *     bắt trả phí cho nó là phạt người chịu khó sửa lỗi.
 *  2. TỰ CHẤM (nhớ / không nhớ) thay vì gõ đáp án. SM-2 cần biết "nhớ dễ hay
 *     khó", mà gõ đúng chính tả không nói lên điều đó — gõ sai một chữ cái
 *     không có nghĩa là quên từ.
 *  3. Lịch do SERVER giữ. Client chỉ hiển thị và báo đúng/sai; mọi phép tính
 *     giãn cách nằm trong `WrongWord.recordCorrect/recordWrong`.
 */

/** Mỗi phiên tối đa ngần này từ — ôn quá dài thì chất lượng nhớ tụt. */
const SESSION_SIZE = 10;

export default function ReviewScreen({ active }) {
    const { showScreen } = useGame();

    const [words, setWords] = useState([]);
    const [dueTotal, setDueTotal] = useState(0);
    const [idx, setIdx] = useState(0);
    const [revealed, setRevealed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(null);   // { remembered, forgot }
    const [loadedOnce, setLoadedOnce] = useState(false);

    // Đếm trong phiên. Dùng ref chứ không state: chúng chỉ đọc lúc kết phiên,
    // để ở state là mỗi lần trả lời lại render thừa một lượt.
    const tally = useRef({ remembered: 0, forgot: 0 });

    const load = useCallback(async ({ all = false } = {}) => {
        setLoading(true);
        try {
            const { words: w, dueTotal: total } = await WrongWordsAPI.due({
                limit: SESSION_SIZE, all,
            });
            setWords(w);
            setDueTotal(total);
            setIdx(0);
            setRevealed(false);
            setDone(null);
            tally.current = { remembered: 0, forgot: 0 };
        } catch (err) {
            Notification.error(String(err?.message || 'Không tải được danh sách ôn'));
        } finally {
            setLoading(false);
            setLoadedOnce(true);
        }
    }, []);

    // Nạp khi MỞ màn. `active` đổi từ false→true mới nạp lại — màn hình được giữ
    // trong DOM (chỉ đổi class), nên không có mount/unmount để dựa vào.
    useEffect(() => {
        if (active && !loadedOnce) load();
    }, [active, loadedOnce, load]);

    const current = words[idx] || null;

    /** Trả lời xong một từ → gửi kết quả rồi sang từ kế. */
    const answer = useCallback(async (remembered) => {
        if (busy || !current) return;
        setBusy(true);
        try {
            if (remembered) {
                const r = await WrongWordsAPI.correct(current.wordId);
                tally.current.remembered += 1;
                // Server xoá hẳn doc khi đã thuộc — nói cho người dùng biết, đó
                // là phần thưởng thật sự của chế độ này.
                if (/thuộc/i.test(r?.message || '')) {
                    Notification.success(`🎓 Đã thuộc "${current.en}" — xoá khỏi danh sách ôn`);
                }
            } else {
                await WrongWordsAPI.wrong(current);
                tally.current.forgot += 1;
            }
        } catch (err) {
            // Gửi hỏng thì DỪNG, không đi tiếp: đi tiếp là lịch SM-2 của từ này
            // không được cập nhật mà người dùng tưởng đã ôn xong.
            Notification.error(String(err?.message || 'Không lưu được kết quả'));
            setBusy(false);
            return;
        }

        setBusy(false);
        setRevealed(false);
        if (idx + 1 >= words.length) {
            setDone({ ...tally.current });
            // Thưởng nhẹ: ôn tập không tốn năng lượng nên cũng không thưởng lớn,
            // nhưng con số 0 thì không ai muốn quay lại.
            const xp = tally.current.remembered * 5;
            if (xp) GameState.creditServerRewards?.({ xp });
        } else {
            setIdx(i => i + 1);
        }
    }, [busy, current, idx, words.length]);

    // Phím tắt: Space lật thẻ, 1/2 chấm nhớ/không nhớ. Ôn 10 từ mà phải rê chuột
    // từng nút thì người ta bỏ giữa chừng.
    useEffect(() => {
        if (!active || done || !current) return;
        const onKey = (e) => {
            if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
            if (e.code === 'Space' || e.key === 'Enter') {
                e.preventDefault();
                if (!revealed) setRevealed(true);
            } else if (revealed && (e.key === '1' || e.key === '2')) {
                e.preventDefault();
                answer(e.key === '1');
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [active, done, current, revealed, answer]);

    return (
        <div id="review-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-rotate-left"></i> Ôn từ đã sai</h2>
            </div>

            {loading && (
                <div className="review-empty">
                    <i className="fas fa-spinner fa-spin"></i> Đang tải…
                </div>
            )}

            {/* HẾT TỪ ĐẾN HẠN — không phải lỗi, mà là trạng thái tốt. */}
            {!loading && loadedOnce && !words.length && !done && (
                <div className="review-empty">
                    <i className="fas fa-circle-check review-empty-icon"></i>
                    <h3>Không có từ nào đến hạn ôn</h3>
                    <p>
                        Lịch ôn giãn dần theo trí nhớ: từ nào bạn nhớ tốt sẽ quay lại
                        muộn hơn. Quay lại sau, hoặc ôn thêm ngay bây giờ.
                    </p>
                    <button className="btn btn-secondary" onClick={() => load({ all: true })}>
                        <i className="fas fa-layer-group"></i> Ôn thêm dù chưa đến hạn
                    </button>
                </div>
            )}

            {/* KẾT PHIÊN */}
            {!loading && done && (
                <div className="review-done">
                    <div className="review-done-num">{done.remembered}/{done.remembered + done.forgot}</div>
                    <p className="review-done-label">từ bạn còn nhớ</p>
                    {done.remembered > 0 && (
                        <p className="review-reward">+{done.remembered * 5} XP</p>
                    )}
                    <p className="review-done-note">
                        {dueTotal > done.remembered + done.forgot
                            ? `Còn ${dueTotal - done.remembered - done.forgot} từ đến hạn.`
                            : 'Bạn đã ôn hết từ đến hạn hôm nay.'}
                    </p>
                    <div className="review-done-actions">
                        <button className="btn btn-primary" onClick={() => load()}>
                            <i className="fas fa-rotate-right"></i> Ôn tiếp
                        </button>
                        <button className="btn btn-secondary" onClick={() => showScreen('home-screen')}>
                            <i className="fas fa-house"></i> Về trang chủ
                        </button>
                    </div>
                </div>
            )}

            {/* THẺ ÔN */}
            {!loading && current && !done && (
                <div className="review-body">
                    <div className="review-progress">
                        <span>{idx + 1} / {words.length}</span>
                        {dueTotal > words.length && (
                            <span className="review-due-total">· {dueTotal} từ đến hạn</span>
                        )}
                    </div>

                    <div className="review-card">
                        {/* Số lần sai — cho biết vì sao từ này ở đây. */}
                        {current.wrongCount > 1 && (
                            <span className="review-wrong-count" title="Số lần bạn đã sai từ này">
                                sai {current.wrongCount} lần
                            </span>
                        )}

                        <div className="review-word">{current.en}</div>
                        {current.phonetic && <div className="review-phonetic">{current.phonetic}</div>}

                        {!revealed ? (
                            <button className="btn btn-primary review-reveal" onClick={() => setRevealed(true)}>
                                <i className="fas fa-eye"></i> Hiện nghĩa
                                <kbd>Space</kbd>
                            </button>
                        ) : (
                            <>
                                <div className="review-meaning">{current.vn}</div>
                                {current.example && (
                                    <div className="review-example">{current.example}</div>
                                )}

                                {/* TỰ CHẤM. Đây là dữ liệu SM-2 cần: "nhớ dễ hay khó",
                                    không phải "gõ đúng chính tả hay không". */}
                                <div className="review-grade">
                                    <button
                                        className="btn btn-danger"
                                        onClick={() => answer(false)}
                                        disabled={busy}
                                    >
                                        <i className="fas fa-xmark"></i> Chưa nhớ
                                        <kbd>2</kbd>
                                    </button>
                                    <button
                                        className="btn btn-success"
                                        onClick={() => answer(true)}
                                        disabled={busy}
                                    >
                                        <i className="fas fa-check"></i> Đã nhớ
                                        <kbd>1</kbd>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
