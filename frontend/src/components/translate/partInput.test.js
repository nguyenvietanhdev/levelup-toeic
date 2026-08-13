/**
 * Ô Part trong popup Dịch nhanh + bỏ nút "Thêm vào từ yêu thích".
 *
 * PART: trước đây mọi từ lưu qua Dịch nhanh đều vào cùng MỘT part
 * (DICH-NHANH-*). Luyện tập lọc theo part, nên bộ càng lớn càng vô dụng — tất cả
 * chung một rổ thì không tách được chủ đề nào. Giờ người dùng tự đặt, và giá trị
 * NHỚ QUA localStorage: lưu 20 từ vào cùng chủ đề mà gõ lại tên 20 lần thì không
 * ai dùng.
 *
 * YÊU THÍCH: bỏ khỏi popup này. Yêu thích vốn để đánh dấu từ CÓ SẴN trên hệ
 * thống; lưu từ tự dịch vào đó là trộn hai loại dữ liệu và làm loãng danh sách
 * ôn tập. (Lo ngại "đầy localStorage" thì không đúng — đã kiểm: nó lưu trong
 * MongoDB `User.favoriteWords`, có sẵn giới hạn maxFavorites, 16 từ = 1.9KB.)
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'TranslateModal.jsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l) && !/^\s*\{?\/\*/.test(l)).join('\n');

describe('ô Part', () => {
    test('có ô nhập, không gán cứng part nữa', () => {
        expect(src).toMatch(/translate-part-input/);
        expect(src).toMatch(/partDraft/);
    });

    test('đọc giá trị cũ từ localStorage lúc mở', () => {
        // Không đọc lại thì mỗi lần mở popup là một lần gõ tay.
        expect(src).toMatch(/localStorage\.getItem\(PART_KEY\)/);
    });

    test('chỉ ghi nhớ SAU KHI lưu thành công', () => {
        // Ghi sớm là nhớ luôn cả giá trị vừa bị server từ chối.
        const i = src.indexOf('res?.success');
        const j = src.indexOf('localStorage.setItem(PART_KEY', i);
        expect(i).toBeGreaterThan(-1);
        expect(j).toBeGreaterThan(i);
    });

    test('để trống thì part BÁM theo source, không chặn người dùng', () => {
        // Không bắt ai nghĩ ra tên trước khi lưu được từ đầu tiên. Và part mặc
        // định phải bám source: gõ source riêng mà part vẫn là DICH-NHANH-* thì
        // hai trường nói hai chuyện khác nhau về cùng một từ.
        expect(src).toMatch(/part = typed \|\| source\.toUpperCase\(\)/);
    });

    test('để trống SOURCE thì vẫn tách theo ngôn ngữ như cũ', () => {
        expect(src).toMatch(/typedSource \|\| \(isZhWord \? 'dich-nhanh-zh' : 'dich-nhanh-en'\)/);
    });

    test('source hạ CHỮ THƯỜNG — backend lower() nó trước khi ghi', () => {
        // Gõ HOA mà không hạ ở đây thì tưởng tạo kho mới, thực tế vào kho cũ.
        expect(src).toMatch(/sourceDraft\.trim\(\)\.toLowerCase\(\)/);
    });

    test('Enter trong ô Part = lưu luôn', () => {
        // Gõ xong tên part rồi phải rời tay sang chuột bấm nút là cắt mạch —
        // lưu theo đợt thì mỗi từ một lần chuyển tay.
        expect(src).toMatch(/translate-part-input[\s\S]{0,600}handleSaveVocab\(\)/);
    });

    test('Enter KHÔNG lưu khi đang tải / lỗi / đã lưu rồi', () => {
        expect(src).toMatch(/if \(loading \|\| error \|\| savedVocab\) return;/);
    });

    test('viết HOA part — khớp quy ước của phần còn lại', () => {
        expect(src).toMatch(/partDraft\.trim\(\)\.toUpperCase\(\)/);
    });

    test('localStorage bị chặn không làm hỏng việc lưu từ', () => {
        // Chế độ riêng tư / bị chặn cookie: mất tính nhớ thì được, mất từ thì không.
        expect(src).toMatch(/try \{[\s\S]{0,200}localStorage\.setItem\(PART_KEY[\s\S]{0,200}\} catch/);
    });
});

describe('bỏ nút "Thêm vào từ yêu thích"', () => {
    test('không còn nút trong popup', () => {
        expect(src).not.toMatch(/Thêm vào từ yêu thích/);
        expect(src).not.toMatch(/handleSaveFavorite/);
    });

    test('dọn sạch mã chết đi kèm', () => {
        // Để lại là gọi hàm không tồn tại → lỗi runtime, hoặc import thừa.
        expect(src).not.toMatch(/setSaved\(/);
        expect(src).not.toMatch(/FavoritesAPI/);
        expect(src).not.toMatch(/function isAlreadyFavorite/);
    });

    test('bỏ luôn nút "Xem từ yêu thích" — popup chỉ làm một việc', () => {
        // Ban đầu chỉ bỏ đường LƯU và giữ nút XEM. Sau đó bỏ nốt: popup này giờ
        // chỉ để dịch rồi lưu vào từ vựng riêng. Yêu thích vẫn mở từ thanh nav.
        expect(src).not.toMatch(/Xem từ yêu thích/);
        expect(src).not.toMatch(/favCount/);
        expect(src).not.toMatch(/onOpenFavorites/);
    });
});

describe('không nghe được gì thì trả lại chữ cũ', () => {
    test('khôi phục srcDraft khi phiên nói không ra chữ nào', () => {
        // onStart đã xoá ô để nói đè; không khôi phục thì ô FROM ở lại TRỐNG
        // trong khi TO vẫn giữ bản dịch cũ — nhìn như app tự nuốt mất chữ.
        expect(src).toMatch(/setSrcDraft\(inputTextRef\.current\)/);
    });

    test('đọc inputText qua REF, không qua closure', () => {
        // Callback nhận dạng do effect tạo một lần; đọc thẳng `inputText` là lấy
        // giá trị của lần render đầu.
        expect(src).toMatch(/inputTextRef\.current = inputText/);
    });
});

describe('sửa lỗi chữ nhân đôi', () => {
    test('onBlur không đồng bộ khi ĐANG NGHE', () => {
        // Giữ Shift làm ô mất focus → onBlur đẩy chữ cũ sang inputText → hiệu ứng
        // ghi ngược lại srcDraft → giọng nói nối tiếp vào đó = `你好你好。`
        expect(src).toMatch(/if \(listening\) return;/);
    });
});
