import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { Notification } from '@ui/Toaster.jsx';
import { BaiHatAPI } from '@api/baiHat.js';
import { dichSangViet } from '@lib/dichNhanh.js';
import { luuVaoTuRieng } from '@lib/luuMauCau.js';
import { gioPhut, cauTai, khopTim } from '@lib/baiNghe.js';
import OTimBai from '@components/baiNghe/OTimBai.jsx';
import { mauCoGio, tienDo, chonOTrong, khopTu, tocDoBai, apLech, lechCua, chonDongKhop, datLechTu } from '@lib/baiHat.js';
import { useYoutube } from './useYoutube.js';
import { napPinyin, pinyinTheoChu, pinyinCuaTu } from '@lib/pinyinBaiHat.js';
import { vocabLang } from '@game/gameLogic.js';
import { ngonNguHoc, luaChonNgonNguHoc, layNgonNgu, tenVietGiuaCau, chuanMa } from '@lib/ngonNgu.js';

/** Nhớ lựa chọn bật/tắt pinyin (mặc định bật: người học tiếng Trung cần nhất). */
const KHOA_PINYIN = 'levelup.baiHat.pinyin';
const docHienPinyin = () => { try { return localStorage.getItem(KHOA_PINYIN) !== '0'; } catch { return true; } };

const TOC_DO = [0.75, 1];
const MUC_DO = { de: 'Dễ', vua: 'Vừa', kho: 'Khó' };
const BUOC_LECH = 0.5;
/** Dừng chờ điền khi còn chừng này giây là hết dòng. */
const SAT_CUOI_DONG = 0.15;

const anhBia = (id) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;

/**
 * HỌC QUA BÀI HÁT — dán link YouTube, hệ thống tự tìm lời (LRCLIB), rồi học:
 *   · Xem lời: màu chạy qua từng chữ đang hát (karaoke), bấm chữ để tra và lưu vào Từ vựng riêng.
 *   · Điền từ: lời có ô trống, tới cuối dòng còn ô trống thì nhạc dừng chờ điền.
 *   · Bấm theo nhịp: lời chưa có mốc thời gian thì bấm phím cách mỗi khi một dòng bắt đầu.
 *   · Khớp dòng này (phím K): nghe thấy một dòng bắt đầu mà lời lệch thì bấm, độ lệch được sửa
 *     từ dòng đó trở đi (bài lệch tăng dần vẫn khớp được sau vài lần chạm).
 */
