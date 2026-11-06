/**
 * TEST ĐẦU VÀO cho mục tiêu Giao tiếp — 15 câu, khoảng 8 phút.
 *
 * Mỗi khung câu hỏi theo 3 mức tạo ra câu: chọn đáp án → tự gõ → nói. So ba kết quả mới
 * chẩn đoán được NGUYÊN NHÂN: chưa biết quy tắc, biết nhưng chưa tự dựng được câu, hay
 * dựng được nhưng chưa nói kịp — mỗi nguyên nhân cần một cách luyện khác nhau.
 *
 * Độ khó đổi theo từng kỹ năng: câu trước đúng thì câu sau khó hơn, sai thì câu dễ.
 */
const BuoiKiemTra = require('../models/BuoiKiemTra');
const HoSoHocVien = require('../models/HoSoHocVien');
const UserProfile = require('../models/UserProfile');
const { KHUNG, THEO_ID } = require('./phanXaKho');
const { khopKho, aiCham } = require('./phanXa');
const { TEN_KY_NANG, ghiKetQua, layHoSo, tomTatKyNang, tongQuanTrinhDo } = require('./hoSoHoc');
const { homNayVN } = require('./loTrinh');

/** Test có câu chấm bằng AI nên giới hạn số lần mở mỗi ngày. */
const TOI_DA_MOI_NGAY = 3;

/** Đáp án đúng luôn là `lua[0]`; server trộn thứ tự trước khi gửi. */
const TRAC_NGHIEM = {
    'mau-giao-tiep': {
        1: [
            { id: 'gt-t1', hoi: 'Bạn muốn hỏi giá một món đồ. Câu nào tự nhiên nhất?', lua: ['How much is this?', 'How many money this?', 'This is how much money?', 'What price this is?'] },
            { id: 'gt-t2', hoi: 'Bạn của bạn nói "Thank you!". Bạn đáp:', lua: ["You're welcome.", 'Yes, thank.', 'It is nothing thing.', 'Welcome you.'] },
        ],
        2: [
            { id: 'gt-t3', hoi: 'Gọi đồ uống một cách lịch sự:', lua: ["I'd like a coffee, please.", 'I want coffee give me.', 'Give me coffee now.', 'Me a coffee, please.'] },
            { id: 'gt-t4', hoi: 'Bạn không nghe rõ và muốn nhờ nói lại:', lua: ['Could you say that again, please?', 'You say again?', 'Can you again say?', 'Please again talk.'] },
        ],
    },
    'khung-cau': {
        1: [
            { id: 'kc-t1', hoi: 'Chọn câu đúng: "Tôi rất vui."', lua: ['I am very happy.', 'I very happy.', 'I am very happily.', 'Very happy I.'] },
            { id: 'kc-t2', hoi: 'Chọn câu đúng: "Ở đây có nhiều người."', lua: ['There are many people here.', 'Here have many people.', 'It has many peoples here.', 'Have many people here.'] },
        ],
        2: [
            { id: 'kc-t3', hoi: 'Chọn câu đúng: "Phòng gym rất lớn và có nhiều máy."', lua: ['The gym is very big and has many machines.', 'The gym very big have many machines.', 'The gym is very big have many machine.', 'It is very big have many machines.'] },
            { id: 'kc-t4', hoi: 'Chọn câu đúng: "Tôi đã thấy họ nói chuyện."', lua: ['I saw them talking.', 'I see they talk.', 'I saw they are talking.', 'I seen them talk.'] },
        ],
    },
    'qua-khu': {
        1: [
            { id: 'qk-t1', hoi: 'Chọn câu đúng: "Hôm qua tôi đi ngân hàng."', lua: ['I went to the bank yesterday.', 'I go to the bank yesterday.', 'I am go to the bank yesterday.', 'I goed to the bank yesterday.'] },
            { id: 'qk-t2', hoi: 'Điền từ: "We ___ last week." (Chúng tôi đã gặp nhau tuần trước.)', lua: ['met', 'meet', 'meeting', 'meets'] },
        ],
        2: [
            { id: 'qk-t3', hoi: 'Chọn câu đúng: "Tôi đã không ngủ đủ."', lua: ["I didn't sleep enough.", "I didn't slept enough.", 'I not sleep enough.', "I don't slept enough."] },
            { id: 'qk-t4', hoi: 'Chọn câu đúng: "Bạn đã đi đâu?"', lua: ['Where did you go?', 'Where did you went?', 'Where you went?', 'Where do you went?'] },
        ],
    },
    'tell-say-talk': {
        1: [
            { id: 'ts-t1', hoi: 'Điền từ: "She ___ me to wait."', lua: ['told', 'said', 'talked', 'spoke'] },
            { id: 'ts-t2', hoi: 'Điền từ: "He ___ goodbye and left."', lua: ['said', 'told', 'talked', 'spoke'] },
        ],
        2: [
            { id: 'ts-t3', hoi: 'Điền từ: "I want to ___ the manager."', lua: ['talk to', 'say', 'talk', 'say to'] },
            { id: 'ts-t4', hoi: 'Điền từ: "What did she ___ to you?"', lua: ['say', 'tell', 'talk', 'speak'] },
        ],
    },
};

