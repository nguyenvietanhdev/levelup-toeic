import { Http } from './http.js';

/** Hồ sơ người học: mục tiêu, trình độ theo kỹ năng, test đầu vào. */
function unwrap(res) {
    if (res && res.success === false) {
        throw new Error(res.error || res.message || 'Không thực hiện được');
    }
    // HAI lớp `.data` như mọi API khác: Http bọc { success, data: <phản hồi server> }.
    const inner = res?.data;
    if (inner && typeof inner === 'object' && 'success' in inner) {
        if (inner.success === false) throw new Error(inner.message || 'Không thực hiện được');
        return inner.data ?? null;
    }
    return inner ?? res;
}

export const HoSoHocAPI = {
    /** `{ mucTieu, testNgay, kyNang: [...], trinhDo: { diem, nhan }, chanDoan: [...], lichSuTest: [...] }` */
    async get() {
        return unwrap(await Http.get('/ho-so-hoc'));
    },

    /** `diemMucTieu` chỉ dùng với TOEIC. */
    async datMucTieu(mucTieu, diemMucTieu) {
        return unwrap(await Http.put('/ho-so-hoc/muc-tieu', { mucTieu, diemMucTieu }));
    },

    /** Mở test: `{ id, cau }`. Không có micro thì câu nói đổi thành câu gõ. */
    async moTest(coMic) {
        return unwrap(await Http.post('/ho-so-hoc/kiem-tra', { coMic: coMic === true }));
    },

    /** `{ xong: false, cau }` hoặc khi hết bài `{ xong: true, hoSo, canXem }`. */
    async traLoi(id, body) {
        return unwrap(await Http.post(`/ho-so-hoc/kiem-tra/${encodeURIComponent(id)}/tra-loi`, body));
    },
};
