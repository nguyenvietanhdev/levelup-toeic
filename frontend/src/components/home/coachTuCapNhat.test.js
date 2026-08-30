/**
 * "Hôm nay nên luyện gì" phải TỰ cập nhật, và nghe theo đúng ngôn ngữ.
 *
 * Hai lỗi khác nhau, cùng một gốc: lấy dữ liệu MỘT LẦN rồi coi như nó không
 * bao giờ đổi.
 *
 *   1. `useEffect(..., [])` — nạp lúc mount. Nhưng `HomeScreen` là màn ở LẠI
 *      trong cây (chỉ đổi class `active`), nên nó không unmount khi người dùng
 *      đi luyện tập. Con số "N từ đến hạn ôn" đóng băng từ lúc mở app: ôn xong
 *      quay về vẫn thấy số cũ, phải F5 cả trang mới đúng.
 *
 *   2. Ngôn ngữ nhận dạng giọng nói đoán theo mặt chữ. Từ tiếng Trung viết
 *      bằng chữ số hay ký tự Latin (2002年, Tầng 1, OK) rơi vào nhánh 'en-US',
 *      và người học nói tiếng Trung mà máy nghe bằng tiếng Anh.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const F = (...p) => readFileSync(join(__dirname, ...p), 'utf8');
const panel = F('CoachPanel.jsx');
const home = F('HomeScreen.jsx');
const css = F('..', '..', 'assets', 'styles', 'components.css');
const review = F('..', 'practice', 'modes', 'reviewMistakes.js');

describe('gợi ý tự cập nhật khi vào lại Trang chủ', () => {
    test('effect phụ thuộc `active`, không phải deps rỗng', () => {
        // Deps rỗng = nạp đúng một lần cả phiên.
        // Neo vào đúng khối `useEffect`: `napLai` là `useCallback` và deps `[]`
        // ở ĐÓ là đúng — soi cả file thì bắt nhầm nó.
        const i = panel.indexOf('useEffect(() => {');
        expect(i).toBeGreaterThan(-1);
        // Cắt tới hết DÒNG deps, không cộng một số ký tự cố định: cộng thiếu
        // là cắt cụt giữa chữ `active` và mẫu không bao giờ khớp.
        const iDeps = panel.indexOf('\n    }, [', i);
        expect(iDeps).toBeGreaterThan(i);
        const khoi = panel.slice(i, panel.indexOf(');', iDeps) + 2);
        expect(khoi).toMatch(/\}, \[active\]/);
        expect(khoi).not.toMatch(/\}, \[\]/);
    });

    test('không nạp khi màn đang ẩn', () => {
        // Trang chủ nằm trong cây kể cả lúc ẩn; nạp lúc đó là gọi mạng vô ích
        // giữa lượt luyện tập.
        expect(panel).toMatch(/if \(!active\) return;/);
    });

    test('nhận `active` từ ngoài, có mặc định', () => {
        // Mặc định `true` để chỗ nào quên truyền vẫn chạy như cũ.
        expect(panel).toMatch(/CoachPanel\(\{ onPick, active = true \}\)/);
    });

    test('`HomeScreen` truyền `active` xuống', () => {
        // Thiếu thì prop luôn là mặc định và effect chỉ chạy một lần.
        expect(home).toMatch(/<CoachPanel onPick=\{handleCoachPick\} active=\{active\} \/>/);
    });
});

describe('nút tải lại', () => {
    test('có nút, gọi lại API', () => {
        expect(panel).toMatch(/className="coach-reload"/);
        expect(panel).toMatch(/onClick=\{napLai\}/);
    });

    test('đứng TRƯỚC "Xem thêm"', () => {
        const iReload = panel.indexOf('coach-reload');
        const iToggle = panel.indexOf('coach-toggle');
        expect(iReload).toBeGreaterThan(-1);
        expect(iReload).toBeLessThan(iToggle);
    });

    test('đang tải thì không bấm được', () => {
        // Bấm dồn là gọi mạng chồng nhau.
        expect(panel).toMatch(/disabled=\{dangTai\}/);
    });

    test('tắt cờ tải trong `finally`', () => {
        // Đặt sau `await` thì mạng hỏng là dòng đó bị nhảy qua và nút quay mãi.
        const i = panel.indexOf('const napLai');
        const than = panel.slice(i, panel.indexOf('\n    }, []);', i));
        expect(than).toMatch(/finally \{/);
        expect(than).toMatch(/setDangTai\(false\)/);
    });

    test('tiêu đề đẩy bằng `margin-right: auto`', () => {
        // Hàng nay có BA phần tử; `space-between` của khối cha dàn đều cả ba
        // nên nút tải lại trôi ra giữa hàng.
        const i = css.indexOf('.coach-head h3 {');
        expect(i).toBeGreaterThan(-1);
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/margin-right: auto/);
    });

    test('có kiểu cho nút và trạng thái tắt', () => {
        expect(css).toMatch(/\.coach-reload \{/);
        expect(css).toMatch(/\.coach-reload:disabled \{/);
    });
});

describe('nghe theo NGÔN NGỮ CỦA CẶP, không đoán mặt chữ', () => {
    const than = (() => {
        const i = review.indexOf('ganPhatAm(question) {');
        expect(i).toBeGreaterThan(-1);
        return review.slice(i, review.indexOf('\n    },', i));
    })();

    test('lấy mã từ `maCapHoc`, không từ `HAN_RE`', () => {
        expect(than).toMatch(/const maNghe = maCapHoc\(question\.word\)\.tu;/);
        expect(than).not.toMatch(/const laZh = HAN_RE\.test\(tu\)/);
    });

    test('`rec.lang` dùng thẳng mã đó', () => {
        expect(than).toMatch(/rec\.lang = maNghe;/);
        // Không còn nhánh ba ngôi đoán mò.
        expect(than).not.toMatch(/rec\.lang = laZh \? 'zh-CN' : 'en-US'/);
    });

    test('`laZh` suy TỪ mã, không suy ngược lại', () => {
        // `scoreAttempt` và `feedbackMessage` cần cờ này để chuẩn hoá chuỗi;
        // để nó tự tính lại theo mặt chữ là hai chỗ lệch nhau.
        expect(than).toMatch(/const laZh = maNghe\.startsWith\('zh'\)/);
    });

    test('truyền CẢ bản ghi vào `maCapHoc`', () => {
        // Kho song ngữ chứa cả hai chiều (`hienThi` của TỪNG bản ghi), nên hỏi
        // "kho này mặt trước là gì" là câu hỏi sai.
        expect(than).toMatch(/maCapHoc\(question\.word\)/);
    });

    test('có import `maCapHoc`', () => {
        expect(review).toMatch(/import \{ maCapHoc \} from '\.\.\/nhanNgonNgu\.js'/);
    });
});
