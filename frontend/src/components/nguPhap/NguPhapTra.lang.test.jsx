/**
 * Chọn ngôn ngữ ở Công thức ngữ pháp.
 *
 * Chỗ dễ hỏng: tra và hỏi AI vẫn gửi tiếng Anh khi đang xem tiếng Trung, câu ví dụ tiếng Trung
 * đọc bằng giọng Anh, không hiện pinyin, hoặc mở tới một mục tiếng Anh mà màn vẫn kẹt ở tiếng Trung.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
    tim: vi.fn(), hoi: vi.fn(), thongKeTongHop: vi.fn(), moRong: vi.fn(), moTongHop: vi.fn(), lichSu: vi.fn(),
}));
const loa = vi.hoisted(() => ({ speakWord: vi.fn(), stopSpeaking: vi.fn() }));
vi.mock('@api/nguPhap.js', () => ({ NguPhapAPI: api }));
vi.mock('@api/vocabulary.js', () => ({ getVocabLang: () => 'zh' }));
vi.mock('@game/gameLogic.js', () => ({ GameLogic: loa }));
vi.mock('@components/auth/AuthContext.jsx', () => ({ useAuth: () => ({ isLoggedIn: true }) }));
vi.mock('@ui/Toaster.jsx', () => ({ Notification: { error: vi.fn(), info: vi.fn() } }));

import NguPhapTra from './NguPhapTra.jsx';

const MUC_ZH = {
    id: 'zh-le', nhom: 'zh-tro-tu', lang: 'zh', ten: 'Trợ từ 了',
    congThuc: [{ nhan: 'Hoàn thành', ct: 'V + 了' }], dung: ['Đã xong.'],
    vd: [{ en: '我买了三本书。', py: 'Wǒ mǎile sān běn shū.', vi: 'Tôi đã mua ba quyển sách.' }],
};
const MUC_EN = {
    id: 'bi-dong', nhom: 'cau-truc', lang: 'en', ten: 'Câu bị động',
    congThuc: [{ nhan: 'Chung', ct: 'S + be + V3' }], dung: ['Bị tác động.'],
    vd: [{ en: 'The cake was eaten.', vi: 'Bánh đã bị ăn.' }],
};
const traVe = (lang) => ({
    lang,
    nhom: [{ key: lang === 'zh' ? 'zh-tro-tu' : 'cau-truc', ten: lang === 'zh' ? 'Trợ từ & thể' : 'Cấu trúc' }],
    muc: [lang === 'zh' ? MUC_ZH : MUC_EN],
    conLuot: 10,
});

beforeEach(() => {
    localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn(); // jsdom không có
    api.tim.mockReset().mockImplementation(async (q, lang) => traVe(lang));
    api.hoi.mockReset().mockResolvedValue({ ketQua: 'khong-phai', conLuot: 9 });
    api.thongKeTongHop.mockReset().mockResolvedValue({ soCau: 0, soChuDiem: 0, tongChuDiem: 30, duMo: false });
    loa.speakWord.mockClear();
});

describe('ngôn ngữ', () => {
    test('học từ vựng tiếng Trung thì mở sẵn tiếng Trung; ví dụ có pinyin, đọc giọng Trung', async () => {
        render(<NguPhapTra active />);
        await waitFor(() => expect(api.tim).toHaveBeenCalledWith('', 'zh'));
        fireEvent.click(await screen.findByRole('button', { name: /Trợ từ 了/ }));
        expect(screen.getByText('Wǒ mǎile sān běn shū.')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Nghe: 我买了三本书。' }));
        expect(loa.speakWord).toHaveBeenCalledWith('我买了三本书。', 'zh-CN');
    });

    test('đổi sang tiếng Anh: tra lại theo tiếng Anh, nhớ lựa chọn, đọc giọng Anh', async () => {
        render(<NguPhapTra active />);
        await screen.findByRole('button', { name: /Trợ từ 了/ });
        fireEvent.click(screen.getByRole('button', { name: 'Tiếng Anh' }));
        await waitFor(() => expect(api.tim).toHaveBeenLastCalledWith('', 'en'));
        expect(localStorage.getItem('levelup.nguPhap.lang')).toBe('en');
        fireEvent.click(await screen.findByRole('button', { name: /Câu bị động/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Nghe: The cake was eaten.' }));
        expect(loa.speakWord).toHaveBeenCalledWith('The cake was eaten.', 'en-US');
    });

    test('hỏi AI gửi kèm ngôn ngữ; một chữ Hán là đủ để hỏi', async () => {
        api.tim.mockImplementation(async (q, lang) => ({ ...traVe(lang), muc: [] }));
        render(<NguPhapTra active />);
        fireEvent.change(screen.getByLabelText('Tìm công thức ngữ pháp'), { target: { value: '把' } });
        fireEvent.click(await screen.findByRole('button', { name: /Tra bằng AI/ }));
        await waitFor(() => expect(api.hoi).toHaveBeenCalledWith('把', 'zh'));
        expect(await screen.findByText(/ngữ pháp tiếng Trung/)).toBeTruthy();
    });

    test('mở tới một mục tiếng Anh từ chỗ khác thì chuyển về tiếng Anh', async () => {
        render(<NguPhapTra active dich={{ lan: 1, id: 'bi-dong' }} />);
        await waitFor(() => expect(api.tim).toHaveBeenLastCalledWith('', 'en'));
    });
});

describe('kiểm tra tổng hợp trên màn chính', () => {
    test('chưa đủ câu: chưa cho bắt đầu; Mở rộng nhờ AI soạn thêm rồi cho bắt đầu, đúng ngôn ngữ', async () => {
        api.moRong.mockResolvedValue({ mucId: 'zh-le', tenMuc: 'Trợ từ 了', them: 10, conLuot: 9, nganHang: { soCau: 10, soChuDiem: 1, tongChuDiem: 30, duMo: true } });
        api.moTongHop.mockResolvedValue({ id: 'b1', cau: [{ loai: 'dich', vi: 'Tôi đã ăn.' }] });
        render(<NguPhapTra active />);
        expect(await screen.findByText(/Ngân hàng: 0 câu · 0\/30 chủ điểm/)).toBeTruthy();
        expect(screen.getByRole('button', { name: /Bắt đầu kiểm tra/ })).toBeDisabled();
        await waitFor(() => expect(screen.getByRole('button', { name: /Mở rộng ngân hàng câu/ })).not.toBeDisabled());
        fireEvent.click(screen.getByRole('button', { name: /Mở rộng ngân hàng câu/ }));
        expect(await screen.findByText(/Đã thêm 10 câu cho chủ điểm "Trợ từ 了"/)).toBeTruthy();
        expect(api.moRong).toHaveBeenCalledWith('zh');
        fireEvent.click(screen.getByRole('button', { name: /Bắt đầu kiểm tra/ }));
        expect(await screen.findByText('Tôi đã ăn.')).toBeTruthy();
        expect(api.moTongHop).toHaveBeenCalledWith('zh');
    });

    test('nút Lịch sử mở danh sách câu đã làm của ngôn ngữ đang chọn', async () => {
        api.lichSu.mockResolvedValue({ ds: [], conNua: false });
        render(<NguPhapTra active />);
        fireEvent.click(await screen.findByRole('button', { name: /Lịch sử/ }));
        expect(await screen.findByText(/Chưa có câu nào/)).toBeTruthy();
        expect(api.lichSu).toHaveBeenCalledWith('zh', { truoc: '', chiSai: false });
    });
});
