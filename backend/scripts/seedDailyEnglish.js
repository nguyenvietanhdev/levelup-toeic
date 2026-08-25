/**
 * Nhập bộ "Giao tiếp hằng ngày" từ `english-250-chuan-hoa.md`.
 *
 *   node scripts/seedDailyEnglish.js
 *
 * Idempotent: chạy lại chỉ CẬP NHẬT bản ghi cũ theo (source + en), không tạo
 * bản trùng. Nên sửa nội dung ở đây rồi chạy lại là được.
 *
 * ── Vì sao ánh xạ như thế này ──────────────────────────────────────────────
 *
 * `en`      : câu tiếng Anh — thứ người học phải nói ra được.
 * `vn`      : nghĩa tiếng Việt.
 * `example` : CÂU ĐÁP, không phải câu ví dụ.
 *
 *   Đây là quyết định quan trọng nhất. Bộ từ vựng thường dùng `example` để
 *   minh hoạ cách dùng một TỪ. Ở đây mỗi bản ghi đã LÀ một câu hoàn chỉnh, nên
 *   ví dụ minh hoạ là thừa. Đặt câu đáp vào đó thì chế độ "Điền vào câu" và
 *   Flashcard tự động thành bài luyện ĐỐI ĐÁP — hỏi hiện ở mặt trước, đáp ở
 *   mặt sau. Không phải viết chế độ mới nào cả.
 *
 * `type`    : nhãn sắc thái (thân mật / trung tính / công sở / cẩn thận).
 *
 *   `type` vốn là từ loại (noun/verb). Với câu giao tiếp thì từ loại vô nghĩa,
 *   còn sắc thái mới là thứ người Việt hay dùng sai — nói `My bad` với khách
 *   hàng, hoặc `I disagree` trần trong cuộc họp. Chế độ "Từ loại" sẽ hỏi đúng
 *   thứ đáng hỏi ở bộ này.
 *
 * `part`    : nhóm chức năng giao tiếp — cũng là đơn vị chọn Part khi luyện.
 * `level`   : `basic` cho khung câu lõi, `daily` cho phần còn lại.
 */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const Vocabulary = require('../models/Vocabulary');

const SOURCE = 'giao_tiep_250';

/** Nhãn sắc thái → chữ hiển thị. Dùng cho `type`. */
const T = 'thân mật';
const N = 'trung tính';
const CS = 'công sở';
const CAN_THAN = 'cẩn thận';

/**
 * PHẦN 1 — 14 khung câu lõi.
 *
 * Để RIÊNG một Part và `level: 'basic'`: đây là thứ sinh ra ~60% số câu còn
 * lại, nên phải luyện trước và luyện riêng. Trộn lẫn vào 130 câu kia thì nó
 * chìm mất giữa đám đông.
 *
 * `example` ở đây là hai câu ghép sẵn — đúng tinh thần substitution drill: nhìn
 * khung, tự ghép tiếp.
 */
const KHUNG_CAU = [
    ['Can / Could you + V?', 'Bạn ... được không?', 'Could you repeat that? / Could you speak slowly?'],
    ['Can I + V?', 'Tôi ... được không?', 'Can I try? / Can I ask you something?'],
    ['Let me + V', 'Để tôi ...', 'Let me check. / Let me explain.'],
    ["Let's + V", 'Cùng ... nào', "Let's go. / Let's figure it out."],
    ['I have to + V', 'Tôi phải ...', 'I have to go. / I have to leave now.'],
    ["I'm + adjective", 'Tôi đang ...', "I'm busy. / I'm tired. / I'm full."],
    ['Do you + V?', 'Bạn có ... không?', 'Do you understand? / Do you need help?'],
    ['Are you + adj / V-ing?', 'Bạn có ... không?', 'Are you okay? / Are you coming?'],
    ["I think / I don't think + clause", 'Tôi nghĩ / không nghĩ ...', "I think so. / I don't think that's right."],
    ["That's + adjective", 'Cái đó thật ...', "That's right. / That's amazing."],
    ['Thanks for + V-ing', 'Cảm ơn vì đã ...', 'Thanks for having me. / Thanks for waiting.'],
    ['Sorry to / for + V-ing', 'Xin lỗi vì đã ...', 'Sorry to bother you. / Sorry for being late.'],
    ['How + aux + ...?', '... như thế nào?', 'How far is it? / How long will it take?'],
    ['What + noun + ...?', '... gì?', 'What do you need? / What do you mean?'],
];

