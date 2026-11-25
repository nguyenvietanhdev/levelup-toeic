/**
 * HỌC QUA BÀI HÁT — người học dán link YouTube, hệ thống tự tìm lời (có mốc thời gian từng dòng)
 * trên LRCLIB, rồi học: xem lời chạy theo nhạc, điền từ còn thiếu, bấm từ để tra và lưu.
 *
 * Giới hạn có chủ đích:
 *   · Chỉ mở cho các email trong `BAI_HAT_EMAILS` (dự án dùng riêng; app đang mở công khai nên
 *     phải khoá, không để người lạ dùng lời bài hát có bản quyền).
 *   · Mỗi bài là của riêng một người, không có kho dùng chung.
 *   · Nhạc phát bằng trình phát YouTube nhúng; server không tải âm thanh về.
 */
const BaiHat = require('../models/BaiHat');
const logger = require('../utils/logger');

const { nhanDienChuViet, NGON_NGU_HOAT_DONG, layNgonNgu } = require('../config/ngonNgu');
const LRCLIB = 'https://lrclib.net/api';
const TOI_DA_BAI = 100;
const TOI_DA_DONG = 300;
const TOI_DA_KQ_TIM = 10;
const RE_HAN = /[一-鿿]/;
const RE_YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Danh sách email trong biến môi trường BAI_HAT_EMAILS (thuần). */
const emailTuBien = (env = process.env.BAI_HAT_EMAILS) => String(env || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

/** Email có trong biến môi trường không (thuần). Không đặt biến thì không ai qua đường này. */
function duocDung(email, env = process.env.BAI_HAT_EMAILS) {
    return !!email && emailTuBien(env).includes(String(email).trim().toLowerCase());
}

/**
 * Tài khoản có được dùng không: admin bật cờ `duocDungBaiHat` trên tài khoản (tab "Mở khoá theo
 * Level", có hiệu lực ngay), hoặc email nằm trong BAI_HAT_EMAILS (dự phòng, phải triển khai lại).
 */
const coQuyen = (user, env = process.env.BAI_HAT_EMAILS) => user?.duocDungBaiHat === true || duocDung(user?.email, env);

/** Id video từ mọi dạng link YouTube hay gặp, hoặc chính id (thuần). Không nhận ra thì ''. */
function tachYoutubeId(link) {
    const s = String(link || '').trim();
    if (RE_YT_ID.test(s)) return s;
    let u;
    try { u = new URL(s); } catch { return ''; }
    const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/) || [])[1] || '';
    }
    return RE_YT_ID.test(id) ? id : '';
}

const gon = (s, n = 300) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Đọc lời dạng LRC thành từng dòng có mốc (thuần). Một dòng có thể mang nhiều mốc (điệp khúc
 * lặp lại); dòng rỗng là đoạn nhạc không lời, chỉ dùng để đặt điểm kết thúc của dòng trước.
 */
const giayCua = (phut, giay) => Math.round((Number(phut) * 60 + Number(String(giay).replace(':', '.'))) * 100) / 100;

/**
 * Mốc từng chữ trong một dòng LRC mở rộng: `<00:12.10>Let <00:12.60>it <00:13.00>be` (thuần).
 * Không có thẻ chữ thì undefined.
 */
function docMocChu(phan) {
    if (!/<\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?>/.test(phan)) return undefined;
    const tu = [];
    for (const m of phan.matchAll(/<(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)>([^<]*)/g)) {
        if (m[3]) tu.push({ batDau: giayCua(m[1], m[2]), text: m[3] });
    }
    return tu.length ? tu : undefined;
}

