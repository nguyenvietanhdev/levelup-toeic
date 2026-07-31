// ===================================
// ACTIVITY LOGGER UTILITY
// ===================================

const fs = require('fs/promises');
const logger = require('./logger');
const path = require('path');

const ACTIVITY_LOG_FILE = path.join(__dirname, '..', 'data', 'activity-logs.json');
const MAX_LOGS = 100; // Giữ tối đa 100 logs gần nhất

/**
 * Đảm bảo file activity log tồn tại
 */
async function ensureLogFile() {
    try {
        await fs.access(ACTIVITY_LOG_FILE);
    } catch {
        await fs.writeFile(ACTIVITY_LOG_FILE, JSON.stringify([], null, 2));
    }
}

/**
 * Đọc tất cả activity logs
 */
async function readLogs() {
    try {
        await ensureLogFile();
        const data = await fs.readFile(ACTIVITY_LOG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error('Error reading activity logs:', error);
        return [];
    }
}

/**
 * Ai thực hiện request này — dùng làm tham số `actor` của logActivity.
 *
 * `protect` chỉ gắn { id, role } vào req.user (middleware/auth.js), không có
 * email, và tra thêm một lượt DB chỉ để lấy email là trả giá cho mỗi lần ghi.
 * Nên actor là ObjectId dạng hex: kém thân thiện hơn nhưng tra ngược được, và
 * an toàn khi dashboard render nó ra HTML.
 */
const actorOf = (req) => (req?.user?.id ? String(req.user.id) : 'system');

/**
 * Ghi activity log mới
 * @param {string} type - Loại hoạt động: 'vocabulary' hoặc 'user'
 * @param {string} action - Hành động: 'add', 'update', 'delete'
 * @param {object} data - Dữ liệu liên quan
 * @param {string} actor - Ai làm. Mặc định 'system' — xem ghi chú bên dưới.
 *
 * Mặc định trước đây là chuỗi 'Admin', và KHÔNG call site nào truyền tham số
 * thứ tư. Hệ quả: hồi `routes/vocabulary.js` còn để trần, một cú `DELETE /all`
 * ẩn danh từ internet cũng được ghi là "Admin đã xoá N từ" — người điều tra đọc
 * bản ghi đó sẽ kết luận là chính mình lỡ tay hoặc tài khoản admin bị chiếm.
 * Log ghi sai thủ phạm tệ hơn không có log, vì nó tạo ra kết luận sai một cách
 * tự tin. 'system' thì hiển thị đúng bản chất: không quy được cho ai.
 */
async function logActivity(type, action, data, actor = 'system') {
    try {
        const logs = await readLogs();

        const newLog = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            type, // 'vocabulary' | 'user'
            action, // 'add' | 'update' | 'delete'
            admin: actor, // giữ tên field 'admin' vì dashboard đang đọc nó
            data
        };

        // Thêm log mới vào đầu mảng
        logs.unshift(newLog);

        // Giữ tối đa MAX_LOGS logs
        const trimmedLogs = logs.slice(0, MAX_LOGS);

        await fs.writeFile(ACTIVITY_LOG_FILE, JSON.stringify(trimmedLogs, null, 2));

        return newLog;
    } catch (error) {
        logger.error('Error logging activity:', error);
        return null;
    }
}

/**
 * Lấy danh sách logs với filter
 * @param {number} limit - Số lượng logs cần lấy
 * @param {string} type - Lọc theo loại (optional)
 */
async function getLogs(limit = 20, type = null) {
    try {
        let logs = await readLogs();

        // Filter by type if provided
        if (type) {
            logs = logs.filter(log => log.type === type);
        }

        // Limit results
        return logs.slice(0, limit);
    } catch (error) {
        logger.error('Error getting logs:', error);
        return [];
    }
}

/**
 * Xóa tất cả logs
 */
async function clearLogs() {
    try {
        await fs.writeFile(ACTIVITY_LOG_FILE, JSON.stringify([], null, 2));
        return true;
    } catch (error) {
        logger.error('Error clearing logs:', error);
        return false;
    }
}

module.exports = {
    logActivity,
    actorOf,
    getLogs,
    clearLogs,
    readLogs
};
