/**
 * Bài nghe có script.
 *
 * Chỗ dễ hỏng: tô sáng lệch câu đang nói, bấm câu mà nghe sai chỗ hoặc phát tràn sang câu sau,
 * bấm từ không lưu được, quên ghi nguồn VOA.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { gioPhut, cauTai, tachTu, viTriCuon } from '@lib/baiNghe.js';

const api = vi.hoisted(() => ({ danhSach: vi.fn(), lay: vi.fn() }));
const fav = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@api/baiNghe.js', () => ({ BaiNgheAPI: api }));
vi.mock('@api/favorites.js', () => ({ FavoritesAPI: fav }));
vi.mock('@api/vocabulary.js', () => ({ getVocabLang: () => 'en' }));
vi.mock('@lib/dichNhanh.js', () => ({ dichSangViet: vi.fn(async (t) => (t === 'bank' ? 'ngân hàng' : `[vi] ${t}`)) }));
vi.mock('@game/GameContext.jsx', () => ({ useGame: () => ({ showScreen: vi.fn() }) }));
vi.mock('@components/auth/AuthContext.jsx', () => ({ useAuth: () => ({ isLoggedIn: true }) }));
vi.mock('@ui/Toaster.jsx', () => ({ Notification: { error: vi.fn(), success: vi.fn() } }));

import BaiNgheScreen from './BaiNgheScreen.jsx';

const CAU = [
    { batDau: 0, ketThuc: 3.1, text: 'Hello and welcome.' },
    { batDau: 3.1, ketThuc: 5.3, text: 'Today, Anna goes to the bank.' },
    { batDau: 6.4, ketThuc: 8.4, text: 'She needs to open an account.' },
];
const BAI = { id: 'b1', tieuDe: 'Lesson 1', capDo: 'de', thoiLuong: 62, soCau: 3, nguon: 'VOA Learning English', nguonUrl: 'https://learningenglish.voanews.com/a/1.html', mediaUrl: 'https://res.cloudinary.com/x/a.mp3', coHinh: false, cau: CAU };

let thoiGian = 0;
beforeEach(() => {
    thoiGian = 0;
    api.danhSach.mockReset().mockResolvedValue([{ id: 'b1', tieuDe: 'Lesson 1', capDo: 'de', thoiLuong: 62, soCau: 3 }, { id: 'b2', tieuDe: 'Lesson 9', capDo: 'kho', thoiLuong: 300, soCau: 40 }]);
    api.lay.mockReset().mockResolvedValue(BAI);
    fav.add.mockReset().mockResolvedValue({ success: true });
    // jsdom không phát được âm thanh: giả lập thời điểm phát.
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { configurable: true, get: () => thoiGian, set: (v) => { thoiGian = v; } });
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
});

async function moBai() {
    render(<BaiNgheScreen active />);
    fireEvent.click(await screen.findByRole('button', { name: /Lesson 1/ }));
    // Câu tiếng Anh tách thành từng nút từ, nên chờ nút nghe câu đầu thay vì tìm nguyên câu.
    return screen.findByRole('button', { name: 'Nghe câu 1' });
}

describe('hàm thuần', () => {
    test('giây → m:ss', () => {
        expect(gioPhut(62.4)).toBe('1:02');
        expect(gioPhut(0)).toBe('0:00');
    });
    test('câu đang phát: câu cuối cùng đã bắt đầu; khoảng lặng giữa hai câu vẫn giữ câu trước', () => {
        expect(cauTai(CAU, -1)).toBe(-1);
        expect(cauTai(CAU, 0)).toBe(0);
        expect(cauTai(CAU, 4)).toBe(1);
        expect(cauTai(CAU, 6)).toBe(1);
        expect(cauTai(CAU, 100)).toBe(2);
    });
    test('vị trí cuộn: câu đang nói ở 1/3 từ trên xuống của khung script', () => {
        expect(viTriCuon(900, 600)).toBe(700);
    });
    test('tách từ bấm được, giữ dấu câu để hiển thị', () => {
        const p = tachTu("Today, Anna's bank.");
        expect(p.map((x) => x.hien).join('')).toBe("Today, Anna's bank.");
        expect(p.filter((x) => x.tu).map((x) => x.tu)).toEqual(['Today', "Anna's", 'bank']);
    });
});

describe('thư viện kiểu YouTube', () => {
    test('bài video có ảnh bìa, bài âm thanh có ảnh nền thay thế; thời lượng ở góc ảnh', async () => {
        api.danhSach.mockResolvedValue([
            { id: 'v1', tieuDe: 'Video 1', capDo: 'de', thoiLuong: 62, soCau: 3, coHinh: true, anhBia: 'https://res.cloudinary.com/x/video/upload/so_2/bai-nghe/v1.jpg' },
            { id: 'a1', tieuDe: 'Audio 1', capDo: 'vua', thoiLuong: 300, soCau: 40, coHinh: false, anhBia: '' },
        ]);
        render(<BaiNgheScreen active />);
        const theVideo = await screen.findByRole('button', { name: /Video 1/ });
        expect(theVideo.querySelector('img').getAttribute('src')).toMatch(/v1\.jpg$/);
        expect(theVideo.querySelector('.bn-thoi-luong').textContent).toBe('1:02');
        expect(theVideo.textContent).toMatch(/Video · Dễ · 3 câu/);
        const theAudio = screen.getByRole('button', { name: /Audio 1/ });
        expect(theAudio.querySelector('img')).toBeNull();
        expect(theAudio.querySelector('.bn-anh-thay')).toBeTruthy();
        expect(theAudio.querySelector('.bn-thoi-luong').textContent).toBe('5:00');
    });
});

describe('màn nghe', () => {
    test('lọc theo cấp độ', async () => {
        render(<BaiNgheScreen active />);
        await screen.findByRole('button', { name: /Lesson 9/ });
        fireEvent.click(screen.getByRole('button', { name: 'Dễ' }));
        expect(screen.queryByRole('button', { name: /Lesson 9/ })).toBeNull();
    });

    test('script tô sáng theo thời điểm phát; có ghi nguồn VOA', async () => {
        await moBai();
        const audio = document.querySelector('audio');
        expect(audio.getAttribute('src')).toBe(BAI.mediaUrl);
        thoiGian = 4;
        fireEvent.timeUpdate(audio);
        expect(document.querySelector('[data-cau="1"]').className).toContain('is-hien');
        expect(screen.getByText(/Nguồn: VOA Learning English/)).toBeTruthy();
    });

    test('bài có hình phát bằng video, script vẫn chạy theo', async () => {
        api.lay.mockResolvedValue({ ...BAI, coHinh: true, mediaUrl: 'https://res.cloudinary.com/x/a.mp4' });
        await moBai();
        const video = document.querySelector('video');
        expect(video.getAttribute('src')).toBe('https://res.cloudinary.com/x/a.mp4');
        expect(document.querySelector('audio')).toBeNull();
        thoiGian = 7;
        fireEvent.timeUpdate(video);
        expect(document.querySelector('[data-cau="2"]').className).toContain('is-hien');
    });

    test('script tự cuộn trong khung của nó theo câu đang nói; người học tự cuộn thì để yên', async () => {
        await moBai();
        const khung = document.querySelector('.bn-script');
        khung.scrollTo = vi.fn();
        Object.defineProperty(khung, 'clientHeight', { configurable: true, value: 300 });
        Object.defineProperty(document.querySelector('[data-cau="2"]'), 'offsetTop', { configurable: true, value: 500 });
        thoiGian = 7;
        fireEvent.timeUpdate(document.querySelector('audio'));
        expect(khung.scrollTo).toHaveBeenLastCalledWith({ top: 400, behavior: 'smooth' });
        // Người học tự cuộn: không giật script về câu đang nói nữa.
        khung.scrollTo.mockClear();
        fireEvent.wheel(khung);
        thoiGian = 4;
        fireEvent.timeUpdate(document.querySelector('audio'));
        expect(khung.scrollTo).not.toHaveBeenCalled();
    });

    test('bài video dùng bố cục hai cột; nghĩa của từ hiện cạnh khung phát', async () => {
        api.lay.mockResolvedValue({ ...BAI, coHinh: true, mediaUrl: 'https://res.cloudinary.com/x/a.mp4' });
        await moBai();
        expect(document.querySelector('.bn-hoc').className).toContain('co-hinh');
        fireEvent.click(screen.getByRole('button', { name: 'bank.' }));
        await screen.findByText('ngân hàng');
        expect(document.querySelector('.bn-may .bn-tu-chon')).toBeTruthy();
    });

    test('bấm câu: tua tới đầu câu, phát, và dừng ở cuối câu đó', async () => {
        await moBai();
        fireEvent.click(screen.getByRole('button', { name: 'Nghe câu 3' }));
        expect(thoiGian).toBe(6.4);
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
        thoiGian = 8.5;
        fireEvent.timeUpdate(document.querySelector('audio'));
        expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    });

    test('bấm từ: tra nghĩa, lưu vào Yêu thích kèm câu ví dụ', async () => {
        await moBai();
        fireEvent.click(screen.getByRole('button', { name: 'bank.' }));
        expect(await screen.findByText('ngân hàng')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Lưu vào Yêu thích/ }));
        await waitFor(() => expect(fav.add).toHaveBeenCalledWith({ en: 'bank', vn: 'ngân hàng', example: 'Today, Anna goes to the bank.' }));
    });

    test('dịch câu và ẩn script để nghe trước', async () => {
        await moBai();
        fireEvent.click(screen.getAllByRole('button', { name: 'Dịch' })[0]);
        expect(await screen.findByText('[vi] Hello and welcome.')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Ẩn script/ }));
        expect(screen.queryByText('[vi] Hello and welcome.')).toBeNull();
        expect(screen.getByText(/Script đang ẩn/)).toBeTruthy();
    });
});
