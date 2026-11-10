/** Hàm thuần cho màn Bài nghe có script. */

/** Giây → "m:ss". */
export const gioPhut = (giay) => {
    const s = Math.max(0, Math.round(Number(giay) || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Câu đang phát tại thời điểm `t` (thuần): câu cuối cùng đã bắt đầu; trước câu đầu thì -1. */
export function cauTai(cau, t) {
    let i = -1;
    for (let k = 0; k < cau.length; k += 1) {
        if (cau[k].batDau <= t + 0.05) i = k;
        else break;
    }
    return i;
}

/** Tách câu tiếng Anh thành từ bấm được, giữ nguyên dấu câu và khoảng trắng để hiển thị (thuần). */
export function tachTu(text) {
    return String(text || '').split(/(\s+)/).map((p) => {
        const tu = p.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '');
        return { hien: p, tu: /[A-Za-z]/.test(tu) ? tu : '' };
    });
}
