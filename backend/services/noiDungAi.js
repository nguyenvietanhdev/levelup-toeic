/**
 * QUẢN LÝ NỘI DUNG AI ĐÃ LƯU — một chỗ cho admin xem, thêm, sửa, xoá mọi thứ AI soạn ra rồi lưu
 * vào DB để dùng lại (không tốn token lần sau).
 *
 * Mỗi loại là một "bộ chuyển" cùng một khuôn: mô tả cột và ô nhập cho giao diện, rồi liệt kê /
 * tạo / sửa / xoá. Giao diện admin chỉ cần một bảng và một form chung cho tất cả.
 *
 * Mọi thứ người quản trị nhập đều qua CÙNG bước kiểm như nội dung AI (chuanHoaMucAI, kiemCauMoi,
 * chuanHoaVaiText…): nội dung tay sai định dạng cũng làm hỏng màn người học như nội dung AI sai.
 *
 * Xoá:
 *   · Câu luyện ngữ pháp chỉ ẨN, không rút khỏi mảng: vị trí câu (`so`) được lượt đang làm và báo
 *     cáo sai trỏ tới, rút ra là lệch hết. Hiện lại được.
 *   · Chủ điểm AI đi đường "ẩn" sẵn có (sang Báo cáo, khôi phục được, người học tra lại thì AI soạn
 *     bản mới) vì tiến độ và bộ câu của người học treo vào id của nó.
 *   · Các loại còn lại xoá hẳn: chúng là bộ nhớ đệm, mất thì lần sau AI soạn lại.
 */
const NguPhapMuc = require('../models/NguPhapMuc');
const NguPhapBaiTap = require('../models/NguPhapBaiTap');
const NguPhapNhap = require('../models/NguPhapNhap');
const CauLuyenLoi = require('../models/CauLuyenLoi');
const AiRole = require('../models/AiRole');
const DangGoiY = require('../models/DangGoiY');
const TongKetTuan = require('../models/TongKetTuan');
const User = require('../models/User');
const { MUC, THEO_ID, chuanLang } = require('./nguPhapKho');
const { boDau, chuTimKiem, boTienTo, theoNgonNgu, khoaHoi, chuanHoaMucAI, chuanHoaViDu } = require('./nguPhap');
const { anMuc } = require('./nguPhapQuanTri');
const { dungNgonNgu, soSanh } = require('./nguPhapLuyen');
const { kiemCauMoi, MO_TA_LOI } = require('./onLoi');
const { chuanHoaVaiText, chuanHoaTieuDe, chuanHoaKhoa, hashVai } = require('./aiRoles');

const MOI_TRANG = 30;
const RE_OBJECT_ID = /^[a-f0-9]{24}$/i;
const NGON_NGU = [{ v: 'en', t: 'Tiếng Anh' }, { v: 'zh', t: 'Tiếng Trung' }];

const loi = (message, ma = 400) => ({ loi: message, ma });
const cat = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
const dong = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reTim = (q) => (q ? new RegExp(escapeRe(String(q).slice(0, 80)), 'i') : null);
const soTrang = (n) => Math.max(1, Math.floor(Number(n) || 1));
const ngay = (d) => (d ? new Date(d).toISOString() : '');
const langCua = (v) => (v === 'zh' ? 'zh' : 'en');

/** Cắt trang một danh sách đã có trong bộ nhớ (thuần). */
function catTrang(ds, trang) {
    const tr = soTrang(trang);
    return { ds: ds.slice((tr - 1) * MOI_TRANG, tr * MOI_TRANG), tong: ds.length, trang: tr, soTrang: Math.max(1, Math.ceil(ds.length / MOI_TRANG)) };
}

/** Phân trang thẳng trên DB. */
async function trangDb(Model, loc, { trang, sort = { createdAt: -1 }, select } = {}) {
    const tr = soTrang(trang);
    let q = Model.find(loc).sort(sort).skip((tr - 1) * MOI_TRANG).limit(MOI_TRANG);
    if (select) q = q.select(select);
    const [docs, tong] = await Promise.all([q.lean(), Model.countDocuments(loc)]);
    return { docs, tong, trang: tr, soTrang: Math.max(1, Math.ceil(tong / MOI_TRANG)) };
}

/** Mọi chủ điểm ngữ pháp (kho lõi + mục AI trong thư viện), để chọn và để hiện tên. */
async function dsChuDiem() {
    const thuVien = await NguPhapMuc.find({ noiDung: { $ne: null } }).select('noiDung.ten lang').limit(500).lean();
    return [
        ...MUC.map((m) => ({ id: m.id, ten: m.ten, lang: m.lang })),
        ...thuVien.map((d) => ({ id: String(d._id), ten: d.noiDung?.ten || '', lang: d.lang || 'en' })),
    ];
}
const tuyChonChuDiem = (ds) => ds.map((m) => ({ v: m.id, t: `${m.lang === 'zh' ? '[Trung] ' : ''}${m.ten}` }));

// ---------- Chủ điểm ngữ pháp do AI thêm vào thư viện ----------

