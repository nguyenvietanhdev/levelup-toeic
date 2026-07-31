import AudioPlayer from './AudioPlayer.jsx';
import ReadingQuestion from './ReadingQuestion.jsx';
import OptionList from './OptionList.jsx';

/**
 * Hiển thị CẢ NHÓM câu hỏi trên một màn (Part 3/4/6/7):
 *  - Cột trái: ngữ cảnh CHUNG (audio + ảnh với phần Nghe; ảnh/đoạn văn với phần Đọc).
 *    Media chung nằm ở câu ĐẦU nhóm nên lấy câu đầu tiên CÓ media.
 *  - Cột phải: liệt kê từng câu con với đáp án riêng, trả lời độc lập.
 *
 * groupItems: [{ q, index }]  (index = vị trí tuyệt đối trong mảng questions)
 */
export default function GroupQuestionView({ groupItems, answers, onSelectAnswer, audioPlaying, onPlayAudio }) {
    if (!groupItems?.length) return null;

    const media = (groupItems.find(it => it.q.audioUrl || it.q.imageUrls?.length || it.q.passages?.length) || groupItems[0]).q;
    const isListening = media.part <= 4;
    const hasAudio = media.audioUrl || media.audioText;

    const leftContent = isListening ? (
        <>
            {hasAudio && <AudioPlayer part={media.part} playing={audioPlaying} onPlay={onPlayAudio} />}
            {media.imageUrls?.length > 0 && media.imageUrls.map((url, i) => (
                <img key={i} src={url} className="toeic-question-image" alt="Ngữ cảnh" style={{ maxWidth: '100%', marginTop: '1rem' }} />
            ))}
            {!media.imageUrls?.length && !hasAudio && (
                <div className="toeic-image-placeholder"><i className="fas fa-align-left"></i><span>Không có ngữ cảnh</span></div>
            )}
        </>
    ) : (
        <ReadingQuestion question={media} hideQuestionText />
    );

    return (
        <div className={`toeic-two-col-layout${isListening ? '' : ' reading'}`}>
            <div className="toeic-left-panel">
                <div className="toeic-left-body">{leftContent}</div>
            </div>
            <div className="toeic-right-panel">
                <div className="toeic-group-questions">
                    {groupItems.map(({ q, index }) => (
                        <div key={index} className="toeic-group-question">
                            {/* Số câu ĐỨNG CÙNG HÀNG với đề bài: xuống dòng riêng
                                vừa tốn một dòng cho mỗi câu, vừa đẩy đề bài xa
                                khỏi cái số vốn là nhãn của chính nó. */}
                            <div className="toeic-group-q-head">
                                <span className="toeic-group-q-num">Câu {q.globalQuestionNumber ?? q.questionNumber ?? index + 1}</span>
                                {/* Part 6 không có câu hỏi (chỉ chỗ trống + đáp án) */}
                                {q.part !== 6 && q.questionText && (
                                    <span className="toeic-question-text" dangerouslySetInnerHTML={{ __html: q.questionText }} />
                                )}
                            </div>
                            <OptionList
                                question={q}
                                selected={answers[index]}
                                onSelect={(label) => onSelectAnswer(index, label)}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
