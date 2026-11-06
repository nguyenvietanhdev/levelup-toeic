/**
 * KHO CÂU cho chế độ PHẢN XẠ CÂU — nhìn câu tiếng Việt, nói/gõ câu tiếng Anh.
 *
 * Bốn khung lấy từ lỗi THẬT trong bài làm: ghép câu theo tiếng Việt, không đổi động
 * từ sang quá khứ, lẫn tell/say/talk, thiếu mẫu câu giao tiếp. Viết tay (không nhờ AI
 * sinh): câu mẫu phải chắc chắn đúng, và chế độ chạy được ngay mà không tốn token.
 *
 * `id` là khoá lưu tiến độ — KHÔNG đổi id của câu đã có. `chap` = cách nói khác cũng
 * đúng, để khỏi phải hỏi AI cho những đáp án phổ biến.
 */
const KHUNG = [
    {
        key: 'khung-cau', ten: 'Câu đủ khung', icon: 'fa-cubes',
        moTa: 'Đủ chủ ngữ + động từ, không dịch từng chữ từ tiếng Việt.',
        cau: [
            { id: 'kc1', vi: 'Tôi rất vui được gặp bạn.', en: "I'm very happy to meet you.", chap: ["I'm very happy to see you.", "I'm very glad to meet you.", "I'm so happy to see you."] },
            { id: 'kc2', vi: 'Tôi rất vui khi thấy họ trò chuyện.', en: 'I was very happy to see them talking.', chap: ['I am very happy to see them talking.', 'I was very happy to see them chatting.', "I'm very happy to see them chatting."] },
            { id: 'kc3', vi: 'Phòng gym rất lớn và có nhiều máy tập.', en: 'The gym is very big and has many machines.', chap: ['The gym is very big and has a lot of machines.', 'The gym is very large and has many machines.', 'The gym is big and has many machines.'] },
            { id: 'kc4', vi: 'Ở đây có nhiều người.', en: 'There are many people here.', chap: ['There are a lot of people here.', 'There are lots of people here.'] },
            { id: 'kc5', vi: 'Tôi thường đi bộ đến cuối phố.', en: 'I usually walk to the end of the street.', chap: [] },
            { id: 'kc6', vi: 'Cửa hàng này nổi tiếng với món thịt nướng.', en: 'This store is famous for its grilled meat.', chap: ['This shop is famous for its grilled meat.', 'This store is famous for grilled meat.', 'This shop is famous for grilled meat.'] },
            { id: 'kc7', vi: 'Tôi mệt vì đã làm việc cả ngày.', en: 'I am tired because I worked all day.', chap: ['I am tired from working all day.', 'I am tired because I have worked all day.'] },
            { id: 'kc8', vi: 'Bài này khó hiểu.', en: 'This lesson is hard to understand.', chap: ['This lesson is difficult to understand.', 'This exercise is hard to understand.', 'This is hard to understand.', 'This is difficult to understand.'] },
            { id: 'kc9', vi: 'Tôi và bạn tôi đã đi cùng nhau.', en: 'My friend and I went together.', chap: [] },
            { id: 'kc10', vi: 'Tôi không có thời gian.', en: "I don't have time.", chap: ['I have no time.', "I don't have any time."] },
            { id: 'kc11', vi: 'Tôi cần đi ngân hàng.', en: 'I need to go to the bank.', chap: [] },
            { id: 'kc12', vi: 'Tìm nơi này rất dễ.', en: 'It is very easy to find this place.', chap: ['This place is very easy to find.', 'It is easy to find this place.', 'This place is easy to find.'] },
        ],
    },
    {
        key: 'qua-khu', ten: 'Kể chuyện đã qua', icon: 'fa-clock-rotate-left',
        moTa: 'Đổi động từ sang quá khứ: go → went, see → saw, think → thought.',
        cau: [
            { id: 'qk1', vi: 'Hôm qua tôi đã đi ngân hàng.', en: 'Yesterday I went to the bank.', chap: ['I went to the bank yesterday.'] },
            { id: 'qk2', vi: 'Tôi đã thấy một tấm thảm đẹp.', en: 'I saw a beautiful rug.', chap: ['I saw a beautiful carpet.'] },
            { id: 'qk3', vi: 'Tối qua tôi đã ăn mì.', en: 'I ate noodles last night.', chap: ['Last night I ate noodles.', 'I had noodles last night.', 'Last night I had noodles.'] },
            { id: 'qk4', vi: 'Sáng nay cô ấy đã gọi cho tôi.', en: 'She called me this morning.', chap: ['This morning she called me.'] },
            { id: 'qk5', vi: 'Chúng tôi đã gặp nhau tuần trước.', en: 'We met last week.', chap: ['We met each other last week.', 'Last week we met.'] },
            { id: 'qk6', vi: 'Tôi đã quên điện thoại ở nhà.', en: 'I forgot my phone at home.', chap: ['I left my phone at home.'] },
            { id: 'qk7', vi: 'Anh ấy đã mua một chiếc xe mới.', en: 'He bought a new car.', chap: [] },
            { id: 'qk8', vi: 'Tôi đã nghĩ nó rất đắt.', en: 'I thought it was very expensive.', chap: [] },
            { id: 'qk9', vi: 'Hôm qua trời mưa to.', en: 'It rained heavily yesterday.', chap: ['Yesterday it rained heavily.', 'It rained a lot yesterday.', 'Yesterday it rained a lot.'] },
            { id: 'qk10', vi: 'Tối qua tôi không ngủ đủ.', en: "I didn't sleep enough last night.", chap: ["I didn't get enough sleep last night.", "Last night I didn't sleep enough."] },
            { id: 'qk11', vi: 'Hôm qua bạn đã đi đâu?', en: 'Where did you go yesterday?', chap: [] },
            { id: 'qk12', vi: 'Tối qua bạn có xem trận đấu không?', en: 'Did you watch the game last night?', chap: ['Did you watch the match last night?'] },
        ],
    },
    {
        key: 'tell-say-talk', ten: 'Tell · Say · Talk', icon: 'fa-comment-dots',
        moTa: 'tell + người, say + lời nói, talk to + người.',
        cau: [
            { id: 'ts1', vi: 'Cô ấy bảo tôi kiểm tra hợp đồng.', en: 'She told me to check the contract.', chap: [] },
            { id: 'ts2', vi: 'Anh ấy nói rằng anh ấy bận.', en: 'He said he was busy.', chap: ['He said that he was busy.'] },
            { id: 'ts3', vi: 'Hãy nói cho tôi sự thật.', en: 'Tell me the truth.', chap: ['Please tell me the truth.'] },
            { id: 'ts4', vi: 'Tôi muốn nói chuyện với quản lý.', en: 'I want to talk to the manager.', chap: ["I'd like to talk to the manager.", 'I want to speak to the manager.', "I'd like to speak to the manager.", 'I want to talk with the manager.', 'I want to speak with the manager.'] },
            { id: 'ts5', vi: 'Chúng tôi đã nói chuyện cả buổi chiều.', en: 'We talked all afternoon.', chap: ['We chatted all afternoon.'] },
            { id: 'ts6', vi: 'Họ chào tạm biệt rồi ra về.', en: 'They said goodbye and left.', chap: [] },
            { id: 'ts7', vi: 'Cô ấy đã nói gì với bạn?', en: 'What did she say to you?', chap: ['What did she tell you?'] },
            { id: 'ts8', vi: 'Bạn có thể nói lại được không?', en: 'Can you say that again?', chap: ['Could you say that again?', 'Can you say it again?', 'Could you say it again?'] },
            { id: 'ts9', vi: 'Anh ấy bảo tôi đợi ở đây.', en: 'He told me to wait here.', chap: [] },
            { id: 'ts10', vi: 'Ngày mai tôi sẽ nói với cô ấy.', en: 'I will tell her tomorrow.', chap: ['Tomorrow I will tell her.'] },
            { id: 'ts11', vi: 'Nhân viên đã nói chuyện với tôi về giá.', en: 'The employee talked to me about the price.', chap: ['The staff member talked to me about the price.', 'The employee talked with me about the price.'] },
            { id: 'ts12', vi: 'Làm ơn nói chậm hơn.', en: 'Please speak more slowly.', chap: ['Please speak slower.', 'Please talk more slowly.', 'Please talk slower.'] },
        ],
    },
    {
        key: 'mau-giao-tiep', ten: 'Mẫu câu giao tiếp', icon: 'fa-comments',
        moTa: 'Câu dùng hằng ngày khi gọi món, mua sắm, hỏi đường, xin giúp đỡ.',
        cau: [
            { id: 'gt1', vi: 'Cho tôi một cốc cà phê.', en: "I'd like a coffee, please.", chap: ['Can I have a coffee, please?', 'Could I have a coffee, please?', "I'd like a coffee.", 'Can I have a coffee?', 'Could I have a coffee?'] },
            { id: 'gt2', vi: 'Tôi muốn lấy cỡ lớn hơn.', en: "I'd like a larger size.", chap: ["I'd like a bigger size.", 'I want a larger size.', 'I want a bigger size.', 'Can I have a larger size?', 'Can I have a bigger size?'] },
            { id: 'gt3', vi: 'Cái này bao nhiêu tiền?', en: 'How much is this?', chap: ['How much does this cost?', 'How much is it?'] },
            { id: 'gt4', vi: 'Bạn có thể giúp tôi không?', en: 'Can you help me?', chap: ['Could you help me?'] },
            { id: 'gt5', vi: 'Bạn có thể chỉ tôi đường đến nhà ga không?', en: 'Can you tell me how to get to the station?', chap: ['Could you tell me how to get to the station?', 'Can you show me the way to the station?', 'Could you show me the way to the station?', 'Can you tell me the way to the station?'] },
            { id: 'gt6', vi: 'Xin lỗi, tôi đến muộn.', en: "Sorry, I'm late.", chap: ["I'm sorry, I'm late.", "Sorry I'm late.", "I'm sorry I'm late."] },
            { id: 'gt7', vi: 'Cuối tuần của tôi rất vui.', en: 'I had a great weekend.', chap: ['I had a good weekend.', 'I had a nice weekend.', 'My weekend was great.', 'My weekend was very fun.', 'My weekend was fun.'] },
            { id: 'gt8', vi: 'Tôi có thể trả bằng thẻ không?', en: 'Can I pay by card?', chap: ['Could I pay by card?', 'Can I pay with a card?', 'Can I pay with card?'] },
            { id: 'gt9', vi: 'Làm ơn cho tôi hoá đơn.', en: 'Can I have the bill, please?', chap: ['Could I have the bill, please?', 'Can I have the check, please?', 'The bill, please.', 'Could I have the check, please?'] },
            { id: 'gt10', vi: 'Tôi đang tìm một chiếc áo khoác.', en: "I'm looking for a jacket.", chap: ["I'm looking for a coat."] },
            { id: 'gt11', vi: 'Hẹn gặp lại tuần sau.', en: 'See you next week.', chap: [] },
            { id: 'gt12', vi: 'Không có gì.', en: "You're welcome.", chap: ['No problem.'] },
        ],
    },
];

