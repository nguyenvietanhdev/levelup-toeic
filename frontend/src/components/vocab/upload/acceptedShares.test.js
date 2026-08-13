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

describe('nút Đồng bộ', () => {
    test('có nút, và nó gọi LẠI chính hàm này', () => {
        const b = body();
        expect(b).toMatch(/class="accepted-sync-btn"/);
        expect(b).toMatch(/\.accepted-sync-btn'\)\?\.addEventListener\('click', \(\) => loadAcceptedShares\(\)\)/);
    });

    test('listener gắn MỘT lần, sau cả hai nhánh rỗng/có dữ liệu', () => {
        // Nhánh rỗng ghi innerHTML riêng. Nếu gắn listener bên trong từng nhánh
        // thì dễ sót một nhánh — nút hiện ra nhưng bấm không làm gì.
        const b = body();
        const hooks = b.match(/accepted-sync-btn'\)\?\.addEventListener/g) || [];
        expect(hooks).toHaveLength(1);
        // Và nó phải nằm SAU khối if/else dựng innerHTML.
        expect(b.indexOf('accepted-sync-btn\')?.addEventListener'))
            .toBeGreaterThan(b.indexOf('Chưa nhận bộ từ nào'));
    });

    test('nhánh rỗng vẫn dựng phần đầu có nút, không phải chỉ một câu chữ', () => {
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

describe('gắn vào tab Chia sẻ', () => {
    test('có ô chứa và được gọi ở CẢ HAI nhánh của tab', () => {
        // Nhánh "chưa có bộ nào của mình" cũng phải hiện — người mới chưa tạo bộ
        // nào vẫn có thể đã nhận bộ của người khác.
        expect((src.match(/id="share-accepted"/g) || [])).toHaveLength(2);
        expect((src.match(/^\s*loadAcceptedShares\(\);$/gm) || [])).toHaveLength(2);
    });

    test('tự kiểm: bộ dò đọc được thân hàm thật', () => {
        expect(body().length).toBeGreaterThan(800);
    });
});
