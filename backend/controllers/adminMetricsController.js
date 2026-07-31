const { metrics } = require('../utils/requestMetrics');

// GET /api/admin/metrics — số liệu vận hành realtime cho dashboard
exports.getSystemMetrics = (req, res) => {
    const { mongoose: mg } = require('../config/mongodb');
    const mem = process.memoryUsage();

    // Latency percentile helper
    const sorted = [...metrics.latencies].sort((a, b) => a - b);
    const pct = (p) => sorted.length
        ? Math.round(sorted[Math.floor(sorted.length * p)])
        : 0;
    const avgLatency = sorted.length
        ? Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length)
        : 0;

    // Reorder minute buffer so index 0 = oldest, 59 = most recent
    const timeline = [
        ...metrics.minuteBuffer.slice(metrics.minuteIdx + 1),
        ...metrics.minuteBuffer.slice(0, metrics.minuteIdx + 1),
    ];

    // Requests per minute (sum of last 60 slots / 60)
    const rpm = Math.round(
        metrics.minuteBuffer.reduce((s, v) => s + v, 0) / 60 * 10
    ) / 10;

    // Top 10 routes by request count
    const topRoutes = Object.entries(metrics.routeStats)
        .map(([route, v]) => ({
            route,
            count: v.count,
            avgMs: Math.round(v.totalMs / v.count),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    // Error rate %
    const total = metrics.totalRequests || 1;
    const errorRate = Math.round(
        ((metrics.statusCodes['4xx'] + metrics.statusCodes['5xx']) / total) * 1000
    ) / 10;

    res.json({
        uptime:    Math.floor(process.uptime()),
        cpu:       metrics.cpuPercent,
        memory: {
            rss:       Math.round(mem.rss       / 1024 / 1024),
            heapUsed:  Math.round(mem.heapUsed  / 1024 / 1024),
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
            external:  Math.round(mem.external  / 1024 / 1024),
        },
        requests: {
            total,
            rpm,
            timeline,
        },
        latency: {
            avg: avgLatency,
            p50: pct(0.50),
            p95: pct(0.95),
            p99: pct(0.99),
        },
        statusCodes:  { ...metrics.statusCodes },
        errorRate,
        topRoutes,
        slowRequests: metrics.slowRequests.slice(0, 10),
        mongo: mg.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
};

// GET /api/admin/stats/growth — số user mới đăng ký theo ngày
exports.getUserGrowth = async (req, res) => {
    try {
        const User = require('../models/User');
        const days = Math.min(90, Math.max(7, parseInt(req.query.days) || 30));
        const since = new Date(Date.now() - days * 86400000);

        const raw = await User.aggregate([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // Fill missing days with 0
        const map = {};
        raw.forEach(r => { map[r._id] = r.count; });
        const result = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(Date.now() - i * 86400000);
            const key = d.toISOString().slice(0, 10);
            result.push({ date: key, count: map[key] || 0 });
        }

        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
