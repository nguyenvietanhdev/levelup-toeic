/**
 * Bố cục màn hình nhỏ (≤480px): dồn chỗ cho NỘI DUNG.
 *
 * Trên điện thoại thứ tự ưu tiên khác desktop — phần trên màn hình phải là bài
 * học, không phải trang trí và điều hướng. Nav xuống đáy (ngón tay ở nửa dưới),
 * dải streak ẩn đi, ô tìm trong popup ẩn đi, nút quay về ẩn đi.
 *
 * Bốn chỗ dễ hỏng im lặng — hỏng theo kiểu NHÌN vẫn bình thường trên máy tính:
 *
 *   1. Nav `fixed` ở đáy mà không chừa `padding-bottom` cho nội dung → nav đè
 *      lên cuối trang, và chỗ bị che luôn là nút cuối cùng người ta định bấm.
 *   2. Ô tìm của "Chọn Part" được đặt style INLINE trong partSelector.js —
 *      `display: none` thường không thắng inline, phải có `!important`.
 *   3. Dòng "của tôi" ghim ở Bảng xếp hạng cũng bám đáy (z-index 60) — nav
 *      z-index 200 che mất nó nếu không đẩy lên.
 *   4. `sticky` đổi thành `fixed` mà quên `top: auto` → nav dính CẢ hai mép
 *      hoặc nhảy về đầu trang, tuỳ trình duyệt.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Bỏ HẾT comment trước khi dò.
 *
 * Không bỏ thì một comment mô tả (`min-width: 0` để nút co được…) nằm trong
 * thân quy tắc cũng khớp regex — test đọc trúng lời văn của chính nó và xanh
 * kể cả khi khai báo thật đã bị xoá. Đã dính đúng bẫy này một lần.
 */