const NGHE = {
    1: [
        { id: 'ng1', doc: 'How much is this?', hoi: 'Bạn vừa nghe câu nào?', lua: ['Cái này bao nhiêu tiền?', 'Cái này là gì?', 'Cái này của ai?', 'Cái này ở đâu?'] },
        { id: 'ng2', doc: 'See you next week.', hoi: 'Bạn vừa nghe câu nào?', lua: ['Hẹn gặp lại tuần sau.', 'Tuần trước tôi đã gặp bạn.', 'Tuần sau tôi bận.', 'Hôm nay tôi muốn gặp bạn.'] },
        { id: 'ng3', doc: 'I need to go to the bank.', hoi: 'Bạn vừa nghe câu nào?', lua: ['Tôi cần đi ngân hàng.', 'Tôi vừa đi ngân hàng về.', 'Ngân hàng ở gần đây.', 'Tôi làm việc ở ngân hàng.'] },
    ],
    2: [
        { id: 'ng4', doc: 'She told me to check the contract.', hoi: 'Bạn vừa nghe câu nào?', lua: ['Cô ấy bảo tôi kiểm tra hợp đồng.', 'Tôi bảo cô ấy kiểm tra hợp đồng.', 'Cô ấy đã kiểm tra hợp đồng giúp tôi.', 'Cô ấy nói hợp đồng đã được kiểm tra.'] },
        { id: 'ng5', doc: "I didn't sleep enough last night.", hoi: 'Bạn vừa nghe câu nào?', lua: ['Tối qua tôi không ngủ đủ.', 'Tối nay tôi sẽ ngủ đủ.', 'Tối qua tôi ngủ rất ngon.', 'Tối nay tôi không muốn ngủ.'] },
        { id: 'ng6', doc: 'Can you tell me how to get to the station?', hoi: 'Bạn vừa nghe câu nào?', lua: ['Bạn chỉ tôi đường đến nhà ga được không?', 'Bạn có đến nhà ga không?', 'Nhà ga có gần đây không?', 'Bạn đang ở nhà ga phải không?'] },
    ],
};

/** Câu tự tạo (gõ/nói) lấy từ kho Phản xạ, chia hai mức theo độ dài và độ khó cấu trúc. */
const CAU_THEO_MUC = {
    'mau-giao-tiep': { 1: ['gt3', 'gt4', 'gt11'], 2: ['gt5', 'gt8', 'gt2'] },
    'khung-cau': { 1: ['kc4', 'kc10', 'kc11'], 2: ['kc2', 'kc3', 'kc6', 'kc7'] },
    'qua-khu': { 1: ['qk1', 'qk5', 'qk7'], 2: ['qk8', 'qk10', 'qk12'] },
    'tell-say-talk': { 1: ['ts3', 'ts4', 'ts12'], 2: ['ts1', 'ts2', 'ts7'] },
};

