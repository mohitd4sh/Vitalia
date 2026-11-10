import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, CheckCheck, ChevronDown, ChevronRight, LogOut, Menu, X } from "lucide-react";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../services/api.js";

const routeLabels = {
  admin: "Operations overview",
  bookings: "Manage bookings",
  tests: "Diagnostic catalogue",
  patients: "Patient directory",
  reports: "Medical reports",
  centers: "Diagnostic centers",
  staff: "Staff management",
  inventory: "Inventory control",
  billing: "Billing and payments",
  medicines: "Medicine catalogue",
  messages: "Patient messages",
  settings: "Center settings",
  dashboard: "Overview",
};

const patientRouteLabels = {
  "medicine-order": "Medicine order",
  messages: "Messages",
  help: "Help",
  settings: "Settings",
};

function Header({ user, onMenuClick, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationError, setNotificationError] = useState("");
  const pathParts = location.pathname.split("/").filter(Boolean);
  const currentRoute = pathParts[pathParts.length - 1];
  const currentPage = (user?.role === "patient" ? patientRouteLabels[currentRoute] : null)
    || routeLabels[currentRoute]
    || "Workspace";
  const initials = (user?.name || "User")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      setNotificationError("");
    } catch (error) {
      setNotificationError(error.message);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(refreshNotifications, 0);
    const timer = window.setInterval(refreshNotifications, 15000);
    window.addEventListener("vitalia:notifications-updated", refreshNotifications);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(initialLoad);
      window.removeEventListener("vitalia:notifications-updated", refreshNotifications);
    };
  }, [refreshNotifications]);

  async function openNotification(notification) {
    if (!notification.readAt) {
      try {
        await markNotificationRead(notification.id);
        setUnreadCount((count) => Math.max(0, count - 1));
        setNotifications((current) => current.map((item) => item.id === notification.id
          ? { ...item, readAt: new Date().toISOString() }
          : item));
      } catch (error) {
        setNotificationError(error.message);
        return;
      }
    }
    setNotificationsOpen(false);
    if (notification.href) navigate(notification.href);
  }

  async function markAllRead() {
    try {
      await markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
      setNotificationError("");
    } catch (error) {
      setNotificationError(error.message);
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="menu-button" onClick={onMenuClick} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <span>{user?.role === "admin" || user?.role === "center_master" ? "Center operations" : user?.role === "staff" ? "Staff workspace" : user?.role === "custom" ? user.customRoleName || "Custom workspace" : "Vitalia"}</span>
          <ChevronRight className="breadcrumb-divider" size={15} />
          <strong>{currentPage}</strong>
        </nav>
      </div>

      <div className="topbar-actions">
        <div className="notification-menu-wrap">
          <button
            className={`notification-trigger ${notificationsOpen ? "notification-trigger-open" : ""}`}
            type="button"
            aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
            aria-expanded={notificationsOpen}
            onClick={() => {
              setProfileOpen(false);
              setNotificationsOpen((open) => !open);
            }}
          >
            <Bell size={19} />
            {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
          </button>
          {notificationsOpen && (
            <section className="notification-panel" aria-label="Notifications">
              <header className="notification-panel-header">
                <div><strong>Notifications</strong><small>{unreadCount ? `${unreadCount} unread` : "You’re all caught up"}</small></div>
                <div className="notification-panel-actions">
                  {unreadCount > 0 && <button type="button" onClick={markAllRead} aria-label="Mark all notifications as read" title="Mark all as read"><CheckCheck size={17} /></button>}
                  <button type="button" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications"><X size={17} /></button>
                </div>
              </header>
              {notificationError && <p className="notification-error" role="alert">{notificationError}</p>}
              <div className="notification-list">
                {notifications.length ? notifications.map((notification) => (
                  <button
                    className={`notification-item ${notification.readAt ? "" : "notification-item-unread"} notification-${notification.severity}`}
                    type="button"
                    key={notification.id}
                    onClick={() => openNotification(notification)}
                  >
                    <span className="notification-item-dot" />
                    <span className="notification-item-copy">
                      <strong>{notification.title}</strong>
                      {notification.message !== notification.title && <span>{notification.message}</span>}
                      <small>{new Date(notification.createdAt).toLocaleString()}</small>
                    </span>
                  </button>
                )) : !notificationError && <p className="notification-empty">No notifications yet.</p>}
              </div>
            </section>
          )}
        </div>
        <div className="profile-menu-wrap">
          <button
            className="profile-trigger"
            onClick={() => setProfileOpen((open) => !open)}
            aria-expanded={profileOpen}
            aria-label="Open account menu"
          >
            <span className="avatar">{initials}</span>
            <span className="profile-copy">
              <strong>{user?.name || "Account"}</strong>
              <small>{user?.role === "staff" ? user.staffRole : user?.role === "center_master" ? `${user.assignedCenterName || "Center"} Master` : user?.role === "custom" ? "Custom role" : user?.role}</small>
            </span>
            <ChevronDown size={16} />
          </button>
          {profileOpen && (
            <div className="profile-menu">
              <div className="profile-menu-email">{user?.email}</div>
              <button
                onClick={() => {
                  setProfileOpen(false);
                  onLogout();
                }}
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
