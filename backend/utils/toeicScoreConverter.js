/**
 * TOEIC Score Conversion Utility
 *
 * Converts raw scores (number of correct answers) to TOEIC scaled scores.
 * Note: This is a simplified conversion table. The actual ETS conversion uses
 * Item Response Theory (IRT) which considers question difficulty.
 *
 * Listening: 100 questions → 5-495 points
 * Reading: 100 questions → 5-495 points
 * Total: 200 questions → 10-990 points
 */

// Listening Score Conversion Table (100 questions max)
const LISTENING_CONVERSION = {
    0: 5, 1: 5, 2: 5, 3: 5, 4: 5,
    5: 25, 6: 30, 7: 35, 8: 40, 9: 45,
    10: 50, 11: 55, 12: 60, 13: 65, 14: 70,
    15: 75, 16: 80, 17: 85, 18: 90, 19: 95,
    20: 100, 21: 105, 22: 110, 23: 115, 24: 120,
    25: 125, 26: 130, 27: 135, 28: 140, 29: 145,
    30: 150, 31: 155, 32: 160, 33: 165, 34: 170,
    35: 175, 36: 180, 37: 185, 38: 190, 39: 195,
    40: 200, 41: 205, 42: 210, 43: 215, 44: 220,
    45: 225, 46: 230, 47: 235, 48: 240, 49: 245,
    50: 250, 51: 255, 52: 260, 53: 265, 54: 270,
    55: 275, 56: 280, 57: 285, 58: 290, 59: 295,
    60: 300, 61: 305, 62: 310, 63: 315, 64: 320,
    65: 325, 66: 330, 67: 335, 68: 340, 69: 345,
    70: 350, 71: 355, 72: 360, 73: 365, 74: 370,
    75: 375, 76: 380, 77: 385, 78: 390, 79: 395,
    80: 400, 81: 405, 82: 410, 83: 415, 84: 420,
    85: 425, 86: 430, 87: 435, 88: 440, 89: 445,
    90: 450, 91: 455, 92: 460, 93: 465, 94: 470,
    95: 475, 96: 480, 97: 485, 98: 490, 99: 493,
    100: 495,
};

// Reading Score Conversion Table (100 questions max)
const READING_CONVERSION = {
    0: 5, 1: 5, 2: 5, 3: 5, 4: 5,
    5: 20, 6: 25, 7: 30, 8: 35, 9: 40,
    10: 45, 11: 50, 12: 55, 13: 60, 14: 65,
    15: 70, 16: 75, 17: 80, 18: 85, 19: 90,
    20: 95, 21: 100, 22: 105, 23: 110, 24: 115,
    25: 120, 26: 125, 27: 130, 28: 135, 29: 140,
    30: 145, 31: 150, 32: 155, 33: 160, 34: 165,
    35: 170, 36: 175, 37: 180, 38: 185, 39: 190,
    40: 195, 41: 200, 42: 205, 43: 210, 44: 215,
    45: 220, 46: 225, 47: 230, 48: 235, 49: 240,
    50: 245, 51: 250, 52: 255, 53: 260, 54: 265,
    55: 270, 56: 275, 57: 280, 58: 285, 59: 290,
    60: 295, 61: 300, 62: 305, 63: 310, 64: 315,
    65: 320, 66: 325, 67: 330, 68: 335, 69: 340,
    70: 345, 71: 350, 72: 355, 73: 360, 74: 365,
    75: 370, 76: 375, 77: 380, 78: 385, 79: 390,
    80: 395, 81: 400, 82: 405, 83: 410, 84: 415,
    85: 420, 86: 425, 87: 430, 88: 435, 89: 440,
    90: 445, 91: 450, 92: 455, 93: 460, 94: 465,
    95: 470, 96: 475, 97: 480, 98: 485, 99: 490,
    100: 495,
};

/**
 * Convert raw score to TOEIC scaled score
 * @param {string} section - 'listening' or 'reading'
 * @param {number} correctAnswers - Number of correct answers
 * @returns {number} TOEIC scaled score (5-495)
 */
function convertToToeicScore(section, correctAnswers) {
    // Ensure correctAnswers is within valid range
    const validCorrect = Math.max(0, Math.min(100, Math.round(correctAnswers)));

    if (section === 'listening') {
        return LISTENING_CONVERSION[validCorrect] || 5;
    } else if (section === 'reading') {
        return READING_CONVERSION[validCorrect] || 5;
    }

    throw new Error('Invalid section. Must be "listening" or "reading"');
}

/**
 * Get TOEIC level description based on total score
 * @param {number} totalScore - Total TOEIC score (10-990)
 * @returns {object} Level information
 */
