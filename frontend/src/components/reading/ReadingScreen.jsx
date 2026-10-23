import { useState, useRef, useCallback } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { GameLogic } from '@game/gameLogic.js';
import { GameState } from '@game/state.js';
import { Energy } from '@game/energy.js';
import { Notification } from '@ui/Toaster.jsx';
import { ReadingAPI } from '@api/reading.js';
import LichSuMode from '../history/LichSuMode.jsx';
import KieuChamDoKho from '../ai/KieuChamDoKho.jsx';
import ChonDangBai, { MAX_TU_CHON, useGoiYDang, dangGui } from '../ai/ChonDangBai.jsx';
import { getVocabLang } from '@api/vocabulary.js';
import { KIEU_CHAM, kieuChoNgonNgu, doKhoChoKieu } from '@lib/kieuCham.js';

/**
 * Luyện ĐỌC HIỂU nhiều dạng bài: đời thường, công việc, báo chí, học thuật —
 * hoặc dạng/chủ đề người học tự nhập. Kiểu chấm (Giao tiếp/TOEIC/IELTS/HSK)
 * quyết định văn phong và cách ra câu hỏi.
 *
 * Đây là phần chiếm tỉ trọng lớn nhất của đề Reading (54/200 câu) mà ngân hàng
 * đề trong app không có câu nào. Mọi chế độ khác hỏi TỪ đơn lẻ hoặc một câu;
 * chỗ này là nơi duy nhất luyện đọc một văn bản dài rồi suy ra thông tin.
 *
 * Đáp án nằm ở SERVER cho tới lúc nộp — client chỉ có đề và bốn lựa chọn.
 */

const NHAN = ['A', 'B', 'C', 'D'];

/** Mặc định theo ngôn ngữ, khớp `KIEU_DOC_MAC_DINH` ở server. */
const KIEU_MAC_DINH = { en: 'toeic', zh: 'hsk' };

/**
 * Kho dạng bài dùng chung cho MỌI kiểu chấm — đọc hiểu không bó trong vài dạng
 * của TOEIC Part 7. Kiểu chấm chỉ quyết định văn phong và cách ra câu hỏi;
 * `hop` chỉ để xếp nhóm hợp lên đầu và để "Ngẫu nhiên" bốc đúng nhóm.
 * Khoá khớp `NHOM_DANG` ở backend/services/readingGrader.js.
 */
const NHOM_DANG = [
    {
        key: 'doi-thuong', label: 'Đời thường', hop: ['giaotiep', 'hsk'],
        dang: [
            { key: 'message', label: 'Tin nhắn' },
            { key: 'personal-email', label: 'Email cá nhân' },
            { key: 'social-post', label: 'Bài đăng MXH' },
            { key: 'review', label: 'Đánh giá' },
            { key: 'invitation', label: 'Lời mời' },
            { key: 'diary', label: 'Nhật ký' },
            { key: 'blog', label: 'Blog' },
            { key: 'recipe', label: 'Công thức' },
        ],
    },
    {
        key: 'cong-viec', label: 'Công việc', hop: ['toeic'],
        dang: [
            { key: 'email', label: 'Email công việc' },
            { key: 'notice', label: 'Thông báo' },
            { key: 'advertisement', label: 'Quảng cáo' },
            { key: 'memo', label: 'Ghi chú nội bộ' },
            { key: 'schedule', label: 'Lịch trình' },
            { key: 'chat', label: 'Chuỗi tin nhắn' },
            { key: 'job-ad', label: 'Tin tuyển dụng' },
            { key: 'form', label: 'Biểu mẫu / hoá đơn' },
        ],
    },
    {
        key: 'bao-chi', label: 'Báo chí & truyện', hop: ['giaotiep', 'toeic', 'ielts', 'hsk'],
        dang: [
            { key: 'article', label: 'Bài báo' },
            { key: 'interview', label: 'Phỏng vấn' },
            { key: 'story', label: 'Truyện ngắn' },
            { key: 'biography', label: 'Tiểu sử' },
            { key: 'opinion', label: 'Bài bình luận' },
            { key: 'travel', label: 'Du lịch' },
        ],
    },
    {
        key: 'hoc-thuat', label: 'Kiến thức & học thuật', hop: ['ielts'],
        dang: [
            { key: 'science', label: 'Khoa học' },
            { key: 'history', label: 'Lịch sử' },
            { key: 'society', label: 'Xã hội' },
            { key: 'environment', label: 'Môi trường' },
            { key: 'technology', label: 'Công nghệ' },
            { key: 'health', label: 'Sức khoẻ' },
            { key: 'research', label: 'Nghiên cứu' },
            { key: 'explain', label: 'Hướng dẫn / giải thích' },
        ],
    },
];

