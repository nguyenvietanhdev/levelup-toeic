import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { installBrokenImageHandler } from './lib/hideBrokenImages.js'

// Chart.js KHÔNG import ở đây nữa.
//
// Import tĩnh tại chỗ này nhét cả thư viện vào chunk khởi động, nên mọi người
// dùng tải nó ngay từ đầu — trong khi biểu đồ chỉ xuất hiện ở màn Thống kê và
// tab Phân tích TOEIC. Đo thật: bỏ ra khỏi chunk chính giảm 875 → 676 kB
// (gzip 256 → 188 kB).
//
// Nơi cần thì gọi `loadChart()` (lib/loadChart.js) — nó vẫn gán `window.Chart`
// nên các component vẽ biểu đồ không phải sửa cách dùng.

// Một listener duy nhất cho mọi ảnh hỏng — thay 8 chỗ inline onerror bị CSP chặn.
installBrokenImageHandler()

createRoot(document.getElementById('root')).render(<App />)
