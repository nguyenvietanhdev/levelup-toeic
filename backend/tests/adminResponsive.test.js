/**
 * Dashboard admin trên màn hình điện thoại.
 *
 * Bốn thứ làm trang "vỡ" (đúng như ảnh người dùng gửi), tất cả đều IM LẶNG —
 * trên máy tính nhìn vẫn hoàn hảo:
 *
 *   1. `.filter-bar-row.cols-2` không có quy tắc mobile nào. `cols-3`/`cols-4`
 *      được bẻ về 1 cột, riêng `cols-2` giữ nguyên `2fr 1fr` → ô thứ hai tràn
 *      khỏi mép phải.
 *   2. `.pagination-row` là `space-between` không xuống dòng, và `renderPager`
 *      nhét `.pager-info` VÀO TRONG `.pager`. Hai thứ tranh chỗ nên chuỗi
 *      "1–15 / 24 đề" bị bẻ thành từng mẩu mỗi dòng.
 *   3. Bản cũ ẩn cột từ thứ 5 trở đi (`nth-child(n+5)`). Ở trang Ngân hàng câu
 *      hỏi thì cột 5 lại là NGUỒN — ẩn mất đúng thứ cần xem, mà không báo gì.
 *   4. Không có gì chặn cuộn ngang cấp trang, nên bảng rộng đẩy cả bố cục
 *      (sidebar + topbar) trôi sang phải.
 *
 * Test đọc thẳng CSS: đây là lỗi thuần trình bày, không có hàm nào để gọi.
 */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'admin', 'css', 'dashboard.css'), 'utf8'
);

/**
 * Cắt trọn một khối @media theo mức ngoặc.
 *
 * `after` để chọn ĐÚNG khối khi cùng một breakpoint xuất hiện nhiều lần —
 * dashboard.css có tới hai khối `max-width: 900px` (một cho riêng nút đóng
 * sidebar ở đầu file, một cho bố cục mobile ở cuối). Lấy nhầm cái đầu thì test
 * đỏ dù CSS đúng.
 */
function mediaBlock(query, after = 0) {
    const i = css.indexOf(query, after);
    if (i === -1) throw new Error(`Không tìm thấy khối ${query} trong dashboard.css`);
    let depth = 0;
    for (let j = css.indexOf('{', i); j < css.length; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') {
            depth--;
            if (depth === 0) return css.slice(i, j + 1);
        }
    }
    throw new Error(`Khối ${query} không đóng ngoặc`);
}

const mobile = mediaBlock('@media (max-width: 600px)');
// Khối bố cục mobile nằm SAU phần "RESPONSIVE — Mobile", không phải khối
// 900px đầu file (chỉ hiện nút đóng sidebar).
const tablet = mediaBlock('@media (max-width: 900px)', css.indexOf('RESPONSIVE — Mobile'));

describe('thanh lọc không tràn ngang', () => {
    test('MỌI biến thể cols-* về một cột ở khổ điện thoại', () => {
        // Thiếu `cols-2` là lỗi đang thấy: hàng hai ô lọc giữ nguyên 2fr 1fr.
        for (const cls of ['cols-2', 'cols-3', 'cols-4']) {
            // Thiếu cái nào thì tên class hiện ngay trong thông báo lỗi của regex.
            expect(mobile).toMatch(new RegExp(`\\.filter-bar-row\\.${cls}`));
        }
        expect(mobile).toMatch(/grid-template-columns:\s*1fr/);
    });

    test('ở khổ tablet, cột `auto` của cols-4 xuống hàng riêng', () => {
        // `cols-4` là `2fr 1fr 1fr auto` — cột cuối thường là nút. Bẻ về 2 cột
        // mà để nút nằm trong ô hẹp thì chữ trong nút vỡ dòng.
        expect(tablet).toMatch(/\.filter-bar-row\.cols-4 > \*:last-child/);
        expect(tablet).toMatch(/grid-column:\s*1 \/ -1/);
    });

    test('chân thanh lọc xếp dọc', () => {
        expect(mobile).toMatch(/\.filter-bar-footer\s*\{[^}]*flex-direction:\s*column/);
    });
});