export default function BaiHatScreen({ active }) {
    const { showScreen } = useGame();
    const { isLoggedIn } = useAuth();

    const [view, setView] = useState('ds'); // ds | them | hoc
    const [ds, setDs] = useState(null);
    const [tim, setTim] = useState('');
    // Lọc theo ngôn ngữ: mỗi lần vào trang đặt về ngôn ngữ đang học ('' = tất cả).
    const [locLang, setLocLang] = useState(() => ngonNguHoc(vocabLang()));
    const [bai, setBai] = useState(null);
    const [cheDo, setCheDo] = useState('xem'); // xem | dien | nhip
    const [hien, setHien] = useState(-1);
    const [lech, setLech] = useState(0);
    const [lechTu, setLechTu] = useState([]);
    const [baoKhop, setBaoKhop] = useState('');
    const [tocDo, setTocDo] = useState(1);
    const [dich, setDich] = useState({});
    const [tuChon, setTuChon] = useState(null);
    // Tiếng Trung: hàm pinyin (tải trễ) và bật/tắt hiện pinyin trên chữ.
    const [hamPinyin, setHamPinyin] = useState(null);
    const [hienPinyin, setHienPinyin] = useState(docHienPinyin);
    const doiPinyin = () => setHienPinyin((x) => { try { localStorage.setItem(KHOA_PINYIN, x ? '0' : '1'); } catch { /* chỉ là nhớ lựa chọn */ } return !x; });

    // Điền từ
    const [mucDo, setMucDo] = useState('vua');
    const [daDien, setDaDien] = useState({}); // "dòng-mẩu" → 'dung' | 'lo'
    const [giaTri, setGiaTri] = useState({});
    const [choDong, setChoDong] = useState(-1);

    // Bấm theo nhịp
    const [moc, setMoc] = useState([]);

    const khungYt = useRef(null);
    const khungLoi = useRef(null);
    const yt = useYoutube(khungYt, view === 'hoc' ? bai?.youtubeId : null);
    const lang = chuanMa(bai?.lang);

    // Lời sau khi cộng độ lệch chung và độ lệch từng đoạn: mọi chỗ so thời gian đều dùng bản này.
    const cauHieu = useMemo(() => (bai ? apLech(bai.cau, lech, lechTu) : []), [bai, lech, lechTu]);
    // Tốc độ hát riêng của bài, tính trên mốc gốc (cộng lệch không đổi thời lượng dòng).
    const giayMoiAm = useMemo(() => (bai?.coMoc ? tocDoBai(bai.cau, lang) : 0), [bai, lang]);
    const mau = useMemo(() => (bai?.coMoc ? cauHieu.map((c) => mauCoGio(c, lang, giayMoiAm)) : []), [bai, cauHieu, lang, giayMoiAm]);
    const oTrong = useMemo(() => (bai ? chonOTrong(bai.cau, lang, mucDo, (bai.id || '').length * 31 + bai.cau.length) : []), [bai, lang, mucDo]);
    const conTrong = useCallback((i) => (oTrong[i] || []).some((k) => !daDien[`${i}-${k}`]), [oTrong, daDien]);

    // Bài tiếng Trung: tải thư viện pinyin rồi tính pinyin từng chữ của mọi dòng (trên cả câu để
    // chữ đa âm đọc theo ngữ cảnh). Lỗi tải thì thôi, lời vẫn hiện bình thường.
    useEffect(() => {
        if (lang !== 'zh' || hamPinyin) return undefined;
        let huy = false;
        napPinyin().then((f) => { if (!huy) setHamPinyin(() => f); }).catch(() => {});
        return () => { huy = true; };
    }, [lang, hamPinyin]);
    const pinyin = useMemo(() => (lang === 'zh' && hamPinyin && bai ? bai.cau.map((c) => pinyinTheoChu(hamPinyin, c.text)) : []), [lang, hamPinyin, bai]);

    // Ref cho vòng lặp vẽ: không tạo lại vòng lặp mỗi lần state đổi.
    const r = useRef({});
    r.current = { cauHieu, mau, cheDo, conTrong, choDong, hien, dangPhat: yt.dangPhat };

    useEffect(() => {
        if (!active || !isLoggedIn || ds) return;
        BaiHatAPI.danhSach().then(setDs).catch((e) => { setDs([]); Notification.error(e.message); });
    }, [active, isLoggedIn, ds]);

    useEffect(() => { if (!active) yt.dung(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (active) setLocLang(ngonNguHoc(vocabLang())); }, [active]);
    useEffect(() => { if (yt.san) yt.tocDo(tocDo); }, [tocDo, yt.san]); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Vòng lặp theo khung hình: dòng đang hát, màu chạy qua từng chữ (đặt thẳng biến CSS lên
     * thẻ chữ, không vẽ lại React mỗi khung hình), và dừng chờ điền ở chế độ Điền từ.
     */
    useEffect(() => {
        if (view !== 'hoc' || !yt.san || !bai?.coMoc) return undefined;
        let id;
        const buoc = () => {
            const s = r.current;
            const t = yt.gio();
            const i = cauTai(s.cauHieu, t);
            if (i !== s.hien) setHien(i);
            const dong = i >= 0 ? khungLoi.current?.querySelector(`[data-dong="${i}"]`) : null;
            if (dong && s.mau[i]) {
                dong.querySelectorAll('[data-k]').forEach((el) => {
                    el.style.setProperty('--tien', tienDo(s.mau[i][Number(el.dataset.k)], t).toFixed(3));
                });
            }
            if (s.cheDo === 'dien' && i >= 0 && s.choDong !== i && s.dangPhat) {
                const c = s.cauHieu[i];
                if (t >= c.ketThuc - SAT_CUOI_DONG && s.conTrong(i)) {
                    yt.dung();
                    setChoDong(i);
                }
            }
            id = requestAnimationFrame(buoc);
        };
        id = requestAnimationFrame(buoc);
        return () => cancelAnimationFrame(id);
    }, [view, yt.san, bai]); // eslint-disable-line react-hooks/exhaustive-deps

    // Dòng đang hát giữ ở khoảng 1/3 khung lời. Chữ ngoài dòng đang hát bỏ màu đặt tay để lớp
    // CSS quyết (dòng đã qua tô kín, dòng chưa tới để trống) — tua lùi thì dòng sau hết bị tô sẵn.
    useEffect(() => {
        khungLoi.current?.querySelectorAll('[data-k]').forEach((el) => {
            if (!el.closest(`[data-dong="${hien}"]`)) el.style.removeProperty('--tien');
        });
        const k = khungLoi.current;
        const el = hien >= 0 ? k?.querySelector(`[data-dong="${hien}"]`) : null;
        if (el && k) k.scrollTo?.({ top: Math.max(0, el.offsetTop - k.clientHeight / 3), behavior: 'smooth' });
    }, [hien]);

    // Đang chờ điền: đưa con trỏ vào ô trống đầu tiên của dòng đó.
    useEffect(() => {
        if (choDong < 0) return;
        khungLoi.current?.querySelector(`[data-dong="${choDong}"] input:not([disabled])`)?.focus();
    }, [choDong]);

    // Lưu độ lệch (chung và từng đoạn) sau khi người học ngừng chỉnh.
    useEffect(() => {
        if (!bai) return undefined;
        const doiChung = lech !== (bai.lech || 0);
        const doiDoan = JSON.stringify(lechTu) !== JSON.stringify(bai.lechTu || []);
        if (!doiChung && !doiDoan) return undefined;
        const t = setTimeout(() => {
            BaiHatAPI.capNhat(bai.id, { ...(doiChung ? { lech } : {}), ...(doiDoan ? { lechTu } : {}) })
                .then((x) => setBai((b) => (b ? { ...b, lech: x.bai.lech, lechTu: x.bai.lechTu || [] } : b)))
                .catch(() => {});
        }, 800);
        return () => clearTimeout(t);
    }, [lech, lechTu, bai]);

    /** Nghe thấy một dòng bắt đầu mà lời lệch: sửa độ lệch từ dòng đó trở đi. */
    const khopLai = useCallback(() => {
        if (!bai?.coMoc || !yt.san) return;
        const t = yt.gio();
        const j = chonDongKhop(cauHieu, t, hien);
        if (j < 0) return;
        setLechTu((ds) => datLechTu(ds, j, t - bai.cau[j].batDau));
        setBaoKhop(`Đã khớp từ dòng ${j + 1} trở đi.`);
    }, [bai, yt, cauHieu, hien]);

    /** Lời sớm/muộn hơn: chỉnh đoạn đang nghe (mốc khớp gần nhất phía trước, không có thì cả bài). */
    const dieuChinh = (delta) => {
        const i = Math.max(0, hien);
        const moc = [...lechTu].reverse().find((m) => m.dong <= i);
        const kep = (v) => Math.max(-120, Math.min(120, Math.round(v * 100) / 100));
        if (moc) setLechTu((ds) => datLechTu(ds, moc.dong, kep(moc.lech + delta)));
        else setLech((x) => kep(x + delta));
    };
    const lechHienTai = lechCua(Math.max(0, hien), lech, lechTu);

    // Phím K = khớp dòng này (không cướp phím khi đang gõ).
    useEffect(() => {
        if (!active || view !== 'hoc' || cheDo === 'nhip' || !bai?.coMoc) return undefined;
        const phim = (e) => {
            if (e.key?.toLowerCase() !== 'k' || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
            e.preventDefault();
            khopLai();
        };
        window.addEventListener('keydown', phim);
        return () => window.removeEventListener('keydown', phim);
    }, [active, view, cheDo, bai, khopLai]);

    useEffect(() => {
        if (!baoKhop) return undefined;
        const t = setTimeout(() => setBaoKhop(''), 2500);
        return () => clearTimeout(t);
    }, [baoKhop]);

    const moBai = async (id) => {
        try {
            const b = await BaiHatAPI.lay(id);
            batDauHoc(b);
        } catch (e) {
            Notification.error(e.message);
        }
    };

    const batDauHoc = (b) => {
        setBai(b);
        if (locLang && b.lang && b.lang !== locLang) setLocLang(b.lang); // bài vừa thêm khác ngôn ngữ đang lọc: quay về vẫn thấy nó
        setLech(b.lech || 0);
        setLechTu(b.lechTu || []);
        setBaoKhop('');
        setCheDo(b.coMoc ? 'xem' : 'nhip');
        setHien(-1);
        setDich({});
        setTuChon(null);
        setDaDien({});
        setGiaTri({});
        setChoDong(-1);
        setMoc([]);
        setView('hoc');
    };

    const veDanhSach = () => {
        yt.dung();
        setView('ds');
        setBai(null);
        setDs(null);
    };

    const xoaBai = async (b) => {
        if (!window.confirm(`Xoá bài "${b.tieuDe}"?`)) return;
        try {
            await BaiHatAPI.xoa(b.id);
            setDs((d) => d.filter((x) => x.id !== b.id));
        } catch (e) {
            Notification.error(e.message);
        }
    };

    const ngheDong = (i) => {
        const c = cauHieu[i];
        if (!c || c.batDau == null) return;
        setChoDong(-1);
        yt.tua(c.batDau - 0.2);
        yt.phat();
    };

    const dichDong = async (i) => {
        if (dich[i]) { setDich((d) => ({ ...d, [i]: undefined })); return; }
        try {
            const vi = await dichSangViet(bai.cau[i].text);
            setDich((d) => ({ ...d, [i]: vi || '(không dịch được)' }));
        } catch {
            Notification.error('Không dịch được dòng này.');
        }
    };

    const chonTu = async (tu, dong) => {
        if (!tu) return;
        setTuChon({ tu, dong, nghia: '', dang: true, luu: '', py: lang === 'zh' && hamPinyin ? pinyinCuaTu(hamPinyin, tu) : '' });
        try {
            const nghia = await dichSangViet(tu);
            setTuChon((x) => (x?.tu === tu ? { ...x, nghia, dang: false } : x));
        } catch {
            setTuChon((x) => (x?.tu === tu ? { ...x, dang: false } : x));
        }
    };

    const luuTu = async () => {
        if (!tuChon || tuChon.luu === 'dang') return;
        setTuChon((x) => ({ ...x, luu: 'dang' }));
        try {
            await luuVaoTuRieng({
                en: lang === 'en' ? tuChon.tu.toLowerCase() : tuChon.tu,
                vn: tuChon.nghia,
                lang,
                source: `bai-hat-${lang}`, // kho bài hát theo ngôn ngữ: bai-hat-en, bai-hat-zh, bai-hat-ja…
                part: bai.tieuDe,
                example: tuChon.dong,
                phonetic: tuChon.py || '',
            });
            setTuChon((x) => ({ ...x, luu: 'xong' }));
        } catch (e) {
            setTuChon((x) => ({ ...x, luu: e.message }));
        }
    };

    // ---------- Điền từ ----------
    const kiemO = (i, k, dapAn) => {
        const khoa = `${i}-${k}`;
        if (!khopTu(giaTri[khoa], dapAn)) return false;
        const moi = { ...daDien, [khoa]: 'dung' };
        setDaDien(moi);
        // Điền xong cả dòng đang chờ thì hát tiếp.
        if (choDong === i && !(oTrong[i] || []).some((x) => !moi[`${i}-${x}`])) {
            setChoDong(-1);
            yt.phat();
        }
        return true;
    };

    const boQuaDong = (i) => {
        const moi = { ...daDien };
        (oTrong[i] || []).forEach((k) => { if (!moi[`${i}-${k}`]) moi[`${i}-${k}`] = 'lo'; });
        setDaDien(moi);
        if (choDong === i) { setChoDong(-1); yt.phat(); }
    };

    const theoLang = (ds || []).filter((b) => !locLang || (b.lang || 'en') === locLang);
    const locDs = theoLang.filter((b) => khopTim(tim, b.tieuDe, b.ngheSi));
    const tongO = oTrong.reduce((n, d) => n + d.length, 0);
    const soDung = Object.values(daDien).filter((v) => v === 'dung').length;

    // ---------- Bấm theo nhịp ----------
    const batDauNhip = () => {
        setMoc([]);
        yt.tua(0);
        yt.phat();
    };
    const bamNhip = useCallback(() => {
        setMoc((m) => (bai && m.length < bai.cau.length ? [...m, Math.round(yt.gio() * 100) / 100] : m));
    }, [bai, yt]);
    const lui = () => {
        setMoc((m) => {
            const con = m.slice(0, -1);
            yt.tua(Math.max(0, (con[con.length - 1] ?? 0) - 0.5));
            return con;
        });
    };
    const luuNhip = async () => {
        try {
            const x = await BaiHatAPI.capNhat(bai.id, { moc });
            batDauHoc(x.bai);
            Notification.success('Đã lưu nhịp. Lời sẽ chạy theo nhạc.');
        } catch (e) {
            Notification.error(e.message);
        }
    };

    // Phím cách = bấm nhịp (không cướp phím khi đang gõ chữ).
    useEffect(() => {
        if (!active || view !== 'hoc' || cheDo !== 'nhip') return undefined;
        const phim = (e) => {
            if (e.code !== 'Space' || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target?.tagName || '')) return;
            e.preventDefault();
            bamNhip();
        };
        window.addEventListener('keydown', phim);
        return () => window.removeEventListener('keydown', phim);
    }, [active, view, cheDo, bamNhip]);

    // ---------- Vẽ một dòng lời ----------
    const veDong = (c, i) => {
        const dsMau = mau[i] || mauCoGio(c, lang);
        const trong = new Set(cheDo === 'dien' ? oTrong[i] || [] : []);
        // Pinyin của mẩu k: mẩu tiếng Trung là đúng một ký tự, cùng vị trí trong `[...text]`.
        const py = (k) => (hienPinyin && pinyin[i] ? pinyin[i][k] || '' : '');
        return dsMau.map((m, k) => {
            if (!m.tu) return <span key={k}>{m.hien}</span>;
            const khoa = `${i}-${k}`;
            const zh = !!m.tuTra;
            if (zh && trong.has(k) && !daDien[khoa]) {
                // Ô trống chữ Hán: pinyin phía trên làm gợi ý (nghe + pinyin → gõ đúng chữ).
                return (
                    <ruby key={k} className="bh-ruby">
                        <input
                            className="bh-o bh-o-zh"
                            aria-label={`Ô trống dòng ${i + 1}`}
                            value={giaTri[khoa] || ''}
                            size={2}
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(e) => setGiaTri((g) => ({ ...g, [khoa]: e.target.value }))}
                            onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                if (!kiemO(i, k, m.tu)) e.currentTarget.classList.add('is-sai');
                            }}
                        />
                        <rt>{py(k)}</rt>
                    </ruby>
                );
            }
            if (zh) {
                // Màu karaoke trên CHỮ (span mang data-k), pinyin phía trên; bấm là tra cả TỪ chứa chữ đó.
                const lopZh = `bh-chu${daDien[khoa] === 'dung' ? ' is-dung' : daDien[khoa] === 'lo' ? ' is-lo' : ''}`;
                return (
                    <button key={k} type="button" className="bh-chu-zh" aria-label={m.tuTra} onClick={() => chonTu(m.tuTra, c.text)}>
                        <ruby className="bh-ruby"><span data-k={k} className={lopZh}>{m.hien}</span><rt>{py(k)}</rt></ruby>
                    </button>
                );
            }
            if (trong.has(k) && !daDien[khoa]) {
                const duoi = m.hien.slice(m.hien.indexOf(m.tu) + m.tu.length);
                return (
                    <span key={k}>
                        <input
                            className="bh-o"
                            aria-label={`Ô trống dòng ${i + 1}`}
                            value={giaTri[khoa] || ''}
                            size={Math.max(2, m.tu.length)}
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(e) => setGiaTri((g) => ({ ...g, [khoa]: e.target.value }))}
                            onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                if (!kiemO(i, k, m.tu)) e.currentTarget.classList.add('is-sai');
                            }}
                        />
                        {duoi}
                    </span>
                );
            }
            const lop = `bh-chu${daDien[khoa] === 'dung' ? ' is-dung' : daDien[khoa] === 'lo' ? ' is-lo' : ''}`;
            return (
                <button key={k} type="button" data-k={k} className={lop} onClick={() => chonTu(m.tu, c.text)}>{m.hien}</button>
            );
        });
    };

    const daNhipXong = bai && moc.length === bai.cau.length;

    return (
        <div id="bai-hat-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => (view === 'ds' ? showScreen('home-screen') : veDanhSach())}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-music"></i> {view === 'hoc' && bai ? bai.tieuDe : 'Học qua bài hát'}</h2>
                {isLoggedIn && view === 'ds' && <OTimBai value={tim} onChange={setTim} placeholder="Tìm bài hát, ca sĩ…" />}
            </div>

            <div className={`px-wrap ${view === 'hoc' ? 'bn-wrap-rong' : ''} ${view === 'ds' ? 'bn-wrap-ds' : ''}`}>
                {!isLoggedIn && <p className="px-mo-ta">Đăng nhập để dùng.</p>}

                {isLoggedIn && view === 'ds' && (
                    <>
                        <p className="px-mo-ta">Thêm bài hát bạn thích bằng link YouTube. Hệ thống tự tìm lời, rồi bạn xem lời chạy theo nhạc, điền từ còn thiếu, bấm vào từ để tra và lưu lại.</p>
                        <div className="px-nut">
                            <button type="button" className="btn btn-primary" onClick={() => setView('them')}><i className="fas fa-plus"></i> Thêm bài hát</button>
                            <select className="bh-loc-lang" aria-label="Ngôn ngữ bài hát" value={locLang} onChange={(e) => setLocLang(e.target.value)}>
                                {luaChonNgonNguHoc().map((n) => <option key={n.ma} value={n.ma}>{n.co} {n.tenViet}</option>)}
                                <option value="">Tất cả ngôn ngữ</option>
                            </select>
                        </div>
                        {!ds && <p className="px-mo-ta"><i className="fas fa-spinner fa-spin"></i> Đang tải…</p>}
                        {ds && !ds.length && <p className="px-mo-ta">Chưa có bài nào.</p>}
                        {ds?.length > 0 && !theoLang.length && <p className="px-mo-ta">Chưa có bài hát {tenVietGiuaCau(locLang)} nào.</p>}
                        {theoLang.length > 0 && !locDs.length && <p className="px-mo-ta">Không có bài nào khớp "{tim.trim()}".</p>}
                        <div className="bn-ds">
                            {locDs.map((b) => (
                                <div key={b.id} className="bh-the-vo">
                                    <button type="button" className="bn-the" onClick={() => moBai(b.id)}>
                                        <span className="bn-anh">
                                            <img src={anhBia(b.youtubeId)} alt="" loading="lazy" />
                                            <span className="bn-phat"><i className="fas fa-play"></i></span>
                                            {b.thoiLuong > 0 && <span className="bn-thoi-luong">{gioPhut(b.thoiLuong)}</span>}
                                        </span>
                                        <strong>{b.tieuDe}</strong>
                                        <span className="bn-the-phu">{!locLang && layNgonNgu(b.lang).co ? `${layNgonNgu(b.lang).co} ` : ''}{b.ngheSi || '—'} · {b.soDong} dòng{b.coMoc ? '' : ' · chưa có nhịp'}</span>
                                    </button>
                                    <button type="button" className="lt-ke-hoach-link bh-xoa" aria-label={`Xoá ${b.tieuDe}`} onClick={() => xoaBai(b)}>
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {isLoggedIn && view === 'them' && <ThemBai onXong={(b) => batDauHoc(b)} onHuy={() => setView('ds')} />}

                {isLoggedIn && view === 'hoc' && bai && (
                    <>
                        <div className="np-nhom" role="tablist" aria-label="Chế độ">
                            <button type="button" className={cheDo === 'xem' ? 'is-chon' : ''} disabled={!bai.coMoc} onClick={() => setCheDo('xem')}>Xem lời</button>
                            <button type="button" className={cheDo === 'dien' ? 'is-chon' : ''} disabled={!bai.coMoc} onClick={() => { setCheDo('dien'); setChoDong(-1); }}>Điền từ</button>
                            <button type="button" className={cheDo === 'nhip' ? 'is-chon' : ''} onClick={() => { setCheDo('nhip'); setMoc([]); }}>
                                {bai.coMoc ? 'Bấm lại nhịp' : 'Bấm theo nhịp'}
                            </button>
                        </div>

                        <div className="bn-hoc co-hinh bh-hoc">
                            <div className="bn-may is-video">
                                <div className="bh-video" ref={khungYt} />
                                {yt.loi && <p className="px-goi-y" role="alert">{yt.loi}</p>}
                                <div className="bn-dieu-khien">
                                    <div className="np-nhom bn-toc-do" role="group" aria-label="Tốc độ">
                                        {TOC_DO.map((t) => (
                                            <button key={t} type="button" className={tocDo === t ? 'is-chon' : ''} onClick={() => setTocDo(t)}>{t}×</button>
                                        ))}
                                    </div>
                                    {lang === 'zh' && (
                                        <button type="button" className={`btn btn-sm ${hienPinyin ? 'btn-primary' : 'btn-secondary'}`}
                                            aria-pressed={hienPinyin} onClick={doiPinyin} title="Hiện / ẩn pinyin trên chữ Hán">
                                            拼 Pinyin
                                        </button>
                                    )}
                                    {cheDo !== 'nhip' && (
                                        <div className="bh-lech" role="group" aria-label="Chỉnh lời khớp nhạc">
                                            <button type="button" className="btn btn-primary btn-sm" disabled={!yt.san} onClick={khopLai}
                                                title="Bấm đúng lúc nghe thấy một dòng bắt đầu: lời khớp lại từ dòng đó trở đi">
                                                <i className="fas fa-crosshairs"></i> Khớp dòng này (K)
                                            </button>
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => dieuChinh(-BUOC_LECH)} title="Lời đang chậm hơn nhạc">Lời sớm hơn</button>
                                            <span>{lechHienTai > 0 ? '+' : ''}{lechHienTai.toFixed(1)}s</span>
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => dieuChinh(BUOC_LECH)} title="Lời đang nhanh hơn nhạc">Lời muộn hơn</button>
                                            {lechTu.length > 0 && (
                                                <button type="button" className="lt-ke-hoach-link" onClick={() => { setLechTu([]); setBaoKhop('Đã bỏ các chỗ khớp.'); }}>
                                                    Bỏ {lechTu.length} chỗ khớp
                                                </button>
                                            )}
                                            {baoKhop && <span className="px-goi-y" role="status">{baoKhop}</span>}
                                        </div>
                                    )}
                                </div>

                                {cheDo === 'dien' && (
                                    <div className="bh-dien-dau">
                                        <div className="np-nhom" role="group" aria-label="Mức độ">
                                            {Object.entries(MUC_DO).map(([k, t]) => (
                                                <button key={k} type="button" className={mucDo === k ? 'is-chon' : ''} onClick={() => { setMucDo(k); setDaDien({}); setGiaTri({}); setChoDong(-1); }}>{t}</button>
                                            ))}
                                        </div>
                                        <span className="px-goi-y">Đúng {soDung}/{tongO} ô</span>
                                        {choDong >= 0 && (
                                            <div className="px-nut">
                                                <span className="px-goi-y" role="status">Điền ô trống rồi nhấn Enter để hát tiếp.</span>
                                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => ngheDong(choDong)}><i className="fas fa-rotate-left"></i> Nghe lại dòng</button>
                                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => boQuaDong(choDong)}>Bỏ qua</button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {cheDo === 'nhip' && (
                                    <div className="bh-nhip">
                                        <p className="px-goi-y">Bấm <b>Bắt đầu</b>, rồi mỗi khi một dòng lời bắt đầu được hát thì bấm <b>Dòng tiếp</b> (hoặc phím cách). Bấm sai thì <b>Lùi</b>.</p>
                                        <div className="px-nut">
                                            <button type="button" className="btn btn-secondary" disabled={!yt.san} onClick={batDauNhip}><i className="fas fa-play"></i> Bắt đầu</button>
                                            <button type="button" className="btn btn-primary" disabled={!yt.san || daNhipXong} onClick={bamNhip}>Dòng tiếp ({moc.length}/{bai.cau.length})</button>
                                            <button type="button" className="btn btn-secondary" disabled={!moc.length} onClick={lui}>Lùi</button>
                                            {daNhipXong && <button type="button" className="btn btn-primary" onClick={luuNhip}><i className="fas fa-floppy-disk"></i> Lưu nhịp</button>}
                                        </div>
                                    </div>
                                )}

                                {tuChon && (
                                    <div className="bn-tu-chon" role="dialog" aria-label={`Từ: ${tuChon.tu}`}>
                                        <strong>{tuChon.tu}</strong>
                                        {tuChon.py && <span className="bh-tu-py">{tuChon.py}</span>}
                                        <span>{tuChon.dang ? 'Đang tra…' : (tuChon.nghia || 'Không tra được nghĩa.')}</span>
                                        <div className="px-nut">
                                            <button type="button" className="btn btn-primary" disabled={tuChon.dang || tuChon.luu === 'dang' || tuChon.luu === 'xong'} onClick={luuTu}>
                                                <i className={`fas ${tuChon.luu === 'xong' ? 'fa-check' : 'fa-bookmark'}`}></i> {tuChon.luu === 'xong' ? 'Đã lưu' : 'Lưu vào Từ vựng riêng'}
                                            </button>
                                            <button type="button" className="btn btn-secondary" onClick={() => setTuChon(null)}>Đóng</button>
                                        </div>
                                        {tuChon.luu && !['dang', 'xong'].includes(tuChon.luu) && <span className="px-goi-y" role="alert">{tuChon.luu}</span>}
                                    </div>
                                )}
                            </div>

                            <ol className="bn-script bh-loi" ref={khungLoi}>
                                {bai.cau.map((c, i) => {
                                    const lop = cheDo === 'nhip'
                                        ? (i === moc.length ? 'is-hien' : i < moc.length ? 'is-qua' : '')
                                        : (i === hien ? 'is-hien' : i < hien ? 'is-qua' : '');
                                    return (
                                        <li key={`${i}-${c.batDau}`} data-dong={i} className={`${lop}${choDong === i ? ' is-cho' : ''}`}>
                                            <button type="button" className="bn-moc" aria-label={`Nghe dòng ${i + 1}`} disabled={!bai.coMoc || cheDo === 'nhip'} onClick={() => ngheDong(i)}>
                                                <i className="fas fa-play"></i> {cheDo === 'nhip' ? (moc[i] != null ? gioPhut(moc[i]) : '—') : (cauHieu[i]?.batDau != null ? gioPhut(cauHieu[i].batDau) : '—')}
                                            </button>
                                            <div className="bn-cau">
                                                <p>{veDong(c, i)}</p>
                                                {dich[i] && <small className="bn-dich">{dich[i]}</small>}
                                            </div>
                                            {cheDo !== 'nhip' && (
                                                <button type="button" className="lt-ke-hoach-link bn-nut-dich" onClick={() => dichDong(i)}>{dich[i] ? 'Ẩn dịch' : 'Dịch'}</button>
                                            )}
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>
                        <p className="px-goi-y bn-nguon">
                            {bai.nguonLoi === 'lrclib' ? 'Lời: LRCLIB (kho lời cộng đồng).' : 'Lời do bạn dán.'} Chỉ dùng để tự học.
                            {bai.coMoc && !bai.cau.some((c) => c.tu) && ' Màu chạy từng chữ là ước lượng theo âm tiết và tốc độ hát của bài; lệch thì bấm Khớp dòng này (phím K) đúng lúc một dòng bắt đầu.'}
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}

/** Thêm bài: link YouTube → tìm lời trên LRCLIB và chọn bản đúng, hoặc tự dán lời. */
function ThemBai({ onXong, onHuy }) {
    const [youtube, setYoutube] = useState('');
    const [tenBai, setTenBai] = useState('');
    const [ngheSi, setNgheSi] = useState('');
    const [ketQua, setKetQua] = useState(null);
    const [dang, setDang] = useState('');
    const [tuDan, setTuDan] = useState(false);
    const [loiDan, setLoiDan] = useState('');
    const [bao, setBao] = useState('');

    const tim = async (e) => {
        e?.preventDefault();
        if (!tenBai.trim() || dang) return;
        setDang('tim');
        setBao('');
        try {
            const r = await BaiHatAPI.timLoi(tenBai.trim(), ngheSi.trim());
            setKetQua(r.ketQua);
            if (!r.ketQua.length) setBao('Không tìm thấy lời. Thử bỏ tên ca sĩ, viết lại tên bài, hoặc tự dán lời.');
        } catch (er) {
            setBao(er.message);
        } finally {
            setDang('');
        }
    };

    const them = async (body) => {
        if (!youtube.trim()) { setBao('Dán link YouTube của bài trước đã.'); return; }
        setDang('them');
        setBao('');
        try {
            const r = await BaiHatAPI.them({ youtube: youtube.trim(), ...body });
            onXong(r.bai);
        } catch (er) {
            setBao(er.message);
        } finally {
            setDang('');
        }
    };

    return (
        <section className="bh-them" aria-label="Thêm bài hát">
            <label>Link YouTube
                <input className="bh-input" value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
            </label>
            <form className="bh-tim" onSubmit={tim}>
                <label>Tên bài <input className="bh-input" value={tenBai} onChange={(e) => setTenBai(e.target.value)} placeholder="Let It Be" /></label>
                <label>Ca sĩ (không bắt buộc) <input className="bh-input" value={ngheSi} onChange={(e) => setNgheSi(e.target.value)} placeholder="The Beatles" /></label>
                <button type="submit" className="btn btn-primary" disabled={!tenBai.trim() || !!dang}>
                    <i className={`fas ${dang === 'tim' ? 'fa-spinner fa-spin' : 'fa-magnifying-glass'}`}></i> Tìm lời
                </button>
            </form>
            {bao && <p className="px-goi-y" role="alert">{bao}</p>}

            {ketQua?.length > 0 && (
                <ul className="bh-ket-qua">
                    {ketQua.map((x) => (
                        <li key={x.id}>
                            <span>
                                <strong>{x.tenBai}</strong> — {x.ngheSi}
                                <small>{x.album ? `${x.album} · ` : ''}{gioPhut(x.thoiLuong)} · {x.coMoc ? 'Có nhịp sẵn' : 'Chỉ có lời (sẽ bấm theo nhịp)'}</small>
                            </span>
                            <button type="button" className="btn btn-secondary btn-sm" disabled={!!dang} onClick={() => them({ lrclibId: x.id })}>Chọn</button>
                        </li>
                    ))}
                </ul>
            )}
            <p className="px-goi-y">Chọn bản có thời lượng gần với video nhất để lời khớp nhạc. Lệch một chút thì chỉnh được khi học.</p>

            <button type="button" className="lt-ke-hoach-link" onClick={() => setTuDan((x) => !x)}>
                {tuDan ? 'Ẩn phần tự dán lời' : 'Không tìm thấy? Tự dán lời'}
            </button>
            {tuDan && (
                <div className="bh-tu-dan">
                    <textarea className="bh-input" rows={8} value={loiDan} onChange={(e) => setLoiDan(e.target.value)} placeholder="Mỗi dòng lời một dòng…" />
                    <button type="button" className="btn btn-primary" disabled={!loiDan.trim() || !tenBai.trim() || !!dang} onClick={() => them({ tieuDe: tenBai.trim(), ngheSi: ngheSi.trim(), loiDan })}>
                        Thêm với lời đã dán
                    </button>
                </div>
            )}
            <div className="px-nut">
                <button type="button" className="btn btn-secondary" onClick={onHuy}>Huỷ</button>
            </div>
        </section>
    );
}