/** Form ↔ nội dung chủ điểm (thuần). Công thức "nhãn :: công thức", ví dụ "câu :: nghĩa". */
function formSangMuc(f) {
    const tach = (s) => s.split('::').map((x) => x.trim());
    return {
        ten: f.ten,
        congThuc: dong(f.congThuc).map((s) => { const [nhan, ct] = tach(s); return { nhan, ct }; }),
        dung: dong(f.dung),
        vd: dong(f.vd).map((s) => { const [en, vi, py] = tach(s); return { en, vi, py }; }),
        luuY: f.luuY,
    };
}
function mucSangForm(n = {}) {
    return {
        ten: n.ten || '',
        congThuc: (n.congThuc || []).map((c) => `${c.nhan} :: ${c.ct}`).join('\n'),
        dung: (n.dung || []).join('\n'),
        vd: (n.vd || []).map((v) => [v.en, v.vi, v.py].filter(Boolean).join(' :: ')).join('\n'),
        luuY: n.luuY || '',
    };
}
const TRUONG_MUC = [
    { key: 'ten', ten: 'Tên chủ điểm', kieu: 'text', batBuoc: true },
    { key: 'lang', ten: 'Ngôn ngữ', kieu: 'select', tuyChon: NGON_NGU, chiKhiTao: true },
    { key: 'congThuc', ten: 'Công thức (mỗi dòng: nhãn :: công thức)', kieu: 'dong', batBuoc: true, goiY: 'Khẳng định :: S + V2/ed' },
    { key: 'dung', ten: 'Khi nào dùng (mỗi dòng một ý)', kieu: 'dong', batBuoc: true },
    { key: 'vd', ten: 'Ví dụ (mỗi dòng: câu :: nghĩa; tiếng Trung thêm :: pinyin)', kieu: 'dong', batBuoc: true, goiY: 'I went home. :: Tôi đã về nhà.' },
    { key: 'luuY', ten: 'Lưu ý', kieu: 'textarea' },
];
const SAI_MUC = 'Cần tên, ít nhất một công thức, một cách dùng và một ví dụ hợp lệ (ví dụ phải là câu ngoại ngữ, tiếng Trung phải có chữ Hán).';

const mucNguPhap = {
    key: 'muc-ngu-phap',
    nhom: 'Ngữ pháp',
    ten: 'Chủ điểm ngữ pháp AI',
    moTa: 'Chủ điểm AI soạn và người học đã thêm vào thư viện. Xoá là ẩn khỏi thư viện (khôi phục được ở tab Báo cáo AI sai).',
    locLang: true, themDuoc: true, suaDuoc: true, xoa: 'an-muc',
    cot: [{ key: 'ten', ten: 'Chủ điểm' }, { key: 'lang', ten: 'NN' }, { key: 'tomTat', ten: 'Nội dung' }, { key: 'cauTra', ten: 'Câu tra gốc' }, { key: 'luc', ten: 'Lúc', kieu: 'ngay' }],
    truong: async () => TRUONG_MUC,
    async ds({ q, lang, trang }) {
        const loc = { noiDung: { $ne: null }, ...(lang ? theoNgonNgu(lang) : {}) };
        if (q) loc.$or = [{ tenChuan: reTim(boDau(q)) }, { timKiem: reTim(boDau(q)) }];
        const r = await trangDb(NguPhapMuc, loc, { trang });
        return {
            ...r,
            ds: r.docs.map((d) => ({
                id: String(d._id),
                cot: {
                    ten: d.noiDung?.ten, lang: d.lang || 'en', cauTra: boTienTo(d.khoa), luc: ngay(d.createdAt),
                    tomTat: `${d.noiDung?.congThuc?.length || 0} công thức · ${d.noiDung?.vd?.length || 0} ví dụ`,
                },
                giaTri: { ...mucSangForm(d.noiDung), lang: d.lang || 'en' },
            })),
        };
    },
    async tao(f) {
        const lang = langCua(f.lang);
        const noiDung = chuanHoaMucAI(formSangMuc(f), lang);
        if (!noiDung) return loi(SAI_MUC);
        const khoa = khoaHoi(lang, boDau(noiDung.ten)).slice(0, 120);
        if (await NguPhapMuc.findOne({ khoa }).select('_id').lean()) return loi('Đã có chủ điểm (hoặc cách gọi) trùng tên này.', 409);
        const d = await NguPhapMuc.create({ khoa, lang, noiDung, tenChuan: boDau(noiDung.ten), timKiem: `${boDau(noiDung.ten)} ${chuTimKiem(noiDung)}` });
        return { id: String(d._id) };
    },
    async capNhat(id, f) {
        if (!RE_OBJECT_ID.test(id)) return loi('Id không hợp lệ.');
        const d = await NguPhapMuc.findOne({ _id: id, noiDung: { $ne: null } }).lean();
        if (!d) return loi('Không tìm thấy chủ điểm.', 404);
        const noiDung = chuanHoaMucAI(formSangMuc(f), d.lang || 'en');
        if (!noiDung) return loi(SAI_MUC);
        await NguPhapMuc.updateOne({ _id: id }, {
            $set: { noiDung, tenChuan: boDau(noiDung.ten), timKiem: `${boTienTo(d.khoa)} ${chuTimKiem(noiDung)}` },
        });
        return { id };
    },
    async xoaMuc(id, { adminId }) {
        if (!RE_OBJECT_ID.test(id)) return loi('Id không hợp lệ.');
        return anMuc(adminId, id);
    },
};

// ---------- Câu luyện ngữ pháp (ngân hàng câu dùng chung) ----------

