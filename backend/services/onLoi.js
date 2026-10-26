/**
 * KIỂM TRA LẠI LỖI ĐÃ CHỮA — để biết người học NHỚ lỗi, BIẾT sửa, hay chỉ học vẹt.
 *
 * Mỗi lỗi (LoiOn) đi qua các nấc, mỗi buổi một câu hỏi theo nấc hiện tại:
 *   0 tim-loi  : câu cũ của chính mình — bấm vào chỗ sai          (không AI)
 *   1 sua-loi  : chỗ sai đã tô — gõ lại cho đúng                   (không AI)
 *   2 ly-do    : "vì sao sửa X → Y?" — chọn loại lỗi / quy tắc      (không AI)
 *   3 cau-moi  : CÂU MỚI, từ khác, cùng loại lỗi — tìm và sửa       (kho chung, AI sinh một lần)
 * Thêm vài câu "dung-sai" (câu đã đúng hay còn lỗi?) để bắt thói quen sửa bừa, và
 * "chon-sua" (chọn cách sửa đúng — một phương án sai CHÍNH LÀ lỗi gốc) — câu thêm,
 * không đổi nấc.
 * Lỗi đã nắm thì có câu "tu-dat-cau": tự đặt câu mới đúng cấu trúc (AI chấm) — đạt là
 * "Thành thạo". Bậc thưởng, không bắt buộc để "đã nắm".
 *
 * Luật:
 *   · Đúng → lên nấc; lịch ôn giãn ra 1 → 3 → 7 → 14 ngày.
 *   · "Đã nắm" = qua nấc 3 ở ≥ 2 NGÀY khác nhau (giờ VN). Đúng ngay sau khi vừa học
 *     chưa nói lên gì; đúng lại sau vài ngày mới là nhớ.
 *   · Sai câu MỚI trong khi đã làm đúng câu CŨ → "nghi học vẹt", lùi một nấc.
 *   · Loại "Khác" không sinh câu mới được (không có quy tắc chung) → nấc 2, 3 dùng lại
 *     việc sửa câu cũ ở các ngày khác nhau.
 */
const LoiOn = require('../models/LoiOn');
const CauLuyenLoi = require('../models/CauLuyenLoi');
const BuoiOnLoi = require('../models/BuoiOnLoi');
const Essay = require('../models/Essay');
const Translation = require('../models/Translation');
const Conversation = require('../models/Conversation');
const UserProfile = require('../models/UserProfile');
const { LOAI_LOI, chuanHoaLoai, nhanLoi, goiYLoi } = require('./errorTaxonomy');
const { homNayVN } = require('./loTrinh');
const { parseJson } = require('./essayGrader');
const logger = require('../utils/logger');

// Nạp trễ như các bộ chấm khác: nạp module không được khởi tạo client AI.
function chatCompletion(...args) {
    return require('../config/openai').chatCompletion(...args);
}

const MOT_NGAY = 24 * 60 * 60 * 1000;
/** Khoảng ôn (ngày) theo bậc. */
const KHOANG = [1, 3, 7, 14];
/** Đã nắm thì vẫn ôn duy trì thưa. */
const KHOANG_DA_NAM = 30;
const SO_CAU_BUOI = 8;
const SO_CAU_THEM = 2;
const SO_NGAY_DONG_BO = 180;

// ───────────────────────── hàm thuần ─────────────────────────

const RE_VIET = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const coTiengViet = (s) => RE_VIET.test(String(s || ''));
const gon = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Chuẩn hoá để so câu tự sửa (khớp `chuanHoaSo` ở frontend/src/lib/chuaBai.js). */
function chuanHoaSo(s) {
    return String(s || '')
        .normalize('NFC')
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[\s.,!?;:。，！？；：]+$/u, '');
}
const khopSua = (nhap, sua) => {
    const a = chuanHoaSo(nhap);
    return !!a && a === chuanHoaSo(sua);
};

/**
 * Vị trí `quote` trong `text`: khớp nguyên văn, rồi không phân biệt hoa/thường, rồi
 * bỏ qua khác biệt khoảng trắng. Không thấy → null.
 */
