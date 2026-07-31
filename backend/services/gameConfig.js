const GameConfig = require('../models/GameConfig');

// Cache 30s để không truy DB mỗi request; admin lưu xong gọi clear để áp ngay.
let _cache = null;
let _at = 0;

async function getGameConfig() {
    if (_cache && Date.now() - _at < 30000) return _cache;
    _cache = (await GameConfig.getConfig()).toObject();
    _at = Date.now();
    return _cache;
}

function clearGameConfigCache() {
    _cache = null;
    _at = 0;
}

module.exports = { getGameConfig, clearGameConfigCache };
