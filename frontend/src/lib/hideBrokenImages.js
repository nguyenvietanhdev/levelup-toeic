// Ẩn ảnh hỏng mà KHÔNG dùng inline `onerror`.
//
// Tám chỗ trong app từng viết `<img onerror="this.style.display='none'">`. CSP
// production đặt `script-src-attr 'none'` nên trình duyệt chặn thẳng: ảnh hỏng
// hiện icon vỡ thay vì biến mất, và không có lỗi nào ngoài một dòng console.
//
// Không thể thay bằng listener gắn từng thẻ: các thẻ <img> này sinh ra bằng
// innerHTML rải rác ở 8 file, dựng lại liên tục mỗi câu hỏi. Nên bắt sự kiện ở
// giai đoạn CAPTURE trên document — `error` không nổi bọt (bubble), nhưng có đi
// xuống ở pha capture, nên đây là cách duy nhất bắt được bằng một listener.

/** Ảnh hỏng sẽ ẩn chính nó, hoặc ẩn cả cột chứa nó nếu có `data-hide-closest`. */
export function installBrokenImageHandler(doc = document) {
    if (doc._brokenImgBound) return;
    doc._brokenImgBound = true;

    doc.addEventListener('error', (e) => {
        const el = e.target;
        if (!(el instanceof HTMLImageElement)) return;
        if (!el.classList.contains('js-hide-on-error')) return;

        const sel = el.dataset.hideClosest;
        const target = sel ? el.closest(sel) : el;
        if (target) target.style.display = 'none';
    }, true);   // true = capture, bắt buộc: sự kiện `error` không bubble
}