function docLrc(lrc, thoiLuong = 0) {
    const moc = [];
    for (const dong of String(lrc || '').split(/\r?\n/)) {
        const cacMoc = [...dong.matchAll(/\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
        if (!cacMoc.length) continue;
        const phan = dong.replace(/\[[^\]]*\]/g, '');
        const tuGoc = docMocChu(phan);
        const text = gon(phan.replace(/<[^>]*>/g, ''));
        cacMoc.forEach((m, k) => {
            const batDau = giayCua(m[1], m[2]);
            if (!Number.isFinite(batDau)) return;
            // Dòng lặp lại (điệp khúc nhiều mốc): dời mốc từng chữ theo mốc của lần lặp đó.
            const tu = tuGoc && tuGoc.map((t) => ({ ...t, batDau: Math.round((t.batDau + (k ? batDau - giayCua(cacMoc[0][1], cacMoc[0][2]) : 0)) * 100) / 100 }));
            moc.push({ batDau, text, ...(tu ? { tu } : {}) });
        });
    }
    moc.sort((a, b) => a.batDau - b.batDau);
    const cau = [];
    moc.forEach((m, i) => {
        if (!m.text) return;
        const sau = moc[i + 1];
        const ketThuc = sau ? sau.batDau : (thoiLuong > m.batDau ? thoiLuong : m.batDau + 5);
        cau.push({ batDau: m.batDau, ketThuc: Math.round(ketThuc * 100) / 100, text: m.text, ...(m.tu ? { tu: m.tu } : {}) });
    });
    return cau.slice(0, TOI_DA_DONG);
}

/** Lời thường (không mốc) thành từng dòng (thuần). */
function tachLoiThuong(text) {
    return String(text || '').split(/\r?\n/).map((d) => gon(d.replace(/\[[^\]]*\]/g, ''))).filter(Boolean)
        .slice(0, TOI_DA_DONG).map((t) => ({ batDau: null, ketThuc: null, text: t }));
}

/**
 * Ngôn ngữ của lời bài hát theo chữ viết (sổ ngôn ngữ): Kana → Nhật, Hangul → Hàn, chữ Hán → Trung,
 * còn lại → Anh. Kana kiểm trước Hán: lời tiếng Nhật có Kanji không bị nhận là tiếng Trung.
 */
const doanLang = (cau) => nhanDienChuViet(cau.map((c) => c.text).join('\n')) || 'en';

async function goiLrclib(duongDan) {
    const r = await fetch(`${LRCLIB}${duongDan}`, {
        // Tên ứng dụng chung chung, không kèm thông tin người dùng.
        headers: { 'User-Agent': 'LevelUp-hoc-ngoai-ngu/1.0' },
        signal: AbortSignal.timeout(10000),
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`LRCLIB ${r.status}`);
    return r.json();
}

/** Tìm lời theo tên bài và ca sĩ. Bản có mốc thời gian xếp trước. */
async function timLoi({ tenBai, ngheSi } = {}) {
    const ten = gon(tenBai, 120);
    if (!ten) return { loi: 'Nhập tên bài hát.', ma: 400 };
    const q = new URLSearchParams({ track_name: ten });
    if (gon(ngheSi, 120)) q.set('artist_name', gon(ngheSi, 120));
    let ds;
    try {
        ds = await goiLrclib(`/search?${q}`);
    } catch (e) {
        logger.warn('Bài hát: không tìm được lời', { message: e?.message });
        return { loi: 'Chưa kết nối được kho lời bài hát, thử lại sau ít phút.', ma: 503 };
    }
    return {
        ketQua: (Array.isArray(ds) ? ds : [])
            .filter((x) => !x.instrumental && (x.syncedLyrics || x.plainLyrics))
            .sort((a, b) => Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics))
            .slice(0, TOI_DA_KQ_TIM)
            .map((x) => ({
                id: x.id, tenBai: gon(x.trackName, 160), ngheSi: gon(x.artistName, 120), album: gon(x.albumName, 120),
                thoiLuong: Math.round(Number(x.duration) || 0), coMoc: !!x.syncedLyrics,
            })),
    };
}

