import { useEffect, useRef, useState } from 'react';
import { useGame } from '@game/GameContext.jsx';
import { useAuth } from '@components/auth/AuthContext.jsx';
import { PhatAmAPI } from '@api/phatAm.js';
import { getVocabLang } from '@api/vocabulary.js';
import { bcp47, ngonNguHoc, luaChonMoiNgonNgu, MA_NGON_NGU, nhanDienChuViet, tenVietGiuaCau } from '@lib/ngonNgu.js';
import { BANG_AM } from './bangAm.js';

const KHOA_LANG = 'levelup.phatAm.lang';
const KHOA_GAN_DAY = 'levelup.phatAm.ganDay';
const TOI_DA_GAN_DAY = 8;
const TOI_DA_KY_TU = 160;

/** Gợi ý ô nhập theo ngôn ngữ (chỉ là ví dụ, không phải nội dung theo ngôn ngữ của tính năng). */
const GOI_Y = {
    en: 'VD: thank you, What are you doing?',
    zh: 'VD: 你好, 我不知道',
    ja: 'VD: ありがとう, 勉強しています',
    ko: 'VD: 감사합니다, 한국어를 공부해요',
};

function docLuu(khoa, macDinh) {
    try { return JSON.parse(localStorage.getItem(khoa)) ?? macDinh; } catch { return macDinh; }
}
function ghiLuu(khoa, v) {
    try { localStorage.setItem(khoa, JSON.stringify(v)); } catch { /* không lưu được thì thôi */ }
}

/** Ngôn ngữ mở đầu: lần chọn trước ở màn này, không có thì theo ngôn ngữ đang học. */
function langBanDau() {
    const daChon = docLuu(KHOA_LANG, '');
    return MA_NGON_NGU.includes(daChon) ? daChon : ngonNguHoc(getVocabLang());
}

/**
 * Phát qua /api/tts (giọng Edge của ngôn ngữ, lấy từ sổ) — chạy được cả tiếng Nhật/Hàn và có
 * tốc độ chậm để nghe rõ từng âm.
 */
let dangPhat = null;
function phat(text, lang, rate = 1) {
    if (!text) return;
    try {
        dangPhat?.pause();
        dangPhat = new Audio(`/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(bcp47(lang).toLowerCase())}&rate=${rate}`);
        dangPhat.play().catch(() => {});
    } catch { /* không phát được thì thôi */ }
}

function NutNghe({ text, lang, nhan = 'Nghe' }) {
    return (
        <span className="pa-nghe">
            <button type="button" className="np-loa" aria-label={`${nhan}: ${text}`} onClick={() => phat(text, lang)}>
                <i className="fas fa-volume-high"></i>
            </button>
            <button type="button" className="np-loa pa-cham" aria-label={`${nhan} chậm: ${text}`} title="Nghe chậm" onClick={() => phat(text, lang, 0.6)}>
                <i className="fas fa-person-walking"></i>
            </button>
        </span>
    );
}

