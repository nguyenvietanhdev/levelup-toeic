/**
 * KHO LÕI NGỮ PHÁP TIẾNG TRUNG — các cấu trúc HSK 1–4, viết tay để chắc đúng và tra ngay không
 * tốn AI. Cùng định dạng với kho tiếng Anh (`nguPhapKho.js`); `vd[].en` là câu ngoại ngữ (ở đây là
 * tiếng Trung giản thể), `vd[].py` là pinyin có dấu thanh, đã biến điệu 一/不 như sách giáo khoa.
 *
 * `id` bắt đầu bằng `zh-` để không trùng kho tiếng Anh và để biết ngôn ngữ chỉ từ id.
 * KHÔNG đổi id của mục đã có: tiến độ luyện và ví dụ thêm lưu theo id.
 */
const NHOM_ZH = [
    { key: 'zh-co-ban', ten: 'Câu cơ bản' },
    { key: 'zh-tro-tu', ten: 'Trợ từ & thể' },
    { key: 'zh-cau-truc', ten: 'Cấu trúc câu' },
    { key: 'zh-luong-tu', ten: 'Lượng từ & số' },
    { key: 'zh-bo-ngu', ten: 'Bổ ngữ & năng nguyện' },
];

const v = (en, py, vi) => ({ en, py, vi });