function viTriTrong(text, quote) {
    const t = String(text || '');
    const q = String(quote || '').trim();
    if (!q) return null;
    let i = t.indexOf(q);
    if (i >= 0) return { start: i, end: i + q.length };
    i = t.toLowerCase().indexOf(q.toLowerCase());
    if (i >= 0) return { start: i, end: i + q.length };
    const mau = q.split(/\s+/).filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    const m = new RegExp(mau, 'iu').exec(t);
    return m ? { start: m.index, end: m.index + m[0].length } : null;
}

/**
 * Câu chứa lỗi trong bài: mở rộng từ chỗ trích ra tới dấu kết câu hai bên. Trích dẫn
 * trải qua nhiều câu vẫn ra đúng đoạn. Quá dài thì cắt quanh chỗ lỗi.
 */
function cauChua(text, quote) {
    const t = String(text || '');
    const vt = viTriTrong(t, quote);
    if (!vt) return null;
    const KET = /[.!?。！？\n]/;
    let a = vt.start;
    while (a > 0 && !KET.test(t[a - 1])) a -= 1;
    let b = vt.end;
    while (b < t.length && !KET.test(t[b])) b += 1;
    if (b < t.length && t[b] !== '\n') b += 1; // lấy luôn dấu kết câu
    let cau = gon(t.slice(a, b));
    if (cau.length > 400) {
        const tam = gon(t.slice(Math.max(0, vt.start - 150), Math.min(t.length, vt.end + 150)));
        cau = tam.slice(0, 400);
    }
    return cau;
}

/**
 * Chấm "bấm vào chỗ sai". Người học chọn nguyên TỪ (tiếng Anh) hoặc từng CHỮ (tiếng
 * Trung), nên chỗ sai được nới ra tới ranh giới từ. Đúng khi: chọn có chạm chỗ sai,
 * và không chọn thừa ra ngoài (chọn cả câu thì không tính).
 */
function chamTimLoi(chon, span, cau, lang) {
    const s = Number(chon?.start);
    const e = Number(chon?.end);
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e <= s || !span) return false;
    let a = span.start;
    let b = span.end;
    if (lang !== 'zh') {
        while (a > 0 && !/\s/.test(cau[a - 1])) a -= 1;
        while (b < cau.length && !/\s/.test(cau[b])) b += 1;
    }
    const cham = s < span.end && e > span.start;
    return cham && s >= a && e <= b;
}

/** Chọn dạng câu hỏi theo nấc. */
function chonDang(loi, coCauMoi) {
    if (loi.nac <= 0) return 'tim-loi';
    if (loi.nac === 1) return 'sua-loi';
    if (loi.nac === 2) return loi.loai !== 'other' ? 'ly-do' : 'sua-loi';
    return coCauMoi ? 'cau-moi' : 'sua-loi';
}

/**
 * Trạng thái mới của một lỗi sau một câu trả lời TÍNH NẤC (thuần).
 * @returns {object} các trường cần `$set` + cờ `moiDaNam`, `moiNghiHocVet`
 */
function capNhatSauTraLoi(loi, { dang, dung }, now = new Date()) {
    const ngay = homNayVN(now).ngay;
    let { nac, buoc } = loi;
    let ngayApDung = [...(loi.ngayApDung || [])];
    let daNam = !!loi.daNam;
    let nghiHocVet = !!loi.nghiHocVet;
    let denHan;

    if (dung) {
        if (nac < 3) nac += 1;
        else if (!ngayApDung.includes(ngay)) ngayApDung = [...ngayApDung, ngay].slice(-5);
        if (nac === 3 && dang === 'cau-moi') nghiHocVet = false;
        daNam = ngayApDung.length >= 2;
        buoc = Math.min(buoc + 1, KHOANG.length - 1);
        denHan = new Date(now.getTime() + (daNam ? KHOANG_DA_NAM : KHOANG[buoc]) * MOT_NGAY);
    } else {
        // Sai CÂU MỚI sau khi đã qua câu cũ → có thể chỉ đang nhớ đáp án.
        if (dang === 'cau-moi') {
            nghiHocVet = true;
            nac = 2;
        }
        // Đã nắm mà sai lại → chưa nắm thật, đếm lại từ đầu.
        if (daNam) { daNam = false; ngayApDung = []; }
        buoc = 0;
        denHan = new Date(now.getTime() + KHOANG[0] * MOT_NGAY);
    }
    return {
        nac, buoc, denHan, ngayApDung, daNam, nghiHocVet,
        moiDaNam: daNam && !loi.daNam,
        moiNghiHocVet: nghiHocVet && !loi.nghiHocVet,
    };
}

