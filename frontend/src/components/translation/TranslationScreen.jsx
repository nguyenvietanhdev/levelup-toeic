import { useState, useRef, useCallback } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { GameState } from '@game/state.js';
import { Energy } from '@game/energy.js';
import { Notification } from '@ui/Toaster.jsx';
import { TranslationAPI } from '@api/translation.js';
import MistakeLog from './MistakeLog.jsx';
import LichSuMode from '../history/LichSuMode.jsx';
import KieuChamDoKho from '../ai/KieuChamDoKho.jsx';
import ChonDangBai, { useGoiYDang, dangGui } from '../ai/ChonDangBai.jsx';
import NutBatDau from '../ai/NutBatDau.jsx';
import ChuaBai from '../chuaBai/ChuaBai.jsx';
import XemLaiBai from '../chuaBai/XemLaiBai.jsx';
import { useBaiNhap, TheBaiDo } from '../ai/BaiNhap.jsx';
import { useNhamYeu, NutNhamYeu, NhanNham } from '../ai/NhamDiemYeu.jsx';
import { useHoiKhiThoat } from '../ai/aiExitGuard.js';
import { GameLogic } from '@game/gameLogic.js';
import { luuVaoTuRieng } from '@lib/luuMauCau.js';
import { bcp47, chuanMa, tenVietGiuaCau, tenDonVi, tenNgan as tenNganCua } from '@lib/ngonNgu.js';

/**
 * Luyện DỊCH — đọc một đoạn tiếng Việt, viết lại bằng tiếng Anh (hoặc Trung).
 *
 * Khác Viết luận ở chỗ quan trọng nhất: nội dung bị ẤN ĐỊNH sẵn. Viết luận thì
 * người học tự chọn nói gì, nên khi bí ý họ viết vòng quanh bằng vốn từ an toàn
 * và chỗ yếu không lộ ra. Dịch thì muốn đúng phải gọi tên đúng thứ trong bản
 * gốc — không né được.
 *
 * Ba trục điểm chứ không một điểm tổng: lỗi hay gặp nhất khi dịch là câu ĐÚNG
 * NGỮ PHÁP HOÀN TOÀN nhưng người bản ngữ không nói thế. Một điểm tổng giấu mất
 * đúng chuyện đó.
 */

/** Ba trục chấm. Trùng `CRITERIA` ở server. */
const CRITERIA = [
    { key: 'accuracy', vi: 'Đủ ý & đúng nghĩa', icon: 'fa-bullseye' },
    { key: 'grammar', vi: 'Ngữ pháp & chính tả', icon: 'fa-spell-check' },
    { key: 'naturalness', vi: 'Tự nhiên như người bản ngữ', icon: 'fa-comment-dots' },
];

/**
 * Chiều ngược (Anh/Trung → Việt) đo ĐỌC HIỂU: người học viết tiếng mẹ đẻ nên chấm có hiểu đúng
 * không. Trùng `CRITERIA_NGUOC` ở server (hiểu đúng x2, đủ ý x1, diễn đạt x0.5).
 */
const CRITERIA_NGUOC = [
    { key: 'comprehension', vi: 'Hiểu đúng nghĩa', icon: 'fa-lightbulb' },
    { key: 'completeness', vi: 'Đủ ý, không bỏ sót', icon: 'fa-list-check' },
    { key: 'expression', vi: 'Diễn đạt tiếng Việt', icon: 'fa-feather' },
];

/** Mỗi chiều một kiểu chấm (khớp server). */
const KIEU_CHAM_DICH = [
    { key: 'dich', label: 'Dịch', desc: 'Đủ ý, ngữ pháp, mức tự nhiên' },
];
const KIEU_CHAM_NGUOC = [
    { key: 'dich', label: 'Đọc hiểu', desc: 'Hiểu đúng (chính), đủ ý, diễn đạt' },
];

