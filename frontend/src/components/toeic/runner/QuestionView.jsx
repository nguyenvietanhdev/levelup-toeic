import AudioPlayer from './AudioPlayer.jsx';
import ListeningQuestion from './ListeningQuestion.jsx';
import ReadingQuestion from './ReadingQuestion.jsx';
import OptionList from './OptionList.jsx';
import FillBlankOptions from './FillBlankOptions.jsx';

export default function QuestionView({
    question, currentIndex, fillInBlankMode, selectedAnswer,
    audioPlaying, onPlayAudio, onSelectAnswer,
    keywordAnswers, keywordStatus, onKeywordChange, onCheckKeywords,
    timer, onToggleNav,
}) {
    if (!question) return null;

    const isListening = question.part <= 4;
    const hasKeywords = question.questionKeyword || question.answerKeyword || question.audioKeyword;
    const hasAudio = question.audioText || question.audioUrl;

    const optionsBlock = fillInBlankMode ? (
        <>
            <FillBlankOptions
                question={question}
                currentIndex={currentIndex}
                keywordAnswers={keywordAnswers}
                keywordStatus={keywordStatus}
                onKeywordChange={onKeywordChange}
                onCheck={onCheckKeywords}
            />
            {hasKeywords && (
                <div className="fill-blank-actions" style={{ marginTop: 15, textAlign: 'center' }}>
                    <button
                        className="toeic-action-btn primary"
                        style={{ padding: '10px 25px' }}
                        onClick={onCheckKeywords}
                    >
                        <i className="fas fa-check"></i> Kiểm tra từ điền
                    </button>
                </div>
            )}
        </>
    ) : (
        <OptionList question={question} selected={selectedAnswer} onSelect={onSelectAnswer} />
    );

    // Cột TRÁI ("Câu hỏi"): nghe → ảnh + transcript; đọc → ảnh + đoạn văn.
    const hasReadingMedia = question.imageUrls?.length > 0 || question.passages?.length > 0;
    const leftContent = isListening ? (
        <ListeningQuestion
            question={question}
            currentIndex={currentIndex}
            fillInBlankMode={fillInBlankMode}
            audioPlaying={audioPlaying}
            onPlayAudio={onPlayAudio}
            keywordAnswers={keywordAnswers}
            keywordStatus={keywordStatus}
            onKeywordChange={onKeywordChange}
            onCheck={onCheckKeywords}
        />
    ) : hasReadingMedia ? (
        <ReadingQuestion question={question} hideQuestionText />
    ) : (
        <div className="toeic-image-placeholder">
            <i className="fas fa-align-left"></i>
            <span>Câu hỏi không có hình / đoạn văn</span>
        </div>
    );

    // Thống nhất 2 cột cho mọi Part: trái "Câu hỏi", phải đề + đáp án.
    return (
        <div className={`toeic-two-col-layout${isListening ? '' : ' reading'}`}>
            <div className="toeic-left-panel">
                <div className="toeic-left-body">
                    {/* Nút nghe thuộc cột "Câu hỏi" — giống màn nhóm (Part 3·4·6·7).
                        Part 2 không có ảnh nên cột trái trước đây trống trơn. */}
                    {hasAudio && (
                        <AudioPlayer part={question.part} playing={audioPlaying} onPlay={onPlayAudio} />
                    )}
                    {leftContent}
                </div>
            </div>
            <div className="toeic-right-panel">
                {/* Số câu THẬT theo chuẩn TOEIC (7, 101…) — Part đơn 1·2·5 trước đây
                    không hiện. Part 6·7 có số IN SẴN trong ảnh scan nên bỏ qua. */}
                {/* Số câu đứng CÙNG HÀNG với đề bài (giống màn nhóm) — tách hai
                    dòng thì cái nhãn nằm xa chính thứ nó gán nhãn. */}
                <div className="toeic-q-head">
                    {(question.globalQuestionNumber ?? question.questionNumber) != null && question.part !== 6 && question.part !== 7 && (
                        <span className="toeic-q-number">Câu {question.globalQuestionNumber ?? question.questionNumber}</span>
                    )}
                    {!isListening && question.questionText && (
                        <span className="toeic-question-text" dangerouslySetInnerHTML={{ __html: question.questionText }} />
                    )}
                </div>
                {optionsBlock}
            </div>
        </div>
    );
}
