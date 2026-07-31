import { useEffect, useRef } from 'react';

export default function ProgressChart({ data }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current || !window.Chart || !data?.length) return;

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

        return () => {
            chartRef.current?.destroy();
            chartRef.current = null;
        };
    }, [data]);

    return <canvas ref={canvasRef}></canvas>;
}
