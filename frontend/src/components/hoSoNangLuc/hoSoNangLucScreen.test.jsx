/**
 * Màn Hồ sơ năng lực: dựng thật với dữ liệu mẫu.
 *
 * Chỗ dễ hỏng: người mới (chưa có dữ liệu) làm cả màn hỏng, nút "Luyện" mở sai chỗ, hoặc bỏ qua
 * khoá Level mà đưa thẳng vào màn chưa mở.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const api = vi.hoisted(() => ({ get: vi.fn() }));
const game = vi.hoisted(() => ({ showScreen: vi.fn() }));
const khoa = vi.hoisted(() => ({ ds: {} }));
const moNguPhap = vi.hoisted(() => vi.fn());
vi.mock('@api/hoSoNangLuc.js', () => ({ HoSoNangLucAPI: api }));
vi.mock('@game/GameContext.jsx', () => ({ useGame: () => game }));
vi.mock('@components/auth/AuthContext.jsx', () => ({ useAuth: () => ({ isLoggedIn: true }) }));
vi.mock('@game/featureUnlocks.js', () => ({
    loadUnlocks: async () => {},
    lockInfo: (f) => (khoa.ds[f] ? { locked: true, requiredLevel: khoa.ds[f] } : { locked: false }),
}));
vi.mock('@lib/nguPhapLienKet.js', () => ({ moNguPhap, nguPhapChoLoi: (k) => (k === 'article' ? { id: 'mao-tu', lang: 'en' } : null) }));

import HoSoNangLucScreen from './HoSoNangLucScreen.jsx';

const DAY_DU = {
    tongQuan: { mucTieu: 'toeic', trinhDo: { diem: 55, nhan: 'Cơ bản' }, level: 10, streak: 3 },
    diemManh: [{ chu: 'Nghe đang tiến bộ', loai: 'ky-nang', key: 'nghe' }],
    canCaiThien: [
        { chu: 'Quá khứ: còn yếu', loai: 'ky-nang-con', key: 'qua-khu' },
        { chu: 'Hay sai: Mạo từ', loai: 'loi', key: 'article' },
        { chu: 'TOEIC Part 7 mất nhiều câu', loai: 'toeic-part', key: 7 },
        { chu: 'Viết đang đi xuống', loai: 'ky-nang', key: 'viet' },
    ],
    kyNang: [{ key: 'nghe', ten: 'Nghe', icon: 'fa-headphones', donVi: '%', ganDay: 72, xuHuong: 'len', soLuot: 5 }],
    kyNangCon: [{ key: 'qua-khu', ten: 'Kể chuyện đã qua', icon: 'fa-clock', diem: 30, muc: 'yeu', duDuLieu: true }],
    toeic: { soBai: 2, diemMucTieu: 750, duDoan: { enough: true, predicted: { low: 500, mid: 550, high: 600 } } },
    thanhTich: { tuDaThuoc: 120, tuDangOn: 30, nguPhapDaThuoc: 2, nguPhapDaLuyen: 5, nguPhapTong: 31, phanXaDaThuoc: 9, phanXaTong: 48 },
    coDuLieu: true,
};
const NGUOI_MOI = {
    ...DAY_DU,
    tongQuan: { mucTieu: '', trinhDo: { diem: 0, nhan: 'Chưa đủ dữ liệu' }, level: 1, streak: 0 },
    diemManh: [], canCaiThien: [], kyNang: [], kyNangCon: [], toeic: null, coDuLieu: false,
};

beforeEach(() => {
    api.get.mockReset();
    game.showScreen.mockReset();
    moNguPhap.mockReset();
    khoa.ds = {};
    sessionStorage.clear();
});

describe('hồ sơ năng lực', () => {
    test('đủ dữ liệu: hiện tổng quan, nhận xét, kỹ năng, TOEIC và những gì đã thuộc', async () => {
        api.get.mockResolvedValue(DAY_DU);
        render(<HoSoNangLucScreen active />);
        expect(await screen.findByText('Cơ bản')).toBeInTheDocument();
        expect(screen.getByText('Nghe đang tiến bộ')).toBeInTheDocument();
        expect(screen.getByText('Quá khứ: còn yếu')).toBeInTheDocument();
        expect(screen.getByText('550')).toBeInTheDocument();
        expect(screen.getByText('2/31')).toBeInTheDocument();
        expect(screen.getByText('9/48')).toBeInTheDocument();
    });

    test('số từ ít hơn 3 lượt: hiện mờ, ghi rõ ít dữ liệu; tên nói rõ đo cái gì', async () => {
        api.get.mockResolvedValue({ ...DAY_DU, kyNang: [
            { key: 'nghe', ten: 'Nghe', icon: 'fa-headphones', donVi: '%', ganDay: 30, xuHuong: null, soLuot: 1 },
            { key: 'noi', ten: 'Nói', icon: 'fa-comments', donVi: '/9', ganDay: 4.7, xuHuong: null, soLuot: 7 },
        ] });
        render(<HoSoNangLucScreen active />);
        expect(await screen.findByText(/Nghe chép đoạn/)).toBeInTheDocument();
        expect(screen.getByText('1 lượt · ít dữ liệu').parentElement.className).toContain('is-trong');
        expect(screen.getByText('7 lượt').parentElement.className).not.toContain('is-trong');
    });

    test('người mới: không hỏng, mời làm test trình độ', async () => {
        api.get.mockResolvedValue(NGUOI_MOI);
        render(<HoSoNangLucScreen active />);
        fireEvent.click(await screen.findByRole('button', { name: /Làm test trình độ/ }));
        expect(game.showScreen).toHaveBeenCalledWith('ho-so-hoc-screen');
        expect(screen.queryByText('Điểm mạnh')).toBeNull();
    });

    test('nút Luyện mở đúng chỗ: khung câu, ngữ pháp, đúng Part TOEIC', async () => {
        api.get.mockResolvedValue(DAY_DU);
        render(<HoSoNangLucScreen active />);
        await screen.findByText('Quá khứ: còn yếu');
        const nut = screen.getAllByRole('button', { name: 'Luyện' });

        fireEvent.click(nut[1]); // Quá khứ
        expect(sessionStorage.getItem('levelup.phanXa.khung')).toBe('qua-khu');
        expect(game.showScreen).toHaveBeenLastCalledWith('phan-xa-screen');

        fireEvent.click(nut[2]); // Mạo từ
        expect(moNguPhap).toHaveBeenCalledWith({ id: 'mao-tu', lang: 'en' });

        fireEvent.click(nut[3]); // Part 7
        expect(sessionStorage.getItem('levelup.toeic.moi')).toBe('7');
        expect(game.showScreen).toHaveBeenLastCalledWith('toeic-screen');
    });

    test('chế độ còn khoá Level: báo Level, không đưa vào màn chưa mở', async () => {
        khoa.ds = { 'feature:essay': 15, 'feature:toeic': 12 };
        api.get.mockResolvedValue(DAY_DU);
        render(<HoSoNangLucScreen active />);
        await screen.findByText('Viết đang đi xuống');
        expect(screen.getByText(/Level 15/)).toBeInTheDocument();
        expect(screen.getByText(/Level 12/)).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Luyện' })).toHaveLength(3);
    });

    test('có trong menu và đường dẫn màn', async () => {
        const { readFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const goc = join(process.cwd(), 'src');
        expect(readFileSync(join(goc, 'layouts', 'SideMenu.jsx'), 'utf8')).toMatch(/label: 'Hồ sơ năng lực', icon: 'fa-id-card', screen: 'ho-so-nang-luc-screen'/);
        expect(readFileSync(join(goc, 'App.jsx'), 'utf8')).toMatch(/'ho-so-nang-luc-screen': HoSoNangLucScreen/);
        expect(readFileSync(join(goc, 'api', 'hoSoNangLuc.js'), 'utf8')).toMatch(/'\/ho-so-nang-luc'/);
    });

    test('lỗi tải: báo lỗi, không trắng màn', async () => {
        api.get.mockRejectedValue(new Error('Mất mạng'));
        render(<HoSoNangLucScreen active />);
        expect(await screen.findByText('Mất mạng')).toBeInTheDocument();
    });
});
