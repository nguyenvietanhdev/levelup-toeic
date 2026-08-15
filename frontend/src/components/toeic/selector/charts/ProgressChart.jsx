import { useEffect, useRef } from 'react';
import { loadChart } from '@lib/loadChart.js';

export default function ProgressChart({ data }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current || !data?.length) return;

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

            const labels = data.map((_, i) => `Lần ${i + 1}`);
            chartRef.current = new window.Chart(canvasRef.current.getContext('2d'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Tổng điểm',
                            data: data.map(d => d.totalScore),
                            borderColor: 'rgb(75, 192, 192)',
                            backgroundColor: 'rgba(75, 192, 192, 0.1)',
                            tension: 0.4,
                            fill: true,
                        },
                        {
                            label: 'Listening',
                            data: data.map(d => d.listeningScore),
                            borderColor: 'rgb(54, 162, 235)',
                            backgroundColor: 'rgba(54, 162, 235, 0.1)',
                            tension: 0.4,
                            fill: false,
                        },
                        {
                            label: 'Reading',
                            data: data.map(d => d.readingScore),
                            borderColor: 'rgb(255, 99, 132)',
                            backgroundColor: 'rgba(255, 99, 132, 0.1)',
                            tension: 0.4,
                            fill: false,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: 2,
                    plugins: {
                        legend: { display: true, position: 'top' },
                        tooltip: { mode: 'index', intersect: false },
                    },
                    scales: { y: { beginAtZero: true, max: 990 } },
                },
            });
        }).catch(() => { /* mất mạng — để trống canvas, không làm sập màn hình */ });

        return () => {
            cancelled = true;
            chartRef.current?.destroy();
            chartRef.current = null;
        };
    }, [data]);

    return <canvas ref={canvasRef}></canvas>;
}