/**
 * Vài từ trong bộ đang học, để bài đọc bám vào vốn từ vừa luyện.
 *
 * Lấy NGẪU NHIÊN chứ không lấy 8 từ đầu: bộ từ xếp cố định, nên lấy đầu danh
 * sách thì mọi bài đọc đều xoay quanh đúng ngần ấy từ.
 */
function layTuGoiY(soLuong = 6) {
    const pool = Array.isArray(GameLogic.vocabularyData) ? GameLogic.vocabularyData : [];
    if (!pool.length) return [];
    return [...pool].sort(() => Math.random() - 0.5).slice(0, soLuong)
        .map((w) => String(w?.en || '')).filter(Boolean);
}

export default function ReadingScreen({ active }) {
    const { showScreen, syncFromState } = useGame();

    const [de, setDe] = useState(null);      // { readingId, title, passage, questions[] }
    const [chon, setChon] = useState([]);    // nhãn A–D theo thứ tự câu
    const [result, setResult] = useState(null);
    const [level, setLevel] = useState('medium');
    const [kieu, setKieu] = useState(null); // người học bấm chọn; null = mặc định theo ngôn ngữ
    const [tab, setTab] = useState('luyen'); // 'luyen' | 'lichsu'
    const [dang, setDang] = useState('');     // '' = ngẫu nhiên
    const [tuChon, setTuChon] = useState(''); // dạng/chủ đề tự nhập, ưu tiên hơn `dang`
    const [loadingDe, setLoadingDe] = useState(false);
    const [grading, setGrading] = useState(false);

    // Ngôn ngữ đề lấy từ hồ sơ ở server (`vocabLang`), nên ở đây chỉ chia hai nhánh en/zh.
    const ngonNgu = getVocabLang() === 'zh' ? 'zh' : 'en';
    const kieuList = kieuChoNgonNgu(ngonNgu);
    const kieuDangChon = kieu && kieuList.some((k) => k.key === kieu) ? kieu : KIEU_MAC_DINH[ngonNgu];
    const kieuMoTa = KIEU_CHAM.find((k) => k.key === kieuDangChon) || {};
    const tuChonGui = tuChon.trim();
    // Dạng bài AI gợi ý hợp bộ từ của Part — nhóm đầu tiên, và "Ngẫu nhiên" bốc trong đó.
    const goiY = useGoiYDang('reading', active);

    // `onBought` của popup nạp năng lượng gọi lại chính `handleNop` — không đưa
    // được `handleNop` vào deps của chính nó.
    const nopRef = useRef(null);

    const handleDeMoi = useCallback(async () => {
        if (loadingDe) return;
        setLoadingDe(true);
        try {
            const d = await ReadingAPI.passage({
                words: layTuGoiY(), level, ...dangGui({ dang, tuChon: tuChonGui, goiY }), rubric: kieuDangChon,
            });
            if (!d?.questions?.length) throw new Error('Server trả về bài đọc không hợp lệ');
            setDe(d);
            // Bài mới thì xoá lựa chọn cũ — giữ lại là các câu đã tick sẵn đáp
            // án của bài trước, mà thứ tự câu hoàn toàn khác.
            setChon(new Array(d.questions.length).fill(''));
            setResult(null);
        } catch (err) {
            Notification.error(String(err?.message || 'Không lấy được bài đọc'));
        } finally {
            setLoadingDe(false);
        }
    }, [loadingDe, level, dang, tuChonGui, goiY, kieuDangChon]);

    const handleNop = useCallback(async () => {
        if (grading || !de) return;

        setGrading(true);
        try {
            const d = await ReadingAPI.grade({ readingId: de.readingId, answers: chon });
            if (!d?.details) throw new Error('Server trả về kết quả không hợp lệ');
            setResult(d);
            if (typeof d.energyRemaining === 'number') {
                GameState.setEnergy?.(d.energyRemaining);
            }
            GameState.creditServerRewards?.({
                xp: d.reward?.xp || 0,
                coins: d.reward?.coins || 0,
            });
            syncFromState?.();
        } catch (err) {
            // Đề hết hạn (server khởi động lại, hoặc để quá 1 giờ). Chưa trừ
            // năng lượng nên chỉ cần xin bài mới — nói rõ thay vì báo lỗi chung.
            if (err?.expired) {
                Notification.warning('Bài đọc đã hết hạn — đang lấy bài mới.');
                setDe(null);
                setResult(null);
                return;
            }
            if (err?.energyNeeded) {
                Energy.showRefillModal({
                    needed: err.energyNeeded,
                    onBought: () => { nopRef.current?.(); },
                });
                return;
            }
            Notification.error(String(err?.message || 'Không chấm được bài'));
        } finally {
            setGrading(false);
        }
    }, [grading, de, chon, syncFromState]);

    nopRef.current = handleNop;

    const daLam = chon.filter(Boolean).length;
    const tongCau = de?.questions?.length || 0;

    return (
        <div id="reading-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-book-open-reader"></i> Đọc hiểu</h2>
            </div>

            <div className="tr-tabs">
                <button className={`tr-tab${tab === 'luyen' ? ' is-on' : ''}`} onClick={() => setTab('luyen')}>
                    <i className="fas fa-pen"></i> Luyện
                </button>
                <button className={`tr-tab${tab === 'lichsu' ? ' is-on' : ''}`} onClick={() => setTab('lichsu')}>
                    <i className="fas fa-clock-rotate-left"></i> Lịch sử
                </button>
            </div>

            {tab === 'lichsu' ? <LichSuMode mode="doc" /> : !de ? (
                <div className="essay-intro essay-intro--wide">
                    <p>
                        Đọc một văn bản {ngonNgu === 'zh' ? 'tiếng Trung' : 'tiếng Anh'} theo
                        văn phong <strong>{kieuMoTa.label}</strong>, rồi trả lời câu hỏi.
                    </p>
                    <p className="tr-intro-note">
                        <i className="fas fa-circle-info"></i>{' '}
                        Bài đọc dùng chính bộ từ bạn đang học, và mỗi câu sai đều có giải
                        thích kèm dẫn chứng trong bài.
                    </p>

                    {/* Hai cột như Hội thoại: trái = loại bài, phải = kiểu chấm + độ khó.
                        Khối phải dùng CHUNG component với Hội thoại, Viết luận và Dịch. */}
                    <div className="ai-setup">
                        <div className="ai-setup-col">
                            <ChonDangBai
                                nhom={NHOM_DANG}
                                goiY={goiY}
                                kieu={kieuDangChon}
                                kieuLabel={kieuMoTa.label}
                                dang={dang}
                                onDang={setDang}
                                tuChon={tuChon}
                                onTuChon={setTuChon}
                                maxLength={MAX_TU_CHON}
                                placeholder="Hoặc tự nhập: thư phàn nàn, podcast, thực đơn…"
                            />
                        </div>

                        <div className="ai-setup-col">
                            <KieuChamDoKho
                                kieuList={kieuList}
                                kieuDangChon={kieuDangChon}
                                onKieu={setKieu}
                                doKhoList={doKhoChoKieu(kieuDangChon)}
                                doKhoDangChon={level}
                                onDoKho={setLevel}
                            />
                        </div>
                    </div>

                    <button className="btn btn-primary" onClick={handleDeMoi} disabled={loadingDe}>
                        {loadingDe
                            ? <><i className="fas fa-spinner fa-spin"></i> Đang soạn bài…</>
                            : <><i className="fas fa-file-lines"></i> Lấy bài đọc</>}
                    </button>
                </div>
            ) : (
                <div className="essay-body">
                    <div className="rd-passage">
                        <div className="essay-prompt-head">
                            <span>
                                {de.title || 'Bài đọc'}
                                {de.dangVi ? ` · ${de.dangVi}` : ''}
                            </span>
                            <button
                                className="icon-btn"
                                title="Đổi bài khác"
                                onClick={handleDeMoi}
                                disabled={loadingDe || grading}
                            >
                                <i className={`fas fa-rotate-right${loadingDe ? ' fa-spin' : ''}`}></i>
                            </button>
                        </div>
                        {/* `white-space: pre-wrap` giữ xuống dòng của email/thông báo —
                            gộp thành một khối chữ liền thì mất luôn bố cục vốn là một
                            phần của việc đọc hiểu. */}
                        <p className="rd-passage-text">{de.passage}</p>
                    </div>

                    <div className="rd-questions">
                        {de.questions.map((q, i) => {
                            const ket = result?.details?.[i];
                            return (
                                <div
                                    key={i}
                                    className={`rd-q${ket ? (ket.correct ? ' is-right' : ' is-wrong') : ''}`}
                                >
                                    <div className="rd-q-text">
                                        <span className="rd-q-num">{i + 1}</span>
                                        {q.question}
                                    </div>
                                    <div className="rd-opts">
                                        {q.options.map((opt, k) => {
                                            const nhan = NHAN[k];
                                            const dangChon = chon[i] === nhan;
                                            // Sau khi chấm: tô đáp án ĐÚNG màu xanh dù
                                            // người học chọn gì — thấy đáp án đúng ở đâu
                                            // mới học được, chỉ biết mình sai thì không.
                                            const laDapAn = ket && ket.answer === nhan;
                                            const chonSai = ket && ket.chose === nhan && !ket.correct;
                                            return (
                                                <button
                                                    key={k}
                                                    className={`rd-opt${dangChon ? ' is-picked' : ''}${laDapAn ? ' is-right' : ''}${chonSai ? ' is-wrong' : ''}`}
                                                    disabled={!!result || grading}
                                                    onClick={() => setChon((c) => {
                                                        const n = [...c];
                                                        n[i] = nhan;
                                                        return n;
                                                    })}
                                                >
                                                    <span className="rd-opt-label">{nhan}</span>
                                                    <span>{opt}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {ket?.explain && (
                                        <p className="rd-explain">
                                            <i className="fas fa-lightbulb"></i> {ket.explain}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {!result ? (
                        <div className="essay-actions">
                            <span className={`essay-count${daLam === tongCau ? ' is-ok' : ''}`}>
                                Đã chọn {daLam} / {tongCau}
                            </span>
                            {/* KHÔNG chặn nộp khi còn bỏ trống: trong đề thi thật vẫn
                                nộp được, và câu bỏ trống tính sai. Chặn ở đây là dạy
                                một thói quen không tồn tại trong phòng thi. */}
                            <button className="btn btn-primary" onClick={handleNop} disabled={grading}>
                                {grading
                                    ? <><i className="fas fa-spinner fa-spin"></i> Đang chấm…</>
                                    : <><i className="fas fa-check-double"></i> Nộp bài</>}
                            </button>
                        </div>
                    ) : (
                        <div className="essay-result">
                            <div className="essay-band">
                                <div className="essay-band-num">{result.correct}/{result.total}</div>
                                <div className="essay-band-label">Số câu đúng</div>
                            </div>
                            <p className="essay-reward">
                                +{result.reward?.xp || 0} XP · +{result.reward?.coins || 0} xu
                            </p>
                            <div className="essay-result-actions">
                                <button className="btn btn-primary" onClick={handleDeMoi}>
                                    <i className="fas fa-rotate-right"></i> Bài đọc khác
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
