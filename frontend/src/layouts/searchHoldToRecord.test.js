/**
 * Nút kính lúp trên nav điện thoại là CÔNG TẮC HAI CHẾ ĐỘ.
 *
 * Kiểu như ô chuyển Anh ↔ Trung ngay cạnh nó:
 *   · chạm → đổi qua lại TÌM KIẾM ↔ GHI ÂM (icon tự nói đang ở chế độ nào)
 *   · giữ  → làm việc của chế độ ĐANG chọn
 *         tìm kiếm → bung ô nhập, lấy tiêu điểm để bật bàn phím
 *         ghi âm   → thu tiếng, nói xong vào thẳng popup dịch
 *
 * Trước đó nút này gộp kính lúp + mic thành một đích chạm, rồi thử cơ chế chạm
 * đúp. Chạm đúp có hai chỗ dở: KHÔNG NHÌN THẤY ĐƯỢC (người dùng phải đoán là có
 * cử chỉ đó), và dễ nhầm với chạm đơn nếu tay chậm.
 *
 * Cử chỉ GIỮ từng hỏng trên điện thoại: hệ điều hành hiểu thành "bôi đen /
 * dán", ô nhập giật rồi tự đóng. Không phải lỗi của cử chỉ mà là thiếu chặn
 * hành vi mặc định — sửa bằng `onContextMenu` + CSS, chứ không bỏ cử chỉ.
 *
 * Năm chỗ dễ hỏng:
 *   1. Đổi input thu-lại thành <button> cho gọn → trên iOS gọi `focus()` ngoài
 *      cử chỉ chạm trực tiếp thì BÀN PHÍM KHÔNG MỞ. Phải giữ nguyên là input.
 *   2. Không chặn `pointerup` sau cử chỉ giữ → ô bung ra và bàn phím bật lên
 *      ngay khi người dùng vừa nói xong.
 *   3. Bắt cả khi ô ĐÃ BUNG → giữ lâu trên chữ để bôi đen bị cướp mất.
 *   4. Không có dấu hiệu đang ghi → chạm xong chẳng thấy gì đổi, không biết
 *      máy đã nghe chưa (đúng vấn đề đã sửa cho popup Dịch nhanh).
 *   5. Đọc `micMode` thẳng từ state trong callback của cử chỉ giữ → callback
 *      tạo MỘT lần nên closure giữ mãi giá trị lần render đầu (luôn false),
 *      chế độ ghi âm không bao giờ chạy. Phải qua ref.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'TopNav.jsx'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', 'assets', 'styles', 'responsive.css'), 'utf8');

describe('giữ nguyên input, không đổi thành button', () => {
    test('ô tìm vẫn là <input>', () => {
        // iOS: `focus()` ngoài cử chỉ chạm trực tiếp thì bàn phím không mở.
        expect(src).toMatch(/<input\s[\s\S]*?id="search-input"/);
    });

    test('không có <button> giả thay ô tìm', () => {
        expect(src).not.toMatch(/id="search-toggle-btn"/);
    });
});

/**
 * Nút kính lúp là CÔNG TẮC HAI CHẾ ĐỘ, kiểu như ô chuyển Anh ↔ Trung:
 *
 *   · chạm → đổi qua lại TÌM KIẾM ↔ GHI ÂM
 *   · giữ  → làm việc của chế độ ĐANG chọn
 *
 * Thay cho cơ chế chạm-đúp cũ. Chạm đúp có hai chỗ dở: KHÔNG NHÌN THẤY ĐƯỢC
 * (người dùng phải đoán là có cử chỉ đó), và dễ nhầm với chạm đơn nếu tay chậm.
 * Công tắc thì icon tự nói nó đang ở chế độ nào.
 */
