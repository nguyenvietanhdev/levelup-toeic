/**
 * Nhớ vị trí cuộn của một danh sách qua các lần mở lại.
 *
 * Popup chọn đề có hàng chục nhóm; mỗi lần mở lại phải cuộn từ đầu xuống đúng
 * chỗ đang xem là việc lặp đi lặp lại mà máy làm được. Cùng vấn đề với popup
 * chọn Part.
 *
 * Dùng chung một module cho cả hai vì hai popup được dựng bằng hai cơ chế khác
 * hẳn nhau — `TopicModal` là React, `partSelector` dựng DOM thủ công — mà nhu
 * cầu thì y hệt. Viết riêng mỗi bên một bản là hai chỗ để lệch.
 *
 * Giữ trong BỘ NHỚ phiên, không `localStorage`: vị trí cuộn chỉ có nghĩa trong
 * một buổi dùng. Mở lại app hôm sau mà nhảy xuống giữa danh sách thì người dùng
 * tưởng mình bấm nhầm — và ghi `localStorage` cho mỗi lần cuộn là ghi đĩa liên
 * tục cho thứ vứt đi được.
 */

/** khoá → vị trí cuộn (px). Khoá do nơi gọi đặt, thường là "tên popup:tab". */
const _viTri = new Map();

/**
 * Chặn phình: mỗi tab của mỗi popup là một khoá, thực tế chỉ vài chục. Nhưng
 * khoá do nơi gọi tự đặt nên không có gì bảo đảm — chặn ở đây rẻ hơn là tin.
 */
const TOI_DA = 50;

/** Lưu vị trí hiện tại của một phần tử. */
export function luuCuon(khoa, el) {
    if (!khoa || !el) return;
    const top = Number(el.scrollTop) || 0;
    // KHÔNG lưu vị trí 0: đó là trạng thái mặc định, lưu nó chỉ chiếm chỗ. Và
    // quan trọng hơn — nếu người dùng cuộn lên đầu rồi đóng, lần sau mở ra ở
    // đầu là đúng ý họ, không cần khôi phục gì.
    if (top <= 0) {
        _viTri.delete(khoa);
        return;
    }
    if (_viTri.size >= TOI_DA && !_viTri.has(khoa)) {
        _viTri.delete(_viTri.keys().next().value);
    }
    _viTri.set(khoa, top);
}

/** Vị trí đã lưu, hoặc 0. */
export function docCuon(khoa) {
    return _viTri.get(khoa) || 0;
}

/** Quên vị trí — dùng khi danh sách đổi hẳn nội dung. */
export function quenCuon(khoa) {
    _viTri.delete(khoa);
}

/**
 * Khôi phục vị trí cuộn cho một phần tử.
 *
 * Hoãn qua HAI khung hình trước khi đặt `scrollTop`. Một khung là không đủ:
 * React đã dựng xong DOM nhưng trình duyệt chưa tính xong layout, nên
 * `scrollHeight` còn nhỏ hơn thật và `scrollTop` bị kẹp về giá trị nhỏ hơn —
 * danh sách nhảy về gần đầu thay vì đúng chỗ. Đây là cùng một bẫy đã gặp ở
 * `screenScroll.js` khi khôi phục vị trí trang chủ.
 *
 * @returns {() => void} hàm huỷ, gọi khi phần tử bị gỡ trước lúc khôi phục.
 */
export function khoiPhucCuon(khoa, el) {
    const top = docCuon(khoa);
    if (!el || top <= 0) return () => {};

    let huy = false;
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
        id2 = requestAnimationFrame(() => {
            if (huy || !el.isConnected) return;
            el.scrollTop = top;
        });
    });
    return () => {
        huy = true;
        cancelAnimationFrame(id1);
        cancelAnimationFrame(id2);
    };
}

/**
 * Gắn theo dõi cuộn vào một phần tử: tự lưu khi cuộn, tự khôi phục khi gắn.
 *
 * Trả về hàm gỡ — nơi gọi PHẢI gọi nó khi phần tử biến mất, nếu không listener
 * còn treo trên phần tử đã gỡ khỏi cây.
 *
 * `passive: true` vì handler không gọi `preventDefault`; thiếu nó thì trình
 * duyệt phải chờ handler chạy xong mới cuộn tiếp, và danh sách dài bị khựng.
 */
export function theoDoiCuon(khoa, el, chonSelector = '.selected') {
    if (!khoa || !el) return () => {};
    const onScroll = () => luuCuon(khoa, el);
    el.addEventListener('scroll', onScroll, { passive: true });
    const huyKhoiPhuc = cuonToiChonHoacNho(khoa, el, chonSelector);
    return () => {
        huyKhoiPhuc();
        el.removeEventListener('scroll', onScroll);
    };
}

/**
 * Cuộn tới MỤC ĐANG CHỌN nếu có, không thì về vị trí đã nhớ.
 *
 * Ưu tiên mục đang chọn vì nó tốt hơn hẳn: người dùng mở popup ra thường là để
 * xem mình đang ở đề nào, hoặc để đổi sang cái gần đó. Vị trí cuộn cũ chỉ là
 * xấp xỉ của điều đó — và sai hẳn nếu danh sách vừa đổi (lọc, tải lại, đổi tab).
 *
 * Vị trí đã nhớ vẫn giữ làm phương án hai: tab "Từ vựng chung" có thể chưa chọn
 * gì, mà người dùng vừa cuộn tới giữa danh sách để so sánh vài bộ.
 */
export function cuonToiChonHoacNho(khoa, el, chonSelector = '.selected') {
    if (!el) return () => {};

    let huy = false;
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
        id2 = requestAnimationFrame(() => {
            if (huy || !el.isConnected) return;

            const chon = chonSelector ? el.querySelector(chonSelector) : null;
            if (chon) {
                // `offsetTop` tương đối với phần tử định vị gần nhất, không phải
                // với `el` — trừ đi `el.offsetTop` để ra khoảng cách thật bên
                // trong vùng cuộn. Dùng thẳng là nhảy sai cả trăm px.
                const cach = chon.offsetTop - el.offsetTop;
                // Trừ 1/3 chiều cao khung: đặt mục đang chọn ở LƯNG CHỪNG chứ
                // không dính mép trên, để thấy được cả vài mục xung quanh nó —
                // người dùng thường mở popup ra để đổi sang cái gần đó.
                el.scrollTop = Math.max(0, cach - el.clientHeight / 3);
                return;
            }

            const top = docCuon(khoa);
            if (top > 0) el.scrollTop = top;
        });
    });
    return () => {
        huy = true;
        cancelAnimationFrame(id1);
        cancelAnimationFrame(id2);
    };
}

/** Xoá sạch — dùng cho test. */
export function _xoaHet() {
    _viTri.clear();
}
