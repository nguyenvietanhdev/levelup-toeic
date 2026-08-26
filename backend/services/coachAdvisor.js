/**
 * BỘ GỢI Ý LUYỆN TẬP — trả lời "hôm nay nên luyện gì".
 *
 * Không phải chế độ thứ 17. Đây là lớp ĐỌC dữ liệu đã có sẵn nhưng chưa ai ghép
 * lại: `UserStats.modeStats` (lượt chơi + đúng/tổng từng chế độ), `WrongWord`
 * (từ đến hạn ôn), và nhật ký lỗi ngữ pháp từ các bài AI chấm.
 *
 * Vì sao cần: 16 chế độ nằm rời rạc, người học tự chọn thì trôi về chỗ dễ. Số
 * liệu thật xác nhận — một tài khoản có Trắc nghiệm 69 lượt / đúng 88%, trong
 * khi Tốc độ 8 lượt / đúng 28% và Viết chữ Hán 10 lượt / đúng 34%. Chế độ càng
 * yếu càng bị né, mà đó chính là chỗ cần luyện.
 *
 * KHÔNG gọi AI: mọi tín hiệu ở đây là số đã đếm sẵn trong DB. Hỏi AI "nên luyện
 * gì" là trả tiền để nó đoán lại thứ ta đã biết chắc — và câu trả lời sẽ đổi
 * mỗi lần hỏi, trong khi cùng một dữ liệu phải cho cùng một lời khuyên.
 */

/**
 * Số lượt tối thiểu để tin vào tỉ lệ đúng.
 *
 * Dưới ngưỡng này thì tỉ lệ là nhiễu: chơi 1 lượt đúng 10/10 không có nghĩa là
 * giỏi, và 2 lượt đúng 100% (số liệu thật của `dictation`) không đủ để kết luận
 * gì. Khuyên dựa trên nhiễu còn tệ hơn không khuyên.
 */
const TOI_THIEU_LUOT = 3;

/** Dưới mức này coi là ĐANG YẾU. */
const NGUONG_YEU = 0.7;

/** Bỏ quên bao lâu thì đáng nhắc (ngày). */
const NGAY_BO_QUEN = 14;

/**
 * Nhãn tiếng Việt của chế độ. Khớp `gameModes` ở HomeScreen.
 *
 * Lặp lại ở đây thay vì import từ frontend: server không đọc được file JSX, mà
 * gợi ý phải nói tên người dùng nhìn thấy — trả về `speed-quiz` thì họ không
 * biết đó là thẻ nào.
 */
const TEN_CHE_DO = {
    flashcard: 'Flashcard',
    'multiple-choice': 'Trắc nghiệm',
    matching: 'Nối từ',
    'word-type-check': 'Từ loại',
    listening: 'Nghe và chọn',
    'sentence-listening': 'Nghe chuỗi từ',
    pronunciation: 'Phát âm',
    dictation: 'Chép chính tả',
    'synonym-check': 'Từ đồng nghĩa',
    'example-fill-blank': 'Điền vào câu',
    'phonetic-quiz': 'Đọc phiên âm',
    'fill-blank': 'Điền từ',
    'hanzi-writing': 'Luyện viết chữ Hán',
    'context-learning': 'Hiểu qua câu',
    'sentence-builder': 'Xếp câu',
    'speed-quiz': 'Tốc độ',
    'review-mistakes': 'Ôn lại từ sai',
};

const tenCheDo = (m) => TEN_CHE_DO[m] || m;

/**
 * LỘ TRÌNH 4 VÒNG — đi từ nhận ra tới nhớ lại tới dùng được.
 *
 * Dựa trên `retrieval practice` (Roediger & Karpicke 2006): CỐ NHỚ LẠI củng cố
 * trí nhớ mạnh hơn nhiều so với ĐỌC LẠI — dù người học thấy đọc lại "dễ vào"
 * hơn. Nên thứ tự phải đi từ chế độ có sẵn đáp án trong tầm mắt (nhận ra) sang
 * chế độ không gợi ý gì (nhớ lại), và phải chuyển SỚM hơn cảm giác thoải mái.
 *
 * Số liệu thật xác nhận người học kẹt ở vòng 2: Trắc nghiệm 76 lượt / đúng 88%,
 * trong khi Điền từ 15 lượt / 66% và Tốc độ 8 lượt / 28%. Càng khó càng bị né,
 * mà đó chính là chỗ trí nhớ được xây.
 *
 * `speed-quiz` KHÔNG nằm trong lộ trình: nó không kiểm tra trí nhớ mà kiểm tra
 * TỐC ĐỘ TRUY XUẤT — thứ chỉ đến sau khi đã thuộc. Gợi ý nó cho người đang ở
 * vòng 2 là tạo áp lực vô ích.
 */
