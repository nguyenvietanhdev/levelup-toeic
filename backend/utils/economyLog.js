const Transaction = require('../models/Transaction');

// Ghi 1 giao dịch kinh tế (faucet/sink) cho bảng thống kê. KHÔNG chặn/ném lỗi
// luồng chính — nếu ghi lỗi thì bỏ qua.
//   logTxn(userId, { type, direction:'in'|'out', name, amount, currency, balanceAfter, itemId })
async function logTxn(userId, o = {}) {
    try {
        const amount = Math.abs(Number(o.amount) || 0);
        if (!userId || !amount) return;
        await Transaction.create({
            userId,
            type: o.type || 'other',
            direction: o.direction || 'out',
            name: o.name || '',
            itemId: o.itemId || '',
            amount,
            currency: o.currency || 'coins',
            balanceAfter: Number(o.balanceAfter) || 0,
        });
    } catch (_) { /* nuốt lỗi */ }
}

module.exports = { logTxn };
