import { useEffect, useRef } from 'react';

export default function ListeningReadingChart({ overview }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current || !window.Chart || !overview) return;

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

        return () => {
            chartRef.current?.destroy();
            chartRef.current = null;
        };
    }, [overview]);

    return <canvas ref={canvasRef}></canvas>;
}
