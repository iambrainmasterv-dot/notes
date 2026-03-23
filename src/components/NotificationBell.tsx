import type { AppNotification } from '../types';

interface Props {
  unreadCount: number;
  panelOpen: boolean;
  onTogglePanel: () => void;
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export function NotificationBell({
  unreadCount,
  panelOpen,
  onTogglePanel,
  notifications,
  onMarkRead,
  onMarkAllRead,
}: Props) {
  return (
    <div className="notif-bell-root" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`nav-item notif-bell ${panelOpen ? 'active' : ''}`}
        onClick={onTogglePanel}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        title="Notifications"
      >
        <span className="nav-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
        {unreadCount > 0 && <span className="notif-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {panelOpen && (
        <div className="notif-dropdown" onClick={(e) => e.stopPropagation()}>
          <div className="notif-dropdown-header">
            <span>Notifications</span>
            {notifications.some((n) => !n.read) && (
              <button type="button" className="btn-text" onClick={onMarkAllRead}>Mark all read</button>
            )}
          </div>
          <div className="notif-dropdown-list">
            {notifications.length === 0 && (
              <p className="text-muted" style={{ padding: 12, fontSize: '0.85rem' }}>Nothing here yet.</p>
            )}
            {notifications.slice(0, 50).map((n) => (
              <button
                key={n.id}
                type="button"
                className={`notif-dropdown-item notif-${n.level} ${n.read ? 'read' : ''}`}
                onClick={() => onMarkRead(n.id)}
              >
                <span className="notif-dropdown-title">{n.title}</span>
                <span className="notif-dropdown-msg">{n.message}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