/** Nhớ chiều dịch người học chọn lần trước. */
const KHOA_CHIEU = 'levelup.dich.chieu';
const docChieu = () => { try { return localStorage.getItem(KHOA_CHIEU) === 'ngoai-vi' ? 'ngoai-vi' : 'vi-ngoai'; } catch { return 'vi-ngoai'; } };

const MUC_KHO = [
    { key: 'easy', label: 'Dễ', desc: '3 câu' },
    { key: 'medium', label: 'Vừa', desc: '4 câu' },
    { key: 'hard', label: 'Khó', desc: '5 câu' },
];

/** Ngưỡng mặc định khi CHƯA có đề (server gửi số thật kèm đoạn văn). */
const MIN_EN = 15;
const MIN_ZH = 20;
const MIN_VI = 15; // chiều ngược: bản dịch tiếng Việt, đếm theo từ

/**
 * Đếm theo đơn vị ĐÚNG với ngôn ngữ.
 *
 * Tiếng Trung không đặt khoảng trắng giữa các từ, nên đếm theo khoảng trắng thì
 * cả bản dịch ra đúng 1 — người học viết 30 chữ vẫn thấy "1 / 20" và nút Chấm
 * không bao giờ bật. Chỉ đếm chữ Hán, bỏ dấu câu để không nhồi 。，được.
 */
