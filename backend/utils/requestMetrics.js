// Bộ đếm số liệu request cho dashboard admin (/api/admin/metrics)
const metrics = {
    startTime: Date.now(),
    totalRequests: 0,
    statusCodes: { '2xx': 0, '4xx': 0, '5xx': 0 },
    latencies: [],          // rolling last 1000 request durations (ms)
    routeStats: {},         // { "METHOD /path": { count, totalMs } }
    slowRequests: [],       // last 15 requests >300ms
    // 60-slot circular buffer: each slot = requests in that minute
    minuteBuffer: new Array(60).fill(0),
    minuteIdx: 0,
    cpuUsageSnapshot: process.cpuUsage(),
    cpuPercent: 0,
    cpuSampleTime: Date.now(),
};

// Rotate minute bucket every 60s
setInterval(() => {
    metrics.minuteIdx = (metrics.minuteIdx + 1) % 60;
    metrics.minuteBuffer[metrics.minuteIdx] = 0;
}, 60000);

// CPU sampling every 5s
setInterval(() => {
    const now = Date.now();
    const elapsed = (now - metrics.cpuSampleTime) * 1000; // µs
    const usage = process.cpuUsage(metrics.cpuUsageSnapshot);
    metrics.cpuPercent = elapsed > 0
        ? Math.min(100, Math.round(((usage.user + usage.system) / elapsed) * 100))
        : 0;
    metrics.cpuUsageSnapshot = process.cpuUsage();
    metrics.cpuSampleTime = now;
}, 5000);

function requestMetricsMiddleware(req, res, next) {
    const startHr = process.hrtime.bigint();
    res.on('finish', () => {
        const durMs = Number(process.hrtime.bigint() - startHr) / 1e6;
        metrics.totalRequests++;
        metrics.minuteBuffer[metrics.minuteIdx]++;

        const code = res.statusCode;
        if      (code >= 500) metrics.statusCodes['5xx']++;
        else if (code >= 400) metrics.statusCodes['4xx']++;
        else                  metrics.statusCodes['2xx']++;

        // Rolling latency buffer
        metrics.latencies.push(durMs);
        if (metrics.latencies.length > 1000) metrics.latencies.shift();

        // Per-route stats (API only, normalize IDs)
        if (req.path.startsWith('/api/')) {
            const norm = req.path
                .replace(/\/[0-9a-f]{24}/gi, '/:id')
                .replace(/\/\d+/g, '/:n');
            const key = `${req.method} ${norm}`;
            if (!metrics.routeStats[key]) metrics.routeStats[key] = { count: 0, totalMs: 0 };
            metrics.routeStats[key].count++;
            metrics.routeStats[key].totalMs += durMs;
        }

        // Slow request log (>300ms, API only)
        if (durMs > 300 && req.path.startsWith('/api/')) {
            metrics.slowRequests.unshift({
                method: req.method,
                path: req.path,
                status: code,
                ms: Math.round(durMs),
                ts: new Date().toISOString(),
            });
            if (metrics.slowRequests.length > 15) metrics.slowRequests.pop();
        }
    });
    next();
}

module.exports = { metrics, requestMetricsMiddleware };
