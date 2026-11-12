/**
 * Tính các chỉ số đo bộ chấm (thuần — test được, không gọi AI).
 */

const tb = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const lamTron = (x, b = 100) => Math.round(x * b) / b;

/** Độ dao động của một dãy điểm: thấp nhất, cao nhất, chênh, trung bình. */
function daoDong(diem) {
    const ds = diem.filter(Number.isFinite);
    if (!ds.length) return null;
    const thap = Math.min(...ds);
    const cao = Math.max(...ds);
    return { lan: ds.length, tb: lamTron(tb(ds)), thap, cao, chenh: lamTron(cao - thap) };
}

/**
 * Một lỗi cài sẵn có bị bắt không: có lỗi nào AI đưa ra mà trích dẫn chứa cụm dấu hiệu (hoặc
 * trích dẫn ngắn nằm gọn trong cụm đó). Không phân biệt hoa thường, bỏ khoảng trắng thừa.
 */
function batDuoc(loiCai, dsLoiAi) {
    const chuan = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const dau = chuan(loiCai.dau);
    return (dsLoiAi || []).some((e) => {
        const q = chuan(e?.quote);
        return q && (q.includes(dau) || (q.length >= 4 && dau.includes(q)));
    });
}

/** Tỉ lệ bắt lỗi cài sẵn trong một lần chấm. */
function tiLeBatLoi(loiCai, dsLoiAi) {
    const bat = loiCai.filter((l) => batDuoc(l, dsLoiAi));
    return { bat: bat.length, tong: loiCai.length, sot: loiCai.filter((l) => !batDuoc(l, dsLoiAi)).map((l) => l.sai) };
}

/**
 * Thứ tự có đúng không: điểm trung bình phải tăng theo `mucDuKien`. Trả cặp sai thứ tự (nếu có).
 */
function kiemThuTu(ketQua) {
    const co = ketQua.filter((k) => k.mucDuKien && k.overall?.tb != null).sort((a, b) => a.mucDuKien - b.mucDuKien);
    const sai = [];
    for (let i = 1; i < co.length; i += 1) {
        if (!(co[i].overall.tb > co[i - 1].overall.tb)) sai.push(`${co[i - 1].id} (${co[i - 1].overall.tb}) ≥ ${co[i].id} (${co[i].overall.tb})`);
    }
    return { dung: sai.length === 0, sai };
}

/**
 * Độ lệch nên hiện cho người học (thuần): nửa khoảng chênh lớn nhất của band tổng giữa các lần
 * chấm cùng một bài, làm tròn LÊN tới 0.5, tối thiểu 0.5 (thang band bước 0.5).
 */
function doLechHienThi(ketQua) {
    const chenh = ketQua.map((k) => k.overall?.chenh).filter(Number.isFinite);
    if (!chenh.length) return 0.5;
    return Math.max(0.5, Math.ceil(Math.max(...chenh) / 2 / 0.5) * 0.5);
}

module.exports = { daoDong, batDuoc, tiLeBatLoi, kiemThuTu, doLechHienThi };
