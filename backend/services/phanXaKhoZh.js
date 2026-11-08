/**
 * KHO CÂU PHẢN XẠ TIẾNG TRUNG — nhìn câu tiếng Việt, nói/gõ câu tiếng Trung.
 *
 * Cùng định dạng kho tiếng Anh (`phanXaKho.js`): `en` là câu ngoại ngữ (ở đây là chữ Hán
 * giản thể), `py` là pinyin có dấu thanh (đã biến điệu 一/不), `chap` là cách nói khác
 * cũng đúng — so sau khi bỏ dấu câu và khoảng trắng.
 *
 * Bốn khung lấy từ lỗi người Việt hay mắc nhất: đặt thời gian/nơi chốn SAU động từ như
 * tiếng Việt, dùng sai 了/过/没, quên lượng từ, thiếu mẫu câu giao tiếp.
 *
 * `id` bắt đầu bằng `zh-` và là khoá lưu tiến độ — KHÔNG đổi id của câu đã có.
 */
const c = (id, vi, en, py, chap = []) => ({ id, vi, en, py, chap });

const KHUNG_ZH = [
    {
        key: 'zh-trat-tu', ten: 'Trật tự câu', icon: 'fa-arrow-down-short-wide',
        moTa: 'Thời gian và nơi chốn đứng TRƯỚC động từ: 我明天在家学习.',
        cau: [
            c('zh-tt1', 'Ngày mai tôi học ở nhà.', '我明天在家学习。', 'Wǒ míngtiān zài jiā xuéxí.', ['明天我在家学习。']),
            c('zh-tt2', 'Tôi làm việc ở ngân hàng.', '我在银行工作。', 'Wǒ zài yínháng gōngzuò.'),
            c('zh-tt3', 'Tối nay chúng ta ăn cơm ở nhà hàng.', '我们今天晚上在饭馆吃饭。', 'Wǒmen jīntiān wǎnshang zài fànguǎn chī fàn.',
                ['今天晚上我们在饭馆吃饭。', '我们今晚在饭馆吃饭。', '今晚我们在饭馆吃饭。']),
            c('zh-tt4', 'Hằng ngày tôi đi làm bằng xe buýt.', '我每天坐公共汽车上班。', 'Wǒ měitiān zuò gōnggòng qìchē shàngbān.',
                ['我每天坐公交车上班。', '每天我坐公共汽车上班。', '每天我坐公交车上班。']),
            c('zh-tt5', 'Anh ấy đang đọc sách ở thư viện.', '他在图书馆看书。', 'Tā zài túshūguǎn kàn shū.', ['他正在图书馆看书。']),
            c('zh-tt6', 'Tôi thường uống cà phê ở quán này.', '我常常在这家咖啡馆喝咖啡。', 'Wǒ chángcháng zài zhè jiā kāfēiguǎn hē kāfēi.',
                ['我常在这家咖啡馆喝咖啡。', '我经常在这家咖啡馆喝咖啡。']),
            c('zh-tt7', 'Cuối tuần bạn làm gì?', '你周末做什么？', 'Nǐ zhōumò zuò shénme?', ['周末你做什么？', '你周末干什么？', '周末你干什么？']),
            c('zh-tt8', 'Bạn sống ở đâu?', '你住在哪儿？', 'Nǐ zhù zài nǎr?', ['你住哪儿？', '你住在哪里？', '你住哪里？']),
            c('zh-tt9', 'Chiều nay tôi gọi điện cho bạn.', '我今天下午给你打电话。', 'Wǒ jīntiān xiàwǔ gěi nǐ dǎ diànhuà.', ['今天下午我给你打电话。']),
            c('zh-tt10', 'Tôi mua rau ở chợ.', '我在市场买菜。', 'Wǒ zài shìchǎng mǎi cài.', ['我在菜市场买菜。']),
            c('zh-tt11', 'Chúng tôi học tiếng Trung với cô giáo Vương.', '我们跟王老师学习汉语。', 'Wǒmen gēn Wáng lǎoshī xuéxí Hànyǔ.',
                ['我们跟王老师学汉语。', '我们跟王老师学中文。', '我们跟王老师学习中文。']),
            c('zh-tt12', 'Mấy giờ bạn tan làm?', '你几点下班？', 'Nǐ jǐ diǎn xiàbān?'),
        ],
    },
    {
        key: 'zh-da-lam', ten: 'Đã làm, đã từng', icon: 'fa-clock-rotate-left',
        moTa: 'Đã xong: V + 了. Đã từng: V + 过. Đã không làm: 没 + V (bỏ 了).',
        cau: [
            c('zh-dl1', 'Tôi đã ăn sáng rồi.', '我吃早饭了。', 'Wǒ chī zǎofàn le.', ['我已经吃早饭了。', '我吃过早饭了。', '我已经吃过早饭了。']),
            c('zh-dl2', 'Hôm qua tôi đã không đi làm.', '我昨天没去上班。', 'Wǒ zuótiān méi qù shàngbān.', ['昨天我没去上班。']),
            c('zh-dl3', 'Bạn đã từng đến Bắc Kinh chưa?', '你去过北京吗？', 'Nǐ qùguo Běijīng ma?', ['你去过北京没有？']),
            c('zh-dl4', 'Tôi chưa từng ăn vịt quay.', '我没吃过烤鸭。', 'Wǒ méi chīguo kǎoyā.', ['我从来没吃过烤鸭。', '我还没吃过烤鸭。']),
            c('zh-dl5', 'Hôm qua tôi mua ba quyển sách.', '我昨天买了三本书。', 'Wǒ zuótiān mǎile sān běn shū.', ['昨天我买了三本书。']),
            c('zh-dl6', 'Trời mưa rồi.', '下雨了。', 'Xià yǔ le.'),
            c('zh-dl7', 'Anh ấy về nhà rồi.', '他回家了。', 'Tā huí jiā le.', ['他已经回家了。']),
            c('zh-dl8', 'Bạn ăn cơm chưa?', '你吃饭了吗？', 'Nǐ chī fàn le ma?', ['你吃饭了没有？', '你吃了吗？', '你吃饭没有？']),
            c('zh-dl9', 'Tôi chưa làm xong bài tập.', '我还没做完作业。', 'Wǒ hái méi zuòwán zuòyè.', ['我没做完作业。', '我作业还没做完。']),
            c('zh-dl10', 'Tôi đã từng học tiếng Anh.', '我学过英语。', 'Wǒ xuéguo Yīngyǔ.'),
            c('zh-dl11', 'Sáng nay cô ấy không gọi điện cho tôi.', '她今天早上没给我打电话。', 'Tā jīntiān zǎoshang méi gěi wǒ dǎ diànhuà.',
                ['今天早上她没给我打电话。']),
            c('zh-dl12', 'Tôi đến được ba ngày rồi.', '我来了三天了。', 'Wǒ láile sān tiān le.'),
        ],
    },
    {
        key: 'zh-luong-tu', ten: 'Lượng từ & số đếm', icon: 'fa-list-ol',
        moTa: 'Số / 这 / 那 + lượng từ + danh từ. Đếm "hai" dùng 两, không dùng 二.',
        cau: [
            c('zh-lt1', 'Tôi muốn một cốc cà phê.', '我要一杯咖啡。', 'Wǒ yào yì bēi kāfēi.', ['我想要一杯咖啡。']),
            c('zh-lt2', 'Nhà tôi có bốn người.', '我家有四口人。', 'Wǒ jiā yǒu sì kǒu rén.', ['我家有四个人。']),
            c('zh-lt3', 'Tôi có hai người bạn Trung Quốc.', '我有两个中国朋友。', 'Wǒ yǒu liǎng ge Zhōngguó péngyou.'),
            c('zh-lt4', 'Cái áo này bao nhiêu tiền?', '这件衣服多少钱？', 'Zhè jiàn yīfu duōshao qián?'),
            c('zh-lt5', 'Cho tôi hai bát cơm.', '请给我两碗米饭。', 'Qǐng gěi wǒ liǎng wǎn mǐfàn.', ['给我两碗米饭。', '请给我两碗饭。', '给我两碗饭。', '来两碗米饭。']),
            c('zh-lt6', 'Trên bàn có một quyển sách.', '桌子上有一本书。', 'Zhuōzi shang yǒu yì běn shū.'),
            c('zh-lt7', 'Anh ấy nuôi một con mèo.', '他养了一只猫。', 'Tā yǎngle yì zhī māo.', ['他养一只猫。']),
            c('zh-lt8', 'Tôi muốn mua một tấm vé.', '我想买一张票。', 'Wǒ xiǎng mǎi yì zhāng piào.', ['我要买一张票。']),
            c('zh-lt9', 'Lớp chúng tôi có hai mươi học sinh.', '我们班有二十个学生。', 'Wǒmen bān yǒu èrshí ge xuésheng.'),
            c('zh-lt10', 'Chiếc xe đạp đó là của tôi.', '那辆自行车是我的。', 'Nà liàng zìxíngchē shì wǒ de.'),
            c('zh-lt11', 'Mỗi tháng tôi đọc hai quyển sách.', '我每个月看两本书。', 'Wǒ měi ge yuè kàn liǎng běn shū.', ['我每个月读两本书。', '每个月我看两本书。']),
            c('zh-lt12', 'Bạn có mấy anh chị em?', '你有几个兄弟姐妹？', 'Nǐ yǒu jǐ ge xiōngdì jiěmèi?'),
        ],
    },
    {
        key: 'zh-giao-tiep', ten: 'Mẫu câu giao tiếp', icon: 'fa-comments',
        moTa: 'Câu dùng hằng ngày khi chào hỏi, mua sắm, gọi món, nhờ giúp đỡ.',
        cau: [
            c('zh-gt1', 'Rất vui được làm quen với bạn.', '很高兴认识你。', 'Hěn gāoxìng rènshi nǐ.', ['认识你很高兴。', '很高兴见到你。', '见到你很高兴。']),
            c('zh-gt2', 'Cái này bao nhiêu tiền?', '这个多少钱？', 'Zhège duōshao qián?'),
            c('zh-gt3', 'Có thể rẻ hơn một chút không?', '能便宜一点儿吗？', 'Néng piányi yìdiǎnr ma?', ['能便宜一点吗？', '可以便宜一点儿吗？', '可以便宜一点吗？']),
            c('zh-gt4', 'Nhà vệ sinh ở đâu?', '洗手间在哪儿？', 'Xǐshǒujiān zài nǎr?', ['洗手间在哪里？', '厕所在哪儿？', '厕所在哪里？', '卫生间在哪儿？', '卫生间在哪里？']),
            c('zh-gt5', 'Bạn có thể nói chậm một chút không?', '你能说慢一点儿吗？', 'Nǐ néng shuō màn yìdiǎnr ma?',
                ['你能说慢一点吗？', '你可以说慢一点儿吗？', '你可以说慢一点吗？', '请说慢一点儿。', '请说慢一点。']),
            c('zh-gt6', 'Xin lỗi, tôi đến muộn.', '对不起，我来晚了。', 'Duìbuqǐ, wǒ lái wǎn le.', ['不好意思，我来晚了。', '对不起，我迟到了。', '不好意思，我迟到了。']),
            c('zh-gt7', 'Tôi có thể trả bằng thẻ không?', '我可以刷卡吗？', 'Wǒ kěyǐ shuā kǎ ma?', ['可以刷卡吗？', '能刷卡吗？', '我能刷卡吗？']),
            c('zh-gt8', 'Làm ơn tính tiền.', '请买单。', 'Qǐng mǎidān.', ['买单。', '结账。', '请结账。', '服务员，买单。', '服务员，结账。']),
            c('zh-gt9', 'Tôi không hiểu.', '我不明白。', 'Wǒ bù míngbai.', ['我不懂。', '我听不懂。']),
            c('zh-gt10', 'Cảm ơn bạn đã giúp đỡ.', '谢谢你的帮助。', 'Xièxie nǐ de bāngzhù.', ['谢谢您的帮助。']),
            c('zh-gt11', 'Hẹn gặp lại ngày mai.', '明天见。', 'Míngtiān jiàn.'),
            c('zh-gt12', 'Không có gì.', '不客气。', 'Bú kèqi.', ['不用谢。']),
        ],
    },
];

