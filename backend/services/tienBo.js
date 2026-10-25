/**
 * "Tiến bộ của tôi" — HỒ SƠ NĂNG LỰC gom từ mọi chế độ, theo dõi qua các tuần.
 *
 * Mỗi chế độ đã lưu kết quả riêng (lượt luyện, bài đọc, phiên nghe, hội thoại có
 * chấm, bài viết, bài dịch), nhưng chưa nơi nào ghép lại để trả lời câu người học
 * thật sự muốn biết: "tôi có đang tiến bộ không, và chỗ nào chưa?". Xem lịch sử
 * từng chế độ thì chỉ thấy từng bài, không thấy xu hướng.
 *
 * KHÔNG gọi AI và KHÔNG lưu thêm gì: mọi con số tính lại từ dữ liệu sẵn có mỗi lần
 * mở. Cùng dữ liệu luôn ra cùng kết quả — và đây là nền để về sau AI dùng điểm
 * yếu (`diemYeu`) khi ra bài, thay vì đoán lại từ đầu mỗi phiên.
 *
 * Nguyên tắc chống nhiễu (điểm AI chấm dao động giữa các lượt):
 *   · Chỉ nói "tiến bộ / đi xuống" khi CẢ HAI nửa (4 tuần trước – 4 tuần gần đây)
 *     đủ số lượt, và chênh lệch vượt ngưỡng của thang điểm đó.
 *   · Lỗi ngữ pháp tính theo LỖI/BÀI, không phải tổng số: viết nhiều bài hơn thì
 *     tổng lỗi tăng dù đang viết tốt lên.
 */
const PracticeSession = require('../models/PracticeSession');
const Conversation = require('../models/Conversation');
const ListeningSession = require('../models/ListeningSession');
const ReadingAttempt = require('../models/ReadingAttempt');
const Essay = require('../models/Essay');
const Translation = require('../models/Translation');
const WrongWord = require('../models/WrongWord');
const UserProfile = require('../models/UserProfile');
const { homNayVN } = require('./loTrinh');
const { thongKe, chuanHoaLoai } = require('./errorTaxonomy');

/** Số tuần theo dõi. Chia đôi để so sánh: 4 tuần trước với 4 tuần gần đây. */
const SO_TUAN = 8;
const NUA = SO_TUAN / 2;
const MOT_NGAY = 24 * 60 * 60 * 1000;

/** Mỗi nửa cần ít nhất chừng này lượt mới tin được xu hướng. */
const TOI_THIEU_LUOT_NUA = 2;

/** Một nhóm lỗi phải xuất hiện từ chừng này lần mới tính là điểm yếu. */
const TOI_THIEU_LOI = 3;

/**
 * Các kỹ năng theo dõi. `nguong` = chênh lệch tối thiểu để gọi là đổi thật, theo
 * thang của kỹ năng đó: 5 điểm % với tỉ lệ đúng, nửa band với thang 0–9.
 */
const KY_NANG = [
    { key: 'tu-vung', ten: 'Từ vựng', icon: 'fa-layer-group', donVi: '%', nguong: 5, nguon: 'Các chế độ luyện từ' },
    { key: 'nghe', ten: 'Nghe', icon: 'fa-headphones', donVi: '%', nguong: 5, nguon: 'Nghe và chép lại' },
    { key: 'doc', ten: 'Đọc hiểu', icon: 'fa-book-open-reader', donVi: '%', nguong: 5, nguon: 'Đọc hiểu' },
    { key: 'noi', ten: 'Nói', icon: 'fa-comments', donVi: '/9', nguong: 0.5, nguon: 'Chat và Hội thoại có chấm' },
    { key: 'viet', ten: 'Viết', icon: 'fa-pen-nib', donVi: '/9', nguong: 0.5, nguon: 'Luyện viết' },
    { key: 'dich', ten: 'Dịch', icon: 'fa-language', donVi: '/9', nguong: 0.5, nguon: 'Dịch đoạn văn' },
];