const MUC_ZH = [
    // ── Câu cơ bản ──
    {
        id: 'zh-shi', nhom: 'zh-co-ban', ten: 'Câu chữ 是', tuKhoa: 'shi la cau chu shi',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'A + 是 + B' },
            { nhan: 'Phủ định', ct: 'A + 不是 + B' },
            { nhan: 'Câu hỏi', ct: 'A + 是 + B + 吗？' },
        ],
        dung: ['Nói A là gì, là ai: nối hai danh từ với nhau.'],
        vd: [
            v('我是越南人。', 'Wǒ shì Yuènán rén.', 'Tôi là người Việt Nam.'),
            v('他不是老师。', 'Tā bú shì lǎoshī.', 'Anh ấy không phải giáo viên.'),
            v('你是学生吗？', 'Nǐ shì xuésheng ma?', 'Bạn là học sinh phải không?'),
        ],
        luuY: 'Không dùng 是 trước tính từ: nói 我很忙, không nói 我是忙.',
    },
    {
        id: 'zh-you', nhom: 'zh-co-ban', ten: '有 và 没有', tuKhoa: 'you meiyou co khong co ton tai so huu',
        congThuc: [
            { nhan: 'Sở hữu', ct: 'Người + 有 + vật' },
            { nhan: 'Tồn tại', ct: 'Nơi chốn + 有 + vật' },
            { nhan: 'Phủ định', ct: '没有 + vật' },
        ],
        dung: ['Ai đó có gì, hoặc ở đâu có gì.'],
        vd: [
            v('我有一个哥哥。', 'Wǒ yǒu yí ge gēge.', 'Tôi có một anh trai.'),
            v('桌子上有一本书。', 'Zhuōzi shang yǒu yì běn shū.', 'Trên bàn có một quyển sách.'),
            v('我没有时间。', 'Wǒ méiyǒu shíjiān.', 'Tôi không có thời gian.'),
        ],
        luuY: 'Phủ định của 有 là 没有, không nói 不有.',
    },
    {
        id: 'zh-tinh-tu', nhom: 'zh-co-ban', ten: 'Câu vị ngữ tính từ', tuKhoa: 'tinh tu hen rat adjective',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'S + 很 + tính từ' },
            { nhan: 'Phủ định', ct: 'S + 不 + tính từ' },
        ],
        dung: ['Miêu tả tính chất. 很 ở đây thường chỉ để câu tự nhiên, không nhấn mạnh "rất".'],
        vd: [
            v('她很漂亮。', 'Tā hěn piàoliang.', 'Cô ấy đẹp.'),
            v('今天不冷。', 'Jīntiān bù lěng.', 'Hôm nay không lạnh.'),
        ],
        luuY: 'Không chèn 是 giữa chủ ngữ và tính từ: không nói 她是漂亮.',
    },
    {
        id: 'zh-cau-hoi', nhom: 'zh-co-ban', ten: 'Câu hỏi', tuKhoa: 'cau hoi ma ne shenme nar shei ji zenme',
        congThuc: [
            { nhan: 'Có/không', ct: 'Câu trần thuật + 吗？' },
            { nhan: 'Chính phản', ct: 'V + 不 + V？' },
            { nhan: 'Từ để hỏi', ct: '什么 / 哪儿 / 谁 / 几 / 怎么 đặt đúng chỗ của thông tin cần hỏi' },
            { nhan: 'Hỏi lại', ct: 'Danh từ / đại từ + 呢？' },
        ],
        dung: ['Từ để hỏi đứng đúng vị trí của câu trả lời, không đưa lên đầu câu như tiếng Anh.'],
        vd: [
            v('你去吗？', 'Nǐ qù ma?', 'Bạn có đi không?'),
            v('你去不去？', 'Nǐ qù bu qù?', 'Bạn đi hay không đi?'),
            v('你叫什么名字？', 'Nǐ jiào shénme míngzi?', 'Bạn tên là gì?'),
        ],
        luuY: 'Câu đã có từ để hỏi thì không thêm 吗 nữa.',
    },
    {
        id: 'zh-trat-tu', nhom: 'zh-co-ban', ten: 'Trật tự câu', tuKhoa: 'trat tu thoi gian noi chon word order',
        congThuc: [
            { nhan: 'Chung', ct: 'S + thời gian + 在 + nơi chốn + V + O' },
        ],
        dung: ['Thời gian và nơi chốn đứng TRƯỚC động từ, ngược với thói quen nói tiếng Việt.'],
        vd: [
            v('我明天在家学习汉语。', 'Wǒ míngtiān zài jiā xuéxí Hànyǔ.', 'Ngày mai tôi học tiếng Trung ở nhà.'),
        ],
        luuY: 'Không nói 我学习汉语在家 theo kiểu tiếng Việt.',
    },
    {
        id: 'zh-bu-mei', nhom: 'zh-co-ban', ten: '不 và 没', tuKhoa: 'bu mei phu dinh khong chua',
        congThuc: [
            { nhan: '不', ct: '不 + V / tính từ: hiện tại, tương lai, thói quen, ý muốn' },
            { nhan: '没', ct: '没 + V: việc đã không xảy ra, chưa xảy ra; phủ định 有' },
        ],
        dung: ['Chọn theo thời điểm và ý định: không muốn, không có thói quen dùng 不; đã không làm dùng 没.'],
        vd: [
            v('我明天不去。', 'Wǒ míngtiān bú qù.', 'Ngày mai tôi không đi.'),
            v('我昨天没去。', 'Wǒ zuótiān méi qù.', 'Hôm qua tôi đã không đi.'),
        ],
        luuY: 'Việc trong quá khứ không dùng 不: không nói 我昨天不去.',
    },

    // ── Trợ từ & thể ──
    {
        id: 'zh-le', nhom: 'zh-tro-tu', ten: 'Trợ từ 了', tuKhoa: 'le hoan thanh thay doi trang thai roi',
        congThuc: [
            { nhan: 'Hoàn thành', ct: 'V + 了 + (số lượng) + O' },
            { nhan: 'Thay đổi', ct: 'Câu + 了 (cuối câu)' },
            { nhan: 'Phủ định', ct: '没 + V (bỏ 了)' },
        ],
        dung: ['了 sau động từ: hành động đã hoàn thành.', '了 cuối câu: tình hình đã thay đổi.'],
        vd: [
            v('我买了三本书。', 'Wǒ mǎile sān běn shū.', 'Tôi đã mua ba quyển sách.'),
            v('下雨了。', 'Xià yǔ le.', 'Trời mưa rồi.'),
            v('我没买。', 'Wǒ méi mǎi.', 'Tôi đã không mua.'),
        ],
        luuY: 'Phủ định không giữ 了: không nói 我没买了.',
    },
    {
        id: 'zh-guo', nhom: 'zh-tro-tu', ten: 'Trợ từ 过', tuKhoa: 'guo trai nghiem da tung',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'V + 过 + O' },
            { nhan: 'Phủ định', ct: '没 + V + 过 + O' },
        ],
        dung: ['Đã từng làm việc gì (trải nghiệm), không nói rõ khi nào.'],
        vd: [
            v('我去过北京。', 'Wǒ qùguo Běijīng.', 'Tôi đã từng đến Bắc Kinh.'),
            v('我没吃过烤鸭。', 'Wǒ méi chīguo kǎoyā.', 'Tôi chưa từng ăn vịt quay.'),
        ],
        luuY: 'Phủ định giữ 过 (khác với 了): 没去过 là đúng.',
    },
    {
        id: 'zh-zhe', nhom: 'zh-tro-tu', ten: 'Trợ từ 着', tuKhoa: 'zhe trang thai dang',
        congThuc: [
            { nhan: 'Trạng thái', ct: 'V + 着' },
            { nhan: 'Cách thức', ct: 'V1 + 着 + V2' },
        ],
        dung: ['Trạng thái đang được duy trì, hoặc làm việc này trong khi ở trạng thái kia.'],
        vd: [
            v('门开着。', 'Mén kāizhe.', 'Cửa đang mở.'),
            v('他笑着说。', 'Tā xiàozhe shuō.', 'Anh ấy vừa cười vừa nói.'),
        ],
    },
    {
        id: 'zh-dang', nhom: 'zh-tro-tu', ten: 'Đang làm: 正在 / 在 / 呢', tuKhoa: 'zhengzai zai ne dang tiep dien',
        congThuc: [
            { nhan: 'Đang', ct: 'S + 正在 / 在 + V + O + (呢)' },
            { nhan: 'Phủ định', ct: 'S + 没在 + V' },
        ],
        dung: ['Hành động đang diễn ra lúc nói.'],
        vd: [
            v('我正在吃饭呢。', 'Wǒ zhèngzài chī fàn ne.', 'Tôi đang ăn cơm.'),
        ],
    },
    {
        id: 'zh-de', nhom: 'zh-tro-tu', ten: '的, 得, 地', tuKhoa: 'de ba chu de so huu bo ngu trang ngu',
        congThuc: [
            { nhan: '的', ct: 'Định ngữ + 的 + danh từ' },
            { nhan: '得', ct: 'V + 得 + bổ ngữ mức độ' },
            { nhan: '地', ct: 'Tính từ + 地 + V' },
        ],
        dung: ['Ba chữ cùng đọc "de" nhưng đứng ở ba vị trí khác nhau.'],
        vd: [
            v('这是我的书。', 'Zhè shì wǒ de shū.', 'Đây là sách của tôi.'),
            v('他跑得很快。', 'Tā pǎo de hěn kuài.', 'Anh ấy chạy rất nhanh.'),
            v('她高兴地说。', 'Tā gāoxìng de shuō.', 'Cô ấy vui vẻ nói.'),
        ],
        luuY: 'Đọc giống nhau nên dễ viết nhầm: nhìn chữ đứng ngay sau để chọn.',
    },

    // ── Cấu trúc câu ──
    {
        id: 'zh-ba', nhom: 'zh-cau-truc', ten: 'Câu chữ 把', tuKhoa: 'ba cau chu ba xu ly',
        congThuc: [
            { nhan: 'Chung', ct: 'S + 把 + O + V + thành phần khác' },
        ],
        dung: ['Nhấn mạnh việc xử lý một đối tượng xác định và kết quả của nó.'],
        vd: [
            v('请把门关上。', 'Qǐng bǎ mén guānshang.', 'Làm ơn đóng cửa lại.'),
            v('我把作业做完了。', 'Wǒ bǎ zuòyè zuòwán le.', 'Tôi đã làm xong bài tập.'),
        ],
        luuY: 'Động từ sau 把 không được đứng trơ trọi: không nói 我把书看.',
    },
    {
        id: 'zh-bei', nhom: 'zh-cau-truc', ten: 'Câu bị động 被', tuKhoa: 'bei bi dong',
        congThuc: [
            { nhan: 'Chung', ct: 'S + 被 + (người làm) + V + thành phần khác' },
        ],
        dung: ['Chủ ngữ chịu tác động, thường là việc không mong muốn.'],
        vd: [
            v('我的手机被偷了。', 'Wǒ de shǒujī bèi tōu le.', 'Điện thoại của tôi bị trộm rồi.'),
            v('蛋糕被弟弟吃了。', 'Dàngāo bèi dìdi chī le.', 'Bánh bị em trai ăn mất rồi.'),
        ],
    },
    {
        id: 'zh-bi', nhom: 'zh-cau-truc', ten: 'So sánh với 比', tuKhoa: 'bi so sanh hon meiyou',
        congThuc: [
            { nhan: 'Hơn', ct: 'A + 比 + B + tính từ (+ mức độ)' },
            { nhan: 'Không bằng', ct: 'A + 没有 + B + tính từ' },
        ],
        dung: ['Mức độ chênh lệch đứng SAU tính từ: 一点儿, 得多, hoặc số lượng cụ thể.'],
        vd: [
            v('他比我高。', 'Tā bǐ wǒ gāo.', 'Anh ấy cao hơn tôi.'),
            v('今天比昨天冷一点儿。', 'Jīntiān bǐ zuótiān lěng yìdiǎnr.', 'Hôm nay lạnh hơn hôm qua một chút.'),
            v('我没有他高。', 'Wǒ méiyǒu tā gāo.', 'Tôi không cao bằng anh ấy.'),
        ],
        luuY: 'Không dùng 很 trong câu 比: không nói 他比我很高.',
    },
    {
        id: 'zh-shi-de', nhom: 'zh-cau-truc', ten: 'Cấu trúc 是…的', tuKhoa: 'shi de nhan manh',
        congThuc: [
            { nhan: 'Chung', ct: 'S + 是 + thời gian / nơi chốn / cách thức + V + 的' },
        ],
        dung: ['Nhấn mạnh khi nào, ở đâu, bằng cách nào của một việc ĐÃ xảy ra.'],
        vd: [
            v('我是昨天来的。', 'Wǒ shì zuótiān lái de.', 'Tôi đến từ hôm qua.'),
            v('你是怎么来的？', 'Nǐ shì zěnme lái de?', 'Bạn đến bằng cách nào?'),
        ],
    },
    {
        id: 'zh-yue', nhom: 'zh-cau-truc', ten: '越来越 và 越…越', tuKhoa: 'yue lai yue cang ngay cang',
        congThuc: [
            { nhan: 'Càng ngày càng', ct: '越来越 + tính từ' },
            { nhan: 'Càng… càng', ct: '越 + A + 越 + B' },
        ],
        dung: ['Mức độ tăng dần theo thời gian, hoặc tăng theo một việc khác.'],
        vd: [
            v('天气越来越热了。', 'Tiānqì yuè lái yuè rè le.', 'Trời càng ngày càng nóng.'),
            v('他越说越快。', 'Tā yuè shuō yuè kuài.', 'Anh ấy càng nói càng nhanh.'),
        ],
        luuY: 'Không thêm 很 sau 越来越: không nói 越来越很热.',
    },
    {
        id: 'zh-lien-tu', nhom: 'zh-cau-truc', ten: 'Cặp liên từ', tuKhoa: 'yinwei suoyi suiran danshi ruguo jiu yibian lien tu',
        congThuc: [
            { nhan: 'Nguyên nhân', ct: '因为… ，所以…' },
            { nhan: 'Tương phản', ct: '虽然… ，但是…' },
            { nhan: 'Điều kiện', ct: '如果… ，就…' },
            { nhan: 'Đồng thời', ct: '一边 + V1 ，一边 + V2' },
        ],
        dung: ['Tiếng Trung hay dùng CẢ HAI vế của cặp liên từ, khác tiếng Anh.'],
        vd: [
            v('因为下雨，所以我没去。', 'Yīnwèi xià yǔ, suǒyǐ wǒ méi qù.', 'Vì trời mưa nên tôi đã không đi.'),
            v('虽然很累，但是他很高兴。', 'Suīrán hěn lèi, dànshì tā hěn gāoxìng.', 'Tuy mệt nhưng anh ấy rất vui.'),
            v('如果你有时间，就来我家吧。', 'Rúguǒ nǐ yǒu shíjiān, jiù lái wǒ jiā ba.', 'Nếu bạn có thời gian thì đến nhà tôi nhé.'),
        ],
        luuY: 'Học tiếng Anh dễ bỏ một vế; trong tiếng Trung, 虽然…但是 đi cặp là bình thường.',
    },

    // ── Lượng từ & số ──
    {
        id: 'zh-luong-tu', nhom: 'zh-luong-tu', ten: 'Lượng từ', tuKhoa: 'luong tu ge ben zhang bei jian zhi wei',
        congThuc: [
            { nhan: 'Chung', ct: 'Số / 这 / 那 + lượng từ + danh từ' },
            { nhan: 'Hay dùng', ct: '个 chung · 本 sách · 张 vật phẳng · 杯 cốc · 件 áo, việc · 只 con vật · 位 người (lịch sự)' },
        ],
        dung: ['Giữa số đếm và danh từ luôn có lượng từ.'],
        vd: [
            v('我要三本书。', 'Wǒ yào sān běn shū.', 'Tôi muốn ba quyển sách.'),
            v('请给我一杯咖啡。', 'Qǐng gěi wǒ yì bēi kāfēi.', 'Cho tôi một cốc cà phê.'),
            v('这件衣服很好看。', 'Zhè jiàn yīfu hěn hǎokàn.', 'Cái áo này đẹp.'),
        ],
        luuY: 'Không bỏ lượng từ: không nói 三书.',
    },
    {
        id: 'zh-er-liang', nhom: 'zh-luong-tu', ten: '二 và 两', tuKhoa: 'er liang hai so dem',
        congThuc: [
            { nhan: '两', ct: '两 + lượng từ + danh từ' },
            { nhan: '二', ct: 'Đếm số, số thứ tự, trong số nhiều chữ số' },
        ],
        dung: ['Đếm số lượng đồ vật dùng 两; đọc con số, thứ tự dùng 二.'],
        vd: [
            v('我有两个朋友。', 'Wǒ yǒu liǎng ge péngyou.', 'Tôi có hai người bạn.'),
            v('这是第二课。', 'Zhè shì dì èr kè.', 'Đây là bài thứ hai.'),
        ],
        luuY: 'Không nói 二个人.',
    },

    // ── Bổ ngữ & năng nguyện ──
    {
        id: 'zh-bo-ngu-ket-qua', nhom: 'zh-bo-ngu', ten: 'Bổ ngữ kết quả', tuKhoa: 'bo ngu ket qua wan hao dong dao jian',
        congThuc: [
            { nhan: 'Khẳng định', ct: 'V + 完 / 好 / 懂 / 到 / 见 (+ 了)' },
            { nhan: 'Phủ định', ct: '没 + V + bổ ngữ' },
        ],
        dung: ['Cho biết kết quả của hành động: xong, hiểu, thấy, tới.'],
        vd: [
            v('我听懂了。', 'Wǒ tīngdǒng le.', 'Tôi nghe hiểu rồi.'),
            v('你做完作业了吗？', 'Nǐ zuòwán zuòyè le ma?', 'Bạn làm xong bài tập chưa?'),
            v('我没听懂。', 'Wǒ méi tīngdǒng.', 'Tôi nghe không hiểu.'),
        ],
    },
    {
        id: 'zh-bo-ngu-xu-huong', nhom: 'zh-bo-ngu', ten: 'Bổ ngữ xu hướng', tuKhoa: 'bo ngu xu huong lai qu shang xia jin chu',
        congThuc: [
            { nhan: 'Đơn', ct: 'V + 来 (về phía người nói) / 去 (ra xa người nói)' },
            { nhan: 'Kép', ct: 'V + 上 / 下 / 进 / 出 / 回 / 过 / 起 + 来 / 去' },
        ],
        dung: ['Chỉ hướng chuyển động của hành động.'],
        vd: [
            v('他走进来了。', 'Tā zǒu jìnlái le.', 'Anh ấy đi vào đây rồi.'),
            v('请坐下。', 'Qǐng zuò xià.', 'Mời ngồi xuống.'),
        ],
    },
    {
        id: 'zh-bo-ngu-kha-nang', nhom: 'zh-bo-ngu', ten: 'Bổ ngữ khả năng', tuKhoa: 'bo ngu kha nang de bu duoc khong',
        congThuc: [
            { nhan: 'Làm được', ct: 'V + 得 + bổ ngữ' },
            { nhan: 'Không làm được', ct: 'V + 不 + bổ ngữ' },
        ],
        dung: ['Có làm được (tới kết quả đó) hay không.'],
        vd: [
            v('我听得懂。', 'Wǒ tīng de dǒng.', 'Tôi nghe hiểu được.'),
            v('这么多菜，我吃不完。', 'Zhème duō cài, wǒ chī bu wán.', 'Nhiều món thế này tôi ăn không hết.'),
        ],
    },
    {
        id: 'zh-nang-nguyen', nhom: 'zh-bo-ngu', ten: 'Động từ năng nguyện', tuKhoa: 'hui neng keyi xiang yao biet co the muon',
        congThuc: [
            { nhan: 'Chung', ct: 'S + 会 / 能 / 可以 / 想 / 要 + V' },
        ],
        dung: [
            '会: biết làm (nhờ học được).',
            '能: có khả năng, có điều kiện.',
            '可以: được phép.',
            '想 / 要: muốn (要 mạnh hơn, gần với "sẽ, cần").',
        ],
        vd: [
            v('我会说汉语。', 'Wǒ huì shuō Hànyǔ.', 'Tôi biết nói tiếng Trung.'),
            v('这里可以拍照吗？', 'Zhèlǐ kěyǐ pāizhào ma?', 'Ở đây có được chụp ảnh không?'),
            v('我想喝水。', 'Wǒ xiǎng hē shuǐ.', 'Tôi muốn uống nước.'),
        ],
        luuY: 'Biết bơi là 会游泳, không phải 能游泳 (trừ khi nói về điều kiện, ví dụ hôm nay khỏe hay không).',
    },
];

module.exports = { NHOM_ZH, MUC_ZH };
