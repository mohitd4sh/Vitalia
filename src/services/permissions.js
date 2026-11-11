export const permissionModules = [
  { key: "dashboard", label: "Overview", path: "/admin", area: "dashboard" },
  { key: "bookings", label: "Bookings", path: "/admin/bookings", area: "bookings" },
  { key: "diagnostics", label: "Diagnostics", path: "/admin/tests", area: "diagnostics" },
  { key: "patients", label: "Patients", path: "/admin/patients", area: "patients" },
  { key: "reports", label: "Reports", path: "/admin/reports", area: "reports" },
  { key: "centers", label: "Centers", path: "/admin/centers", area: "centers" },
  { key: "staff", label: "Staff", path: "/admin/staff", area: "staff" },
  { key: "inventory", label: "Inventory", path: "/admin/inventory", area: "inventory" },
  { key: "medicines", label: "Medicines", path: "/admin/medicines", area: "medicines" },
  { key: "messages", label: "Messages", path: "/admin/messages", area: "messages" },
  { key: "finance", label: "Finance & UPI", path: "/admin/finance", area: "finance" },
  { key: "discounts", label: "Discounts & coupons", path: "/admin/discounts", area: "discounts" },
  { key: "settings", label: "Settings", path: "/admin/settings", area: "settings" },
];

export function hasPermission(user, module, action = "read") {
  return ["admin", "center_master", "staff", "patient", "custom"].includes(user?.role) && Boolean(
    user.permissions?.some((permission) =>
      permission.module === module && permission.actions.includes(action)
    )
  );
}

export function getRoleModulePath(user, module) {
  if (user?.role === "custom" && module === "reports" && hasPermission(user, "reports", "create")) {
    return "/admin/reports";
  }
  return permissionModules.find(({ key }) => key === module)?.path || "/no-access";
}

export function getRoleHomePath(user) {
  if (user?.role === "admin" || user?.role === "center_master") {
    const module = permissionModules.find(({ key }) => hasPermission(user, key));
    return module?.path || "/admin/roles";
  }
  if (user?.role === "staff") {
    if (hasPermission(user, "bookings")) return "/staff/bookings";
    if (hasPermission(user, "reports") && ["technician", "receptionist"].includes(user.staffRole)) {
      return "/staff/reports";
    }
    return "/no-access";
  }
  if (user?.role === "custom") {
    const module = permissionModules.find(({ key }) => hasPermission(user, key));
    return module ? getRoleModulePath(user, module.key) : "/no-access";
  }
  return "/homepage";
}