function getToeicLevel(totalScore) {
    if (totalScore >= 945) {
        return {
            level: 'A+',
            cefr: 'C1',
            description: 'Advanced - Non-native speaker, can function effectively in most situations',
            color: '#FFD700', // Gold
        };
    } else if (totalScore >= 785) {
        return {
            level: 'A',
            cefr: 'B2',
            description: 'Intermediate High - Can handle most business situations',
            color: '#C0C0C0', // Silver
        };
    } else if (totalScore >= 605) {
        return {
            level: 'B+',
            cefr: 'B1',
            description: 'Intermediate - Can handle routine work requirements',
            color: '#CD7F32', // Bronze
        };
    } else if (totalScore >= 405) {
        return {
            level: 'B',
            cefr: 'A2',
            description: 'Pre-Intermediate - Limited working proficiency',
            color: '#87CEEB', // Light Blue
        };
    } else if (totalScore >= 255) {
        return {
            level: 'C',
            cefr: 'A1',
            description: 'Elementary - Basic communication',
            color: '#90EE90', // Light Green
        };
    } else {
        return {
            level: 'D',
            cefr: 'A1',
            description: 'Beginner - Very limited communication',
            color: '#FFB6C1', // Light Pink
        };
    }
}

/**
 * Get score interpretation and recommendations
 * @param {number} totalScore - Total TOEIC score
 * @param {number} listeningScore - Listening score
 * @param {number} readingScore - Reading score
 * @returns {object} Interpretation and recommendations
 */
function getScoreInterpretation(totalScore, listeningScore, readingScore) {
    const levelInfo = getToeicLevel(totalScore);
    const balance = Math.abs(listeningScore - readingScore);

    let balanceComment = '';
    let recommendations = [];

    if (balance <= 25) {
        balanceComment = 'Well-balanced skills between listening and reading';
    } else if (listeningScore > readingScore) {
        balanceComment = 'Listening skills are stronger than reading';
        recommendations.push('Focus on reading practice and vocabulary building');
        recommendations.push('Practice reading comprehension exercises');
    } else {
        balanceComment = 'Reading skills are stronger than listening';
        recommendations.push('Increase listening practice time');
        recommendations.push('Watch English media with subtitles');
    }

    // Score-based recommendations
    if (totalScore < 400) {
        recommendations.push('Build fundamental grammar and vocabulary');
        recommendations.push('Start with basic TOEIC materials');
    } else if (totalScore < 600) {
        recommendations.push('Practice with intermediate-level materials');
        recommendations.push('Focus on common business scenarios');
    } else if (totalScore < 800) {
        recommendations.push('Work on advanced grammar and vocabulary');
        recommendations.push('Practice with authentic materials');
    } else {
        recommendations.push('Maintain your skills with regular practice');
        recommendations.push('Focus on industry-specific vocabulary');
    }

    return {
        level: levelInfo,
        balanceComment,
        recommendations,
        listeningPercentage: Math.round((listeningScore / 495) * 100),
        readingPercentage: Math.round((readingScore / 495) * 100),
    };
}

/**
 * Calculate percentile rank
 * @param {number} totalScore - User's total score
 * @param {Array<number>} allScores - Array of all scores to compare against
 * @returns {number} Percentile rank (0-100)
 */
function calculatePercentile(totalScore, allScores) {
    if (!allScores || allScores.length === 0) return 50;

    const lowerScores = allScores.filter(score => score < totalScore).length;
    const percentile = Math.round((lowerScores / allScores.length) * 100);

    return percentile;
}

/**
 * Get score band for a given score
 * @param {number} score - TOEIC score
 * @returns {string} Score band (e.g., "700-795")
 */
function getScoreBand(score) {
    const bands = [
        { min: 945, max: 990, label: '945-990' },
        { min: 785, max: 944, label: '785-944' },
        { min: 605, max: 784, label: '605-784' },
        { min: 405, max: 604, label: '405-604' },
        { min: 255, max: 404, label: '255-404' },
        { min: 10, max: 254, label: '10-254' },
    ];

    const band = bands.find(b => score >= b.min && score <= b.max);
    return band ? band.label : 'Unknown';
}

/**
 * Estimate required practice hours to reach target score
 * @param {number} currentScore - Current TOEIC score
 * @param {number} targetScore - Target TOEIC score
 * @returns {object} Estimated hours and timeline
 */
function estimatePracticeHours(currentScore, targetScore) {
    const scoreDiff = targetScore - currentScore;

    if (scoreDiff <= 0) {
        return {
            hours: 0,
            weeks: 0,
            message: 'You have already achieved your target score!',
        };
    }

    // Rough estimate: 1 point increase requires ~2-3 hours of practice
    // This varies by current level (harder to improve at higher levels)
    let hoursPerPoint = 2;

    if (currentScore >= 700) {
        hoursPerPoint = 3.5;
    } else if (currentScore >= 500) {
        hoursPerPoint = 2.5;
    }

    const estimatedHours = Math.round(scoreDiff * hoursPerPoint);
    const weeksAt10HrsPerWeek = Math.ceil(estimatedHours / 10);
    const weeksAt20HrsPerWeek = Math.ceil(estimatedHours / 20);

    return {
        hours: estimatedHours,
        weeks10: weeksAt10HrsPerWeek,
        weeks20: weeksAt20HrsPerWeek,
        message: `Estimated ${estimatedHours} hours of focused practice needed (${weeksAt10HrsPerWeek}-${weeksAt20HrsPerWeek} weeks)`,
    };
}

module.exports = {
    convertToToeicScore,
    getToeicLevel,
    getScoreInterpretation,
    calculatePercentile,
    getScoreBand,
    estimatePracticeHours,
};