const KE_HOACH = [
    ...['mau-giao-tiep', 'khung-cau', 'qua-khu', 'tell-say-talk'].flatMap((kyNang) => (
        ['trac-nghiem', 'go', 'noi'].map((loai) => ({ kyNang, loai }))
    )),
    ...[1, 2, 3].map(() => ({ kyNang: 'nghe', loai: 'nghe' })),
];

const NGAU_NHIEN = (a) => a[Math.floor(Math.random() * a.length)];
const tron = (a) => [...a].sort(() => Math.random() - 0.5);

/** Mức của câu kế tiếp trong cùng kỹ năng (thuần). */
function mucTiep(daLam, kyNang) {
    const cu = daLam.filter((c) => c.kyNang === kyNang).pop();
    if (!cu) return 1;
    if (cu.khongChac) return cu.muc;
    return cu.dung ? 2 : 1;
}

/** Chọn câu thứ `i` theo kế hoạch (thuần; `chon` thay được trong test). */
function chonCauTest(i, daLam, coMic, chon = NGAU_NHIEN) {
    const { kyNang, loai: loaiGoc } = KE_HOACH[i];
    // Không có micro thì đổi sang gõ; kỹ năng Nói sẽ ghi là chưa đủ dữ liệu, không đoán.
    const loai = loaiGoc === 'noi' && !coMic ? 'go' : loaiGoc;
    const muc = mucTiep(daLam, kyNang);
    const daDung = new Set(daLam.map((c) => c.id));
    const conLai = (ds) => ds.filter((x) => !daDung.has(x.id ?? x));

    let ds;
    if (loai === 'trac-nghiem') ds = TRAC_NGHIEM[kyNang];
    else if (loai === 'nghe') ds = NGHE;
    else ds = CAU_THEO_MUC[kyNang];
    // Hết câu ở mức cần thì lấy mức kia, không để test đứt giữa chừng.
    const mau = conLai(ds[muc]).length ? ds[muc] : ds[muc === 1 ? 2 : 1];
    const x = chon(conLai(mau));
    return { id: x.id ?? x, kyNang, loai, muc };
}

function timCauTracNghiem(q) {
    const nguon = q.loai === 'nghe' ? Object.values(NGHE) : Object.values(TRAC_NGHIEM[q.kyNang]);
    return nguon.flat().find((x) => x.id === q.id);
}

/** Phần gửi client: không có đáp án và không đánh dấu thứ tự đúng. */
function congKhai(q, i) {
    const chung = { i, tong: KE_HOACH.length, loai: q.loai, kyNang: q.kyNang, tenKyNang: TEN_KY_NANG.get(q.kyNang) };
    if (q.loai === 'go' || q.loai === 'noi') return { ...chung, vi: THEO_ID.get(q.id).vi };
    const x = timCauTracNghiem(q);
    return { ...chung, hoi: x.hoi, lua: tron(x.lua), ...(x.doc ? { doc: x.doc } : {}) };
}

const CHAN_DOAN_KHUNG = {
    vung: { nhan: 'Đã khá chắc', viec: 'Giữ nhịp bằng các câu khó hơn.' },
    'chua-noi-kip': { nhan: 'Biết cách viết nhưng chưa nói kịp', viec: 'Luyện Phản xạ câu bằng giọng nói để biến kiến thức thành phản xạ.' },
    'chua-tu-dung': { nhan: 'Nhận ra câu đúng nhưng chưa tự dựng được', viec: 'Luyện Phản xạ câu: tự dựng câu từ tiếng Việt thay vì chọn đáp án.' },
    'chua-nam': { nhan: 'Chưa nắm quy tắc', viec: 'Đọc thẻ quy tắc rồi bắt đầu với câu ngắn trong Phản xạ câu.' },
    'bat-dau-duoc': { nhan: 'Đã bắt đầu làm được nhưng chưa chắc', viec: 'Đọc lại thẻ quy tắc rồi luyện thêm để giữ được ở mọi câu.' },
    'cau-ngan-duoc': { nhan: 'Dựng được câu ngắn, câu dài còn vấp', viec: 'Luyện Phản xạ câu để quen dần với câu dài hơn.' },
    'chua-chac': { nhan: 'Kết quả chưa ổn định', viec: 'Luyện thêm vài lượt để hệ thống đánh giá chắc hơn.' },
};

