import { UploadVocabAPI } from '@api/uploadVocab.js';

/**
 * Lưu một mẫu câu ngữ pháp vào Từ vựng riêng.
 *
 * Kho riêng theo ngôn ngữ (`mau-cau-en` / `mau-cau-zh`) để câu không trộn với từ đơn, và Part là
 * tên chủ điểm để luyện được theo từng chủ điểm. Ghi `lang` để câu chữ Hán đọc bằng giọng Trung.
 */
export const khoMauCau = (lang) => (lang === 'zh' ? 'mau-cau-zh' : 'mau-cau-en');

export async function luuMauCau({ cau, nghia = '', lang = 'en', tenMuc = '' }) {
    const text = String(cau || '').trim();
    if (!text) throw new Error('Không có câu để lưu');
    let res;
    try {
        res = await UploadVocabAPI.create({
            en: text,
            vn: String(nghia || '').trim(),
            lang: lang === 'zh' ? 'zh' : 'en',
            source: khoMauCau(lang),
            part: (String(tenMuc || '').trim() || 'Mẫu câu').slice(0, 60),
            type: '',
            retentionDays: 30,
        });
    } catch {
        throw new Error('Lỗi kết nối');
    }
    if (!res?.success) throw new Error(res?.message || 'Lưu thất bại');
    return res;
}
