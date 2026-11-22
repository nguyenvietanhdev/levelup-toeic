/**
 * Dịch đoạn văn hai chiều: Việt → Anh (luyện viết) và Anh → Việt (luyện đọc hiểu).
 *
 * Chỗ dễ hỏng: chọn chiều ngược mà vẫn xin đề / chấm chiều xuôi; hiện tiêu chí viết (ngữ pháp,
 * tự nhiên như người bản ngữ) cho bài tiếng Việt; đếm từ sai đơn vị; cụm hiểu sai lưu nhầm kho;
 * chiều ngược vẫn hiện "Nộp lại bản sửa" vốn dành cho lỗi viết; quên chiều đã chọn.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ passage: vi.fn(), grade: vi.fn(), xemLai: vi.fn() }));
const luu = vi.hoisted(() => ({ luuVaoTuRieng: vi.fn() }));
vi.mock('@api/translation.js', () => ({ TranslationAPI: api }));
vi.mock('@lib/luuMauCau.js', () => luu);
vi.mock('@game/GameContext.jsx', () => ({ useGame: () => ({ showScreen: vi.fn(), syncFromState: vi.fn() }) }));
vi.mock('@game/state.js', () => ({ GameState: { state: { settings: { vocabLang: 'en' } }, setEnergy: vi.fn(), creditServerRewards: vi.fn() } }));
vi.mock('@game/energy.js', () => ({ Energy: { showRefillModal: vi.fn() } }));
vi.mock('@game/gameLogic.js', () => ({ GameLogic: { speakWord: vi.fn(), stopSpeaking: vi.fn() } }));
vi.mock('@ui/Toaster.jsx', () => ({ Notification: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));
vi.mock('./MistakeLog.jsx', () => ({ default: () => null }));
vi.mock('../history/LichSuMode.jsx', () => ({ default: () => null }));
vi.mock('../ai/ChonDangBai.jsx', () => ({ default: () => null, useGoiYDang: () => null, dangGui: () => ({}) }));
vi.mock('../ai/KieuChamDoKho.jsx', () => ({ default: ({ kieuList }) => <div>Kiểu chấm: {kieuList[0].label}</div> }));
vi.mock('../ai/NutBatDau.jsx', () => ({ default: ({ onClick, children }) => <button type="button" onClick={onClick}>{children}</button> }));
vi.mock('../ai/BaiNhap.jsx', () => ({ useBaiNhap: () => ({ nhap: null, daDung: vi.fn(), boQua: vi.fn() }), TheBaiDo: () => null }));
vi.mock('../ai/NhamDiemYeu.jsx', () => ({ useNhamYeu: () => [false, vi.fn()], NutNhamYeu: () => <div>Nhắm lỗi hay mắc</div>, NhanNham: () => null }));
vi.mock('../ai/aiExitGuard.js', () => ({ useHoiKhiThoat: () => {} }));
vi.mock('../chuaBai/XemLaiBai.jsx', () => ({ default: () => <div>Nộp lại bản sửa</div> }));

import TranslationScreen from './TranslationScreen.jsx';

const DOAN = 'We ran out of milk this morning. My brother had to go to the shop.';
const BAN_DICH = 'Sáng nay nhà mình chạy ra khỏi sữa. Anh trai mình phải đi ra cửa hàng trước giờ làm việc nhé.';

beforeEach(() => {
    localStorage.clear();
    Object.values(api).forEach((f) => f.mockReset());
    luu.luuVaoTuRieng.mockReset().mockResolvedValue({ success: true });
    api.passage.mockImplementation(async ({ chieu }) => ({ chieu, passage: DOAN, topic: 'Hết sữa', level: 'medium', lang: 'en', minUnits: 15, words: [] }));
    api.grade.mockResolvedValue({
        id: 't1', chieu: 'ngoai-vi', overall: 6.5,
        scores: { comprehension: 6, completeness: 8, expression: 7 },
        notes: [{ quote: 'chạy ra khỏi sữa', issue: 'Hiểu sai cụm động từ', better: 'hết sữa', loai: 'hieu-sai', muc: 'loi' }],
        hieuSai: [{ cum: 'ran out of', nghia: 'hết, dùng hết', cau: 'We ran out of milk this morning.' }],
        reference: 'Sáng nay nhà mình hết sữa.', summary: 'Hiểu khá.', reward: { xp: 10, coins: 5 },
    });
});

async function lamBaiNguoc() {
    render(<TranslationScreen active />);
    fireEvent.click(screen.getByRole('button', { name: 'Anh → Việt' }));
    fireEvent.click(screen.getByRole('button', { name: /Lấy đoạn văn/ }));
    await screen.findByText(DOAN);
    fireEvent.change(screen.getByRole('textbox', { name: 'Bản dịch của bạn' }), { target: { value: BAN_DICH } });
    fireEvent.click(screen.getByRole('button', { name: /Chấm bản dịch/ }));
    await screen.findByText('Hiểu đúng nghĩa');
}

describe('chọn chiều dịch', () => {
    test('mặc định Việt → Anh như cũ; chọn Anh → Việt thì đổi lời giới thiệu, kiểu chấm, tắt "nhắm lỗi"; nhớ lựa chọn', () => {
        const { unmount } = render(<TranslationScreen active />);
        expect(screen.getByRole('button', { name: 'Việt → Anh' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByText('Kiểu chấm: Dịch')).toBeTruthy();
        expect(screen.getByText('Nhắm lỗi hay mắc')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Anh → Việt' }));
        expect(screen.getByText('Kiểu chấm: Đọc hiểu')).toBeTruthy();
        expect(screen.queryByText('Nhắm lỗi hay mắc')).toBeNull();
        expect(screen.getByText(/hiểu đúng nghĩa/)).toBeTruthy();
        unmount();
        render(<TranslationScreen active />);
        expect(screen.getByRole('button', { name: 'Anh → Việt' }).getAttribute('aria-pressed')).toBe('true');
    });
});

describe('làm bài chiều Anh → Việt', () => {
    test('xin đề và chấm đúng chiều; ba tiêu chí đọc hiểu; không có "Nộp lại bản sửa"', async () => {
        await lamBaiNguoc();
        expect(api.passage).toHaveBeenCalledWith(expect.objectContaining({ chieu: 'ngoai-vi' }));
        expect(api.grade).toHaveBeenCalledWith(expect.objectContaining({ chieu: 'ngoai-vi', passage: DOAN, translation: BAN_DICH }));
        for (const t of ['Hiểu đúng nghĩa', 'Đủ ý, không bỏ sót', 'Diễn đạt tiếng Việt']) expect(screen.getByText(t)).toBeTruthy();
        expect(screen.queryByText('Ngữ pháp & chính tả')).toBeNull();
        expect(screen.queryByText('Nộp lại bản sửa')).toBeNull();
        expect(screen.getByText('Chỗ hiểu chưa đúng')).toBeTruthy();
    });

    test('đếm từ tiếng Việt cho bản dịch', async () => {
        render(<TranslationScreen active />);
        fireEvent.click(screen.getByRole('button', { name: 'Anh → Việt' }));
        fireEvent.click(screen.getByRole('button', { name: /Lấy đoạn văn/ }));
        await screen.findByText(DOAN);
        fireEvent.change(screen.getByRole('textbox', { name: 'Bản dịch của bạn' }), { target: { value: 'một hai ba' } });
        expect(screen.getByText('3 / 15 từ')).toBeTruthy();
    });

    test('cụm hiểu sai: lưu vào Từ vựng riêng kho dich-nguoc-en, kèm nghĩa đúng và câu gốc', async () => {
        await lamBaiNguoc();
        expect(screen.getByText('ran out of')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /^Lưu$/ }));
        await waitFor(() => expect(luu.luuVaoTuRieng).toHaveBeenCalledWith({
            en: 'ran out of', vn: 'hết, dùng hết', lang: 'en', source: 'dich-nguoc-en', part: 'Hết sữa', example: 'We ran out of milk this morning.',
        }));
        expect(await screen.findByRole('button', { name: /Đã lưu/ })).toBeTruthy();
    });
});