/**
 * Kiểm một câu mới AI sinh — KHÔNG để câu hỏng tới tay người học:
 *   · chỗ sai phải nằm nguyên văn trong câu sai;
 *   · thay chỗ sai bằng cách sửa phải ra ĐÚNG câu đúng;
 *   · câu sai ≠ câu đúng; độ dài hợp lý.
 */
function kiemCauMoi(raw) {
    const sai = gon(raw?.wrong);
    const chiSai = gon(raw?.error);
    const sua = gon(raw?.fix);
    const dung = gon(raw?.correct);
    if (!sai || !chiSai || !sua || !dung) return null;
    if (sai.length > 200 || dung.length > 200 || chiSai.length > 80 || sua.length > 80) return null;
    const i = sai.indexOf(chiSai);
    if (i < 0 || sai.indexOf(chiSai, i + 1) >= 0) return null; // phải xuất hiện đúng một lần
    const ghep = sai.slice(0, i) + sua + sai.slice(i + chiSai.length);
    if (chuanHoaSo(ghep) !== chuanHoaSo(dung)) return null;
    if (chuanHoaSo(sai) === chuanHoaSo(dung)) return null;
    return { sai, chiSai, sua, dung, giaiThich: gon(raw?.why).slice(0, 300) };
}

/** Mô tả loại lỗi để AI sinh câu mới. */
const MO_TA_LOI = {
    article: 'a wrong or missing article (a/an/the)',
    tense: 'a wrong verb tense',
    agreement: 'a subject-verb agreement mistake',
    preposition: 'a wrong preposition',
    'word-order': 'a word order mistake',
    'word-choice': 'a wrong word choice (a similar but incorrect word)',
    plural: 'a singular/plural or countable/uncountable noun mistake',
    spelling: 'one misspelled word',
    punctuation: 'a punctuation mistake',
};

const tron = (a) => {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
};

// ───────────────────────── dữ liệu ─────────────────────────

async function langCua(userId) {
    const p = await UserProfile.findOne({ userId }).select('settings').lean();
    return p?.settings?.vocabLang === 'zh' ? 'zh' : 'en';
}

/**
 * Đồng bộ lỗi đã chữa → LoiOn (chỉ thêm mới, KHÔNG đụng tiến độ đã có). Bỏ lỗi không
 * kiểm tra được: cụm sửa là lời giải thích tiếng Việt (bài chấm cũ), hoặc không tìm
 * thấy chỗ trích trong bài.
 */
