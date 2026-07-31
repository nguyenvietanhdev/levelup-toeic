import KeywordBlankText from './KeywordBlankText.jsx';

export default function ListeningQuestion({
    question, currentIndex, fillInBlankMode,
    audioPlaying, onPlayAudio,
    keywordAnswers, keywordStatus, onKeywordChange, onCheck,
}) {
    // Fill-blank: Part 2 question text with blank
    const part2Source = question.questionText || question.audioText || '';
    const showPart2Blank = fillInBlankMode && question.part === 2 && part2Source;

    // Fill-blank: Part 3-4 audio transcript with blank
    const showPart34Blank = fillInBlankMode && (question.part === 3 || question.part === 4) && question.audioText;

    return (
        <>
            {question.imageUrls?.length > 0
                ? question.imageUrls.map((url, i) => (
                    <img key={i} src={url} className="toeic-question-image" alt="Question" />
                ))
                : question.part === 1 && (
                    <div className="toeic-image-placeholder">
                        <i className="fas fa-image"></i>
                        <span>Chưa có ảnh cho câu này</span>
                    </div>
                )}

            {showPart2Blank && (
                <div
                    className="toeic-fill-blank-text"
                    style={{
                        padding: '1rem',
                        background: 'linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 100%)',
                        borderRadius: 12, marginTop: '1rem', borderLeft: '4px solid #43a047',
                    }}
                >
                    <p style={{ fontSize: 13, color: '#43a047', marginBottom: 10, fontWeight: 600 }}>
                        <i className="fas fa-question-circle"></i> Câu hỏi{question.questionKeyword ? ' - Điền từ còn thiếu:' : ':'}
                    </p>
                    <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'var(--text-primary)' }}>
                        {question.questionKeyword ? (
                            <KeywordBlankText
                                text={part2Source}
                                keyword={question.questionKeyword}
                                inputId={`question-keyword-${currentIndex}`}
                                value={keywordAnswers[`question-keyword-${currentIndex}-0`]}
                                onChange={onKeywordChange}
                                onSubmit={onCheck}
                                status={keywordStatus[`question-keyword-${currentIndex}-0`]}
                            />
                        ) : part2Source}
                    </p>
                </div>
            )}

            {showPart34Blank && (
                <div
                    className="toeic-fill-blank-text"
                    style={{
                        padding: '1rem',
                        background: 'linear-gradient(135deg, #f5f0ff 0%, #fff0f5 100%)',
                        borderRadius: 12, marginTop: '1rem', borderLeft: '4px solid var(--primary-color)',
                    }}
                >
                    <p style={{ fontSize: 13, color: 'var(--primary-color)', marginBottom: 10, fontWeight: 600 }}>
                        <i className="fas fa-pen-square"></i> Transcript - Điền từ còn thiếu:
                    </p>
                    <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                        {question.audioKeyword ? (
                            <KeywordBlankText
                                text={question.audioText}
                                keyword={question.audioKeyword}
                                inputId={`audio-keyword-${currentIndex}`}
                                value={keywordAnswers[`audio-keyword-${currentIndex}-0`]}
                                onChange={onKeywordChange}
                                onSubmit={onCheck}
                                status={keywordStatus[`audio-keyword-${currentIndex}-0`]}
                            />
                        ) : question.audioText}
                    </p>
                </div>
            )}

            {question.part >= 3 && question.questionText && (
                <div className="toeic-question-text" dangerouslySetInnerHTML={{ __html: question.questionText }} />
            )}

        </>
    );
}