/**
 * PHẦN 2 — câu theo chức năng: [en, vn, câu đáp, nhãn].
 *
 * Câu đáp rỗng ('') ở những câu vốn LÀ câu đáp — ví dụ "No worries." là thứ
 * người ta đáp lại, không có gì đáp tiếp. Nhồi một câu đáp bịa vào đó là dạy
 * sai.
 */
const CAU = [
    // ── A. Mở thoại & chào hỏi ──
    ['A. Mở thoại', [
        ["What's up?", 'Có chuyện gì vậy / dạo này sao', 'Not much. / Nothing special. / Just working.', T],
        ["How's it going?", 'Hôm nay thế nào', 'Pretty good, thanks. You?', N],
        ['What have you been up to?', 'Dạo này làm gì', 'Just working, nothing new.', N],
        ['Long time no see.', 'Lâu rồi không gặp', 'Yeah, it has been a while!', T],
        ['Nice to meet you.', 'Rất vui được gặp bạn', 'Nice to meet you too.', N],
        ['How was your weekend?', 'Cuối tuần thế nào', 'It was good, thanks. How about yours?', N],
        ['Any plans for the weekend?', 'Cuối tuần có kế hoạch gì không', 'Nothing much. How about you?', N],
    ]],

    // ── B. Hiểu / không hiểu ──
    ['B. Hiểu & không hiểu', [
        ['I see.', 'À ra vậy (vừa tiếp nhận thông tin mới)', '', N],
        ['I got it.', 'Hiểu rồi, làm được rồi (vừa hiểu cách làm)', '', N],
        ['I understand.', 'Tôi hiểu (đồng cảm, hoặc xác nhận trong công việc)', '', N],
        ["I didn't catch that.", 'Tôi NGHE không rõ', 'Sorry, let me say it again.', N],
        ["I don't understand.", 'Tôi KHÔNG HIỂU NGHĨA', 'Let me explain it differently.', N],
        ['Sorry, could you say that again?', 'Bạn nói lại được không', 'Of course.', N],
        ['Could you speak a bit slower, please?', 'Nói chậm hơn chút được không', 'Sure, no problem.', N],
        ['What do you mean?', 'Ý bạn là sao', 'I mean...', N],
        ['Do you mean ... ?', 'Ý bạn là ... đúng không', "Yes, exactly. / No, I meant...", N],
        ['How do you say this in English?', 'Cái này tiếng Anh là gì', 'You say...', N],
    ]],

    // ── C. Câu giờ (fillers) ──
    ['C. Câu giờ', [
        ['Let me think.', 'Để tôi nghĩ xem', '', N],
        ['Let me see.', 'Để tôi xem nào', '', N],
        ['Well... / Actually...', 'Ừm... / Thực ra thì...', '', N],
        ['I mean...', 'Ý tôi là...', '', N],
        ['How should I put it...', 'Nói thế nào nhỉ...', '', N],
        ['Give me a second.', 'Cho tôi một giây', 'Take your time.', N],
        ['Hang on.', 'Chờ chút', 'Sure.', T],
        ['Just a moment, please.', 'Xin đợi một chút', 'Of course.', CS],
    ]],

    // ── D. Nhờ vả & xin phép ──
    ['D. Nhờ vả', [
        ['Could you do me a favor?', 'Giúp tôi một việc được không', 'Sure, go ahead.', N],
        ['Can you help me with this?', 'Giúp tôi cái này được không', 'Of course. / No problem.', N],
        ['Do you have a minute?', 'Bạn rảnh chút không', "Sure. / Sorry, I'm in the middle of something.", N],
        ['Sorry to bother you, but...', 'Xin lỗi làm phiền, nhưng...', "That's okay, what is it?", CS],
        ['Can I ask you something?', 'Tôi hỏi chút được không', 'Sure, go ahead.', N],
        ['Is it okay if I leave early?', 'Tôi về sớm được không', 'Sure, no problem.', N],
        ['Can it wait until later?', 'Để lát nữa được không', 'Sure, no rush.', N],
    ]],

    // ── E. Đồng ý / không đồng ý ──
    ['E. Đồng ý & phản đối', [
        ['Exactly. / Absolutely.', 'Chính xác / chắc chắn rồi', '', N],
        ['That makes sense.', 'Nghe hợp lý đấy', '', N],
        ["That's a good point.", 'Đó là một ý hay', 'Thanks.', CS],
        ['Sounds good. / Sounds like a plan.', 'Nghe ổn đấy', '', N],
        ["I'm on board with that.", 'Tôi đồng ý việc đó', '', CS],
        ['Fair enough.', 'Hợp lý thôi', '', T],
        ['I see your point, but...', 'Tôi hiểu ý bạn, nhưng... (cách phản đối lịch sự)', '', CS],
        ["I'm not so sure about that.", 'Tôi không chắc lắm về việc đó', '', CS],
        ["I'd say the opposite, actually.", 'Thực ra tôi nghĩ ngược lại', '', CS],
        ['It depends.', 'Còn tuỳ', 'On what?', N],
        ["Let's agree to disagree.", 'Cứ giữ quan điểm riêng vậy', 'Fair enough.', N],
    ]],

    // ── F. Xin lỗi & đáp lại ──
    ['F. Xin lỗi', [
        ['My bad.', 'Lỗi tôi', 'No worries.', T],
        ['It was my mistake.', 'Đó là lỗi của tôi', 'These things happen.', CS],
        ["I didn't mean to.", 'Tôi không cố ý', "Don't worry about it.", N],
        ['I owe you an apology.', 'Tôi nợ bạn lời xin lỗi', "That's okay.", CS],
        ['Sorry for the delay.', 'Xin lỗi vì chậm trễ', 'No problem at all.', CS],
        ['No worries.', 'Không sao đâu (đáp lại xin lỗi)', '', T],
        ["Don't worry about it.", 'Đừng bận tâm (đáp lại xin lỗi)', '', N],
        ['These things happen.', 'Chuyện đó vẫn xảy ra mà', '', N],
        ["It doesn't matter.", 'Không quan trọng — NGHE LẠNH, tránh dùng khi ai đó vừa xin lỗi', '', CAN_THAN],
    ]],

    // ── G. Cảm ơn & đáp lại ──
    ['G. Cảm ơn', [
        ['Thanks a lot.', 'Cảm ơn nhiều', "You're welcome.", N],
        ['I appreciate it.', 'Cảm ơn bạn nhiều', 'Happy to help.', N],
        ['Thanks for your help.', 'Cảm ơn sự giúp đỡ', 'Anytime.', N],
        ['Thanks for your understanding.', 'Cảm ơn vì đã thông cảm', 'Of course.', CS],
        ['That means a lot to me.', 'Điều đó rất ý nghĩa với tôi', '', N],
        ["You're welcome.", 'Không có gì', '', N],
        ['My pleasure.', 'Rất hân hạnh', '', CS],
        ['Happy to help.', 'Vui vì giúp được', '', N],
        ['Anytime.', 'Lúc nào cũng được', '', T],
    ]],

    // ── H. Từ chối ──
    ['H. Từ chối', [
        ["I'd love to, but I can't.", 'Tôi muốn lắm nhưng không được', "That's okay, maybe next time.", N],
        ['Maybe next time.', 'Để lần sau nhé', 'Sure!', N],
        ["I'll pass, thanks.", 'Thôi tôi không tham gia, cảm ơn', 'No problem.', T],
        ["I'm afraid I can't make it.", 'E là tôi không đến được', "That's alright.", CS],
        ['Can I get back to you on that?', 'Tôi trả lời bạn sau được không', 'Sure, take your time.', CS],
        ["I'm not interested.", 'Tôi không quan tâm — QUÁ THẲNG, gần như bất lịch sự', '', CAN_THAN],
    ]],

    // ── I. Khen & động viên ──
    ['I. Khen ngợi', [
        ['Good job. / Well done.', 'Làm tốt lắm', 'Thanks, I appreciate that.', N],
        ['Nice work.', 'Làm tốt đấy', "That's kind of you.", N],
        ['You got this.', 'Bạn làm được mà', 'Thanks!', T],
        ['Keep it up.', 'Cứ thế phát huy', 'Will do.', N],
        ["I'm proud of you.", 'Tôi tự hào về bạn', 'That means a lot.', T],
        ['Well said.', 'Nói hay lắm', 'Thank you.', N],
        ['Good luck.', 'Chúc may mắn', 'Thanks!', N],
        ['Thanks, I appreciate that.', 'Cảm ơn, tôi trân trọng điều đó (đáp lời khen)', '', N],
        ["That's kind of you.", 'Bạn thật tốt bụng (đáp lời khen)', '', N],
    ]],

    // ── J. Kết thúc hội thoại ──
    ['J. Kết thúc', [
        ['I have to get going.', 'Tôi phải đi rồi', 'Alright, take care!', N],
        ['It was nice talking to you.', 'Nói chuyện với bạn thật vui', 'You too!', N],
        ["Let's catch up soon.", 'Hôm nào gặp nhau nhé', 'Definitely!', T],
        ['Keep in touch.', 'Giữ liên lạc nhé', 'Will do.', N],
        ['Take care.', 'Giữ gìn nhé', 'You too.', N],
        ['See you later.', 'Gặp lại sau', 'See you!', N],
        ["I'll get back to you.", 'Tôi sẽ báo lại sau', 'Sounds good.', CS],
        ['Keep me posted.', 'Có gì báo tôi nhé', 'Will do.', CS],
        ["Let's call it a day.", 'Hôm nay nghỉ ở đây thôi', 'Agreed.', N],
    ]],

    // ── K. Phản ứng & cảm thán ──
    ['K. Phản ứng', [
        ['Really?', 'Thật á', 'Yeah, really.', N],
        ['No way!', 'Không thể nào', "I know, right?", T],
        ["That's amazing!", 'Tuyệt vời quá', 'Thanks!', N],
        ["That's too bad.", 'Tiếc quá nhỉ', 'Yeah, it is.', N],
        ["I'm sorry to hear that.", 'Tiếc khi nghe vậy', 'Thanks.', N],
        ['What a coincidence!', 'Trùng hợp thật', 'I know!', N],
        ["You're kidding!", 'Đùa à', "No, I'm serious.", T],
        ['Just kidding.', 'Đùa thôi', 'You got me!', T],
        ['Tell me about it.', 'Chuẩn luôn / tôi hiểu quá mà — KHÔNG phải "kể tôi nghe đi"', '', CAN_THAN],
        ['Been there.', 'Tôi trải qua rồi', '', T],
    ]],
];

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);

    const docs = [];

    for (const [en, vn, vd] of KHUNG_CAU) {
        docs.push({
            en, vn, example: vd,
            part: '0. Khung câu lõi',
            type: 'khung câu',
            level: 'basic',
            source: SOURCE,
            scope: 'public',
        });
    }

    for (const [part, ds] of CAU) {
        for (const [en, vn, dap, nhan] of ds) {
            docs.push({
                en, vn, example: dap,
                part, type: nhan,
                level: 'daily',
                source: SOURCE,
                scope: 'public',
            });
        }
    }

    let them = 0;
    let capNhat = 0;
    for (const d of docs) {
        // Upsert theo (source + en): chạy lại chỉ cập nhật, không tạo bản trùng.
        const co = await Vocabulary.findOne({ source: SOURCE, en: d.en }).select('_id').lean();
        if (co) {
            await Vocabulary.updateOne({ _id: co._id }, { $set: d });
            capNhat++;
        } else {
            await Vocabulary.create(d);
            them++;
        }
    }

    const tong = await Vocabulary.countDocuments({ source: SOURCE });
    console.log(`Thêm mới: ${them} · Cập nhật: ${capNhat} · Tổng trong bộ: ${tong}`);

    const parts = await Vocabulary.aggregate([
        { $match: { source: SOURCE } },
        { $group: { _id: '$part', n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
    ]);
    console.log('\nCác Part:');
    for (const p of parts) console.log(`  ${String(p._id).padEnd(24)} ${p.n} câu`);

    await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