async function dongBo(userId, lang, now = new Date()) {
    const tu = new Date(now.getTime() - SO_NGAY_DONG_BO * MOT_NGAY);
    const theoLang = lang === 'zh' ? { lang: 'zh' } : { lang: { $ne: 'zh' } };
    const [viet, dich, noi] = await Promise.all([
        Essay.find({ userId, createdAt: { $gte: tu }, ...theoLang }).select('essay issues').lean(),
        Translation.find({ userId, createdAt: { $gte: tu }, ...theoLang }).select('translation notes').lean(),
        Conversation.find({
            userId, status: 'done', updatedAt: { $gte: tu }, ...theoLang, 'feedback.corrections.0': { $exists: true },
        }).select('turns feedback.corrections').lean(),
    ]);

    const muc = [];
    const them = (nguon, baiId, i, text, raw) => {
        const quote = gon(raw?.quote ?? raw?.said);
        const sua = gon(raw?.fix ?? raw?.better);
        if (!quote || !sua || coTiengViet(sua) || chuanHoaSo(quote) === chuanHoaSo(sua)) return;
        const cau = cauChua(text, quote);
        if (!cau || !viTriTrong(cau, quote)) return;
        muc.push({
            khoa: `${nguon}-${baiId}-${i}`, nguon, lang, cau, quote: quote.slice(0, 300), sua: sua.slice(0, 300),
            issue: String(raw?.issue || '').slice(0, 500), loai: chuanHoaLoai(raw?.loai ?? raw?.type),
            muc: raw?.muc === 'nen' || raw?.level === 'style' ? 'nen' : 'loi',
        });
    };
    for (const b of viet) (b.issues || []).forEach((r, i) => them('viet', b._id, i, b.essay, r));
    for (const b of dich) (b.notes || []).forEach((r, i) => them('dich', b._id, i, b.translation, r));
    for (const b of noi) {
        const cauHoc = (b.turns || []).filter((t) => t.role === 'user').map((t) => t.content);
        (b.feedback?.corrections || []).forEach((r, i) => them('noi', b._id, i, cauHoc[r?.luot] || '', r));
    }
    if (!muc.length) return 0;

    const ops = muc.slice(0, 300).map((m) => ({
        updateOne: {
            filter: { userId, khoa: m.khoa },
            update: { $setOnInsert: { userId, ...m, nac: 0, buoc: 0, denHan: now } },
            upsert: true,
        },
    }));
    const r = await LoiOn.bulkWrite(ops, { ordered: false });
    return r?.upsertedCount ?? 0;
}

/**
 * Câu mới (chưa gặp) cho một loại lỗi. Kho thiếu → nhờ AI sinh thêm một lô (kiểm chặt
 * từng câu rồi mới lưu). Lỗi AI → null, nơi gọi tự lùi về sửa câu cũ.
 */
async function layCauMoi({ loai, lang, daGap = [], userId, dangSinh }) {
    if (!MO_TA_LOI[loai]) return null;
    const chuaGap = await CauLuyenLoi.find({ loai, lang, _id: { $nin: daGap } }).limit(20).lean();
    if (chuaGap.length) return chuaGap[Math.floor(Math.random() * chuaGap.length)];

    // Một lần sinh cho mỗi (loại, ngôn ngữ) trong một buổi, dù nhiều lỗi cùng loại.
    const khoa = `${loai}|${lang}`;
    if (!dangSinh.has(khoa)) dangSinh.set(khoa, sinhCauMoi({ loai, lang, userId }));
    await dangSinh.get(khoa);
    const moi = await CauLuyenLoi.find({ loai, lang, _id: { $nin: daGap } }).limit(20).lean();
    return moi.length ? moi[Math.floor(Math.random() * moi.length)] : null;
}

async function sinhCauMoi({ loai, lang, userId }) {
    const L = lang === 'zh' ? 'Chinese (Simplified)' : 'English';
    const res = await chatCompletion([
        {
            role: 'system',
            content: [
                `Write 6 short ${L} sentences (6-16 words) for Vietnamese learners, intermediate level.`,
                `Each sentence must contain EXACTLY ONE mistake: ${MO_TA_LOI[loai]}. Everything else must be correct.`,
                'Use varied everyday and work topics. Do not repeat sentence patterns.',
                'For each, give: "wrong" (the sentence with the mistake), "error" (the exact wrong words, copied',
                'from "wrong", as short as possible), "fix" (the words that replace "error"), "correct" (the full',
                'sentence after replacing "error" with "fix"), "why" (one short Vietnamese explanation).',
                'Return ONLY JSON: {"items":[{"wrong":"...","error":"...","fix":"...","correct":"...","why":"..."}]}',
            ].join('\n'),
        },
        { role: 'user', content: `Mistake type: ${loai}` },
    ], { maxTokens: 900, temperature: 0.8, feature: 'on-loi-cau-moi', userId }).catch(() => null);
    if (!res?.success) return 0;
    const items = (parseJson(res.content)?.items || []).map(kiemCauMoi).filter(Boolean);
    if (!items.length) {
        logger.warn('Ôn lỗi: AI sinh câu mới không câu nào qua kiểm', { loai, lang });
        return 0;
    }
    await CauLuyenLoi.insertMany(items.map((it) => ({ ...it, loai, lang })), { ordered: false }).catch(() => {});
    return items.length;
}

