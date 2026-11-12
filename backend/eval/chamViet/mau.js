/**
 * BÀI MẪU để đo bộ chấm Viết (IELTS Task 2). Tự viết cho bộ đo này — không lấy bài mẫu có bản
 * quyền (sách Cambridge, British Council).
 *
 * Không có "điểm giám khảo thật" để so, nên bộ đo kiểm ba thứ không cần đáp án chuẩn từ ngoài:
 *   · ổn định: cùng một bài chấm nhiều lần, điểm lệch bao nhiêu;
 *   · thứ tự: ba bài viết RÕ RÀNG ở ba mức (yếu / trung bình / tốt) phải được xếp đúng thứ tự;
 *   · bắt lỗi: bài tốt được cài sẵn lỗi đã biết, AI phải chỉ ra được.
 *
 * `mucDuKien` chỉ là mức người viết nhắm tới, dùng để xếp thứ tự — KHÔNG phải điểm chuẩn.
 */
const DE = 'Some people believe that university students should be free to study whatever they like, while others think they should only study subjects that will be useful for their future careers. Discuss both views and give your own opinion.';

const BAI_YEU = `Today university is very important for young people. Some people think student should study what they like, other people think student must study subject useful for job. I will talk about this.

First, study subject for job is good. Because student pay a lot of money for university, so they need good job after. If student study a subject not useful, after finish they cannot find job and they have no money. My cousin study history and now he work in a coffee shop, he is not happy. So I think useful subject is important. Also country need engineer and doctor more than other job.

Second, study what you like is also good. If student like the subject they will happy and study good. If they don't like they will boring and not go to class. Many student in my class is like that, they choose subject because parent want, and they always sleep in class. This is not good for they.

But I think useful subject is more better. Life is very difficult now and everything is expensive. Student need money to live and help family. If they like other thing they can learn it in free time, for example music or painting, they don't need learn it in university. University is for job, not for play.

In conclusion, both have good and bad point. But in my opinion student should study useful subject for job because it help them have good life in future and help country develop.`;

const BAI_VUA = `Nowadays, many people discuss about whether university students should study the subjects they like or only the subjects that are useful for their job in the future. In this essay I will discuss both views and give my opinion.

On the one hand, some people think students should choose subjects which help them to find a job. The reason is that studying at university is very expensive and students want to get a good job after graduate. For example, if a student study accounting or computer science, he can easily find a job with high salary. In addition, the country need many workers in technology and science, so the government want students to study these subjects.

On the other hand, other people believe that students should study what they like. When students are interested in the subject, they will study harder and get better results. If they are forced to study a subject they do not like, they may feel bored and stressed, and some of them even give up. Also, nobody knows what jobs will be popular in the future, because technology is changing very fast.

In my opinion, I think students should be allowed to study the subjects they like, but they also need to think about their future. Universities should give students advice about careers, so they can make a good choice. For instance, a student who loves art can also learn some skills about design on computer, which is useful for many companies.

In conclusion, both views have their own reasons. I believe that students should follow their interest but they should also consider the job market.`;

const BAI_TOT = `In recent years, there has been considerable debate about whether university students should be free to choose any subject or whether they should focus on disciplines that lead directly to employment. While both positions have merit, I believe that students benefit most when personal interest and practical considerations are balanced.

Those who argue for career-oriented study point to the rising cost of higher education. Tuition fees and living expenses often leave graduates with substantial debt, so it seems reasonable to expect a degree to improve one's job prospects. Moreover, economies need skilled professionals in fields such as engineering, medicine and information technology, and directing students towards these areas could reduce skill shortages. From this perspective, studying a subject with little market demand may appear to be a costly indulgence.

On the other hand, there are strong reasons to let students follow their passions. People tend to perform better when they are genuinely interested in what they are learning, and motivated students are more likely to complete their degrees and excel. Furthermore, the job market is notoriously difficult to predict; a field that seems promising today may be automated or outsourced within a decade. Subjects such as philosophy or history also develop transferable skills, including critical thinking and clear writing, which employers consistently value.

In my view, the most sensible approach is to allow students to choose freely while ensuring they receive accurate information about career outcomes. Universities could, for example, publish employment data for each programme and encourage students to combine a subject they love with practical modules. In this way, young people can make informed decisions without sacrificing the curiosity that makes higher education worthwhile.

In conclusion, although employability is an important consideration, restricting students to "useful" subjects would be short-sighted. A balanced system that respects individual interests and provides career guidance is likely to serve both students and society best.`;

/**
 * Lỗi cài vào bài tốt: `goc` → `sai`. `dau` là cụm phải xuất hiện trong trích dẫn lỗi AI đưa ra
 * thì mới tính là bắt được (so không phân biệt hoa thường).
 */
const LOI_CAI = [
    { goc: 'there has been considerable debate', sai: 'there have been considerable debate', dau: 'have been', loai: 'agreement' },
    { goc: 'point to the rising cost', sai: 'point to rising cost', dau: 'rising cost', loai: 'article' },
    { goc: 'it seems reasonable', sai: 'it seem reasonable', dau: 'seem reasonable', loai: 'agreement' },
    { goc: 'which employers consistently value', sai: 'which employers consistently valued', dau: 'valued', loai: 'tense' },
    { goc: 'could, for example, publish employment', sai: 'could, for example, publishes employment', dau: 'publishes', loai: 'agreement' },
    { goc: 'make informed decisions', sai: 'make an informed decisions', dau: 'an informed decisions', loai: 'article' },
];

function caiLoi(bai, dsLoi) {
    return dsLoi.reduce((s, l) => {
        if (!s.includes(l.goc)) throw new Error(`Không tìm thấy chỗ cài lỗi: ${l.goc}`);
        return s.replace(l.goc, l.sai);
    }, bai);
}

const BAI = [
    { id: 'yeu', mucDuKien: 1, ten: 'Bài yếu (nhắm ~4)', bai: BAI_YEU },
    { id: 'vua', mucDuKien: 2, ten: 'Bài trung bình (nhắm ~6)', bai: BAI_VUA },
    { id: 'tot', mucDuKien: 3, ten: 'Bài tốt (nhắm ~7.5)', bai: BAI_TOT },
    { id: 'tot-cai-loi', mucDuKien: null, ten: 'Bài tốt + 6 lỗi cài sẵn', bai: caiLoi(BAI_TOT, LOI_CAI), loiCai: LOI_CAI },
];

module.exports = { DE, BAI, LOI_CAI, caiLoi };
