import { describe, it, expect } from 'vitest';
import { MILESTONES, MILESTONE_MESSAGES, getMilestoneMessage } from './milestoneMessages.js';

describe('milestoneMessages', () => {
    it('mỗi milestone trong MILESTONES đều có message tương ứng', () => {
        MILESTONES.forEach(m => {
            expect(MILESTONE_MESSAGES[m]?.length).toBeGreaterThan(0);
        });
    });

    it('getMilestoneMessage trả về 1 chuỗi non-empty cho milestone hợp lệ', () => {
        const msg = getMilestoneMessage(50);
        expect(typeof msg).toBe('string');
        expect(msg.length).toBeGreaterThan(0);
    });

    it('getMilestoneMessage trả về fallback cho milestone không tồn tại', () => {
        expect(getMilestoneMessage(999)).toBe('Tuyệt vời! Tiếp tục cố gắng! 🎉');
    });
});
