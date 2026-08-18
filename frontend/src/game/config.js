// ===================================
// GAME CONFIGURATION
// ===================================

export const Config = {

    // Game Settings
    game: {
        name: 'LevelUp TOEIC',
        version: '1.0.0',
        maxLevel: 100, // Max level cap
        maxEnergy: 100,
        energyRegenRate: 1, // 1 energy per minute
        energyRegenInterval: 60000, // 60 seconds in milliseconds
    },

    // Energy costs for each game mode
    energyCosts: {
        'multiple-choice': 10,
        'fill-blank': 15,
        'listening': 12,
        'matching': 10,
        'speed-quiz': 20,
        'flashcard': 8,
        'synonym-check': 10,
        'word-type-check': 10,
        'example-fill-blank': 12,
        'review-mistakes': 0,  // MIỄN PHÍ — ôn lại lỗi của mình, phải khớp backend/utils/energyCosts.js
        'sentence-builder': 15, // Xếp câu - độ khó cao
        'pronunciation': 15, // Phát âm - độ khó cao
        'context-learning': 10, // Học từ qua câu ví dụ
        'dictation': 15,          // Chép chính tả - nghe gõ lại
        'sentence-listening': 12, // Nghe câu, tìm từ
        'phonetic-quiz': 12,      // Nhận diện phiên âm IPA
        'hanzi-writing': 15       // Viết chữ Hán theo nét — phải khớp backend/utils/energyCosts.js
    },

    // XP rewards
    xpRewards: {
        correctAnswer: 10,
        perfectRound: 50, // All answers correct
        speedBonus: 20,   // Complete quickly
        firstAttempt: 15, // Correct on first try
        streak: 5         // Per streak day
    },

    // Coins rewards
    coinsRewards: {
        correctAnswer: 5,
        perfectRound: 25,
        dailyQuest: 50,
        levelUp: 100
    },

    // Shop items
    shopItems: [
        // ===== NĂNG LƯỢNG (ENERGY) =====
        {
            id: 'energy-refill',
            name: 'Nạp Năng Lượng',
            description: 'Khôi phục 100% năng lượng ngay lập tức',
            icon: '⚡',
            price: 147,
            originalPrice: 150,
            currency: 'coins',
            effect: { type: 'energy', amount: 100 }
        },

        // ===== GỢI Ý (HINTS) =====
        {
            id: 'hints-pack',
            name: 'Gói Gợi Ý',
            description: 'Nhận 10 lượt sử dụng gợi ý',
            icon: '💡',
            price: 200,
            currency: 'coins',
            effect: { type: 'hints', amount: 10 }
        },

        // ===== KHIÊN BẢO VỆ (SHIELDS) =====
        {
            id: 'shields-pack',
            name: 'Gói Khiên Bảo Vệ',
            description: 'Nhận 3 khiên bảo vệ streak',
            icon: '🛡️',
            price: 250,
            currency: 'coins',
            effect: { type: 'shield', amount: 3 }
        },

        // ===== DỪNG THỜI GIAN (TIME FREEZE) =====
        {
            id: 'time-freeze-pack',
            name: 'Gói Dừng Thời Gian',
            description: 'Nhận 5 lượt dừng thời gian (10s/lượt)',
            icon: '⏸️',
            price: 300,
            currency: 'coins',
            effect: { type: 'timeFreeze', amount: 5 }
        },

        // ===== TĂNG TỐC XP =====
        {
            id: 'xp-boost-3h',
            name: 'x2 XP (3 giờ)',
            description: 'Nhận gấp đôi XP trong 3 giờ',
            icon: '🚀',
            price: 350,
            currency: 'coins',
            effect: { type: 'boost', boostType: 'xp', multiplier: 2, duration: 10800 }
        },
        {
            id: 'xp-boost-24h',
            name: 'x2 XP (24 giờ)',
            description: 'Nhận gấp đôi XP cả ngày',
            icon: '🚀',
            price: 100,
            currency: 'gems',
            effect: { type: 'boost', boostType: 'xp', multiplier: 2, duration: 86400 }
        },

        // ===== TĂNG TỐC COINS =====
        {
            id: 'coins-boost-3h',
            name: 'x2 Coins (3 giờ)',
            description: 'Nhận gấp đôi coins trong 3 giờ',
            icon: '💰',
            price: 300,
            currency: 'coins',
            effect: { type: 'boost', boostType: 'coins', multiplier: 2, duration: 10800 }
        },
        {
            id: 'coins-boost-24h',
            name: 'x2 Coins (24 giờ)',
            description: 'Nhận gấp đôi coins cả ngày',
            icon: '💰',
            price: 80,
            currency: 'gems',
            effect: { type: 'boost', boostType: 'coins', multiplier: 2, duration: 86400 }
        },

        // ===== ĐỔI GEMS (CURRENCY EXCHANGE) =====
        {
            id: 'gems-exchange-small',
            name: 'Đổi 10 Gems',
            description: '1000 coins → 10 gems',
            icon: '💎',
            price: 1000,
            currency: 'coins',
            effect: { type: 'gems', amount: 10 }
        },
        {
            id: 'gems-exchange-medium',
            name: 'Đổi 30 Gems',
            description: '2800 coins → 30 gems (Giảm 7%)',
            icon: '💎',
            price: 2800,
            currency: 'coins',
            effect: { type: 'gems', amount: 30 }
        },
        {
            id: 'gems-exchange-large',
            name: 'Đổi 100 Gems',
            description: '9000 coins → 100 gems (Giảm 10%)',
            icon: '💎',
            price: 9000,
            currency: 'coins',
            effect: { type: 'gems', amount: 100 }
        },

        // ===== GÓI COMBO =====
        {
            id: 'daily-pack',
            name: 'Gói Hằng Ngày',
            description: 'x2 XP + x2 Coins trong 24h',
            icon: '⚡',
            price: 150,
            currency: 'gems',
            effect: { type: 'combo', items: [
                { type: 'boost', boostType: 'xp', multiplier: 2, duration: 86400 },
                { type: 'boost', boostType: 'coins', multiplier: 2, duration: 86400 }
            ]}
        },
        {
            id: 'mega-bundle',
            name: 'Gói Siêu Hạng',
            description: '500 coins + 20 hints + 5 shields + x2 XP 24h',
            icon: '🎁',
            price: 250,
            currency: 'gems',
            effect: { type: 'combo', items: [
                { type: 'coins', amount: 500 },
                { type: 'hints', amount: 20 },
                { type: 'shield', amount: 5 },
                { type: 'boost', boostType: 'xp', multiplier: 2, duration: 86400 }
            ]}
        },

        // ===== VIP =====
        {
            id: 'vip-week',
            name: 'VIP Tuần',
            description: 'Unlimited energy + x2 XP/Coins trong 7 ngày',
            icon: '👑',
            price: 300,
            currency: 'gems',
            effect: { type: 'vip', duration: 604800 }
        },
        {
            id: 'vip-month',
            name: 'VIP Tháng',
            description: 'Unlimited energy + x2 XP/Coins trong 30 ngày',
            icon: '👑',
            price: 1000,
            currency: 'gems',
            effect: { type: 'vip', duration: 2592000 }
        }
    ],

    // Daily quests templates
    dailyQuestsTemplates: [
        {
            id: 'complete-games',
            name: 'Hoàn thành {target} lượt chơi',
            description: 'Chơi bất kỳ chế độ nào',
            icon: '🎮',
            type: 'complete-games',
            target: 5,
            progress: 0,
            reward: { coins: 50, xp: 25, gems: 2 }
        },
        {
            id: 'correct-answers',
            name: 'Trả lời đúng {target} câu',
            description: 'Trả lời đúng trong bất kỳ chế độ nào',
            icon: '✅',
            type: 'correct-answers',
            target: 20,
            progress: 0,
            reward: { coins: 75, xp: 40, gems: 3 }
        },
        {
            id: 'perfect-rounds',
            name: 'Đạt {target} vòng hoàn hảo',
            description: 'Trả lời đúng tất cả câu hỏi trong 1 vòng',
            icon: '⭐',
            type: 'perfect-rounds',
            target: 2,
            progress: 0,
            reward: { coins: 100, xp: 50, gems: 5 }
        },
        {
            id: 'earn-xp',
            name: 'Kiếm {target} XP',
            description: 'Tích lũy kinh nghiệm',
            icon: '📈',
            type: 'earn-xp',
            target: 200,
            progress: 0,
            reward: { coins: 80, xp: 30, gems: 3 }
        },
        {
            id: 'speed-quiz',
            name: 'Chơi {target} lượt Speed Quiz',
            description: 'Hoàn thành chế độ tốc độ',
            icon: '⚡',
            type: 'play-mode',
            mode: 'speed-quiz',
            target: 3,
            progress: 0,
            reward: { coins: 60, xp: 35, gems: 2 }
        },
        {
            id: 'daily-streak',
            name: 'Duy trì streak hôm nay',
            description: 'Chơi ít nhất 1 game mỗi ngày',
            icon: '🔥',
            type: 'daily-streak',
            target: 1,
            progress: 0,
            reward: { coins: 100, xp: 50, gems: 5 }
        },
        {
            id: 'master-words',
            name: 'Học {target} từ mới',
            description: 'Làm quen với từ vựng mới',
            icon: '📚',
            type: 'learn-words',
            target: 15,
            progress: 0,
            reward: { coins: 90, xp: 45, gems: 4 }
        }
    ],

    // Achievement definitions
    achievements: [
        {
            id: 'first-win',
            name: 'Chiến thắng đầu tiên',
            description: 'Hoàn thành vòng đầu tiên với điểm số hoàn hảo',
            icon: '🏆',
            condition: { type: 'perfect-rounds', count: 1 },
            reward: { coins: 100, xp: 50 },
            unlocked: false
        },
        {
            id: 'streak-7',
            name: 'Kiên trì 1 tuần',
            description: 'Duy trì streak 7 ngày liên tục',
            icon: '🔥',
            condition: { type: 'streak', days: 7 },
            reward: { coins: 200, xp: 100 },
            unlocked: false
        },
        {
            id: 'streak-30',
            name: 'Kiên trì 1 tháng',
            description: 'Duy trì streak 30 ngày liên tục',
            icon: '🔥',
            condition: { type: 'streak', days: 30 },
            reward: { coins: 1000, xp: 500, gems: 50 },
            unlocked: false
        },
        {
            id: 'level-10',
            name: 'Cao thủ',
            description: 'Đạt level 10',
            icon: '⭐',
            condition: { type: 'level', level: 10 },
            reward: { coins: 500, xp: 0, gems: 20 },
            unlocked: false
        },
        {
            id: 'words-100',
            name: 'Từ vựng phong phú',
            description: 'Học 100 từ vựng',
            icon: '📚',
            condition: { type: 'words-learned', count: 100 },
            reward: { coins: 300, xp: 150 },
            unlocked: false
        },
        {
            id: 'words-500',
            name: 'Bậc thầy từ vựng',
            description: 'Học 500 từ vựng',
            icon: '📚',
            condition: { type: 'words-learned', count: 500 },
            reward: { coins: 2000, xp: 1000, gems: 100 },
            unlocked: false
        },
        {
            id: 'perfect-100',
            name: 'Hoàn hảo',
            description: 'Đạt 100 vòng hoàn hảo',
            icon: '💯',
            condition: { type: 'perfect-rounds', count: 100 },
            reward: { coins: 1500, xp: 750, gems: 75 },
            unlocked: false
        },
        {
            id: 'speed-master',
            name: 'Tốc độ ánh sáng',
            description: 'Hoàn thành 50 lượt Speed Quiz',
            icon: '⚡',
            condition: { type: 'mode-plays', mode: 'speed-quiz', count: 50 },
            reward: { coins: 400, xp: 200 },
            unlocked: false
        }
    ],

    // Practice mode settings
    practice: {
        'multiple-choice': {
            questionsPerRound: 10,
            timeLimit: 300, // 5 minutes
            optionsCount: 4,
            pointsPerCorrect: 100
        },
        'fill-blank': {
            questionsPerRound: 10,
            timeLimit: 360, // 6 minutes
            pointsPerCorrect: 150
        },
        'listening': {
            questionsPerRound: 10,
            timeLimit: 300,
            optionsCount: 4,
            pointsPerCorrect: 120
        },
        'matching': {
            pairsCount: 8,
            timeLimit: 180, // 3 minutes
            pointsPerMatch: 100
        },
        'speed-quiz': {
            questionsPerRound: 20,
            timePerQuestion: 10, // 10 seconds per question
            pointsPerCorrect: 100,
            speedBonusMultiplier: 1.5
        },
        'flashcard': {
            questionsPerRound: 20,
            timeLimit: 0, // không giới hạn thời gian
            baseScorePerCorrect: 10
        },
        'synonym-check': {
            questionsPerRound: 10,
            timeLimit: 300, // 5 minutes
            optionsCount: 4,
            pointsPerCorrect: 100
        },
        'word-type-check': {
            questionsPerRound: 10,
            timeLimit: 300, // 5 minutes
            // 4 như mọi chế độ trắc nghiệm khác: 1 đúng + 3 nhiễu.
            //
            // Trước là 6 với lý do "đủ 6 từ loại cơ bản" — nhưng kho tiếng Trung
            // có tới 56 từ loại, nên 6 ô không hề "đủ" mà chỉ làm hàng đáp án
            // tràn xuống hai dòng và loãng lựa chọn.
            optionsCount: 4,
            pointsPerCorrect: 100
        },
        'example-fill-blank': {
            questionsPerRound: 10,
            timeLimit: 300, // 5 minutes
            optionsCount: 4,
            pointsPerCorrect: 120
        },
        'review-mistakes': {
            questionsPerRound: 10, // Sẽ lấy từ wrongWords
            timeLimit: 300, // 5 minutes
            optionsCount: 4,
            pointsPerCorrect: 150 // Bonus điểm cho việc sửa lỗi
        },
        'sentence-builder': {
            questionsPerRound: 10,
            timeLimit: 400, // 6 phút 40 giây (vì khó hơn)
            pointsPerCorrect: 150, // Điểm cao vì độ khó cao
            hintCost: 50 // Cost in coins
        },
        'pronunciation': {
            questionsPerRound: 10,
            timeLimit: 300, // 5 minutes
            pointsPerCorrect: 150,
            maxAttempts: 3, // Sai quá 3 lần thì chuyển câu
            recognitionLang: 'en-US' // Language for speech recognition
        },
        'context-learning': {
            questionsPerRound: 10,
            timeLimit: 300,
            optionsCount: 4,
            pointsPerCorrect: 120
        },
        'dictation': {
            questionsPerRound: 10,
            timeLimit: 420, // 7 phút - cần thời gian gõ
            pointsPerCorrect: 150
        },
        'sentence-listening': {
            questionsPerRound: 10,
            timeLimit: 360,
            optionsCount: 4,
            pointsPerCorrect: 130
        },
        'phonetic-quiz': {
            questionsPerRound: 10,
            timeLimit: 300,
            optionsCount: 4,
            pointsPerCorrect: 140
        },
        'hanzi-writing': {
            // Ít câu hơn các chế độ khác: viết tay một chữ 15-20 nét mất hàng chục
            // giây, 10 chữ là một lượt dài hơn hẳn 10 câu trắc nghiệm.
            questionsPerRound: 8,
            timeLimit: 600,
            pointsPerCorrect: 150
        }
    },

    // Sound effects (paths will be updated when sounds are added)
    sounds: {
        making: 'assets/sounds/makingtask.mp3',
        complete: 'assets/sounds/complete.mp3',
        buyItem: 'assets/sounds/buyitem.mp3',
        correct: 'assets/sounds/correct.mp3',
        wrong: 'assets/sounds/wrong.mp3',
        levelUp: 'assets/sounds/level-up.mp3',
        achievement: 'assets/sounds/achieve.mp3',
        reward: 'assets/sounds/achieve.mp3',
        click: 'assets/sounds/click.mp3',
        coin: 'assets/sounds/coin.mp3',
        quest: 'assets/sounds/achieve.mp3'
    },

    // UI Settings
    ui: {
        animationDuration: 300,
        notificationDuration: 3000,
        modalFadeTime: 200,
        autoSaveInterval: 30000 // Auto save every 30 seconds
    },

    // Data paths (từ vựng nạp từ MongoDB qua /api/vocabulary — không còn file JSON local)
    data: {
        userProgress: 'userProgress',
        gameState: 'gameState'
    },

    // API configuration
    api: {
        baseUrl: '/api', // Backend API URL
        timeout: 10000, // 10 seconds
    },

    // Available vocabulary sets (will be auto-detected from folder)
    vocabularySets: []
};