/** Dựng một câu hỏi (phần đề + đáp án ẩn) cho một lỗi theo dạng. */
function dungCau(loi, dang, cauMoi) {
    const span = viTriTrong(loi.cau, loi.quote);
    if (dang === 'tim-loi') {
        return { de: { cau: loi.cau, lang: loi.lang }, dapAn: { ...span, quote: loi.quote, sua: loi.sua, issue: loi.issue } };
    }
    if (dang === 'sua-loi') {
        return { de: { cau: loi.cau, lang: loi.lang, ...span }, dapAn: { ...span, sua: loi.sua, issue: loi.issue } };
    }
    if (dang === 'ly-do') {
        const khac = tron(LOAI_LOI.filter((l) => l.key !== 'other' && l.key !== loi.loai)).slice(0, 3);
        const lua = tron([{ key: loi.loai, vi: nhanLoi(loi.loai) }, ...khac.map((l) => ({ key: l.key, vi: l.vi }))]);
        return {
            de: { cau: loi.cau, quote: loi.quote, sua: loi.sua, lua, lang: loi.lang },
            dapAn: { loai: loi.loai, vi: nhanLoi(loi.loai), hint: goiYLoi(loi.loai), issue: loi.issue },
        };
    }
    // cau-moi
    const vt = viTriTrong(cauMoi.sai, cauMoi.chiSai);
    return {
        de: { cau: cauMoi.sai, lang: loi.lang, loai: nhanLoi(loi.loai) },
        dapAn: { ...vt, chiSai: cauMoi.chiSai, sua: cauMoi.sua, cauDung: cauMoi.dung, giaiThich: cauMoi.giaiThich, cauId: String(cauMoi._id) },
    };
}

/** Câu thêm "Đúng hay sai": nửa là câu cũ còn lỗi, nửa là câu đã sửa (không lỗi). */
function cauDungSai(loi) {
    const span = viTriTrong(loi.cau, loi.quote);
    const cauDung = gon(loi.cau.slice(0, span.start) + loi.sua + loi.cau.slice(span.end));
    const coLoi = Math.random() < 0.5;
    return {
        de: { cau: coLoi ? loi.cau : cauDung, lang: loi.lang },
        dapAn: { coLoi, cauDung, quote: loi.quote, sua: loi.sua, issue: loi.issue },
    };
}

/**
 * Câu thêm "Chọn cách sửa": cách sửa đúng + tối đa 3 phương án sai, trong đó có chính
 * lỗi gốc của người học (chọn lại nó là chưa nhớ) và phương án AI sinh sẵn.
 */
function cauChonSua(loi) {
    const span = viTriTrong(loi.cau, loi.quote);
    const daCo = new Set([chuanHoaSo(loi.sua)]);
    const sai = [];
    for (const x of [loi.quote, ...(loi.luaSai || [])]) {
        const k = chuanHoaSo(x);
        if (!k || daCo.has(k)) continue;
        daCo.add(k);
        sai.push(gon(x));
        if (sai.length >= 3) break;
    }
    return {
        de: { cau: loi.cau, lang: loi.lang, ...span, lua: tron([gon(loi.sua), ...sai]) },
        dapAn: { ...span, sua: loi.sua, issue: loi.issue },
    };
}

/** Câu "Tự đặt câu" cho lỗi đã nắm: dùng đúng cấu trúc trong một câu CỦA MÌNH. */
function cauTuDat(loi) {
    const span = viTriTrong(loi.cau, loi.quote);
    const cauDung = gon(loi.cau.slice(0, span.start) + loi.sua + loi.cau.slice(span.end));
    return {
        de: { loai: nhanLoi(loi.loai), hint: goiYLoi(loi.loai), mau: gon(loi.sua), lang: loi.lang },
        dapAn: { cauDung, cauGoc: loi.cau, quote: loi.quote, sua: loi.sua, loai: loi.loai, issue: loi.issue },
    };
}

