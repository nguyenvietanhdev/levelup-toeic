// "Report a problem" panel. Presentational — all state/handlers stay in
// SettingsScreen and are passed in. JSX moved verbatim.
export default function ReportPanel({
    reportContent,
    setReportContent,
    reportImage,
    setReportImage,
    reportImageName,
    setReportImageName,
    handleReportImageChange,
    reportSubmitting,
    handleSubmitReport,
}) {
    return (
        <div className="settings-section">
            <h3>Báo cáo sự cố</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88em', marginBottom: 12 }}>
                Gặp lỗi hoặc có góp ý? Hãy cho chúng tôi biết!
            </p>
            <textarea
                placeholder="Mô tả sự cố bạn gặp phải... (ít nhất 5 ký tự)"
                maxLength={2000}
                value={reportContent}
                onChange={e => setReportContent(e.target.value)}
                rows={5}
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--input-bg, var(--bg-secondary))', color: 'var(--text-primary)', fontSize: '0.9em' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', color: 'var(--text-secondary)', marginBottom: 10 }}>
                <span>{reportContent.length}/2000</span>
            </div>

            <div style={{ border: '2px dashed var(--border-color)', borderRadius: 8, padding: 12, marginBottom: 12, cursor: 'pointer' }}
                onClick={() => document.getElementById('report-image-input').click()}>
                <i className="fas fa-image" style={{ marginRight: 8, color: 'var(--text-secondary)' }}></i>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.88em' }}>
                    {reportImageName || 'Đính kèm ảnh (tuỳ chọn, tối đa 5MB)'}
                </span>
                <input id="report-image-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleReportImageChange} />
            </div>
            {reportImage && (
                <button className="btn btn-secondary btn-sm" style={{ marginBottom: 10 }}
                    onClick={() => { setReportImage(null); setReportImageName(''); }}>
                    <i className="fas fa-times"></i> Xóa ảnh
                </button>
            )}

            <button className="btn btn-primary" style={{ width: '100%' }}
                disabled={reportSubmitting} onClick={handleSubmitReport}>
                {reportSubmitting
                    ? <><i className="fas fa-spinner fa-spin"></i> Đang gửi...</>
                    : <><i className="fas fa-paper-plane"></i> Gửi báo cáo</>}
            </button>
        </div>
    );
}
