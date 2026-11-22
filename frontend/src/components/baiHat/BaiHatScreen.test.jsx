/**
 * Học qua bài hát (màn hình), với trình phát YouTube giả.
 *
 * Chỗ dễ hỏng: tô cả dòng thay vì chạy màu qua từng chữ; Điền từ không dừng nhạc ở cuối dòng còn
 * ô trống, hoặc điền đúng mà không hát tiếp; bài chưa có nhịp mà vẫn mở Xem lời; phím cách bấm
 * nhịp lại cướp phím khi đang gõ; lưu từ vào nhầm kho.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const api = vi.hoisted(() => ({ danhSach: vi.fn(), lay: vi.fn(), them: vi.fn(), timLoi: vi.fn(), capNhat: vi.fn(), xoa: vi.fn() }));
const may = vi.hoisted(() => ({ t: 0, dangPhat: false, phat: vi.fn(), dung: vi.fn(), tua: vi.fn(), tocDo: vi.fn() }));
const luu = vi.hoisted(() => ({ luuVaoTuRieng: vi.fn() }));
vi.mock('@api/baiHat.js', () => ({ BaiHatAPI: api }));
vi.mock('./useYoutube.js', () => ({
    useYoutube: () => ({
        san: true, dangPhat: may.dangPhat, loi: '',
        gio: () => may.t, phat: may.phat, dung: may.dung, tua: may.tua, tocDo: may.tocDo,
    }),
}));
vi.mock('@lib/luuMauCau.js', () => luu);
vi.mock('@lib/dichNhanh.js', () => ({ dichSangViet: vi.fn(async (t) => (t === 'trouble' ? 'rắc rối' : `[vi] ${t}`)) }));
vi.mock('@game/GameContext.jsx', () => ({ useGame: () => ({ showScreen: vi.fn() }) }));
vi.mock('@components/auth/AuthContext.jsx', () => ({ useAuth: () => ({ isLoggedIn: true }) }));
vi.mock('@ui/Toaster.jsx', () => ({ Notification: { error: vi.fn(), success: vi.fn() } }));

import BaiHatScreen from './BaiHatScreen.jsx';

const BAI = {
    id: 'b1', youtubeId: 'QDYfEBY9NM4', tieuDe: 'Let It Be', ngheSi: 'The Beatles', lang: 'en', thoiLuong: 60,
    nguonLoi: 'lrclib', coMoc: true, lech: 0, soDong: 2,
    cau: [
        { batDau: 10, ketThuc: 16, text: 'When I find myself in times of trouble' },
        { batDau: 16, ketThuc: 20, text: 'Mother Mary comes to me' },
    ],
};

/** Chạy vòng lặp theo khung hình tới thời điểm phát `t`. */
async function toiGiay(t) {
    may.t = t;
    await act(async () => { vi.advanceTimersByTime(50); });
    await act(async () => { vi.advanceTimersByTime(50); });
}

async function moBai(bai = BAI) {
    api.lay.mockResolvedValue(bai);
    render(<BaiHatScreen active />);
    fireEvent.click(await screen.findByRole('button', { name: /Let It Be.*The Beatles/ }));
    await screen.findByRole('tablist', { name: 'Chế độ' });
}

beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    Object.assign(may, { t: 0, dangPhat: false });
    [may.phat, may.dung, may.tua].forEach((f) => f.mockClear());
    Object.values(api).forEach((f) => f.mockReset());
    api.danhSach.mockResolvedValue([{ ...BAI, cau: undefined }]);
    api.capNhat.mockImplementation(async (id, body) => ({ bai: { ...BAI, ...body } }));
    luu.luuVaoTuRieng.mockReset().mockResolvedValue({ success: true });
    Element.prototype.scrollTo = vi.fn();
});
afterEach(() => vi.useRealTimers());

