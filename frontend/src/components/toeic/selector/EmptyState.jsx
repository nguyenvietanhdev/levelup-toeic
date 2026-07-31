export default function EmptyState({ icon = 'fa-inbox', title, text, children }) {
    return (
        <div className="toeic-empty-state">
            <div className="toeic-empty-icon">
                <i className={`fas ${icon}`}></i>
            </div>
            {title && <h3 className="toeic-empty-title">{title}</h3>}
            {text && <p className="toeic-empty-text">{text}</p>}
            {children}
        </div>
    );
}
