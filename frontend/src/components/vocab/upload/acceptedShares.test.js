/**
 * Mục "Bộ từ đã nhận" trong tab Chia sẻ: xem tên bộ, đồng bộ lại, sao chép.
 *
 * Trước đây tab Chia sẻ chỉ nói về bộ MÌNH cho người khác và lời mời CHỜ duyệt.
 * Bộ đã nhận rồi thì không hiện ở đâu trong tab này — nhận xong là chúng biến
 * mất khỏi màn hình, chỉ còn thấy gián tiếp ở danh sách chọn đề.
 *
 * Bốn chỗ dễ hỏng im lặng:
 *   1. Nhánh danh sách RỖNG ghi innerHTML riêng — gắn listener chỉ ở nhánh có
 *      dữ liệu là nút Đồng bộ chết im lặng đúng lúc người ta cần nó nhất (vừa
 *      được chia sẻ, bấm để thấy bộ mới).
 *   2. Nút Sao chép không tự khoá → bấm dồn là nhiều request song song, sinh
 *      thêm bản `-copy` ngoài ý muốn.
 *   3. Sao chép xong không làm mới danh sách bộ riêng → bộ mới chép về không
 *      xuất hiện, người dùng tưởng hỏng và bấm lại (xem lỗi 2).
 *   4. Bộ đã hết hạn vẫn hiện nút Sao chép → bấm vào chỉ nhận lỗi từ server.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'openUploadModal.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

function body() {
    const i = src.indexOf('const loadAcceptedShares');
    expect(i).toBeGreaterThan(-1);
    const j = src.indexOf('const loadSharePeople', i);
    expect(j).toBeGreaterThan(-1);
    return src.slice(i, j);
}

describe('nguồn dữ liệu', () => {
    test('dùng lại sharedTopics — nó đã chỉ trả bộ ĐÃ DUYỆT', () => {
        expect(body()).toMatch(/UploadVocabAPI\.sharedTopics\(\)/);
    });

    test('hiện TÊN bộ từ, không phải chuỗi kỹ thuật', () => {
        // sourceLabel đổi `dich-nhanh-en` thành "Dịch nhanh · Tiếng Anh".
        expect(body()).toMatch(/sourceLabel\(r\.source\)/);
    });

    test('hiện tên CHỦ bộ từ, không hiện email', () => {
        const b = body();
        expect(b).toMatch(/r\.ownerName/);
        // ownerEmail chỉ được dùng làm khoá gọi API, không đưa ra màn hình.
        expect(b).not.toMatch(/>\s*\$\{esc\(r\.ownerEmail\)\}/);
    });

    test('mọi giá trị từ server đều qua esc() trước khi vào innerHTML', () => {
        const b = body();
        expect(b).toMatch(/esc\(sourceLabel\(r\.source\)\)/);
        expect(b).toMatch(/esc\(r\.ownerName/);
        expect(b).toMatch(/data-owner="\$\{esc\(r\.ownerEmail\)\}"/);
    });
});

describe('nút Đồng bộ — ở HEADER, cạnh nút đóng', () => {
    test('nút nằm trong header, không nằm trong mục "Bộ từ đã nhận"', () => {
        // Nó làm mới cả tab chứ không riêng một mục, nên chỗ đúng của nó là header.
        expect(src).toMatch(/id="upload-sync"/);
        expect(body()).not.toMatch(/accepted-sync-btn/);
    });

    test('làm mới theo TAB đang mở, không gọi mù một hàm', () => {
        const i = src.indexOf('const onSyncClick');
        expect(i).toBeGreaterThan(-1);
        const h = src.slice(i, i + 700);
        expect(h).toMatch(/_currentTab === 'share'\) loadShareTab\(\)/);
        expect(h).toMatch(/_currentTab === 'manage'\) loadMyTopics\(\)/);
    });

    test('tab nhập liệu thì KHÔNG báo "đã đồng bộ"', () => {
        // Tab "Thêm từ mới"/"Thêm JSON" không có gì để tải lại; báo thành công ở
        // đó là nói dối người dùng rằng vừa có việc gì đó xảy ra.
        const i = src.indexOf('const onSyncClick');
        const h = src.slice(i, i + 700);
        expect(h).toMatch(/else return;/);
        expect(h.indexOf('else return;')).toBeLessThan(h.indexOf('Đã đồng bộ'));
    });

    test('_currentTab được cập nhật khi đổi tab', () => {
        // Không cập nhật thì nút luôn làm mới tab mở đầu tiên.
        expect(src).toMatch(/onEnterTab: \(t\) => \{\s*\n\s*_currentTab = t;/);
    });

    test('listener document được GỠ khi đóng modal', () => {
        // Nó gọi các hàm `load*` là closure của lần mở này. Không gỡ thì mở lần
        // hai là hai listener cùng chạy, cái cũ trỏ vào DOM đã bị vứt.
        expect(src).toMatch(/onClose: \(\) => document\.removeEventListener\('click', onSyncClick\)/);
    });

    test('nhánh rỗng vẫn dựng phần đầu, không phải chỉ một câu chữ', () => {
        expect(body()).toMatch(/box\.innerHTML = head\s*\n?\s*\+/);
    });
});

describe('nút Sao chép', () => {
    test('gửi CẶP (ownerEmail, source)', () => {
        // Hai người cùng chia sẻ bộ trùng tên thì thiếu ownerEmail là chép nhầm bộ.
        expect(body()).toMatch(/copySharedSource\(b\.dataset\.owner, b\.dataset\.source\)/);
    });

    test('tự KHOÁ trong lúc chạy rồi mở lại ở finally', () => {
        const b = body();
        expect(b).toMatch(/b\.disabled = true/);
        expect(b).toMatch(/finally\s*\{[\s\S]*b\.disabled = false/);
    });

    test('sao chép xong thì làm mới danh sách bộ riêng', () => {
        // Bản sao là bộ MỚI của mình; không gọi lại thì nó không hiện ra và người
        // dùng tưởng chép hụt.
        expect(body()).toMatch(/loadMyTopics\(\)/);
    });

    test('KHÔNG hiện nút cho bộ đã hết hạn', () => {
        // Bộ hết hạn là không còn từ nào để chép; hiện nút chỉ dẫn tới lỗi server.
        expect(body()).toMatch(/\$\{r\.expired \? '' :/);
    });

    test('báo đúng lý do server trả về, không nuốt thành thông báo chung', () => {
        // Vượt hạn mức từ và bộ hết hạn là hai lỗi khác nhau, phải nói rõ.
        expect(body()).toMatch(/Notification\.error\(r\?\.message \|\|/);
    });
});

describe('tab riêng "Được chia sẻ"', () => {
    test('là TAB riêng, không nhét trong tab Chia sẻ', () => {
        // "Tôi cho ai" và "ai cho tôi" là hai việc ngược chiều; gộp một chỗ thì
        // phải cuộn qua phần cấp quyền mới tới được lời mời của mình.
        expect(src).toMatch(/key: 'received', label: 'Được chia sẻ'/);
        expect(src).toMatch(/t === 'received' \? receivedTabHtml\(\)/);
    });

    test('vào tab thì nạp CẢ lời mời lẫn bộ đã nhận', () => {
        expect(src).toMatch(/t === 'received'\) \{ loadShareInbox\(\); loadAcceptedShares\(\); \}/);
    });

    test('tab Chia sẻ KHÔNG còn nạp hai mục đó nữa', () => {
        // Sót lại là hai tab cùng ghi vào một id — mục nào nạp sau thắng, và
        // triệu chứng là danh sách "nhấp nháy" đổi nội dung không rõ lý do.
        const i = src.indexOf('const loadShareTab');
        const j = src.indexOf('const loadAcceptedShares');
        const shareTab = src.slice(i, src.indexOf('const loadShareInbox'));
        expect(i).toBeGreaterThan(-1);
        expect(j).toBeGreaterThan(-1);
        expect(shareTab).not.toMatch(/loadShareInbox\(\)/);
        expect(shareTab).not.toMatch(/loadAcceptedShares\(\)/);
    });

    test('nút Đồng bộ ở header phục vụ cả tab mới', () => {
        const i = src.indexOf('const onSyncClick');
        expect(src.slice(i, i + 800))
            .toMatch(/_currentTab === 'received'\) \{ loadShareInbox\(\); loadAcceptedShares\(\); \}/);
    });

    test('người CHƯA có bộ nào vẫn được chỉ sang tab này', () => {
        // Trước đây nhánh đó hiện luôn hộp thư ngay trong tab Chia sẻ. Giờ hộp
        // thư ở tab khác, nên chỉ nói "chưa có gì" là người mới tưởng tính năng
        // này không dùng được.
        expect(src).toMatch(/tab <b>Được chia sẻ<\/b>/);
    });

    test('tự kiểm: bộ dò đọc được thân hàm thật', () => {
        expect(body().length).toBeGreaterThan(800);
    });
});
