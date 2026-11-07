/**
 * Bấm thật qua một lượt luyện: chọn → sửa → dịch → kết quả.
 *
 * Chỗ dễ hỏng: câu sửa không điền sẵn câu sai, nút "Câu tiếp" đưa nhầm câu, lỗi mạng làm kẹt
 * giữa lượt, hoặc không tải lại danh sách nên nhãn "đến hạn ôn" đứng im sau khi luyện xong.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ moLuyen: vi.fn(), traLoiLuyen: vi.fn(), baoSaiCau: vi.fn() }));
vi.mock('@api/nguPhap.js', () => ({ NguPhapAPI: api }));
vi.mock('@game/gameLogic.js', () => ({ GameLogic: { speakWord: vi.fn(), stopSpeaking: vi.fn() } }));

import LuyenNguPhap from './LuyenNguPhap.jsx';

const BUOI = {
    id: 'b1',
    cau: [
        { loai: 'chon', de: 'She ___ me.', lua: ['told', 'said', 'talk', 'spoke'] },
        { loai: 'sua', sai: 'She said me to go.', vi: 'Cô ấy bảo tôi đi.' },
        { loai: 'dich', vi: 'Anh ấy bảo tôi đợi.' },
    ],
};
const DUNG = { dung: true, khongChac: false, dapAn: 'Đáp án mẫu', giaiThich: 'Giải thích mẫu', ghiChu: '' };
const MUC = { id: 'tell-say-talk', ten: 'Tell, say, talk' };

function moLuot(props = {}) {
    const onThoat = vi.fn();
    const onXong = vi.fn();
    render(
        <LuyenNguPhap muc={MUC} onThoat={onThoat} onXong={onXong} {...props}>
            <p>Nội dung công thức</p>
        </LuyenNguPhap>,
    );
    return { onThoat, onXong };
}
const sangCau = () => fireEvent.click(screen.getByRole('button', { name: /Câu tiếp|Xem kết quả/ }));

beforeEach(() => {
    api.moLuyen.mockReset().mockResolvedValue(BUOI);
    api.traLoiLuyen.mockReset().mockResolvedValue(DUNG);
    api.baoSaiCau.mockReset().mockResolvedValue({ daBao: true });
});

describe('một lượt', () => {
    test('đi hết ba dạng câu rồi ra kết quả, báo để tải lại danh sách', async () => {
        api.traLoiLuyen
            .mockResolvedValueOnce(DUNG)
            .mockResolvedValueOnce(DUNG)
            .mockResolvedValueOnce({ ...DUNG, tongKet: { soDung: 3, tong: 3, dat: true, denHan: '2026-11-10T00:00:00Z' } });
        const { onXong } = moLuot();

        fireEvent.click(await screen.findByRole('button', { name: 'told' }));
        await screen.findByText('Giải thích mẫu');
        expect(api.traLoiLuyen).toHaveBeenLastCalledWith('b1', 0, 'told');
        sangCau();

        // Câu sửa điền sẵn câu sai để chỉ phải sửa đúng chỗ.
        const oSua = await screen.findByRole('textbox', { name: 'Sửa câu sai' });
        expect(oSua.value).toBe('She said me to go.');
        fireEvent.change(oSua, { target: { value: 'She told me to go.' } });
        fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));
        await screen.findByText('Giải thích mẫu');
        expect(api.traLoiLuyen).toHaveBeenLastCalledWith('b1', 1, 'She told me to go.');
        sangCau();

        const oDich = await screen.findByRole('textbox', { name: 'Dịch sang tiếng Anh' });
        expect(oDich.value).toBe('');
        fireEvent.change(oDich, { target: { value: 'He told me to wait.' } });
        fireEvent.submit(oDich.closest('form'));
        await screen.findByRole('button', { name: 'Xem kết quả' });
        expect(onXong).toHaveBeenCalledTimes(1);
        sangCau();

        expect(await screen.findByText('3/3')).toBeInTheDocument();
        expect(screen.getByText('Đạt')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Luyện lượt nữa' })).toBeInTheDocument();
    });

    test('làm sai: thấy đáp án, câu của mình, và mở được công thức', async () => {
        api.traLoiLuyen.mockResolvedValueOnce({ ...DUNG, dung: false });
        moLuot();
        fireEvent.click(await screen.findByRole('button', { name: 'said' }));
        await screen.findByText('Đáp án mẫu');
        expect(screen.getByText('Bạn: said')).toBeInTheDocument();
        expect(screen.queryByText('Nội dung công thức')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Xem công thức/ }));
        expect(screen.getByText('Nội dung công thức')).toBeInTheDocument();
    });

    test('làm đúng: không hiện nút công thức, không hiện câu của mình', async () => {
        moLuot();
        fireEvent.click(await screen.findByRole('button', { name: 'told' }));
        await screen.findByText('Đúng rồi');
        expect(screen.queryByRole('button', { name: /Xem công thức/ })).toBeNull();
        expect(screen.queryByText(/^Bạn:/)).toBeNull();
    });

    test('"Chưa biết" gửi câu trả lời rỗng', async () => {
        api.moLuyen.mockResolvedValue({ id: 'b1', cau: [BUOI.cau[2]] });
        moLuot();
        fireEvent.click(await screen.findByRole('button', { name: 'Chưa biết' }));
        await waitFor(() => expect(api.traLoiLuyen).toHaveBeenCalledWith('b1', 0, ''));
    });
});

describe('báo câu sai', () => {
    const traLoiCauDau = async () => {
        moLuot();
        fireEvent.click(await screen.findByRole('button', { name: 'told' }));
        await screen.findByText('Giải thích mẫu');
    };

    test('chưa trả lời thì chưa có nút báo', async () => {
        moLuot();
        await screen.findByRole('button', { name: 'told' });
        expect(screen.queryByRole('button', { name: /Câu này sai/ })).toBeNull();
    });
    test('báo xong: gửi đúng câu, cảm ơn, nút biến mất', async () => {
        await traLoiCauDau();
        fireEvent.click(screen.getByRole('button', { name: /Câu này sai/ }));
        await screen.findByText(/đã được ẩn và không tính điểm/);
        expect(api.baoSaiCau).toHaveBeenCalledWith('b1', 0);
        expect(screen.queryByRole('button', { name: /Câu này sai/ })).toBeNull();
    });
    test('lỗi khi báo (quá trần): hiện lý do, vẫn đi tiếp được', async () => {
        api.baoSaiCau.mockRejectedValueOnce(new Error('Đã báo đủ số lần'));
        await traLoiCauDau();
        fireEvent.click(screen.getByRole('button', { name: /Câu này sai/ }));
        await screen.findByText(/Đã báo đủ số lần/);
        sangCau();
        expect(await screen.findByRole('textbox', { name: 'Sửa câu sai' })).toBeInTheDocument();
    });
    test('sang câu mới: nút báo trở lại, không mang trạng thái câu trước', async () => {
        await traLoiCauDau();
        fireEvent.click(screen.getByRole('button', { name: /Câu này sai/ }));
        await screen.findByText(/đã được ẩn/);
        sangCau();
        fireEvent.click(await screen.findByRole('button', { name: 'Chưa biết' }));
        expect(await screen.findByRole('button', { name: /Câu này sai/ })).toBeInTheDocument();
    });
});

describe('khi có lỗi', () => {
    test('lỗi mạng giữa lượt: không kẹt, sang được câu tiếp', async () => {
        api.traLoiLuyen.mockRejectedValueOnce(new Error('Mất mạng'));
        moLuot();
        fireEvent.click(await screen.findByRole('button', { name: 'told' }));
        await screen.findByText('Chưa chấm được — câu này không tính');
        sangCau();
        expect(await screen.findByRole('textbox', { name: 'Sửa câu sai' })).toBeInTheDocument();
    });

    test('không mở được lượt (hết lượt AI): báo rõ, thử lại được', async () => {
        api.moLuyen.mockRejectedValueOnce(new Error('Đã dùng hết lượt AI'));
        moLuot();
        await screen.findByText('Đã dùng hết lượt AI');
        fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
        expect(await screen.findByRole('button', { name: 'told' })).toBeInTheDocument();
    });

    test('nút về danh sách luôn có', async () => {
        const { onThoat } = moLuot();
        fireEvent.click(await screen.findByRole('button', { name: /Về danh sách/ }));
        expect(onThoat).toHaveBeenCalled();
    });
});