const LO_TRINH = [
    {
        vong: 1,
        ten: 'Gặp mặt',
        modes: ['flashcard'],
        yNghia: 'Biết từ đó tồn tại. Chưa cần thuộc.',
    },
    {
        vong: 2,
        ten: 'Nhận ra',
        modes: ['multiple-choice', 'matching', 'listening', 'word-type-check'],
        yNghia: 'Đáp án nằm trong tầm mắt — dễ nhất, và là chỗ ai cũng ở lại quá lâu.',
    },
    {
        vong: 3,
        ten: 'Nhớ lại',
        modes: ['fill-blank', 'dictation', 'pronunciation', 'phonetic-quiz', 'hanzi-writing'],
        yNghia: 'Không gợi ý gì. Đây là nơi trí nhớ thật sự được xây.',
    },
    {
        vong: 4,
        ten: 'Dùng được',
        modes: ['example-fill-blank', 'sentence-builder', 'context-learning', 'synonym-check'],
        yNghia: 'Từ trong ngữ cảnh — biến "biết nghĩa" thành "dùng được".',
    },
];

/** Vòng của một chế độ. `0` = ngoài lộ trình (Tốc độ, Ôn từ sai). */
function vongCua(mode) {
    const v = LO_TRINH.find((x) => x.modes.includes(mode));
    return v ? v.vong : 0;
}

/**
 * Vòng người học NÊN tập trung, và chế độ nên chơi tiếp trong vòng đó.
 *
 * Quy tắc: đứng ở vòng thấp nhất CHƯA VỮNG. Vững = đã chơi đủ lượt tin cậy và
 * đúng trên ngưỡng. Nhảy cóc lên vòng 4 khi chưa thuộc từ thì không phải là
 * thử thách, chỉ là thất bại liên tục.
 */
function vongNenTapTrung(danhSach) {
    const theoMode = new Map(danhSach.map((x) => [x.mode, x]));

    for (const v of LO_TRINH) {
        // Chế độ trong vòng này mà CHƯA đủ dữ liệu tin cậy → còn phải làm.
        const chuaVung = v.modes.filter((m) => {
            const x = theoMode.get(m);
            if (!x || x.played < TOI_THIEU_LUOT) return true;
            return x.acc !== null && x.acc < NGUONG_YEU;
        });
        if (chuaVung.length) {
            // Ưu tiên chế độ CHƯA CHƠI trước chế độ đã chơi mà còn yếu: mở rộng
            // trước, đào sâu sau — người chưa thử Chép chính tả bao giờ thì nên
            // thử, chứ không phải cày lại Điền từ.
            const chuaThu = chuaVung.find((m) => !(theoMode.get(m)?.played > 0));
            return { ...v, goiY: chuaThu || chuaVung[0] };
        }
    }
    // Vững cả bốn vòng → không ép nữa.
    return null;
}

/** `modeStats` có thể là Map (Mongoose) hoặc object thuần (sau `.lean()`). */
function doiSangObject(ms) {
    if (!ms) return {};
    if (ms instanceof Map) return Object.fromEntries(ms);
    return typeof ms === 'object' ? ms : {};
}

/**
 * Chuẩn hoá thống kê từng chế độ thành danh sách so sánh được.
 *
 * `acc` là `null` khi chưa đủ lượt — KHÔNG phải 0. Coi "chưa có dữ liệu" là
 * "đúng 0%" thì mọi chế độ chưa chơi đều bị xếp là điểm yếu nặng nhất, và gợi ý
 * chỉ toàn nói về chúng.
 */
function phanTichCheDo(modeStats) {
    const ms = doiSangObject(modeStats);
    return Object.entries(ms).map(([mode, v]) => {
        const played = Number(v?.played) || 0;
        const total = Number(v?.total) || 0;
        const correct = Number(v?.correct) || 0;
        return {
            mode,
            ten: tenCheDo(mode),
            played,
            acc: (played >= TOI_THIEU_LUOT && total > 0) ? correct / total : null,
        };
    });
}

/**
 * Chế độ YẾU NHẤT có đủ dữ liệu.
 *
 * Chỉ trả về khi thật sự dưới ngưỡng: người đúng 85% ở mọi chế độ không có
 * "điểm yếu", và bịa ra một cái để nhắc là làm lời khuyên mất tin cậy.
 */
function diemYeu(danhSach) {
    const co = danhSach.filter((x) => x.acc !== null && x.acc < NGUONG_YEU);
    if (!co.length) return null;
    return co.sort((a, b) => a.acc - b.acc)[0];
}

/**
 * Chế độ CHƯA BAO GIỜ chơi.
 *
 * Xếp theo thứ tự khai báo (dễ → khó) để gợi cái dễ trước; `Object.keys` giữ
 * nguyên thứ tự chèn nên không cần sắp lại.
 */
function chuaThu(danhSach) {
    const daChoi = new Set(danhSach.filter((x) => x.played > 0).map((x) => x.mode));
    const con = Object.keys(TEN_CHE_DO).filter((m) => !daChoi.has(m));
    return con.length ? { mode: con[0], ten: tenCheDo(con[0]) } : null;
}

