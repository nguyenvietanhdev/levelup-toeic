import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { Notification } from '@ui/Toaster.jsx';
import { BaiNgheAPI } from '@api/baiNghe.js';
import { FavoritesAPI } from '@api/favorites.js';
import { getVocabLang } from '@api/vocabulary.js';
import { dichSangViet } from '@lib/dichNhanh.js';
import { gioPhut, cauTai, tachTu, viTriCuon } from '@lib/baiNghe.js';

const TEN_CAP_DO = { de: 'Dễ', vua: 'Vừa', kho: 'Khó' };
const TOC_DO = [0.75, 1, 1.25];
/** Người học tự cuộn script thì ngừng tự cuộn theo câu trong khoảng này. */
const TU_CUON_NGHI_MS = 4000;

/**
 * Bài nghe có script chạy theo: thư viện bài (VOA Learning English) → nghe với script tô sáng theo
 * câu đang nói. Bấm câu để nghe lại đúng câu đó, ẩn script để nghe trước rồi mới xem, bấm từ để
 * xem nghĩa và lưu vào Yêu thích, dịch cả câu khi cần.
 */
export default function BaiNgheScreen({ active }) {
    const { showScreen } = useGame();
    const { isLoggedIn } = useAuth();
    const lang = getVocabLang() === 'zh' ? 'zh' : 'en';

    const [ds, setDs] = useState(null);
    const [capDo, setCapDo] = useState('');
    const [bai, setBai] = useState(null);
    const [dangMo, setDangMo] = useState('');
    const [hien, setHien] = useState(-1);
    const [tocDo, setTocDo] = useState(1);
    const [anScript, setAnScript] = useState(false);
    const [dich, setDich] = useState({}); // i → bản dịch
    const [tuChon, setTuChon] = useState(null); // { tu, cau, nghia, dang }

    const audio = useRef(null);
    const boCuc = useRef(null);
    const tuCuonLuc = useRef(0); // lúc người học tự cuộn script gần nhất
    const dungTai = useRef(null); // nghe một câu: dừng ở cuối câu đó
    const khung = useRef(null);

    useEffect(() => {
        if (!active || !isLoggedIn || ds) return;
        BaiNgheAPI.danhSach(lang).then(setDs).catch((e) => { setDs([]); Notification.error(e.message); });
    }, [active, isLoggedIn, ds, lang]);

    // Rời màn: dừng tiếng.
    useEffect(() => {
        if (!active) audio.current?.pause();
    }, [active]);

    useEffect(() => {
        if (audio.current) audio.current.playbackRate = tocDo;
    }, [tocDo, bai]);

    // Câu đang nói giữ ở khoảng 1/3 từ trên xuống của KHUNG SCRIPT (khung tự cuộn), không dính
    // mép dưới màn hình. Người học vừa tự cuộn script thì để yên một lúc, không giật ngược lại.
    useEffect(() => {
        const c = khung.current;
        if (hien < 0 || anScript || !c) return;
        if (Date.now() - tuCuonLuc.current < TU_CUON_NGHI_MS) return;
        const el = c.querySelector(`[data-cau="${hien}"]`);
        if (!el) return;
        c.scrollTo?.({ top: Math.max(0, viTriCuon(el.offsetTop, c.clientHeight)), behavior: 'smooth' });
    }, [hien, anScript]);

    // Đo thanh điều hướng và khung phát để khung script vừa khít phần màn hình còn lại, ở mọi
    // cỡ màn (thanh điều hướng điện thoại thấp hơn máy tính). Không có ResizeObserver thì giữ
    // số dự phòng trong CSS.
    useEffect(() => {
        const vo = boCuc.current;
        if (!vo || !bai) return undefined;
        const nav = document.querySelector('.top-nav');
        const may = vo.querySelector('.bn-may');
        const doLai = () => {
            vo.style.setProperty('--bn-nav', `${nav?.offsetHeight || 0}px`);
            vo.style.setProperty('--bn-may', `${may?.offsetHeight || 0}px`);
        };
        doLai();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(doLai);
        if (nav) ro.observe(nav);
        if (may) ro.observe(may);
        return () => ro.disconnect();
    }, [bai, anScript]);

    const moBai = async (id) => {
        if (dangMo) return;
        setDangMo(id);
        try {
            setBai(await BaiNgheAPI.lay(id));
            setHien(-1);
            setDich({});
            setTuChon(null);
            setAnScript(false);
        } catch (e) {
            Notification.error(e.message);
        } finally {
            setDangMo('');
        }
    };

    const veThuVien = () => {
        audio.current?.pause();
        setBai(null);
    };

    const theoDoi = useCallback(() => {
        const a = audio.current;
        if (!a || !bai) return;
        if (dungTai.current !== null && a.currentTime >= dungTai.current) {
            a.pause();
            dungTai.current = null;
        }
        setHien(cauTai(bai.cau, a.currentTime));
    }, [bai]);

    /** Nghe đúng một câu rồi dừng. */
    const ngheCau = (i) => {
        const a = audio.current;
        const c = bai?.cau?.[i];
        if (!a || !c) return;
        a.currentTime = c.batDau;
        dungTai.current = c.ketThuc;
        setHien(i);
        a.play()?.catch?.(() => {});
    };

    const dichCau = async (i) => {
        if (dich[i]) { setDich((d) => ({ ...d, [i]: undefined })); return; }
        try {
            const vi = await dichSangViet(bai.cau[i].text);
            setDich((d) => ({ ...d, [i]: vi || '(không dịch được)' }));
        } catch {
            Notification.error('Không dịch được câu này.');
        }
    };

    const chonTu = async (tu, cau) => {
        setTuChon({ tu, cau, nghia: '', dang: true });
        try {
            const nghia = await dichSangViet(tu);
            setTuChon((x) => (x?.tu === tu ? { ...x, nghia, dang: false } : x));
        } catch {
            setTuChon((x) => (x?.tu === tu ? { ...x, nghia: '', dang: false } : x));
        }
    };

    const luuTu = async () => {
        if (!tuChon?.tu) return;
        const r = await FavoritesAPI.add({ en: tuChon.tu.toLowerCase(), vn: tuChon.nghia || '', example: tuChon.cau });
        if (r?.success) {
            Notification.success(`Đã lưu "${tuChon.tu}" vào Yêu thích.`);
            setTuChon(null);
        } else {
            Notification.error(r?.message || 'Chưa lưu được từ này.');
        }
    };

    const loc = (ds || []).filter((b) => !capDo || b.capDo === capDo);

    return (
        <div id="bai-nghe-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => (bai ? veThuVien() : showScreen('home-screen'))}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-podcast"></i> {bai ? bai.tieuDe : 'Bài nghe có script'}</h2>
            </div>

            {/* Bài có video: khung nội dung rộng hơn để hai cột video và script đều dễ nhìn. */}
            <div className={`px-wrap ${bai?.coHinh ? 'bn-wrap-rong' : ''}`}>
                {!isLoggedIn && <p className="px-mo-ta">Đăng nhập để nghe bài.</p>}

                {isLoggedIn && !bai && (
                    <>
                        <p className="px-mo-ta">Nghe bài thật kèm script chạy theo từng câu. Bấm vào câu để nghe lại, bấm vào từ để xem nghĩa và lưu lại.</p>
                        <div className="np-nhom">
                            <button type="button" className={!capDo ? 'is-chon' : ''} onClick={() => setCapDo('')}>Tất cả</button>
                            {Object.entries(TEN_CAP_DO).map(([k, t]) => (
                                <button key={k} type="button" className={capDo === k ? 'is-chon' : ''} onClick={() => setCapDo(k)}>{t}</button>
                            ))}
                        </div>
                        {!ds && <p className="px-mo-ta"><i className="fas fa-spinner fa-spin"></i> Đang tải…</p>}
                        {ds && !loc.length && <p className="px-mo-ta">Chưa có bài nghe nào{capDo ? ' ở mức này' : ''}.</p>}
                        <div className="bn-ds">
                            {loc.map((b) => (
                                <button key={b.id} type="button" className="bn-the" disabled={!!dangMo} onClick={() => moBai(b.id)}>
                                    <strong>{b.tieuDe}</strong>
                                    <span>
                                        {b.coHinh && <><i className="fas fa-film" aria-label="Có video"></i> </>}
                                        {TEN_CAP_DO[b.capDo]} · {gioPhut(b.thoiLuong)} · {b.soCau} câu
                                        {dangMo === b.id && <> · <i className="fas fa-spinner fa-spin"></i></>}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {isLoggedIn && bai && (
                    <>
                      {/* Máy tính: hai cột, video trái, script phải. Điện thoại: video trên,
                          script dưới trong khung tự cuộn chiếm phần màn hình còn lại. */}
                      <div className={`bn-hoc ${bai.coHinh ? 'co-hinh' : ''}`} ref={boCuc}>
                        <div className={`bn-may ${bai.coHinh ? 'is-video' : ''}`}>
                            {/* Video và audio dùng chung cách điều khiển (HTMLMediaElement), nên
                                script chạy theo, nghe từng câu, tốc độ đều như nhau. */}
                            {bai.coHinh ? (
                                <video
                                    ref={audio}
                                    src={bai.mediaUrl}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    onTimeUpdate={theoDoi}
                                    onSeeking={() => { dungTai.current = null; }}
                                />
                            ) : (
                                <audio
                                    ref={audio}
                                    src={bai.mediaUrl}
                                    controls
                                    preload="metadata"
                                    onTimeUpdate={theoDoi}
                                    onSeeking={() => { dungTai.current = null; }}
                                />
                            )}
                            <div className="bn-dieu-khien">
                                <div className="np-nhom bn-toc-do" role="group" aria-label="Tốc độ">
                                    {TOC_DO.map((t) => (
                                        <button key={t} type="button" className={tocDo === t ? 'is-chon' : ''} onClick={() => setTocDo(t)}>{t}×</button>
                                    ))}
                                </div>
                                <button type="button" className="btn btn-secondary" onClick={() => setAnScript((x) => !x)}>
                                    <i className={`fas ${anScript ? 'fa-eye' : 'fa-eye-slash'}`}></i> {anScript ? 'Hiện script' : 'Ẩn script'}
                                </button>
                            </div>
                            {/* Nghĩa của từ nằm cạnh khung phát: luôn trong tầm mắt, không phải
                                cuộn script xuống cuối mới thấy. */}
                            {tuChon && (
                                <div className="bn-tu-chon" role="dialog" aria-label={`Từ: ${tuChon.tu}`}>
                                    <strong>{tuChon.tu}</strong>
                                    <span>{tuChon.dang ? 'Đang tra…' : (tuChon.nghia || 'Không tra được nghĩa.')}</span>
                                    <div className="px-nut">
                                        <button type="button" className="btn btn-primary" disabled={tuChon.dang} onClick={luuTu}>
                                            <i className="fas fa-star"></i> Lưu vào Yêu thích
                                        </button>
                                        <button type="button" className="btn btn-secondary" onClick={() => setTuChon(null)}>Đóng</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {anScript ? (
                            <p className="px-goi-y bn-script-an">Script đang ẩn: nghe trước một lượt, đoán xem hiểu được bao nhiêu rồi mới bật script lên.</p>
                        ) : (
                            <ol
                                className="bn-script"
                                ref={khung}
                                onWheel={() => { tuCuonLuc.current = Date.now(); }}
                                onTouchMove={() => { tuCuonLuc.current = Date.now(); }}
                            >
                                {bai.cau.map((c, i) => (
                                    <li key={`${i}-${c.batDau}`} data-cau={i} className={i === hien ? 'is-hien' : ''}>
                                        <button type="button" className="bn-moc" aria-label={`Nghe câu ${i + 1}`} onClick={() => ngheCau(i)}>
                                            <i className="fas fa-play"></i> {gioPhut(c.batDau)}
                                        </button>
                                        <div className="bn-cau">
                                            <p>
                                                {lang === 'en'
                                                    ? tachTu(c.text).map((p, k) => (p.tu
                                                        ? <button key={k} type="button" className="bn-tu" onClick={() => chonTu(p.tu, c.text)}>{p.hien}</button>
                                                        : <span key={k}>{p.hien}</span>))
                                                    : c.text}
                                            </p>
                                            {dich[i] && <small className="bn-dich">{dich[i]}</small>}
                                        </div>
                                        <button type="button" className="lt-ke-hoach-link bn-nut-dich" onClick={() => dichCau(i)}>
                                            {dich[i] ? 'Ẩn dịch' : 'Dịch'}
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        )}
                      </div>

                        <p className="px-goi-y bn-nguon">
                            Nguồn: {bai.nguon} (nội dung thuộc phạm vi công cộng).
                            {bai.nguonUrl && <> <a href={bai.nguonUrl} target="_blank" rel="noopener noreferrer">Bài gốc</a></>}
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