/** Kết quả tra: phiên âm chuẩn, đọc kiểu Việt, đọc liền mạch, từng từ, nối âm, mẹo. */
export function KetQuaPhatAm({ kq }) {
    const { lang, text, ketQua: r } = kq;
    const lienMachKhac = r.docLienMach && r.docLienMach !== r.docViet;
    return (
        <section className="pa-ket-qua" aria-label="Kết quả phát âm">
            <div className="pa-cau">
                <strong lang={bcp47(lang)}>{text}</strong>
                <NutNghe text={text} lang={lang} />
            </div>
            <dl className="pa-dong">
                <div><dt>Phiên âm chuẩn</dt><dd className="pa-chuan">{r.chuan}</dd></div>
                <div><dt>Đọc kiểu tiếng Việt</dt><dd className="pa-viet">{r.docViet}</dd></div>
                {lienMachKhac && <div><dt>Khi nói liền (nối âm)</dt><dd className="pa-viet">{r.docLienMach}</dd></div>}
            </dl>

            {r.tu?.length > 1 && (
                <>
                    <h4>Từng từ</h4>
                    <ul className="pa-tu">
                        {r.tu.map((t, i) => (
                            <li key={`${t.tu}${i}`}>
                                <button type="button" className="np-loa" aria-label={`Nghe: ${t.tu}`} onClick={() => phat(t.tu, lang)}>
                                    <i className="fas fa-volume-high"></i>
                                </button>
                                <span>
                                    <b lang={bcp47(lang)}>{t.tu}</b> <code>{t.chuan}</code> → <em>{t.docViet}</em>
                                    {t.luuY && <small>{t.luuY}</small>}
                                </span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {r.tu?.length === 1 && r.tu[0].luuY && <p className="np-luu-y"><i className="fas fa-circle-info"></i> {r.tu[0].luuY}</p>}

            {r.noiAm?.length > 0 && (
                <>
                    <h4><i className="fas fa-link"></i> Nối âm &amp; biến âm</h4>
                    <ul className="pa-noi-am">
                        {r.noiAm.map((n, i) => (
                            <li key={`${n.cum}${i}`}>
                                <div className="pa-noi-am-dau">
                                    <span className="pa-the">{n.hienTuong || 'Nối âm'}</span>
                                    <b lang={bcp47(lang)}>{n.cum}</b>
                                    <button type="button" className="np-loa" aria-label={`Nghe: ${n.cum}`} onClick={() => phat(n.cum, lang)}>
                                        <i className="fas fa-volume-high"></i>
                                    </button>
                                </div>
                                <div className="pa-truoc-sau">
                                    {n.truoc && <><s>{n.truoc}</s> <i className="fas fa-arrow-right"></i> </>}
                                    <em>{n.sau}</em>
                                </div>
                                {n.giaiThich && <small>{n.giaiThich}</small>}
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {r.meo?.length > 0 && (
                <>
                    <h4><i className="fas fa-lightbulb"></i> Mẹo cho người Việt</h4>
                    <ul className="np-dung">{r.meo.map((m) => <li key={m}>{m}</li>)}</ul>
                </>
            )}
            <p className="px-goi-y">Cách đọc kiểu tiếng Việt chỉ giúp đọc gần đúng — hãy bấm nghe giọng chuẩn và nhại theo.</p>
        </section>
    );
}

/**
 * Bảng âm có sẵn (không gọi AI): ký hiệu, ví dụ, đọc gần giống gì trong tiếng Việt. Bấm một ô để
 * nghe ví dụ — máy đọc không phát được phụ âm đứng riêng nên luôn đọc từ / âm tiết ví dụ.
 */
export function BangAm({ lang, moSan }) {
    const bang = BANG_AM[lang];
    if (!bang) return null;
    return (
        <details className="pa-bang" open={moSan}>
            <summary><i className="fas fa-table-cells"></i> {bang.ten} — đọc gần giống gì trong tiếng Việt</summary>
            <p className="px-goi-y">{bang.moTa}</p>
            {bang.nhom.map((nh) => (
                <section key={nh.ten} className="pa-bang-nhom" aria-label={nh.ten}>
                    <h4>{nh.ten}</h4>
                    <div className="pa-bang-luoi">
                        {nh.o.map((o) => (
                            <button
                                key={`${nh.ten}${o.kh}`}
                                type="button"
                                className="pa-o"
                                aria-label={`Nghe ${o.kh}: ${o.vd}`}
                                title={o.luuY || undefined}
                                onClick={() => phat(o.vd, lang)}
                            >
                                <span className="pa-o-kh" lang={bcp47(lang)}>{o.kh}</span>
                                {o.phu && <span className="pa-o-phu">{o.phu}</span>}
                                <span className="pa-o-viet">≈ {o.viet}</span>
                                {o.vd !== o.kh.split(' ')[0] && (
                                    <span className="pa-o-vd"><i className="fas fa-volume-low"></i> <b lang={bcp47(lang)}>{o.vd}</b>{o.vdNghia ? ` ${o.vdNghia}` : ''}</span>
                                )}
                                {o.luuY && <small className="pa-o-luu-y">{o.luuY}</small>}
                            </button>
                        ))}
                    </div>
                </section>
            ))}
            <p className="px-goi-y">Cách đọc kiểu tiếng Việt chỉ là điểm bắt đầu — nhiều âm {tenVietGiuaCau(lang)} không có trong tiếng Việt, hãy bấm nghe và nhại theo.</p>
        </details>
    );
}

/** Màn Tra cứu phát âm: mọi ngôn ngữ trong sổ. */
export default function PhatAmScreen({ active }) {
    const { showScreen } = useGame();
    const { isLoggedIn } = useAuth();
    const [lang, setLang] = useState(langBanDau);
    const [q, setQ] = useState('');
    const [dang, setDang] = useState(false);
    const [loi, setLoi] = useState('');
    const [kq, setKq] = useState(null);
    const [conLuot, setConLuot] = useState(null);
    const [ganDay, setGanDay] = useState(() => docLuu(KHOA_GAN_DAY, []));
    const oNhap = useRef(null);

    useEffect(() => {
        if (!active || !isLoggedIn) return;
        PhatAmAPI.luot().then((d) => setConLuot(d?.conLuot ?? null)).catch(() => {});
        oNhap.current?.focus();
    }, [active, isLoggedIn]);

    const doiLang = (m) => { setLang(m); ghiLuu(KHOA_LANG, m); };

    const traCau = async (text, langTra = lang) => {
        const cau = String(text || '').trim();
        if (!cau || dang) return;
        setDang(true);
        setLoi('');
        try {
            const d = await PhatAmAPI.tra(cau, langTra);
            setKq(d);
            if (d?.conLuot != null) setConLuot(d.conLuot);
            // Chữ viết quyết định ngôn ngữ (gõ kana khi đang chọn Anh → Nhật): ô chọn theo kết quả.
            if (d?.lang && d.lang !== lang) doiLang(d.lang);
            const moi = [{ text: d.text, lang: d.lang }, ...ganDay.filter((g) => !(g.text === d.text && g.lang === d.lang))].slice(0, TOI_DA_GAN_DAY);
            setGanDay(moi);
            ghiLuu(KHOA_GAN_DAY, moi);
        } catch (e) {
            setLoi(e.message || 'Không tra được, hãy thử lại.');
        } finally {
            setDang(false);
        }
    };

    const gui = (e) => { e.preventDefault(); traCau(q); };
    const goiYLang = nhanDienChuViet(q);

    return (
        <div id="phat-am-screen" className={`screen ${active ? 'active' : ''}`}>
            <div className="screen-header">
                <button className="back-btn-screen icon-btn" onClick={() => showScreen('home-screen')}>
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h2><i className="fas fa-ear-listen"></i> Tra cứu phát âm</h2>
            </div>
            <div className="px-wrap">
                {!isLoggedIn && <p className="px-mo-ta">Đăng nhập để tra cứu phát âm.</p>}
                {isLoggedIn && (
                    <>
                        <p className="px-mo-ta">
                            Gõ một từ hoặc câu: xem phiên âm chuẩn, cách đọc kiểu tiếng Việt và chỗ nào nối âm khi nói liền.
                        </p>
                        <div className="np-lang" role="group" aria-label="Ngôn ngữ">
                            {luaChonMoiNgonNgu().map((n) => (
                                <button key={n.ma} type="button" className={lang === n.ma ? 'is-chon' : ''} aria-pressed={lang === n.ma} onClick={() => doiLang(n.ma)}>
                                    {n.co} {n.tenViet}
                                </button>
                            ))}
                        </div>
                        <form className="np-tim pa-tim" onSubmit={gui}>
                            <i className="fas fa-ear-listen"></i>
                            <input
                                ref={oNhap}
                                value={q}
                                maxLength={TOI_DA_KY_TU}
                                autoComplete="off"
                                aria-label="Từ hoặc câu cần tra phát âm"
                                placeholder={GOI_Y[lang] || 'Gõ từ hoặc câu…'}
                                onChange={(e) => setQ(e.target.value)}
                            />
                            <button type="submit" className="btn btn-primary" disabled={!q.trim() || dang}>
                                {dang ? <i className="fas fa-spinner fa-spin"></i> : 'Tra'}
                            </button>
                        </form>
                        {goiYLang && goiYLang !== lang && (
                            <p className="px-goi-y">Chữ bạn gõ là {luaChonMoiNgonNgu().find((n) => n.ma === goiYLang)?.tenViet.toLowerCase()} — sẽ tra theo ngôn ngữ đó.</p>
                        )}
                        {conLuot != null && <p className="px-goi-y">Còn {conLuot} lượt tra bằng AI hôm nay (câu đã có người tra thì không tính lượt).</p>}

                        {ganDay.length > 0 && !kq && (
                            <div className="np-nhom pa-gan-day" aria-label="Tra gần đây">
                                {ganDay.map((g) => (
                                    <button key={`${g.lang}${g.text}`} type="button" onClick={() => { setQ(g.text); traCau(g.text, g.lang); }}>
                                        {g.text}
                                    </button>
                                ))}
                            </div>
                        )}

                        {loi && <p className="px-mo-ta pa-loi" role="alert">{loi}</p>}
                        {kq && <KetQuaPhatAm kq={kq} />}
                        {/* Đóng sẵn khi đang xem kết quả tra; đổi ngôn ngữ thì dựng lại (key) để mở/đóng đúng. */}
                        <BangAm key={`${lang}-${!!kq}`} lang={lang} moSan={!kq} />
                    </>
                )}
            </div>
        </div>
    );
}
