/**
 * Chart.js phải nạp THEO YÊU CẦU, không nằm trong chunk khởi động.
 *
 * Trước đây `import Chart from 'chart.js/auto'` nằm thẳng trong main.jsx, nên
 * thư viện lọt vào chunk chính và MỌI người dùng tải nó ngay từ đầu — dù biểu
 * đồ chỉ xuất hiện ở màn Thống kê và tab Phân tích TOEIC.
 *
 * Đo thật: bỏ khỏi chunk chính giảm 875 → 676 kB (gzip 256 → 188 kB).
 *
 * Hỏng IM LẶNG nếu làm sai: các component vẽ biểu đồ đều kiểm `window.Chart`
 * rồi BỎ QUA nếu chưa có. Quên nạp thì canvas trống trơn, không lỗi nào cả.
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => readFileSync(join(__dirname, '..', p), 'utf8');
const main = readFileSync(join(__dirname, '..', 'main.jsx'), 'utf8');
const loader = readFileSync(join(__dirname, 'loadChart.js'), 'utf8');

const CHART_FILES = [
    'components/statistics/StatisticsScreen.jsx',
    'components/toeic/selector/charts/ProgressChart.jsx',
    'components/toeic/selector/charts/ListeningReadingChart.jsx',
    'components/toeic/selector/charts/PartsChart.jsx',
];

describe('không nằm trong chunk khởi động', () => {
    test('main.jsx KHÔNG import tĩnh chart.js', () => {
        expect(main).not.toMatch(/^import .* from ['"]chart\.js/m);
    });

    test('main.jsx không tự gán window.Chart nữa', () => {
        expect(main).not.toMatch(/window\.Chart = Chart/);
    });

    test('chỉ MỘT nơi import chart.js — bằng dynamic import', () => {
        expect(loader).toMatch(/await import\(['"]chart\.js\/auto['"]\)|import\(['"]chart\.js\/auto['"]\)/);
    });
});

describe('mọi nơi vẽ biểu đồ đều gọi loadChart', () => {
    for (const f of CHART_FILES) {
        test(`${f.split('/').pop()} gọi loadChart trước khi vẽ`, () => {
            const src = read(f);
            // Quên gọi thì canvas trống trơn mà không có lỗi nào.
            expect(src).toMatch(/loadChart\(\)/);
            expect(src).toMatch(/from '@lib\/loadChart\.js'/);
        });
    }
});

describe('không vẽ lên canvas đã bị gỡ', () => {
    for (const f of CHART_FILES) {
        test(`${f.split('/').pop()} có cờ huỷ khi unmount`, () => {
            // Người dùng rời màn trong lúc chờ tải thư viện → Chart dựng lên
            // trên canvas không còn trong DOM.
            const src = read(f);
            expect(src).toMatch(/let cancelled = false/);
            expect(src).toMatch(/cancelled = true/);
        });
    }
});

describe('nạp hỏng không làm sập màn hình', () => {
    test('mọi nơi gọi đều bắt lỗi', () => {
        for (const f of CHART_FILES) {
            expect(read(f), `${f} thiếu catch`).toMatch(/\.catch\(/);
        }
    });

    test('nạp hỏng thì XOÁ promise đã lưu để lần sau thử lại được', () => {
        // Giữ lại promise lỗi là biểu đồ chết vĩnh viễn cho tới khi F5.
        expect(loader).toMatch(/_loading = null;/);
    });

    test('hai màn cùng mở chỉ tải MỘT lần', () => {
        expect(loader).toMatch(/if \(_loading\) return _loading;/);
        expect(loader).toMatch(/if \(window\.Chart\) return Promise\.resolve\(\);/);
    });
});
