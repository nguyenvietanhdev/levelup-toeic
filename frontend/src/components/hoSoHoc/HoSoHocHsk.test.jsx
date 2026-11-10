/**
 * Mục tiêu HSK: nền tảng câu tiếng Trung và test đầu vào tiếng Trung.
 *
 * Chỗ dễ hỏng: bấm test ở mục tiêu HSK lại đổi mục tiêu sang Giao tiếp và mở test tiếng Anh,
 * câu nghe đọc chữ Hán bằng giọng Anh, micro nghe tiếng Anh, hoặc kết quả không hiện pinyin.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ get: vi.fn(), datMucTieu: vi.fn(), moTest: vi.fn(), traLoi: vi.fn() }));
const loa = vi.hoisted(() => ({ speakWord: vi.fn(), stopSpeaking: vi.fn() }));
const ghiLang = vi.hoisted(() => ({ ds: [] }));
vi.mock('@api/hoSoHoc.js', () => ({ HoSoHocAPI: api }));
vi.mock('@api/vocabulary.js', () => ({ getVocabLang: () => 'zh' }));
vi.mock('@game/gameLogic.js', () => ({ GameLogic: loa }));
vi.mock('@game/GameContext.jsx', () => ({ useGame: () => ({ showScreen: vi.fn() }) }));
vi.mock('@components/auth/AuthContext.jsx', () => ({ useAuth: () => ({ isLoggedIn: true }) }));
vi.mock('@ui/Toaster.jsx', () => ({ Notification: { error: vi.fn(), info: vi.fn() } }));
vi.mock('../ai/aiExitGuard.js', () => ({ useHoiKhiThoat: () => {} }));
vi.mock('@lib/speechInput.js', () => ({ isSpeechSupported: () => true, speechLangFor: (l) => (l === 'zh' ? 'zh-CN' : 'en-US') }));
vi.mock('../conversation/useGhiAm.js', () => ({
    useGhiAm: (lang) => {
        ghiLang.ds.push(lang);
        return { trangThai: 'nghi', chu: '', loi: '', lamLai: () => {}, batDau: () => {}, dung: () => {}, xongGui: () => {} };
    },
}));
vi.mock('./PanelBang.jsx', () => ({ default: () => <div>Panel HSK</div> }));
vi.mock('./PanelToeic.jsx', () => ({ default: () => null }));

import HoSoHocScreen from './HoSoHocScreen.jsx';

const KY = (key, ten, extra = {}) => ({ key, ten, icon: 'fa-x', diem: 50, soLan: 0, duDuLieu: false, muc: 'chua-du', ...extra });
const NEN_TANG = (testNgay) => ({
    testNgay,
    kyNang: [KY('zh-trat-tu', 'Trật tự câu'), KY('zh-nghe', 'Nghe hiểu câu')],
    trinhDo: { diem: 0, nhan: 'Chưa đủ dữ liệu' },
    chanDoan: testNgay ? [{ kyNang: 'zh-luong-tu', ten: 'Lượng từ & số đếm', ma: 'chua-nam', nhan: 'Chưa nắm quy tắc', viec: 'Đọc thẻ quy tắc.' }] : [],
    soVoiTruoc: null,
});
const HO_SO = (testNgay = null) => ({ mucTieu: 'hsk', kyNang: [], chanDoan: [], bang: {}, nenTang: NEN_TANG(testNgay) });

beforeEach(() => {
    ghiLang.ds = [];
    loa.speakWord.mockClear();
    api.get.mockReset().mockResolvedValue(HO_SO());
    api.datMucTieu.mockReset();
    api.moTest.mockReset().mockResolvedValue({
        id: 't1', lang: 'zh',
        cau: { i: 0, tong: 15, loai: 'nghe', kyNang: 'zh-nghe', tenKyNang: 'Nghe hiểu câu', lang: 'zh', doc: '明天见。', hoi: 'Bạn vừa nghe câu nào?', lua: ['Hẹn gặp lại ngày mai.', 'Ngày mai tôi bận.'] },
    });
    api.traLoi.mockReset();
});

describe('mục tiêu HSK', () => {
    test('chưa test: mời làm test tiếng Trung; bấm thì mở test zh, KHÔNG đổi mục tiêu sang Giao tiếp', async () => {
        render(<HoSoHocScreen active />);
        expect(await screen.findByText('Nền tảng câu tiếng Trung')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Bắt đầu test/ }));
        await waitFor(() => expect(api.moTest).toHaveBeenCalledWith(true, 'zh'));
        expect(api.datMucTieu).not.toHaveBeenCalled();
        // Câu nghe đọc chữ Hán bằng giọng Trung; micro nghe tiếng Trung.
        await waitFor(() => expect(loa.speakWord).toHaveBeenCalledWith('明天见。', 'zh-CN'));
        expect(ghiLang.ds.at(-1)).toBe('zh-CN');
    });

    test('câu gõ nhắc gõ chữ Hán', async () => {
        api.moTest.mockResolvedValue({ id: 't1', lang: 'zh', cau: { i: 0, tong: 15, loai: 'go', kyNang: 'zh-trat-tu', tenKyNang: 'Trật tự câu', lang: 'zh', vi: 'Tôi làm việc ở ngân hàng.' } });
        render(<HoSoHocScreen active />);
        fireEvent.click(await screen.findByRole('button', { name: /Bắt đầu test/ }));
        expect(await screen.findByPlaceholderText('Gõ câu tiếng Trung (chữ Hán)…')).toBeTruthy();
    });

    test('làm xong: hiện chẩn đoán tiếng Trung và câu cần xem lại kèm pinyin', async () => {
        api.moTest.mockResolvedValue({ id: 't1', lang: 'zh', cau: { i: 14, tong: 15, loai: 'trac-nghiem', kyNang: 'zh-luong-tu', tenKyNang: 'Lượng từ', lang: 'zh', hoi: 'Điền lượng từ', lua: ['本', '个'] } });
        api.traLoi.mockResolvedValue({
            xong: true,
            hoSo: HO_SO(new Date().toISOString()),
            canXem: [{ de: 'Ngày mai tôi học ở nhà.', dapAn: '我明天在家学习。', pinyin: 'Wǒ míngtiān zài jiā xuéxí.', cuaBan: '我学习在家明天', daNoi: false }],
        });
        render(<HoSoHocScreen active />);
        fireEvent.click(await screen.findByRole('button', { name: /Bắt đầu test/ }));
        // Ba bước chờ nối tiếp: nới thời gian chờ để không báo hỏng oan khi cả bộ test chạy cùng lúc.
        fireEvent.click(await screen.findByRole('button', { name: '个' }, { timeout: 3000 }));
        expect(await screen.findByText('Wǒ míngtiān zài jiā xuéxí.', {}, { timeout: 3000 })).toBeTruthy();
        expect(screen.getByText(/Chưa nắm quy tắc/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Luyện khung này' })).toBeTruthy();
    });
});
