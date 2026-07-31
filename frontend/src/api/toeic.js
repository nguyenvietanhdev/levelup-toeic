// TOEIC API Client (migrated from public/js/modules/toeic/toeicAPI.js)
import { Http } from './http.js';
export const ToeicAPI = {
    baseUrl: '/toeic',

    /**
     * Get available tests
     */
    async getTests(filters = {}) {
        try {
            const params = new URLSearchParams(filters);
            const response = await Http.get(`${this.baseUrl}/tests?${params}`);
            return response;
        } catch (error) {
            console.error('Error fetching tests:', error);
            throw error;
        }
    },

    /**
     * Get single test details
     */
    async getTest(testId) {
        try {
            const response = await Http.get(`${this.baseUrl}/tests/${testId}`);
            return response;
        } catch (error) {
            console.error('Error fetching test:', error);
            throw error;
        }
    },

    /**
     * Start test attempt
     * @param {string} testId - ID of the test
     * @param {boolean} fillBlankMode - Whether to start in fill-blank mode (keeps keywords and correctAnswer)
     */
    async startAttempt(testId, fillBlankMode = false) {
        try {
            const response = await Http.post(`${this.baseUrl}/attempts/start`, {
                testId,
                fillBlankMode
            });
            return response;
        } catch (error) {
            console.error('Error starting attempt:', error);
            throw error;
        }
    },

    /**
     * Submit answer
     */
    async submitAnswer(attemptId, answerData) {
        try {
            const response = await Http.put(
                `${this.baseUrl}/attempts/${attemptId}/answer`,
                answerData
            );
            return response;
        } catch (error) {
            console.error('Error submitting answer:', error);
            throw error;
        }
    },

    /**
     * Pause test
     */
    async pauseAttempt(attemptId) {
        try {
            const response = await Http.put(
                `${this.baseUrl}/attempts/${attemptId}/pause`
            );
            return response;
        } catch (error) {
            console.error('Error pausing attempt:', error);
            throw error;
        }
    },

    /**
     * Resume test
     */
    async resumeAttempt(attemptId) {
        try {
            const response = await Http.put(
                `${this.baseUrl}/attempts/${attemptId}/resume`
            );
            return response;
        } catch (error) {
            console.error('Error resuming attempt:', error);
            throw error;
        }
    },

    /**
     * Get in-progress attempt (for resume on page reload)
     */
    async getInProgressAttempt() {
        try {
            const response = await Http.get(`${this.baseUrl}/my-attempts/in-progress`);
            return response;
        } catch (error) {
            console.error('Error fetching in-progress attempt:', error);
            return { success: true, data: null };
        }
    },

    /**
     * Submit final test
     */
    async submitAttempt(attemptId, duration) {
        try {
            const response = await Http.post(
                `${this.baseUrl}/attempts/${attemptId}/submit`,
                { duration }
            );
            return response;
        } catch (error) {
            console.error('Error submitting attempt:', error);
            throw error;
        }
    },

    /**
     * Get attempt review
     */
    async getAttemptReview(attemptId) {
        try {
            const response = await Http.get(
                `${this.baseUrl}/attempts/${attemptId}/review`
            );
            return response;
        } catch (error) {
            console.error('Error fetching review:', error);
            throw error;
        }
    },

    /**
     * Get user's test history
     */
    async getMyAttempts(filters = {}) {
        try {
            const params = new URLSearchParams(filters);
            const response = await Http.get(`${this.baseUrl}/my-attempts?${params}`);
            return response;
        } catch (error) {
            console.error('Error fetching attempts:', error);
            throw error;
        }
    },

    /**
     * Get analytics overview
     */
    async getAnalyticsOverview() {
        try {
            const response = await Http.get(`${this.baseUrl}/analytics/overview`);
            return response;
        } catch (error) {
            console.error('Error fetching analytics:', error);
            throw error;
        }
    },

    /**
     * Get score progression
     */
    async getScoreProgress(limit = 10) {
        try {
            const response = await Http.get(
                `${this.baseUrl}/analytics/progress?limit=${limit}`
            );
            return response;
        } catch (error) {
            console.error('Error fetching progress:', error);
            throw error;
        }
    },

    /**
     * Get part analysis
     */
    async getPartAnalysis() {
        try {
            const response = await Http.get(`${this.baseUrl}/analytics/parts`);
            return response;
        } catch (error) {
            console.error('Error fetching part analysis:', error);
            throw error;
        }
    },

    /** Phân tích tốc độ phản hồi mỗi câu (giây/câu theo Part + đoán bừa). */
    async getSpeedAnalysis() {
        try {
            return await Http.get(`${this.baseUrl}/analytics/speed`);
        } catch (error) {
            console.error('Error fetching speed analysis:', error);
            throw error;
        }
    },

    /** Ước lượng điểm nếu đi thi thật + đối chiếu mục tiêu đã đặt trong Cài đặt. */
    async getScorePrediction() {
        try {
            return await Http.get(`${this.baseUrl}/analytics/prediction`);
        } catch (error) {
            console.error('Error fetching score prediction:', error);
            throw error;
        }
    }
};
