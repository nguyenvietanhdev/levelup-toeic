/**
 * Trạng thái từng nhà cung cấp AI cho màn admin: hãng nào sẵn sàng làm dự phòng,
 * còn bao nhiêu credit, và có cảnh báo nào đang mở không.
 *
 * Số dư lấy từ một trong hai nguồn, và luôn ghi rõ nguồn cho admin:
 *   · `live`    — hãng có API đọc số dư (DeepSeek). Lấy trực tiếp, cache 5 phút.
 *   · `tracked` — admin ghi số dư hiện có, hệ thống trừ dần theo chi phí ước tính
 *                 trong AiUsageLog. Đây là ước tính, không phải số dư thật của hãng.
 *   · `none`    — chưa có số nào. Không đoán.
 */
const AiConfig = require('../models/AiConfig');
const AiUsageLog = require('../models/AiUsageLog');
const AiProviderEvent = require('../models/AiProviderEvent');
const { PROVIDERS, DEFAULT_PROVIDER } = require('./aiProviders');
const { apiKeyOf, healthSnapshot } = require('./aiClient');

/** Dưới mức này thì báo "sắp hết" (đơn vị theo tiền của hãng). */
const SAP_HET = { USD: 2, CNY: 10 };
const CACHE_LIVE_MS = 5 * 60 * 1000;
const NGAY = 24 * 60 * 60 * 1000;

const _soDuLive = new Map();   // providerId → { at, value }

/**
 * Số dư trực tiếp từ hãng, nếu hãng có API đọc. Lỗi mạng trả null và không
 * làm hỏng trang admin — rơi về số admin đã ghi.
 */
async function soDuTrucTiep(provider) {
    if (!provider.balanceUrl) return null;
    const key = apiKeyOf(provider);
    if (!key) return null;

    const cached = _soDuLive.get(provider.id);
    if (cached && Date.now() - cached.at < CACHE_LIVE_MS) return cached.value;

    let value = null;
    const ctrl = new AbortController();
    const hen = setTimeout(() => ctrl.abort(), 5000);
    try {
        const res = await fetch(provider.balanceUrl, {
            headers: { Authorization: `Bearer ${key}` },
            signal: ctrl.signal,
        });
        if (res.ok) {
            const j = await res.json();
            const info = (j.balance_infos || [])[0];
            if (info) {
                value = {
                    currency: String(info.currency || 'USD').toUpperCase(),
                    total: Number(info.total_balance),
                    available: j.is_available !== false,
                };
            }
        }
    } catch (_) {
        value = null;
    } finally {
        clearTimeout(hen);
    }
    _soDuLive.set(provider.id, { at: Date.now(), value });
    return value;
}

/** Tổng chi phí ƯỚC TÍNH của các lượt thành công của hãng từ mốc `since`. */
async function daChiTu(providerId, since) {
    const match = { provider: providerId, success: true };
    if (since) match.createdAt = { $gte: since };
    const [r] = await AiUsageLog.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: '$costUsd' } } },
    ]);
    return r?.total || 0;
}

/** Trạng thái đầy đủ cho màn admin. */
async function getAiStatus() {
    const cfg = (await AiConfig.findOne({ key: 'default' }).lean()) || {};
    const chinh = cfg.provider || DEFAULT_PROVIDER;
    const soDuDaGhi = cfg.balances || {};
    const { nghi, chuyen } = healthSnapshot();
    const nghiTheo = new Map(nghi.map(n => [n.provider, n]));

    const providers = [];
    for (const p of Object.values(PROVIDERS)) {
        const configured = !!apiKeyOf(p);
        const down = nghiTheo.get(p.id) || null;

        let credit = { source: 'none', currency: 'USD', remaining: null, spent: null, since: null, lowCredit: false };
        const live = configured ? await soDuTrucTiep(p) : null;
        if (live) {
            credit = {
                source: 'live',
                currency: live.currency,
                remaining: live.total,
                spent: null,
                since: null,
                lowCredit: live.total < (SAP_HET[live.currency] ?? SAP_HET.USD),
            };
        } else if (soDuDaGhi[p.id]?.balanceUsd !== undefined) {
            const { balanceUsd, since } = soDuDaGhi[p.id];
            const sinceDate = since ? new Date(since) : null;
            const spent = await daChiTu(p.id, sinceDate);
            const remaining = Number(balanceUsd) - spent;
            credit = {
                source: 'tracked',
                currency: 'USD',
                remaining,
                spent,
                since: sinceDate,
                lowCredit: remaining < SAP_HET.USD,
            };
        }

        // Sẵn sàng làm dự phòng = có key, không đang nghỉ, và còn số dư (nếu biết).
        let ready = configured && !down;
        let lyDo = 'Sẵn sàng';
        if (!configured) lyDo = 'Chưa có API key trong .env';
        else if (down) lyDo = `Đang nghỉ (${down.kind === 'quota' ? 'hết credit' : 'sai key'}), thử lại sau ${Math.ceil(down.retryInSec / 60)} phút`;
        else if (credit.remaining !== null && credit.remaining <= 0) { ready = false; lyDo = 'Hết số dư'; }
        else if (credit.lowCredit) lyDo = 'Sắp hết số dư';

        providers.push({
            id: p.id,
            label: p.label,
            laChinh: p.id === chinh,
            configured,
            down,
            ready,
            lyDo,
            credit,
            // Có API đọc số dư không — để admin biết ô nhập tay có cần thiết không.
            coSoDuTrucTiep: !!p.balanceUrl,
        });
    }

    const sinceMoc = new Date(Date.now() - 7 * NGAY);
    const events = await AiProviderEvent.find({
        $or: [{ closedAt: null }, { openedAt: { $gte: sinceMoc } }],
    }).sort({ openedAt: -1 }).limit(20).lean();

    const chinhSanSang = providers.find(p => p.laChinh)?.ready ?? false;
    const coDuPhong = providers.some(p => !p.laChinh && p.ready);
    let canhBao = null;
    if (!providers.some(p => p.ready)) {
        canhBao = { muc: 'nghiemtrong', noiDung: 'Không nhà cung cấp AI nào dùng được. Mọi tính năng AI sẽ lỗi cho tới khi có hãng sẵn sàng.' };
    } else if (!chinhSanSang && coDuPhong) {
        canhBao = { muc: 'canh', noiDung: 'Hãng chính đang không dùng được. Hệ thống đang chạy bằng hãng dự phòng.' };
    }

    return {
        chinh,
        providers,
        events: events.map(e => ({
            id: String(e._id),
            provider: e.provider,
            kind: e.kind,
            message: e.message,
            openedAt: e.openedAt,
            closedAt: e.closedAt,
        })),
        chuyen,
        canhBao,
    };
}

module.exports = { getAiStatus, soDuTrucTiep, daChiTu, SAP_HET, _resetLive: () => _soDuLive.clear() };
