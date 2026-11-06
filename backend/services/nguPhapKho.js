/**
 * KHO LÕI của Công thức ngữ pháp — các chủ điểm cơ bản, viết tay để chắc đúng và tra ngay
 * không tốn AI. Chủ điểm ngoài kho do AI tạo (xem `services/nguPhap.js`).
 *
 * `id` là khoá lưu ví dụ bổ sung — KHÔNG đổi id của mục đã có.
 */
const NHOM = [
    { key: 'thi', ten: 'Các thì' },
    { key: 'cau-truc', ten: 'Cấu trúc câu' },
    { key: 'dong-tu', ten: 'Động từ' },
    { key: 'danh-tu', ten: 'Danh từ & đại từ' },
    { key: 'tinh-tu', ten: 'Tính từ & trạng từ' },
    { key: 'gioi-lien', ten: 'Giới từ & liên từ' },
];

const MUC = [
    // ── Các thì ──
    {
        id: 'hien-tai-don', nhom: 'thi', ten: 'Hiện tại đơn', tuKhoa: 'present simple always usually often every day',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'S + V(s/es)  |  S + am/is/are + ...' },
            { nhan: 'Phủ định', ct: "S + don't/doesn't + V  |  S + am/is/are + not" },
            { nhan: 'Câu hỏi', ct: 'Do/Does + S + V?  |  Am/Is/Are + S + ...?' },
        ],
        dung: ['Thói quen, việc lặp lại.', 'Sự thật, điều luôn đúng.', 'Lịch cố định: tàu xe, giờ học.'],
        vd: [
            { en: 'She walks to work every day.', vi: 'Cô ấy đi bộ đi làm mỗi ngày.' },
            { en: "He doesn't drink coffee.", vi: 'Anh ấy không uống cà phê.' },
            { en: 'The train leaves at nine.', vi: 'Tàu rời đi lúc chín giờ.' },
        ],
        luuY: 'Chủ ngữ he/she/it thì động từ thêm s/es; sau does/doesn\'t động từ về nguyên mẫu.',
    },
    {
        id: 'hien-tai-tiep-dien', nhom: 'thi', ten: 'Hiện tại tiếp diễn', tuKhoa: 'present continuous progressive now at the moment',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'S + am/is/are + V-ing' },
            { nhan: 'Phủ định', ct: 'S + am/is/are + not + V-ing' },
            { nhan: 'Câu hỏi', ct: 'Am/Is/Are + S + V-ing?' },
        ],
        dung: ['Việc đang diễn ra lúc nói.', 'Việc tạm thời trong giai đoạn này.', 'Kế hoạch đã sắp xếp cho tương lai gần.'],
        vd: [
            { en: 'I am reading a book now.', vi: 'Bây giờ tôi đang đọc sách.' },
            { en: 'They are living with their parents this year.', vi: 'Năm nay họ đang sống cùng bố mẹ.' },
            { en: 'We are meeting the client tomorrow.', vi: 'Ngày mai chúng tôi gặp khách hàng.' },
        ],
        luuY: 'Động từ chỉ trạng thái (know, like, want, need) thường không dùng tiếp diễn.',
    },
    {
        id: 'hien-tai-hoan-thanh', nhom: 'thi', ten: 'Hiện tại hoàn thành', tuKhoa: 'present perfect already yet just ever never since for',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'S + have/has + V3' },
            { nhan: 'Phủ định', ct: "S + haven't/hasn't + V3" },
            { nhan: 'Câu hỏi', ct: 'Have/Has + S + V3?' },
        ],
        dung: ['Trải nghiệm, không nói rõ thời điểm.', 'Việc bắt đầu trong quá khứ, còn kéo dài đến nay (for, since).', 'Việc vừa xong, còn ảnh hưởng đến hiện tại.'],
        vd: [
            { en: 'I have visited Japan twice.', vi: 'Tôi đã đến Nhật hai lần.' },
            { en: 'She has worked here since 2020.', vi: 'Cô ấy làm ở đây từ năm 2020.' },
            { en: 'He has just finished lunch.', vi: 'Anh ấy vừa ăn trưa xong.' },
        ],
        luuY: 'Có thời điểm quá khứ cụ thể (yesterday, last week) thì dùng quá khứ đơn.',
    },
    {
        id: 'hien-tai-hoan-thanh-tiep-dien', nhom: 'thi', ten: 'Hiện tại hoàn thành tiếp diễn', tuKhoa: 'present perfect continuous how long',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'S + have/has + been + V-ing' },
            { nhan: 'Phủ định', ct: "S + haven't/hasn't + been + V-ing" },
            { nhan: 'Câu hỏi', ct: 'Have/Has + S + been + V-ing?' },
        ],
        dung: ['Nhấn mạnh quá trình kéo dài đến hiện tại.', 'Việc vừa dừng và còn để lại dấu hiệu.'],
        vd: [
            { en: 'I have been studying English for two years.', vi: 'Tôi đã học tiếng Anh được hai năm.' },
            { en: 'It has been raining all morning.', vi: 'Trời mưa suốt cả sáng.' },
        ],
    },
    {
        id: 'qua-khu-don', nhom: 'thi', ten: 'Quá khứ đơn', tuKhoa: 'past simple yesterday last ago did',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'S + V2/V-ed  |  S + was/were + ...' },
            { nhan: 'Phủ định', ct: "S + didn't + V  |  S + wasn't/weren't" },
            { nhan: 'Câu hỏi', ct: 'Did + S + V?  |  Was/Were + S + ...?' },
        ],
        dung: ['Việc đã xảy ra và kết thúc ở thời điểm xác định trong quá khứ.', 'Chuỗi việc nối tiếp nhau khi kể chuyện.'],
        vd: [
            { en: 'We moved to Hanoi in 2019.', vi: 'Chúng tôi chuyển đến Hà Nội năm 2019.' },
            { en: "She didn't call me.", vi: 'Cô ấy đã không gọi cho tôi.' },
            { en: 'What did you buy?', vi: 'Bạn đã mua gì?' },
        ],
        luuY: "Sau did/didn't động từ về nguyên mẫu: didn't go, không phải didn't went.",
    },
    {
        id: 'qua-khu-tiep-dien', nhom: 'thi', ten: 'Quá khứ tiếp diễn', tuKhoa: 'past continuous progressive while when',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'S + was/were + V-ing' },
            { nhan: 'Phủ định', ct: "S + wasn't/weren't + V-ing" },
            { nhan: 'Câu hỏi', ct: 'Was/Were + S + V-ing?' },
        ],
        dung: ['Việc đang diễn ra tại một thời điểm trong quá khứ.', 'Việc đang diễn ra thì có việc khác xen vào (when + quá khứ đơn).'],
        vd: [
            { en: 'I was cooking at 7 p.m.', vi: 'Lúc 7 giờ tối tôi đang nấu ăn.' },
            { en: 'She was sleeping when the phone rang.', vi: 'Cô ấy đang ngủ thì điện thoại reo.' },
        ],
    },
    {
        id: 'qua-khu-hoan-thanh', nhom: 'thi', ten: 'Quá khứ hoàn thành', tuKhoa: 'past perfect had before after by the time',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'S + had + V3' },
            { nhan: 'Phủ định', ct: "S + hadn't + V3" },
            { nhan: 'Câu hỏi', ct: 'Had + S + V3?' },
        ],
        dung: ['Việc xảy ra trước một việc hoặc mốc khác trong quá khứ.'],
        vd: [
            { en: 'The bus had left when we arrived.', vi: 'Xe buýt đã rời đi khi chúng tôi đến.' },
            { en: "I hadn't seen that film before.", vi: 'Trước đó tôi chưa xem phim ấy.' },
        ],
    },
    {
        id: 'tuong-lai-don', nhom: 'thi', ten: 'Tương lai đơn (will)', tuKhoa: 'future simple will tomorrow next',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'S + will + V' },
            { nhan: 'Phủ định', ct: "S + won't + V" },
            { nhan: 'Câu hỏi', ct: 'Will + S + V?' },
        ],
        dung: ['Quyết định ngay lúc nói.', 'Dự đoán theo ý kiến cá nhân.', 'Lời hứa, đề nghị giúp đỡ.'],
        vd: [
            { en: "I'll answer the phone.", vi: 'Để tôi nghe điện thoại.' },
            { en: 'I think it will be sunny.', vi: 'Tôi nghĩ trời sẽ nắng.' },
            { en: "I won't forget.", vi: 'Tôi sẽ không quên.' },
        ],
    },
    {
        id: 'be-going-to', nhom: 'thi', ten: 'Tương lai gần (be going to)', tuKhoa: 'near future going to gonna plan',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'S + am/is/are + going to + V' },
            { nhan: 'Phủ định', ct: 'S + am/is/are + not + going to + V' },
            { nhan: 'Câu hỏi', ct: 'Am/Is/Are + S + going to + V?' },
        ],
        dung: ['Dự định đã có từ trước.', 'Dự đoán dựa trên dấu hiệu đang thấy.'],
        vd: [
            { en: 'We are going to buy a new house.', vi: 'Chúng tôi định mua nhà mới.' },
            { en: 'Look at those clouds. It is going to rain.', vi: 'Nhìn mây kìa. Trời sắp mưa rồi.' },
        ],
    },
    {
        id: 'tuong-lai-tiep-dien', nhom: 'thi', ten: 'Tương lai tiếp diễn', tuKhoa: 'future continuous will be',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'S + will be + V-ing' },
            { nhan: 'Phủ định', ct: "S + won't be + V-ing" },
            { nhan: 'Câu hỏi', ct: 'Will + S + be + V-ing?' },
        ],
        dung: ['Việc sẽ đang diễn ra tại một thời điểm trong tương lai.'],
        vd: [{ en: 'This time tomorrow, I will be flying to Da Nang.', vi: 'Giờ này ngày mai tôi sẽ đang bay đến Đà Nẵng.' }],
    },
    {
        id: 'tuong-lai-hoan-thanh', nhom: 'thi', ten: 'Tương lai hoàn thành', tuKhoa: 'future perfect will have by',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'S + will have + V3' },
            { nhan: 'Phủ định', ct: "S + won't have + V3" },
            { nhan: 'Câu hỏi', ct: 'Will + S + have + V3?' },
        ],
        dung: ['Việc sẽ hoàn thành trước một mốc trong tương lai (thường có by).'],
        vd: [{ en: 'By Friday, I will have finished the report.', vi: 'Trước thứ Sáu tôi sẽ làm xong báo cáo.' }],
    },

    // ── Cấu trúc câu ──
    {
        id: 'there-is-are', nhom: 'cau-truc', ten: 'There is / There are', tuKhoa: 'co ton tai there',
        congThuc: [
            { nhan: 'Số ít', ct: 'There is + a/an + danh từ số ít' },
            { nhan: 'Số nhiều', ct: 'There are + danh từ số nhiều' },
            { nhan: 'Không đếm được', ct: 'There is + danh từ không đếm được' },
        ],
        dung: ['Nói một thứ gì đó tồn tại ở đâu: tiếng Việt thường là "có".'],
        vd: [
            { en: 'There is a pharmacy near my house.', vi: 'Có một hiệu thuốc gần nhà tôi.' },
            { en: 'There are two windows in this room.', vi: 'Phòng này có hai cửa sổ.' },
        ],
        luuY: 'Không dùng "have" để nói một nơi có gì: không nói "Here have a park".',
    },
    {
        id: 'cau-hoi-wh', nhom: 'cau-truc', ten: 'Câu hỏi với từ để hỏi', tuKhoa: 'wh question what where when why how who dao ngu',
        congThuc: [
            { nhan: 'Có trợ động từ', ct: 'Wh- + trợ động từ + S + V?' },
            { nhan: 'Hỏi chủ ngữ', ct: 'Who/What + V?' },
        ],
        dung: ['Đặt từ để hỏi lên đầu, rồi đảo trợ động từ lên trước chủ ngữ.'],
        vd: [
            { en: 'Where do you work?', vi: 'Bạn làm ở đâu?' },
            { en: 'Why did she leave?', vi: 'Vì sao cô ấy rời đi?' },
            { en: 'Who called you?', vi: 'Ai đã gọi cho bạn?' },
        ],
    },
    {
        id: 'bi-dong', nhom: 'cau-truc', ten: 'Câu bị động', tuKhoa: 'passive voice bi dong by',
        congThuc: [
            { nhan: 'Chung', ct: 'S + be (chia theo thì) + V3 + (by O)' },
            { nhan: 'Hiện tại đơn', ct: 'S + am/is/are + V3' },
            { nhan: 'Quá khứ đơn', ct: 'S + was/were + V3' },
            { nhan: 'Tương lai', ct: 'S + will be + V3' },
            { nhan: 'Hoàn thành', ct: 'S + have/has been + V3' },
            { nhan: 'Với modal', ct: 'S + modal + be + V3' },
        ],
        dung: ['Khi hành động hoặc đối tượng chịu tác động quan trọng hơn người làm.'],
        vd: [
            { en: 'This bridge was built in 1990.', vi: 'Cây cầu này được xây năm 1990.' },
            { en: 'The report will be sent tomorrow.', vi: 'Báo cáo sẽ được gửi vào ngày mai.' },
        ],
    },
    {
        id: 'dieu-kien', nhom: 'cau-truc', ten: 'Câu điều kiện loại 0, 1, 2, 3', tuKhoa: 'conditional if unless neu',
        congThuc: [
            { nhan: 'Loại 0: sự thật', ct: 'If + hiện tại đơn, hiện tại đơn' },
            { nhan: 'Loại 1: có thể xảy ra', ct: 'If + hiện tại đơn, will + V' },
            { nhan: 'Loại 2: trái hiện tại', ct: 'If + quá khứ đơn, would + V' },
            { nhan: 'Loại 3: trái quá khứ', ct: 'If + had + V3, would have + V3' },
        ],
        dung: ['Loại càng cao, điều nói đến càng xa thực tế.', 'Mệnh đề if đứng đầu thì có dấu phẩy.'],
        vd: [
            { en: 'If you heat ice, it melts.', vi: 'Nếu đun nóng đá, nó tan.' },
            { en: 'If it rains, I will stay home.', vi: 'Nếu trời mưa, tôi sẽ ở nhà.' },
            { en: 'If I had more time, I would travel.', vi: 'Nếu có nhiều thời gian hơn, tôi sẽ đi du lịch.' },
            { en: 'If she had studied, she would have passed.', vi: 'Nếu đã học bài, cô ấy đã đỗ rồi.' },
        ],
        luuY: 'Trong mệnh đề if loại 1 không dùng will: không nói "If it will rain".',
    },
    {
        id: 'tuong-thuat', nhom: 'cau-truc', ten: 'Câu tường thuật', tuKhoa: 'reported speech indirect said told gian tiep',
        congThuc: [
            { nhan: 'Câu kể', ct: 'S + said (that) + S + V lùi thì' },
            { nhan: 'Có người nghe', ct: 'S + told + O + (that) + S + V lùi thì' },
            { nhan: 'Mệnh lệnh', ct: 'S + told + O + (not) to + V' },
            { nhan: 'Câu hỏi', ct: 'S + asked + (O) + if/từ để hỏi + S + V lùi thì' },
        ],
        dung: ['Thuật lại lời người khác. Động từ tường thuật ở quá khứ thì thường lùi một thì.'],
        vd: [
            { en: 'He said that he was tired.', vi: 'Anh ấy nói rằng anh ấy mệt.' },
            { en: 'She told me to wait.', vi: 'Cô ấy bảo tôi đợi.' },
            { en: 'They asked if I lived nearby.', vi: 'Họ hỏi tôi có sống gần đây không.' },
        ],
        luuY: 'Câu hỏi tường thuật không đảo ngữ: asked where I lived, không phải where did I live.',
    },
    {
        id: 'menh-de-quan-he', nhom: 'cau-truc', ten: 'Mệnh đề quan hệ', tuKhoa: 'relative clause who which that whose where',
        congThuc: [
            { nhan: 'Chỉ người', ct: 'N + who/that + V' },
            { nhan: 'Chỉ vật', ct: 'N + which/that + V' },
            { nhan: 'Sở hữu', ct: 'N + whose + N + V' },
            { nhan: 'Nơi chốn', ct: 'N + where + S + V' },
        ],
        dung: ['Bổ sung thông tin cho danh từ đứng trước.'],
        vd: [
            { en: 'The man who called you is my boss.', vi: 'Người đàn ông gọi cho bạn là sếp tôi.' },
            { en: 'This is the phone that I bought.', vi: 'Đây là chiếc điện thoại tôi đã mua.' },
            { en: 'That is the café where we met.', vi: 'Đó là quán cà phê nơi chúng tôi gặp nhau.' },
        ],
    },
    {
        id: 'cau-uoc', nhom: 'cau-truc', ten: 'Câu ước với wish', tuKhoa: 'wish uoc',
        congThuc: [
            { nhan: 'Hiện tại', ct: 'S + wish + S + quá khứ đơn' },
            { nhan: 'Quá khứ', ct: 'S + wish + S + had + V3' },
            { nhan: 'Tương lai', ct: 'S + wish + S + would + V' },
        ],
        dung: ['Mong điều khác với thực tế.'],
        vd: [
            { en: 'I wish I had a car.', vi: 'Ước gì tôi có ô tô.' },
            { en: 'I wish I had studied harder.', vi: 'Ước gì tôi đã học chăm hơn.' },
        ],
    },

    // ── Động từ ──
    {
        id: 'modal', nhom: 'dong-tu', ten: 'Động từ khuyết thiếu', tuKhoa: 'modal verbs can could must should may might',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'S + modal + V' },
            { nhan: 'Phủ định', ct: 'S + modal + not + V' },
            { nhan: 'Câu hỏi', ct: 'Modal + S + V?' },
        ],
        dung: ['can/could: khả năng, xin phép, đề nghị.', 'should: lời khuyên.', 'must/have to: bắt buộc.', 'may/might: có thể xảy ra.'],
        vd: [
            { en: 'Can you help me?', vi: 'Bạn giúp tôi được không?' },
            { en: 'You should see a doctor.', vi: 'Bạn nên đi khám bác sĩ.' },
            { en: 'It might rain later.', vi: 'Lát nữa trời có thể mưa.' },
        ],
        luuY: "Sau modal là động từ nguyên mẫu, không thêm to hay s. Mustn't là cấm; don't have to là không cần.",
    },
    {
        id: 'to-v-v-ing', nhom: 'dong-tu', ten: 'To V và V-ing', tuKhoa: 'gerund infinitive want enjoy dong tu nguyen mau',
        congThuc: [
            { nhan: 'Sau động từ + to V', ct: 'want, need, decide, plan, hope, agree + to V' },
            { nhan: 'Sau động từ + V-ing', ct: 'enjoy, avoid, finish, mind, suggest, keep + V-ing' },
            { nhan: 'Sau giới từ', ct: 'giới từ + V-ing' },
        ],
        dung: ['Tuỳ động từ đứng trước mà động từ sau ở dạng to V hoặc V-ing.'],
        vd: [
            { en: 'I want to learn English.', vi: 'Tôi muốn học tiếng Anh.' },
            { en: 'She enjoys cooking.', vi: 'Cô ấy thích nấu ăn.' },
            { en: 'He is good at drawing.', vi: 'Anh ấy giỏi vẽ.' },
        ],
    },
    {
        id: 'tell-say-talk', nhom: 'dong-tu', ten: 'Tell, say, talk, speak', tuKhoa: 'noi bao ke',
        congThuc: [
            { nhan: 'Tell', ct: 'tell + người + (điều gì)  |  tell + người + to V' },
            { nhan: 'Say', ct: 'say + điều gì  |  say + điều gì + to + người' },
            { nhan: 'Talk', ct: 'talk to/with + người  |  talk about + chủ đề' },
            { nhan: 'Speak', ct: 'speak + ngôn ngữ  |  speak to + người' },
        ],
        dung: ['Tell luôn có người nghe ngay sau; say tập trung vào lời nói; talk là trò chuyện qua lại.'],
        vd: [
            { en: 'She told me the news.', vi: 'Cô ấy kể cho tôi tin đó.' },
            { en: 'He said that he was tired.', vi: 'Anh ấy nói rằng anh ấy mệt.' },
            { en: 'I talked to him about work.', vi: 'Tôi đã nói chuyện với anh ấy về công việc.' },
        ],
    },
    {
        id: 'used-to', nhom: 'dong-tu', ten: 'Used to và be used to', tuKhoa: 'thoi quen quen',
        congThuc: [
            { nhan: 'Từng làm', ct: 'S + used to + V' },
            { nhan: 'Đã quen với', ct: 'S + be/get used to + V-ing/N' },
        ],
        dung: ['used to: thói quen trong quá khứ, nay không còn.', 'be used to: đã quen với việc gì.'],
        vd: [
            { en: 'I used to play football.', vi: 'Tôi từng chơi bóng đá.' },
            { en: 'I am used to getting up early.', vi: 'Tôi đã quen dậy sớm.' },
        ],
    },

    // ── Danh từ & đại từ ──
    {
        id: 'mao-tu', nhom: 'danh-tu', ten: 'Mạo từ a, an, the', tuKhoa: 'article mao tu',
        congThuc: [
            { nhan: 'A', ct: 'a + danh từ số ít bắt đầu bằng phụ âm (theo cách đọc)' },
            { nhan: 'An', ct: 'an + danh từ số ít bắt đầu bằng nguyên âm (theo cách đọc)' },
            { nhan: 'The', ct: 'the + danh từ đã xác định' },
            { nhan: 'Không mạo từ', ct: 'danh từ số nhiều/không đếm được nói chung' },
        ],
        dung: ['Nhắc lần đầu dùng a/an, nhắc lại dùng the.', 'Thứ duy nhất dùng the: the sun, the internet.'],
        vd: [
            { en: 'I saw a dog. The dog was very small.', vi: 'Tôi thấy một con chó. Con chó ấy rất nhỏ.' },
            { en: 'She has an hour for lunch.', vi: 'Cô ấy có một giờ để ăn trưa.' },
            { en: 'I like music.', vi: 'Tôi thích âm nhạc.' },
        ],
        luuY: 'Xét theo âm đọc chứ không theo chữ cái: an hour, a university.',
    },
    {
        id: 'dem-duoc', nhom: 'danh-tu', ten: 'Danh từ đếm được và lượng từ', tuKhoa: 'countable uncountable much many some any few little so nhieu',
        congThuc: [
            { nhan: 'Đếm được', ct: 'many / a few / few + danh từ số nhiều' },
            { nhan: 'Không đếm được', ct: 'much / a little / little + danh từ không đếm được' },
            { nhan: 'Cả hai', ct: 'a lot of / some / any + danh từ' },
        ],
        dung: ['some thường dùng trong câu khẳng định và lời mời; any trong câu phủ định và câu hỏi.', 'a few/a little: có một ít; few/little: rất ít, gần như không đủ.'],
        vd: [
            { en: 'How many books do you have?', vi: 'Bạn có bao nhiêu quyển sách?' },
            { en: "I don't have much money.", vi: 'Tôi không có nhiều tiền.' },
            { en: 'There is a little milk left.', vi: 'Còn một ít sữa.' },
        ],
        luuY: 'Information, advice, furniture, luggage không đếm được và không thêm s.',
    },
    {
        id: 'dai-tu', nhom: 'danh-tu', ten: 'Đại từ và tính từ sở hữu', tuKhoa: 'pronoun possessive me him her them my your',
        congThuc: [
            { nhan: 'Chủ ngữ', ct: 'I, you, he, she, it, we, they' },
            { nhan: 'Tân ngữ', ct: 'me, you, him, her, it, us, them' },
            { nhan: 'Tính từ sở hữu', ct: 'my, your, his, her, its, our, their + N' },
            { nhan: 'Đại từ sở hữu', ct: 'mine, yours, his, hers, ours, theirs' },
        ],
        dung: ['Đứng trước động từ dùng dạng chủ ngữ; sau động từ hoặc giới từ dùng dạng tân ngữ.'],
        vd: [
            { en: 'I saw them at the station.', vi: 'Tôi đã thấy họ ở nhà ga.' },
            { en: 'This bag is mine.', vi: 'Cái túi này là của tôi.' },
        ],
    },

    // ── Tính từ & trạng từ ──
    {
        id: 'so-sanh', nhom: 'tinh-tu', ten: 'So sánh bằng, hơn, nhất', tuKhoa: 'comparative superlative than as most',
        congThuc: [
            { nhan: 'Bằng', ct: 'as + adj/adv + as' },
            { nhan: 'Hơn, từ ngắn', ct: 'adj-er + than' },
            { nhan: 'Hơn, từ dài', ct: 'more + adj + than' },
            { nhan: 'Nhất, từ ngắn', ct: 'the + adj-est' },
            { nhan: 'Nhất, từ dài', ct: 'the most + adj' },
        ],
        dung: ['Bất quy tắc: good → better → the best; bad → worse → the worst; far → farther → the farthest.'],
        vd: [
            { en: 'This bag is as heavy as that one.', vi: 'Túi này nặng bằng túi kia.' },
            { en: 'Today is hotter than yesterday.', vi: 'Hôm nay nóng hơn hôm qua.' },
            { en: 'This is the most expensive hotel here.', vi: 'Đây là khách sạn đắt nhất ở đây.' },
        ],
    },
    {
        id: 'tinh-trang-tu', nhom: 'tinh-tu', ten: 'Tính từ và trạng từ', tuKhoa: 'adjective adverb ly',
        congThuc: [
            { nhan: 'Tính từ', ct: 'adj + N  |  be/look/feel + adj' },
            { nhan: 'Trạng từ', ct: 'V + adv  |  adv + adj' },
        ],
        dung: ['Tính từ bổ nghĩa cho danh từ; trạng từ bổ nghĩa cho động từ hoặc tính từ.'],
        vd: [
            { en: 'She is a careful driver.', vi: 'Cô ấy là người lái xe cẩn thận.' },
            { en: 'She drives carefully.', vi: 'Cô ấy lái xe cẩn thận.' },
        ],
        luuY: 'Bất quy tắc: good → well; fast → fast; hard → hard.',
    },
    {
        id: 'so-too-enough', nhom: 'tinh-tu', ten: 'So...that, too, enough', tuKhoa: 'qua den noi du',
        congThuc: [
            { nhan: 'Quá...đến nỗi', ct: 'so + adj + that + S + V' },
            { nhan: 'Quá...không thể', ct: 'too + adj + to V' },
            { nhan: 'Đủ...để', ct: 'adj + enough + to V  |  enough + N + to V' },
        ],
        dung: ['too mang nghĩa quá mức, thường là không làm được.'],
        vd: [
            { en: 'It was so hot that we stayed inside.', vi: 'Trời nóng đến nỗi chúng tôi ở trong nhà.' },
            { en: 'This box is too heavy to carry.', vi: 'Hộp này quá nặng để mang.' },
            { en: 'He is old enough to drive.', vi: 'Anh ấy đủ tuổi để lái xe.' },
        ],
    },

    // ── Giới từ & liên từ ──
    {
        id: 'in-on-at-thoi-gian', nhom: 'gioi-lien', ten: 'In, on, at chỉ thời gian', tuKhoa: 'preposition time gioi tu',
        congThuc: [
            { nhan: 'In', ct: 'in + tháng, năm, mùa, buổi: in May, in the morning' },
            { nhan: 'On', ct: 'on + thứ, ngày: on Monday, on May 5th' },
            { nhan: 'At', ct: 'at + giờ, thời điểm: at 7 a.m., at night' },
        ],
        dung: ['Từ khoảng dài đến điểm cụ thể: in → on → at.'],
        vd: [
            { en: 'We met in 2021.', vi: 'Chúng tôi gặp nhau năm 2021.' },
            { en: 'The meeting is on Friday at 9 a.m.', vi: 'Cuộc họp vào thứ Sáu lúc 9 giờ sáng.' },
        ],
    },
    {
        id: 'in-on-at-noi-chon', nhom: 'gioi-lien', ten: 'In, on, at chỉ nơi chốn', tuKhoa: 'preposition place gioi tu',
        congThuc: [
            { nhan: 'In', ct: 'in + không gian bao quanh: in a room, in Hanoi' },
            { nhan: 'On', ct: 'on + bề mặt: on the table, on the wall' },
            { nhan: 'At', ct: 'at + địa điểm cụ thể: at the door, at work' },
        ],
        dung: ['Hình dung vị trí: bên trong, trên bề mặt, hay tại một điểm.'],
        vd: [
            { en: 'The keys are on the table.', vi: 'Chìa khoá ở trên bàn.' },
            { en: 'She is at the airport.', vi: 'Cô ấy đang ở sân bay.' },
        ],
    },
    {
        id: 'lien-tu', nhom: 'gioi-lien', ten: 'Because, although, so, but', tuKhoa: 'conjunction vi mac du nen nhung because of despite',
        congThuc: [
            { nhan: 'Lý do', ct: 'because + S + V  |  because of + N/V-ing' },
            { nhan: 'Tương phản', ct: 'although + S + V  |  despite + N/V-ing' },
            { nhan: 'Kết quả', ct: 'S + V, so + S + V' },
        ],
        dung: ['Tiếng Anh không dùng cặp although...but hay because...so trong cùng một câu.'],
        vd: [
            { en: 'I stayed home because it was raining.', vi: 'Tôi ở nhà vì trời mưa.' },
            { en: 'Although she was tired, she kept working.', vi: 'Dù mệt, cô ấy vẫn làm việc tiếp.' },
            { en: 'It was late, so we left.', vi: 'Đã muộn nên chúng tôi về.' },
        ],
    },
];

const THEO_ID = new Map(MUC.map((m) => [m.id, m]));

module.exports = { NHOM, MUC, THEO_ID };