/** Kiểm một câu luyện người quản trị nhập (thuần). Trả câu đã chuẩn hoá hoặc chuỗi lỗi. */
function kiemCauLuyen(loai, f, lang = 'en') {
    const giaiThich = cat(f.giaiThich, 300);
    if (!giaiThich) return 'Cần lời giải thích.';
    if (loai === 'chon') {
        const de = cat(f.de, 240);
        const lua = String(f.lua || '').split('|').map((x) => x.trim()).filter(Boolean);
        const dapAn = cat(f.dapAn, 160);
        if (!de) return 'Cần đề bài.';
        if (lua.length !== 4 || new Set(lua).size !== 4) return 'Cần đúng 4 lựa chọn khác nhau, ngăn bằng dấu |.';
        if (!lua.includes(dapAn)) return 'Đáp án phải trùng nguyên văn một lựa chọn.';
        return { loai, de, lua, dapAn, giaiThich };
    }
    if (loai === 'sua') {
        const sai = cat(f.sai, 200);
        const dung = cat(f.dung, 200);
        const vi = cat(f.vi, 200);
        if (!dungNgonNgu(sai, lang) || !dungNgonNgu(dung, lang)) return 'Câu sai và câu đúng phải là câu ngoại ngữ (tiếng Trung phải có chữ Hán).';
        if (soSanh(sai, lang) === soSanh(dung, lang)) return 'Câu sai phải khác câu đúng.';
        if (!vi) return 'Cần nghĩa tiếng Việt.';
        return { loai, sai, dung, vi, giaiThich };
    }
    if (loai === 'dich') {
        const vi = cat(f.vi, 200);
        const dung = cat(f.dung, 200);
        if (!vi) return 'Cần câu tiếng Việt.';
        if (!dungNgonNgu(dung, lang)) return 'Câu đáp án phải là câu ngoại ngữ (tiếng Trung phải có chữ Hán).';
        return { loai, vi, dung, giaiThich };
    }
    return 'Dạng câu không hợp lệ.';
}

const TEN_DANG = { chon: 'Chọn', sua: 'Sửa câu', dich: 'Dịch' };
function tomTatCau(c) {
    if (c.loai === 'chon') return `${c.de} [${(c.lua || []).join(' | ')}] → ${c.dapAn}`;
    if (c.loai === 'sua') return `${c.sai} → ${c.dung}`;
    return `${c.vi} → ${c.dung}`;
}
const tachIdCau = (id) => {
    const m = /^(.{1,60})~(\d{1,4})$/.exec(String(id));
    return m ? { mucId: m[1], so: Number(m[2]) } : null;
};

