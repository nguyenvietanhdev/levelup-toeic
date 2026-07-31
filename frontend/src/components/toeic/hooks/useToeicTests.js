import { useState, useEffect, useCallback } from 'react';
import { ToeicAPI } from '@api/toeic.js';
import { Notification } from '@ui/Toaster.jsx';

export function useToeicTests() {
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await ToeicAPI.getTests();
            const apiData = response.data || response;
            setTests(apiData?.success && Array.isArray(apiData.data) ? apiData.data : []);
        } catch (err) {
            console.error('Error loading tests:', err);
            setTests([]);
            Notification.error('Không thể tải danh sách bài thi');
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    return { tests, loading, reload: load };
}