const css = readFileSync(join(__dirname, 'responsive.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Cắt đúng block `max-width: 480px`, đếm ngoặc để lấy trọn khối.
 *
 * Cắt bằng chỉ số cố định hoặc đọc cả file thì test sẽ xanh nhờ quy tắc ở
 * breakpoint KHÁC — tức là xanh mà không chứng minh gì về mobile.
 */
function mobileBlock() {
    const i = css.indexOf('@media screen and (max-width: 480px)');
    expect(i).toBeGreaterThan(-1);
    let depth = 0, j = css.indexOf('{', i);
    const start = j;
    for (; j < css.length; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}' && --depth === 0) break;
    }
    return css.slice(start, j);
}

/**
 * Thân của một selector bên trong block mobile.
 *
 * Quét thủ công theo từng cặp `{...}` thay vì dựng regex từ chuỗi selector:
 * selector chứa `.` và `#`, escape chúng bằng chuỗi rất dễ sai lặng lẽ và khi
 * đó test đỏ vì BỘ DÒ hỏng, không phải vì CSS sai.
 *
 * Trả quy tắc CUỐI CÙNG khớp, không phải quy tắc đầu: `.top-nav` xuất hiện hai
 * lần trong cùng block (một cho hàng ngang, một cho việc dời xuống đáy) và CSS
 * lấy cái sau. Kiểm cái đầu là kiểm thứ không có hiệu lực.
 */
function ruleFor(selector, block = mobileBlock()) {
    let from = 0, found = null;
    while (true) {
        const open = block.indexOf('{', from);
        if (open === -1) break;
        const close = block.indexOf('}', open);
        if (close === -1) break;
        // Phần selector = văn bản từ sau `}` trước đó (hoặc đầu block) tới `{`.
        const prev = block.lastIndexOf('}', open);
        const head = block.slice(prev === -1 ? 0 : prev + 1, open)
            .replace(/\/\*[\s\S]*?\*\//g, '')   // bỏ comment xen giữa
            .trim();
        // So khớp NGUYÊN selector, không phải `includes` — `.top-nav` không được
        // khớp nhầm `.top-nav.search-active`.
        // Selector nhiều dòng: so khớp theo TẬP các phần, không theo chuỗi thô —
        // xuống dòng và thụt lề trong CSS không được ảnh hưởng tới kết quả.
        const parts = head.split(',').map(s => s.trim().replace(/\s+/g, ' '));
        const want = String(selector).split(',').map(s => s.trim().replace(/\s+/g, ' '));
        // Bằng NHAU chứ không phải tập con: `.a` không được khớp quy tắc `.a, .b`,
        // vì thân của nó áp cho cả `.b` — kiểm nhầm chỗ là kết luận sai.
        if (want.length === parts.length && want.every(w => parts.includes(w))) {
            found = block.slice(open + 1, close);
        }
        from = close + 1;
    }
    if (found === null) expect.fail(`không tìm thấy quy tắc cho ${selector}`);
    return found;
}

describe('nav xuống đáy', () => {
    test('fixed ở đáy, không phải sticky ở đỉnh', () => {
        const r = ruleFor('.top-nav');
        expect(r).toMatch(/position:\s*fixed/);
        expect(r).toMatch(/bottom:\s*0/);
    });

    test('huỷ `top` của quy tắc gốc', () => {
        // layout.css đặt `top: 0`. Đổi sang fixed mà không huỷ thì nav bị kéo
        // căng cả hai mép hoặc nhảy lên đầu, tuỳ trình duyệt.
        expect(ruleFor('.top-nav')).toMatch(/top:\s*auto/);
    });

    test('chiếm nguyên một dòng', () => {
        const r = ruleFor('.top-nav');
        expect(r).toMatch(/left:\s*0/);
        expect(r).toMatch(/right:\s*0/);
    });

    test('chừa vùng vuốt của iPhone', () => {
        expect(ruleFor('.top-nav')).toMatch(/env\(safe-area-inset-bottom/);
    });

    test('bóng hắt LÊN — nav giờ ở dưới cùng', () => {
        expect(ruleFor('.top-nav')).toMatch(/box-shadow:\s*0\s+-\d/);
    });
});

describe('chừa chỗ cho nav — chỗ dễ quên nhất', () => {
    test('nội dung có padding-bottom bù chiều cao nav', () => {
        // Không có thì nav đè lên cuối trang. Trên máy tính không thấy được.
        const r = ruleFor('.main-content');
        expect(r).toMatch(/padding-bottom:/);
        expect(r).toMatch(/env\(safe-area-inset-bottom/);
    });

    test('thanh trạng thái dán sát trần, không giữ khoảng chừa cho nav cũ', () => {
        // layout.css đặt `top: 56px` để né nav ở trên. Nav xuống đáy rồi mà giữ
        // nguyên là còn một khoảng hở lơ lửng đúng bằng chiều cao của thứ không
        // còn ở đó — trông như lỗi căn lề, không như hệ quả của việc dời nav.
        expect(ruleFor('.status-bar')).toMatch(/top:\s*0/);
    });

    test('dòng ghim ở Bảng xếp hạng được đẩy lên trên nav', () => {
        // Nó cũng bám đáy (bottom: 14px) nhưng z-index 60 < 200 của nav.
        const r = ruleFor('.leaderboard-me-pinned');
        expect(r).toMatch(/bottom:\s*calc\(/);
        expect(r).toMatch(/env\(safe-area-inset-bottom/);
    });
});

describe('ẩn thứ chiếm chỗ', () => {
    test('dải streak nền cam', () => {
        expect(ruleFor('.streak-card')).toMatch(/display:\s*none/);
    });

    test('ô tìm trong popup Chọn đề / Chọn Part — phải có !important', () => {
        // partSelector.js đặt style INLINE (flex, max-width); không có
        // !important thì quy tắc này thua và ô vẫn hiện.
        expect(ruleFor('.modal-header-search')).toMatch(/display:\s*none\s*!important/);
    });

    test('nút quay về khi luyện tập', () => {
        expect(ruleFor('.practice-header #back-btn')).toMatch(/display:\s*none/);
    });
});

describe('ô tìm kiếm thu gọn thành nút kính lúp', () => {
    test('mặc định thu về cỡ một nút', () => {
        const r = ruleFor('.search-bar');
        expect(r).toMatch(/width:\s*40px/);
        expect(r).toMatch(/min-width:\s*40px/);
    });

    test('có focus thì bung ra, ĐÈ lên chứ không đẩy các nút đi', () => {
        // Nav chỉ có một hàng: đẩy là các nút bị bóp về 0 rồi biến mất — đúng
        // lỗi cũ của nút chuông. `absolute` + z-index thì không ai bị bóp.
        const r = ruleFor('.top-nav.search-active .search-bar');
        expect(r).toMatch(/position:\s*absolute/);
        expect(r).toMatch(/z-index:\s*\d+/);
    });

    test('lúc THU: lề đối xứng và icon căn GIỮA — không lệch tâm', () => {
        // `padding: 8px 0 8px 34px` trong ô rộng 40px đẩy vùng nền lệch hẳn sang
        // phải so với icon; còn `left: 12px` cố định là đúng khi ô rộng 400px
        // nhưng ở ô 40px thì 12px không còn là "mép" mà thành gần tâm.
        expect(ruleFor('.search-bar input')).toMatch(/padding:\s*8px 0;/);
        const icon = ruleFor('.search-bar > .fa-search,\n    .search-bar > .fa-lock');
        expect(icon).toMatch(/left:\s*0/);
        expect(icon).toMatch(/right:\s*0/);
        expect(icon).toMatch(/margin:\s*auto/);
    });

    test('lúc BUNG: trả lại lề lệch trái, icon về mép', () => {
        // Ô đủ rộng rồi thì chữ phải bắt đầu sau icon, không căn giữa.
        expect(ruleFor('.top-nav.search-active .search-bar input'))
            .toMatch(/text-align:\s*left/);
        expect(ruleFor('.top-nav.search-active .search-bar > .fa-search,\n    .top-nav.search-active .search-bar > .fa-lock'))
            .toMatch(/left:\s*\d+px/);
    });

    test('lúc thu thì chữ và placeholder trong suốt, lúc bung thì trả lại màu', () => {
        // Ẩn bằng `color: transparent` chứ không `display: none`: ô thu lại vẫn
        // phải là CHÍNH cái input để một cú chạm là focus + mở bàn phím. Nút giả
        // thì phải tự gọi focus, mà iOS không mở bàn phím khi focus được gọi
        // ngoài cử chỉ chạm trực tiếp.
        expect(ruleFor('.search-bar input')).toMatch(/color:\s*transparent/);
        expect(ruleFor('.top-nav.search-active .search-bar input')).toMatch(/color:\s*var\(--text-primary\)/);
    });

    test('nút xoá ẩn lúc thu, hiện lại lúc bung', () => {
        expect(ruleFor('.search-bar .clear-search-btn')).toMatch(/display:\s*none/);
        // Và phải trả về ĐÚNG `flex` như bản gốc — `inline-flex` là icon lệch tâm.
        const back = ruleFor('.top-nav.search-active .search-bar .clear-search-btn');
        expect(back).toMatch(/display:\s*flex/);
        expect(back).not.toMatch(/inline-flex/);
    });

    test('nút MIC KHÔNG bị ẩn — nó là nút riêng, không phải icon trong ô', () => {
        // Bản trước mic là CON của ô: ô thu lại thì mic `display: none`, bấm vào
        // chỗ đó là trúng input → nút ghi âm coi như không tồn tại trên điện
        // thoại. Giờ nó là anh em của ô (TopNav.jsx) nên phải luôn bấm được.
        const b = mobileBlock();
        expect(b).not.toMatch(/\.search-bar \.mic-btn\s*\{[^}]*display:\s*none/);
    });

    test('mic KHÔNG kéo chồng lên ô nữa ở khổ điện thoại', () => {
        // Trên máy tính margin âm kéo nó vào trong ô cho đẹp; ở đây nó đứng
        // riêng nên margin âm sẽ làm hai thứ đè nhau.
        expect(mobileBlock()).toMatch(/\.mic-btn\s*\{[^}]*margin-left:\s*0/);
    });

    test('dùng đúng tên class của nút mic', () => {
        // Nút là `.mic-btn` (TopNav.jsx). Viết nhầm `.speech-btn` thì quy tắc
        // không khớp gì cả — CSS vẫn hợp lệ, không có gì báo.
        const b = mobileBlock();
        expect(b).toMatch(/\.mic-btn/);
        expect(b).not.toMatch(/\.speech-btn/);
    });

    test('ô bung ra NỔI LÊN TRÊN nav, không chen trong hàng nút', () => {
        // Đặt tuyệt đối bên TRONG nav thì nhìn như ô đang đè lên thanh. Bay lên
        // lớp riêng (`bottom: 100%`) thì đọc ra ngay là "một lớp vừa mở".
        expect(ruleFor('.top-nav.search-active .search-bar')).toMatch(/bottom:\s*calc\(100%/);
    });

    test('lớp đó có nền + bóng của chính nó', () => {
        // Trong suốt thì vẫn trông như dính vào nav — nền mới là thứ tách nó ra.
        const r = ruleFor('.top-nav.search-active .search-bar');
        expect(r).toMatch(/background:\s*var\(--bg-primary\)/);
        expect(r).toMatch(/box-shadow:/);
    });
});

describe('mic đi cùng ô tìm; sáng/tối ở lại nav', () => {
    test('ô đang thu: mic ẩn', () => {
        // Mic chỉ có nghĩa khi đang gõ/nói.
        expect(ruleFor('.mic-btn')).toMatch(/display:\s*none/);
    });

    test('ô đang bung: mic hiện lại, nổi phía TRÊN ô', () => {
        const r = ruleFor('.top-nav.search-active .mic-btn');
        expect(r).toMatch(/display:\s*flex/);
        expect(r).toMatch(/bottom:\s*calc\(100%/);
    });

    test('mic là nút TRÒN TO, không phải icon nhỏ trong ô', () => {
        // Nó phải giữ vài giây (nhấn giữ để nói): đích nhỏ thì ngón tay che mất
        // chính nó, và giữ lâu rất dễ trượt ra ngoài — trượt ra là
        // `pointerleave` dừng thu giữa câu.
        const r = ruleFor('.top-nav.search-active .mic-btn');
        const size = Number(r.match(/width:\s*(\d+)px/)?.[1] || 0);
        expect(size).toBeGreaterThanOrEqual(48);
        expect(r).toMatch(/border-radius:\s*50%/);
    });

    test('đang nghe thì có dấu hiệu nhìn thấy được', () => {
        // Giữ tay mà không có phản hồi thì không biết micro đã bắt đầu chưa.
        expect(ruleFor('.top-nav.search-active .mic-btn.is-listening'))
            .toMatch(/animation:\s*micPulse/);
    });

    test('nút sáng/tối KHÔNG bị ẩn — nó ở lại nav', () => {
        // Nó chiếm chỗ nút yêu thích; đổi nền là thứ hay dùng ngay tại chỗ.
        expect(mobileBlock()).not.toMatch(/#theme-toggle-btn[^{]*\{[^}]*display:\s*none/);
    });

    test('nút từ vựng yêu thích ẩn — nhường chỗ cho sáng/tối', () => {
        // Ẩn phần tử thứ 4 thì thứ 5 (sáng/tối) tự lùi lên chỗ đó, tránh mép
        // phải nơi Android vuốt Back.
        expect(ruleFor('#nav-favorite-btn')).toMatch(/display:\s*none/);
    });

    test('nav KHÔNG bị ẩn phần nào khi ô tìm mở', () => {
        // Ô đã bay lên lớp trên nên không che gì; ẩn nav lúc này là cướp mất
        // menu và nút sáng/tối đúng lúc người dùng có thể cần.
        expect(mobileBlock()).not.toMatch(/search-active \.nav-right\s*\{[^}]*visibility:\s*hidden/);
    });
});

describe('hàng nút Gợi ý / Dừng thời gian / Bỏ qua', () => {
    test('ba nút chia đều và CO ĐƯỢC dưới cỡ nội dung', () => {
        // Thiếu `min-width: 0` thì flex item không co dưới kích thước nội dung,
        // nút có nhãn dài nhất vẫn đẩy hàng vỡ — đúng triệu chứng đang thấy.
        const r = ruleFor('.action-btn');
        expect(r).toMatch(/flex:\s*1 1 0/);
        expect(r).toMatch(/min-width:\s*0/);
    });

    test('nút nhỏ lại: padding và cỡ chữ đều giảm', () => {
        const r = ruleFor('.action-btn');
        expect(r).toMatch(/padding:\s*8px 6px/);
        expect(r).toMatch(/font-size:\s*11px/);
    });

    test('GIỮ nhãn chữ, không rút về mỗi icon', () => {
        // Bóng đèn / tạm dừng / tua nhanh không tự nói được nút nào làm gì, mà
        // đây là nút tốn xu và tốn vật phẩm — bấm nhầm là mất thật.
        const b = mobileBlock();
        expect(b).not.toMatch(/\.action-btn\s*>\s*span\s*\{[^}]*display:\s*none/);
        expect(b).not.toMatch(/\.action-btn\s+span\s*\{[^}]*display:\s*none/);
    });

    test('chi phí và số lượng vẫn hiện — thu nhỏ chứ không ẩn', () => {
        // Đó là thứ quyết định có bấm hay không.
        const r = ruleFor('.action-btn .cost,\n    .action-btn .freeze-count');
        expect(r).toMatch(/font-size:\s*10px/);
        expect(r).not.toMatch(/display:\s*none/);
        // Và không bị bóp mất: chúng là huy hiệu cỡ cố định.
        expect(r).toMatch(/flex-shrink:\s*0/);
    });
});

describe('chế độ phát âm', () => {
    test('thẻ chữ và cột mic xếp DỌC, không bóp ngang', () => {
        // `flex-wrap: wrap` không cứu được: thẻ chữ có `flex:1; min-width:0` nên
        // co được vô hạn và không bao giờ xuống dòng — chỉ hẹp dần cho tới khi
        // chữ Hán phải xếp dọc từng nét.
        const r = ruleFor('.pronunciation-row');
        expect(r).toMatch(/flex-direction:\s*column\s*!important/);
    });

    test('dùng !important — bố cục gốc là inline style', () => {
        // pronunciationMode.js viết bố cục bằng inline style, mà inline luôn
        // thắng CSS ngoài. Thiếu !important là quy tắc không có tác dụng nào.
        const r = ruleFor('.pronunciation-word-display');
        expect(r).toMatch(/!important/);
    });

    test('cột mic thành hàng ngang để không chiếm hết màn', () => {
        expect(ruleFor('.pronunciation-mic-col')).toMatch(/flex-direction:\s*row\s*!important/);
    });

    test('nút mic KHÔNG bị bóp — nó là đích chạm chính', () => {
        expect(ruleFor('.pronunciation-mic-col .mic-button')).toMatch(/flex-shrink:\s*0/);
    });
});

describe('tiêu đề màn hình không vỡ dòng giữa từ', () => {
    test('hàng tiêu đề cho xuống dòng thay vì bóp', () => {
        // Cửa hàng có tới 4 nút hành động; ép một dòng thì tiêu đề vỡ giữa từ
        // ("Cửa / hàng") mà nút cuối vẫn bị đẩy khỏi mép phải.
        expect(ruleFor('.screen-header')).toMatch(/flex-wrap:\s*wrap/);
    });

    test('tiêu đề giữ NGUYÊN một dòng và ĐẨY HẾT nhóm nút xuống dòng dưới', () => {
        // `flex-basis: auto` chỉ chiếm bằng nội dung, nên hai nút đầu vẫn lọt
        // lên cùng dòng với tiêu đề còn hai nút sau rơi xuống — nhìn như nút bị
        // thiếu. Basis đủ lớn thì dòng đầu hết chỗ và cả nhóm cùng xuống.
        const r = ruleFor('.screen-header h2');
        expect(r).toMatch(/white-space:\s*nowrap/);
        expect(r).toMatch(/flex:\s*1 1 \d+%/);
        expect(r).toMatch(/min-width:\s*0/);
    });

    test('nhóm nút CHIA ĐỀU dòng dưới', () => {
        const r = ruleFor('.screen-header .inventory-btn,\n    .screen-header .checkin-trigger-btn');
        expect(r).toMatch(/flex:\s*1 1 0/);
        expect(r).toMatch(/min-width:\s*0/);
    });

    test('huỷ `margin-left: auto` viết inline ở ShopScreen', () => {
        // Nó đẩy nút đầu sang phải, để lại khoảng trống lớn khi nhóm nút đã
        // xuống dòng riêng. Inline nên phải !important.
        expect(ruleFor('.screen-header .inventory-btn:first-of-type'))
            .toMatch(/margin-left:\s*0\s*!important/);
    });
});

describe('nút "Nhận tất cả" — cả Nhiệm vụ lẫn Thành tích', () => {
    test('ẩn trên điện thoại, có class riêng để nhắm được', () => {
        // Hàng tiêu đề đã có quay lại + tiêu đề + 2 nút nữa. Nhận từng cái vẫn
        // được, chỉ mất lối tắt.
        expect(ruleFor('.quest-claim-all-btn')).toMatch(/display:\s*none/);
    });

    test('CHỈ MỘT quy tắc — hai bản là sửa một chỗ, chỗ kia vẫn cũ', () => {
        expect((mobileBlock().match(/\.quest-claim-all-btn\s*\{/g) || [])).toHaveLength(1);
    });
});

describe('dòng cài đặt xếp DỌC — gốc của việc vỡ chữ', () => {
    test('mô tả ở trên, ô điều khiển ở dưới', () => {
        // Hàng ngang + `.setting-info { flex:1; min-width:0 }` = mô tả co được
        // vô hạn, ô chọn đẩy nó về gần 0 và chữ rơi thành MỘT CHỮ MỖI DÒNG.
        const r = ruleFor('.setting-item');
        expect(r).toMatch(/flex-direction:\s*column/);
        expect(r).toMatch(/align-items:\s*stretch/);
    });

    test('ô điều khiển trải hết bề ngang', () => {
        // Dropdown rộng 2 chữ thì chẳng đọc được lựa chọn nào.
        expect(ruleFor('.setting-item > *:not(.setting-info)')).toMatch(/width:\s*100%/);
    });
});

describe('popup Vòng quay', () => {
    test('không còn khoá cứng 660px', () => {
        // 660px trên màn 360px là tràn ra ngoài, và cột phải bị bóp tới mức chữ
        // xếp dọc từng chữ.
        expect(ruleFor('.spin-modal-wide')).toMatch(/width:\s*calc\(100vw/);
    });

    test('hai cột xếp DỌC: bánh xe trên, bảng thưởng dưới', () => {
        expect(ruleFor('.spin-layout')).toMatch(/flex-direction:\s*column/);
    });

    test('bánh xe co theo màn và giữ hình VUÔNG', () => {
        const r = ruleFor('.spin-canvas');
        expect(r).toMatch(/width:\s*min\(\d+vw/);
        expect(r).toMatch(/aspect-ratio:\s*1\s*\/\s*1/);
    });
});

describe('khoảng cách bị sát', () => {
    test('tiêu đề "Thống kê của bạn" không dính lưới ô bên dưới', () => {
        expect(ruleFor('.stats-section h2')).toMatch(/margin-bottom:/);
    });

    test('thanh tìm cài đặt không dính phần bên dưới — ở MỌI khổ màn', () => {
        // Quy tắc nằm ở components.css chứ không trong block mobile: bản desktop
        // cũng dính sát y hệt, đặt riêng cho mobile là sửa nửa vời.
        const comp = readFileSync(join(__dirname, 'components.css'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        const m = comp.match(/\.settings-search\s*\{([^}]*)\}/);
        expect(m).toBeTruthy();
        expect(m[1]).toMatch(/margin:\s*0 auto \d+px/);
    });
});

describe('đếm ngược "Reset sau" ở Thống kê', () => {
    test('ẩn trên điện thoại', () => {
        // Thông tin chỉ cần biết mỗi tháng một lần, mà chiếm nguyên một khối
        // trong hàng tiêu đề; nút "Xuất báo cáo" cạnh đó đã có chấm nhắc.
        expect(ruleFor('.stats-reset-bar')).toMatch(/display:\s*none/);
    });
});

describe('nav trượt ẩn theo hướng cuộn', () => {
    test('cuộn xuống thì trượt khỏi màn, không phải biến mất đột ngột', () => {
        const r = ruleFor('.top-nav.nav-hidden');
        expect(r).toMatch(/transform:\s*translateY\(100%\)/);
        expect(r).not.toMatch(/display:\s*none/);
    });

    test('đã trượt ra ngoài thì KHÔNG bắt chạm nữa', () => {
        // Thiếu dòng này là vùng đáy màn hình vẫn nuốt cú chạm của nội dung.
        expect(ruleFor('.top-nav.nav-hidden')).toMatch(/pointer-events:\s*none/);
    });

    test('có chuyển động — biến mất đột ngột thì tưởng hỏng', () => {
        expect(mobileBlock()).toMatch(/transition:\s*transform/);
    });
});

describe('nhãn ngắn cho nút hành động', () => {
    test('mobile dùng nhãn NGẮN, ẩn nhãn đầy đủ', () => {
        const b = mobileBlock();
        expect(b).toMatch(/\.action-btn \.label-full \{ display: none; \}/);
        expect(b).toMatch(/\.action-btn \.label-short \{ display: inline; \}/);
    });

    test('nhãn không được vỡ dòng nữa', () => {
        expect(mobileBlock()).toMatch(/white-space:\s*nowrap/);
    });
});

describe('ba lựa chọn nhanh chuyển vào menu bên', () => {
    test('ẩn ở thanh trạng thái, hiện trong menu', () => {
        expect(ruleFor('.status-bar-right')).toMatch(/display:\s*none/);
        expect(ruleFor('.menu-quick-settings-wrap')).toMatch(/display:\s*block/);
    });
});

describe('chế độ viết chữ Hán', () => {
    test('ĐỔI TRỤC: xếp ô theo cột, cuộn DỌC', () => {
        // Desktop xếp ngang/cuộn ngang (giống viết trên giấy). Bê nguyên xuống
        // mobile thì chiều ngang phải chia cho nhiều ô, viết bằng ngón tay trên
        // ô nhỏ rất khó chuẩn.
        const r = ruleFor('.hanzi-boxes');
        expect(r).toMatch(/flex-direction:\s*column/);
        expect(r).toMatch(/overflow-y:\s*auto/);
        expect(r).toMatch(/overflow-x:\s*hidden/);
    });

    test('ghim về ĐẦU, không để `safe center` của quy tắc gốc căn dọc', () => {
        // Quy tắc gốc đặt `justify-content: safe center` cho trục ngang. Đổi sang
        // cột là nó thành căn dọc — từ dài bị dồn giữa, chữ đầu trôi khỏi vùng nhìn.
        expect(ruleFor('.hanzi-boxes')).toMatch(/justify-content:\s*flex-start/);
    });

    test('chặn chiều cao để nút "Xem mẫu" không bị đẩy khỏi màn hình', () => {
        // Không chặn thì từ 6 chữ dựng một cột cao 6 ô, nút điều khiển trôi xuống
        // dưới cùng và người học không biết nó còn ở đó.
        expect(ruleFor('.hanzi-boxes')).toMatch(/max-height:\s*\d+vh/);
    });

    test('ô vẽ chiếm TRỌN chiều ngang, có chặn trên', () => {
        // Đổi trục rồi thì không phải chia chiều ngang cho ô bên cạnh nữa.
        const r = ruleFor('.hanzi-boxes .hanzi-canvas,\n    .hanzi-boxes:has(> :nth-child(3)) .hanzi-canvas');
        expect(r).toMatch(/width:\s*min\(\d+vw,\s*\d+px\)/);
        const vw = Number(r.match(/min\((\d+)vw/)[1]);
        expect(vw).toBeGreaterThanOrEqual(80);
    });

    test('giữ ô VUÔNG — lưới tập viết méo là căn nét sai chỗ', () => {
        expect(mobileBlock()).toMatch(/aspect-ratio:\s*1\s*\/\s*1/);
    });

    test('hàng nút xuống dòng thay vì bị bóp', () => {
        expect(ruleFor('.hanzi-actions')).toMatch(/flex-wrap:\s*wrap/);
    });
});

describe('chiều cao vùng nhìn thật (ngoài block mobile)', () => {
    const layout = readFileSync(join(__dirname, 'layout.css'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '');

    test('.game-container dùng dvh, có dự phòng vh', () => {
        // `vh` trên Chrome Android là chiều cao lúc thanh địa chỉ ĐÃ ẨN — luôn
        // lớn hơn chỗ nhìn thấy thật, phần dư nằm khuất dưới thanh địa chỉ và
        // nav ở đáy bị che một nửa.
        const m = layout.match(/\.game-container\s*\{([^}]*)\}/);
        expect(m).toBeTruthy();
        expect(m[1]).toMatch(/min-height:\s*100dvh/);
        // Dự phòng phải đứng TRƯỚC — trình duyệt cũ bỏ qua dòng nó không hiểu,
        // đảo thứ tự là bản cũ thắng và `dvh` vô nghĩa.
        expect(m[1].indexOf('100vh')).toBeLessThan(m[1].indexOf('100dvh'));
    });
});

describe('tự kiểm', () => {
    test('quy tắc dời-xuống-đáy đứng SAU quy tắc nav hàng ngang', () => {
        // Cùng selector, cùng độ đặc hiệu → cái sau thắng. Ai đó chuyển khối mới
        // lên trên khối cũ là nav lặng lẽ quay về đỉnh màn hình, CSS vẫn hợp lệ
        // và không có gì báo.
        const b = mobileBlock();
        expect(b.indexOf('position: fixed')).toBeGreaterThan(b.indexOf('flex-wrap: nowrap'));
    });

    test('bộ dò cắt đúng block mobile, không đọc cả file', () => {
        const b = mobileBlock();
        expect(b.length).toBeGreaterThan(2000);
        // Quy tắc của breakpoint tablet KHÔNG được lọt vào.
        expect(b).not.toMatch(/min-width:\s*481px/);
    });
});
