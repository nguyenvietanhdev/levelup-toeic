/**
 * Unit test — tài khoản ngoại lệ (User.bypassFeatureLock) bỏ qua mốc Level.
 *
 * Chốt lại: cờ ngoại lệ phải được xét TRƯỚC khi tra mốc/level, và phải chặn
 * đúng như cũ với user thường — nếu không, "ngoại lệ" hoặc vô tác dụng, hoặc
 * mở toang tính năng cho mọi người.
 */
jest.mock('../models/FeatureUnlock', () => ({ find: jest.fn() }));
jest.mock('../models/UserProfile', () => ({ findOne: jest.fn() }));
// BẮT BUỘC mock: featureUnlock đọc công tắc tổng qua service này. Không mock thì
// test đi thẳng vào MongoDB và treo tới khi mongoose hết giờ chờ.
jest.mock('../services/gameConfig', () => ({ getGameConfig: jest.fn() }));

const FeatureUnlock = require('../models/FeatureUnlock');
const UserProfile = require('../models/UserProfile');
const { getGameConfig } = require('../services/gameConfig');
const { requireLevel, clearUnlockCache } = require('../services/featureUnlock');

// Mốc: feature:shop mở ở Level 4.
const mockUnlocks = (list) => {
    FeatureUnlock.find.mockReturnValue({ lean: () => Promise.resolve(list) });
};
const mockLevel = (level) => {
    UserProfile.findOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ level }) }) });
};

// Giả lập 1 request đi qua middleware, trả về kết quả: 'next' hoặc payload 403.
async function run(middleware, user) {
    return new Promise((resolve) => {
        const req = { user };
        const res = {
            status(code) { this._code = code; return this; },
            json(payload) { resolve({ blocked: true, code: this._code, payload }); },
        };
        middleware(req, res, (err) => resolve(err ? { error: err } : { blocked: false }));
    });
}

beforeEach(() => {
    clearUnlockCache();
    jest.clearAllMocks();
    mockUnlocks([{ key: 'feature:shop', requiredLevel: 4, isActive: true }]);
    getGameConfig.mockResolvedValue({ featureUnlockEnabled: true });   // mặc định: đang khoá
});

describe('requireLevel + bypassFeatureLock', () => {
    test('user thường chưa đủ level → bị chặn 403', async () => {
        mockLevel(2);
        const r = await run(requireLevel('feature:shop'), { id: 'u1', bypassFeatureLock: false });
        expect(r.blocked).toBe(true);
        expect(r.code).toBe(403);
        expect(r.payload.locked).toBe(true);
        expect(r.payload.requiredLevel).toBe(4);
    });

    test('user thường đủ level → cho qua', async () => {
        mockLevel(5);
        const r = await run(requireLevel('feature:shop'), { id: 'u1', bypassFeatureLock: false });
        expect(r.blocked).toBe(false);
    });

    test('tài khoản ngoại lệ level thấp vẫn cho qua', async () => {
        mockLevel(1);
        const r = await run(requireLevel('feature:shop'), { id: 'u2', bypassFeatureLock: true });
        expect(r.blocked).toBe(false);
    });

    test('ngoại lệ được xét trước — không tra level trong DB', async () => {
        const r = await run(requireLevel('feature:shop'), { id: 'u2', bypassFeatureLock: true });
        expect(r.blocked).toBe(false);
        expect(UserProfile.findOne).not.toHaveBeenCalled();
    });

    test('thiếu cờ (user cũ chưa có field) vẫn bị chặn như thường', async () => {
        mockLevel(1);
        const r = await run(requireLevel('feature:shop'), { id: 'u3' });
        expect(r.blocked).toBe(true);
        expect(r.code).toBe(403);
    });

    test('mốc tắt/không có → mọi user qua, kể cả không ngoại lệ', async () => {
        mockUnlocks([]);
        mockLevel(1);
        const r = await run(requireLevel('feature:shop'), { id: 'u1', bypassFeatureLock: false });
        expect(r.blocked).toBe(false);
    });
});

/**
 * Công tắc TỔNG (GameConfig.featureUnlockEnabled) — khác cờ ngoại lệ ở trên:
 * cờ kia miễn cho MỘT tài khoản, cái này tắt khoá cho TẤT CẢ.
 *
 * Hai ca cuối là quan trọng nhất: hỏng thì phải KHOÁ chứ không được mở toang.
 */
describe('requireLevel + công tắc tổng', () => {
    test('tắt công tắc → user level 1 vào được tính năng Level 4', async () => {
        getGameConfig.mockResolvedValue({ featureUnlockEnabled: false });
        mockLevel(1);
        const r = await run(requireLevel('feature:shop'), { id: 'u1', bypassFeatureLock: false });
        expect(r.blocked).toBe(false);
    });

    test('tắt công tắc thì không tra level trong DB nữa', async () => {
        getGameConfig.mockResolvedValue({ featureUnlockEnabled: false });
        const r = await run(requireLevel('feature:shop'), { id: 'u1', bypassFeatureLock: false });
        expect(r.blocked).toBe(false);
        expect(UserProfile.findOne).not.toHaveBeenCalled();
    });

    test('bật lại → chặn đúng như cũ, mốc không bị mất', async () => {
        getGameConfig.mockResolvedValue({ featureUnlockEnabled: true });
        mockLevel(2);
        const r = await run(requireLevel('feature:shop'), { id: 'u1', bypassFeatureLock: false });
        expect(r.blocked).toBe(true);
        expect(r.payload.requiredLevel).toBe(4);
    });

    test('config cũ chưa có trường này → coi như ĐANG BẬT, vẫn chặn', async () => {
        // Dữ liệu lưu từ trước khi có công tắc mà lại mở toang mọi tính năng thì
        // rất khó lần ra — không ai đi tìm nguyên nhân ở một trường không tồn tại.
        getGameConfig.mockResolvedValue({});
        mockLevel(2);
        const r = await run(requireLevel('feature:shop'), { id: 'u1', bypassFeatureLock: false });
        expect(r.blocked).toBe(true);
    });

    test('đọc config lỗi → vẫn chặn, không mở toang vì một sự cố', async () => {
        getGameConfig.mockRejectedValue(new Error('mất kết nối DB'));
        mockLevel(2);
        const r = await run(requireLevel('feature:shop'), { id: 'u1', bypassFeatureLock: false });
        expect(r.blocked).toBe(true);
    });
});
