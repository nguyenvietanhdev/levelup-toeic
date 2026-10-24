import ConversationScreen from './ConversationScreen.jsx';

/**
 * Hội thoại GIỌNG NÓI: AI gửi tin nhắn thoại, người học trả lời bằng ghi âm.
 * Dùng lại toàn bộ màn Chat (vai, tình huống, kiểu chấm, chấm điểm, lịch sử) —
 * chỉ khác cách hiển thị lượt và ô trả lời (xem prop `voice`).
 */
export default function VoiceConversationScreen(props) {
    return <ConversationScreen {...props} voice />;
}