/** Lọc phương án sai AI sinh: chuỗi ngắn, khác cách sửa đúng, khác lỗi gốc, không trùng. */
function kiemLuaSai(ds, sua, quote) {
    const bo = new Set([chuanHoaSo(sua), chuanHoaSo(quote)]);
    const out = [];
    for (const x of Array.isArray(ds) ? ds : []) {
        const g = gon(x);
        const k = chuanHoaSo(g);
        if (!g || g.length > 80 || bo.has(k)) continue;
        bo.add(k);
        out.push(g);
        if (out.length >= 2) break;
    }
    return out;
}

/** Sinh (một lượt AI cho cả nhóm) và lưu phương án sai cho các lỗi chưa có. */
async function sinhLuaSai(ds, userId) {
    const res = await chatCompletion([
        {
            role: 'system',
            content: [
                'For each item, a learner wrote "wrong" inside "sentence"; the correct words are "correct".',
                'Give 2 plausible but INCORRECT alternatives to "correct" — typical learner mistakes of a similar',
                'length. Never give the correct form or the learner\'s own "wrong" words.',
                'Return ONLY JSON: {"items":[{"id":"...","options":["...","..."]}]}',
            ].join('\n'),
        },
        { role: 'user', content: JSON.stringify(ds.map((l) => ({ id: String(l._id), sentence: l.cau, wrong: l.quote, correct: l.sua }))) },
    ], { maxTokens: 400, temperature: 0.7, feature: 'on-loi-lua-sai', userId }).catch(() => null);
    if (!res?.success) return;
    const theoId = new Map((parseJson(res.content)?.items || []).map((it) => [String(it?.id), it?.options]));
    await Promise.all(ds.map(async (l) => {
        const luaSai = kiemLuaSai(theoId.get(String(l._id)), l.sua, l.quote);
        if (!luaSai.length) return;
        l.luaSai = luaSai;
        await LoiOn.updateOne({ _id: l._id, userId }, { $set: { luaSai } });
    }));
}

/** Câu tự đặt: chặn trước (miễn phí) câu quá ngắn hoặc chép lại câu cũ. */
function kiemTuDat(cau, dapAn, lang) {
    const c = gon(cau);
    const du = lang === 'zh' ? c.replace(/\s/g, '').length >= 5 : c.split(' ').length >= 4;
    if (!du) return 'Câu hơi ngắn — hãy viết một câu đầy đủ.';
    if ([dapAn.cauDung, dapAn.cauGoc].some((x) => chuanHoaSo(x) === chuanHoaSo(c))) {
        return 'Đây là câu cũ — hãy tự đặt một câu MỚI của bạn.';
    }
    return null;
}

/** AI chấm câu tự đặt: có dùng đúng cấu trúc và đúng ngữ pháp không. */
async function chamTuDat({ cau, dapAn, lang, userId }) {
    const L = lang === 'zh' ? 'Chinese' : 'English';
    const res = await chatCompletion([
        {
            role: 'system',
            content: [
                `A Vietnamese learner of ${L} once wrote "${dapAn.quote}" and it was corrected to "${dapAn.sua}" (mistake type: ${dapAn.loai}).`,
                'Now they wrote a NEW sentence of their own that should use the same structure correctly.',
                'Judge only: does it use that structure correctly, and is the sentence grammatical?',
                'Return ONLY JSON: {"ok":true|false,"note":"<one short Vietnamese sentence>","better":"<corrected sentence if not ok, else empty>"}',
            ].join('\n'),
        },
        { role: 'user', content: String(cau).slice(0, 300) },
    ], { maxTokens: 160, temperature: 0, feature: 'on-loi-tu-dat', userId }).catch(() => null);
    if (!res?.success) return null;
    const o = parseJson(res.content);
    if (!o || typeof o.ok !== 'boolean') return null;
    return { dung: o.ok, ghiChu: gon(o.note).slice(0, 300), cauTot: gon(o.better).slice(0, 300) };
}

// ───────────────────────── API ─────────────────────────

