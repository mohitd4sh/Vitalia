
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

import Login from "./components/auth/Login.jsx";
import Register from "./components/auth/Register.jsx";
import ForgotPassword from "./components/auth/ForgotPassword.jsx";
import ResetPassword from "./components/auth/ResetPassword.jsx";

import Sidebar from "./components/layout/Sidebar.jsx";
import Header from "./components/layout/Header.jsx";
import PatientHeader from "./components/layout/PatientHeader.jsx";
import Footer from "./components/layout/Footer.jsx";

import Dashboard from "./components/dashboard/Dashboard.jsx";
import SearchTests from "./pages/SearchTests.jsx";
import Centers from "./pages/Centers.jsx";
import Bookings from "./pages/Booking.jsx";
import Reports from "./pages/Reports.jsx";
import { MedicineOrder, PatientHelp, PatientMessages, PatientSettings } from "./pages/PatientPages.jsx";
import { AdminMedicines, AdminSupportInbox } from "./pages/AdminPatientServices.jsx";
import AboutUs from "./pages/AboutUs.jsx";
import { PrivacyPolicy, TermsOfService } from "./pages/LegalPages.jsx";
import {
  AdminBookings,
  AdminCenters,
  AdminInventory,
  AdminOverview,
  AdminPatients,
  AdminReports,
  AdminSettings,
  AdminStaff,
  AdminTests,
  AdminFinance,
  AdminDiscounts,
  AdminRoles,
} from "./pages/AdminPages.jsx";

import UserSetup from "./components/onboarding/UserSetup.jsx";
import { clearSession, fetchCurrentUser, getStoredUser } from "./services/api.js";
import { getRoleHomePath, hasPermission } from "./services/permissions.js";

import "./components/styles/app.css";
import "./components/styles/auth.css";
import "./components/styles/patient-storefront.css";

