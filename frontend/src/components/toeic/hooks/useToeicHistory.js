import { useState, useEffect, useCallback } from 'react';
import { ToeicAPI } from '@api/toeic.js';

const PAGE_SIZE = 10;

export function useToeicHistory({ enabled = true } = {}) {
    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const load = useCallback(async (targetPage = 1) => {
        setLoading(true);
        setError(null);
        try {
            const response = await ToeicAPI.getMyAttempts({
                limit: PAGE_SIZE,
                skip: (targetPage - 1) * PAGE_SIZE,
            });
            const apiData = response.data || response;
            if (apiData?.success && Array.isArray(apiData.data)) {
                setItems(apiData.data);
                const total = apiData.total || apiData.data.length;
                setTotalPages(Math.max(1, Math.ceil(total / PAGE_SIZE)));
                setPage(targetPage);
            } else {
                setItems([]);
                setTotalPages(1);
            }
        } catch (err) {
            setError(err);
            setItems([]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (enabled) load(1);
    }, [enabled, load]);

    return { items, page, totalPages, loading, error, goToPage: load };
}
