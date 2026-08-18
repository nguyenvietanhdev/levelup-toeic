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

    test('bảng giá server KHỚP bảng client — hai nguồn sự thật cho một con số', () => {
        // Comment đầu file này TUYÊN BỐ "chốt sự khớp đó bằng cách đọc thẳng file
        // config của frontend" — nhưng không hề có test nào làm. Lời hứa trong
        // comment mà không có mã đằng sau còn tệ hơn im lặng: người đọc tin là đã
        // được bảo vệ.
        //
        // Trả giá thật: thêm chế độ luyện viết chữ Hán, khai giá ở client mà quên
        // server → `practiceEnergyCost` trả null → không vào được chế độ, và thông
        // báo lỗi không nói gì về nguyên nhân.
        const fs = require('fs');
        const path = require('path');
        const cfg = fs.readFileSync(
            path.join(__dirname, '..', '..', 'frontend', 'src', 'game', 'config.js'), 'utf8'
        );

        const block = /energyCosts:\s*\{([\s\S]*?)\n\s*\},/.exec(cfg);
        expect(block).not.toBeNull();

        const clientCosts = {};
        for (const m of block[1].matchAll(/'([a-z-]+)'\s*:\s*(\d+)/g)) {
            clientCosts[m[1]] = Number(m[2]);
        }
        expect(Object.keys(clientCosts).length).toBeGreaterThan(5); // quét được thật

        const onlyServer = Object.keys(PRACTICE_COSTS).filter(k => !(k in clientCosts));
        const onlyClient = Object.keys(clientCosts).filter(k => !(k in PRACTICE_COSTS));
        const different = Object.keys(clientCosts)
            .filter(k => k in PRACTICE_COSTS && clientCosts[k] !== PRACTICE_COSTS[k])
            .map(k => `${k}: client ${clientCosts[k]} ≠ server ${PRACTICE_COSTS[k]}`);

        expect({ onlyServer, onlyClient, different })
            .toEqual({ onlyServer: [], onlyClient: [], different: [] });
    });

    test('KHÔNG giá nào âm — một giá âm là vòi bơm năng lượng', () => {
        // Ranh giới thật là số ÂM, không phải số 0: `$inc: { energy: -cost }`
        // với `cost` âm sẽ CỘNG năng lượng, biến endpoint tiêu thành vòi bơm.
        // `0` thì vô hại — nó chỉ có nghĩa là chế độ miễn phí.
        for (const [mode, cost] of Object.entries(PRACTICE_COSTS)) {
            expect(Number.isFinite(cost)).toBe(true);
            expect(cost).toBeGreaterThanOrEqual(0);
        }
    });

    test('chỉ chế độ ÔN LẠI TỪ SAI được miễn phí', () => {
        // Miễn phí là ngoại lệ có chủ đích, không phải mặc định: ôn lại thứ mình
        // đã sai là việc nên khuyến khích. Ràng buộc lại để một chế độ khác vô
        // tình tụt về 0 sẽ bị bắt.
        const mienPhi = Object.entries(PRACTICE_COSTS)
            .filter(([, cost]) => cost === 0)
            .map(([mode]) => mode);
        expect(mienPhi).toEqual(['review-mistakes']);
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
