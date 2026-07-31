export default function OptionList({ question, selected, onSelect }) {
    const showOptionText = question.part >= 3;
    const useListeningLayout = question.part <= 2;

    return (
        <div className={`toeic-options ${useListeningLayout ? 'toeic-options-listening' : ''}`}>
            {question.options.map(opt => (
                <div
                    key={opt.label}
                    className={`toeic-option ${useListeningLayout ? 'toeic-option-label-only' : ''} ${selected === opt.label ? 'selected' : ''}`}
                    data-answer={opt.label}
                    onClick={() => onSelect(opt.label)}
                >
                    <span className="toeic-option-label">{opt.label}</span>
                    {showOptionText && <span className="toeic-option-text">{opt.text}</span>}
                </div>
            ))}
        </div>
    );
}
