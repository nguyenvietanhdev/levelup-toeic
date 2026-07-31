import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Chart from 'chart.js/auto'
window.Chart = Chart

createRoot(document.getElementById('root')).render(<App />)