async function tongQuan(userId, now = new Date()) {
    const lang = await langCua(userId);
    await dongBo(userId, lang, now);
    const [tong, denHan, daNam, nghiHocVet, thanhThao, ke, ds] = await Promise.all([
        LoiOn.countDocuments({ userId, lang }),
        LoiOn.countDocuments({ userId, lang, denHan: { $lte: now } }),
        LoiOn.countDocuments({ userId, lang, daNam: true }),
        LoiOn.countDocuments({ userId, lang, nghiHocVet: true }),
        LoiOn.countDocuments({ userId, lang, thanhThao: true }),
        LoiOn.findOne({ userId, lang, denHan: { $gt: now } }).sort({ denHan: 1 }).select('denHan').lean(),
        LoiOn.find({ userId, lang }).select('khoa nac daNam nghiHocVet thanhThao').lean(),
    ]);
    // Trạng thái từng lỗi theo `khoa` (= id mục Sổ tay) — để Sổ tay vẽ thanh nấc.
    const trangThai = {};
    for (const l of ds || []) {
        trangThai[l.khoa] = { nac: l.nac, daNam: !!l.daNam, nghiHocVet: !!l.nghiHocVet, thanhThao: !!l.thanhThao };
    }
    return { tong, denHan, daNam, nghiHocVet, thanhThao, lanToi: ke?.denHan || null, trangThai };
}

/**
 * Mở một buổi: tối đa 8 lỗi ĐẾN HẠN (chưa nắm và nghi học vẹt trước), mỗi lỗi một câu
 * theo nấc, cộng 2 câu "Đúng hay sai". `som`: chưa có gì đến hạn thì lấy những lỗi sắp
 * đến hạn nhất (người học muốn ôn thêm).
 */
async function taoBuoi(userId, { som = false } = {}, now = new Date()) {
    const lang = await langCua(userId);
    await dongBo(userId, lang, now);
    const loc = som ? { userId, lang } : { userId, lang, denHan: { $lte: now } };
    const ds = await LoiOn.find(loc).sort({ daNam: 1, nghiHocVet: -1, denHan: 1 }).limit(SO_CAU_BUOI).lean();
    if (!ds.length) return { buoi: null };

    const dangSinh = new Map();
    const cau = [];
    for (const loi of ds) {
        let cauMoi = null;
        if (loi.nac >= 3 && loi.loai !== 'other') {
            cauMoi = await layCauMoi({ loai: loi.loai, lang, daGap: loi.daGap || [], userId, dangSinh });
        }
        const dang = chonDang(loi, !!cauMoi);
        const q = dungCau(loi, dang, cauMoi);
        cau.push({ loiId: loi._id, dang, ...q, tinhNac: true });
    }
    // Câu thêm: "Đúng hay sai" hoặc "Chọn cách sửa" (lỗi đã qua nấc Nhận ra) — chèn
    // vào vị trí ngẫu nhiên. Phương án sai thiếu thì nhờ AI sinh một lượt cho cả nhóm.
    const them = tron(ds).slice(0, SO_CAU_THEM).map((loi) => ({
        loi, dang: loi.nac >= 1 && Math.random() < 0.5 ? 'chon-sua' : 'dung-sai',
    }));
    const thieuLua = them.filter((t) => t.dang === 'chon-sua' && !(t.loi.luaSai?.length >= 2)).map((t) => t.loi);
    if (thieuLua.length) await sinhLuaSai(thieuLua, userId);
    for (const t of them) {
        const q = t.dang === 'chon-sua' ? cauChonSua(t.loi) : cauDungSai(t.loi);
        cau.splice(Math.floor(Math.random() * (cau.length + 1)), 0, { loiId: t.loi._id, dang: t.dang, ...q, tinhNac: false });
    }
    // Bậc thưởng: một lỗi đã nắm (chưa thành thạo) → tự đặt câu, ở cuối buổi.
    const daNamDs = await LoiOn.find({ userId, lang, daNam: true, thanhThao: { $ne: true } })
        .sort({ updatedAt: 1 }).limit(1).lean();
    const loiTuDat = (daNamDs || []).find((l) => l.daNam && !l.thanhThao);
    if (loiTuDat) cau.push({ loiId: loiTuDat._id, dang: 'tu-dat-cau', ...cauTuDat(loiTuDat), tinhNac: false });

    const buoi = await BuoiOnLoi.create({ userId, cau });
    return {
        buoi: {
            id: String(buoi._id),
            cau: cau.map((c) => ({ dang: c.dang, de: c.de })),
        },
    };
}