/**
 * Chế độ đã chơi nhưng BỎ QUÊN lâu.
 *
 * Cần `lastPlayedAt`; `modeStats` cũ chưa có trường này nên đa số sẽ trả null —
 * đó là lý do nó chỉ là một trong nhiều tín hiệu, không phải tín hiệu chính.
 */
function boQuen(modeStats, bayGio = Date.now()) {
    const ms = doiSangObject(modeStats);
    let xa = null;
    for (const [mode, v] of Object.entries(ms)) {
        const t = v?.lastPlayedAt ? new Date(v.lastPlayedAt).getTime() : null;
        if (!t || !(Number(v?.played) > 0)) continue;
        const ngay = Math.floor((bayGio - t) / 86400000);
        if (ngay >= NGAY_BO_QUEN && (!xa || ngay > xa.ngay)) {
            xa = { mode, ten: tenCheDo(mode), ngay };
        }
    }
    return xa;
}

/**
 * Dựng danh sách gợi ý, quan trọng nhất trước.
 *
 * Thứ tự ưu tiên có chủ ý:
 *   1. Từ đến hạn ôn — lịch giãn cách chỉ hiệu quả khi ôn ĐÚNG NGÀY; trễ một
 *      ngày là mất tác dụng của cả lần ôn trước.
 *   2. Lỗi ngữ pháp hay mắc — thứ ảnh hưởng mọi kỹ năng viết/nói.
 *   3. Chế độ yếu nhất — chỗ cần luyện, mà cũng là chỗ hay bị né nhất.
 *   4. Chế độ chưa thử / bỏ quên — mở rộng, ưu tiên thấp nhất.
 *
 * Mỗi gợi ý có `mode` hoặc `screen` để client mở thẳng — nói "bạn yếu Tốc độ"
 * rồi bắt tự đi tìm thẻ đó giữa 16 ô là đẩy việc sang người dùng.
 */
function dungGoiY({ modeStats, dueTotal = 0, loiHayMac = null, bayGio = Date.now() } = {}) {
    const ds = phanTichCheDo(modeStats);
    const out = [];

    if (dueTotal > 0) {
        out.push({
            key: 'review-due',
            uuTien: 1,
            tieuDe: `${dueTotal} từ đến hạn ôn`,
            lyDo: 'Lịch ôn giãn cách chỉ hiệu quả khi ôn đúng ngày — để trễ là mất tác dụng của lần ôn trước.',
            mode: 'review-mistakes',
        });
    }

    if (loiHayMac?.count > 0) {
        out.push({
            key: 'grammar',
            uuTien: 2,
            tieuDe: `Hay sai: ${loiHayMac.vi}`,
            lyDo: loiHayMac.hint
                || `Đã mắc ${loiHayMac.count} lần trong các bài đã chấm.`,
            screen: 'translation-screen',
        });
    }

    // Gợi ý theo LỘ TRÌNH — đứng trước "chế độ yếu" vì nó trả lời câu hỏi lớn
    // hơn: không phải "chỗ nào tôi kém" mà "bước tiếp theo của tôi là gì".
    const vong = vongNenTapTrung(ds);
    if (vong?.goiY) {
        out.push({
            key: 'path',
            uuTien: 3,
            tieuDe: `Vòng ${vong.vong} — ${vong.ten}: ${tenCheDo(vong.goiY)}`,
            lyDo: vong.yNghia,
            mode: vong.goiY,
        });
    }

    const yeu = diemYeu(ds);
    if (yeu) {
        out.push({
            key: 'weak-mode',
            uuTien: 4,
            tieuDe: `${yeu.ten} — đúng ${Math.round(yeu.acc * 100)}%`,
            lyDo: 'Đây là chế độ bạn làm kém nhất. Chỗ khó thường là chỗ bị né, mà cũng là chỗ tiến bộ nhanh nhất khi luyện.',
            mode: yeu.mode,
        });
    }

    const quen = boQuen(modeStats, bayGio);
    if (quen) {
        out.push({
            key: 'forgotten',
            uuTien: 5,
            tieuDe: `${quen.ten} — ${quen.ngay} ngày chưa động`,
            lyDo: 'Kỹ năng không dùng thì mờ đi. Một lượt là đủ để lấy lại nhịp.',
            mode: quen.mode,
        });
    }

    const moi = chuaThu(ds);
    if (moi) {
        out.push({
            key: 'untried',
            uuTien: 6,
            tieuDe: `Chưa thử ${moi.ten}`,
            lyDo: 'Mỗi chế độ kiểm tra một cách nhớ khác nhau — nhận ra, nhớ lại, hay nghe hiểu.',
            mode: moi.mode,
        });
    }

    return out.sort((a, b) => a.uuTien - b.uuTien);
}

module.exports = {
    dungGoiY,
    LO_TRINH,
    vongCua,
    vongNenTapTrung,
    phanTichCheDo,
    diemYeu,
    chuaThu,
    boQuen,
    tenCheDo,
    TEN_CHE_DO,
    TOI_THIEU_LUOT,
    NGUONG_YEU,
    NGAY_BO_QUEN,
};
