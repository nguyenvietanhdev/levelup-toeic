/**
 * Màn Hội thoại.
 *
 * Nguyên tắc lớn nhất ở đây: màn này KHÔNG tự chấm điểm. Server trả về
 * `matched` / `usedWords`, client chỉ hiển thị.
 *
 * Chép luật chấm sang client là mời gọi hai bên lệch nhau — tô sáng một đằng,
 * ăn điểm một nẻo, mà người dùng chỉ thấy "máy tính sai". Và luật chấm tiếng
 * Anh có sinh biến thể đuôi, tiếng Trung dò chuỗi con: hai bản song song thì
 * sửa một bên là lệch ngay.
 *
 * Bốn chỗ dễ hỏng khác:
 *   1. Gọi API sai tên (`onResult` thay vì `onText`) → micro không điền chữ, mà
 *      KHÔNG lỗi nào báo.
 *   2. Không đồng bộ năng lượng sau khi server trừ → thanh năng lượng hiện số
 *      cũ cho tới lần tải trang sau.
 *   3. Không dừng micro khi rời màn → micro chạy tiếp ở màn khác.
 *   4. `.screen.active` mặc định `display: block` → `flex: 1` vô nghĩa, cả TRANG
 *      cuộn và ô nhập trôi khỏi màn đúng lúc cần gõ.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'ConversationScreen.jsx'), 'utf8');
const api = readFileSync(
    join(__dirname, '..', '..', 'api', 'conversation.js'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');
const app = readFileSync(join(__dirname, '..', '..', 'App.jsx'), 'utf8');

describe('KHÔNG tự chấm điểm ở client', () => {
    test('không chép luật so khớp sang đây', () => {
        // Hai bản song song thì sửa một bên là lệch ngay.
        expect(src).not.toMatch(/matchWords|collectUsed|englishForms/);
    });

    test('dùng `matched` server trả về để tô sáng', () => {
        expect(src).toMatch(/data\.matched/);
    });

    test('`usedWords` cũng lấy từ server', () => {
        expect(src).toMatch(/data\.usedWords/);
    });
});

describe('lớp API', () => {
    test('có đủ ba lượt gọi', () => {
        expect(api).toMatch(/\/conversation\/start/);
        expect(api).toMatch(/\/reply/);
        expect(api).toMatch(/\/finish/);
    });

    test('KHÔNG gửi điểm hay thưởng lên server', () => {
        // Gửi lên là mời server tin client — server tự tính lại rồi.
        expect(api).not.toMatch(/usedWords:|xp:|coins:|reward:/);
    });

    test('NÉM LỖI khi request thất bại, không để object lỗi lọt qua', () => {
        // `Http.request` KHÔNG luôn ném: gặp 401/423 nó trả
        // `{ success: false, error }`. Viết `res?.data ?? res` thì object lỗi đó
        // lọt qua như dữ liệu thật — màn hội thoại nhận nó, `targetWords` là
        // undefined, và người dùng thấy phiên rỗng "Từ cần dùng · 0/0" thay vì
        // lời báo lỗi.
        //
        // Đúng lỗi đã gặp: hết năng lượng, server trả 400 "Không đủ năng lượng"
        // mà giao diện vẫn mở phiên trống — tệ nhất, vì năng lượng đã trừ mà
        // người dùng tưởng tính năng chạy.
        expect(api).toMatch(/function unwrap/);
        expect(api).toMatch(/res\.success === false/);
        expect(api).toMatch(/throw new Error/);
    });

    test('CẢ BA lượt gọi đều đi qua unwrap', () => {
        // Sót một chỗ là chỗ đó vẫn để lỗi lọt qua im lặng.
        // Đếm `return unwrap(res)` chứ không đếm `unwrap(res)` trần — chuỗi sau
        // khớp cả bên trong định nghĩa hàm và cho ra 4.
        expect((api.match(/return unwrap\(res\);/g) || []).length).toBe(3);
        // Và trong ConversationAPI không còn chỗ nào trả THẲNG `res?.data ?? res`
        // — lối cũ để object lỗi lọt qua. (Bản thân `unwrap` vẫn dùng nó ở dòng
        // cuối, đó là chỗ hợp lệ duy nhất, nên chỉ dò phần sau `export const`.)
        const apiBody = api.slice(api.indexOf('export const ConversationAPI'));
        expect(apiBody).not.toMatch(/res\?\.data \?\? res/);
    });

    test('màn hình còn chốt cuối: không có `id` thì không mở phiên', () => {
        expect(src).toMatch(/if \(!data\?\.id\)/);
    });
});

describe('dùng đúng API sẵn có của app', () => {
    test('callback nhận chữ là `onText`, KHÔNG phải `onResult`', () => {
        // `createSpeechInput` khai `onText`. Sai tên thì micro chạy mà không
        // điền được chữ nào, và KHÔNG lỗi nào báo.
        const lib = readFileSync(
            join(__dirname, '..', '..', 'lib', 'speechInput.js'), 'utf8');
        expect(lib).toMatch(/onText/);
        expect(src).toMatch(/onText:/);
        expect(src).not.toMatch(/onResult:/);
    });

    test('KHÔNG gửi đề/part/ngôn ngữ lên — server tự đọc', () => {
        // Thay đổi thiết kế quan trọng nhất. Client từng phải gom ba thứ này rồi
        // gửi, và CẢ BA đều từng sai:
        //   · `currentTopic` là OBJECT chứ không phải chuỗi → CastError →
        //     errorHandler dịch thành 404, lỗi hiện ra chẳng liên quan bệnh;
        //   · `settings.selectedPart` bị Mongoose strip nên luôn rỗng;
        //   · `lang` client tự suy từ localStorage.
        //
        // Bỏ hết tham số là bỏ hết cơ hội đoán sai ở ranh giới — đó là GỐC của
        // cả chuỗi lỗi, không phải logic hội thoại.
        expect(src).toMatch(/ConversationAPI\.start\(\)/);
        expect(src).not.toMatch(/TopicSelector\.currentTopic/);
        expect(api).toMatch(/async start\(\{ topic = '' \} = \{\}\)/);
    });

    test('TopicSelector GHI selectedSource vào settings', () => {
        // Đây là vế còn lại: server chỉ đọc được nếu có ai ghi vào.
        const ts = readFileSync(
            join(__dirname, '..', 'vocab', 'topic', 'topicSelector.js'), 'utf8');
        expect(ts).toMatch(/setCurrentTopic\(topic\) \{/);
        expect(ts).toMatch(/s\.selectedSource =/);
    });

    test('MỌI chỗ đổi đề đều qua setCurrentTopic', () => {
        // Gán tay `this.currentTopic = x` là quên đồng bộ settings, và quên thì
        // KHÔNG lỗi nào báo — server lặng lẽ dùng đề cũ.
        // Bỏ COMMENT trước khi đếm: chú thích của `setCurrentTopic` có nhắc
        // `this.currentTopic = x` để giải thích vì sao KHÔNG gán tay — đếm cả
        // lời văn của mình thì ra 2 và test đỏ oan.
        const ts = readFileSync(
            join(__dirname, '..', 'vocab', 'topic', 'topicSelector.js'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter((l) => !/^\s*(\/\/|\*)/.test(l))
            .join('\n');
        // Chỉ được còn ĐÚNG MỘT chỗ gán tay: bên trong chính setter.
        expect((ts.match(/this\.currentTopic = /g) || []).length).toBe(1);
    });

    test('dùng TTS sẵn có để đọc câu NPC', () => {
        expect(src).toMatch(/GameLogic\.speakWord\(text, ttsLang\(\)\)/);
    });

    test('dùng speechLangFor để chọn ngôn ngữ nhận dạng', () => {
        expect(src).toMatch(/speechLangFor\(lang\)/);
    });
});

describe('đồng bộ tài nguyên sau khi server trừ/cộng', () => {
    test('cập nhật năng lượng sau khi mở phiên', () => {
        // Server đã trừ; không đồng bộ thì thanh năng lượng hiện số cũ.
        expect(src).toMatch(/setEnergy\?\.\(data\.energyRemaining\)/);
    });

    test('cộng thưởng vào state sau khi chốt', () => {
        expect(src).toMatch(/creditServerRewards\?\.\(/);
    });

    test('KHÔNG cộng lại nếu đã nhận thưởng trước đó', () => {
        // Server trả `alreadyClaimed` khi gọi lại — cộng nữa là client tự nhân
        // đôi thưởng trên màn hình dù server không cho.
        expect(src).toMatch(/if \(!data\.alreadyClaimed\)/);
    });
});

describe('dọn dẹp và chặn bấm dồn', () => {
    test('dừng micro khi rời màn', () => {
        // Micro chạy tiếp ở màn khác vừa tốn pin vừa là chuyện riêng tư.
        expect(src).toMatch(/if \(active\) return;[\s\S]{0,120}speechRef\.current\?\.stop/);
    });

    test('chặn gửi khi đang chờ server', () => {
        expect(src).toMatch(/if \(!text \|\| busy \|\| !convo\) return;/);
    });

    test('chặn mở phiên hai lần', () => {
        expect(src).toMatch(/if \(starting\) return;/);
    });

    test('AI lỗi thì nói rõ câu VẪN được tính', () => {
        // Người học không được tưởng mình mất lượt.
        expect(src).toMatch(/data\.aiFailed/);
    });
});

describe('bố cục cuộn được', () => {
    test('màn là flex column cao trọn khung nhìn', () => {
        // `.screen.active` mặc định `display: block` — để nguyên thì `flex: 1`
        // vô nghĩa và cả TRANG cuộn, kéo ô nhập trôi khỏi màn lúc cần gõ.
        const m = css.match(/#conversation-screen\.active\s*\{([^}]*)\}/);
        expect(m, 'thiếu quy tắc bố cục cho màn hội thoại').toBeTruthy();
        expect(m[1]).toMatch(/display:\s*flex/);
        expect(m[1]).toMatch(/flex-direction:\s*column/);
        expect(m[1]).toMatch(/100dvh/);
    });

    test('khung hội thoại cuộn RIÊNG', () => {
        const m = css.match(/\.convo-log\s*\{([^}]*)\}/);
        expect(m).toBeTruthy();
        expect(m[1]).toMatch(/overflow-y:\s*auto/);
        // `min-height: 0` bắt buộc với flex item có overflow — thiếu thì khung
        // giãn theo nội dung.
        expect(m[1]).toMatch(/min-height:\s*0/);
    });

    test('từ đã dùng tô XANH, không gạch ngang', () => {
        // Gạch ngang trông như bị VÔ HIỆU — ngược hẳn ý nghĩa, đây là thành tích.
        const m = css.match(/\.convo-chip\.is-used\s*\{([^}]*)\}/);
        expect(m).toBeTruthy();
        expect(m[1]).not.toMatch(/line-through/);
        expect(m[1]).toMatch(/background:\s*#16a34a/);
    });

    test('micro đang nghe thì có dấu hiệu nhìn thấy được', () => {
        const m = css.match(/\.convo-mic\.is-listening\s*\{([^}]*)\}/);
        expect(m).toBeTruthy();
        expect(m[1]).toMatch(/animation:\s*mic-pulse/);
    });
});

describe('cắm vào app', () => {
    test('nạp LƯỜI như các màn khác', () => {
        // Màn này kéo theo cả cụm hội thoại — gộp vào chunk khởi động thì mọi
        // người dùng phải tải dù không dùng tới.
        expect(app).toMatch(/const ConversationScreen = lazy\(/);
    });

    test('có trong bảng màn', () => {
        expect(app).toMatch(/'conversation-screen': ConversationScreen/);
    });
});
