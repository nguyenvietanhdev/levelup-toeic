/**
 * Lời mời chia sẻ phải được NGƯỜI NHẬN duyệt trước khi vào danh sách chọn đề.
 *
 * Trước đây chia sẻ là bộ từ hiện NGAY trong màn hình người nhận, không hỏi han
 * gì — ai biết ID cũng đẩy được bộ từ vào màn hình người khác. Phiền, và về lâu
 * dài là đường spam.
 *
 * Ba chỗ sai thì bước duyệt thành trang trí:
 *
 * 1. `acceptShares` không lọc kèm `granteeEmail` → gửi cặp (ownerEmail, source)
 *    bất kỳ là TỰ DUYỆT được grant của người khác.
 * 2. `copySharedSource` không kiểm `status` → chưa đồng ý vẫn chép được về kho
 *    mình, mà chép là hành động GHI và đếm vào giới hạn từ.
 * 3. `getSharedTopics` không lọc `accepted` → bộ chờ duyệt vẫn hiện ở chọn đề,
 *    tức là chẳng khác gì trước.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const VocabShare = require('../models/VocabShare');

const controller = fs
    .readFileSync(path.join(__dirname, '..', 'controllers', 'uploadController.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

const routes = fs
    .readFileSync(path.join(__dirname, '..', 'routes', 'uploadRoutes.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

function bodyOf(name) {
    const start = controller.indexOf(`exports.${name}`);
    expect(start).toBeGreaterThan(-1);
    const next = controller.indexOf('exports.', start + 10);
    return controller.slice(start, next === -1 ? undefined : next);
}

describe('model — trạng thái duyệt', () => {
    test('có trường `status` với đúng hai giá trị', () => {
        const p = VocabShare.schema.path('status');
        expect(p).toBeDefined();
        expect(p.enumValues.sort()).toEqual(['accepted', 'pending']);
    });

    test('mặc định là `pending` — grant CŨ cũng phải chờ duyệt', () => {
        // Bản ghi tạo trước khi có trường này sẽ thành chờ duyệt, tức là biến khỏi
        // danh sách chọn đề cho tới khi người nhận đồng ý. Đó là hành vi ĐÚNG với
        // ý định mới; chúng vẫn hiện trong mục "Bộ từ được chia sẻ cho tôi".
        const doc = new VocabShare({ ownerEmail: 'a@b.com', source: 'x', granteeEmail: 'c@d.com' });
        expect(doc.status).toBe('pending');
    });

    test('giá trị lạ bị từ chối ở tầng model', () => {
        const doc = new VocabShare({
            ownerEmail: 'a@b.com', source: 'x', granteeEmail: 'c@d.com', status: 'rejected',
        });
        expect(doc.validateSync()?.errors?.status).toBeDefined();
    });
});

describe('acceptShares — đồng ý nhận', () => {
    test('LỌC KÈM granteeEmail — nếu không ai cũng tự duyệt grant của người khác', () => {
        const b = bodyOf('acceptShares');
        expect(b).toMatch(/granteeEmail:\s*me/);
    });

    test('chỉ chuyển grant đang `pending`', () => {
        // Không lọc thì gọi lại trên grant đã duyệt vẫn báo thành công, và số đếm
        // trả về sai.
        expect(bodyOf('acceptShares')).toMatch(/status:\s*'pending'/);
    });

    test('đặt sang `accepted`', () => {
        expect(bodyOf('acceptShares')).toMatch(/\$set:\s*\{\s*status:\s*'accepted'\s*\}/);
    });

    test('danh sách rỗng / không hợp lệ thì 400', () => {
        const b = bodyOf('acceptShares');
        expect(b).toMatch(/items\.length === 0/);
        expect(b).toMatch(/status\(400\)/);
    });

    test('không có gì để duyệt thì 404, không im lặng báo thành công', () => {
        const b = bodyOf('acceptShares');
        expect(b).toMatch(/modifiedCount === 0/);
        expect(b).toMatch(/status\(404\)/);
    });

    test('bỏ qua phần tử thiếu ownerEmail/source thay vì dựng filter rỗng', () => {
        // Filter rỗng lọt vào `$or` là khớp MỌI grant của người gọi.
        expect(bodyOf('acceptShares')).toMatch(/\.filter\(f => f\.ownerEmail && f\.source\)/);
    });
});

describe('rejectShare — bỏ qua lời mời', () => {
    test('XOÁ grant, chỉ khi đang `pending`', () => {
        const b = bodyOf('rejectShare');
        expect(b).toMatch(/deleteOne\(\{[^}]*granteeEmail:\s*me[^}]*status:\s*'pending'/s);
    });

    test('không tìm thấy thì 404', () => {
        expect(bodyOf('rejectShare')).toMatch(/deletedCount === 0/);
    });
});

describe('getPendingShares — danh sách chờ duyệt', () => {
    test('chỉ lấy grant `pending` của chính người gọi', () => {
        expect(bodyOf('getPendingShares'))
            .toMatch(/VocabShare\.find\(\{\s*granteeEmail:\s*me,\s*status:\s*'pending'\s*\}\)/);
    });

    test('trả TÊN chủ sở hữu, không bắt người nhận đọc email', () => {
        expect(bodyOf('getPendingShares')).toMatch(/ownerName:/);
    });

    test('trả số từ để người nhận biết bộ to nhỏ TRƯỚC khi đồng ý', () => {
        expect(bodyOf('getPendingShares')).toMatch(/wordCount/);
    });

    test('bộ đã hết hạn vẫn hiện, có cờ `expired`', () => {
        // Biến mất im lặng thì người nhận không hiểu lời mời đi đâu.
        expect(bodyOf('getPendingShares')).toMatch(/expired:\s*wordCount === 0/);
    });
});

describe('sao chép cũng phải ĐÃ DUYỆT', () => {
    test('copySharedSource kiểm `status: accepted`', () => {
        // Chép là hành động GHI vào kho mình và đếm vào giới hạn từ — cho chép khi
        // chưa đồng ý thì bước duyệt chỉ là trang trí.
        expect(bodyOf('copySharedSource'))
            .toMatch(/VocabShare\.findOne\(\{[^}]*granteeEmail:\s*me,\s*status:\s*'accepted'/s);
    });
});

describe('route', () => {
    test('cả ba route đều có protect', () => {
        expect(routes).toMatch(/router\.get\(\s*['"]\/shares\/pending['"]\s*,\s*protect\s*,\s*getPendingShares/);
        expect(routes).toMatch(/router\.post\(\s*['"]\/shares\/accept['"]\s*,\s*protect\s*,\s*acceptShares/);
        expect(routes).toMatch(/router\.delete\(\s*['"]\/shares\/pending\/:ownerEmail\/:source['"]\s*,\s*protect\s*,\s*rejectShare/);
    });

    test('tự kiểm: bộ dò đọc được thân hàm thật', () => {
        expect(bodyOf('acceptShares').length).toBeGreaterThan(400);
        expect(bodyOf('getPendingShares').length).toBeGreaterThan(400);
    });
});

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
