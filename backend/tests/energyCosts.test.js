/**
 * Giá năng lượng do SERVER quyết, không phải client khai.
 *
 * Vì sao cần: `POST /api/practice/start` lấy `energyCost` từ `req.body` với mặc
 * định 10. Hai đường khai thác, đường thứ hai tệ hơn nhiều:
 *   - `energyCost: 0`  → filter `energy >= 0` luôn đúng, `$inc -0` → chơi miễn phí;
 *   - `energyCost: -100` → `$inc: { energy: -(-100) }` = **+100** → endpoint
 *     "tiêu năng lượng" trở thành vòi bơm năng lượng.
 * Cả hai chỉ cần một tài khoản đã đăng nhập.
 *
 * Bảng giá phải khớp `frontend/src/game/config.js` — lệch nhau thì người dùng
 * thấy một giá còn bị trừ một giá khác. File này chốt sự khớp đó bằng cách đọc
 * thẳng file config của frontend.
 */
const fs = require('fs');
const path = require('path');
const { PRACTICE_COSTS, practiceEnergyCost, isVipActive } = require('../utils/energyCosts');

describe('practiceEnergyCost — giá tra từ bảng, không nhận từ ngoài', () => {
    test('chế độ hợp lệ trả đúng giá', () => {
        expect(practiceEnergyCost('speed-quiz')).toBe(20);
        expect(practiceEnergyCost('flashcard')).toBe(8);
        expect(practiceEnergyCost('multiple-choice')).toBe(10);
    });

    test.each([
        ['chế độ lạ', 'free-mode'],
        ['rỗng', ''],
        ['undefined', undefined],
        ['null', null],
        ['số', 123],
        ['object', {}],
    ])('%s → null, KHÔNG phải giá mặc định', (_label, mode) => {
        // Mặc định `= 10` như bản cũ nghĩa là gõ sai tên chế độ vẫn chơi được
        // với giá tuỳ tiện — và là cách một chế độ đắt bị mua giá rẻ.
        expect(practiceEnergyCost(mode)).toBeNull();
    });

    test('mọi giá đều là số dương — một giá âm là vòi bơm năng lượng', () => {
        for (const [mode, cost] of Object.entries(PRACTICE_COSTS)) {
            expect(Number.isFinite(cost)).toBe(true);
            expect(cost).toBeGreaterThan(0);
        }
    });

    test('bỏ khoảng trắng thừa quanh tên chế độ', () => {
        expect(practiceEnergyCost('  speed-quiz  ')).toBe(20);
    });
});

describe('isVipActive — luật miễn trừ nằm cùng chỗ trừ tiền', () => {
    test('VIP còn hạn → miễn', () => {
        expect(isVipActive({ vipExpiresAt: new Date(Date.now() + 86400000) })).toBe(true);
    });

    test('VIP hết hạn → không miễn', () => {
        expect(isVipActive({ vipExpiresAt: new Date(Date.now() - 1000) })).toBe(false);
    });

    test('không có VIP → không miễn', () => {
        expect(isVipActive({})).toBe(false);
        expect(isVipActive(null)).toBe(false);
        expect(isVipActive({ vipExpiresAt: null })).toBe(false);
    });

    test('đúng thời điểm hết hạn → không còn miễn (biên đóng)', () => {
        const at = Date.now();
        expect(isVipActive({ vipExpiresAt: new Date(at) }, at)).toBe(false);
    });
});

describe('bảng giá server phải khớp bảng của client', () => {
    // Hai nguồn sự thật cho một con số là đúng hình dạng SYS-001. Chưa gộp được
    // (client là ES module, server là CommonJS) nên ít nhất chốt bằng test: lệch
    // nhau thì người dùng thấy một giá còn bị trừ một giá khác.
    const configPath = path.join(__dirname, '..', '..', 'frontend', 'src', 'game', 'config.js');
    const src = fs.readFileSync(configPath, 'utf8');
    const block = src.slice(src.indexOf('energyCosts:'), src.indexOf('xpRewards:'));

    const clientCosts = {};
    for (const m of block.matchAll(/'([a-z-]+)'\s*:\s*(\d+)/g)) {
        clientCosts[m[1]] = Number(m[2]);
    }

    test('đọc được bảng client (chốt chính máy quét)', () => {
        expect(Object.keys(clientCosts).length).toBeGreaterThan(10);
    });

    test('cùng danh sách chế độ', () => {
        expect(Object.keys(PRACTICE_COSTS).sort()).toEqual(Object.keys(clientCosts).sort());
    });

    test('cùng giá cho từng chế độ', () => {
        expect(PRACTICE_COSTS).toEqual(clientCosts);
    });
});