const congKhai = (d, day = false) => ({
    id: String(d._id), youtubeId: d.youtubeId, tieuDe: d.tieuDe, ngheSi: d.ngheSi, lang: d.lang,
    thoiLuong: d.thoiLuong, nguonLoi: d.nguonLoi, coMoc: d.coMoc, lech: d.lech || 0, lechTu: d.lechTu || [], soDong: d.cau?.length || 0,
    ...(day ? { cau: d.cau } : {}),
});

/** Thêm một bài: lời từ LRCLIB (`lrclibId`) hoặc tự dán (`loiDan`). */
async function themBai(userId, body = {}) {
    const youtubeId = tachYoutubeId(body.youtube);
    if (!youtubeId) return { loi: 'Link YouTube không hợp lệ.', ma: 400 };
    if (await BaiHat.countDocuments({ userId }) >= TOI_DA_BAI) return { loi: `Đã đủ ${TOI_DA_BAI} bài, xoá bớt trước khi thêm.`, ma: 400 };

    let cau = [];
    let nguon = { nguonLoi: 'tu-dan', lrclibId: null };
    let tieuDe = gon(body.tieuDe, 160);
    let ngheSi = gon(body.ngheSi, 120);
    let thoiLuong = 0;
    if (body.lrclibId != null) {
        const id = Number(body.lrclibId);
        if (!Number.isInteger(id) || id <= 0) return { loi: 'Bản lời không hợp lệ.', ma: 400 };
        let x;
        try { x = await goiLrclib(`/get/${id}`); } catch { return { loi: 'Chưa lấy được lời, thử lại sau ít phút.', ma: 503 }; }
        if (!x) return { loi: 'Không tìm thấy bản lời này.', ma: 404 };
        thoiLuong = Math.round(Number(x.duration) || 0);
        cau = x.syncedLyrics ? docLrc(x.syncedLyrics, thoiLuong) : tachLoiThuong(x.plainLyrics);
        nguon = { nguonLoi: 'lrclib', lrclibId: id };
        tieuDe = tieuDe || gon(x.trackName, 160);
        ngheSi = ngheSi || gon(x.artistName, 120);
    } else {
        cau = tachLoiThuong(body.loiDan);
    }
    if (!cau.length) return { loi: 'Chưa có lời bài hát.', ma: 400 };
    // Ngôn ngữ chưa mở (vd lời tiếng Nhật/Hàn): báo rõ, không gán nhầm sang tiếng Trung (pinyin sai).
    const lang = doanLang(cau);
    if (!NGON_NGU_HOAT_DONG.includes(lang)) return { loi: `Lời bài hát này là ${layNgonNgu(lang).tenViet.toLowerCase()} — ngôn ngữ này chưa được hỗ trợ.`, ma: 400 };
    if (!tieuDe) return { loi: 'Nhập tên bài hát.', ma: 400 };

    const d = await BaiHat.create({
        userId, youtubeId, tieuDe, ngheSi, thoiLuong, ...nguon,
        lang, coMoc: cau.every((c) => c.batDau != null), cau,
    });
    return { bai: congKhai(d, true) };
}

async function danhSach(userId) {
    const ds = await BaiHat.find({ userId }).sort({ createdAt: -1 }).lean();
    return ds.map((d) => congKhai(d));
}

async function layBai(userId, id) {
    const d = await BaiHat.findOne({ _id: id, userId }).lean();
    return d ? congKhai(d, true) : null;
}

/**
 * Mốc thời gian từ "Bấm theo nhịp" (thuần): đủ một mốc cho mỗi dòng, tăng dần, trong 1 giờ.
 * Trả mảng câu có batDau/ketThuc, hoặc chuỗi lỗi.
 */
