/**
 * BẢNG ÂM có sẵn của Tra cứu phát âm — không gọi AI. Mỗi ngôn ngữ trong sổ một bảng (test kiểm
 * đủ): IPA tiếng Anh, pinyin tiếng Trung, kana tiếng Nhật, chữ Hangul tiếng Hàn.
 *
 * Mỗi ô: `kh` ký hiệu (to), `phu` phiên âm phụ (romaji, tên chữ…), `vd` thứ được đọc khi bấm (từ
 * hoặc âm tiết ví dụ — máy đọc không phát được phụ âm đứng riêng), `vdNghia` gợi ý nghĩa/phiên âm
 * của ví dụ, `viet` đọc gần giống gì trong tiếng Việt, `luuY` lưu ý cho người Việt.
 *
 * "Đọc gần giống" chỉ là điểm bắt đầu: nhiều âm tiếng Việt không có — hãy bấm nghe và nhại theo.
 */

/** Ô bảng kana (thuần): chữ hiragana + katakana, romaji, cách đọc kiểu Việt. */
const kana = (h, k, romaji, viet, luuY = '') => ({ kh: `${h} ${k}`, phu: romaji, vd: h, viet, luuY });

export const BANG_AM = {
    en: {
        ten: 'Bảng phiên âm IPA',
        moTa: 'Ký hiệu IPA trong từ điển (Cambridge, Oxford). Dấu ː là âm kéo dài; âm tiết nhấn được đánh dấu ˈ phía trước.',
        nhom: [
            {
                ten: 'Nguyên âm ngắn',
                o: [
                    { kh: 'ɪ', vd: 'sit', vdNghia: '/sɪt/', viet: 'i ngắn, dứt khoát', luuY: 'Ngắn hơn và mở hơn iː: sit ≠ seat.' },
                    { kh: 'e', vd: 'bed', vdNghia: '/bed/', viet: 'e', luuY: '' },
                    { kh: 'æ', vd: 'cat', vdNghia: '/kæt/', viet: 'giữa a và e, miệng mở rộng sang hai bên', luuY: 'Đọc thành "e" là sai: bad ≠ bed.' },
                    { kh: 'ʌ', vd: 'cup', vdNghia: '/kʌp/', viet: 'ă / â', luuY: '' },
                    { kh: 'ɒ', vd: 'hot', vdNghia: '/hɒt/', viet: 'o ngắn', luuY: 'Giọng Mỹ đọc gần "a": /hɑːt/.' },
                    { kh: 'ʊ', vd: 'book', vdNghia: '/bʊk/', viet: 'u ngắn, môi hơi tròn', luuY: 'Ngắn hơn uː: full ≠ fool.' },
                    { kh: 'ə', vd: 'about', vdNghia: '/əˈbaʊt/', viet: 'ơ rất nhẹ, lướt qua', luuY: 'Âm phổ biến nhất tiếng Anh, chỉ ở âm tiết KHÔNG nhấn.' },
                ],
            },
            {
                ten: 'Nguyên âm dài',
                o: [
                    { kh: 'iː', vd: 'see', vdNghia: '/siː/', viet: 'i kéo dài', luuY: '' },
                    { kh: 'ɑː', vd: 'car', vdNghia: '/kɑː/', viet: 'a kéo dài', luuY: '' },
                    { kh: 'ɔː', vd: 'law', vdNghia: '/lɔː/', viet: 'o kéo dài, môi tròn', luuY: '' },
                    { kh: 'uː', vd: 'blue', vdNghia: '/bluː/', viet: 'u kéo dài', luuY: '' },
                    { kh: 'ɜː', vd: 'bird', vdNghia: '/bɜːd/', viet: 'ơ kéo dài', luuY: 'Giọng Mỹ có thêm âm r: /bɜːrd/.' },
                ],
            },
            {
                ten: 'Nguyên âm đôi',
                o: [
                    { kh: 'eɪ', vd: 'day', vdNghia: '/deɪ/', viet: 'ây', luuY: '' },
                    { kh: 'aɪ', vd: 'my', vdNghia: '/maɪ/', viet: 'ai', luuY: '' },
                    { kh: 'ɔɪ', vd: 'boy', vdNghia: '/bɔɪ/', viet: 'oi', luuY: '' },
                    { kh: 'aʊ', vd: 'now', vdNghia: '/naʊ/', viet: 'ao', luuY: '' },
                    { kh: 'əʊ', vd: 'go', vdNghia: '/ɡəʊ/', viet: 'âu (giọng Mỹ: ô-u /oʊ/)', luuY: 'Đừng đọc thành "ô" cụt.' },
                    { kh: 'ɪə', vd: 'near', vdNghia: '/nɪə/', viet: 'ia', luuY: '' },
                    { kh: 'eə', vd: 'hair', vdNghia: '/heə/', viet: 'e-ơ', luuY: '' },
                    { kh: 'ʊə', vd: 'tour', vdNghia: '/tʊə/', viet: 'ua', luuY: '' },
                ],
            },
            {
                ten: 'Phụ âm',
                o: [
                    { kh: 'p', vd: 'pen', vdNghia: '/pen/', viet: 'p bật hơi mạnh', luuY: 'Đặt tay trước miệng phải thấy hơi. Cuối từ vẫn phải nghe được.' },
                    { kh: 'b', vd: 'big', vdNghia: '/bɪɡ/', viet: 'b', luuY: '' },
                    { kh: 't', vd: 'ten', vdNghia: '/ten/', viet: 'th nhẹ (t bật hơi)', luuY: 'Đầu lưỡi chạm lợi trên, không chạm răng như "t" Việt.' },
                    { kh: 'd', vd: 'dog', vdNghia: '/dɒɡ/', viet: 'đ', luuY: '' },
                    { kh: 'k', vd: 'cat', vdNghia: '/kæt/', viet: 'c / k bật hơi', luuY: '' },
                    { kh: 'ɡ', vd: 'go', vdNghia: '/ɡəʊ/', viet: 'g', luuY: '' },
                    { kh: 'f', vd: 'fish', vdNghia: '/fɪʃ/', viet: 'ph', luuY: '' },
                    { kh: 'v', vd: 'very', vdNghia: '/ˈveri/', viet: 'v', luuY: 'Răng trên chạm môi dưới, đừng đọc thành "b".' },
                    { kh: 'θ', vd: 'think', vdNghia: '/θɪŋk/', viet: 'không có — gần "th" nhưng thổi hơi', luuY: 'Đặt đầu lưỡi giữa hai răng rồi thổi hơi ra, không rung.' },
                    { kh: 'ð', vd: 'this', vdNghia: '/ðɪs/', viet: 'không có — gần "đ" nhưng lưỡi giữa răng', luuY: 'Như θ nhưng cổ họng rung.' },
                    { kh: 's', vd: 'see', vdNghia: '/siː/', viet: 'x', luuY: 'Cuối từ (bus, books) phải nghe rõ tiếng xì.' },
                    { kh: 'z', vd: 'zoo', vdNghia: '/zuː/', viet: 'd (giọng Bắc), có rung', luuY: '' },
                    { kh: 'ʃ', vd: 'she', vdNghia: '/ʃiː/', viet: 's cong lưỡi, môi chu ra', luuY: '' },
                    { kh: 'ʒ', vd: 'vision', vdNghia: '/ˈvɪʒn/', viet: 'gi rung, môi chu', luuY: '' },
                    { kh: 'tʃ', vd: 'chair', vdNghia: '/tʃeə/', viet: 'ch, môi chu ra', luuY: '' },
                    { kh: 'dʒ', vd: 'job', vdNghia: '/dʒɒb/', viet: 'ch có rung (gần "gi")', luuY: '' },
                    { kh: 'h', vd: 'hat', vdNghia: '/hæt/', viet: 'h', luuY: '' },
                    { kh: 'm', vd: 'man', vdNghia: '/mæn/', viet: 'm', luuY: '' },
                    { kh: 'n', vd: 'no', vdNghia: '/nəʊ/', viet: 'n', luuY: '' },
                    { kh: 'ŋ', vd: 'sing', vdNghia: '/sɪŋ/', viet: 'ng', luuY: 'Không thêm "g" phía sau: sing, không "sing-gờ".' },
                    { kh: 'l', vd: 'leg', vdNghia: '/leɡ/', viet: 'l', luuY: 'Cuối từ (feel, call) lưỡi vẫn chạm lợi trên.' },
                    { kh: 'r', vd: 'red', vdNghia: '/red/', viet: 'r uốn lưỡi, không rung', luuY: 'Lưỡi cong lên, không chạm vòm miệng.' },
                    { kh: 'w', vd: 'we', vdNghia: '/wiː/', viet: 'u lướt (như "qu" trong "quê")', luuY: '' },
                    { kh: 'j', vd: 'yes', vdNghia: '/jes/', viet: 'i lướt (như "d" giọng Nam)', luuY: '' },
                ],
            },
        ],
    },

    zh: {
        ten: 'Bảng pinyin',
        moTa: 'Pinyin = thanh mẫu (phụ âm đầu) + vận mẫu (vần) + thanh điệu. Nhiều cặp chỉ khác nhau ở chỗ bật hơi: b/p, d/t, g/k, j/q, zh/ch, z/c.',
        nhom: [
            {
                ten: 'Thanh điệu',
                o: [
                    { kh: 'ā', phu: 'thanh 1', vd: '妈', vdNghia: 'mā — mẹ', viet: 'ngang, giữ CAO', luuY: 'Cao hơn thanh ngang tiếng Việt, giữ đều.' },
                    { kh: 'á', phu: 'thanh 2', vd: '麻', vdNghia: 'má — tê', viet: 'gần dấu sắc', luuY: 'Đi lên từ giữa lên cao.' },
                    { kh: 'ǎ', phu: 'thanh 3', vd: '马', vdNghia: 'mǎ — ngựa', viet: 'gần dấu hỏi', luuY: 'Xuống thấp rồi lên. Hai thanh 3 liền nhau: chữ đầu đọc thành thanh 2 (你好 → ní hǎo).' },
                    { kh: 'à', phu: 'thanh 4', vd: '骂', vdNghia: 'mà — mắng', viet: 'giữa dấu huyền và dấu nặng, dứt khoát', luuY: 'Rơi mạnh từ cao xuống thấp.' },
                    { kh: 'a', phu: 'thanh nhẹ', vd: '吗', vdNghia: 'ma — (trợ từ hỏi)', viet: 'đọc nhẹ, ngắn', luuY: '' },
                ],
            },
            {
                ten: 'Thanh mẫu',
                o: [
                    { kh: 'b', vd: '爸', vdNghia: 'bà — bố', viet: 'p không bật hơi (gần "b" nhẹ)', luuY: '' },
                    { kh: 'p', vd: '怕', vdNghia: 'pà — sợ', viet: 'p bật hơi mạnh', luuY: '' },
                    { kh: 'm', vd: '妈', vdNghia: 'mā — mẹ', viet: 'm', luuY: '' },
                    { kh: 'f', vd: '饭', vdNghia: 'fàn — cơm', viet: 'ph', luuY: '' },
                    { kh: 'd', vd: '大', vdNghia: 'dà — to', viet: 't (không bật hơi)', luuY: 'Không phải "đ".' },
                    { kh: 't', vd: '他', vdNghia: 'tā — anh ấy', viet: 'th', luuY: '' },
                    { kh: 'n', vd: '你', vdNghia: 'nǐ — bạn', viet: 'n', luuY: '' },
                    { kh: 'l', vd: '来', vdNghia: 'lái — đến', viet: 'l', luuY: '' },
                    { kh: 'g', vd: '哥', vdNghia: 'gē — anh trai', viet: 'c / k không bật hơi', luuY: 'Không phải "g" tiếng Việt.' },
                    { kh: 'k', vd: '看', vdNghia: 'kàn — xem', viet: 'kh (k bật hơi)', luuY: '' },
                    { kh: 'h', vd: '好', vdNghia: 'hǎo — tốt', viet: 'h hơi khàn, gần "kh"', luuY: '' },
                    { kh: 'j', vd: '家', vdNghia: 'jiā — nhà', viet: 'ch (lưỡi phẳng)', luuY: 'Chỉ đi với i, ü.' },
                    { kh: 'q', vd: '去', vdNghia: 'qù — đi', viet: 'ch bật hơi', luuY: '' },
                    { kh: 'x', vd: '谢', vdNghia: 'xiè — cảm ơn', viet: 'x (gần "s" nhẹ)', luuY: '' },
                    { kh: 'zh', vd: '中', vdNghia: 'zhōng — giữa', viet: 'tr (uốn lưỡi)', luuY: '' },
                    { kh: 'ch', vd: '吃', vdNghia: 'chī — ăn', viet: 'tr bật hơi', luuY: '' },
                    { kh: 'sh', vd: '是', vdNghia: 'shì — là', viet: 's uốn lưỡi', luuY: '' },
                    { kh: 'r', vd: '人', vdNghia: 'rén — người', viet: 'r uốn lưỡi nhẹ (gần "gi")', luuY: 'Không rung như "r" tiếng Việt.' },
                    { kh: 'z', vd: '在', vdNghia: 'zài — ở', viet: 'ch đầu lưỡi (gần "dz")', luuY: '' },
                    { kh: 'c', vd: '菜', vdNghia: 'cài — món ăn', viet: 'ch bật hơi đầu lưỡi (gần "ts")', luuY: '' },
                    { kh: 's', vd: '四', vdNghia: 'sì — bốn', viet: 'x', luuY: '' },
                ],
            },
            {
                ten: 'Vận mẫu',
                o: [
                    { kh: 'a', vd: '啊', vdNghia: 'a', viet: 'a', luuY: '' },
                    { kh: 'o', vd: '我', vdNghia: 'wǒ — tôi', viet: 'ua / uô (bo → "pua")', luuY: '' },
                    { kh: 'e', vd: '喝', vdNghia: 'hē — uống', viet: 'ưa / ơ', luuY: 'Không phải "e" tiếng Việt.' },
                    { kh: 'i', vd: '一', vdNghia: 'yī — một', viet: 'i', luuY: 'Sau zh ch sh r z c s đọc gần "ư": 是 shì ≈ "sư".' },
                    { kh: 'u', vd: '五', vdNghia: 'wǔ — năm', viet: 'u', luuY: '' },
                    { kh: 'ü', vd: '鱼', vdNghia: 'yú — cá', viet: 'uy (môi tròn đọc "i")', luuY: 'Sau j q x y viết là u nhưng vẫn đọc ü: 去 qù.' },
                    { kh: 'ai', vd: '爱', vdNghia: 'ài — yêu', viet: 'ai', luuY: '' },
                    { kh: 'ei', vd: '美', vdNghia: 'měi — đẹp', viet: 'ây', luuY: '' },
                    { kh: 'ao', vd: '好', vdNghia: 'hǎo — tốt', viet: 'ao', luuY: '' },
                    { kh: 'ou', vd: '口', vdNghia: 'kǒu — miệng', viet: 'âu', luuY: '' },
                    { kh: 'an', vd: '安', vdNghia: 'ān — yên', viet: 'an', luuY: '' },
                    { kh: 'en', vd: '门', vdNghia: 'mén — cửa', viet: 'ân', luuY: '' },
                    { kh: 'ang', vd: '忙', vdNghia: 'máng — bận', viet: 'ang', luuY: '' },
                    { kh: 'eng', vd: '冷', vdNghia: 'lěng — lạnh', viet: 'âng', luuY: '' },
                    { kh: 'ong', vd: '红', vdNghia: 'hóng — đỏ', viet: 'ung', luuY: '' },
                    { kh: 'ian', vd: '天', vdNghia: 'tiān — trời', viet: 'iên', luuY: 'Không đọc "ian".' },
                    { kh: 'er', vd: '二', vdNghia: 'èr — hai', viet: 'ơ + uốn lưỡi', luuY: '' },
                ],
            },
        ],
    },

    ja: {
        ten: 'Bảng chữ kana',
        moTa: 'Mỗi ô: hiragana và katakana cùng một âm, romaji, cách đọc kiểu Việt. Nguyên âm đọc ngắn và đều; っ nhỏ là ngắt một nhịp, nguyên âm dài kéo gấp đôi.',
        nhom: [
            {
                ten: 'Nguyên âm',
                o: [
                    kana('あ', 'ア', 'a', 'a'), kana('い', 'イ', 'i', 'i'),
                    kana('う', 'ウ', 'u', 'ư', 'Môi không tròn: gần "ư" hơn "u".'),
                    kana('え', 'エ', 'e', 'ê'), kana('お', 'オ', 'o', 'ô'),
                ],
            },
            {
                ten: 'Hàng K · S · T',
                o: [
                    kana('か', 'カ', 'ka', 'ca'), kana('き', 'キ', 'ki', 'ki'), kana('く', 'ク', 'ku', 'cư'), kana('け', 'ケ', 'ke', 'kê'), kana('こ', 'コ', 'ko', 'cô'),
                    kana('さ', 'サ', 'sa', 'xa'), kana('し', 'シ', 'shi', 'si (s nhẹ, gần "shi")'), kana('す', 'ス', 'su', 'xư'), kana('せ', 'セ', 'se', 'xê'), kana('そ', 'ソ', 'so', 'xô'),
                    kana('た', 'タ', 'ta', 'ta'), kana('ち', 'チ', 'chi', 'chi'), kana('つ', 'ツ', 'tsu', 'chư (gần "txư")', 'Đầu lưỡi chạm răng rồi xì ra.'), kana('て', 'テ', 'te', 'tê'), kana('と', 'ト', 'to', 'tô'),
                ],
            },
            {
                ten: 'Hàng N · H · M',
                o: [
                    kana('な', 'ナ', 'na', 'na'), kana('に', 'ニ', 'ni', 'ni'), kana('ぬ', 'ヌ', 'nu', 'nư'), kana('ね', 'ネ', 'ne', 'nê'), kana('の', 'ノ', 'no', 'nô'),
                    kana('は', 'ハ', 'ha', 'ha', 'Làm trợ từ thì đọc "wa".'), kana('ひ', 'ヒ', 'hi', 'hi'), kana('ふ', 'フ', 'fu', 'hư (thổi hơi qua hai môi)', 'Không phải "phư": môi không chạm răng.'), kana('へ', 'ヘ', 'he', 'hê', 'Làm trợ từ thì đọc "ê".'), kana('ほ', 'ホ', 'ho', 'hô'),
                    kana('ま', 'マ', 'ma', 'ma'), kana('み', 'ミ', 'mi', 'mi'), kana('む', 'ム', 'mu', 'mư'), kana('め', 'メ', 'me', 'mê'), kana('も', 'モ', 'mo', 'mô'),
                ],
            },
            {
                ten: 'Hàng Y · R · W · ん',
                o: [
                    kana('や', 'ヤ', 'ya', 'da (i-a)'), kana('ゆ', 'ユ', 'yu', 'du (i-ư)'), kana('よ', 'ヨ', 'yo', 'dô (i-ô)'),
                    kana('ら', 'ラ', 'ra', 'ra (giữa "r" và "l")', 'Đầu lưỡi bật nhẹ một lần, không rung.'), kana('り', 'リ', 'ri', 'ri'), kana('る', 'ル', 'ru', 'rư'), kana('れ', 'レ', 're', 'rê'), kana('ろ', 'ロ', 'ro', 'rô'),
                    kana('わ', 'ワ', 'wa', 'oa'), kana('を', 'ヲ', 'o', 'ô', 'Chỉ dùng làm trợ từ.'),
                    kana('ん', 'ン', 'n', 'n / m / ng', 'Đọc theo âm sau: trước b, m, p thành "m"; trước k, g thành "ng".'),
                ],
            },
            {
                ten: 'Âm đục (゛ ゜)',
                o: [
                    kana('が', 'ガ', 'ga', 'ga'), kana('ぎ', 'ギ', 'gi', 'ghi'), kana('ぐ', 'グ', 'gu', 'gư'), kana('げ', 'ゲ', 'ge', 'ghê'), kana('ご', 'ゴ', 'go', 'gô'),
                    kana('ざ', 'ザ', 'za', 'da (rung)'), kana('じ', 'ジ', 'ji', 'gi'), kana('ず', 'ズ', 'zu', 'dư'), kana('ぜ', 'ゼ', 'ze', 'dê'), kana('ぞ', 'ゾ', 'zo', 'dô'),
                    kana('だ', 'ダ', 'da', 'đa'), kana('で', 'デ', 'de', 'đê'), kana('ど', 'ド', 'do', 'đô'),
                    kana('ば', 'バ', 'ba', 'ba'), kana('び', 'ビ', 'bi', 'bi'), kana('ぶ', 'ブ', 'bu', 'bư'), kana('べ', 'ベ', 'be', 'bê'), kana('ぼ', 'ボ', 'bo', 'bô'),
                    kana('ぱ', 'パ', 'pa', 'pa'), kana('ぴ', 'ピ', 'pi', 'pi'), kana('ぷ', 'プ', 'pu', 'pư'), kana('ぺ', 'ペ', 'pe', 'pê'), kana('ぽ', 'ポ', 'po', 'pô'),
                ],
            },
        ],
    },

    ko: {
        ten: 'Bảng chữ Hangul',
        moTa: 'Mỗi âm tiết = phụ âm đầu + nguyên âm (+ phụ âm cuối — patchim). Ba nhóm phụ âm khác nhau ở độ bật hơi: thường (ㄱ), bật hơi (ㅋ), căng (ㄲ).',
        nhom: [
            {
                ten: 'Nguyên âm cơ bản',
                o: [
                    { kh: 'ㅏ', phu: 'a', vd: '아', viet: 'a', luuY: '' },
                    { kh: 'ㅑ', phu: 'ya', vd: '야', viet: 'da (i-a)', luuY: '' },
                    { kh: 'ㅓ', phu: 'eo', vd: '어', viet: 'ơ (miệng mở rộng, gần "o")', luuY: 'Khác ㅗ: môi không tròn.' },
                    { kh: 'ㅕ', phu: 'yeo', vd: '여', viet: 'dơ (i-ơ)', luuY: '' },
                    { kh: 'ㅗ', phu: 'o', vd: '오', viet: 'ô (môi tròn)', luuY: '' },
                    { kh: 'ㅛ', phu: 'yo', vd: '요', viet: 'dô (i-ô)', luuY: '' },
                    { kh: 'ㅜ', phu: 'u', vd: '우', viet: 'u', luuY: '' },
                    { kh: 'ㅠ', phu: 'yu', vd: '유', viet: 'diu (i-u)', luuY: '' },
                    { kh: 'ㅡ', phu: 'eu', vd: '으', viet: 'ư', luuY: '' },
                    { kh: 'ㅣ', phu: 'i', vd: '이', viet: 'i', luuY: '' },
                ],
            },
            {
                ten: 'Nguyên âm ghép',
                o: [
                    { kh: 'ㅐ', phu: 'ae', vd: '애', viet: 'e', luuY: 'Ngày nay đọc gần như ㅔ.' },
                    { kh: 'ㅔ', phu: 'e', vd: '에', viet: 'ê', luuY: '' },
                    { kh: 'ㅒ', phu: 'yae', vd: '얘', viet: 'ie', luuY: '' },
                    { kh: 'ㅖ', phu: 'ye', vd: '예', viet: 'iê', luuY: '' },
                    { kh: 'ㅘ', phu: 'wa', vd: '와', viet: 'oa', luuY: '' },
                    { kh: 'ㅙ', phu: 'wae', vd: '왜', viet: 'oe', luuY: '' },
                    { kh: 'ㅚ', phu: 'oe', vd: '외', viet: 'uê', luuY: '' },
                    { kh: 'ㅝ', phu: 'wo', vd: '워', viet: 'uơ', luuY: '' },
                    { kh: 'ㅞ', phu: 'we', vd: '웨', viet: 'uê', luuY: '' },
                    { kh: 'ㅟ', phu: 'wi', vd: '위', viet: 'uy', luuY: '' },
                    { kh: 'ㅢ', phu: 'ui', vd: '의', viet: 'ưi', luuY: 'Làm trợ từ sở hữu thì đọc "ê".' },
                ],
            },
            {
                ten: 'Phụ âm thường',
                o: [
                    { kh: 'ㄱ', phu: 'g/k', vd: '가', viet: 'c (giữa hai nguyên âm gần "g")', luuY: 'Cuối âm tiết đọc "c" tắc, không bật.' },
                    { kh: 'ㄴ', phu: 'n', vd: '나', viet: 'n', luuY: '' },
                    { kh: 'ㄷ', phu: 'd/t', vd: '다', viet: 't (giữa hai nguyên âm gần "đ")', luuY: '' },
                    { kh: 'ㄹ', phu: 'r/l', vd: '라', viet: 'r lướt (đầu âm) / l (cuối âm)', luuY: 'Không rung như "r" tiếng Việt.' },
                    { kh: 'ㅁ', phu: 'm', vd: '마', viet: 'm', luuY: '' },
                    { kh: 'ㅂ', phu: 'b/p', vd: '바', viet: 'p nhẹ (giữa hai nguyên âm gần "b")', luuY: '' },
                    { kh: 'ㅅ', phu: 's', vd: '사', viet: 'x', luuY: 'Trước ㅣ đọc gần "s" (시 ≈ "shi").' },
                    { kh: 'ㅇ', phu: '-/ng', vd: '앙', viet: 'câm ở đầu / "ng" ở cuối', luuY: '' },
                    { kh: 'ㅈ', phu: 'j', vd: '자', viet: 'ch', luuY: '' },
                    { kh: 'ㅎ', phu: 'h', vd: '하', viet: 'h', luuY: '' },
                ],
            },
            {
                ten: 'Phụ âm bật hơi',
                o: [
                    { kh: 'ㅋ', phu: 'k', vd: '카', viet: 'kh (k bật hơi mạnh)', luuY: '' },
                    { kh: 'ㅌ', phu: 't', vd: '타', viet: 'th', luuY: '' },
                    { kh: 'ㅍ', phu: 'p', vd: '파', viet: 'p bật hơi mạnh', luuY: 'Không phải "ph".' },
                    { kh: 'ㅊ', phu: 'ch', vd: '차', viet: 'ch bật hơi', luuY: '' },
                ],
            },
            {
                ten: 'Phụ âm căng',
                o: [
                    { kh: 'ㄲ', phu: 'kk', vd: '까', viet: 'c căng, không hơi (gần "c" Việt)', luuY: 'Căng cổ họng, đọc dứt khoát.' },
                    { kh: 'ㄸ', phu: 'tt', vd: '따', viet: 't căng (gần "t" Việt)', luuY: '' },
                    { kh: 'ㅃ', phu: 'pp', vd: '빠', viet: 'p căng, không hơi', luuY: '' },
                    { kh: 'ㅆ', phu: 'ss', vd: '싸', viet: 'x căng, mạnh', luuY: '' },
                    { kh: 'ㅉ', phu: 'jj', vd: '짜', viet: 'ch căng (gần "ch" Việt)', luuY: '' },
                ],
            },
        ],
    },
};
