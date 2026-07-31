import KeywordBlankText from './KeywordBlankText.jsx';

export default function FillBlankOptions({ question, currentIndex, keywordAnswers, keywordStatus, onKeywordChange, onCheck }) {
    return (
        <div className="toeic-options-display">
            {question.options.map(opt => {
                const isCorrect = opt.label === question.correctAnswer;
                const blankInQuestion = question.part <= 2 && question.answerKeyword && isCorrect;

                return (
                    <div
                        key={opt.label}
                        className={`toeic-option-row ${isCorrect ? 'correct-answer' : ''}`}
                    >
                        <span className="toeic-option-label">({opt.label})</span>
                        <span className="toeic-option-text">
                            {blankInQuestion ? (
                                <KeywordBlankText
                                    text={opt.text}
                                    keyword={question.answerKeyword}
                                    inputId={`answer-keyword-${currentIndex}-${opt.label}`}
                                    value={keywordAnswers[`answer-keyword-${currentIndex}-${opt.label}-0`]}
                                    onChange={onKeywordChange}
                                    onSubmit={onCheck}
                                    status={keywordStatus[`answer-keyword-${currentIndex}-${opt.label}-0`]}
                                />
                            ) : opt.text}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