const cauNguPhap = {
    key: 'cau-ngu-phap',
    nhom: 'Ngữ pháp',
    ten: 'Câu luyện ngữ pháp',
    moTa: 'Ngân hàng câu dùng chung cho Luyện từng công thức và Kiểm tra tổng hợp. Xoá là ẩn (vị trí câu được lượt đang làm trỏ tới), hiện lại được.',
    locLang: true, themDuoc: true, suaDuoc: true, xoa: 'an',
    cot: [{ key: 'chuDiem', ten: 'Chủ điểm' }, { key: 'dang', ten: 'Dạng' }, { key: 'noiDung', ten: 'Câu' }, { key: 'trangThai', ten: 'Trạng thái' }],
    async truong() {
        return [
            { key: 'mucId', ten: 'Chủ điểm', kieu: 'select', tuyChon: tuyChonChuDiem(await dsChuDiem()), chiKhiTao: true, batBuoc: true },
            { key: 'loai', ten: 'Dạng câu', kieu: 'select', tuyChon: Object.entries(TEN_DANG).map(([v, t]) => ({ v, t })), chiKhiTao: true, batBuoc: true },
            { key: 'de', ten: 'Đề (dạng Chọn, có ___ ở chỗ trống)', kieu: 'text', dang: ['chon'] },
            { key: 'lua', ten: '4 lựa chọn (dạng Chọn, ngăn bằng |)', kieu: 'text', dang: ['chon'], goiY: 'went | go | gone | going' },
            { key: 'dapAn', ten: 'Đáp án (dạng Chọn, trùng một lựa chọn)', kieu: 'text', dang: ['chon'] },
            { key: 'sai', ten: 'Câu sai (dạng Sửa câu)', kieu: 'text', dang: ['sua'] },
            { key: 'dung', ten: 'Câu đúng (Sửa câu / Dịch)', kieu: 'text', dang: ['sua', 'dich'] },
            { key: 'vi', ten: 'Nghĩa / câu tiếng Việt (Sửa câu / Dịch)', kieu: 'text', dang: ['sua', 'dich'] },
            { key: 'giaiThich', ten: 'Giải thích', kieu: 'textarea', batBuoc: true },
        ];
    },
    async ds({ q, lang, trang, mucId }) {
        const chuDiem = await dsChuDiem();
        const theoId = new Map(chuDiem.map((m) => [m.id, m]));
        const loc = mucId ? { mucId: String(mucId).slice(0, 60) } : {};
        const bo = await NguPhapBaiTap.find(loc).select('mucId cau').lean();
        const re = reTim(q);
        const ds = [];
        for (const b of bo) {
            const m = theoId.get(b.mucId);
            if (lang && (m?.lang || 'en') !== lang) continue;
            (b.cau || []).forEach((c, so) => {
                const noiDung = tomTatCau(c);
                if (re && !re.test(noiDung) && !re.test(m?.ten || '')) return;
                ds.push({
                    id: `${b.mucId}~${so}`,
                    an: !!c.an,
                    cot: { chuDiem: m?.ten || b.mucId, dang: TEN_DANG[c.loai] || c.loai, noiDung, trangThai: c.an ? 'Đang ẩn' : 'Đang dùng' },
                    giaTri: {
                        mucId: b.mucId, loai: c.loai, de: c.de || '', lua: (c.lua || []).join(' | '), dapAn: c.dapAn || '',
                        sai: c.sai || '', dung: c.dung || '', vi: c.vi || '', giaiThich: c.giaiThich || '',
                    },
                });
            });
        }
        return catTrang(ds, trang);
    },
    async tao(f) {
        const m = (await dsChuDiem()).find((x) => x.id === String(f.mucId || ''));
        if (!m) return loi('Chọn một chủ điểm có thật.');
        const c = kiemCauLuyen(String(f.loai || ''), f, m.lang);
        if (typeof c === 'string') return loi(c);
        await NguPhapBaiTap.findOneAndUpdate({ mucId: m.id }, { $push: { cau: c } }, { upsert: true, new: true });
        return { ok: true };
    },
    async capNhat(id, f) {
        const k = tachIdCau(id);
        if (!k) return loi('Id không hợp lệ.');
        const bo = await NguPhapBaiTap.findOne({ mucId: k.mucId }).lean();
        const cu = bo?.cau?.[k.so];
        if (!cu) return loi('Không tìm thấy câu.', 404);
        const m = (await dsChuDiem()).find((x) => x.id === k.mucId);
        const c = kiemCauLuyen(cu.loai, f, m?.lang || (String(k.mucId).startsWith('zh-') ? 'zh' : 'en'));
        if (typeof c === 'string') return loi(c);
        await NguPhapBaiTap.updateOne({ mucId: k.mucId }, { $set: { [`cau.${k.so}`]: { ...c, ...(cu.an ? { an: true } : {}) } } });
        return { id };
    },
    async datAn(id, an) {
        const k = tachIdCau(id);
        if (!k) return loi('Id không hợp lệ.');
        const r = await NguPhapBaiTap.updateOne({ mucId: k.mucId, [`cau.${k.so}`]: { $exists: true } }, { $set: { [`cau.${k.so}.an`]: !!an } });
        if (!(r?.matchedCount ?? r?.n)) return loi('Không tìm thấy câu.', 404);
        return { id, an: !!an };
    },
};

// ---------- Ví dụ AI thêm cho chủ điểm ----------

const tachIdViDu = (id) => {
    const m = /^([a-f0-9]{24})~(\d{1,3})$/i.exec(String(id));
    return m ? { docId: m[1], i: Number(m[2]) } : null;
};
const viDuNguPhap = {
    key: 'vi-du-ngu-phap',
    nhom: 'Ngữ pháp',
    ten: 'Ví dụ ngữ pháp AI thêm',
    moTa: 'Ví dụ người học bấm "AI thêm ví dụ" ở từng chủ điểm, dùng chung cho mọi người.',
    locLang: true, themDuoc: true, suaDuoc: true, xoa: 'xoa',
    cot: [{ key: 'chuDiem', ten: 'Chủ điểm' }, { key: 'en', ten: 'Câu' }, { key: 'vi', ten: 'Nghĩa' }],
    async truong() {
        return [
            { key: 'mucId', ten: 'Chủ điểm', kieu: 'select', tuyChon: tuyChonChuDiem(await dsChuDiem()), chiKhiTao: true, batBuoc: true },
            { key: 'en', ten: 'Câu ví dụ (ngoại ngữ)', kieu: 'text', batBuoc: true },
            { key: 'vi', ten: 'Nghĩa tiếng Việt', kieu: 'text', batBuoc: true },
        ];
    },
    async ds({ q, lang, trang }) {
        const docs = await NguPhapMuc.find({ 'viDuThem.0': { $exists: true } }).select('khoa lang noiDung.ten viDuThem').lean();
        const re = reTim(q);
        const ds = [];
        for (const d of docs) {
            const khoId = String(d.khoa).startsWith('kho:') ? String(d.khoa).slice(4) : '';
            const ten = khoId ? THEO_ID.get(khoId)?.ten || khoId : d.noiDung?.ten || '';
            const l = khoId ? THEO_ID.get(khoId)?.lang || 'en' : d.lang || 'en';
            if (lang && l !== lang) continue;
            (d.viDuThem || []).forEach((v, i) => {
                if (re && !re.test(`${v.en} ${v.vi} ${ten}`)) return;
                ds.push({ id: `${d._id}~${i}`, cot: { chuDiem: ten, en: v.en, vi: v.vi }, giaTri: { en: v.en, vi: v.vi } });
            });
        }
        return catTrang(ds, trang);
    },
    async tao(f) {
        const m = (await dsChuDiem()).find((x) => x.id === String(f.mucId || ''));
        if (!m) return loi('Chọn một chủ điểm có thật.');
        const [v] = chuanHoaViDu([{ en: f.en, vi: f.vi }], m.lang);
        if (!v) return loi('Câu ví dụ phải là câu ngoại ngữ (tiếng Trung phải có chữ Hán) và có nghĩa tiếng Việt.');
        const viDu = { en: v.en, vi: v.vi };
        if (THEO_ID.has(m.id)) {
            await NguPhapMuc.updateOne({ khoa: `kho:${m.id}` }, { $push: { viDuThem: viDu }, $setOnInsert: { lang: m.lang } }, { upsert: true });
        } else {
            await NguPhapMuc.updateOne({ _id: m.id }, { $push: { viDuThem: viDu } });
        }
        return { ok: true };
    },
    async capNhat(id, f) {
        const k = tachIdViDu(id);
        if (!k) return loi('Id không hợp lệ.');
        const d = await NguPhapMuc.findOne({ _id: k.docId }).select('khoa lang viDuThem').lean();
        if (!d?.viDuThem?.[k.i]) return loi('Không tìm thấy ví dụ.', 404);
        const khoId = String(d.khoa).startsWith('kho:') ? String(d.khoa).slice(4) : '';
        const [v] = chuanHoaViDu([{ en: f.en, vi: f.vi }], khoId ? THEO_ID.get(khoId)?.lang : d.lang);
        if (!v) return loi('Câu ví dụ phải là câu ngoại ngữ (tiếng Trung phải có chữ Hán) và có nghĩa tiếng Việt.');
        await NguPhapMuc.updateOne({ _id: k.docId }, { $set: { [`viDuThem.${k.i}`]: { en: v.en, vi: v.vi } } });
        return { id };
    },
    async xoaMuc(id) {
        const k = tachIdViDu(id);
        if (!k) return loi('Id không hợp lệ.');
        const d = await NguPhapMuc.findOne({ _id: k.docId }).select('viDuThem').lean();
        if (!d?.viDuThem?.[k.i]) return loi('Không tìm thấy ví dụ.', 404);
        const con = d.viDuThem.filter((_, i) => i !== k.i);
        await NguPhapMuc.updateOne({ _id: k.docId }, { $set: { viDuThem: con } });
        return { ok: true };
    },
};

