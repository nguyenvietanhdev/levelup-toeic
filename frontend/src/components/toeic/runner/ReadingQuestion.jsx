import { useState } from 'react';
import ImageLightbox from './ImageLightbox.jsx';

export default function ReadingQuestion({ question, hideQuestionText = false }) {
    const [zoom, setZoom] = useState(null);

    return (
        <>
            {/* Ảnh đề Part 6/7 CHÍNH LÀ nội dung đọc → cho tràn hết bề ngang khung,
                bấm vào phóng to ngay tại chỗ (không nhảy tab mới như trước). */}
            {question.imageUrls?.length > 0 && question.imageUrls.map((url, i) => (
                <img
                    key={i}
                    src={url}
                    className="toeic-passage-image"
                    alt={`Đoạn đọc ${i + 1}`}
                    title="Bấm để phóng to"
                    onClick={() => setZoom(url)}
                />
            ))}
            {question.passages?.length > 0 && question.passages.map((p, i) => (
                <div
                    key={i}
                    className="toeic-passage"
                    dangerouslySetInnerHTML={{ __html: String(p).replace(/\n/g, '<br>') }}
                />
            ))}
            {!hideQuestionText && question.questionText && (
                <div className="toeic-question-text" dangerouslySetInnerHTML={{ __html: question.questionText }} />
            )}

            <ImageLightbox src={zoom} alt="Đoạn đọc" onClose={() => setZoom(null)} />
        </>
    );
}
