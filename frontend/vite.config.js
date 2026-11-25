import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@layouts': path.resolve(__dirname, './src/layouts'),
      '@ui': path.resolve(__dirname, './src/ui'),
      '@game': path.resolve(__dirname, './src/game'),
      '@api': path.resolve(__dirname, './src/api'),
      '@lib': path.resolve(__dirname, './src/lib'),
      // Sổ đăng ký ngôn ngữ dùng chung với backend: MỘT file, nằm trong backend/ (ảnh Docker
      // của backend chỉ chép thư mục backend/).
      '@ngonNgu': path.resolve(__dirname, '../backend/config/ngonNgu.json'),
    },
  },
  server: {
    port: 5173,
    // Cho dev server đọc file sổ ngôn ngữ nằm ngoài gốc frontend (backend/config/ngonNgu.json).
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/tts-cache': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // CHỈ /assets/audio (audio đề TOEIC nằm ở backend/public/assets/audio).
      // Trước đây proxy cả '/assets' nên MỌI thứ dưới /assets bị đẩy sang backend,
      // nuốt luôn '/assets/sounds/*' của chính frontend (public/assets/sounds) →
      // backend không có thư mục đó → 404 → toàn bộ âm hiệu ứng câm trong lúc dev.
      // Bản build không dính vì lúc đó không có proxy nào cả.
      '/assets/audio': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
