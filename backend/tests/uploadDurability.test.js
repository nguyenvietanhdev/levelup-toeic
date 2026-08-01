/**
 * Enforcement: FILE NGƯỜI DÙNG UPLOAD KHÔNG ĐƯỢC CHỈ NẰM TRÊN ĐĨA CONTAINER.
 *
 * Vì sao cần: đĩa của Render/Railway là ephemeral — mất sạch mỗi lần redeploy,
 * restart, hay đổi instance. Nhưng bản ghi trong MongoDB thì SỐNG, và nó vẫn giữ
 * `/uploads/reports/report-123.png`. Kết quả là ảnh vỡ trong panel admin mà không
 * có lỗi ở đâu cả: một đường dẫn tĩnh 404 thì chẳng ai ghi log.
 *
 * Ba đường upload cùng dính khuôn này, và report của lens deployment chỉ nêu MỘT
 * (`reportController`). Hai cái kia lộ ra lúc truy `diskStorage`:
 *   - ảnh báo cáo   (reportController — multer riêng, không qua middleware/upload)
 *   - avatar        (authController + upload.js:avatarStorage)
 *   - ảnh cosmetic  (adminDefinitions + upload.js:shopImageStorage)
 * Vá một cái rồi đóng finding là tự tạo cảm giác xong việc — tệ hơn không vá.
 *
 * Bất biến chốt ở đây: mọi luồng upload phải đi qua `utils/uploadStore`, thứ tự
 * quyết định Cloudinary (nếu có env) hay đĩa (fallback cho dev/local). Ai muốn
 * dùng thẳng `multer.diskStorage` phải ghi vào ALLOWLIST kèm lý do.
 */
const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..');

/**
 * Miễn trừ có chủ ý. Key = đường dẫn tương đối, value = lý do.
 */
// Key = `<file>:<tên biến>`, KHÔNG phải theo file. Miễn trừ cả file là sai: lần
// đầu tôi ghi `middleware/upload.js` và nó nuốt luôn `avatarStorage` với
// `shopImageStorage` — hai trong ba site cần vá — nên test xanh mà lỗi còn nguyên.
const ALLOWLIST = {
    'middleware/upload.js:imageStorage': 'DEAD CODE — routes/toeic.js:78 chỉ import uploadImageMem',
    'middleware/upload.js:audioStorage': 'DEAD CODE — routes/toeic.js:78 chỉ import uploadAudioMem',
};

function sourceFiles(dir) {
    const out = [];
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.name === 'node_modules' || e.name === 'tests') continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.name.endsWith('.js')) out.push(p);
        }
    };
    walk(dir);
    return out;
}

describe('Độ bền của file upload — đĩa container là ephemeral', () => {

    test('không luồng upload nào dùng thẳng multer.diskStorage', () => {
        const offenders = [];
        for (const abs of sourceFiles(BACKEND)) {
            const rel = path.relative(BACKEND, abs).replace(/\\/g, '/');
            if (rel.startsWith('scripts/')) continue;        // script chạy tay, không phải request
            const src = fs.readFileSync(abs, 'utf8');
            for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*multer\.diskStorage\s*\(/g)) {
                const key = `${rel}:${m[1]}`;
                if (!ALLOWLIST[key]) offenders.push(key);
            }
            // Khai báo ẩn danh (truyền thẳng vào multer({storage: multer.diskStorage(...)}))
            // không gán tên nên vòng trên bỏ sót — bắt riêng.
            for (const _ of src.matchAll(/storage:\s*multer\.diskStorage\s*\(/g)) {
                offenders.push(`${rel}:<ẩn danh>`);
            }
        }
        expect(offenders).toEqual([]);
    });

    test('uploadStore đẩy lên Cloudinary khi có cấu hình', async () => {
        jest.resetModules();
        jest.doMock('../utils/cloudinary', () => ({
            isConfigured: () => true,
            uploadBuffer: jest.fn().mockResolvedValue('https://res.cloudinary.com/x/image/upload/v1/reports/a.png'),
        }));
        const { storeUpload } = require('../utils/uploadStore');

        const url = await storeUpload(Buffer.from('fake'), {
            folder: 'reports', diskDir: '/tmp/nope', publicPrefix: '/uploads/reports',
            originalname: 'a.png', optimize: false,
        });

        expect(url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
        // Bất biến thật sự: URL lưu vào DB KHÔNG được là đường dẫn cùng origin.
        expect(url.startsWith('/uploads/')).toBe(false);
    });

    test('uploadStore rơi về đĩa khi thiếu env — dev/local vẫn chạy', async () => {
        jest.resetModules();
        jest.doMock('../utils/cloudinary', () => ({
            isConfigured: () => false,
            uploadBuffer: jest.fn(),
        }));
        const { storeUpload } = require('../utils/uploadStore');

        const dir = path.join(require('os').tmpdir(), 'uploadstore-test');
        const url = await storeUpload(Buffer.from('fake'), {
            folder: 'reports', diskDir: dir, publicPrefix: '/uploads/reports',
            originalname: 'a.png', optimize: false,
        });

        expect(url.startsWith('/uploads/reports/')).toBe(true);
        expect(fs.existsSync(path.join(dir, path.basename(url)))).toBe(true);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('self-check: bộ dò nhận ra multer.diskStorage', () => {
        const re = /multer\.diskStorage\s*\(/;
        expect(re.test('const s = multer.diskStorage({')).toBe(true);
        expect(re.test('const s = multer.memoryStorage()')).toBe(false);
    });
});
