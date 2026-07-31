// Logger dev-only: console.log/warn không xuất hiện trong bundle production.
// console.error vẫn giữ nguyên (luôn cần thấy lỗi thật, kể cả production).
const isDev = import.meta.env.DEV;

export const logger = {
    log: isDev ? console.log.bind(console) : () => {},
    warn: isDev ? console.warn.bind(console) : () => {},
    error: console.error.bind(console),
};
