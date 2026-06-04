"use client";
import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const TYPE_COLOR = { success: 'var(--green)', warning: 'var(--amber)', error: 'var(--red)', info: 'var(--cyan)' };
const TYPE_ICON = { success: '✓', warning: '⚠', error: '✕', info: 'ℹ' };

export default function NotificationBell() {
    const { data: session } = useSession();
    const router = useRouter();
    const [notifications, setNotifications] = useState([]);
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const fetchNotifications = async () => {
        if (!session?.user?.userID) return;
        try {
            const res = await fetch(`/api/v1/notifications?userID=${session.user.userID}`);
            if (res.ok) { const data = await res.json(); setNotifications(data.notifications || []); }
        } catch {}
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 10000);
        return () => clearInterval(interval);
    }, [session]);

    useEffect(() => {
        const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleMarkRead = async (notification) => {
        if (notification.read) return;
        try {
            await fetch('/api/v1/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'markRead', notificationID: notification.notificationID, userID: session.user.userID }),
            });
            setNotifications(prev => prev.map(n => n.notificationID === notification.notificationID ? { ...n, read: true } : n));
        } catch {}
    };

    const handleNotificationClick = (notification) => {
        handleMarkRead(notification);
        if (notification.link) { router.push(notification.link); setOpen(false); }
    };

    const handleMarkAllRead = async () => {
        try {
            await fetch('/api/v1/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'markAllRead', userID: session.user.userID }),
            });
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } catch {}
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                onClick={() => { fetchNotifications(); setOpen(o => !o); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', position: 'relative', padding: '6px 8px', fontFamily: 'var(--mono)', fontSize: 16 }}
            >
                ☾
                {unreadCount > 0 && (
                    <span style={{ position: 'absolute', top: 2, right: 2, background: 'var(--red)', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div style={{ position: 'absolute', right: 0, top: '100%', width: 360, maxHeight: 480, background: 'var(--bg-card)', border: '1px solid var(--bd)', zIndex: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--bd)' }}>
                        <span style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>NOTIFICATIONS</span>
                        {unreadCount > 0 && (
                            <button onClick={handleMarkAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 9, color: 'var(--green)', fontFamily: 'var(--mono)', letterSpacing: '0.08em' }}>mark all read</button>
                        )}
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {notifications.length === 0 ? (
                            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>[no notifications]</div>
                        ) : (
                            notifications.map(n => {
                                const c = TYPE_COLOR[n.type] || 'var(--text-dim)';
                                return (
                                    <div
                                        key={n.notificationID}
                                        onClick={() => handleNotificationClick(n)}
                                        style={{ display: 'flex', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--bd)', cursor: n.link ? 'pointer' : 'default', background: n.read ? 'transparent' : 'rgba(57,255,20,0.03)' }}
                                    >
                                        <span style={{ color: c, fontSize: 12, marginTop: 1, flexShrink: 0 }}>{TYPE_ICON[n.type] || 'ℹ'}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                                <span style={{ fontSize: 12, fontWeight: n.read ? 400 : 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                                                {!n.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-mid)', marginBottom: 4 }}>{n.message}</div>
                                            <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{new Date(n.createdAt).toLocaleString()}</div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
