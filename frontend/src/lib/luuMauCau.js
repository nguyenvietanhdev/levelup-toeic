import { UploadVocabAPI } from '@api/uploadVocab.js';

/**
 * Lưu một mẫu câu ngữ pháp vào Từ vựng riêng.
 *
 * Kho riêng theo ngôn ngữ (`mau-cau-en` / `mau-cau-zh`) để câu không trộn với từ đơn, và Part là
 * tên chủ điểm để luyện được theo từng chủ điểm. Ghi `lang` để câu chữ Hán đọc bằng giọng Trung.
 */
export const khoMauCau = (lang) => (lang === 'zh' ? 'mau-cau-zh' : 'mau-cau-en');

export async function luuMauCau({ cau, nghia = '', lang = 'en', tenMuc = '' }) {
    return luuVaoTuRieng({ en: cau, vn: nghia, lang, source: khoMauCau(lang), part: tenMuc || 'Mẫu câu' });
}

/** Lưu một mục bất kỳ vào Từ vựng riêng (kho `source`, phần `part`, câu ví dụ tuỳ chọn). */
export async function luuVaoTuRieng({ en, vn = '', lang = 'en', source, part, example = '' }) {
    const text = String(en || '').trim();
    if (!text) throw new Error('Không có nội dung để lưu');
    let res;
    try {
        res = await UploadVocabAPI.create({
            en: text,
            vn: String(vn || '').trim(),
            lang: lang === 'zh' ? 'zh' : 'en',
            source,
            part: (String(part || '').trim() || 'Chung').slice(0, 60),
            type: '',
            example: String(example || '').slice(0, 300),
            retentionDays: 30,
        });
    } catch {
        throw new Error('Lỗi kết nối');
    }
    if (!res?.success) throw new Error(res?.message || 'Lưu thất bại');
    return res;
}