/**
 * Thẻ quy tắc từng khung. Ví dụ KHÔNG dùng câu trong kho luyện: đọc thẻ xong không được lộ
 * đáp án của lượt sắp làm.
 */
const QUY_TAC_ZH = {
    'zh-trat-tu': {
        y: [
            'Khung chung: chủ ngữ + thời gian + 在 + nơi chốn + động từ + tân ngữ.',
            'Thời gian có thể đứng đầu câu (明天我…), nhưng không bao giờ đứng sau động từ.',
            'Từ để hỏi đứng đúng chỗ của câu trả lời, không đưa lên đầu câu: 你去哪儿？',
        ],
        vd: [
            { sai: '我工作在医院。', dung: '我在医院工作。' },
            { sai: '我看电影晚上。', dung: '我晚上看电影。' },
            { sai: '哪儿你去？', dung: '你去哪儿？' },
        ],
    },
    'zh-da-lam': {
        y: [
            'Việc đã xong: động từ + 了 (thường kèm số lượng): 我喝了两杯水.',
            'Đã từng (trải nghiệm): động từ + 过: 我看过这本书.',
            'Đã không làm, chưa làm: 没 + động từ, và BỎ 了 (nhưng giữ 过).',
        ],
        vd: [
            { sai: '我昨天没看了电视。', dung: '我昨天没看电视。' },
            { sai: '我昨天不去学校。', dung: '我昨天没去学校。' },
            { sai: '我没去了过上海。', dung: '我没去过上海。' },
        ],
    },
    'zh-luong-tu': {
        y: [
            'Giữa số (hoặc 这 / 那 / 几) và danh từ luôn có lượng từ.',
            'Hay dùng: 个 chung, 本 sách, 张 vật phẳng, 杯 cốc, 件 áo, 只 con vật, 辆 xe.',
            'Đếm "hai" cái gì đó dùng 两: 两个人, không nói 二个人.',
        ],
        vd: [
            { sai: '我有三笔。', dung: '我有三支笔。' },
            { sai: '这书很好看。', dung: '这本书很好看。' },
            { sai: '二个苹果', dung: '两个苹果' },
        ],
    },
    'zh-giao-tiep': {
        y: [
            'Nhờ hay xin phép lịch sự: 能…吗？ / 可以…吗？, thêm 请 ở đầu câu.',
            'Giảm nhẹ yêu cầu bằng 一点儿: 慢一点儿, 便宜一点儿.',
            'Học nguyên cụm câu thay vì dịch từng chữ từ tiếng Việt.',
        ],
        vd: [
            { sai: '你帮我吗？', dung: '你能帮我一下吗？' },
            { sai: '多少钱这本书？', dung: '这本书多少钱？' },
            { sai: '你说一点儿慢。', dung: '你说慢一点儿。' },
        ],
    },
};

module.exports = { KHUNG_ZH, QUY_TAC_ZH };
