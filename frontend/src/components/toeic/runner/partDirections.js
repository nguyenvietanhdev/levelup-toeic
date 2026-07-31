// Directions gốc của 7 Part TOEIC — chép nguyên văn từ đề in.
// Dựng bằng chữ thay vì ảnh scan: hợp dark mode, đọc được trên mobile,
// không phải host file ảnh nào.

export const PART_DIRECTIONS = {
    1: {
        title: 'PART 1',
        name: 'Photographs',
        text: 'For each question in this part, you will hear four statements about a picture in your test book. When you hear the statements, you must select the one statement that best describes what you see in the picture. Then find the number of the question on your answer sheet and mark your answer. The statements will not be printed in your test book and will be spoken only one time.',
    },
    2: {
        title: 'PART 2',
        name: 'Question-Response',
        text: 'You will hear a question or statement and three responses spoken in English. They will not be printed in your test book and will be spoken only one time. Select the best response to the question or statement and mark the letter (A), (B), or (C) on your answer sheet.',
    },
    3: {
        title: 'PART 3',
        name: 'Conversations',
        text: 'You will hear some conversations between two or more people. You will be asked to answer three questions about what the speakers say in each conversation. Select the best response to each question and mark the letter (A), (B), (C), or (D) on your answer sheet. The conversations will not be printed in your test book and will be spoken only one time.',
    },
    4: {
        title: 'PART 4',
        name: 'Talks',
        text: 'You will hear some talks given by a single speaker. You will be asked to answer three questions about what the speaker says in each talk. Select the best response to each question and mark the letter (A), (B), (C), or (D) on your answer sheet. The talks will not be printed in your test book and will be spoken only one time.',
    },
    5: {
        title: 'PART 5',
        name: 'Incomplete Sentences',
        text: 'A word or phrase is missing in each of the sentences below. Four answer choices are given below each sentence. Select the best answer to complete the sentence. Then mark the letter (A), (B), (C), or (D) on your answer sheet.',
    },
    6: {
        title: 'PART 6',
        name: 'Text Completion',
        text: 'Read the texts that follow. A word, phrase, or sentence is missing in parts of each text. Four answer choices for each question are given below the text. Select the best answer to complete the text. Then mark the letter (A), (B), (C), or (D) on your answer sheet.',
    },
    7: {
        title: 'PART 7',
        name: 'Reading Comprehension',
        text: 'In this part you will read a selection of texts, such as magazine and newspaper articles, e-mails, and instant messages. Each text or set of texts is followed by several questions. Select the best answer for each question and mark the letter (A), (B), (C), or (D) on your answer sheet.',
    },
};

export function getPartDirections(part) {
    return PART_DIRECTIONS[part] || null;
}
