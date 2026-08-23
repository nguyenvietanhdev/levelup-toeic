/**
 * Màn hình Dịch đoạn văn.
 *
 * Đếm đơn vị GỌI HÀM THẬT — đó là chỗ đã sai một lần ở Viết luận: đếm theo
 * khoảng trắng thì cả bài tiếng Trung ra đúng 1, người học viết 30 chữ vẫn thấy
 * "1 / 20" và nút Chấm không bao giờ bật.
 *
 * Phần còn lại đọc mã nguồn: render đủ màn này cần `useGame`, `GameState`,
 * `GameLogic`, `Energy` và một server giả — công lớn hơn thứ nó kiểm, mà điều
 * cần giữ là các bất biến về luồng (bỏ bài cũ khi đổi đề, mở popup nạp năng
 * lượng thay vì báo lỗi suông, bản dịch tham khảo đặt sau phần lỗi).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'TranslationScreen.jsx'), 'utf8');
const api = readFileSync(join(__dirname, '..', '..', 'api', 'translation.js'), 'utf8');
const home = readFileSync(join(__dirname, '..', 'home', 'HomeScreen.jsx'), 'utf8');
const app = readFileSync(join(__dirname, '..', '..', 'App.jsx'), 'utf8');
const css = readFileSync(
    join(__dirname, '..', '..', 'assets', 'styles', 'components.css'), 'utf8');

/** Nạp `countUnits` thật từ nguồn. */
function napDem() {
    const i = src.indexOf('function countUnits');
    const j = src.indexOf('\n}', i) + 2;
    return new Function(`${src.slice(i, j)}; return countUnits;`)();
}

describe('đếm đơn vị theo ngôn ngữ', () => {
    const countUnits = napDem();

    test('tiếng Anh đếm theo TỪ', () => {
        expect(countUnits('I went to work late', 'en')).toBe(5);
    });

    test('khoảng trắng thừa không thành từ', () => {
        expect(countUnits('  hello   world  ', 'en')).toBe(2);
        expect(countUnits('', 'en')).toBe(0);
        expect(countUnits('   ', 'en')).toBe(0);
    });

    test('tiếng Trung đếm CHỮ HÁN, không theo khoảng trắng', () => {
        // Đếm theo khoảng trắng thì chuỗi này ra 1 và người học không bao giờ
        // nộp được bài.
        expect(countUnits('我昨天上班迟到了', 'zh')).toBe(8);
    });

    test('dấu câu tiếng Trung KHÔNG tính là chữ', () => {
        // Không loại thì nhồi 。，是 đủ ngưỡng mà chẳng viết gì.
        expect(countUnits('我去。你来，他走！', 'zh')).toBe(6);
    });

    test('giá trị hỏng không làm vỡ màn hình', () => {
        for (const v of [null, undefined, 123]) {
            expect(Number.isFinite(countUnits(v, 'en'))).toBe(true);
            expect(Number.isFinite(countUnits(v, 'zh'))).toBe(true);
        }
    });
});

