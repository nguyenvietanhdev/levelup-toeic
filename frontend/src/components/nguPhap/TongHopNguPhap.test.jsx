/**
 * Nghe cả câu, lưu mẫu câu vào Từ vựng riêng, kiểm tra tổng hợp, mở rộng ngân hàng, lịch sử.
 *
 * Chỗ dễ hỏng: nút nghe chỉ đọc mỗi từ đáp án ("went") thay vì cả câu; câu chữ Hán lưu vào kho
 * mà không ghi ngôn ngữ (đọc giọng Anh) hoặc lẫn vào kho từ đơn; kiểm tra tổng hợp lộ tên chủ
 * điểm trước khi trả lời, hiện nút "Xem công thức" không có gì để xem; lịch sử không tải trang sau.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
    moLuyen: vi.fn(), moTongHop: vi.fn(), traLoiLuyen: vi.fn(), baoSaiCau: vi.fn(), moRong: vi.fn(), lichSu: vi.fn(),
}));
const loa = vi.hoisted(() => ({ speakWord: vi.fn(), stopSpeaking: vi.fn() }));
const kho = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@api/nguPhap.js', () => ({ NguPhapAPI: api }));
vi.mock('@game/gameLogic.js', () => ({ GameLogic: loa }));
vi.mock('@api/uploadVocab.js', () => ({ UploadVocabAPI: kho }));

import LuyenNguPhap from './LuyenNguPhap.jsx';
import LichSuNguPhap from './LichSuNguPhap.jsx';

const BUOI = { id: 'b1', cau: [{ loai: 'chon', de: 'She ___ home.', lua: ['went', 'go', 'gone', 'going'] }] };
const KQ = { dung: true, khongChac: false, dapAn: 'went', cauDu: 'She went home.', nghia: '', giaiThich: 'Quá khứ.', ghiChu: '', mucId: 'qua-khu-don', tenMuc: 'Quá khứ đơn' };

beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset());
    loa.speakWord.mockClear();
    kho.create.mockReset().mockResolvedValue({ success: true });
    api.moLuyen.mockResolvedValue(BUOI);
    api.traLoiLuyen.mockResolvedValue(KQ);
});

describe('nghe cả câu và lưu mẫu câu', () => {
    test('trả lời xong: đọc cả câu (không chỉ từ đáp án), hiện câu đầy đủ kèm đáp án', async () => {
        render(<LuyenNguPhap muc={{ id: 'qua-khu-don', ten: 'Quá khứ đơn', lang: 'en' }} onThoat={vi.fn()}><p>CT</p></LuyenNguPhap>);
        fireEvent.click(await screen.findByRole('button', { name: 'went' }));
        await screen.findByText('She went home.');
        expect(loa.speakWord).toHaveBeenLastCalledWith('She went home.', 'en-US');
        expect(screen.getByText('went', { selector: 'strong' })).toBeTruthy();
        loa.speakWord.mockClear();
        fireEvent.click(screen.getByRole('button', { name: 'Nghe cả câu: She went home.' }));
        expect(loa.speakWord).toHaveBeenCalledWith('She went home.', 'en-US');
    });

    test('lưu mẫu câu: vào kho mau-cau theo ngôn ngữ, Part là tên chủ điểm, có ghi ngôn ngữ', async () => {
        api.traLoiLuyen.mockResolvedValue({ ...KQ, dapAn: '我买了三本书。', cauDu: '我买了三本书。', nghia: 'Tôi đã mua ba quyển sách.', tenMuc: 'Trợ từ 了' });
        render(<LuyenNguPhap muc={{ id: 'zh-le', ten: 'Trợ từ 了', lang: 'zh' }} onThoat={vi.fn()}><p>CT</p></LuyenNguPhap>);
        fireEvent.click(await screen.findByRole('button', { name: 'went' }));
        fireEvent.click(await screen.findByRole('button', { name: /Lưu mẫu câu/ }));
        await screen.findByRole('button', { name: /Đã lưu mẫu câu/ });
        expect(kho.create).toHaveBeenCalledWith(expect.objectContaining({
            en: '我买了三本书。', vn: 'Tôi đã mua ba quyển sách.', lang: 'zh', source: 'mau-cau-zh', part: 'Trợ từ 了',
        }));
        expect(loa.speakWord).toHaveBeenLastCalledWith('我买了三本书。', 'zh-CN');
    });

    test('lưu hỏng (vượt giới hạn): báo lý do, cho bấm lại', async () => {
        kho.create.mockResolvedValue({ success: false, message: 'Đã đạt giới hạn 500 từ vựng riêng.' });
        render(<LuyenNguPhap muc={{ id: 'qua-khu-don', ten: 'Quá khứ đơn', lang: 'en' }} onThoat={vi.fn()}><p>CT</p></LuyenNguPhap>);
        fireEvent.click(await screen.findByRole('button', { name: 'went' }));
        fireEvent.click(await screen.findByRole('button', { name: /Lưu mẫu câu/ }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/giới hạn/);
        expect(screen.getByRole('button', { name: /Lưu mẫu câu/ })).not.toBeDisabled();
    });
});

describe('kiểm tra tổng hợp', () => {
    const MUC_TH = { id: 'tong-hop:en', ten: 'Kiểm tra ngữ pháp tổng hợp', lang: 'en', tongHop: true };

    test('mở từ ngân hàng câu; tên chủ điểm chỉ hiện sau khi trả lời; không có nút xem công thức', async () => {
        api.moTongHop.mockResolvedValue(BUOI);
        api.traLoiLuyen.mockResolvedValue({ ...KQ, dung: false, cuaBan: 'go' });
        render(<LuyenNguPhap muc={MUC_TH} onThoat={vi.fn()}>{false}</LuyenNguPhap>);
        await screen.findByRole('button', { name: 'went' });
        expect(api.moTongHop).toHaveBeenCalledWith('en');
        expect(api.moLuyen).not.toHaveBeenCalled();
        expect(screen.queryByText(/Chủ điểm: Quá khứ đơn/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'go' }));
        expect(await screen.findByText(/Chủ điểm: Quá khứ đơn/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Xem công thức/ })).toBeNull();
    });

    test('tổng kết theo chủ điểm, chủ điểm yếu có nút Luyện riêng', async () => {
        api.moTongHop.mockResolvedValue(BUOI);
        api.traLoiLuyen.mockResolvedValue({
            ...KQ,
            tongKet: { soDung: 3, tong: 5, dat: false, theoMuc: [{ mucId: 'modal', ten: 'Động từ khuyết thiếu', dung: 0, tong: 2 }, { mucId: 'qua-khu-don', ten: 'Quá khứ đơn', dung: 3, tong: 3 }] },
        });
        const onLuyenMuc = vi.fn();
        render(<LuyenNguPhap muc={MUC_TH} onThoat={vi.fn()} onLuyenMuc={onLuyenMuc}>{false}</LuyenNguPhap>);
        fireEvent.click(await screen.findByRole('button', { name: 'went' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Xem kết quả' }));
        expect(await screen.findByText('Động từ khuyết thiếu')).toBeTruthy();
        const nutLuyen = screen.getAllByRole('button', { name: 'Luyện' });
        expect(nutLuyen).toHaveLength(1);
        fireEvent.click(nutLuyen[0]);
        expect(onLuyenMuc).toHaveBeenCalledWith('modal');
    });

    test('luyện một mục xong: "Thêm câu mới" nhờ AI soạn thêm cho đúng mục đó', async () => {
        api.traLoiLuyen.mockResolvedValue({ ...KQ, tongKet: { soDung: 1, tong: 1, dat: true, denHan: null } });
        api.moRong.mockResolvedValue({ them: 8, conLuot: 7 });
        render(<LuyenNguPhap muc={{ id: 'qua-khu-don', ten: 'Quá khứ đơn', lang: 'en' }} onThoat={vi.fn()}><p>CT</p></LuyenNguPhap>);
        fireEvent.click(await screen.findByRole('button', { name: 'went' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Xem kết quả' }));
        fireEvent.click(await screen.findByRole('button', { name: /Thêm câu mới/ }));
        expect(await screen.findByText(/Đã thêm 8 câu mới/)).toBeTruthy();
        expect(api.moRong).toHaveBeenCalledWith('en', 'qua-khu-don');
    });
});

describe('lịch sử', () => {
    const DONG = (n, extra = {}) => ({
        id: `x${n}`, lang: 'en', loai: 'chon', tenMuc: 'Quá khứ đơn', de: `She ___ home ${n}.`, cuaBan: 'go', dapAn: 'went',
        cauDu: `She went home ${n}.`, nghia: '', giaiThich: 'Quá khứ.', dung: false, khongChac: false, luc: `2026-11-1${n}T08:00:00Z`, ...extra,
    });

    test('hiện câu đã làm kèm câu trả lời và câu đúng; nghe lại; xem thêm; lọc câu sai', async () => {
        api.lichSu.mockResolvedValueOnce({ ds: [DONG(2), DONG(1, { dung: true })], conNua: true })
            .mockResolvedValueOnce({ ds: [DONG(0)], conNua: false })
            .mockResolvedValue({ ds: [], conNua: false });
        render(<LichSuNguPhap lang="en" onThoat={vi.fn()} />);
        expect(await screen.findByText('She went home 2.')).toBeTruthy();
        expect(screen.getAllByText('Bạn: go')).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Nghe cả câu: She went home 2.' }));
        expect(loa.speakWord).toHaveBeenCalledWith('She went home 2.', 'en-US');

        fireEvent.click(screen.getByRole('button', { name: 'Xem thêm' }));
        expect(await screen.findByText('She went home 0.')).toBeTruthy();
        expect(api.lichSu).toHaveBeenLastCalledWith('en', { truoc: '2026-11-11T08:00:00Z', chiSai: false });
        expect(screen.getByText('She went home 2.')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Chỉ câu sai' }));
        await waitFor(() => expect(api.lichSu).toHaveBeenLastCalledWith('en', { truoc: '', chiSai: true }));
        expect(await screen.findByText(/Chưa có câu nào làm sai/)).toBeTruthy();
    });
});