// ---------- Cách gọi chủ điểm đã nhớ ----------

const cachGoi = {
    key: 'cach-goi',
    nhom: 'Ngữ pháp',
    ten: 'Cách gọi chủ điểm đã nhớ',
    moTa: 'Câu tra AI đã nhận ra là một chủ điểm có sẵn ("thể bị động" → Câu bị động). Lần sau tra ra ngay, không tốn AI. Sửa nếu trỏ nhầm chủ điểm.',
    locLang: true, themDuoc: false, suaDuoc: true, xoa: 'xoa',
    cot: [{ key: 'cauTra', ten: 'Câu tra' }, { key: 'lang', ten: 'NN' }, { key: 'troDen', ten: 'Trỏ tới chủ điểm' }, { key: 'luc', ten: 'Lúc', kieu: 'ngay' }],
    async truong() {
        return [{ key: 'troDen', ten: 'Trỏ tới chủ điểm', kieu: 'select', tuyChon: tuyChonChuDiem(await dsChuDiem()), batBuoc: true }];
    },
    async ds({ q, lang, trang }) {
        const loc = { troDen: { $ne: null }, ...(lang ? theoNgonNgu(lang) : {}) };
        if (q) loc.khoa = reTim(boDau(q));
        const [r, chuDiem] = await Promise.all([trangDb(NguPhapMuc, loc, { trang }), dsChuDiem()]);
        const ten = new Map(chuDiem.map((m) => [m.id, m.ten]));
        return { ...r, ds: r.docs.map((d) => ({ id: String(d._id), cot: { cauTra: boTienTo(d.khoa), lang: d.lang || 'en', troDen: ten.get(d.troDen) || `(đã mất) ${d.troDen}`, luc: ngay(d.createdAt) }, giaTri: { troDen: d.troDen } })) };
    },
    async capNhat(id, f) {
        if (!RE_OBJECT_ID.test(id)) return loi('Id không hợp lệ.');
        if (!(await dsChuDiem()).some((m) => m.id === String(f.troDen || ''))) return loi('Chọn một chủ điểm có thật.');
        const r = await NguPhapMuc.updateOne({ _id: id, troDen: { $ne: null } }, { $set: { troDen: String(f.troDen) } });
        if (!(r?.matchedCount ?? r?.n)) return loi('Không tìm thấy.', 404);
        return { id };
    },
    async xoaMuc(id) {
        if (!RE_OBJECT_ID.test(id)) return loi('Id không hợp lệ.');
        await NguPhapMuc.deleteOne({ _id: id, troDen: { $ne: null } });
        return { ok: true };
    },
};

// ---------- Bản nháp ngữ pháp ----------

