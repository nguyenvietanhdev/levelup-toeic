/**
 * Trừ tiền phải ATOMIC (SEC-be.economy-001).
 *
 * Test này KHÔNG chứng minh được tính atomic thật (cần MongoDB thật + bắn song
 * song). Việc nó chặn là hồi quy: ai đó đổi ngược về đọc → kiểm → trừ → save(),
 * hoặc bỏ điều kiện đủ tiền ra khỏi filter, thì đỏ ngay. Đó chính là hình dạng
 * bug cũ đã cho phép mua song song nhân đôi vật phẩm.
 *
 * Pure, no DB — model được mock.
 */
jest.mock('../models/UserStats', () => ({ findOneAndUpdate: jest.fn() }));

const UserStats = require('../models/UserStats');
const { buildDebitQuery, debit } = require('../services/balanceService');

beforeEach(() => jest.clearAllMocks());

describe('buildDebitQuery', () => {
    test('coins: điều kiện đủ tiền nằm TRONG filter, không phải kiểm riêng bên ngoài', () => {
        const { filter, update } = buildDebitQuery('u1', 'coins', 120);
        expect(filter).toEqual({ userId: 'u1', coins: { $gte: 120 } });
        expect(update).toEqual({ $inc: { coins: -120 } });
    });

    test('gems: cùng hình dạng, khác trường', () => {
        const { filter, update } = buildDebitQuery('u1', 'gems', 7);
        expect(filter).toEqual({ userId: 'u1', gems: { $gte: 7 } });
        expect(update).toEqual({ $inc: { gems: -7 } });
    });

    test('currency lạ rơi về gems — giữ đúng hành vi cũ của shopController', () => {
        // Code cũ: `if (currency === 'coins') coins -= x; else gems -= x`.
        // Khác biệt duy nhất: giờ trường hợp này cũng có cửa chặn đủ tiền.
        const { filter, update } = buildDebitQuery('u1', 'vnd', 5);
        expect(filter).toEqual({ userId: 'u1', gems: { $gte: 5 } });
        expect(update).toEqual({ $inc: { gems: -5 } });
    });

    test('ngưỡng chặn phải đúng bằng số tiền trừ, không phải 0', () => {
        // Chốt ở 0 thì số dư tụt âm — cửa coi như không có.
        const { filter, update } = buildDebitQuery('u1', 'coins', 250);
        expect(filter.coins.$gte).toBe(250);
        expect(update.$inc.coins).toBe(-250);
    });

    test('trường bị chặn và trường bị trừ luôn là MỘT', () => {
        // Chặn coins mà trừ gems thì cửa vô nghĩa.
        for (const cur of ['coins', 'gems', 'khac']) {
            const { filter, update } = buildDebitQuery('u1', cur, 10);
            const guarded = Object.keys(filter).filter(k => k !== 'userId');
            expect(guarded).toEqual(Object.keys(update.$inc));
        }
    });
});

describe('debit', () => {
    test('gọi findOneAndUpdate một lần, kèm { new: true } để lấy doc SAU khi trừ', async () => {
        // { new: true } không phải tuỳ chọn: shopController phải dùng doc trả về,
        // nếu nhận doc cũ rồi save() thì số dư bị ghi đè về trước lúc trừ.
        UserStats.findOneAndUpdate.mockResolvedValue({ coins: 30 });

        const res = await debit('u1', 'coins', 70);

        expect(UserStats.findOneAndUpdate).toHaveBeenCalledTimes(1);
        expect(UserStats.findOneAndUpdate).toHaveBeenCalledWith(
            { userId: 'u1', coins: { $gte: 70 } },
            { $inc: { coins: -70 } },
            { new: true },
        );
        expect(res).toEqual({ coins: 30 });
    });

    test('không đủ tiền → null, không ném lỗi', async () => {
        UserStats.findOneAndUpdate.mockResolvedValue(null);
        await expect(debit('u1', 'coins', 999999)).resolves.toBeNull();
    });

    test('không đọc số dư ra trước rồi mới ghi — chỉ đúng một lượt chạm DB', async () => {
        // Hình dạng cũ là findOne() rồi save(): hai lượt, có khe hở ở giữa.
        UserStats.findOneAndUpdate.mockResolvedValue({ gems: 1 });
        await debit('u1', 'gems', 2);
        expect(Object.keys(UserStats)).toEqual(['findOneAndUpdate']);
        expect(UserStats.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });
});