describe('xem lời kiểu karaoke', () => {
    test('màu chạy qua từng chữ của dòng đang hát; dòng đã qua tô kín, dòng chưa tới để trống', async () => {
        await moBai();
        await toiGiay(10.5);
        const dong0 = document.querySelector('[data-dong="0"]');
        const chu = [...dong0.querySelectorAll('.bh-chu')];
        expect(dong0.className).toContain('is-hien');
        // Chữ đầu đang tô dở, chữ cuối chưa tô: tô theo chữ, không phải cả dòng một lúc.
        expect(Number(chu[0].style.getPropertyValue('--tien'))).toBe(1);
        expect(Number(chu[chu.length - 1].style.getPropertyValue('--tien'))).toBe(0);
        await toiGiay(17);
        expect(document.querySelector('[data-dong="0"]').className).toContain('is-qua');
        expect(document.querySelector('[data-dong="1"]').className).toContain('is-hien');
    });

    test('tua lùi: dòng sau bỏ màu đã tô', async () => {
        await moBai();
        await toiGiay(17);
        await toiGiay(10.2);
        const dong1 = document.querySelector('[data-dong="1"]');
        [...dong1.querySelectorAll('.bh-chu')].forEach((el) => expect(el.style.getPropertyValue('--tien')).toBe(''));
    });

    test('chỉnh lời muộn hơn: mốc dời theo, lưu độ lệch', async () => {
        await moBai();
        fireEvent.click(screen.getByRole('button', { name: 'Lời muộn hơn' }));
        fireEvent.click(screen.getByRole('button', { name: 'Lời muộn hơn' }));
        expect(screen.getByText('+1.0s')).toBeTruthy();
        await toiGiay(10.5); // lời giờ bắt đầu ở 11s
        expect(document.querySelector('[data-dong="0"]').className).not.toContain('is-hien');
        await act(async () => { vi.advanceTimersByTime(900); });
        expect(api.capNhat).toHaveBeenCalledWith('b1', { lech: 1 });
    });

    test('Khớp dòng này (phím K): lời đang muộn 2 giây, bấm lúc nghe dòng 2 bắt đầu thì từ dòng 2 khớp, lưu mốc', async () => {
        await moBai();
        await toiGiay(14.5); // đang ở dòng 1 (10–16s); thật ra dòng 2 bắt đầu ở 14s
        fireEvent.keyDown(window, { key: 'k' });
        expect(screen.getByText('Đã khớp từ dòng 2 trở đi.')).toBeTruthy();
        await toiGiay(14.6);
        expect(document.querySelector('[data-dong="1"]').className).toContain('is-hien');
        expect(screen.getByRole('button', { name: 'Nghe dòng 2' }).textContent).toContain('0:15');
        await act(async () => { vi.advanceTimersByTime(900); });
        expect(api.capNhat).toHaveBeenCalledWith('b1', { lechTu: [{ dong: 1, lech: -1.5 }] });
        // Gõ chữ trong ô nhập thì phím K không bị cướp.
        const o = document.createElement('input');
        document.body.appendChild(o);
        fireEvent.keyDown(o, { key: 'k' });
        expect(api.capNhat).toHaveBeenCalledTimes(1);
    });

    test('Lời sớm/muộn hơn chỉnh đúng đoạn đang nghe khi đã có chỗ khớp', async () => {
        await moBai({ ...BAI, lechTu: [{ dong: 1, lech: 2 }] });
        await toiGiay(19); // dòng 1 (đã dời 2s: 18–22s)
        expect(screen.getByText('+2.0s')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Lời muộn hơn' }));
        expect(screen.getByText('+2.5s')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Bỏ 1 chỗ khớp/ }));
        expect(screen.getByText('Đã bỏ các chỗ khớp.')).toBeTruthy();
    });

    test('bấm chữ: tra nghĩa, lưu vào Từ vựng riêng kho bài hát kèm dòng làm ví dụ', async () => {
        await moBai();
        fireEvent.click(screen.getByRole('button', { name: 'trouble' }));
        await act(async () => {});
        expect(screen.getByText('rắc rối')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Lưu vào Từ vựng riêng/ }));
        await act(async () => {});
        expect(luu.luuVaoTuRieng).toHaveBeenCalledWith({
            en: 'trouble', vn: 'rắc rối', lang: 'en', source: 'bai-hat-en', part: 'Let It Be', example: BAI.cau[0].text,
        });
        expect(screen.getByRole('button', { name: /Đã lưu/ })).toBeTruthy();
    });
});

describe('điền từ', () => {
    test('cuối dòng còn ô trống thì dừng nhạc chờ điền; điền đúng thì hát tiếp', async () => {
        await moBai();
        may.dangPhat = true;
        fireEvent.click(screen.getByRole('button', { name: 'Điền từ' }));
        fireEvent.click(screen.getByRole('button', { name: 'Dễ' })); // 1 ô mỗi dòng
        await toiGiay(12);
        expect(may.dung).not.toHaveBeenCalled();
        await toiGiay(15.9);
        expect(may.dung).toHaveBeenCalled();
        expect(screen.getByText(/Điền ô trống rồi nhấn Enter/)).toBeTruthy();

        const o = document.querySelector('[data-dong="0"] input');
        const chuDung = { size: Number(o.getAttribute('size')) };
        expect(chuDung.size).toBeGreaterThanOrEqual(5);
        // Điền sai: lắc ô, vẫn chờ.
        fireEvent.change(o, { target: { value: 'xxxxx' } });
        fireEvent.keyDown(o, { key: 'Enter' });
        expect(o.className).toContain('is-sai');
        expect(may.phat).not.toHaveBeenCalled();
        // Điền đúng (lấy đáp án từ chính lời bài): hát tiếp.
        const dapAn = ['myself', 'trouble'].find((w) => o.getAttribute('size') === String(w.length));
        fireEvent.change(o, { target: { value: dapAn.toUpperCase() } });
        fireEvent.keyDown(o, { key: 'Enter' });
        expect(may.phat).toHaveBeenCalled();
        expect(screen.getByText('Đúng 1/2 ô')).toBeTruthy();
    });

    test('bỏ qua: hiện đáp án và hát tiếp', async () => {
        await moBai();
        may.dangPhat = true; // trước lần vẽ lại kế tiếp, như khi trình phát báo đang phát
        fireEvent.click(screen.getByRole('button', { name: 'Điền từ' }));
        fireEvent.click(screen.getByRole('button', { name: 'Dễ' }));
        await toiGiay(15.9);
        fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua' }));
        expect(may.phat).toHaveBeenCalled();
        expect(document.querySelector('[data-dong="0"] input')).toBeNull();
        expect(document.querySelector('[data-dong="0"] .is-lo')).toBeTruthy();
    });
});

