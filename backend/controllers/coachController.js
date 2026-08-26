const UserStats = require('../models/UserStats');
const UserProfile = require('../models/UserProfile');
const WrongWord = require('../models/WrongWord');
const Translation = require('../models/Translation');
const Essay = require('../models/Essay');
const { dungGoiY, phanTichCheDo, vongNenTapTrung, vongCua } = require('../services/coachAdvisor');
const { thongKe } = require('../services/errorTaxonomy');

/**
 * Bộ gợi ý luyện tập — "hôm nay nên luyện gì".
 *
 * Ghép ba nguồn dữ liệu đã có sẵn nhưng chưa ai nối lại: thống kê từng chế độ,
 * số từ đến hạn ôn, và nhật ký lỗi ngữ pháp. Không gọi AI — mọi tín hiệu là số
 * đã đếm sẵn, hỏi AI là trả tiền để nó đoán lại thứ ta biết chắc.
 */

/** Lỗi ngữ pháp hay mắc nhất trong 90 ngày. `null` nếu chưa có bài nào. */
async function loiHayMacNhat(userId) {
    const tu = new Date(Date.now() - 90 * 86400000);
    const [dich, luan] = await Promise.all([
        Translation.find({ userId, createdAt: { $gte: tu } }).select('notes').lean(),
        Essay.find({ userId, createdAt: { $gte: tu } }).select('issues').lean(),
    ]);
    const all = [
        ...dich.flatMap((d) => d.notes || []),
        ...luan.flatMap((e) => e.issues || []),
    ];
    const stats = thongKe(all);
    // Bỏ qua nhóm "Khác": nói "bạn hay sai Khác" không dạy được gì, mà nó lại
    // hay đứng đầu khi AI chưa gán nhãn cho các bài cũ.
    const dau = stats.find((s) => s.key !== 'other');
    return dau || null;
}

/**
 * @desc    Gợi ý luyện tập cho hôm nay
 * @route   GET /api/coach/suggestions
 */
exports.suggestions = async (req, res, next) => {
    try {
        const userId = req.user.id || req.user._id;

        // Số từ đến hạn phải lọc theo NGÔN NGỮ đang học, giống mọi nơi khác:
        // báo 189 mà mở ra chỉ có 98 là sai lệch người dùng nhìn thấy ngay.
        const profile = await UserProfile.findOne({ userId }).select('settings').lean();
        const lang = profile?.settings?.vocabLang === 'zh' ? 'zh' : 'en';

        const [stats, dueTotal, loi] = await Promise.all([
            UserStats.findOne({ userId }).select('modeStats').lean(),
            WrongWord.countDocuments({
                userId, status: 'active',
                nextReviewDate: { $lte: new Date() },
                ...WrongWord.langFilter(lang),
            }),
            loiHayMacNhat(userId),
        ]);

        const items = dungGoiY({
            modeStats: stats?.modeStats,
            dueTotal,
            loiHayMac: loi,
        });

        // Trả thêm LỘ TRÌNH để lưới thẻ ở trang chủ tô sáng đúng chỗ.
        //
        // Không để client tự suy: nó phải lặp lại toàn bộ luật (vòng nào, ngưỡng
        // bao nhiêu, chế độ nào thuộc vòng nào) và hai bản sao thì lệch nhau —
        // gợi ý nói một đằng, thẻ sáng một nẻo.
        const ds = phanTichCheDo(stats?.modeStats);
        const vong = vongNenTapTrung(ds);
        const goiYMode = items.find((x) => x.mode)?.mode || null;

        res.json({
            success: true,
            data: {
                items,
                // `next` = chế độ NÊN chơi ngay bây giờ (thẻ sẽ nhấp nháy).
                next: goiYMode,
                // `vong` = vòng đang tập trung; `modes` để tô nhạt cả nhóm.
                vong: vong ? { so: vong.vong, ten: vong.ten, modes: vong.modes } : null,
                // Vòng của TỪNG chế độ — thẻ hiện nhãn "Vòng 3" chẳng hạn.
                vongTheoMode: Object.fromEntries(
                    ds.map((x) => [x.mode, vongCua(x.mode)]).filter(([, v]) => v > 0)
                ),
            },
        });
    } catch (error) {
        next(error);
    }
};
