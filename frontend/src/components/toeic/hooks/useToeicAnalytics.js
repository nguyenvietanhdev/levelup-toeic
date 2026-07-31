import { useState, useEffect, useCallback } from 'react';
import { ToeicAPI } from '@api/toeic.js';

function unwrap(res) {
    return res?.data?.data || res?.data || res;
}

export function useToeicAnalytics({ enabled = true } = {}) {
    const [overview, setOverview] = useState(null);
    const [progress, setProgress] = useState([]);
    const [parts, setParts] = useState([]);
    const [speed, setSpeed] = useState(null);
    const [prediction, setPrediction] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [ov, pr, pa, sp, pd] = await Promise.all([
                ToeicAPI.getAnalyticsOverview(),
                ToeicAPI.getScoreProgress(10),
                ToeicAPI.getPartAnalysis(),
                ToeicAPI.getSpeedAnalysis(),
                ToeicAPI.getScorePrediction(),
            ]);
            setOverview(unwrap(ov) || null);
            const prData = unwrap(pr);
            setProgress(Array.isArray(prData) ? prData : []);
            const paData = unwrap(pa);
            setParts(Array.isArray(paData) ? paData : []);
            setSpeed(unwrap(sp) || null);
            setPrediction(unwrap(pd) || null);
        } catch (err) {
            setError(err);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (enabled) load();
    }, [enabled, load]);

    return { overview, progress, parts, speed, prediction, loading, error, reload: load };
}