const nhapNguPhap = {
    key: 'nhap-ngu-phap',
    nhom: 'Ngữ pháp',
    ten: 'Bản nháp chủ điểm (chờ người học thêm)',
    moTa: 'AI đã soạn nhưng người học chưa bấm thêm vào thư viện. Tự xoá sau 1 ngày.',
    locLang: true, themDuoc: false, suaDuoc: false, xoa: 'xoa',
    cot: [{ key: 'ten', ten: 'Chủ điểm' }, { key: 'lang', ten: 'NN' }, { key: 'cauTra', ten: 'Câu tra' }, { key: 'luc', ten: 'Lúc', kieu: 'ngay' }],
    truong: async () => TRUONG_MUC.filter((t) => t.key !== 'lang'),
    async ds({ q, lang, trang }) {
        const loc = lang ? theoNgonNgu(lang) : {};
        if (q) loc.khoa = reTim(boDau(q));
        const r = await trangDb(NguPhapNhap, loc, { trang, sort: { taoLuc: -1 } });
        return { ...r, ds: r.docs.map((d) => ({ id: String(d._id), cot: { ten: d.noiDung?.ten, lang: d.lang || 'en', cauTra: boTienTo(d.khoa), luc: ngay(d.taoLuc) }, giaTri: mucSangForm(d.noiDung) })) };
    },
    async xoaMuc(id) {
        if (!RE_OBJECT_ID.test(id)) return loi('Id không hợp lệ.');
        await NguPhapNhap.deleteOne({ _id: id });
        return { ok: true };
    },
};

// ---------- Câu ôn lỗi (kho câu mới cùng loại lỗi) ----------

const kiemCauOn = (f) => kiemCauMoi({ wrong: f.sai, error: f.chiSai, fix: f.sua, correct: f.dung, why: f.giaiThich });
const SAI_CAU_ON = 'Câu không hợp lệ: chỗ sai phải nằm đúng một lần trong câu sai, và thay chỗ sai bằng cách sửa phải ra đúng câu đúng.';

const cauOnLoi = {
    key: 'cau-on-loi',
    nhom: 'Ôn lỗi',
    ten: 'Câu ôn lỗi (cùng loại lỗi)',
    moTa: 'Câu mới AI sinh theo từng loại lỗi cho nấc "Áp dụng" của Ôn lỗi, dùng chung mọi người.',
    locLang: true, themDuoc: true, suaDuoc: true, xoa: 'xoa',
    cot: [{ key: 'loai', ten: 'Loại lỗi' }, { key: 'lang', ten: 'NN' }, { key: 'sai', ten: 'Câu sai' }, { key: 'dung', ten: 'Câu đúng' }],
    truong: async () => [
        { key: 'loai', ten: 'Loại lỗi', kieu: 'select', tuyChon: Object.keys(MO_TA_LOI).map((v) => ({ v, t: v })), batBuoc: true },
        { key: 'lang', ten: 'Ngôn ngữ', kieu: 'select', tuyChon: NGON_NGU, batBuoc: true },
        { key: 'sai', ten: 'Câu sai', kieu: 'text', batBuoc: true },
        { key: 'chiSai', ten: 'Đúng chỗ sai (chép nguyên văn từ câu sai)', kieu: 'text', batBuoc: true },
        { key: 'sua', ten: 'Chữ thay vào chỗ sai', kieu: 'text', batBuoc: true },
        { key: 'dung', ten: 'Câu đúng', kieu: 'text', batBuoc: true },
        { key: 'giaiThich', ten: 'Giải thích (tiếng Việt)', kieu: 'textarea' },
    ],
    async ds({ q, lang, trang }) {
        const loc = lang ? { lang } : {};
        if (q) loc.$or = [{ sai: reTim(q) }, { dung: reTim(q) }, { loai: reTim(q) }];
        const r = await trangDb(CauLuyenLoi, loc, { trang });
        return { ...r, ds: r.docs.map((d) => ({ id: String(d._id), cot: { loai: d.loai, lang: d.lang, sai: d.sai, dung: d.dung }, giaTri: { loai: d.loai, lang: d.lang, sai: d.sai, chiSai: d.chiSai, sua: d.sua, dung: d.dung, giaiThich: d.giaiThich } })) };
    },
    async tao(f) {
        if (!MO_TA_LOI[f.loai]) return loi('Chọn loại lỗi.');
        const c = kiemCauOn(f);
        if (!c) return loi(SAI_CAU_ON);
        const d = await CauLuyenLoi.create({ ...c, loai: f.loai, lang: langCua(f.lang) });
        return { id: String(d._id) };
    },
    async capNhat(id, f) {
        if (!RE_OBJECT_ID.test(id)) return loi('Id không hợp lệ.');
        if (!MO_TA_LOI[f.loai]) return loi('Chọn loại lỗi.');
        const c = kiemCauOn(f);
        if (!c) return loi(SAI_CAU_ON);
        const r = await CauLuyenLoi.updateOne({ _id: id }, { $set: { ...c, loai: f.loai, lang: langCua(f.lang) } });
        if (!(r?.matchedCount ?? r?.n)) return loi('Không tìm thấy.', 404);
        return { id };
    },
    async xoaMuc(id) {
        if (!RE_OBJECT_ID.test(id)) return loi('Id không hợp lệ.');
        await CauLuyenLoi.deleteOne({ _id: id });
        return { ok: true };
    },
};

// ---------- Vai AI hội thoại ----------