describe('luồng làm bài', () => {
    test('đổi đề thì XOÁ bài cũ và kết quả cũ', () => {
        // Giữ lại là người dùng nộp nhầm bản dịch của đoạn trước, và AI chấm
        // "đủ ý" rất thấp mà họ không hiểu vì sao.
        const i = src.indexOf('const handleDeMoi');
        const than = src.slice(i, src.indexOf('}, [loadingDe, level]);', i));
        expect(than).toMatch(/setBanDich\(''\)/);
        expect(than).toMatch(/setResult\(null\)/);
    });

    test('thiếu năng lượng → mở popup nạp, không báo lỗi suông', () => {
        // Người dùng vừa ngồi dịch xong cả đoạn; bắt họ tự đi tìm cửa hàng rồi
        // quay lại bấm lại là mất bài.
        const i = src.indexOf('err?.energyNeeded');
        expect(i).toBeGreaterThan(-1);
        expect(src.slice(i, i + 260)).toMatch(/showRefillModal/);
        // Và mua xong thì chấm luôn.
        expect(src.slice(i, i + 260)).toMatch(/gradeRef\.current/);
    });

    test('chặn bài quá ngắn ở client TRƯỚC khi gọi server', () => {
        const i = src.indexOf('const handleGrade');
        const than = src.slice(i, i + 600);
        expect(than.indexOf('if (!enough)')).toBeLessThan(than.indexOf('setGrading(true)'));
    });

    test('điểm và năng lượng lấy từ SERVER, không tự tính ở client', () => {
        // Mọi logic tiền tệ/XP phải server-side — client chỉ hiển thị.
        expect(src).toMatch(/GameState\.setEnergy\?\.\(d\.energyRemaining\)/);
        expect(src).toMatch(/creditServerRewards/);
        expect(src).not.toMatch(/overall\s*=\s*\(/);
    });
});

describe('hiển thị kết quả', () => {
    test('BA trục riêng, khớp server', () => {
        // Cả lý do tồn tại của chế độ này nằm ở chỗ tách `naturalness` khỏi
        // `grammar` — gộp lại là mất đúng thứ nó sinh ra để phân biệt.
        const i = src.indexOf('const CRITERIA = [');
        const khoi = src.slice(i, src.indexOf('];', i));
        for (const k of ['accuracy', 'grammar', 'naturalness']) {
            expect(khoi).toContain(`key: '${k}'`);
        }
    });

    test('bản dịch tham khảo đặt SAU phần lỗi', () => {
        // Đọc đáp án trước thì phần nhận xét về bài mình thành ra thừa.
        expect(src.indexOf('result.notes?.length'))
            .toBeLessThan(src.indexOf('result.reference &&'));
    });

    test('nói rõ điểm là ƯỚC LƯỢNG của app', () => {
        // Để người dùng tin đó là điểm thi thật thì họ vào phòng thi mới vỡ mộng.
        expect(src).toMatch(/essay-disclaimer/);
        expect(src).toMatch(/ước lượng/);
    });
});

describe('gửi lên server', () => {
    test('KHÔNG gửi ngôn ngữ đích — server đọc từ hồ sơ', () => {
        // Client khai `lang: 'en'` cho bài tiếng Trung là bài bị chấm bằng tiêu
        // chí tiếng Anh, tức điểm hoàn toàn vô nghĩa.
        expect(api).not.toMatch(/lang[,:]/);
    });

    test('CÓ gửi từ vựng — server không biết bộ từ đã lọc', () => {
        // Ngoại lệ có chủ ý so với `EssayAPI.prompt()`: bộ từ nằm ở client sau
        // khi đã lọc theo Part và cấp độ.
        expect(api).toMatch(/passage\(\{ words/);
        expect(src).toMatch(/words: layTuGoiY\(\)/);
    });

    test('từ gợi ý lấy NGẪU NHIÊN, không phải 8 từ đầu', () => {
        // Bộ từ xếp cố định — lấy đầu danh sách thì mọi lượt dịch đều xoay
        // quanh đúng ngần ấy từ.
        const i = src.indexOf('function layTuGoiY');
        expect(src.slice(i, src.indexOf('\n}', i))).toMatch(/sort\(\(\) => Math\.random/);
    });

    test('hai lớp `.data` được gỡ đúng', () => {
        // `Http` bọc phản hồi vào `.data`, mà phản hồi server cũng là
        // `{ success, data }`. Gỡ một lớp là màn hình nhận object rỗng.
        expect(api).toMatch(/'success' in outer/);
        expect(api).toMatch(/if \('data' in outer\) return outer\.data/);
    });

    test('lỗi mang theo DỮ LIỆU, không chỉ câu chữ', () => {
        // `energyNeeded` là thứ để màn hình mở đúng popup thay vì một dòng đỏ.
        expect(api).toMatch(/Object\.assign\(err, payload\)/);
    });
});

describe('lối vào từ trang chủ', () => {
    test('thẻ mở MÀN HÌNH riêng, không qua PracticeManager', () => {
        // Đoạn văn do AI sinh chứ không lấy từ bộ từ đã lọc, nên không có đề/Part
        // nào để chọn.
        expect(home).toMatch(/screen: 'translation-screen'/);
        const i = home.indexOf('modeConfig?.screen');
        expect(i).toBeGreaterThan(-1);
        // Và phải đứng TRƯỚC bước bắt chọn đề.
        expect(i).toBeLessThan(home.indexOf('TOPIC_MODAL_REQUESTED', i - 400));
    });

    test('khoá theo Level ở client lẫn server', () => {
        expect(home).toMatch(/feature: 'feature:translation'/);
    });

    test('màn hình được đăng ký trong App', () => {
        expect(app).toMatch(/'translation-screen': TranslationScreen/);
        // Nạp lười như các màn khác — gộp vào bundle chính thì mọi người tải
        // thêm một màn hình họ có thể không bao giờ mở.
        expect(app).toMatch(/lazy\(\(\) => import\('@components\/translation/);
    });
});

describe('CSS riêng của chế độ', () => {
    test('mỗi selector khai đúng MỘT lần', () => {
        // Khai hai lần thì rule sau âm thầm đè rule trước.
        for (const sel of ['.tr-levels {', '.tr-level {', '.tr-summary {', '.tr-intro-note {']) {
            expect(css.split(sel).length - 1).toBe(1);
        }
    });

    test('mức đang chọn phân biệt bằng VIỀN, không chỉ nền', () => {
        // Nền đổi nhẹ thì trên màn sáng gần như không thấy nút nào đang bật.
        const i = css.indexOf('.tr-level.is-on {');
        expect(i).toBeGreaterThan(-1);
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/border-color/);
    });

    test('hàng chọn mức xuống dòng được trên màn hẹp', () => {
        const i = css.indexOf('.tr-levels {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/flex-wrap: wrap/);
    });
});

describe('nhật ký lỗi ngữ pháp', () => {
    const log = readFileSync(join(__dirname, 'MistakeLog.jsx'), 'utf8');

    test('gom từ CẢ Dịch lẫn Viết luận, không chia đôi theo chế độ', () => {
        // Cùng một người viết thì sai cùng kiểu; chia đôi chỉ làm mỗi bên ít dữ
        // liệu hơn mà không nói thêm được gì.
        const ctrl = readFileSync(
            join(__dirname, '..', '..', '..', '..', 'backend', 'controllers',
                'translationController.js'), 'utf8');
        const i = ctrl.indexOf('exports.mistakes');
        const than = ctrl.slice(i);
        expect(than).toMatch(/Translation\.find/);
        expect(than).toMatch(/Essay\.find/);
    });

    test('có VÍ DỤ thật cho mỗi nhóm, không chỉ con số', () => {
        // "Bạn sai mạo từ 14 lần" không dạy được gì nếu không thấy lại câu
        // mình đã viết.
        expect(log).toMatch(/examples\?\.\[s\.key\]/);
        expect(log).toMatch(/ml-example/);
    });

    test('có gợi ý luyện tập, không chỉ chẩn đoán', () => {
        // Biết mình sai nhiều mà không biết làm gì tiếp thì thống kê chỉ để ngắm.
        expect(log).toMatch(/s\.hint/);
    });

    test('thanh dài theo TỈ LỆ với nhóm nhiều nhất', () => {
        // Con số đứng một mình không cho thấy "14" là nhiều hay ít so với các
        // lỗi khác.
        expect(log).toMatch(/s\.count \/ nhieuNhat/);
        // Và không chia cho 0 khi danh sách rỗng.
        expect(log).toMatch(/stats\[0\]\?\.count \|\| 1/);
    });

    test('không có dữ liệu thì NÓI RÕ, không để màn trống', () => {
        // Màn trống làm người dùng tưởng tính năng hỏng.
        expect(log).toMatch(/Chưa có dữ liệu/);
        expect(log).toMatch(/ml-empty-hint/);
    });

    test('lỗi mạng hiện được nút thử lại', () => {
        expect(log).toMatch(/Thử lại/);
    });

    test('chỉ MỘT nhóm mở tại một thời điểm', () => {
        // Mở hết thì danh sách dài ra và mất luôn cái nhìn tổng quan.
        expect(log).toMatch(/setMoNhom\(dangMo \? '' : s\.key\)/);
    });

    test('mặc định 90 ngày — không tính lỗi đã quá cũ', () => {
        expect(log).toMatch(/useState\(90\)/);
    });

    test('nằm chung màn với phần làm bài, dạng tab', () => {
        // Xem mình hay sai gì rồi làm bài ngay là một mạch; tách màn riêng thì
        // phải nhớ đường quay lại.
        expect(src).toMatch(/<MistakeLog \/>/);
        expect(src).toMatch(/tr-tab/);
    });

    test('CSS mỗi selector khai đúng một lần', () => {
        for (const sel of ['.ml-bar {', '.ml-row {', '.tr-tabs {', '.ml-empty {']) {
            expect(css.split(sel).length - 1).toBe(1);
        }
    });

    test('tab chưa chọn vẫn có viền dưới trong suốt', () => {
        // Thêm viền lúc chọn làm nút cao thêm 2px và cả hàng nhích một nhịp.
        const i = css.indexOf('.tr-tab {');
        expect(css.slice(i, css.indexOf('}', i))).toMatch(/border-bottom: 2px solid transparent/);
    });
});