/** Chấm một câu của buổi; cập nhật nấc của lỗi nếu là câu tính nấc. */
async function traLoi(userId, buoiId, i, body = {}, now = new Date()) {
    const buoi = await BuoiOnLoi.findOne({ _id: buoiId, userId });
    if (!buoi) return { loi: 'Không tìm thấy buổi ôn (có thể đã hết hạn).', ma: 404 };
    const c = buoi.cau[i];
    if (!c) return { loi: 'Câu không hợp lệ.', ma: 400 };
    if (c.daTra) return { loi: 'Câu này đã trả lời rồi.', ma: 409 };

    const da = c.dapAn || {};
    let dung = false;
    if (c.dang === 'tim-loi') dung = chamTimLoi(body.chon, da, c.de.cau, c.de.lang);
    else if (c.dang === 'sua-loi') dung = khopSua(body.sua, da.sua);
    else if (c.dang === 'ly-do') dung = body.loai === da.loai;
    else if (c.dang === 'cau-moi') dung = chamTimLoi(body.chon, da, c.de.cau, c.de.lang) && khopSua(body.sua, da.sua);
    else if (c.dang === 'dung-sai') dung = typeof body.coLoi === 'boolean' && body.coLoi === da.coLoi;
    else if (c.dang === 'chon-sua') dung = typeof body.sua === 'string' && khopSua(body.sua, da.sua);
    else if (c.dang === 'tu-dat-cau') {
        // Chặn trước (miễn phí): câu ngắn / chép câu cũ → báo để viết lại, CHƯA tính lượt.
        const loiKiem = kiemTuDat(body.cau, da, c.de.lang);
        if (loiKiem) return { loi: loiKiem, ma: 400 };
        const r = await chamTuDat({ cau: body.cau, dapAn: da, lang: c.de.lang, userId });
        if (!r) return { loi: 'AI chưa chấm được, thử lại sau.', ma: 503 };
        dung = r.dung;
        Object.assign(da, { ghiChu: r.ghiChu, cauTot: r.cauTot, cauCuaBan: gon(body.cau) });
    }

    // Chiếm câu có điều kiện "chưa trả lời" — bấm hai lần không tính hai lần.
    const chiem = await BuoiOnLoi.updateOne(
        { _id: buoi._id, userId, [`cau.${i}.daTra`]: false },
        { $set: { [`cau.${i}.daTra`]: true, [`cau.${i}.dung`]: dung } },
    );
    if (!(chiem?.modifiedCount ?? chiem?.nModified)) return { loi: 'Câu này đã trả lời rồi.', ma: 409 };

    const loi = await LoiOn.findOne({ _id: c.loiId, userId }).lean();
    let trangThai = null;
    if (loi) {
        const lichSu = [...(loi.lichSu || []), { at: now, dang: c.dang, dung }].slice(-30);
        const set = { lichSu };
        if (c.tinhNac) {
            const moi = capNhatSauTraLoi(loi, { dang: c.dang, dung }, now);
            const { moiDaNam, moiNghiHocVet, ...truong } = moi;
            Object.assign(set, truong);
            trangThai = { nac: moi.nac, daNam: moi.daNam, nghiHocVet: moi.nghiHocVet, moiDaNam, moiNghiHocVet };
        }
        const update = { $set: set };
        if (c.dang === 'cau-moi' && da.cauId) update.$addToSet = { daGap: da.cauId };
        if (c.dang === 'tu-dat-cau' && dung && !loi.thanhThao) {
            set.thanhThao = true;
            trangThai = { moiThanhThao: true };
        }
        await LoiOn.updateOne({ _id: loi._id, userId }, update);
    }
    return { dung, dapAn: da, trangThai };
}

module.exports = {
    tongQuan, taoBuoi, traLoi, dongBo,
    // thuần — cho test
    viTriTrong, cauChua, chamTimLoi, chonDang, capNhatSauTraLoi, kiemCauMoi, khopSua, chuanHoaSo, dungCau, cauDungSai,
    cauChonSua, cauTuDat, kiemLuaSai, kiemTuDat,
    KHOANG, KHOANG_DA_NAM, SO_CAU_BUOI, MO_TA_LOI,
};