describe('bấm theo nhịp', () => {
    const CHUA_MOC = { ...BAI, coMoc: false, nguonLoi: 'tu-dan', cau: BAI.cau.map((c) => ({ ...c, batDau: null, ketThuc: null })) };

    test('bài chưa có nhịp: vào thẳng Bấm theo nhịp, Xem lời / Điền từ bị khoá', async () => {
        await moBai(CHUA_MOC);
        expect(screen.getByRole('button', { name: 'Xem lời' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Điền từ' })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Dòng tiếp \(0\/2\)/ })).toBeTruthy();
    });

    test('phím cách đặt mốc từng dòng (không cướp phím khi đang gõ); đủ thì lưu', async () => {
        await moBai(CHUA_MOC);
        fireEvent.click(screen.getByRole('button', { name: /Bắt đầu/ }));
        expect(may.tua).toHaveBeenCalledWith(0);
        may.t = 3.21;
        fireEvent.keyDown(window, { code: 'Space' });
        const o = document.createElement('input');
        document.body.appendChild(o);
        fireEvent.keyDown(o, { code: 'Space' });
        expect(screen.getByRole('button', { name: /Dòng tiếp \(1\/2\)/ })).toBeTruthy();
        may.t = 7.5;
        fireEvent.click(screen.getByRole('button', { name: /Dòng tiếp/ }));
        fireEvent.click(screen.getByRole('button', { name: /Lưu nhịp/ }));
        await act(async () => {});
        expect(api.capNhat).toHaveBeenCalledWith('b1', { moc: [3.21, 7.5] });
    });
});

describe('tìm bài hát', () => {
    test('tìm theo tên bài hoặc ca sĩ, không phân biệt dấu', async () => {
        api.danhSach.mockResolvedValue([
            { ...BAI, cau: undefined },
            { ...BAI, id: 'b2', tieuDe: 'Shape of You', ngheSi: 'Ed Sheeran', cau: undefined },
        ]);
        render(<BaiHatScreen active />);
        await screen.findByRole('button', { name: /Shape of You.*Ed Sheeran/ });
        fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm bài' }), { target: { value: 'sheeran' } });
        expect(screen.queryByRole('button', { name: /Let It Be.*The Beatles/ })).toBeNull();
        expect(screen.getByRole('button', { name: /Shape of You.*Ed Sheeran/ })).toBeTruthy();
        fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm bài' }), { target: { value: 'xyz' } });
        expect(screen.getByText('Không có bài nào khớp "xyz".')).toBeTruthy();
    });
});

describe('thêm bài', () => {
    test('tìm lời, chọn bản có nhịp thì mở học ngay', async () => {
        api.danhSach.mockResolvedValue([]);
        api.timLoi.mockResolvedValue({ ketQua: [{ id: 9, tenBai: 'Let It Be', ngheSi: 'The Beatles', album: 'Let It Be', thoiLuong: 243, coMoc: true }] });
        api.them.mockResolvedValue({ bai: BAI });
        render(<BaiHatScreen active />);
        fireEvent.click(await screen.findByRole('button', { name: /Thêm bài hát/ }));
        fireEvent.change(screen.getByPlaceholderText(/youtube\.com/), { target: { value: 'https://youtu.be/QDYfEBY9NM4' } });
        fireEvent.change(screen.getByPlaceholderText('Let It Be'), { target: { value: 'Let It Be' } });
        fireEvent.click(screen.getByRole('button', { name: /Tìm lời/ }));
        await act(async () => {});
        expect(api.timLoi).toHaveBeenCalledWith('Let It Be', '');
        expect(screen.getByText(/Có nhịp sẵn/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Chọn' }));
        await act(async () => {});
        expect(api.them).toHaveBeenCalledWith({ youtube: 'https://youtu.be/QDYfEBY9NM4', lrclibId: 9 });
        await waitFor(() => expect(screen.getByRole('tablist', { name: 'Chế độ' })).toBeTruthy());
    });
});
