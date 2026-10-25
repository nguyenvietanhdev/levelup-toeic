const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { xemLaiBai, MAX_XEM_LAI } = require('../services/xemLaiBai');

/**
 * Handler "nộp lại bài đã sửa để AI xem lại", dùng chung cho Viết và Dịch.
 *
 * @param {object} cfg
 * @param {import('mongoose').Model} cfg.Model     Essay | Translation
 * @param {'viet'|'dich'}             cfg.kieu
 * @param {string}                    cfg.truongBai  trường chứa bài làm ('essay' | 'translation')
 * @param {string}                    cfg.truongLoi  trường chứa lỗi đã chữa ('issues' | 'notes')
 *
 * @route POST /api/essay/:id/xem-lai, POST /api/translation/:id/xem-lai  body { noiDung }
 */
function taoXemLai({ Model, kieu, truongBai, truongLoi }) {
    return async (req, res, next) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) {
                return res.status(400).json({ success: false, message: 'Mã bài không hợp lệ' });
            }
            const doc = await Model.findOne({ _id: req.params.id, userId: req.user.id })
                .select(`${truongBai} ${truongLoi} lang passage xemLai`).lean();
            if (!doc) return res.status(404).json({ success: false, message: 'Không tìm thấy bài này' });

            const daXem = Array.isArray(doc.xemLai) ? doc.xemLai : [];
            if (daXem.length >= MAX_XEM_LAI) {
                return res.status(429).json({
                    success: false, message: `Bài này đã dùng hết ${MAX_XEM_LAI} lượt xem lại.`, conLai: 0,
                });
            }

            const noiDung = typeof req.body.noiDung === 'string' ? req.body.noiDung.trim().slice(0, 20000) : '';
            // So với LẦN GẦN NHẤT (lần xem lại trước, hoặc bài lúc chấm): nộp lại y nguyên
            // bản vừa xem thì không có gì mới để xem.
            const goc = daXem.length ? daXem[daXem.length - 1].noiDung : doc[truongBai];

            const r = await xemLaiBai({
                goc, sua: noiDung, loi: doc[truongLoi] || [], lang: doc.lang, kieu,
                passage: doc.passage || '', userId: req.user.id,
            });
            if (!r.success) {
                if (r.ma === 'ai') logger.error(`Recheck (${kieu}): AI failed`);
                return res.status(r.ma === 'ai' ? 503 : 400).json({ success: false, message: r.error, ma: r.ma });
            }

            // Ghi có điều kiện "chưa đủ lượt" — hai lần bấm song song không vượt trần.
            const ghi = await Model.updateOne(
                { _id: doc._id, userId: req.user.id, [`xemLai.${MAX_XEM_LAI - 1}`]: { $exists: false } },
                { $push: { xemLai: { at: new Date(), noiDung, ketQua: r.ketQua } } },
            );
            if (!(ghi?.modifiedCount ?? ghi?.nModified)) {
                return res.status(429).json({
                    success: false, message: `Bài này đã dùng hết ${MAX_XEM_LAI} lượt xem lại.`, conLai: 0,
                });
            }

            const lan = daXem.length + 1;
            res.json({ success: true, data: { ketQua: r.ketQua, noiDung, lan, conLai: MAX_XEM_LAI - lan } });
        } catch (error) {
            next(error);
        }
    };
}

module.exports = { taoXemLai };
