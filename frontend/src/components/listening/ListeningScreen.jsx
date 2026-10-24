import { useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { Notification } from '@ui/Toaster.jsx';
import { ListeningAPI } from '@api/listening.js';
import { TopicSelector } from '@components/vocab/topic/topicSelector.js';
import { PartSelector } from '@components/vocab/part/partSelector.js';
import { getVocabLang } from '@api/vocabulary.js';
import ChonDangBai, { useGoiYDang, dangGui } from '../ai/ChonDangBai.jsx';
import LichSuMode from '../history/LichSuMode.jsx';
import NutBatDau from '../ai/NutBatDau.jsx';
import { useHoiKhiThoat } from '../ai/aiExitGuard.js';

/** Mức khó của đoạn nghe (khoá gửi server; server chọn dải CEFR tương ứng). */
const MUC = [
    { key: 'easy', label: 'Dễ', desc: 'Câu ngắn, từ thông dụng' },
    { key: 'medium', label: 'Vừa', desc: 'Câu đầy đủ, từ công sở' },
    { key: 'hard', label: 'Khó', desc: 'Câu phức, từ ít gặp' },
];

/**
 * Kho dạng nghe — chỉ dạng MỘT người nói (TTS đọc một giọng). Nghe không có kiểu
 * chấm nên `hop` để trống. Khoá khớp `NHOM_DANG_NGHE` ở
 * backend/services/listeningAi.js. "Ngẫu nhiên" giữ đoạn như trước.
 */
const NHOM_DANG = [
    {
        key: 'thong-bao', label: 'Thông báo', hop: [],
        dang: [
            { key: 'airport', label: 'Sân bay' },
            { key: 'station', label: 'Nhà ga / bến xe' },
            { key: 'store', label: 'Siêu thị / cửa hàng' },
            { key: 'voicemail', label: 'Tin nhắn thoại' },
            { key: 'weather', label: 'Dự báo thời tiết' },
        ],
    },
    {
        key: 'tin-podcast', label: 'Tin tức & podcast', hop: [],
        dang: [
            { key: 'news', label: 'Bản tin' },
            { key: 'podcast', label: 'Podcast' },
            { key: 'radio-ad', label: 'Quảng cáo radio' },
            { key: 'tour', label: 'Hướng dẫn viên' },
            { key: 'traffic', label: 'Tin giao thông' },
        ],
    },
    {
        key: 'hoc-viec', label: 'Học tập & công việc', hop: [],
        dang: [
            { key: 'lecture', label: 'Bài giảng' },
            { key: 'meeting', label: 'Mở đầu cuộc họp' },
            { key: 'instructions', label: 'Hướng dẫn' },
            { key: 'presentation', label: 'Thuyết trình' },
            { key: 'training', label: 'Đào tạo nhân viên' },
        ],
    },
    {
        key: 'doi-thuong', label: 'Đời thường', hop: [],
        dang: [
            { key: 'story', label: 'Kể chuyện' },
            { key: 'directions', label: 'Chỉ đường' },
            { key: 'recipe', label: 'Nấu ăn' },
            { key: 'review', label: 'Nhận xét' },
            { key: 'speech', label: 'Lời chúc / phát biểu' },
        ],
    },
];

/** Tốc độ đọc. Đổi tốc độ là đọc lại đoạn đó, không mất bài. */
const TOC_DO = [
    { v: 0.7, label: 'Chậm' },
    { v: 0.9, label: 'Vừa' },
    { v: 1.1, label: 'Nhanh' },
];

/**
 * Nghe với AI (TTS): nghe đoạn do AI viết từ bộ từ đang học, gõ lại những gì nghe
 * được, nhận điểm theo từ và đoạn gốc sau khi nộp.
 */
export default function ListeningScreen({ active }) {
    const { showScreen, syncFromState } = useGame();

    const [level, setLevel] = useState('medium');
    const [tab, setTab] = useState('luyen'); // 'luyen' | 'lichsu'
    const [dang, setDang] = useState('');     // '' = ngẫu nhiên
    const [tuChon, setTuChon] = useState(''); // dạng/chủ đề tự nhập, ưu tiên hơn `dang`
    // Dạng bài AI gợi ý hợp bộ từ của Part — nhóm đầu tiên, và "Ngẫu nhiên" bốc trong đó.
    const goiY = useGoiYDang('listening', active);
    const [phien, setPhien] = useState(null);     // { id, totalTargets }
    const [tocDo, setTocDo] = useState(0.9);
    const [typed, setTyped] = useState('');
    const [ketQua, setKetQua] = useState(null);   // kết quả chấm sau khi nộp
    const [busy, setBusy] = useState(false);

    const source = TopicSelector.currentTopic?.source || '';
    // Ngôn ngữ của bài đang nghe (server trả về khi mở phiên); trước khi mở thì theo
    // bộ từ đang học. Tiếng Trung chấm theo từng CHỮ HÁN, tiếng Anh theo TỪ.
    const zh = (phien?.lang || (getVocabLang() === 'zh' ? 'zh' : 'en')) === 'zh';
    const donVi = zh ? 'chữ' : 'từ';
    const part = PartSelector.selectedPart || '';

    const batDau = async () => {
        setBusy(true);
        try {
            const d = await ListeningAPI.start({ level, ...dangGui({ dang, tuChon, goiY }) });
            setPhien(d);
            setTyped('');
            setKetQua(null);
            setTocDo(0.9);
            syncFromState?.();
        } catch (err) {
            Notification.error(String(err?.message || 'Không mở được bài nghe'));
        } finally {
            setBusy(false);
        }
    };

    const nop = async () => {
        if (!phien || !typed.trim()) return;
        setBusy(true);
        try {
            const d = await ListeningAPI.grade(phien.id, typed);
            setKetQua(d);
            syncFromState?.();
        } catch (err) {
            Notification.error(String(err?.message || 'Không chấm được bài'));
        } finally {
            setBusy(false);
        }
    };

    const baiMoi = () => {
        setPhien(null);
        setKetQua(null);
        setTyped('');
    };

    // Đang làm dở mà rời màn (quay về, menu, Trang chủ…) → hỏi trước, như 16 chế độ luyện tập.
    useHoiKhiThoat('listening-screen', !!phien && !ketQua, {
        tieuDe: 'Thoát bài nghe?',
        noiDung: 'Bài nghe chưa nộp sẽ bị bỏ. Năng lượng đã trừ khi bắt đầu sẽ không được hoàn lại. Bạn có chắc chắn muốn thoát?',
    });

    return (
        <div id="listening-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-headphones"></i> Nghe với AI</h2>
            </div>

            <div className="tr-tabs">
                <button className={`tr-tab${tab === 'luyen' ? ' is-on' : ''}`} onClick={() => setTab('luyen')}>
                    <i className="fas fa-headphones"></i> Luyện
                </button>
                <button className={`tr-tab${tab === 'lichsu' ? ' is-on' : ''}`} onClick={() => setTab('lichsu')}>
                    <i className="fas fa-clock-rotate-left"></i> Lịch sử
                </button>
            </div>

            {tab === 'lichsu' ? <LichSuMode mode="nghe" /> : !phien ? (
                <div className="essay-intro essay-intro--wide">
                    <p>
                        Nghe một đoạn ngắn do AI viết từ <strong>bộ từ bạn đang học</strong>, rồi
                        gõ lại những gì bạn nghe được. Bạn có thể nghe lại và đổi tốc độ.
                    </p>
                    {!source && (
                        <p className="tr-intro-note">
                            Chọn đề và Part ở thanh trên trước khi bắt đầu.
                        </p>
                    )}
                    {/* Hai cột như Đọc hiểu: TRÁI là dạng nghe, PHẢI là độ khó. */}
                    <div className="ai-setup">
                        <div className="ai-setup-col">
                            <ChonDangBai
                                nhom={NHOM_DANG}
                                goiY={goiY}
                                dang={dang}
                                onDang={setDang}
                                tuChon={tuChon}
                                onTuChon={setTuChon}
                                placeholder="Hoặc tự nhập: thông báo bệnh viện, lời chào khách sạn…"
                            />
                        </div>
                        <div className="ai-setup-col">
                            <div className="ai-setup-title">Độ khó</div>
                            <div className="ai-setup-list tr-levels">
                                {MUC.map((m) => (
                                    <button
                                        key={m.key}
                                        className={`tr-level${level === m.key ? ' is-on' : ''}`}
                                        onClick={() => setLevel(m.key)}
                                    >
                                        <strong>{m.label}</strong>
                                        <em>{m.desc}</em>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    {/* Nút bắt đầu nổi cố định giữa đáy khung nhìn (portal vào body). */}
                    <NutBatDau active={active} onClick={batDau} disabled={busy}>
                        <i className="fas fa-play"></i> {busy ? 'Đang chuẩn bị…' : 'Bắt đầu nghe'}
                    </NutBatDau>
                </div>
            ) : (
                <div className="listening-body">
                    <p className="tr-intro-note">
                        {phien.dangVi ? `${phien.dangVi} · ` : ''}{phien.totalTargets} từ mục tiêu trong đoạn này.
                    </p>

                    {/* Âm thanh: đổi tốc độ là đổi `src`, nên đoạn được đọc lại từ đầu. */}
                    <div className="listening-player">
                        <audio
                            key={`${phien.id}-${tocDo}`}
                            controls
                            autoPlay
                            src={ListeningAPI.audioUrl(phien.id, tocDo)}
                        />
                        <div className="listening-speed">
                            {TOC_DO.map((t) => (
                                <button
                                    key={t.v}
                                    className={`tr-level listening-speed-btn${tocDo === t.v ? ' is-on' : ''}`}
                                    onClick={() => setTocDo(t.v)}
                                >
                                    <strong>{t.label}</strong>
                                </button>
                            ))}
                        </div>
                    </div>

                    {!ketQua ? (
                        <>
                            <label className="ai-role-label">Gõ lại những gì bạn nghe được</label>
                            <textarea
                                className="ai-role-input"
                                rows={4}
                                maxLength={1000}
                                value={typed}
                                onChange={(e) => setTyped(e.target.value)}
                                placeholder={zh ? 'Gõ đoạn bạn nghe được bằng chữ Hán…' : 'Gõ đoạn bạn nghe được bằng tiếng Anh…'}
                            />
                            <div className="ai-role-actions">
                                <button className="btn btn-primary" onClick={nop} disabled={busy || !typed.trim()}>
                                    <i className="fas fa-check"></i> Nộp bài
                                </button>
                                <button className="btn btn-secondary" onClick={baiMoi} disabled={busy}>
                                    Bỏ bài này
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="listening-result">
                            <p>
                                Điểm <strong>{ketQua.score}</strong>/100 · đúng{' '}
                                <strong>{ketQua.correct}</strong>/{ketQua.total} {donVi}
                            </p>
                            {ketQua.reward && !ketQua.alreadyClaimed && (
                                <p className="convo-reward">
                                    +{ketQua.reward.xp} XP · +{ketQua.reward.coins} xu
                                </p>
                            )}
                            {ketQua.missing?.length > 0 && (
                                <p>
                                    <strong>Bỏ sót:</strong> {ketQua.missing.join(', ')}
                                </p>
                            )}
                            {ketQua.extra?.length > 0 && (
                                <p>
                                    <strong>Gõ thừa:</strong> {ketQua.extra.join(', ')}
                                </p>
                            )}
                            <div className="ai-role-foot"><strong>Đoạn gốc</strong></div>
                            <p className="listening-passage">{ketQua.passage}</p>
                            <div className="ai-role-actions">
                                <button className="btn btn-primary" onClick={baiMoi}>
                                    <i className="fas fa-rotate-right"></i> Bài mới
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
