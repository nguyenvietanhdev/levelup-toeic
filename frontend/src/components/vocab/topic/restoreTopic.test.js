/**
 * Hai lỗ CÓ SẴN của luồng bộ từ cá nhân (giai đoạn 6 của kế hoạch chia sẻ).
 *
 * Cả hai có trước tính năng chia sẻ, nhưng tính năng đó làm chúng lộ rõ hơn vì
 * giờ có thêm hai loại nguồn không nằm trong kho chung.
 *
 * LỖ 1 — `restoreLastTopic` chỉ tìm trong `availableTopics`, mà danh sách đó chỉ
 * chứa đề CÔNG KHAI. Bộ riêng (`personal:`), bộ được chia sẻ (`shared:`) và nhóm
 * từ sai (`wrong:`) không có ở đó → mọi lần F5 khi đang học chúng đều tụt về đề
 * mặc định, im lặng, không thông báo gì.
 *
 * LỖ 2 — `partSelector` gọi `GameLogic.loadVocabularyBySource()` khi kho từ
 * rỗng, mà hàm đó đi `/api/vocabulary` (kho CHUNG). Đã kiểm bằng dữ liệu thật:
 * cả 5 nguồn cá nhân đều KHÔNG có mặt trong `vocabularies`, `vocabularies_en`
 * hay `vocabularies_zh`. Nó trả rỗng, `.catch(() => {})` nuốt luôn lỗi, và
 * người dùng thấy lưới Part trống không kèm lời giải thích nào.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const topicSel = strip(readFileSync(join(__dirname, 'topicSelector.js'), 'utf8'));
const partSel = strip(readFileSync(
    join(__dirname, '..', 'part', 'partSelector.js'), 'utf8'));

function restoreBody() {
    const i = topicSel.indexOf('async restoreLastTopic()');
    expect(i).toBeGreaterThan(-1);
    const j = topicSel.indexOf('async _loadDefaultTopic()', i);
    expect(j).toBeGreaterThan(-1);
    return topicSel.slice(i, j);
}

describe('khôi phục đề sau khi F5', () => {
    test('bộ từ RIÊNG được khôi phục, không tụt về đề mặc định', () => {
        const b = restoreBody();
        expect(b).toMatch(/startsWith\('personal:'\)/);
        expect(b).toMatch(/selectPersonalTopic\(/);
    });

    test('bộ ĐƯỢC CHIA SẺ được khôi phục', () => {
        const b = restoreBody();
        expect(b).toMatch(/startsWith\('shared:'\)/);
        expect(b).toMatch(/selectSharedTopic\(/);
    });

    test('nhóm TỪ SAI được khôi phục', () => {
        const b = restoreBody();
        expect(b).toMatch(/startsWith\('wrong:'\)/);
        expect(b).toMatch(/selectWrongWordsTopic\(/);
    });

    test('đề công khai vẫn đi đường cũ', () => {
        expect(restoreBody()).toMatch(/availableTopics\.find\(t => t\.id === lastTopicId\)/);
    });

    test('id bộ chia sẻ tách ở dấu ":" ĐẦU TIÊN, không split cả chuỗi', () => {
        // `shared:<email>:<source>` — email không chứa ':' nhưng TÊN BỘ thì có
        // thể. `split(':')` băm nát tên bộ và khôi phục nhầm/hụt.
        const b = restoreBody();
        expect(b).toMatch(/indexOf\(':'\)/);
        expect(b).not.toMatch(/\.split\(':'\)/);
    });

    test('bộ đã bị xoá / hết hạn / thu hồi quyền thì về mặc định, không kẹt', () => {
        // Ba chuyện đó đều xảy ra được giữa hai lần mở app.
        const b = restoreBody();
        expect(b).toMatch(/catch/);
        expect(b).toMatch(/_loadDefaultTopic\(\)/);
    });
});

describe('nạp lại kho từ khi lưới Part rỗng', () => {
    test('partSelector chỉ PHÁT YÊU CẦU, không tự gọi API kho chung', () => {
        // `loadVocabularyBySource` đi /api/vocabulary. Nguồn cá nhân / được chia
        // sẻ / từ sai không nằm ở đó → luôn trả rỗng.
        expect(partSel).toMatch(/EventBus\.emit\('vocab:reload-requested'\)/);
        expect(partSel).not.toMatch(/loadVocabularyBySource/);
    });

    test('topicSelector nghe yêu cầu đó và định tuyến', () => {
        expect(topicSel).toMatch(/EventBus\.on\('vocab:reload-requested'/);
        expect(topicSel).toMatch(/TopicSelector\.restoreLastTopic\(\)/);
    });

    test('đăng ký ở CẤP MODULE, không nằm trong init()', () => {
        // `TopicSelector.init()` hiện không được gọi từ đâu cả — chỉ
        // `restoreLastTopic()` được gọi (GameContext.jsx). Đặt listener vào
        // init() là nó không bao giờ chạy, mà triệu chứng y hệt lúc chưa sửa.
        const i = topicSel.indexOf("EventBus.on('vocab:reload-requested'");
        const initStart = topicSel.indexOf('async init()');
        const initEnd = topicSel.indexOf('async loadAvailableTopics()');
        expect(i).toBeGreaterThan(-1);
        expect(i < initStart || i > initEnd).toBe(true);
    });

    test('KHÔNG tạo vòng phụ thuộc: partSelector không import topicSelector', () => {
        // topicSelector đã import partSelector (gọi clearSelection/reloadParts).
        expect(partSel).not.toMatch(/from '@components\/vocab\/topic\/topicSelector\.js'/);
    });
});
