/**
 * Mã chạy thật không được dùng biến chưa khai báo.
 *
 * Vì sao: màn Luyện viết từng trắng trang trên production với "useEffect is not defined" — dùng
 * hook mà quên import. Test đọc mã nguồn bằng regex không thấy, build vẫn qua (lỗi chỉ nổ khi
 * màn được mở), và ESLint của dự án có báo nhưng không ai chạy. Test này chạy đúng quy tắc
 * `no-undef` trên mọi file mã chạy thật để lỗi kiểu đó đỏ ngay ở CI.
 *
 * Biến toàn cục kiểu cũ (gắn vào `window` ở game/GameContext.jsx, hoặc có kiểm `typeof` trước khi
 * dùng) được liệt kê ở dưới, mỗi cái kèm lý do. Thêm vào danh sách này phải có lý do thật.
 */
import { test, expect } from 'vitest';
import { ESLint } from 'eslint';
import globals from 'globals';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));

const TOAN_CUC_KIEU_CU = {
    PracticeManager: 'gắn vào window ở game/GameContext.jsx',
    GameState: 'gắn vào window ở game/GameContext.jsx',
    UI: 'gắn vào window ở game/GameContext.jsx',
    AchievementsUI: 'game/state.js kiểm typeof trước khi dùng',
    ServerStorage: 'api/ai.js kiểm typeof trước khi dùng',
    module: 'api/ai.js kiểm typeof module trước khi export kiểu CommonJS',
};

test('không file mã chạy thật nào dùng biến chưa khai báo (quên import)', async () => {
    const eslint = new ESLint({
        cwd: SRC,
        overrideConfigFile: true,
        overrideConfig: {
            files: ['**/*.{js,jsx}'],
            languageOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                parserOptions: { ecmaFeatures: { jsx: true } },
                globals: { ...globals.browser, ...Object.fromEntries(Object.keys(TOAN_CUC_KIEU_CU).map((k) => [k, 'readonly'])) },
            },
            rules: { 'no-undef': 'error' },
        },
        ignorePatterns: ['**/*.test.js', '**/*.test.jsx', '**/__tests__/**'],
    });
    const ketQua = await eslint.lintFiles(['**/*.js', '**/*.jsx']);
    const loi = ketQua.flatMap((f) => f.messages
        .filter((m) => m.ruleId === 'no-undef' || m.fatal)
        .map((m) => `${relative(SRC, f.filePath)}:${m.line} ${m.message}`));
    expect(loi).toEqual([]);
}, 60_000);
