// Dữ liệu tĩnh: mốc số câu đúng liên tiếp + lời động viên tương ứng.
// Tách khỏi practiceManager.js vì đây thuần là data, không có state/logic.
export const MILESTONES = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200];

export const MILESTONE_MESSAGES = {
    5: [
        'Bước đầu vững chắc! Mỗi từ học được là một viên gạch xây nên nền tảng. 📚',
        'Năm từ đầu tiên đã xong! Hành trình ngàn dặm bắt đầu từ bước chân đầu tiên. 🚶',
        'Khởi đầu tốt đẹp! Não bộ đang bắt đầu ghi nhớ rồi đấy. 🧠'
    ],
    10: [
        'Hai con số rồi! Bạn đang tạo thói quen học tập tốt. 💪',
        'Mười từ không phải ít đâu! Kiên trì sẽ tạo nên sự khác biệt. 🌱',
        'Đã đi được 10 bước! Nhớ rằng học ít nhưng đều đặn tốt hơn học nhiều rồi bỏ. 📖'
    ],
    15: [
        'Bạn đang duy trì tốt! Sự kiên trì này sẽ mang lại kết quả. ⏳',
        '15 từ là một cột mốc đáng ghi nhận. Tiếp tục nhịp độ này! 🎯',
        'Não bộ đang dần quen với việc học từ mới. Cảm giác khó khăn ban đầu sẽ giảm dần. 🔄'
    ],
    20: [
        'Hai mươi từ! Đây là số lượng đủ để bạn thấy sự tiến bộ thực sự. 📈',
        'Bạn đã học được số từ tương đương một bài học TOEIC. Ấn tượng! 🏆',
        'Consistency is key! Bạn đang làm rất tốt việc duy trì học tập. ✨'
    ],
    25: [
        'Một phần tư trăm! Mỗi từ vựng là một công cụ mới trong hành trang của bạn. 🧰',
        'Bạn đang chứng minh rằng mình có thể kiên trì. Đó là phẩm chất quý giá. 💎',
        '25 từ đúng cho thấy bạn đang hiểu bài. Tiếp tục giữ vững! 🛡️'
    ],
    30: [
        'Ba mươi từ! Bạn đang xây dựng vốn từ vựng vững chắc. 🏗️',
        'Ở mốc này, nhiều người đã bỏ cuộc. Bạn thì không! 🔥',
        'Từ vựng của bạn đang mở rộng đáng kể. Những nỗ lực này sẽ được đền đáp. 🌟'
    ],
    40: [
        'Bốn mươi từ là thành tích đáng tự hào. Bạn đang nghiêm túc với việc học! 📚',
        'Não bộ bạn đang hoạt động hiệu quả. Tiếp tục nạp năng lượng cho nó! 🧠⚡',
        'Sự kiên nhẫn của bạn đang được chuyển hóa thành kiến thức thực sự. 🔮'
    ],
    50: [
        'NỬA TRĂM TỪ! Đây là cột mốc lớn đầu tiên. Bạn xứng đáng được ghi nhận! 🎉',
        'Fifty words! Vốn từ vựng này sẽ giúp bạn rất nhiều trong bài thi. 📝',
        '50 từ đúng nghĩa là bạn đã nắm vững một lượng kiến thức đáng kể. Tự hào đi! 🏅'
    ],
    75: [
        'Bảy mươi lăm từ! Bạn đang ở top những người học nghiêm túc nhất. 🥇',
        'Ba phần tư đường đến 100! Đích đến đã ở trước mắt. 🏁',
        'Sự cố gắng này sẽ phản ánh trong điểm TOEIC của bạn. Tin tưởng đi! 📊'
    ],
    100: [
        '🎊 MỘT TRĂM TỪ! Đây là thành tích phi thường. Bạn thực sự nghiêm túc!',
        'Century milestone! 100 từ là vốn từ vựng của cả một chủ đề TOEIC. 👑',
        'Bạn đã chứng minh rằng mình có kỷ luật và quyết tâm. Điều này quý hơn bất kỳ điểm số nào. 💯'
    ],
    150: [
        '150 từ! Đây là level mà chỉ những người thực sự kiên trì mới đạt được. 🌟',
        'Bạn đang ở nhóm 1% những người học chăm chỉ nhất. Respect! 🙌',
        'One hundred fifty! Vốn từ vựng của bạn đang trở nên rất vững chắc. 📚'
    ],
    200: [
        '🏆 HAI TRĂM TỪ! Bạn là LEGEND thực sự! Sự kiên trì này sẽ mang lại thành công!',
        'Đây là thành tích hiếm có! Bạn đã vượt qua mọi giới hạn của bản thân. 🚀',
        '200 từ đúng trong một phiên! Bạn xứng đáng nhận mọi lời khen ngợi. 👏👏👏'
    ]
};

export function getMilestoneMessage(milestone) {
    const messages = MILESTONE_MESSAGES[milestone];
    if (!messages || messages.length === 0) {
        return 'Tuyệt vời! Tiếp tục cố gắng! 🎉';
    }
    return messages[Math.floor(Math.random() * messages.length)];
}