/**
 * Chẩn đoán nguyên nhân của một khung (thuần), từ câu chọn, câu gõ và câu thứ ba (nói,
 * hoặc gõ thay). Câu gõ sai thì câu thứ ba là câu DỄ: làm đúng cho thấy đã làm được ở mức
 * đơn giản, không được kết luận như sai cả ba.
 */
function chanDoanKhung({ tracNghiem, go, noi, goThay }) {
    const thuBa = noi ?? goThay;
    if (tracNghiem === true && go === true && thuBa !== false) return 'vung';
    if (go === true && noi === false) return 'chua-noi-kip';
    if (go === false && thuBa === true) return tracNghiem === true ? 'cau-ngan-duoc' : 'bat-dau-duoc';
    if (tracNghiem === true && go === false) return 'chua-tu-dung';
    if (tracNghiem === false && go === false) return 'chua-nam';
    return 'chua-chac';
}

/** Chẩn đoán toàn bài (thuần). Câu "không chấm được" không dùng làm bằng chứng. */
function chanDoan(daLam) {
    const chac = daLam.filter((c) => !c.khongChac);
    const ket = KHUNG.map((k) => {
        const cua = chac.filter((c) => c.kyNang === k.key);
        const lay = (loai) => cua.find((c) => c.loai === loai)?.dung;
        // Không có micro thì câu thứ ba cũng là loại 'go', nên lấy câu gõ thứ hai.
        const cauGo = cua.filter((c) => c.loai === 'go');
        const ma = chanDoanKhung({
            tracNghiem: lay('trac-nghiem'),
            go: cauGo[0]?.dung,
            noi: lay('noi'),
            goThay: lay('go-thay') ?? cauGo[1]?.dung,
        });
        return { kyNang: k.key, ten: k.ten, ma, ...CHAN_DOAN_KHUNG[ma] };
    });
    const nghe = chac.filter((c) => c.kyNang === 'nghe');
    if (nghe.length) {
        const tot = nghe.filter((c) => c.dung).length >= 2;
        ket.push({
            kyNang: 'nghe',
            ten: TEN_KY_NANG.get('nghe'),
            ma: tot ? 'vung' : 'can-nghe',
            nhan: tot ? 'Nghe được câu thông dụng' : 'Còn khó nghe câu thông dụng',
            viec: tot ? 'Chuyển dần sang nghe đoạn dài hơn.' : 'Nghe và chép lại câu ngắn mỗi ngày.',
        });
    }
    return ket;
}

async function moTest(userId, { coMic = true } = {}, now = new Date()) {
    const p = await UserProfile.findOne({ userId }).select('settings').lean();
    if (p?.settings?.vocabLang === 'zh') return { loi: 'Test hiện chỉ có tiếng Anh. Đổi ngôn ngữ học sang tiếng Anh để làm.', ma: 400 };
    const daMo = await BuoiKiemTra.countDocuments({ userId, createdAt: { $gte: homNayVN(now).dau } });
    if (daMo >= TOI_DA_MOI_NGAY) return { loi: 'Hôm nay bạn đã mở đủ số lượt test. Hãy thử lại vào ngày mai.', ma: 429 };
    const cauHienTai = chonCauTest(0, [], !!coMic);
    const buoi = await BuoiKiemTra.create({ userId, coMic: !!coMic, cauHienTai });
    return { id: String(buoi._id), cau: congKhai(cauHienTai, 0) };
}