/**
 * Thẻ quy tắc của từng khung, hiện khi chẩn đoán cho thấy người học chưa nắm quy tắc.
 * Ví dụ KHÔNG dùng câu trong kho luyện: đọc thẻ xong không được lộ đáp án của lượt sắp làm.
 */
const QUY_TAC = {
    'khung-cau': {
        y: [
            'Câu cần đủ chủ ngữ + động từ. Trước tính từ thường phải có am/is/are.',
            '"Có" chỉ sự tồn tại thì dùng There is/There are, không dùng have.',
            'Hai động từ đi liền nhau thường cần to: want to go, need to buy.',
        ],
        vd: [
            { sai: 'I very tired.', dung: 'I am very tired.' },
            { sai: 'Here have a park.', dung: 'There is a park here.' },
            { sai: 'I want go home.', dung: 'I want to go home.' },
        ],
    },
    'qua-khu': {
        y: [
            'Việc đã xong (yesterday, last week, last night) thì động từ chuyển sang quá khứ.',
            'Thường thêm -ed, nhưng nhiều từ hay dùng đổi hẳn: go → went, see → saw, eat → ate, buy → bought.',
            'Câu phủ định và câu hỏi dùng did, còn động từ giữ nguyên: didn\'t go, Did you go?',
        ],
        vd: [
            { sai: 'I see him on Monday.', dung: 'I saw him on Monday.' },
            { sai: "She didn't came.", dung: "She didn't come." },
            { sai: 'What you ate?', dung: 'What did you eat?' },
        ],
    },
    'tell-say-talk': {
        y: [
            'tell + người: tell me, tell her. Bảo ai làm gì: tell someone to do something.',
            'say + lời nói: say hello, say that... Có người thì dùng say something to someone.',
            'talk to/with + người, talk about + chủ đề: dùng khi trò chuyện qua lại.',
        ],
        vd: [
            { sai: 'She said me the news.', dung: 'She told me the news.' },
            { sai: 'He told that he was tired.', dung: 'He said that he was tired.' },
            { sai: 'I talked him about work.', dung: 'I talked to him about work.' },
        ],
    },
    'mau-giao-tiep': {
        y: [
            "Xin hoặc gọi món: I'd like... hoặc Can I have...? (lịch sự hơn I want).",
            'Nhờ người khác: Can you...? hoặc Could you...? (Could lịch sự hơn).',
            'Học nguyên cụm câu thay vì dịch từng chữ từ tiếng Việt.',
        ],
        vd: [
            { sai: 'Give me water.', dung: 'Can I have some water, please?' },
            { sai: 'You open door for me?', dung: 'Could you open the door for me?' },
            { sai: 'How many money these?', dung: 'How much are these?' },
        ],
    },
};

const TAT_CA = KHUNG.flatMap((k) => k.cau.map((c) => ({ ...c, khung: k.key, tenKhung: k.ten })));
const THEO_ID = new Map(TAT_CA.map((c) => [c.id, c]));

module.exports = { KHUNG, TAT_CA, THEO_ID, QUY_TAC };