/** Chạy hàm kiểm của aiRoles (ném lỗi nhập) thành { loi } (thuần). */
function thu(fn) {
    try { return { gt: fn() }; } catch (e) { return { loi: e.message || 'Dữ liệu không hợp lệ.' }; }
}
const vaiAi = {
    key: 'vai-ai',
    nhom: 'Hội thoại',
    ten: 'Vai AI theo Part',
    moTa: 'Vai AI đóng trong Hội thoại, đã lưu cho từng Part và dùng chung. Vai mới nhất của Part là vai đang dùng. Vai người học tự viết là của riêng họ, không hiện ở đây.',
    locLang: true, themDuoc: true, suaDuoc: true, xoa: 'xoa',
    cot: [{ key: 'part', ten: 'Đề · Part' }, { key: 'lang', ten: 'NN' }, { key: 'title', ten: 'Tiêu đề' }, { key: 'text', ten: 'Mô tả vai' }, { key: 'luc', ten: 'Lúc', kieu: 'ngay' }],
    truong: async () => [
        { key: 'source', ten: 'Đề (source)', kieu: 'text', chiKhiTao: true, batBuoc: true },
        { key: 'part', ten: 'Part', kieu: 'text', chiKhiTao: true, batBuoc: true },
        { key: 'lang', ten: 'Ngôn ngữ', kieu: 'select', tuyChon: [...NGON_NGU, { v: 'bi', t: 'Song ngữ' }], chiKhiTao: true },
        { key: 'title', ten: 'Tiêu đề', kieu: 'text', batBuoc: true },
        { key: 'text', ten: 'Mô tả vai (đi vào prompt)', kieu: 'textarea', batBuoc: true },
    ],
    async ds({ q, lang, trang }) {
        const loc = { origin: 'ai', ...(lang ? { lang } : {}) };
        if (q) loc.$or = [{ title: reTim(q) }, { text: reTim(q) }, { source: reTim(q) }, { part: reTim(q) }];
        const r = await trangDb(AiRole, loc, { trang });
        return { ...r, ds: r.docs.map((d) => ({ id: String(d._id), cot: { part: `${d.source} · ${d.part}`, lang: d.lang, title: d.title, text: d.text, luc: ngay(d.createdAt) }, giaTri: { source: d.source, part: d.part, lang: d.lang, title: d.title, text: d.text } })) };
    },
    async tao(f) {
        const khoa = thu(() => chuanHoaKhoa(f));
        if (khoa.loi) return loi(khoa.loi);
        const text = thu(() => chuanHoaVaiText(f.text));
        if (text.loi) return loi(text.loi);
        const title = thu(() => chuanHoaTieuDe(f.title, text.gt));
        if (title.loi) return loi(title.loi);
        try {
            const d = await AiRole.create({ ...khoa.gt, origin: 'ai', ownerId: null, title: title.gt, text: text.gt, hash: hashVai(title.gt, text.gt) });
            return { id: String(d._id) };
        } catch (e) {
            if (e?.code === 11000) return loi('Part này đã có vai giống hệt.', 409);
            throw e;
        }
    },
    async capNhat(id, f) {
        if (!RE_OBJECT_ID.test(id)) return loi('Id không hợp lệ.');
        const text = thu(() => chuanHoaVaiText(f.text));
        if (text.loi) return loi(text.loi);
        const title = thu(() => chuanHoaTieuDe(f.title, text.gt));
        if (title.loi) return loi(title.loi);
        try {
            const r = await AiRole.updateOne({ _id: id, origin: 'ai' }, { $set: { title: title.gt, text: text.gt, hash: hashVai(title.gt, text.gt) } });
            if (!(r?.matchedCount ?? r?.n)) return loi('Không tìm thấy vai.', 404);
            return { id };
        } catch (e) {
            if (e?.code === 11000) return loi('Part này đã có vai giống hệt.', 409);
            throw e;
        }
    },
    async xoaMuc(id) {
        if (!RE_OBJECT_ID.test(id)) return loi('Id không hợp lệ.');
        await AiRole.deleteOne({ _id: id, origin: 'ai' });
        return { ok: true };
    },
};

// ---------- Gợi ý dạng bài theo Part ----------

const dangGoiY = {
    key: 'dang-goi-y',
    nhom: 'Dạng bài',
    ten: 'Gợi ý dạng bài theo Part',
    moTa: 'Dạng bài AI chọn là hợp với bộ từ của từng Part (nhóm "Hợp bộ từ này"). Tự làm mới sau 30 ngày; xoá để AI chọn lại ngay lần mở sau.',
    locLang: true, themDuoc: false, suaDuoc: true, xoa: 'xoa',
    cot: [{ key: 'mode', ten: 'Chế độ' }, { key: 'part', ten: 'Đề · Part' }, { key: 'lang', ten: 'NN' }, { key: 'keys', ten: 'Dạng gợi ý' }, { key: 'luc', ten: 'Lúc', kieu: 'ngay' }],
    truong: async () => [{ key: 'keys', ten: 'Mã dạng bài (mỗi dòng một mã)', kieu: 'dong', batBuoc: true }],
    async ds({ q, lang, trang }) {
        const loc = lang ? { lang } : {};
        if (q) loc.$or = [{ source: reTim(q) }, { part: reTim(q) }, { mode: reTim(q) }];
        const r = await trangDb(DangGoiY, loc, { trang });
        return { ...r, ds: r.docs.map((d) => ({ id: String(d._id), cot: { mode: d.mode, part: `${d.source} · ${d.part}${d.scope ? ' (bộ riêng)' : ''}`, lang: d.lang, keys: (d.keys || []).join(', '), luc: ngay(d.createdAt) }, giaTri: { keys: (d.keys || []).join('\n') } })) };
    },
    async capNhat(id, f) {
        if (!RE_OBJECT_ID.test(id)) return loi('Id không hợp lệ.');
        const keys = dong(f.keys).map((k) => k.slice(0, 60)).slice(0, 10);
        if (!keys.length) return loi('Cần ít nhất một mã dạng bài.');
        const r = await DangGoiY.updateOne({ _id: id }, { $set: { keys } });
        if (!(r?.matchedCount ?? r?.n)) return loi('Không tìm thấy.', 404);
        return { id };
    },
    async xoaMuc(id) {
        if (!RE_OBJECT_ID.test(id)) return loi('Id không hợp lệ.');
        await DangGoiY.deleteOne({ _id: id });
        return { ok: true };
    },
};