async function chamCau(q, body, userId) {
    if (q.loai === 'trac-nghiem' || q.loai === 'nghe') {
        const x = timCauTracNghiem(q);
        return { dung: body.chon === x.lua[0], khongChac: false, loai: q.loai };
    }
    // Câu nói mà người học chuyển sang gõ thì không dùng làm bằng chứng cho kỹ năng Nói.
    const loai = q.loai === 'noi' && body.cach !== 'noi' ? 'go-thay' : q.loai;
    const cau = THEO_ID.get(q.id);
    const chu = typeof body.traLoi === 'string' ? body.traLoi.trim().slice(0, 200) : '';
    if (!chu) return { dung: false, khongChac: false, loai };
    if (khopKho(chu, cau)) return { dung: true, khongChac: false, loai };
    const r = await aiCham(cau, chu, userId);
    return r ? { dung: r.dung, khongChac: false, loai } : { dung: false, khongChac: true, loai };
}

/** Câu sai để xem lại cuối bài, kèm đáp án (đến đây mới gửi đáp án về client). */
function cauCanXem(daLam) {
    return daLam.filter((c) => !c.dung && !c.khongChac).map((c) => {
        if (THEO_ID.has(c.id)) {
            const x = THEO_ID.get(c.id);
            return { de: x.vi, dapAn: x.en };
        }
        const x = timCauTracNghiem(c);
        return { de: x.doc || x.hoi, dapAn: x.lua[0] };
    });
}

async function ketThuc(userId, daLam, now) {
    const ketQua = daLam.filter((c) => !c.khongChac).flatMap((c) => [
        { kyNang: c.kyNang, dung: c.dung },
        ...(c.loai === 'noi' ? [{ kyNang: 'noi', dung: c.dung }] : []),
    ]);
    await ghiKetQua(userId, ketQua, now);
    const hs = await HoSoHocVien.findOne({ userId }).select('kyNang').lean();
    const { diem } = tongQuanTrinhDo(tomTatKyNang(hs?.kyNang));
    await HoSoHocVien.updateOne({ userId }, {
        $set: { testNgay: now, chanDoan: chanDoan(daLam), mucTieu: 'giao-tiep' },
        $push: { lichSuTest: { $each: [{ ngay: now, diem }], $slice: -12 } },
    }, { upsert: true });
    return { xong: true, hoSo: await layHoSo(userId), canXem: cauCanXem(daLam) };
}

async function traLoiTest(userId, buoiId, body = {}, now = new Date()) {
    const buoi = await BuoiKiemTra.findOne({ _id: buoiId, userId }).lean();
    if (!buoi) return { loi: 'Không tìm thấy lượt test (có thể đã hết hạn).', ma: 404 };
    const i = Number(body.i);
    if (i !== buoi.i || !buoi.cauHienTai) return { loi: 'Câu này đã được trả lời rồi.', ma: 409 };

    // Chiếm câu TRƯỚC khi hỏi AI: bấm hai lần không tốn hai lượt AI, không tính hai lần.
    const chiem = await BuoiKiemTra.updateOne({ _id: buoiId, userId, i }, { $inc: { i: 1 } });
    if (!(chiem?.modifiedCount ?? chiem?.nModified)) return { loi: 'Câu này đã được trả lời rồi.', ma: 409 };

    const q = buoi.cauHienTai;
    const r = await chamCau(q, body, userId);
    const daLam = [...buoi.daLam, { ...q, ...r }];

    if (i + 1 >= KE_HOACH.length) {
        await BuoiKiemTra.updateOne({ _id: buoiId, userId }, { $set: { daLam, cauHienTai: null } });
        return ketThuc(userId, daLam, now);
    }
    const tiep = chonCauTest(i + 1, daLam, buoi.coMic);
    await BuoiKiemTra.updateOne({ _id: buoiId, userId }, { $set: { daLam, cauHienTai: tiep } });
    return { xong: false, cau: congKhai(tiep, i + 1) };
}

module.exports = {
    moTest, traLoiTest, chonCauTest, mucTiep, congKhai, chanDoan, chanDoanKhung, cauCanXem,
    KE_HOACH, TRAC_NGHIEM, NGHE, CAU_THEO_MUC, TOI_DA_MOI_NGAY,
};
