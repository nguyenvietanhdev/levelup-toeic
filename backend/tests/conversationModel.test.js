/**
 * Model phiên Hội thoại.
 *
 * Ba thứ ở đây là CHỐT AN TOÀN, không phải trang trí:
 *
 *   1. `usedWords` do SERVER giữ. Client cũng tự chấm để tô sáng cho mượt,
 *      nhưng con số ăn thưởng phải tính lại ở server — sửa được request là sửa
 *      được thưởng. Cùng nguyên tắc với năng lượng/XP trong dự án.
 *   2. `reward.claimed` chặn nhận thưởng hai lần. Thiếu nó thì gọi lại endpoint
 *      `finish` là cộng tiếp.
 *   3. `targetWords` chốt lúc MỞ phiên. Tính lại về sau thì kho từ đổi giữa
 *      chừng là người học dùng đúng từ vẫn trượt.
 */
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');

function make(over = {}) {
    return new Conversation({
        userId: new mongoose.Types.ObjectId(),
        source: 'zh_giaotiep_tuvung',
        part: 'BUỔI 6',
        lang: 'zh',
        ...over,
    });
}

describe('trường bắt buộc', () => {
    test('thiếu userId thì không hợp lệ', () => {
        const c = new Conversation({ source: 'x' });
        expect(c.validateSync()?.errors?.userId).toBeDefined();
    });

    test('thiếu source thì không hợp lệ', () => {
        const c = new Conversation({ userId: new mongoose.Types.ObjectId() });
        expect(c.validateSync()?.errors?.source).toBeDefined();
    });

    test('part để rỗng được — "toàn bộ đề" là lựa chọn hợp lệ', () => {
        expect(make({ part: '' }).validateSync()?.errors?.part).toBeUndefined();
    });
});

describe('mặc định an toàn', () => {
    test('phiên mới là active, chưa nhận thưởng', () => {
        const c = make();
        expect(c.status).toBe('active');
        expect(c.reward.claimed).toBe(false);
        expect(c.reward.xp).toBe(0);
        expect(c.reward.coins).toBe(0);
    });

    test('usedWords rỗng, KHÔNG phải copy của targetWords', () => {
        // Khởi tạo bằng targetWords là cho điểm tối đa trước khi người học gõ.
        const c = make({ targetWords: ['高兴', '晚上'] });
        expect(c.usedWords).toEqual([]);
    });

    test('lang chỉ nhận en/zh', () => {
        const c = make({ lang: 'fr' });
        expect(c.validateSync()?.errors?.lang).toBeDefined();
    });

    test('status chỉ nhận ba giá trị đã biết', () => {
        const c = make({ status: 'paused' });
        expect(c.validateSync()?.errors?.status).toBeDefined();
    });
});

describe('lượt hội thoại', () => {
    test('role chỉ nhận npc/user', () => {
        const c = make({ turns: [{ role: 'system', content: 'x' }] });
        expect(c.validateSync()?.errors?.['turns.0.role']).toBeDefined();
    });

    test('lượt phải có nội dung', () => {
        const c = make({ turns: [{ role: 'user' }] });
        expect(c.validateSync()?.errors?.['turns.0.content']).toBeDefined();
    });

    test('mỗi lượt nhớ từ nó dùng được', () => {
        // Lưu sẵn để khỏi tính lại khi xem lịch sử, và để hiện đúng câu nào ăn
        // điểm.
        const c = make({ turns: [{ role: 'user', content: '我很高兴', matched: ['高兴'] }] });
        expect(c.turns[0].matched).toEqual(['高兴']);
    });
});

describe('dọn phiên bỏ dở', () => {
    test('phiên mới có hạn tự xoá', () => {
        // Người học mở rồi đóng tab là chuyện thường; không có TTL thì DB đầy
        // phiên `active` không bao giờ xong.
        const c = make();
        expect(c.expiresAt).toBeInstanceOf(Date);
        expect(c.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    test('hạn đúng bằng hằng số đã khai', () => {
        const days = Conversation.ABANDONED_TTL_DAYS;
        expect(days).toBeGreaterThan(0);
        const c = make();
        const thực = Math.round((c.expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
        expect(thực).toBe(days);
    });

    test('đặt null được để GIỮ phiên đã xong', () => {
        // Phiên xong là lịch sử học tập — xoá đi thì người dùng mất dữ liệu của
        // chính mình. Index TTL bỏ qua doc có expiresAt null.
        const c = make({ expiresAt: null });
        expect(c.validateSync()?.errors?.expiresAt).toBeUndefined();
        expect(c.expiresAt).toBeNull();
    });
});

describe('chỉ mục cho truy vấn hay dùng', () => {
    const idx = Conversation.schema.indexes();

    test('có index cho "phiên đang dở của tôi"', () => {
        const hit = idx.find(([k]) => k.userId === 1 && k.status === 1);
        expect(hit).toBeTruthy();
    });

    test('có index TTL trên expiresAt', () => {
        const hit = idx.find(([k, o]) => k.expiresAt === 1 && o?.expireAfterSeconds === 0);
        expect(hit).toBeTruthy();
    });
});