function App() {
  const location = useLocation();
  const [user, setUser] = useState(() =>
    sessionStorage.getItem("vitaliaToken") ? getStoredUser() : null
  );
  const [sessionError, setSessionError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.key]);

  useEffect(() => {
    const revealSelector = [
      ".page-content > *:not(.dashboard-page)",
      ".page-content .content-page > :is(header, section, article, form, .admin-table-panel, .admin-stat-grid, .admin-metric-grid, .admin-record-grid, .admin-editor-grid, .admin-toolbar, .custom-role-section)",
      ".about-page :is(.about-header, .about-hero, .about-purpose, .about-how, .about-cta, .about-footer)",
      ".about-page .about-steps > .about-step",
      ".about-legal-shell > *",
      ".auth-page > *",
      ".recovery-page > :is(.brand, .recovery-card)",
    ].join(", ");
    const root = document.getElementById("root");
    if (!root) return undefined;

    function observeReveals(node) {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const elements = [];
      if (node.matches(revealSelector)) elements.push(node);
      elements.push(...node.querySelectorAll(revealSelector));
      elements.forEach((element) => {
        if (element.classList.contains("reveal-ready")) return;
        element.classList.add("reveal-ready");
      });
    }

    observeReveals(root);
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach(observeReveals);
      });
    });
    mutationObserver.observe(root, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
    };
  }, [location.key]);

  useEffect(() => {
    if (!sessionStorage.getItem("vitaliaToken")) return undefined;

    let active = true;

    fetchCurrentUser()
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch((error) => {
        if (active) setSessionError(error.message);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    async function refreshPermissions() {
      try {
        setUser(await fetchCurrentUser());
      } catch (error) {
        setSessionError(error.message);
      }
    }

    window.addEventListener("vitalia:permissions-updated", refreshPermissions);
    return () => window.removeEventListener("vitalia:permissions-updated", refreshPermissions);
  }, []);

  useEffect(() => {
    function handleSessionExpired() {
      setUser(null);
      setSessionError("");
    }

    window.addEventListener("vitalia:session-expired", handleSessionExpired);
    return () =>
      window.removeEventListener("vitalia:session-expired", handleSessionExpired);
  }, []);

  async function verifySession() {
    setSessionError("");

    try {
      setUser(await fetchCurrentUser());
    } catch (error) {
      setSessionError(error.message);
    }
  }

  function handleLogin(userData) {
    setUser(userData);
    setSessionError("");
  }

  function handleLogout() {
    clearSession();
    setUser(null);
    setSessionError("");
    setSidebarOpen(false);
  }

  const isAdmin = user?.role === "admin";
  const isCenterManager = isAdmin || user?.role === "center_master";
  const isStaff = user?.role === "staff";
  const isCustomRole = user?.role === "custom";
  const canAccessAdminModules = isCenterManager || isCustomRole;

  const setupComplete = user?.role !== "patient" || Boolean(user?.profileCompleted);

  const homePath = !user ? "/login" : !setupComplete ? "/setup" : getRoleHomePath(user);

  if (sessionError) {
    return (
      <main className="session-gate">
        <section className="session-gate-card" aria-live="polite">
          <h1>Unable to verify your session.</h1>
          <p role="alert">{sessionError}</p>
          <div className="session-gate-actions">
            <button className="primary-button" onClick={verifySession}>Retry</button>
            <button className="session-signout" onClick={handleLogout}>Sign out</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<AboutUs user={user} />} />
      <Route path="/about" element={<AboutUs user={user} />} />
      <Route path="/privacy" element={<main className="about-legal-shell"><PrivacyPolicy user={user} /></main>} />
      <Route path="/terms" element={<main className="about-legal-shell"><TermsOfService user={user} /></main>} />

      {/* Login */}
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to={homePath} replace />
          ) : (
            <Login onLogin={handleLogin} />
          )
        }
      />

      {/* Registration */}
      <Route
        path="/register"
        element={
          user ? (
            <Navigate to={homePath} replace />
          ) : (
            <Register onRegister={handleLogin} />
          )
        }
      />

      {/* Forgot password */}
      <Route
        path="/forgot-password"
        element={<ForgotPassword />}
      />
      <Route
        path="/reset-password"
        element={<ResetPassword />}
      />

      {/* User onboarding */}
      <Route
        path="/setup"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : isAdmin || setupComplete ? (
            <Navigate to={homePath} replace />
          ) : (
            <UserSetup onProfileSaved={setUser} />
          )
        }
      />

      {/* Application layout */}
      <Route
        path="/*"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : !setupComplete ? (
            <Navigate to="/setup" replace />
          ) : (
            <div className={`app-shell${user.role === "patient" ? " patient-storefront-shell" : ""}`}>
              {user.role !== "patient" && (
                <Sidebar
                  open={sidebarOpen}
                  closeSidebar={() => setSidebarOpen(false)}
                  user={user}
                />
              )}

              <div className="app-main">
                {user.role === "patient" ? (
                  <PatientHeader key={location.pathname} user={user} onLogout={handleLogout} />
                ) : (
                  <Header
                    user={user}
                    onMenuClick={() =>
                      setSidebarOpen((current) => !current)
                    }
                    onLogout={handleLogout}
                  />
                )}

                <main className={`page-content${user.role === "patient" ? " patient-storefront-content" : ""}`}>
                  <Routes>
                    <Route path="/no-access" element={
                      <section className="content-page">
                        <h1>No workspace access</h1>
                        <p className="page-intro">Your assigned role does not currently have access to any workspace areas. Contact an administrator.</p>
                      </section>
                    } />

                    <Route path="/dashboard" element={<Navigate to="/homepage" replace />} />

                    {/* Patient homepage */}
                    <Route
                      path="/homepage"
                      element={
                        isCenterManager || isStaff || isCustomRole ? (
                          <Navigate to="/admin" replace />
                        ) : (
                          <Dashboard user={user} />
                        )
                      }
                    />

                    {/* Diagnostic tests */}
                    <Route
                      path="/tests"
                      element={
                        isCenterManager || isStaff ||
                          (["patient", "custom"].includes(user.role) && !hasPermission(user, "diagnostics")) ? (
                          <Navigate to={homePath} replace />
                        ) : (
                          <SearchTests key={location.search} canBook={hasPermission(user, "bookings", "create")} user={user} />
                        )
                      }
                    />

                    <Route
                      path="/centers"
                      element={
                        user.role === "patient" ? (
                          <Centers />
                        ) : (
                          <Navigate to={homePath} replace />
                        )
                      }
                    />

                    {/* Bookings */}
                    <Route
                      path="/bookings"
                      element={
                        isCenterManager || isStaff ||
                          (["patient", "custom"].includes(user.role) && !hasPermission(user, "bookings")) ? (
                          <Navigate to={homePath} replace />
                        ) : (
                          <Bookings user={user} />
                        )
                      }
                    />

                    {/* Reports */}
                    <Route
                      path="/reports"
                      element={
                        isCenterManager || isStaff ||
                          (["patient", "custom"].includes(user.role) && !hasPermission(user, "reports")) ? (
                          <Navigate to={homePath} replace />
                        ) : (
                          <Reports />
                        )
                      }
                    />

                    <Route path="/medicine-order" element={user.role === "patient" ? <MedicineOrder /> : <Navigate to={homePath} replace />} />
                    <Route path="/messages" element={user.role === "patient" ? <PatientMessages user={user} /> : <Navigate to={homePath} replace />} />
                    <Route path="/help" element={user.role === "patient" ? <PatientHelp /> : <Navigate to={homePath} replace />} />
                    <Route path="/settings" element={user.role === "patient" ? <PatientSettings user={user} onUserUpdated={setUser} /> : <Navigate to={homePath} replace />} />
                    <Route path="/admin/medicines" element={canAccessAdminModules && (user.role === "admin" || hasPermission(user, "medicines")) ? <AdminMedicines user={user} /> : <Navigate to={homePath} replace />} />
                    <Route path="/admin/messages" element={canAccessAdminModules && (user.role === "admin" || hasPermission(user, "messages")) ? <AdminSupportInbox user={user} /> : <Navigate to={homePath} replace />} />

                    {/* Admin dashboard */}
                    <Route
                      path="/admin"
                      element={
                        canAccessAdminModules && hasPermission(user, "dashboard") ? (
                        <AdminOverview user={user} />
                        ) : (
                        <Navigate to={homePath} replace />
                        )
                      }
                    />

                    <Route path="/admin/bookings" element={canAccessAdminModules && hasPermission(user, "bookings") ? <AdminBookings user={user} /> : <Navigate to={homePath} replace />} />
                    <Route path="/admin/tests" element={canAccessAdminModules && hasPermission(user, "diagnostics") ? <AdminTests user={user} /> : <Navigate to={homePath} replace />} />
                    <Route path="/admin/patients" element={canAccessAdminModules && hasPermission(user, "patients") ? <AdminPatients user={user} /> : <Navigate to={homePath} replace />} />
                    <Route path="/admin/reports" element={canAccessAdminModules && hasPermission(user, "reports", "create") ? <AdminReports user={user} /> : <Navigate to={homePath} replace />} />
                    <Route path="/admin/centers" element={canAccessAdminModules && hasPermission(user, "centers") ? <AdminCenters user={user} /> : <Navigate to={homePath} replace />} />
                    <Route path="/admin/staff" element={canAccessAdminModules && hasPermission(user, "staff") ? <AdminStaff user={user} /> : <Navigate to={homePath} replace />} />
                    <Route path="/admin/roles" element={isCenterManager ? <AdminRoles currentUserId={user.id} user={user} /> : <Navigate to={homePath} replace />} />
                    <Route path="/admin/inventory" element={canAccessAdminModules && hasPermission(user, "inventory") ? <AdminInventory user={user} /> : <Navigate to={homePath} replace />} />
                    <Route path="/admin/finance" element={canAccessAdminModules && hasPermission(user, "finance") ? <AdminFinance user={user} /> : <Navigate to={homePath} replace />} />
                    <Route path="/admin/discounts" element={canAccessAdminModules && hasPermission(user, "discounts") ? <AdminDiscounts user={user} /> : <Navigate to={homePath} replace />} />
                    <Route path="/admin/billing" element={<Navigate to="/admin/finance" replace />} />
                    <Route path="/admin/settings" element={canAccessAdminModules && hasPermission(user, "settings") ? <AdminSettings user={user} /> : <Navigate to={homePath} replace />} />
                    <Route path="/admin/*" element={<Navigate to="/admin" replace />} />

                    <Route path="/staff/bookings" element={isStaff && hasPermission(user, "bookings") ? <AdminBookings staffRole={user.staffRole} user={user} /> : <Navigate to={homePath === "/staff/bookings" ? "/no-access" : homePath} replace />} />
                    <Route path="/staff/reports" element={isStaff && hasPermission(user, "reports") && ["technician", "receptionist"].includes(user.staffRole) ? <AdminReports staffMode staffRole={user.staffRole} user={user} /> : <Navigate to={homePath === "/staff/reports" ? "/no-access" : homePath} replace />} />
                    <Route path="/staff/*" element={<Navigate to={homePath} replace />} />

                    {/* Redirect unknown paths */}
                    <Route
                      path="*"
                      element={<Navigate to={homePath} replace />}
                    />
                  </Routes>
                </main>
                <Footer user={user} onLogout={handleLogout} />
              </div>
            </div>
          )
        }
      />

    </Routes>
  );
}

export default App;