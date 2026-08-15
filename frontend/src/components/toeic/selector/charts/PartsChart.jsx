import { useEffect, useRef } from 'react';
import { loadChart } from '@lib/loadChart.js';

export default function PartsChart({ data }) {
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

            const labels = data.map(p => `Part ${p.partNumber}`);
            chartRef.current = new window.Chart(canvasRef.current.getContext('2d'), {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Độ chính xác (%)',
                            data: data.map(p => p.avgAccuracy || 0),
                            backgroundColor: 'rgba(75, 192, 192, 0.8)',
                            borderColor: 'rgb(75, 192, 192)',
                            borderWidth: 2,
                            yAxisID: 'y',
                        },
                        {
                            label: 'Số lần thử',
                            data: data.map(p => p.attempts || 0),
                            backgroundColor: 'rgba(153, 102, 255, 0.8)',
                            borderColor: 'rgb(153, 102, 255)',
                            borderWidth: 2,
                            yAxisID: 'y1',
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: 2.5,
                    plugins: { legend: { display: true, position: 'top' } },
                    scales: {
                        y: {
                            type: 'linear', display: true, position: 'left',
                            beginAtZero: true, max: 100,
                            title: { display: true, text: 'Độ chính xác (%)' },
                        },
                        y1: {
                            type: 'linear', display: true, position: 'right',
                            beginAtZero: true,
                            grid: { drawOnChartArea: false },
                            title: { display: true, text: 'Số lần thử' },
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
    }, [data]);

    return <canvas ref={canvasRef}></canvas>;
}