/**
 * Vị trí tuần của một mốc thời gian: 0 = tuần cũ nhất, SO_TUAN-1 = 7 ngày gần nhất
 * (tính cả hôm nay, theo giờ VN). Ngoài khoảng → -1.
 */
function tuanCua(date, soNgayHomNay) {
    if (!date) return -1;
    const soNgay = homNayVN(new Date(date)).soNgay;
    const cach = soNgayHomNay - soNgay;
    if (cach < 0) return -1;
    const i = SO_TUAN - 1 - Math.floor(cach / 7);
    return i >= 0 ? i : -1;
}

/** Nhãn ngày bắt đầu mỗi tuần, 'dd/mm'. */
function nhanTuan(soNgayHomNay) {
    return Array.from({ length: SO_TUAN }, (_, i) => {
        const dau = soNgayHomNay - (SO_TUAN - 1 - i) * 7 - 6;
        const d = new Date(dau * MOT_NGAY);
        return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
}

const lamTron = (x, buoc) => Math.round(x / buoc) * buoc;

/**
 * Dựng chuỗi điểm theo tuần cho một kỹ năng từ các lượt `{at, tu, mau}`.
 *
 * Điểm tuần = tổng `tu` / tổng `mau` — với tỉ lệ đúng đó là tổng câu đúng / tổng
 * câu (lượt 20 câu nặng hơn lượt 5 câu); với điểm band thì `mau = 1` mỗi lượt.
 * `heSo` đổi về thang hiển thị (100 với tỉ lệ, 1 với band).
 */
function chuoiTuan(luot, soNgayHomNay, { heSo, buoc }) {
    const tuan = Array.from({ length: SO_TUAN }, () => ({ tu: 0, mau: 0, n: 0 }));
    for (const l of luot) {
        const i = tuanCua(l.at, soNgayHomNay);
        if (i < 0 || !(l.mau > 0)) continue;
        tuan[i].tu += l.tu;
        tuan[i].mau += l.mau;
        tuan[i].n += 1;
    }
    const diem = tuan.map((t) => (t.mau > 0 ? lamTron((t.tu / t.mau) * heSo, buoc) : null));
    const gop = (a, b) => {
        const phan = tuan.slice(a, b);
        const mau = phan.reduce((s, t) => s + t.mau, 0);
        const n = phan.reduce((s, t) => s + t.n, 0);
        return { gt: mau > 0 ? lamTron((phan.reduce((s, t) => s + t.tu, 0) / mau) * heSo, buoc) : null, n };
    };
    return { diem, truoc: gop(0, NUA), ganDay: gop(NUA, SO_TUAN), soLuot: tuan.reduce((s, t) => s + t.n, 0) };
}

/**
 * So hai nửa. Trả 'len' / 'xuong' / 'ngang', hoặc null khi chưa đủ dữ liệu —
 * "chưa biết" khác hẳn "không đổi", và nói nhầm là "không tiến bộ" thì nản.
 */
function xuHuong(truoc, ganDay, nguong) {
    if (truoc.gt === null || ganDay.gt === null) return null;
    if (truoc.n < TOI_THIEU_LUOT_NUA || ganDay.n < TOI_THIEU_LUOT_NUA) return null;
    const lech = ganDay.gt - truoc.gt;
    if (lech >= nguong) return 'len';
    if (lech <= -nguong) return 'xuong';
    return 'ngang';
}

/**
 * Lỗi ngữ pháp theo nhóm, so tỉ lệ lỗi/bài giữa hai nửa.
 *
 * Bỏ nhóm "Khác" (không dạy được gì) và nhóm dưới `TOI_THIEU_LOI` lần (một lần sai
 * có thể là AI chấm nhầm, chưa phải thói quen).
 */
function phanTichNguPhap(bai, soNgayHomNay) {
    const soBai = { truoc: 0, ganDay: 0 };
    const loi = [];
    for (const b of bai) {
        const i = tuanCua(b.at, soNgayHomNay);
        if (i < 0) continue;
        const nua = i < NUA ? 'truoc' : 'ganDay';
        soBai[nua] += 1;
        for (const it of b.loi) loi.push({ ...it, nua });
    }
    return thongKe(loi)
        .filter((s) => s.key !== 'other' && s.count >= TOI_THIEU_LOI)
        .slice(0, 5)
        .map((s) => {
            const cua = loi.filter((x) => chuanHoaLoai(x.loai ?? x.type) === s.key);
            const dem = (nua) => cua.filter((x) => x.nua === nua).length;
            const tiLe = (nua) => (soBai[nua] > 0 ? Math.round((dem(nua) / soBai[nua]) * 10) / 10 : null);
            const truoc = tiLe('truoc');
            const ganDay = tiLe('ganDay');
            let xh = null;
            if (soBai.truoc >= TOI_THIEU_LUOT_NUA && soBai.ganDay >= TOI_THIEU_LUOT_NUA) {
                // Ít lỗi hơn là TỐT: 'giam' thay vì 'xuong' để client không nhầm chiều màu.
                const lech = ganDay - truoc;
                xh = lech <= -0.3 ? 'giam' : lech >= 0.3 ? 'tang' : 'ngang';
            }
            return { key: s.key, vi: s.vi, hint: s.hint, count: s.count, truoc, ganDay, xuHuong: xh };
        });
}

/**
 * Điểm từng tiêu chí Nói: trung bình nửa trước và nửa gần đây. Tiêu chí lấy theo
 * nhãn (bộ chấm Giao tiếp / TOEIC / IELTS có khoá khác nhau).
 */
function phanTichTieuChiNoi(phien, soNgayHomNay) {
    const gom = new Map();
    for (const p of phien) {
        const i = tuanCua(p.at, soNgayHomNay);
        if (i < 0) continue;
        const nua = i < NUA ? 'truoc' : 'ganDay';
        for (const c of p.criteria || []) {
            if (!c?.label || !Number.isFinite(c.score)) continue;
            const g = gom.get(c.label) || { truoc: [], ganDay: [] };
            g[nua].push(c.score);
            gom.set(c.label, g);
        }
    }
    const tb = (a) => (a.length ? Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 10) / 10 : null);
    return [...gom.entries()]
        .map(([label, g]) => ({ label, truoc: tb(g.truoc), ganDay: tb(g.ganDay), soLuot: g.truoc.length + g.ganDay.length }))
        .sort((a, b) => b.soLuot - a.soLuot)
        .slice(0, 6);
}

const dinhDang = (gt, donVi) => (donVi === '%' ? `${gt}%` : `${gt}/9`);

/**
 * Vài câu nhận xét rút ra từ số liệu — viết bằng luật, không phải AI, nên không bao
 * giờ khen một thứ số liệu không cho thấy.
 */
function nhanXet({ kyNang, nguPhap, tuVung }) {
    const tot = [];
    const canLuyen = [];
    for (const k of kyNang) {
        if (k.xuHuong === 'len') tot.push(`${k.ten} tiến bộ: ${dinhDang(k.truoc, k.donVi)} → ${dinhDang(k.ganDay, k.donVi)}`);
        if (k.xuHuong === 'xuong') canLuyen.push(`${k.ten} đi xuống: ${dinhDang(k.truoc, k.donVi)} → ${dinhDang(k.ganDay, k.donVi)}`);
    }
    for (const g of nguPhap) {
        if (g.xuHuong === 'giam') tot.push(`Ít lỗi ${g.vi.toLowerCase()} hơn: ${g.truoc} → ${g.ganDay} lỗi/bài`);
        if (g.xuHuong === 'tang') canLuyen.push(`Lỗi ${g.vi.toLowerCase()} tăng: ${g.truoc} → ${g.ganDay} lỗi/bài`);
    }
    if (tuVung.moiThuoc > 0) tot.push(`Đã thuộc thêm ${tuVung.moiThuoc} từ từng sai trong 7 ngày qua`);
    if (tuVung.denHan > 0) canLuyen.push(`${tuVung.denHan} từ sai đến hạn ôn`);
    // Kỹ năng chưa chạm tới trong 4 tuần gần đây: nhắc nhẹ, chỉ một cái cho đỡ dồn.
    const boQua = kyNang.find((k) => k.truoc !== null && k.ganDay === null);
    if (boQua) canLuyen.push(`${boQua.ten}: chưa luyện lại trong 4 tuần gần đây`);
    return { tot: tot.slice(0, 4), canLuyen: canLuyen.slice(0, 4) };
}

/**
 * Điểm yếu hàng đầu, gọn để đưa vào prompt AI về sau (tầng 2): tối đa 3 mục, mạnh
 * nhất trước. Chỉ gồm thứ có đủ bằng chứng.
 */
function diemYeu({ kyNang, nguPhap }) {
    const out = nguPhap.slice(0, 2).map((g) => ({ loai: 'ngu-phap', key: g.key, vi: g.vi }));
    const yeuNhat = kyNang
        .filter((k) => k.ganDay !== null && k.donVi === '%' && k.ganDay < 70)
        .sort((a, b) => a.ganDay - b.ganDay)[0];
    if (yeuNhat) out.push({ loai: 'ky-nang', key: yeuNhat.key, vi: yeuNhat.ten });
    return out.slice(0, 3);
}

/**
 * Dựng hồ sơ từ dữ liệu thô (thuần — test được không cần DB).
 *
 * @param {object} du  các mảng lượt đã chuẩn hoá + số đếm từ vựng
 */
function dungTienBo(du, { soNgay }) {
    const tyLe = { heSo: 100, buoc: 1 };
    const band = { heSo: 1, buoc: 0.1 };
    const luotTheo = {
        'tu-vung': [du.luyenTu || [], tyLe],
        nghe: [du.nghe || [], tyLe],
        doc: [du.doc || [], tyLe],
        noi: [(du.noi || []).map((p) => ({ at: p.at, tu: p.overall, mau: 1 })), band],
        viet: [(du.viet || []).map((b) => ({ at: b.at, tu: b.overall, mau: 1 })), band],
        dich: [(du.dich || []).map((b) => ({ at: b.at, tu: b.overall, mau: 1 })), band],
    };

    const kyNang = KY_NANG.map((k) => {
        const [luot, thang] = luotTheo[k.key];
        const c = chuoiTuan(luot.filter((l) => Number.isFinite(l.tu) && Number.isFinite(l.mau)), soNgay, thang);
        // Làm tròn lại sau phép trừ số thực (0.1 + 0.2 …) để hiển thị sạch.
        const r = (x) => (x === null ? null : Math.round(x * 10) / 10);
        return {
            key: k.key,
            ten: k.ten,
            icon: k.icon,
            donVi: k.donVi,
            nguon: k.nguon,
            diem: c.diem.map(r),
            truoc: r(c.truoc.gt),
            ganDay: r(c.ganDay.gt),
            soLuot: c.soLuot,
            xuHuong: xuHuong(c.truoc, c.ganDay, k.nguong),
        };
    });

    const nguPhap = phanTichNguPhap([...(du.viet || []), ...(du.dich || [])], soNgay);
    const tuVung = {
        dangOn: du.tuDangOn || 0,
        denHan: du.tuDenHan || 0,
        daThuoc: du.tuDaThuoc || 0,
        moiThuoc: du.tuMoiThuoc || 0,
    };

    return {
        soTuan: SO_TUAN,
        tuan: nhanTuan(soNgay),
        kyNang,
        nguPhap,
        tieuChiNoi: phanTichTieuChiNoi(du.noi || [], soNgay),
        tuVung,
        nhanXet: nhanXet({ kyNang, nguPhap, tuVung }),
        diemYeu: diemYeu({ kyNang, nguPhap }),
        coDuLieu: kyNang.some((k) => k.soLuot > 0),
    };
}

async function layTienBo(userId, now = new Date()) {
    const { soNgay } = homNayVN(now);
    // Từ 00:00 (giờ VN) của ngày đầu tuần cũ nhất.
    const tu = new Date((soNgay - (SO_TUAN * 7 - 1)) * MOT_NGAY - 7 * 60 * 60 * 1000);
    const profile = await UserProfile.findOne({ userId }).select('settings').lean();
    const lang = profile?.settings?.vocabLang === 'zh' ? 'zh' : 'en';
    // Hồ sơ của NGÔN NGỮ đang học: lỗi ngữ pháp tiếng Anh và điểm HSK trộn chung
    // thì xu hướng vô nghĩa. Lượt luyện từ không lưu ngôn ngữ nên lấy hết.
    const theoLang = lang === 'zh' ? { lang: 'zh' } : { lang: { $ne: 'zh' } };

    const [luyen, nghe, doc, noi, viet, dich, tuDangOn, tuDenHan, tuDaThuoc, tuMoiThuoc] = await Promise.all([
        PracticeSession.find({ user: userId, completedAt: { $gte: tu } })
            .select('questionsCount correctAnswers completedAt').lean(),
        ListeningSession.find({ userId, status: 'done', updatedAt: { $gte: tu }, ...theoLang })
            .select('score updatedAt').lean(),
        ReadingAttempt.find({ userId, createdAt: { $gte: tu }, ...theoLang })
            .select('correct total createdAt').lean(),
        Conversation.find({ userId, status: 'done', updatedAt: { $gte: tu }, feedback: { $ne: null }, ...theoLang })
            .select('feedback.overall feedback.criteria updatedAt').lean(),
        Essay.find({ userId, createdAt: { $gte: tu }, ...theoLang })
            .select('overall issues createdAt').lean(),
        Translation.find({ userId, createdAt: { $gte: tu }, ...theoLang })
            .select('overall notes createdAt').lean(),
        WrongWord.countDocuments({ userId, status: 'active', ...WrongWord.langFilter(lang) }),
        WrongWord.countDocuments({
            userId, status: 'active', nextReviewDate: { $lte: now }, ...WrongWord.langFilter(lang),
        }),
        WrongWord.countDocuments({ userId, status: 'mastered', ...WrongWord.langFilter(lang) }),
        WrongWord.countDocuments({
            userId, status: 'mastered', updatedAt: { $gte: new Date(now - 7 * MOT_NGAY) }, ...WrongWord.langFilter(lang),
        }),
    ]);

    return dungTienBo({
        luyenTu: luyen.map((p) => ({ at: p.completedAt, tu: p.correctAnswers || 0, mau: p.questionsCount || 0 })),
        nghe: nghe.map((p) => ({ at: p.updatedAt, tu: p.score || 0, mau: 100 })),
        doc: doc.map((p) => ({ at: p.createdAt, tu: p.correct || 0, mau: p.total || 0 })),
        noi: noi
            .filter((p) => Number.isFinite(p.feedback?.overall))
            .map((p) => ({ at: p.updatedAt, overall: p.feedback.overall, criteria: p.feedback.criteria })),
        viet: viet.map((b) => ({ at: b.createdAt, overall: b.overall, loi: b.issues || [] })),
        dich: dich.map((b) => ({ at: b.createdAt, overall: b.overall, loi: b.notes || [] })),
        tuDangOn, tuDenHan, tuDaThuoc, tuMoiThuoc,
    }, { soNgay });
}

module.exports = { layTienBo, dungTienBo, tuanCua, xuHuong, SO_TUAN, KY_NANG };
