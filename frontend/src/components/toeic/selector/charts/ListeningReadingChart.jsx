import { useEffect, useRef } from 'react';
import { loadChart } from '@lib/loadChart.js';

export default function ListeningReadingChart({ overview }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current || !overview) return;

        // Chart.js nạp theo YÊU CẦU (xem `lib/loadChart.js`) — trước đây nó
        // nằm trong chunk khởi động nên mọi người dùng đều tải, dù biểu đồ chỉ
        // xuất hiện ở đây.
        //
        // `cancelled` chặn việc vẽ khi component đã unmount trong lúc chờ tải:
        // không có nó thì Chart dựng lên trên canvas đã bị gỡ khỏi DOM.
        let cancelled = false;
        loadChart().then(() => {
            if (cancelled || !canvasRef.current) return;

            if (chartRef.current) {
                chartRef.current.destroy();
                chartRef.current = null;
            }

            chartRef.current = new window.Chart(canvasRef.current.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['Listening', 'Reading'],
                    datasets: [{
                        data: [overview.averageListening || 0, overview.averageReading || 0],
                        backgroundColor: ['rgba(54, 162, 235, 0.8)', 'rgba(255, 99, 132, 0.8)'],
                        borderColor: ['rgb(54, 162, 235)', 'rgb(255, 99, 132)'],
                        borderWidth: 2,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: 1.5,
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => `${ctx.label}: ${ctx.parsed} / 495`,
                            },
                        },
                    },
                },
            });
        }).catch(() => { /* mất mạng — để trống canvas, không làm sập màn hình */ });

        return () => {
            cancelled = true;
            chartRef.current?.destroy();
            chartRef.current = null;
        };
    }, [overview]);

    return <canvas ref={canvasRef}></canvas>;
}
