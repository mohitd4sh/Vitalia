import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Globe, LogOut } from "lucide-react";
import { getRoleHomePath, getRoleModulePath, hasPermission, permissionModules } from "../../services/permissions.js";

const COOKIE_PREFERENCES_KEY = "vitaliaCookiePreferences";

function Footer({ user, onLogout }) {
  const [cookieSettingsOpen, setCookieSettingsOpen] = useState(false);
  const [analyticsCookies, setAnalyticsCookies] = useState(false);
  const [cookieSettingsError, setCookieSettingsError] = useState("");

  function openCookieSettings() {
    setCookieSettingsError("");
    try {
      const savedPreferences = localStorage.getItem(COOKIE_PREFERENCES_KEY);
      if (savedPreferences) {
        const preferences = JSON.parse(savedPreferences);
        if (typeof preferences.analytics !== "boolean") {
          throw new Error("Saved cookie preferences are invalid.");
        }
        setAnalyticsCookies(preferences.analytics);
      } else {
        setAnalyticsCookies(false);
      }
      setCookieSettingsOpen(true);
    } catch (error) {
      setCookieSettingsError(error.message);
      setCookieSettingsOpen(true);
    }
  }

  function saveCookieSettings() {
    try {
      localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify({
        essential: true,
        analytics: analyticsCookies,
      }));
      setCookieSettingsError("");
      setCookieSettingsOpen(false);
    } catch (error) {
      setCookieSettingsError(`Unable to save cookie settings: ${error.message}`);
    }
  }

  const isAdmin = user.role === "admin" || user.role === "center_master";
  const isStaff = user.role === "staff";
  const isCustom = user.role === "custom";
  const homeLink = isAdmin
    ? { label: user.role === "center_master" ? `${user.assignedCenterName || "Center"} overview` : "Center overview", path: getRoleHomePath(user) }
    : isStaff
      ? { label: "Staff workspace", path: getRoleHomePath(user) }
      : isCustom
        ? (() => {
            const module = permissionModules.find(({ key }) => hasPermission(user, key));
            return module
              ? { label: module.label, path: getRoleModulePath(user, module.key), key: module.key }
              : { label: "Workspace", path: "/no-access" };
          })()
        : { label: "Homepage", path: "/homepage" };
  const serviceLinks = isAdmin
    ? [
        { label: "Diagnostics", path: "/admin/tests" },
        { label: "Centers", path: "/admin/centers" },
      ]
    : isCustom
      ? permissionModules
        .filter(({ key }) => hasPermission(user, key) && key !== homeLink.key)
        .slice(0, 3)
        .map(({ key, label }) => ({ label, path: getRoleModulePath(user, key) }))
      : isStaff
      ? [{ label: "Assigned bookings", path: "/staff/bookings" }]
      : [
          { label: "Diagnostic tests", path: "/tests" },
          { label: "Find a center", path: "/centers" },
          { label: "Medicines", path: "/medicine-order" },
        ];
  const careLinks = isAdmin
    ? [
        { label: "Bookings", path: "/admin/bookings" },
        { label: "Patients", path: "/admin/patients" },
        { label: "Reports", path: "/admin/reports" },
      ]
    : isStaff
      ? user.staffRole === "technician" || user.staffRole === "receptionist"
        ? [{ label: "Patient reports", path: "/staff/reports" }]
        : []
      : isCustom
        ? []
        : [
          { label: "My bookings", path: "/bookings" },
          { label: "Medical reports", path: "/reports" },
          { label: "Messages", path: "/messages" },
          { label: "Help", path: "/help" },
          { label: "Profile settings", path: "/settings" },
        ];

  return (
    <footer className="app-footer">
      <div className="app-footer-links">
        <section className="app-footer-group">
          <h2>About Vitalia</h2>
          <Link to="/about">About us</Link>
          <Link to={homeLink.path}>{homeLink.label}</Link>
        </section>

        <section className="app-footer-group">
          <h2>{isStaff || isCustom ? "Your workspace" : "Discover care"}</h2>
          {serviceLinks.map(({ label, path }) => (
            <Link key={path} to={path}>{label}</Link>
          ))}
        </section>

        <section className="app-footer-group">
          <h2>{isAdmin ? "Center operations" : isCustom ? "Account" : "Your care"}</h2>
          {careLinks.map(({ label, path }) => (
            <Link key={path} to={path}>{label}</Link>
          ))}
        </section>

        <section className="app-footer-group">
          <h2>Legal &amp; accessibility</h2>
          <Link to="/privacy">Privacy policy</Link>
          <Link to="/terms">Terms of service</Link>
        </section>
      </div>

      <div className="app-footer-bottom">
        <div className="app-footer-brand">
          <span className="app-footer-brand-mark"><Activity size={22} /></span>
          <span className="app-footer-brand-name">VITALIA<span>.</span></span>
          <span className="app-footer-copyright">© {new Date().getFullYear()} Vitalia. All rights reserved.</span>
        </div>
        <p className="app-footer-note">Your health journey, thoughtfully connected.</p>
        <button
          className="app-footer-cookie-settings"
          type="button"
          onClick={openCookieSettings}
        >
          Cookie settings
        </button>
        <span className="app-footer-language"><Globe size={16} /> English</span>
      </div>

      {cookieSettingsOpen && (
        <div
          className="cookie-settings-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setCookieSettingsOpen(false);
              setCookieSettingsError("");
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setCookieSettingsOpen(false);
              setCookieSettingsError("");
            }
          }}
        >
          <section
            className="cookie-settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-settings-title"
          >
            <h2 id="cookie-settings-title">Cookie settings</h2>
            <p>
              Essential browser storage keeps your signed-in session working.
              Optional analytics cookies are currently not used by Vitalia.
            </p>
            <div className="cookie-setting-row">
              <div>
                <strong>Essential storage</strong>
                <span>Always active</span>
              </div>
              <input type="checkbox" checked disabled aria-label="Essential storage is always active" />
            </div>
            <label className="cookie-setting-row" htmlFor="analytics-cookies">
              <div>
                <strong>Analytics cookies</strong>
                <span>Allow optional usage measurement if enabled in the future</span>
              </div>
              <input
                id="analytics-cookies"
                type="checkbox"
                checked={analyticsCookies}
                onChange={(event) => setAnalyticsCookies(event.target.checked)}
              />
            </label>
            {cookieSettingsError && (
              <p className="cookie-settings-error" role="alert">{cookieSettingsError}</p>
            )}
            <div className="cookie-settings-actions">
              <button
                className="cookie-settings-cancel"
                type="button"
                onClick={() => {
                  setCookieSettingsOpen(false);
                  setCookieSettingsError("");
                }}
              >
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={saveCookieSettings}>
                Save preferences
              </button>
            </div>
          </section>
        </div>
      )}
    </footer>
  );
}

export default Footer;