function apMoc(cau, moc, thoiLuong = 0) {
    if (!Array.isArray(moc) || moc.length !== cau.length) return 'Cần đủ một mốc cho mỗi dòng.';
    const so = moc.map(Number);
    if (so.some((t) => !Number.isFinite(t) || t < 0 || t > 3600)) return 'Mốc thời gian không hợp lệ.';
    if (so.some((t, i) => i > 0 && t < so[i - 1])) return 'Mốc phải tăng dần theo thứ tự dòng.';
    return cau.map((c, i) => ({
        text: c.text,
        batDau: Math.round(so[i] * 100) / 100,
        ketThuc: Math.round((i + 1 < so.length ? so[i + 1] : Math.max(so[i] + 5, thoiLuong || 0)) * 100) / 100,
    }));
}

const LECH_TOI_DA = 120;
const TOI_DA_MOC_CHINH = 100;

/**
 * Mốc chỉnh từng đoạn (thuần): mỗi mốc là dòng có thật, độ lệch trong ±120 giây, mỗi dòng một mốc,
 * tăng dần theo dòng. Trả mảng đã chuẩn hoá hoặc chuỗi lỗi.
 */
function chuanHoaLechTu(ds, soDong) {
    if (!Array.isArray(ds)) return 'Mốc chỉnh không hợp lệ.';
    if (ds.length > TOI_DA_MOC_CHINH) return `Tối đa ${TOI_DA_MOC_CHINH} mốc chỉnh.`;
    const theoDong = new Map();
    for (const m of ds) {
        const dong = Number(m?.dong);
        const lech = Number(m?.lech);
        if (!Number.isInteger(dong) || dong < 0 || dong >= soDong) return 'Mốc chỉnh trỏ tới dòng không có.';
        if (!Number.isFinite(lech) || Math.abs(lech) > LECH_TOI_DA) return `Độ lệch chỉ trong khoảng ±${LECH_TOI_DA} giây.`;
        theoDong.set(dong, Math.round(lech * 100) / 100);
    }
    return [...theoDong].map(([dong, lech]) => ({ dong, lech })).sort((a, b) => a.dong - b.dong);
}

/** Sửa: độ lệch chung (`lech`), mốc chỉnh từng đoạn (`lechTu`), mốc "Bấm theo nhịp" (`moc`). */
async function capNhat(userId, id, body = {}) {
    const d = await BaiHat.findOne({ _id: id, userId }).lean();
    if (!d) return { loi: 'Không tìm thấy bài hát.', ma: 404 };
    const $set = {};
    if (body.lech !== undefined) {
        const lech = Number(body.lech);
        if (!Number.isFinite(lech) || Math.abs(lech) > LECH_TOI_DA) return { loi: `Độ lệch chỉ trong khoảng ±${LECH_TOI_DA} giây.`, ma: 400 };
        $set.lech = Math.round(lech * 100) / 100;
    }
    if (body.lechTu !== undefined) {
        const lechTu = chuanHoaLechTu(body.lechTu, d.cau.length);
        if (typeof lechTu === 'string') return { loi: lechTu, ma: 400 };
        $set.lechTu = lechTu;
    }
    if (body.moc !== undefined) {
        const cau = apMoc(d.cau, body.moc, d.thoiLuong);
        if (typeof cau === 'string') return { loi: cau, ma: 400 };
        // Nhịp mới bấm tay đã khớp video: bỏ mọi độ lệch cũ.
        Object.assign($set, { cau, coMoc: true, lech: 0, lechTu: [] });
    }
    if (!Object.keys($set).length) return { loi: 'Không có gì để sửa.', ma: 400 };
    await BaiHat.updateOne({ _id: id, userId }, { $set });
    return { bai: await layBai(userId, id) };
}

async function xoaBai(userId, id) {
    const r = await BaiHat.deleteOne({ _id: id, userId });
    return r?.deletedCount ? { ok: true } : { loi: 'Không tìm thấy bài hát.', ma: 404 };
}

module.exports = {
    duocDung, coQuyen, emailTuBien, chuanHoaLechTu, tachYoutubeId, docLrc, tachLoiThuong, apMoc, timLoi, themBai, danhSach, layBai, capNhat, xoaBai,
    TOI_DA_BAI, TOI_DA_DONG,
};