function countUnits(text, lang) {
    if (lang === 'zh') {
        const m = String(text || '').match(/[一-鿿㐀-䶿]/g);
        return m ? m.length : 0;
    }
    return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Kho dạng văn bản để dịch (cùng cách với Đọc hiểu/Viết). Dịch chỉ có một kiểu
 * chấm nên `hop` để trống. Khoá khớp `NHOM_DANG_DICH` ở
 * backend/services/translationGrader.js. "Ngẫu nhiên" giữ đề như trước.
 */
const NHOM_DANG = [
    {
        key: 'doi-thuong', label: 'Đời thường', hop: [],
        dang: [
            { key: 'message', label: 'Tin nhắn' },
            { key: 'personal-email', label: 'Email cá nhân' },
            { key: 'social-post', label: 'Bài đăng MXH' },
            { key: 'review', label: 'Đánh giá' },
            { key: 'diary', label: 'Nhật ký' },
            { key: 'recipe', label: 'Công thức' },
        ],
    },
    {
        key: 'cong-viec', label: 'Công việc', hop: [],
        dang: [
            { key: 'email', label: 'Email công việc' },
            { key: 'notice', label: 'Thông báo' },
            { key: 'advertisement', label: 'Quảng cáo' },
            { key: 'job-ad', label: 'Tin tuyển dụng' },
            { key: 'instructions', label: 'Hướng dẫn sử dụng' },
        ],
    },
    {
        key: 'bao-chi', label: 'Báo chí & truyện', hop: [],
        dang: [
            { key: 'news', label: 'Bản tin' },
            { key: 'story', label: 'Truyện ngắn' },
            { key: 'travel', label: 'Du lịch' },
            { key: 'biography', label: 'Tiểu sử' },
            { key: 'opinion', label: 'Bài bình luận' },
        ],
    },
    {
        key: 'kien-thuc', label: 'Kiến thức', hop: [],
        dang: [
            { key: 'science', label: 'Khoa học' },
            { key: 'history', label: 'Lịch sử' },
            { key: 'health', label: 'Sức khoẻ' },
            { key: 'technology', label: 'Công nghệ' },
            { key: 'culture', label: 'Văn hoá' },
        ],
    },
];

export default function TranslationScreen({ active }) {
    const { showScreen, syncFromState } = useGame();

    const [de, setDe] = useState(null);       // { passage, topic, words, level, lang, minUnits }
    const [banDich, setBanDich] = useState('');
    const [result, setResult] = useState(null);
    const [level, setLevel] = useState('medium');
    const [dang, setDang] = useState('');     // '' = ngẫu nhiên
    const [tuChon, setTuChon] = useState(''); // dạng/chủ đề tự nhập, ưu tiên hơn `dang`
    // Dạng bài AI gợi ý hợp bộ từ của Part — nhóm đầu tiên, và "Ngẫu nhiên" bốc trong đó.
    const goiY = useGoiYDang('translation', active);
    const [loadingDe, setLoadingDe] = useState(false);
    const [grading, setGrading] = useState(false);
    // 'lam' = làm bài · 'loi' = nhật ký lỗi. Đặt chung màn thay vì tách riêng:
    // xem mình hay sai gì rồi làm bài ngay là một mạch, tách ra thì phải nhớ
    // đường quay lại.
    const [tab, setTab] = useState('lam');
    // Chiều dịch đang chọn ở màn giới thiệu; khi đã có đề thì theo chiều của đề.
    const [chieuChon, setChieuChon] = useState(docChieu);
    const [daLuu, setDaLuu] = useState({}); // cụm hiểu sai đã lưu: cụm → 'dang' | 'xong' | lỗi
    const doiChieu = (c) => {
        setChieuChon(c);
        try { localStorage.setItem(KHOA_CHIEU, c); } catch { /* chỉ là nhớ lựa chọn */ }
    };

    // `onBought` của popup nạp năng lượng gọi lại chính `handleGrade` — không
    // đưa được `handleGrade` vào deps của chính nó.
    const gradeRef = useRef(null);

    // Ngôn ngữ và ngưỡng do SERVER quyết, gửi kèm đề. TRƯỚC khi có đề thì đọc
    // tạm từ GameState để màn giới thiệu nói đúng ngôn ngữ ngay từ đầu.
    const langLocal = chuanMa(GameState.state?.settings?.vocabLang);
    const lang = de ? (chuanMa(de.lang)) : langLocal;
    const [nhamYeu, doiNhamYeu] = useNhamYeu();
    const chieu = de ? (de.chieu === 'ngoai-vi' ? 'ngoai-vi' : 'vi-ngoai') : chieuChon;
    const nguoc = chieu === 'ngoai-vi';
    const tenNgonNgu = tenVietGiuaCau(lang);
    const tenNgan = tenNganCua(lang);
    // Chiều ngược bản dịch là tiếng Việt: đếm theo từ.
    const langBanDich = nguoc ? 'vi' : lang;
    const minUnits = Number(de?.minUnits) || (nguoc ? MIN_VI : (lang === 'zh' ? MIN_ZH : MIN_EN));
    const unit = tenDonVi(langBanDich);
    const tieuChi = nguoc ? CRITERIA_NGUOC : CRITERIA;

    const soDonVi = countUnits(banDich, langBanDich);
    const enough = soDonVi >= minUnits;

    const handleDeMoi = useCallback(async () => {
        if (loadingDe) return;
        setLoadingDe(true);
        try {
            // Không gửi từ: server tự chọn từ bộ đang học (đúng mặt chữ, lọc mức, ưu tiên từ sai).
            const d = await TranslationAPI.passage({ level, ...dangGui({ dang, tuChon, goiY }), nhamYeu, chieu });
            if (!d?.passage) throw new Error('Server trả về đoạn văn không hợp lệ');
            setDe(d);
            // Đề mới thì bỏ bài cũ — giữ lại là người dùng nộp nhầm bản dịch của
            // đoạn trước, và AI chấm "đủ ý" rất thấp mà họ không hiểu vì sao.
            setBanDich('');
            setResult(null);
            setDaLuu({});
        } catch (err) {
            Notification.error(String(err?.message || 'Không lấy được đoạn văn'));
        } finally {
            setLoadingDe(false);
        }
    }, [loadingDe, level, dang, tuChon, goiY, nhamYeu, chieu]);

    const handleGrade = useCallback(async () => {
        if (grading || !de) return;
        if (!enough) {
            // Chặn ở client cho nhanh — server vẫn kiểm lại, đây chỉ để đỡ một
            // vòng mạng và nói rõ còn thiếu bao nhiêu.
            Notification.warning(
                `Cần ít nhất ${minUnits} ${unit} — bản dịch của bạn đang có ${soDonVi} ${unit}`);
            return;
        }

        setGrading(true);
        try {
            const d = await TranslationAPI.grade({
                passage: de.passage,
                translation: banDich,
                topic: de.topic || '',
                words: de.words || [],
                level: de.level || 'medium',
                chieu,
            });
            if (!d?.scores) throw new Error('Server trả về kết quả không hợp lệ');
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
            // Thiếu năng lượng → mở popup nạp, mua xong chấm luôn. Chỉ báo lỗi là
            // bắt người dùng tự đi tìm cửa hàng rồi quay lại bấm lại — mà họ vừa
            // ngồi dịch xong cả đoạn.
            if (err?.energyNeeded) {
                Energy.showRefillModal({
                    needed: err.energyNeeded,
                    onBought: () => { gradeRef.current?.(); },
                });
                return;
            }
            Notification.error(String(err?.message || 'Không chấm được bài'));
        } finally {
            setGrading(false);
        }
    }, [grading, de, banDich, enough, soDonVi, minUnits, unit, syncFromState, chieu]);

    /** Lưu một (hoặc mọi) cụm hiểu sai vào Từ vựng riêng, kho "Cụm hiểu sai khi dịch". */
    const luuCum = async (ds) => {
        for (const x of ds) {
            if (daLuu[x.cum] === 'xong' || daLuu[x.cum] === 'dang') continue;
            setDaLuu((m) => ({ ...m, [x.cum]: 'dang' }));
            try {
                await luuVaoTuRieng({
                    en: x.cum, vn: x.nghia, lang, source: `dich-nguoc-${lang}`,
                    part: de?.dangVi || de?.topic || 'Dịch ngược', example: x.cau,
                });
                setDaLuu((m) => ({ ...m, [x.cum]: 'xong' }));
            } catch (e) {
                setDaLuu((m) => ({ ...m, [x.cum]: e.message }));
                Notification.error(e.message);
                return;
            }
        }
    };

    /** Từ Lịch sử: luyện lại / đổi chiều một bài đã làm (đề có sẵn, không gọi AI sinh đề). */
    const luyenLaiTu = useCallback((d) => {
        if (!d?.passage) return;
        setDe(d);
        setBanDich('');
        setResult(null);
        setDaLuu({});
        setTab('lam');
        window.scrollTo?.({ top: 0, behavior: 'smooth' });
    }, []);

    const ngheDoan = () => {
        try { GameLogic.stopSpeaking?.(); GameLogic.speakWord(de.passage, bcp47(lang)); } catch { /* không đọc được thì thôi */ }
    };

    gradeRef.current = handleGrade;

    // Đang làm dở mà rời màn (quay về, menu, Trang chủ…) → hỏi trước, như 16 chế độ luyện tập.
    useHoiKhiThoat('translation-screen', !!de && !result, {
        tieuDe: 'Thoát dịch đoạn văn?',
        noiDung: 'Bản dịch đang làm được lưu nháp — lần sau vào lại có thể dịch tiếp. Thoát bây giờ?',
    });

    // Bài làm dở: đoạn văn đã lưu ở server lúc sinh, phần dịch tự lưu; vào lại thì
    // dịch tiếp thay vì gọi AI sinh đoạn mới.
    // `active` tính cả TAB: quay từ Lịch sử / Nhật ký lỗi về Luyện thì đọc lại bài nháp.
    const baiNhap = useBaiNhap('dich', { active: active && tab !== 'lichsu' && tab !== 'loi', coDe: !!de, xong: !!result, noiDung: banDich, deBai: de?.passage });
    const lamTiep = () => {
        const n = baiNhap.nhap;
        if (!n?.de?.passage) return;
        setDe(n.de);
        setBanDich(n.noiDung || '');
        setResult(null);
        setDaLuu({});
        baiNhap.daDung();
    };

    return (
        <div id="translation-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-language"></i> Dịch đoạn văn</h2>
                {/* Tab cùng hàng với tên chế độ (máy tính); điện thoại tự xuống dòng riêng — xem `.screen-header .tr-tabs`. */}
                <div className="tr-tabs">
                    <button title="Làm bài" aria-label="Làm bài"
                        className={`tr-tab${tab === 'lam' ? ' is-on' : ''}`}
                        onClick={() => setTab('lam')}
                    >
                        <i className="fas fa-pen"></i> Làm bài
                    </button>
                    <button title="Nhật ký lỗi" aria-label="Nhật ký lỗi"
                        className={`tr-tab${tab === 'loi' ? ' is-on' : ''}`}
                        onClick={() => setTab('loi')}
                    >
                        <i className="fas fa-clipboard-list"></i> Nhật ký lỗi
                    </button>
                    <button title="Lịch sử" aria-label="Lịch sử"
                        className={`tr-tab${tab === 'lichsu' ? ' is-on' : ''}`}
                        onClick={() => setTab('lichsu')}
                    >
                        <i className="fas fa-clock-rotate-left"></i> Lịch sử
                    </button>
                </div>
            </div>

            {tab === 'loi' ? <MistakeLog /> : tab === 'lichsu' ? <LichSuMode mode="dich" luyenLai={{ lang: langLocal, chon: luyenLaiTu }} /> : (
            <>
            {!de ? (
                <div className="essay-intro essay-intro--wide">
                    <TheBaiDo nhap={baiNhap.nhap} deBai={baiNhap.nhap?.de?.passage} onLamTiep={lamTiep} onBo={baiNhap.boQua} />
                    {/* Chiều dịch: Việt → ngoại ngữ luyện VIẾT; ngoại ngữ → Việt luyện ĐỌC HIỂU. */}
                    <div className="np-lang tr-chieu" role="group" aria-label="Chiều dịch">
                        <button type="button" className={!nguoc ? 'is-chon' : ''} aria-pressed={!nguoc} onClick={() => doiChieu('vi-ngoai')}>
                            Việt → {tenNgan}
                        </button>
                        <button type="button" className={nguoc ? 'is-chon' : ''} aria-pressed={nguoc} onClick={() => doiChieu('ngoai-vi')}>
                            {tenNgan} → Việt
                        </button>
                    </div>
                    {nguoc ? (
                        <p>
                            Đọc một đoạn <strong>{tenNgonNgu}</strong> rồi dịch sang <strong>tiếng Việt</strong> để kiểm tra
                            bạn hiểu đúng tới đâu. Chấm theo <strong>3 tiêu chí</strong>: <strong>hiểu đúng nghĩa</strong> (quan
                            trọng nhất), đủ ý, và diễn đạt tiếng Việt (chấm nhẹ). Cụm nào hiểu sai được chỉ ra để lưu lại ôn.
                        </p>
                    ) : (
                        <p>
                            Đọc một đoạn <strong>tiếng Việt</strong> rồi viết lại bằng{' '}
                            <strong>{tenNgonNgu}</strong>. Bài được chấm theo{' '}
                            <strong>3 tiêu chí</strong>: đủ ý, ngữ pháp, và mức tự nhiên — kèm một
                            bản dịch tham khảo để bạn đối chiếu.
                        </p>
                    )}
                    <p className="tr-intro-note">
                        <i className="fas fa-circle-info"></i>{' '}
                        {nguoc
                            ? 'Đoạn văn dùng đúng những từ trong bộ bạn đang học: đọc ra được là nhớ được từ.'
                            : 'Đoạn văn bám theo bộ từ bạn đang học, nên dịch xong là ôn lại luôn vốn từ vừa luyện.'}
                    </p>

                    {/* Hai cột như Đọc hiểu và Viết: TRÁI là dạng văn bản cần dịch,
                        PHẢI là kiểu chấm + độ khó. */}
                    <div className="ai-setup">
                        <div className="ai-setup-col">
                            <ChonDangBai
                                nhom={NHOM_DANG}
                                goiY={goiY}
                                dang={dang}
                                onDang={setDang}
                                tuChon={tuChon}
                                onTuChon={setTuChon}
                                placeholder="Hoặc tự nhập: lời bài phát biểu, thư cảm ơn, quy định…"
                            />
                        </div>
                        <div className="ai-setup-col">
                            {/* Kiểu chấm + độ khó: dùng CHUNG component với Hội thoại và Luyện viết.
                                Dịch chỉ có một bộ chấm (đủ ý, ngữ pháp, mức tự nhiên), nên
                                kiểu chấm là một mục đang chọn. Độ khó tính theo số câu. */}
                            <KieuChamDoKho
                                kieuList={nguoc ? KIEU_CHAM_NGUOC : KIEU_CHAM_DICH}
                                kieuDangChon="dich"
                                onKieu={() => {}}
                                doKhoList={MUC_KHO}
                                doKhoDangChon={level}
                                onDoKho={setLevel}
                            />
                        </div>
                    </div>

                    {/* AI cài chỗ luyện đúng lỗi hay mắc (từ hồ sơ Tiến bộ) — chỉ tiếng Anh. */}
                    {lang !== 'zh' && !nguoc && <NutNhamYeu bat={nhamYeu} onDoi={doiNhamYeu} />}

                    {/* Nút bắt đầu nổi cố định giữa đáy khung nhìn (portal vào body). */}
                    <NutBatDau active={active} onClick={handleDeMoi} disabled={loadingDe}>
                        {loadingDe
                            ? <><i className="fas fa-spinner fa-spin"></i> Đang lấy đoạn văn…</>
                            : <><i className="fas fa-file-lines"></i> Lấy đoạn văn</>}
                    </NutBatDau>
                </div>
            ) : (
                <div className="essay-body">
                    <div className="essay-prompt">
                        <div className="essay-prompt-head">
                            <span>
                                {de.luyenLai === 'doi-chieu' ? 'Đổi chiều · ' : de.luyenLai === 'lai' ? 'Luyện lại · ' : ''}
                                {nguoc ? `Dịch sang tiếng Việt · ${tenNgan} → Việt` : 'Đoạn văn cần dịch'}
                                {de.dangVi || de.topic ? ` · ${de.dangVi || de.topic}` : ''}<NhanNham ds={de.nhamLoi} />
                            </span>
                            {nguoc && (
                                <button className="icon-btn" title="Nghe đoạn văn" aria-label="Nghe đoạn văn" onClick={ngheDoan}>
                                    <i className="fas fa-volume-high"></i>
                                </button>
                            )}
                            <button
                                className="icon-btn"
                                title="Đổi đoạn khác"
                                onClick={handleDeMoi}
                                disabled={loadingDe || grading}
                            >
                                <i className={`fas fa-rotate-right${loadingDe ? ' fa-spin' : ''}`}></i>
                            </button>
                        </div>
                        <p>{de.passage}</p>
                    </div>

                    {!result && (
                        <>
                            <textarea
                                className="essay-input"
                                value={banDich}
                                onChange={e => setBanDich(e.target.value)}
                                placeholder={nguoc ? 'Viết bản dịch tiếng Việt của bạn ở đây…' : `Viết bản dịch ${tenNgonNgu} của bạn ở đây…`}
                                disabled={grading}
                                spellCheck={false}
                                aria-label="Bản dịch của bạn"
                            />
                            <div className="essay-actions">
                                <span className={`essay-count${enough ? ' is-ok' : ''}`}>
                                    {soDonVi} / {minUnits} {unit}
                                </span>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleGrade}
                                    disabled={grading || !enough}
                                >
                                    {grading
                                        ? <><i className="fas fa-spinner fa-spin"></i> Đang chấm…</>
                                        : <><i className="fas fa-check-double"></i> Chấm bản dịch</>}
                                </button>
                            </div>
                        </>
                    )}

                    {result && (
                        <div className="essay-result">
                            <div className="essay-band">
                                <div className="essay-band-num">{result.overall}</div>
                                <div className="essay-band-label">Điểm tổng (thang 9)</div>
                            </div>

                            {/* Nói rõ đây là ƯỚC LƯỢNG — để người dùng tin đó là điểm
                                thi thật thì họ vào phòng thi mới vỡ mộng. */}
                            <p className="essay-disclaimer">
                                <i className="fas fa-circle-info"></i>{' '}
                                Điểm do AI ước lượng theo thang 9 của app, dùng để theo dõi
                                tiến bộ.
                            </p>

                            <div className="essay-criteria">
                                {tieuChi.map(c => (
                                    <div key={c.key} className="essay-criterion">
                                        <div className="essay-criterion-head">
                                            <strong>{result.scores[c.key]}</strong>
                                            <span><i className={`fas ${c.icon}`}></i> {c.vi}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {result.summary && (
                                <p className="tr-summary">{result.summary}</p>
                            )}

                            {/* Chữa NGAY TRÊN bản dịch (bút đỏ) thay cho danh sách rời. */}
                            <ChuaBai text={banDich} loi={result.notes} tieuDe={nguoc ? 'Chỗ hiểu chưa đúng' : 'Chữa bản dịch'} baiTiengViet={nguoc} />
                            {/* Nộp lại bản sửa để AI xem lại là việc của lỗi VIẾT: chiều ngược không có. */}
                            {result.id && !nguoc && (
                                <XemLaiBai goc={banDich} loi={result.notes} gui={(t) => TranslationAPI.xemLai(result.id, t)} />
                            )}

                            {/* Chiều ngược: cụm ngoại ngữ đã hiểu sai — lưu vào Từ vựng riêng để ôn. */}
                            {nguoc && result.hieuSai?.length > 0 && (
                                <div className="essay-section tr-hieu-sai">
                                    <h4><i className="fas fa-triangle-exclamation"></i> Cụm bạn hiểu sai</h4>
                                    <ul>
                                        {result.hieuSai.map((x) => (
                                            <li key={x.cum}>
                                                <div>
                                                    <strong>{x.cum}</strong> — {x.nghia}
                                                    {x.cau && <small>{x.cau}</small>}
                                                </div>
                                                <button type="button" className="btn btn-secondary btn-sm"
                                                    disabled={daLuu[x.cum] === 'dang' || daLuu[x.cum] === 'xong'}
                                                    onClick={() => luuCum([x])}>
                                                    <i className={`fas ${daLuu[x.cum] === 'xong' ? 'fa-check' : 'fa-bookmark'}`}></i> {daLuu[x.cum] === 'xong' ? 'Đã lưu' : 'Lưu'}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                    {result.hieuSai.length > 1 && (
                                        <button type="button" className="btn btn-primary btn-sm"
                                            disabled={result.hieuSai.every((x) => daLuu[x.cum] === 'xong')}
                                            onClick={() => luuCum(result.hieuSai)}>
                                            <i className="fas fa-bookmark"></i> Lưu tất cả vào Từ vựng riêng
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Bản dịch tham khảo đặt CUỐI, sau phần lỗi: đọc đáp án
                                trước thì phần nhận xét về bài mình thành ra thừa. Với
                                dịch thuật, thấy một cách diễn đạt khác dạy nhiều hơn
                                đọc lời phê. */}
                            {result.reference && (
                                <div className="essay-section">
                                    <h4><i className="fas fa-wand-magic-sparkles"></i> Bản dịch tham khảo</h4>
                                    <p className="essay-improved">{result.reference}</p>
                                </div>
                            )}

                            <p className="essay-reward">
                                +{result.reward?.xp || 0} XP · +{result.reward?.coins || 0} xu
                            </p>

                            <div className="essay-result-actions">
                                <button className="btn btn-primary" onClick={handleDeMoi}>
                                    <i className="fas fa-rotate-right"></i> Dịch đoạn khác
                                </button>
                                <button className="btn btn-secondary" onClick={() => setResult(null)}>
                                    <i className="fas fa-pen"></i> Xem lại bản dịch
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
            </>
            )}
        </div>
    );
}