describe('công tắc hai chế độ: chạm đổi, giữ làm việc', () => {
    /** Thân `handleSearchPointerDown`. */
    const downBody = (() => {
        const i = src.indexOf('const handleSearchPointerDown');
        expect(i).toBeGreaterThan(-1);
        const j = src.indexOf('}, [isInPractice', i);
        expect(j).toBeGreaterThan(i);
        return src.slice(i, j);
    })();

    /** Thân `handleSearchPointerUp`. */
    const upBody = (() => {
        const i = src.indexOf('const handleSearchPointerUp');
        expect(i).toBeGreaterThan(-1);
        const j = src.indexOf('}, [isInPractice', i);
        expect(j).toBeGreaterThan(i);
        return src.slice(i, j);
    })();

    test('nối đủ 4 sự kiện pointer cho cử chỉ GIỮ', () => {
        const i = src.indexOf('id="search-input"');
        const block = src.slice(i, i + 2600);
        for (const ev of ['onPointerDown', 'onPointerUp', 'onPointerLeave', 'onPointerCancel']) {
            expect(block, `thiếu ${ev}`).toMatch(new RegExp(`${ev}=\\{handleSearch`));
        }
    });

    test('kéo ngón ra ngoài rồi nhả vẫn dừng micro', () => {
        // `pointerup` bắn ở chỗ khác — thiếu `onPointerLeave` là micro chạy mãi.
        expect(src).toMatch(/onPointerLeave=\{handleSearchPointerUp\}/);
    });

    test('GIỮ dùng lại createHoldGesture, không tự đếm giờ', () => {
        expect(src).toMatch(/searchHoldRef\.current = createHoldGesture\(\{/);
        expect(src).toMatch(/thresholdMs: 350/);
    });

    test('BỎ HẲN cơ chế chạm đúp', () => {
        // Để lại là hai cơ chế cùng bám một nút, tranh nhau cùng cú chạm.
        expect(src).not.toMatch(/DOUBLE_TAP_MS/);
        expect(src).not.toMatch(/isDoubleTap/);
        expect(src).not.toMatch(/lastTapRef/);
    });

    test('pointerdown chỉ khởi động bộ đếm, KHÔNG làm việc', () => {
        expect(downBody).toMatch(/searchHoldRef\.current\.keyDown\(/);
        expect(downBody).not.toMatch(/startSpeech\(\)/);
        expect(downBody).not.toMatch(/toggleSpeech\(\)/);
    });

    test('CHẠM (chưa đủ 350ms) thì ĐỔI CHẾ ĐỘ', () => {
        expect(upBody).toMatch(/setMicMode\(v => !v\)/);
    });

    test('GIỮ thì KHÔNG đổi chế độ — việc đã làm trong onStart', () => {
        // Đổi luôn ở đây thì nói xong nút nhảy về kính lúp giữa chừng.
        const i = upBody.indexOf('if (wasHeld)');
        const body = upBody.slice(i, upBody.indexOf('setMicMode', i));
        expect(body).toMatch(/return;/);
    });

    test('chạm KHÔNG kéo theo tiêu điểm', () => {
        // Bung ô ra khi mới chỉ đang CHỌN chế độ là sai ý người dùng.
        expect(upBody).toMatch(/e\.preventDefault\(\)/);
    });
});

describe('giữ làm việc theo CHẾ ĐỘ đang chọn', () => {
    const onStart = (() => {
        const i = src.indexOf('onStart: () => {');
        expect(i).toBeGreaterThan(-1);
        return src.slice(i, src.indexOf('onStop:', i));
    })();

    test('chế độ GHI ÂM: thu tiếng + tự mở popup dịch', () => {
        expect(onStart).toMatch(/if \(micModeRef\.current\)/);
        expect(onStart).toMatch(/autoTranslateRef\.current = true/);
        expect(onStart).toMatch(/startSpeech\(\)/);
    });

    test('chế độ TÌM KIẾM: mở ô và LẤY tiêu điểm để bật bàn phím', () => {
        const i = onStart.indexOf('} else {');
        const body = onStart.slice(i);
        expect(body).toMatch(/setSearchExpanded\(true\)/);
        expect(body).toMatch(/\.focus\(\)/);
    });

    test('ghi âm thì BỎ tiêu điểm — ngược với tìm kiếm', () => {
        // Bàn phím ảo che mất nửa màn hình đúng lúc đang nói.
        const i = onStart.indexOf('if (micModeRef.current)');
        const body = onStart.slice(i, onStart.indexOf('} else {'));
        expect(body).toMatch(/\.blur\(\)/);
    });

    test('đọc chế độ qua REF, không phải state', () => {
        // Callback của cử chỉ giữ tạo MỘT lần; closure của nó giữ mãi giá trị
        // `micMode` của lần render đầu (luôn false) nếu đọc thẳng state.
        expect(src).toMatch(/const micModeRef = useRef\(false\)/);
        expect(src).toMatch(/micModeRef\.current = micMode/);
    });

    test('onStop chỉ dừng thu khi ĐANG thu', () => {
        // Gọi `stopSpeech` bừa ở chế độ tìm kiếm là huỷ oan phiên của chỗ khác.
        const i = src.indexOf('onStop:');
        const body = src.slice(i, i + 200);
        expect(body).toMatch(/if \(micModeRef\.current\) stopSpeech\(\)/);
    });
});

describe('dùng xong về lại chế độ TÌM KIẾM', () => {
    test('sau khi mở popup dịch', () => {
        // Tìm kiếm là việc hay dùng nhất nên để làm mặc định; giữ nguyên chế độ
        // ghi âm thì lần sau chạm vào người dùng không hiểu vì sao nút không mở
        // ô nhập.
        const i = src.indexOf('if (!text || !autoTranslateRef.current) return;');
        expect(src.slice(i, i + 600)).toMatch(/setMicMode\(false\)/);
    });

    test('sau khi đóng ô tìm', () => {
        const i = src.indexOf('const closeSearch');
        expect(src.slice(i, i + 500)).toMatch(/setMicMode\(false\)/);
    });
});

/**
 * Cử chỉ GIỮ từng HỎNG trên điện thoại: giữ lâu trên <input> thì iOS/Android
 * hiểu là "bôi đen / dán" — menu bật lên cướp cử chỉ, ô nhập giật rồi tự đóng.
 *
 * Không phải lỗi của cử chỉ mà là thiếu chặn hành vi mặc định. `onContextMenu`
 * một mình KHÔNG đủ trên iOS, phải có cả ba thuộc tính CSS.
 */
describe('không để hệ điều hành cướp cử chỉ giữ', () => {
    test('chặn menu ngữ cảnh khi ô đang THU', () => {
        expect(src).toMatch(/onContextMenu=\{\(e\) => \{ if \(!searchFocused\) e\.preventDefault\(\); \}\}/);
    });

    test('CSS chặn bôi đen + callout + chạm đúp phóng to', () => {
        const r = css.match(
            /\.top-nav:not\(\.search-active\) \.search-bar input\s*\{([^}]*)\}/);
        expect(r, 'thiếu quy tắc chặn thao tác chạm').toBeTruthy();
        expect(r[1]).toMatch(/user-select:\s*none/);
        expect(r[1]).toMatch(/-webkit-touch-callout:\s*none/);
        expect(r[1]).toMatch(/touch-action:\s*manipulation/);
    });

    test('CHỈ chặn khi ô còn thu, không chặn lúc đang gõ', () => {
        // Ô đã bung là người dùng đang gõ — cướp mất quyền bôi đen/dán ở đó thì
        // không sửa được chữ nữa.
        expect(css).toMatch(/\.top-nav:not\(\.search-active\) \.search-bar input/);
        expect(css).not.toMatch(/^\s*\.search-bar input\s*\{[^}]*user-select:\s*none/m);
    });
});

/**
 * GIỮ để nói thì ô phải BUNG RA, nhưng KHÔNG được bật bàn phím ảo.
 *
 * Hai thứ này hay bị gộp làm một vì cùng đi qua `focus()`. Nhưng bung ra là
 * chuyện HÌNH DẠNG, còn tiêu điểm mới là thứ kéo bàn phím lên — mà bàn phím
 * che mất nửa màn hình đúng lúc người dùng đang nói.
 */
describe('giữ để nói: bung ô, KHÔNG bật bàn phím', () => {
    test('có state riêng, không dùng chung searchFocused', () => {
        expect(src).toMatch(/const \[searchExpanded, setSearchExpanded\] = useState\(false\)/);
    });

    test('onStart bung ô VÀ bỏ tiêu điểm', () => {
        const i = src.indexOf('onStart: () => {');
        const body = src.slice(i, src.indexOf('},', i));
        expect(body).toMatch(/setSearchExpanded\(true\)/);
        // `blur()` là thứ giữ cho bàn phím không bật lên.
        expect(body).toMatch(/blur\(\)/);
    });

    test('nav mở rộng theo CẢ HAI nguồn', () => {
        expect(src).toMatch(/\(searchFocused \|\| searchExpanded\) \? 'search-active' : ''/);
    });

    test('đóng ô phải gỡ CẢ state này', () => {
        // `blur()` chỉ gỡ `searchFocused`. Ô mở bằng cử chỉ giữ không hề có tiêu
        // điểm, nên thiếu dòng này là nút × bấm mãi không đóng được.
        const i = src.indexOf('const closeSearch');
        const body = src.slice(i, i + 400);
        expect(body).toMatch(/setSearchExpanded\(false\)/);
    });

    test('đang nói thì nav KHÔNG trượt ẩn theo cuộn', () => {
        expect(src).toMatch(/navHidden && !searchFocused && !searchExpanded/);
    });
});

/**
 * Bàn phím ảo che mất nav — và ô tìm nằm TRONG nav.
 *
 * Nav là `fixed; bottom: 0` nên bám đáy CỬA SỔ, mà bàn phím ảo KHÔNG làm cửa
 * sổ ngắn lại: nó phủ lên trên. Nên đúng lúc chạm vào ô để gõ thì cả nav lẫn ô
 * đều bị che, người dùng gõ mà không thấy mình gõ gì.
 *
 * `window.innerHeight` không phát hiện được — phải dùng VisualViewport.
 */
describe('nav bám trên bàn phím ảo', () => {
    const hook = readFileSync(join(__dirname, 'useKeyboardInset.js'), 'utf8');

    test('dùng VisualViewport, không phải innerHeight một mình', () => {
        expect(hook).toMatch(/window\.visualViewport/);
        expect(hook).toMatch(/vv\.height/);
    });

    test('trừ cả offsetTop', () => {
        // Người dùng phóng to rồi kéo thì khung nhìn trượt xuống; thiếu vế này
        // là tính dư và nav bị đẩy lơ lửng giữa màn hình.
        expect(hook).toMatch(/vv\.height \+ vv\.offsetTop/);
    });

    test('chặn giá trị âm', () => {
        // Thanh địa chỉ co giãn làm phép trừ ra số âm nhỏ → nav tụt xuống dưới đáy.
        expect(hook).toMatch(/Math\.max\(0,/);
    });

    test('có ngưỡng phân biệt bàn phím với thanh địa chỉ', () => {
        // Thanh địa chỉ chỉ ~50px; không có ngưỡng thì nav nhấp nhô mỗi lần cuộn.
        expect(hook).toMatch(/px > \d+/);
    });

    test('nghe cả resize lẫn scroll của khung nhìn', () => {
        expect(hook).toMatch(/addEventListener\('resize'/);
        expect(hook).toMatch(/addEventListener\('scroll'/);
    });

    test('dọn listener VÀ trả --kb về 0 khi tháo', () => {
        // Để lại giá trị cũ thì màn khác vẫn thấy nav lơ lửng cách đáy.
        const i = hook.indexOf('return () =>');
        const body = hook.slice(i);
        expect(body).toMatch(/removeEventListener\('resize'/);
        expect(body).toMatch(/removeEventListener\('scroll'/);
        expect(body).toMatch(/setProperty\('--kb', '0px'\)/);
    });

    test('không có VisualViewport thì thoát êm', () => {
        // Firefox cũ: mất phần cải thiện, không được hỏng.
        expect(hook).toMatch(/if \(!vv\) return;/);
    });

    test('CSS đọc --kb với mặc định 0px', () => {
        expect(css).toMatch(/bottom:\s*var\(--kb,\s*0px\)/);
    });

    test('dùng `bottom`, KHÔNG chiếm `transform`', () => {
        // `transform` đã dành cho việc trượt ẩn/hiện theo hướng cuộn — đặt chồng
        // là hai cơ chế tranh nhau cùng một thuộc tính.
        expect(css).toMatch(/transition:[^;]*bottom/);
    });

    test('TopNav có gọi hook', () => {
        expect(src).toMatch(/useKeyboardInset\(\)/);
    });
});

/**
 * Ô tìm khi bung ra phải nằm GIỮA phần màn hình còn nhìn thấy.
 *
 * Bản trước cho nó bay lên ngay trên nav (`bottom: calc(100% + 6px)`) — tức là
 * vẫn dính sát mép bàn phím, đúng chỗ chật nhất. Người dùng gõ xong không thấy
 * gợi ý/kết quả vì chúng bị đẩy khuất xuống dưới.
 */
describe('ô tìm nổi giữa khung nhìn', () => {
    const rule = (() => {
        const m = css.match(/\.top-nav\.search-active \.search-bar\s*\{([^}]*)\}/);
        expect(m, 'thiếu quy tắc ô tìm khi bung').toBeTruthy();
        return m[1];
    })();

    test('mốc là KHUNG NHÌN, không phải nav', () => {
        // `absolute` thì bám nav và luôn dính sát bàn phím.
        expect(rule).toMatch(/position:\s*fixed/);
    });

    test('căn giữa phần THẤY ĐƯỢC, đã trừ bàn phím', () => {
        expect(rule).toMatch(/bottom:\s*calc\(var\(--kb, 0px\) \+ \(100dvh - var\(--kb, 0px\)\) \/ 2\)/);
        // `translateY(50%)` kéo ngược lại nửa chiều cao chính nó — không có thì
        // mép DƯỚI của ô nằm ở giữa, cả ô lệch hẳn lên trên.
        expect(rule).toMatch(/transform:\s*translateY\(50%\)/);
    });

    test('KHÔNG còn bám đáy nav như bản cũ', () => {
        expect(rule).not.toMatch(/bottom:\s*calc\(100% \+/);
    });
});

/**
 * Giữ icon = ghi âm RỒI TỰ mở popup dịch.
 *
 * Giữ để nói là muốn TRA NGHĨA ngay, không phải điền chữ vào ô rồi còn phải
 * bấm thêm một lần nữa — giống hệt cử chỉ giữ Shift trên máy tính.
 */
describe('giữ xong tự mở popup dịch', () => {
    test('bật autoTranslate khi bắt đầu giữ', () => {
        const i = src.indexOf('onStart: () => {');
        const body = src.slice(i, src.indexOf('},', i));
        expect(body).toMatch(/autoTranslateRef\.current = true/);
    });

    test('THU ô lại trước khi mở popup', () => {
        // Ô đang nổi giữa màn; để nguyên là nằm chình ình sau lưng popup.
        const i = src.indexOf('if (!text || !autoTranslateRef.current) return;');
        const body = src.slice(i, i + 700);
        const collapse = body.indexOf('setSearchExpanded(false)');
        const open = body.indexOf('openTranslateRef.current?.(text)');
        expect(collapse).toBeGreaterThan(-1);
        expect(open).toBeGreaterThan(collapse);
    });
});

/**
 * Nút mỏ neo: chỗ nút kính lúp vẫn còn, chỉ ĐỔI ICON.
 *
 * Ô tìm khi bung là `fixed` nên rời khỏi nav và mang theo icon của nó — chỗ
 * vừa chạm bỏ trống một lỗ 40px, người dùng mất mốc thị giác "chỗ tôi vừa bấm".
 */
describe('nút mỏ neo giữ chỗ nút kính lúp', () => {
    test('chỉ hiện khi ô đã bung, và không hiện lúc luyện tập', () => {
        expect(src).toMatch(/\(searchFocused \|\| searchExpanded\) && !isInPractice && \(/);
        expect(src).toMatch(/search-anchor-icon/);
    });

    test('đổi icon theo chế độ VÀ trạng thái thu', () => {
        const i = src.indexOf('search-anchor-icon${speechOn');
        const body = src.slice(i, i + 400);
        expect(body).toMatch(/micMode \? 'fa-microphone-lines' : 'fa-search'/);
    });

    test('KHÔNG bắt chạm — thao tác thật ở ô tìm', () => {
        // Bắt chạm ở đây thì bấm vào là đóng ô mà không ai hiểu vì sao.
        const m = css.match(/\.top-nav\.search-active \.search-anchor-icon\s*\{([^}]*)\}/);
        expect(m).toBeTruthy();
        expect(m[1]).toMatch(/pointer-events:\s*none/);
    });

    test('cùng cỡ và cùng viền tròn với nút kính lúp lúc thu', () => {
        const m = css.match(/\.top-nav\.search-active \.search-anchor-icon\s*\{([^}]*)\}/);
        expect(m[1]).toMatch(/width:\s*32px/);
        expect(m[1]).toMatch(/border-radius:\s*50%/);
    });

    test('ẩn mặc định — desktop không có nút này', () => {
        expect(css).toMatch(/\.search-anchor-icon\s*\{\s*display:\s*none;\s*\}/);
    });

    test('đang thu thì nhấp nháy; class do JSX gắn, không dùng `~`', () => {
        // Nút mỏ neo đứng TRƯỚC `.search-bar` trong DOM nên bộ chọn anh em `~`
        // không với tới được — dùng nó là quy tắc chết lặng.
        expect(css).toMatch(/\.search-anchor-icon\.is-recording\s*\{[^}]*animation:\s*micPulse/);
        expect(css).not.toMatch(/\.search-bar\.is-recording ~ \.search-anchor-icon/);
        expect(src).toMatch(/search-anchor-icon\$\{speechOn \? ' is-recording' : ''\}/);
    });

    test('aria-hidden — không đọc lên hai lần', () => {
        const i = src.indexOf('search-anchor-icon');
        expect(src.slice(i, i + 300)).toMatch(/aria-hidden="true"/);
    });
});

describe('chỉ bắt khi ô đang THU', () => {
    test('bỏ qua khi ô đã bung (đang gõ)', () => {
        // Giữ lâu trên chữ là để bôi đen — cướp mất là không sửa được.
        expect(src).toMatch(/if \(isInPractice \|\| searchFocused\) return;/);
    });

    test('không hỗ trợ giọng nói thì để chạm mở ô như cũ', () => {
        expect(src).toMatch(/if \(!speechSupported\) return;\s*\/\/ không hỗ trợ/);
    });
});

describe('ghi âm xong KHÔNG bung ô ra', () => {
    test('GIỮ: chặn hành vi mặc định ở pointerup', () => {
        // Không chặn thì `pointerup` kéo theo focus → bàn phím bật lên ngay khi
        // người dùng vừa nói xong.
        expect(src).toMatch(/const wasHeld = searchHoldRef\.current\.isActive\(\)/);
        const i = src.indexOf('if (wasHeld)');
        expect(src.slice(i, i + 120)).toMatch(/e\.preventDefault\(\)/);
    });

    test('bỏ tiêu điểm khi bắt đầu ghi', () => {
        // Bàn phím ảo che mất nửa màn hình trong lúc đang nói.
        expect(src).toMatch(/document\.getElementById\('search-input'\)\?\.blur\(\)/);
    });
});

describe('có dấu hiệu đang ghi âm', () => {
    test('gắn class khi ghi mà ô còn thu', () => {
        expect(src).toMatch(/speechOn && !searchFocused \? ' is-recording' : ''/);
    });

    test('icon nói rõ CHẾ ĐỘ đang chọn', () => {
        // Icon là công tắc, không chỉ trang trí:
        //   · đang thu        → micro đặc
        //   · chế độ ghi âm   → micro gạch-sóng (giữ vào là nói)
        //   · chế độ tìm      → kính lúp (giữ vào là mở ô gõ)
        expect(src).toMatch(/speechOn\s*\?\s*'fa-microphone'/);
        expect(src).toMatch(/micMode \? 'fa-microphone-lines' : 'fa-search'/);
    });

    test('đang luyện tập vẫn ưu tiên ổ khoá', () => {
        // Lúc đó ô tìm bị khoá hẳn — hiện micro là hứa một thứ không bấm được.
        expect(src).toMatch(/isInPractice\s*\?\s*'fa-lock'/);
    });

    test('CSS nhận cả .fa-microphone, không chỉ .fa-search', () => {
        // Icon đổi hình rồi thì quy tắc ghim theo `.fa-search` không khớp nữa:
        // vòng tròn nền biến mất và icon nhảy khỏi chỗ giữa nút.
        for (const rule of [
            /\.search-bar > \.fa-microphone/,
            /\.is-recording > \.fa-microphone/,
            /\.top-nav\.search-active \.search-bar > \.fa-microphone/,
        ]) {
            expect(css, `thiếu quy tắc ${rule}`).toMatch(rule);
        }
    });

    test('desktop cũng ghim vị trí cho icon micro', () => {
        // Thiếu thì lúc thu icon mất `position: absolute` và nhảy khỏi chỗ.
        const layout = readFileSync(
            join(__dirname, '..', 'assets', 'styles', 'layout.css'), 'utf8');
        expect(layout).toMatch(/\.search-bar > \.fa-microphone/);
    });

    test('CSS tô đỏ + nhấp nháy chính nút kính lúp', () => {
        // Quy tắc kết thúc bằng biến thể `-lines` (nó là selector CUỐI trong
        // nhóm), nên `{` chỉ nằm sau dòng đó.
        const r = css.match(/\.is-recording > \.fa-microphone-lines\s*\{([^}]*)\}/);
        expect(r, 'thiếu quy tắc báo đang ghi').toBeTruthy();
        expect(r[1]).toMatch(/animation:\s*micPulse/);
        expect(r[1]).toMatch(/background:\s*var\(--primary-color\)/);
    });

    test('micPulse có thật', () => {
        const layout = readFileSync(
            join(__dirname, '..', 'assets', 'styles', 'layout.css'), 'utf8');
        expect(layout).toMatch(/@keyframes micPulse/);
    });
});

describe('điện thoại: KHÔNG có nút mic riêng, dù ô thu hay bung', () => {
    test('ô THU: mic ẩn', () => {
        // Gộp vào nút kính lúp rồi thì để lại là hai đích chạm cho một việc.
        // Khớp bằng regex, không phải chuỗi cứng — thụt lề thay đổi là test đỏ
        // oan trong khi CSS vẫn đúng.
        expect(css).toMatch(/\.mic-btn\s*\{\s*display:\s*none;\s*\}/);
    });

    test('ô BUNG: mic vẫn ẩn, không mọc lại thành nút tròn', () => {
        // Bản trước cho nó hiện lại thành nút tròn to nổi trên ô. Bỏ hẳn: chạm
        // kính lúp mở ô, GIỮ kính lúp là nói — một chỗ, hai ý định.
        const r = css.match(
            /\.top-nav\.search-active \.mic-btn\s*\{([^}]*)\}/);
        expect(r, 'thiếu quy tắc ẩn mic khi ô bung').toBeTruthy();
        expect(r[1]).toMatch(/display:\s*none/);
    });

    test('desktop VẪN giữ nút mic', () => {
        // Trên desktop không có cử chỉ giữ bằng chuột nào tiện như cảm ứng — bỏ
        // nút là mất hẳn lối ghi âm bằng nhấp, chỉ còn phím Shift.
        const layout = readFileSync(
            join(__dirname, '..', 'assets', 'styles', 'layout.css'), 'utf8');
        expect(layout).toMatch(/^\.mic-btn\s*\{/m);
        expect(layout).not.toMatch(/^\.mic-btn\s*\{[^}]*display:\s*none/m);
    });
});

/**
 * HAI nút trong ô tìm: xoá chữ · đóng ô.
 *
 * Trước đây gộp làm một — bấm × là ô đóng luôn, gõ nhầm một chữ phải mở lại từ
 * đầu. Trên iOS còn tệ hơn: mất tiêu điểm là bàn phím sập xuống, phải chạm thêm
 * lần nữa mới gõ tiếp được.
 *
 * Ba chỗ dễ hỏng:
 *   1. Hai nút cùng class `.clear-search-btn` mà class đó ghim `right: 8px` →
 *      chồng khít lên nhau.
 *   2. Không nới lề phải của input → chữ gõ tới nơi chui xuống dưới icon.
 *   3. Nút ĐÓNG bị gỡ khỏi DOM khi bấm → `click` bắn xuyên xuống thẻ bên dưới.
 *      Nút XOÁ thì không (ô vẫn mở), nên không cần chống xuyên thấu.
 */
describe('hai nút: xoá chữ và đóng ô', () => {
    const layout = readFileSync(
        join(__dirname, '..', 'assets', 'styles', 'layout.css'), 'utf8');

    test('nút XOÁ chỉ hiện khi có chữ', () => {
        // Ô rỗng thì nút xoá vô nghĩa.
        expect(src).toMatch(/\{searchQuery && !isInPractice && \(/);
        expect(src).toMatch(/id="clear-search-btn"/);
    });

    test('nút ĐÓNG hiện cả khi ô rỗng', () => {
        // Đó mới là lối thoát: chạm mở ô rồi đổi ý thì phải có chỗ bấm.
        expect(src).toMatch(/\{\(searchQuery \|\| searchFocused\) && !isInPractice && \(/);
        expect(src).toMatch(/id="close-search-btn"/);
    });

    test('xoá chữ thì GIỮ ô mở và giữ tiêu điểm', () => {
        const i = src.indexOf('const clearSearchText = useCallback');
        const body = src.slice(i, i + 400);
        expect(body).toMatch(/setSearchQuery\(''\)/);
        // Điểm khác biệt với `closeSearch`: focus thay vì blur.
        expect(body).toMatch(/\.focus\(\)/);
        expect(body).not.toMatch(/\.blur\(\)/);
    });

    test('đóng ô thì blur — `.search-active` gắn theo focus', () => {
        const i = src.indexOf('const closeSearch = useCallback');
        expect(src.slice(i, i + 300)).toMatch(/\.blur\(\)/);
    });

    test('chỉ nút ĐÓNG cần chống bấm xuyên thấu', () => {
        // Nút xoá không bị gỡ khỏi DOM lúc bấm (ô vẫn mở) nên không cần.
        const close = src.slice(src.indexOf('id="close-search-btn"'), src.indexOf('id="close-search-btn"') + 600);
        const clear = src.slice(src.indexOf('id="clear-search-btn"'), src.indexOf('id="clear-search-btn"') + 600);
        expect(close).toMatch(/swallowNextClick\(\)/);
        expect(clear).not.toMatch(/swallowNextClick\(\)/);
    });

    test('hai nút KHÔNG chồng lên nhau', () => {
        // Cùng class nên cùng `right: 8px` — phải đẩy một cái vào trong.
        expect(layout).toMatch(/\.close-search-btn\s*\{[^}]*right:\s*8px/);
        expect(layout).toMatch(/\.clear-search-btn:not\(\.close-search-btn\)\s*\{[^}]*right:\s*30px/);
    });

    test('chữ không chui xuống dưới hai nút', () => {
        expect(layout).toMatch(/\.search-bar:has\(\.close-search-btn\) input\s*\{[^}]*padding-right/);
        // Bản mobile cũng phải nới, trước là 40px cho MỘT nút.
        expect(css).toMatch(/padding:\s*8px 62px 8px 35px/);
    });

    test('mỗi nút có nhãn riêng cho trình đọc màn hình', () => {
        expect(src).toMatch(/aria-label="Xoá nội dung"/);
        expect(src).toMatch(/aria-label="Đóng ô tìm"/);
    });
});