// ---------- Tổng kết tuần ----------

const tongKetTuan = {
    key: 'tong-ket-tuan',
    nhom: 'Tiến bộ',
    ten: 'Tổng kết tuần (của từng người học)',
    moTa: 'Lời tổng kết AI viết cho từng người, mỗi tuần một lần. Chỉ xem và xoá (xoá thì người đó bấm lại được để AI viết lại).',
    locLang: true, themDuoc: false, suaDuoc: false, xoa: 'xoa',
    cot: [{ key: 'nguoiHoc', ten: 'Người học' }, { key: 'tuan', ten: 'Tuần' }, { key: 'lang', ten: 'NN' }, { key: 'tomTat', ten: 'Tóm tắt' }],
    truong: async () => [
        { key: 'tomTat', ten: 'Tóm tắt', kieu: 'textarea' },
        { key: 'tienBo', ten: 'Tiến bộ', kieu: 'dong' },
        { key: 'canLuyen', ten: 'Cần luyện', kieu: 'dong' },
        { key: 'keHoach', ten: 'Kế hoạch', kieu: 'dong' },
    ],
    async ds({ q, lang, trang }) {
        const loc = lang ? { lang } : {};
        if (q) {
            const users = await User.find({ email: reTim(q) }).select('_id').limit(200).lean();
            loc.$or = [{ tomTat: reTim(q) }, { userId: { $in: users.map((u) => u._id) } }];
        }
        const r = await trangDb(TongKetTuan, loc, { trang, sort: { tuan: -1, createdAt: -1 } });
        const users = await User.find({ _id: { $in: r.docs.map((d) => d.userId) } }).select('email username').lean();
        const ten = new Map(users.map((u) => [String(u._id), u.email || u.username || '']));
        return {
            ...r,
            ds: r.docs.map((d) => ({
                id: String(d._id),
                cot: { nguoiHoc: ten.get(String(d.userId)) || String(d.userId), tuan: d.tuan, lang: d.lang, tomTat: d.tomTat },
                giaTri: { tomTat: d.tomTat, tienBo: (d.tienBo || []).join('\n'), canLuyen: (d.canLuyen || []).join('\n'), keHoach: (d.keHoach || []).map((k) => k.viec).join('\n') },
            })),
        };
    },
    async xoaMuc(id) {
        if (!RE_OBJECT_ID.test(id)) return loi('Id không hợp lệ.');
        await TongKetTuan.deleteOne({ _id: id });
        return { ok: true };
    },
};

const LOAI = [mucNguPhap, cauNguPhap, viDuNguPhap, cachGoi, nhapNguPhap, cauOnLoi, vaiAi, dangGoiY, tongKetTuan];
const THEO_KEY = new Map(LOAI.map((l) => [l.key, l]));

/** Danh sách loại cho giao diện (không gồm ô nhập, vì ô nhập có thể cần đọc DB). */
function danhSachLoai() {
    return LOAI.map(({ key, nhom, ten, moTa, locLang, themDuoc, suaDuoc, xoa, cot }) => ({ key, nhom, ten, moTa, locLang, themDuoc, suaDuoc, xoa, cot }));
}

/** Chạy một thao tác trên một loại; loại không có thao tác đó thì từ chối. */
async function lam(key, viec, ...args) {
    const l = THEO_KEY.get(key);
    if (!l) return loi('Không có loại nội dung này.', 404);
    if (viec === 'truong') return { truong: await l.truong() };
    if (viec === 'ds') {
        const [opts] = args;
        return l.ds({ q: cat(opts?.q, 80), lang: opts?.lang === 'en' || opts?.lang === 'zh' ? opts.lang : '', trang: opts?.trang, mucId: opts?.mucId });
    }
    if (viec === 'tao' && !(l.themDuoc && l.tao)) return loi('Loại này không thêm tay được.', 405);
    if (viec === 'capNhat' && !(l.suaDuoc && l.capNhat)) return loi('Loại này không sửa được.', 405);
    if (viec === 'xoaMuc' && !l.xoaMuc) return loi('Loại này không xoá được, chỉ ẩn.', 405);
    if (viec === 'datAn' && !l.datAn) return loi('Loại này không ẩn được.', 405);
    if (!l[viec]) return loi('Thao tác không hợp lệ.', 400);
    return l[viec](...args);
}

module.exports = { danhSachLoai, lam, kiemCauLuyen, formSangMuc, mucSangForm, catTrang, LOAI, MOI_TRANG };
