import { NavLink } from "react-router-dom";
import {
  Activity,
  LayoutDashboard,
  Search,
  CalendarDays,
  FileText,
  Settings,
  ShieldCheck,
  X,
  Users,
  MapPin,
  Package,
  IndianRupee,
  FlaskConical,
  UserCog,
  Tag,
  Pill,
  MessageCircle,
  CircleHelp,
} from "lucide-react";
import { getRoleModulePath, permissionModules, hasPermission } from "../../services/permissions.js";

const patientLinks = [
  { label: "Homepage", path: "/homepage", icon: LayoutDashboard },
  { label: "Lab Test", path: "/tests", icon: Search },
  { label: "Appointment", path: "/bookings", icon: CalendarDays },
  { label: "Documents", path: "/reports", icon: FileText },
  { label: "Medicine Order", path: "/medicine-order", icon: Pill },
  { label: "Message", path: "/messages", icon: MessageCircle },
  { label: "Help", path: "/help", icon: CircleHelp },
  { label: "Setting", path: "/settings", icon: Settings },
];

const adminLinks = [
  { label: "Overview", path: "/admin", icon: LayoutDashboard },
  { label: "Bookings", path: "/admin/bookings", icon: CalendarDays },
  { label: "Diagnostics", path: "/admin/tests", icon: Search },
  { label: "Patients", path: "/admin/patients", icon: Users },
  { label: "Reports", path: "/admin/reports", icon: FileText },
  { label: "Centers", path: "/admin/centers", icon: MapPin },
  { label: "Staff", path: "/admin/staff", icon: ShieldCheck },
  { label: "Roles", path: "/admin/roles", icon: UserCog },
  { label: "Inventory", path: "/admin/inventory", icon: Package },
  { label: "Medicines", path: "/admin/medicines", icon: Pill },
  { label: "Messages", path: "/admin/messages", icon: MessageCircle },
  { label: "Finance & UPI", path: "/admin/finance", icon: IndianRupee },
  { label: "Discounts", path: "/admin/discounts", icon: Tag },
  { label: "Settings", path: "/admin/settings", icon: Settings },
];

const receptionistLinks = [
  { label: "Bookings", path: "/staff/bookings", icon: CalendarDays },
  { label: "Patient reports", path: "/staff/reports", icon: FileText },
];

const phlebotomistLinks = [
  { label: "Sample collection", path: "/staff/bookings", icon: CalendarDays },
];

const technicianLinks = [
  { label: "Lab workflow", path: "/staff/bookings", icon: FlaskConical },
  { label: "Reports", path: "/staff/reports", icon: FileText },
];

function Sidebar({ open, closeSidebar, user }) {
  const isAdmin = user?.role === "admin" || user?.role === "center_master";
  const isStaff = user?.role === "staff";
  const moduleIcons = {
    dashboard: LayoutDashboard,
    bookings: CalendarDays,
    diagnostics: Search,
    patients: Users,
    reports: FileText,
    centers: MapPin,
    staff: ShieldCheck,
    inventory: Package,
    medicines: Pill,
    messages: MessageCircle,
    finance: IndianRupee,
    discounts: Tag,
    settings: Settings,
  };
  const links = isAdmin
    ? (user?.role === "admin" ? adminLinks : adminLinks.filter(({ path }) => !["/admin/medicines", "/admin/messages"].includes(path)))
      .filter(({ path }) => {
        const module = permissionModules.find(({ path: modulePath }) => modulePath === path);
        return !module || hasPermission(user, module.key) ||
          user?.role === "admin" && ["medicines", "messages"].includes(module.key);
      })
    : user?.role === "custom"
      ? permissionModules
        .filter(({ key }) => hasPermission(user, key))
        .map(({ key, label }) => ({ label, path: getRoleModulePath(user, key), icon: moduleIcons[key] }))
      : isStaff
      ? (user.staffRole === "technician"
        ? technicianLinks
        : user.staffRole === "phlebotomist"
          ? phlebotomistLinks
          : receptionistLinks).filter(({ path }) =>
            hasPermission(user, path === "/staff/reports" ? "reports" : "bookings")
          )
      : patientLinks.filter(({ path }) => {
        const module = { "/tests": "diagnostics", "/bookings": "bookings", "/reports": "reports" }[path];
        return !module || hasPermission(user, module);
      });

  return (
    <>
      {open && <button className="sidebar-backdrop" onClick={closeSidebar} />}

      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-icon"><Activity size={22} /></span>
          <span>VITALIA<span className="brand-dot">.</span></span>
          <button className="mobile-close" onClick={closeSidebar}>
            <X size={20} />
          </button>
        </div>

        <div className="sidebar-section-label">
          {isAdmin ? "CENTER OPERATIONS" : isStaff ? "STAFF WORKSPACE" : user?.role === "custom" ? "CUSTOM WORKSPACE" : "YOUR HEALTH"}
        </div>

        <nav className="sidebar-nav">
          {links.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/admin" || path === "/homepage"}
              onClick={closeSidebar}
              className={({ isActive }) =>
                `nav-link ${isActive ? "nav-link-active" : ""}`
              }
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

          <div className="sidebar-account">
            {isAdmin || isStaff ? <ShieldCheck size={17} /> : <Settings size={17} />}
            <span>{user?.role === "center_master" ? `${user.assignedCenterName || "Assigned Center"} Master` : isAdmin ? "Administrator" : isStaff ? user.staffRole : user?.role === "custom" ? user.customRoleName : "Patient portal"}</span>
          </div>
      </aside>
    </>
  );
}

export default Sidebar;