describe('hàng lọc "tự chế" của các tab (không dùng .filter-bar-row)', () => {
    // 10 tab viết thẳng `style="display:flex"` + `min-width` inline cho select,
    // nên KHÔNG ăn quy tắc `.filter-bar-row` ở trên. Đây là lý do tab Quản lý Đề
    // vẫn tràn sau lần sửa trước.
    const tabsDir = path.join(__dirname, '..', 'public', 'admin', 'partials', 'tabs');

    test('kiểu này thật sự tồn tại ở nhiều tab', () => {
        const hits = fs.readdirSync(tabsDir)
            .filter(f => f.endsWith('.html'))
            .filter(f => /class="card-search"/.test(fs.readFileSync(path.join(tabsDir, f), 'utf8')));
        // Nếu sau này refactor hết sang `.filter-bar-row` thì test này nhắc dọn
        // mấy quy tắc `:has()` bên dưới.
        expect(hits.length).toBeGreaterThan(1);
    });

    test('hàng chứa ô tìm được xuống dòng', () => {
        expect(mobile).toMatch(/div:has\(> \.card-search\)\s*\{[^}]*flex-wrap:\s*wrap/);
    });

    test('ô tìm chiếm TRỌN một dòng', () => {
        // `flex-basis: 100%` mới thắng được `flex: 1` đặt inline; đặt `width`
        // trong ngữ cảnh flex là không đủ.
        const r = mobile.match(/div:has\(> \.card-search\) > \.card-search\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        expect(r[1]).toMatch(/flex:\s*0 0 100%\s*!important/);
    });

    test('select bỏ min-width inline để co và xuống dòng được', () => {
        // `min-width: 130px` inline chính là thứ giữ ba select cùng một hàng
        // rồi đẩy "Tất cả ngôn ngữ" tràn khỏi mép.
        const r = mobile.match(/div:has\(> \.card-search\) > \.filter-select\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        expect(r[1]).toMatch(/min-width:\s*0\s*!important/);
    });

    test('KHÔNG ràng buộc `.card >` — mức lồng khác nhau tuỳ tab', () => {
        // Tab Từ vựng lồng sâu hơn tab Đề luyện tập; ràng `.card >` là trượt.
        expect(mobile).not.toMatch(/\.card > div:has\(> \.card-search\)/);
    });
});

describe('dải phân trang đọc được', () => {
    test('xếp dọc thay vì space-between', () => {
        expect(mobile).toMatch(/\.pagination-row\s*\{[^}]*flex-direction:\s*column/);
    });

    test('.pager-info chiếm trọn một dòng riêng', () => {
        // Nó nằm TRONG `.pager` (xem renderPager ở core/utils.js) nên phải ép
        // `flex-basis: 100%`, chỉ `width` là không đủ trong ngữ cảnh flex.
        const r = mobile.match(/\.pager-info\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        expect(r[1]).toMatch(/flex:\s*0 0 100%/);
    });

    test('cụm nút thao tác xuống dòng, chia đều chỗ', () => {
        // Cho khối cha `width: 100%` là chưa đủ — bên trong vẫn là một hàng flex
        // đặt inline, ba nút chữ dài vẫn chen nhau rồi tràn.
        expect(mobile).toMatch(/\.pagination-row > div\[style\*="flex"\]\s*\{[^}]*flex-wrap:\s*wrap/);
        expect(mobile).toMatch(/\.pagination-row \.btn\s*\{[^}]*flex:\s*1 1 auto/);
    });

    test('nút số trang đủ to để chạm bằng ngón', () => {
        const r = mobile.match(/\.pager-btn\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        const min = parseInt(r[1].match(/min-width:\s*(\d+)px/)?.[1] || '0', 10);
        expect(min).toBeGreaterThanOrEqual(32);
    });
});

describe('bảng: cuộn trong khung, KHÔNG ẩn cột', () => {
    test('bỏ hẳn quy tắc ẩn cột từ thứ 5', () => {
        // Ở trang Ngân hàng câu hỏi, cột 5 là NGUỒN — ẩn đi là mất đúng thứ
        // người ta mở trang để xem.
        expect(css).not.toMatch(/th:nth-child\(n\+5\)/);
        expect(css).not.toMatch(/td:nth-child\(n\+5\)/);
    });

    test('khung bảng vẫn cuộn ngang được', () => {
        expect(css).toMatch(/\.table-container\s*\{[^}]*overflow-x:\s*auto/);
    });
});

describe('ô thống kê ở Overview không bị cắt chữ', () => {
    test('tiêu đề ô được phép xuống dòng ở khổ điện thoại', () => {
        // Bản gốc `white-space: nowrap`: trên lưới 2 cột thì "TỪ VỰNG TOEIC" dài
        // hơn ô nên tràn ra ngoài và bị viền thẻ cắt cụt.
        const r = mobile.match(/\.stat-info h3\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        expect(r[1]).toMatch(/white-space:\s*normal/);
    });

    test('icon không co lại làm méo', () => {
        expect(mobile).toMatch(/\.stat-icon\s*\{[^}]*flex-shrink:\s*0/);
    });

    test('bản desktop vẫn giữ nowrap (chỉ mobile mới đổi)', () => {
        // Trên desktop ô rộng, một dòng gọn hơn hai dòng.
        const base = css.slice(0, css.indexOf('RESPONSIVE — Mobile'));
        expect(base).toMatch(/\.stat-info h3\s*\{[^}]*white-space:\s*nowrap/);
    });
});

describe('cấu hình mùa giải không tràn', () => {
    const overview = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'admin', 'partials', 'tabs', 'overview.html'), 'utf8'
    );

    test('lưới có CLASS để media query nhắm được', () => {
        // Để lưới nằm hoàn toàn trong `style=` inline thì mọi quy tắc responsive
        // đều thua — đó là lý do khối này vẫn 2 cột trên điện thoại.
        expect(overview).toMatch(/class="season-config-grid"/);
    });

    test('bẻ về 1 cột, có !important để thắng inline style', () => {
        const r = mobile.match(/\.season-config-grid\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        expect(r[1]).toMatch(/grid-template-columns:\s*1fr\s*!important/);
    });

    test('nhãn checkbox dài xuống dòng được, ô tick không co', () => {
        expect(mobile).toMatch(/\.season-config-grid label\s*\{[^}]*word-break/);
        expect(mobile).toMatch(/\.season-config-grid input\[type="checkbox"\]\s*\{[^}]*flex-shrink:\s*0/);
    });
});

describe('trang Gửi thông báo hệ thống', () => {
    const bc = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'admin', 'partials', 'tabs', 'broadcast.html'), 'utf8'
    );

    test('ba lưới inline đều có CLASS để nhắm được', () => {
        // Cả trang dựng bằng `style="display:grid"` inline; không có class thì
        // media query không với tới, cột form bị bóp còn ~110px.
        for (const cls of ['bc-layout', 'bc-target-grid', 'bc-gift-grid']) {
            expect(bc).toMatch(new RegExp(`class="${cls}"`));
        }
    });

    test('bố cục 2 cột (form | lịch sử) xếp DỌC ở khổ điện thoại', () => {
        const r = mobile.match(/\.bc-layout\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        expect(r[1]).toMatch(/grid-template-columns:\s*1fr\s*!important/);
    });

    test('ba ô quà Coins/Gems/XP về 1 cột', () => {
        // Ba ô số cạnh nhau trên màn hẹp thì mỗi ô không đủ chỗ cho 4 chữ số.
        const r = mobile.match(/\.bc-gift-grid\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        expect(r[1]).toMatch(/grid-template-columns:\s*1fr\s*!important/);
    });

    test('nút "Người cụ thể" bớt padding để không vỡ dòng', () => {
        // Giữ `padding:10px 14px` inline thì nhãn không vừa nửa màn 320px, bị bẻ
        // hai dòng và hai nút cao lệch nhau.
        expect(mobile).toMatch(/\.bc-target-grid > label\s*\{[^}]*padding:[^;]*!important/);
    });

    test('class phải THẬT SỰ có trong HTML đã render', () => {
        // Partial được ghép qua marker @include — sửa file partial mà marker sai
        // thì class không bao giờ tới trình duyệt.
        const { renderAdminDashboard } = require('../utils/renderAdminDashboard');
        const html = renderAdminDashboard();
        expect(html).toContain('bc-layout');
        expect(html).toContain('bc-gift-grid');
    });
});

describe('Bảng kinh tế (faucet / sink)', () => {
    test('ba thẻ tổng kết xếp DỌC ở khổ điện thoại', () => {
        // Mỗi thẻ chỉ còn ~95px trên màn 320px, mà bên trong mỗi dòng là
        // `space-between` (nhãn trái · số phải) — "▲ Thu (faucet)" và con số
        // không đủ chỗ cạnh nhau nên vỡ thành từng mẩu chồng lên nhau.
        const r = mobile.match(/#eco-summary\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        expect(r[1]).toMatch(/grid-template-columns:\s*1fr\s*!important/);
    });

    test('ô chọn ngày trải hết bề ngang', () => {
        // `style="width:auto"` inline giữ nó bé xíu cạnh nút Làm mới.
        expect(mobile).toMatch(/#main-tab-economy #eco-days\s*\{[^}]*width:\s*100%\s*!important/);
    });

    test('bảng vẫn nằm trong khung cuộn ngang', () => {
        // `.data-table` không có CSS riêng — nó dựa hoàn toàn vào
        // `.table-container` để không đẩy vỡ bố cục.
        const eco = fs.readFileSync(
            path.join(__dirname, '..', 'public', 'admin', 'partials', 'tabs', 'economy.html'), 'utf8');
        expect(eco).toMatch(/<div class="table-container">\s*<table class="data-table">/);
    });
});

describe('DB Manager — hai cột chuyển thành hai CẢNH', () => {
    const js = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'admin', 'js', 'features', 'monitor', 'db-manager.js'), 'utf8'
    );
    const html = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'admin', 'partials', 'tabs', 'db-manager.html'), 'utf8'
    );

    /**
     * Khối media query riêng của DB Manager — nằm CUỐI file, sau định nghĩa gốc.
     *
     * Neo theo quy tắc thật (`grid-template-columns: 220px 1fr`) chứ không theo
     * chữ trong comment: chuỗi mô tả xuất hiện ở nhiều chỗ, neo nhầm thì cắt
     * trúng khối 600px khác (monitor-kpi-grid) và test đỏ dù CSS đúng.
     */
    const dbMobile = (() => {
        // Bỏ comment trước khi dò vị trí — chuỗi `220px 1fr` cũng nằm trong lời
        // chú thích ở giữa file, neo trúng đó là cắt nhầm khối khác.
        const clean = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
        return mediaBlock(
            '@media (max-width: 600px)',
            clean.indexOf('grid-template-columns: 220px 1fr'),
        );
    })();

    test('bỏ lưới 220px cố định ở khổ điện thoại', () => {
        // `220px 1fr` trên màn 320px → panel document chỉ còn ~85px, JSON không
        // đọc nổi.
        const r = dbMobile.match(/\.db-manager-layout\s*\{([^}]*)\}/);
        expect(r).toBeTruthy();
        expect(r[1]).toMatch(/grid-template-columns:\s*1fr/);
    });

    test('quy tắc mobile nằm SAU định nghĩa gốc (nếu không sẽ bị ghi đè)', () => {
        // Cùng độ cụ thể (`.db-manager-layout`) thì cái viết SAU thắng. Để khối
        // mobile ở giữa file — chỗ các media query khác — thì `220px 1fr` ghi
        // đè ngược lại và sidebar vẫn bị bó ~230px. Đã dính đúng lỗi này một
        // lần, và nhìn CSS không ra vì cả hai quy tắc đều "đúng".
        const clean = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
        const base = clean.indexOf('grid-template-columns: 220px 1fr');
        expect(base).toBeGreaterThan(-1);
        const override = clean.indexOf('.db-manager-layout {', base);
        expect(override).toBeGreaterThan(base);
    });

    test('sidebar chiếm TRỌN bề ngang, không chừa dải trống', () => {
        // Lưới 1 cột + `gap: 0` thì `.db-col-sidebar` tự rộng hết màn.
        const r = dbMobile.match(/\.db-manager-layout\s*\{([^}]*)\}/);
        expect(r[1]).toMatch(/gap:\s*0/);
    });

    test('mặc định hiện danh sách, ẩn panel document', () => {
        expect(dbMobile).toMatch(/\.db-manager-layout \.db-doc-panel\s*\{[^}]*display:\s*none/);
    });

    test('có class `db-showing-doc` thì đảo lại', () => {
        expect(dbMobile).toMatch(/\.db-showing-doc \.db-col-sidebar\s*\{[^}]*display:\s*none/);
        expect(dbMobile).toMatch(/\.db-showing-doc \.db-doc-panel\s*\{[^}]*display:\s*block/);
    });

    test('JS gắn/gỡ đúng class đó', () => {
        expect(js).toMatch(/classList\.add\('db-showing-doc'\)/);
        expect(js).toMatch(/classList\.remove\('db-showing-doc'\)/);
    });

    test('nút Quay lại: ẩn mặc định, chỉ bật ở mobile', () => {
        // Desktop hai cột luôn thấy cả hai nên nút vô nghĩa.
        expect(css).toMatch(/#db-back-btn\s*\{\s*display:\s*none/);
        expect(dbMobile).toMatch(/#db-back-btn\s*\{[^}]*display:\s*inline-flex\s*!important/);
    });

    test('nút Quay lại nối bằng addEventListener, KHÔNG onclick inline', () => {
        // CSP đặt `script-src-attr 'none'` — mọi thuộc tính sự kiện inline bị
        // chặn thẳng, nút sẽ không bao giờ chạy (đã dính đúng bẫy này với nút
        // đóng sidebar).
        expect(html).toMatch(/id="db-back-btn"/);
        expect(html).not.toMatch(/id="db-back-btn"[^>]*onclick/);
        expect(js).toMatch(/getElementById\('db-back-btn'\)\?\.addEventListener/);
    });

    test('drop collection xong thì trả về danh sách', () => {
        // Không trả về thì màn hình trống trơn, mà nút Quay lại cũng vừa bị ẩn
        // theo `db-doc-content`.
        const i = js.indexOf("Đã drop");
        expect(i).toBeGreaterThan(-1);
        expect(js.slice(i, i + 900)).toMatch(/showDbCollectionList\(\)/);
    });
});

describe('không để cả trang trôi ngang', () => {
    test('.admin-content chặn cuộn ngang', () => {
        // Bảng rộng phải cuộn trong khung của nó; đẩy cả bố cục thì sidebar và
        // topbar cũng trôi theo — đúng kiểu "vỡ" trong ảnh.
        expect(css).toMatch(/\.admin-content\s*\{[^}]*overflow-x:\s*hidden/);
    });

    test('vùng nội dung tab co được', () => {
        // Thiếu `min-width: 0` thì flex/grid item không co dưới kích thước nội
        // dung, và `overflow-x: hidden` ở trên thành vô nghĩa.
        expect(css).toMatch(/\.main-tab-content\s*\{[^}]*min-width:\s*0/);
    });
});
