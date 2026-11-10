import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Bell, CalendarDays, CheckCheck, ChevronDown, FileText, HeartPulse, LifeBuoy, LogOut, MessageCircle, Search, UserRound, X } from "lucide-react";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../services/api.js";

const profileLinks = [
  { label: "My bookings", path: "/bookings", icon: CalendarDays },
  { label: "Reports", path: "/reports", icon: FileText },
  { label: "Messages", path: "/messages", icon: MessageCircle },
  { label: "Help", path: "/help", icon: LifeBuoy },
  { label: "Profile settings", path: "/settings", icon: UserRound },
];

function PatientSearchForm({ search, onSearch }) {
  const [query, setQuery] = useState(() => new URLSearchParams(search).get("q") || "");

  function submitSearch(event) {
    event.preventDefault();
    onSearch(query.trim());
  }

  return (
    <form className="patient-store-search" onSubmit={submitSearch} role="search">
      <Search size={17} aria-hidden="true" />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search diagnostic tests..."
        aria-label="Search diagnostic tests"
      />
      <button type="submit" aria-label="Search"><Search size={17} /></button>
    </form>
  );
}

function PatientHeader({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationError, setNotificationError] = useState("");
  const profileMenuRef = useRef(null);
  const profileButtonRef = useRef(null);
  const notificationsRef = useRef(null);
  const notificationsButtonRef = useRef(null);
  const firstName = user?.name?.trim().split(/\s+/)[0] || "Account";

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!profileMenuRef.current?.contains(event.target)) setProfileOpen(false);
      if (!notificationsRef.current?.contains(event.target)) setNotificationsOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape" && profileOpen) {
        setProfileOpen(false);
        profileButtonRef.current?.focus();
      } else if (event.key === "Escape" && notificationsOpen) {
        setNotificationsOpen(false);
        notificationsButtonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationsOpen, profileOpen]);

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
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
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
      setNotifications((current) => current.map((item) => ({
        ...item,
        readAt: item.readAt || new Date().toISOString(),
      })));
      setNotificationError("");
    } catch (error) {
      setNotificationError(error.message);
    }
  }

  function searchTests(query) {
    navigate(query ? `/tests?q=${encodeURIComponent(query)}` : "/tests");
  }

  return (
    <header className="patient-store-header">
      <div className="patient-store-header-main">
        <Link className="patient-store-brand" to="/dashboard" aria-label="Vitalia home">
          <span className="patient-store-brand-icon"><HeartPulse size={19} /></span>
          <span>vitalia<span>.</span></span>
        </Link>
        <PatientSearchForm key={location.search} search={location.search} onSearch={searchTests} />
        <div className="patient-store-actions">
        <div className="notification-menu-wrap" ref={notificationsRef}>
          <button
            className={`notification-trigger${notificationsOpen ? " notification-trigger-open" : ""}`}
            type="button"
            aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
            aria-expanded={notificationsOpen}
            aria-controls="patient-notifications-panel"
            ref={notificationsButtonRef}
            onClick={() => {
              setProfileOpen(false);
              setNotificationsOpen((open) => !open);
            }}
          >
            <Bell size={19} />
            {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
          </button>
          {notificationsOpen && (
            <section className="notification-panel" id="patient-notifications-panel" aria-label="Notifications">
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
        <div className="patient-store-profile" ref={profileMenuRef}>
          <button
            className={`patient-store-profile-trigger${profileOpen ? " patient-store-profile-trigger-open" : ""}`}
            type="button"
            aria-controls="patient-profile-menu"
            aria-expanded={profileOpen}
            ref={profileButtonRef}
            onClick={() => setProfileOpen((open) => !open)}
          >
            <span className="patient-store-avatar"><UserRound size={17} /></span>
            <span className="patient-store-profile-name">{firstName}</span>
            <ChevronDown className="patient-store-profile-chevron" size={15} />
          </button>
          {profileOpen && (
            <div className="patient-store-profile-menu" id="patient-profile-menu">
              <div className="patient-store-profile-summary">
                <span className="patient-store-avatar"><UserRound size={17} /></span>
                <span><strong>{user?.name || "Patient"}</strong><small>{user?.email}</small></span>
              </div>
              <nav className="patient-store-profile-menu-links" aria-label="Profile links">
                {profileLinks.map(({ label, path, icon: Icon }) => (
                  <NavLink
                    key={path}
                    to={path}
                    className={({ isActive }) => `patient-store-profile-link${isActive ? " patient-store-profile-link-active" : ""}`}
                    onClick={() => setProfileOpen(false)}
                  >
                    <Icon size={16} /><span>{label}</span>
                  </NavLink>
                ))}
              </nav>
              <button className="patient-store-signout" type="button" onClick={() => { setProfileOpen(false); onLogout(); }}>
                <LogOut size={16} /><span>Sign out</span>
              </button>
            </div>
          )}
        </div>
        </div>
      </div>
    </header>
  );
}

export default PatientHeader;
