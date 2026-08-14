/**
 * Dải độ khó trên thẻ đề (popup "Chọn đề luyện tập").
 *
 * Hai chỗ dễ hỏng im lặng:
 *   1. Server CŨ chưa trả `levelStats` → `undefined`. Vẽ bừa thì `flex: NaN`
 *      làm cả thẻ vỡ bố cục; phải lặng lẽ không vẽ gì.
 *   2. Tỉ lệ phải tính theo TỔNG a+b+c, không theo `wordCount`: từ chưa gắn
 *      level nằm ngoài ba nhóm, tính vào mẫu số thì dải luôn hụt một khoảng
 *      trống không ai giải thích được.
 */
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import LevelBar from './LevelBar.jsx';

const bar = (c) => c.container.querySelector('.part-level-bar');
const segs = (c) => [...(bar(c)?.children || [])];

describe('không có dữ liệu thì không vẽ gì', () => {
    test('thiếu hẳn levelStats (server cũ)', () => {
        expect(bar(render(<LevelBar stats={undefined} />))).toBeNull();
        expect(bar(render(<LevelBar stats={null} />))).toBeNull();
    });

    test('có object nhưng cả ba đều 0', () => {
        // Bộ từ chưa gắn level cho từ nào — vẽ dải rỗng chỉ tổ chiếm chỗ.
        expect(bar(render(<LevelBar stats={{ a: 0, b: 0, c: 0 }} />))).toBeNull();
    });
});

describe('vẽ đúng ba màu theo tỉ lệ', () => {
    test('đủ ba mức → ba đoạn, đúng màu', () => {
        const c = render(<LevelBar stats={{ a: 50, b: 30, c: 20 }} />);
        const s = segs(c);
        expect(s).toHaveLength(3);
        expect(s[0].style.background).toBe('rgb(34, 197, 94)');   // #22c55e
        expect(s[1].style.background).toBe('rgb(245, 158, 11)');  // #f59e0b
        expect(s[2].style.background).toBe('rgb(239, 68, 68)');   // #ef4444
    });

    test('mức nào bằng 0 thì KHÔNG vẽ đoạn rỗng', () => {
        const s = segs(render(<LevelBar stats={{ a: 10, b: 0, c: 5 }} />));
        expect(s).toHaveLength(2);
    });

    test('tỉ lệ tính theo tổng a+b+c', () => {
        const s = segs(render(<LevelBar stats={{ a: 25, b: 25, c: 50 }} />));
        expect(s[0].style.flex).toMatch(/^25\b/);
        expect(s[2].style.flex).toMatch(/^50\b/);
    });

    test('ba đoạn luôn phủ kín 100% — không hở do làm tròn', () => {
        // 1/3 mỗi mức: làm tròn ra 33+33 rồi đoạn cuối phải nhận 34.
        const s = segs(render(<LevelBar stats={{ a: 1, b: 1, c: 1 }} />));
        const total = s.reduce((n, el) => n + parseFloat(el.style.flex), 0);
        expect(total).toBe(100);
    });
});

describe('bo góc ở hai đầu dải thật sự có mặt', () => {
    test('chỉ một mức → bo tròn cả hai đầu', () => {
        // Không xử lý thì Part chỉ có mỗi mức B ra một dải vuông chằn chặn giữa
        // các dải bo tròn khác.
        const s = segs(render(<LevelBar stats={{ a: 0, b: 7, c: 0 }} />));
        expect(s).toHaveLength(1);
        expect(s[0].style.borderRadius).toBe('3px');
    });

    test('hai mức → đoạn đầu bo trái, đoạn cuối bo phải', () => {
        const s = segs(render(<LevelBar stats={{ a: 0, b: 4, c: 6 }} />));
        expect(s[0].style.borderRadius).toBe('3px 0 0 3px');
        expect(s[1].style.borderRadius).toBe('0 3px 3px 0');
    });
});

describe('con số vẫn tra được', () => {
    test('mỗi đoạn có title ghi rõ số từ', () => {
        // Không in thành chữ (làm thẻ cao thêm một dòng), nhưng rê chuột phải ra.
        const s = segs(render(<LevelBar stats={{ a: 18, b: 3, c: 1 }} />));
        expect(s[0].getAttribute('title')).toBe('A: 18 từ');
        expect(s[1].getAttribute('title')).toBe('B: 3 từ');
    });
});
