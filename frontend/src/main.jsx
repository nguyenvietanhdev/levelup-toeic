import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Chart from 'chart.js/auto'
import { installBrokenImageHandler } from './lib/hideBrokenImages.js'
window.Chart = Chart

// Một listener duy nhất cho mọi ảnh hỏng — thay 8 chỗ inline onerror bị CSP chặn.
installBrokenImageHandler()

createRoot(document.getElementById('root')).render(<App />)
