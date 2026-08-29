// Panel "Ôn từ sai". Presentational — state/handlers truyền từ SettingsScreen.
//
// Tách khỏi "Luyện tập" vì đây là cài đặt của MỘT chế độ, không phải cài đặt
// dùng chung cho cả 16 chế độ như số câu / độ khó / thời gian. Nằm chung thì
// bảy ô tick chiếm quá nửa tab mà chỉ ảnh hưởng đúng một chế độ.

/**
 * Các kiểu hỏi của chế độ "Ôn lại từ sai", xếp theo độ khó tăng dần.
 * Khớp `KIEU_HOI` trong `reviewMistakes.js` — đổi một bên phải đổi bên kia.
 */
export const REVIEW_KINDS = [
    { key: 'flashcard', label: 'Lật thẻ',    desc: 'Xem từ, lật thẻ đối chiếu nghĩa rồi tự đánh giá' },
    { key: 'choice',    label: 'Chọn nghĩa', desc: 'Chọn đáp án đúng trong 4 lựa chọn' },
    { key: 'truefalse', label: 'Đúng / Sai', desc: 'Xem một nghĩa và quyết định đúng hay sai' },
    { key: 'listen',    label: 'Nghe & chọn', desc: 'Che mặt chữ, nghe phát âm rồi chọn nghĩa' },
    // Chỉ xuất hiện trên Chrome/Edge — trình duyệt không có Web Speech API thì
    // tự bỏ qua kiểu này (Firefox), không để người học kẹt giữa lượt.
    { key: 'speak',     label: 'Phát âm',    desc: 'Bấm mic và đọc to từ đó; cần Chrome hoặc Edge' },
    { key: 'scramble',  label: 'Xếp chữ cái', desc: 'Ghép các chữ cái xáo trộn thành từ đúng' },
    { key: 'fill',      label: 'Gõ từ',      desc: 'Tự gõ ra, không có gợi ý — khó nhất' },
    // Chỉ xuất hiện với từ CÓ chữ Hán — từ tiếng Anh tự bỏ qua kiểu này.
    { key: 'hanzi',     label: 'Viết chữ Hán', desc: 'Tô lại nét chữ; chỉ dùng cho từ tiếng Trung' },
];

export default function ReviewPanel({ s, updateSetting }) {
    // Kiểu hỏi đang bật. Chưa đặt gì → coi như bật TẤT CẢ: người chưa vào Cài
    // đặt bao giờ phải thấy mọi ô đều tick, không phải một loạt ô trống rồi tự
    // hỏi mình đã tắt cái gì.
    const kindsChon = Array.isArray(s.reviewKinds) && s.reviewKinds.length
        ? s.reviewKinds
        : REVIEW_KINDS.map(k => k.key);

    const toggleKind = (key) => {
        const sau = kindsChon.includes(key)
            ? kindsChon.filter(k => k !== key)
            : [...kindsChon, key];
        // Bỏ tick cái cuối → lưu mảng RỖNG, và `kieuDuocPhep()` hiểu đó là "dùng
        // tất cả". Chặn không cho bỏ thì người dùng kẹt ở một ô không tắt được;
        // để rỗng nghĩa là "không giới hạn", đúng hơn là một lượt không có câu nào.
        updateSetting('reviewKinds', sau);
    };

    const dangBatHet = kindsChon.length === REVIEW_KINDS.length;

    /**
     * Tick / bỏ tick tất cả.
     *
     * "Bỏ tất cả" lưu mảng RỖNG chứ không phải danh sách rỗng có ý nghĩa khác:
     * `kieuDuocPhep()` hiểu rỗng là "không giới hạn", nên về mặt luyện tập nó
     * giống hệt "chọn tất cả". Đó là chủ ý — một lượt không có câu nào thì
     * không dùng được.
     *
     * Vẫn để hai chiều vì trạng thái Ô TICK khác nhau: bỏ hết rồi tick lại đúng
     * vài kiểu mình muốn thì nhanh hơn là bỏ từng ô một.
     */
    const toggleAll = () => {
        updateSetting('reviewKinds', dangBatHet ? [] : REVIEW_KINDS.map(k => k.key));
    };

    return (
        <>
            {/* Chế độ này trộn nhiều kiểu trong CÙNG một lượt — câu này lật thẻ,
                câu sau gõ từ. Hệ thống xoay vòng qua các kiểu đang bật; ai không
                thích kiểu nào thì bỏ tick để không gặp lại. */}
            <div className="setting-item setting-item--column">
                <div className="setting-info">
                    <h4>Kiểu hỏi khi ôn từ sai</h4>
                    <p>Mỗi câu một kiểu, đan xen trong cùng một lượt. Bỏ tick để tắt kiểu không muốn gặp — bỏ hết = dùng tất cả.</p>
                </div>
                <div className="review-kinds-bar">
                    {/* Đếm để người dùng thấy ngay đang bật mấy kiểu mà không
                        phải rà từng ô — tám ô thì rà cũng mất công. */}
                    <span className="review-kinds-count">
                        Đang bật {kindsChon.length}/{REVIEW_KINDS.length}
                    </span>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={toggleAll}
                    >
                        <i className={`fas fa-${dangBatHet ? 'square' : 'square-check'}`}></i>
                        {' '}{dangBatHet ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    </button>
                </div>
                <div className="review-kinds">
                    {REVIEW_KINDS.map(k => {
                        const dangBat = kindsChon.includes(k.key);
                        return (
                            <label key={k.key} className="review-kind">
                                <input
                                    type="checkbox"
                                    checked={dangBat}
                                    onChange={() => toggleKind(k.key)}
                                />
                                <span className="review-kind-body">
                                    <strong>{k.label}</strong>
                                    <em>{k.desc}</em>
                                </span>
                            </label>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
