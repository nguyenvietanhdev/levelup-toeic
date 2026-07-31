import { useState, useCallback, useEffect, useRef } from 'react';

let _notify = null;
let _idCounter = 0;

export const Notification = {
    show({ type = 'info', title, message, duration = 3000 }) {
        _notify?.({ type, title, message, duration });
    },
    success(message, title = 'Thành công') { this.show({ type: 'success', title, message }); },
    error(message, title = 'Lỗi') { this.show({ type: 'error', title, message }); },
    warning(message, title = 'Cảnh báo') { this.show({ type: 'warning', title, message }); },
    info(message, title = 'Thông tin') { this.show({ type: 'info', title, message }); },
};

export default function NotificationContainer() {
    const [notifications, setNotifications] = useState([]);
    const timers = useRef({});

    const dismiss = useCallback((id) => {
        clearTimeout(timers.current[id]);
        delete timers.current[id];
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const addNotification = useCallback((notif) => {
        const id = ++_idCounter;
        setNotifications(prev => [...prev, { ...notif, id }]);
        timers.current[id] = setTimeout(() => dismiss(id), notif.duration || 3000);
    }, [dismiss]);

    useEffect(() => {
        _notify = addNotification;
        window._reactNotification = Notification;
        return () => { _notify = null; };
    }, [addNotification]);

    // Clear all timers on unmount
    useEffect(() => {
        return () => { Object.values(timers.current).forEach(clearTimeout); };
    }, []);

    const iconMap = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };

    return (
        <div id="notification-container" className="notification-container">
            {notifications.map(n => (
                <div key={n.id} className={`notification ${n.type}`} style={{ position: 'relative' }}>
                    <i className={`fas ${iconMap[n.type] || iconMap.info}`}></i>
                    <div className="notification-content">
                        {n.title && <strong>{n.title}</strong>}
                        {n.message && <p>{n.message}</p>}
                    </div>
                    <button
                        onClick={() => dismiss(n.id)}
                        style={{ position: 'absolute', top: 6, right: 8, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: 14, color: 'inherit', lineHeight: 1 }}
                        title="Đóng"
                    >✕</button>
                </div>
            ))}
        </div>
    );
}
