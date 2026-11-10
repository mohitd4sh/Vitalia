export const builtInRoleKeys = ["admin", "center_master", "staff", "patient"];
const allPermissionActions = ["read", "create", "update", "delete"];

export const builtInRoleMetadata = {
  admin: {
    name: "Administrator",
    description: "Global access to administrative and operational tools.",
    editableModules: ["dashboard", "bookings", "diagnostics", "patients", "reports", "centers", "staff", "inventory", "finance", "discounts", "settings"],
  },
  center_master: {
    name: "Center Master",
    description: "Center-scoped access to administrative and operational tools.",
    editableModules: ["dashboard", "bookings", "diagnostics", "patients", "reports", "centers", "staff", "inventory", "finance", "discounts", "settings"],
  },
  staff: {
    name: "Staff",
    description: "Staff workspace access, with responsibilities based on staff type.",
    editableModules: ["bookings", "reports"],
    editableActions: {
      bookings: ["read", "update"],
      reports: ["read", "create"],
    },
  },
  patient: {
    name: "Patient",
    description: "Patient portal access for bookings and personal account information.",
    editableModules: ["bookings", "diagnostics", "reports", "centers"],
    editableActions: {
      bookings: allPermissionActions,
      diagnostics: ["read"],
      reports: ["read"],
      centers: ["read"],
    },
  },
};

const defaultPermissions = {
  admin: [
    { module: "dashboard", actions: ["read"] },
    { module: "bookings", actions: allPermissionActions },
    { module: "diagnostics", actions: allPermissionActions },
    { module: "patients", actions: ["read"] },
    { module: "reports", actions: ["read", "create"] },
    { module: "centers", actions: allPermissionActions },
    { module: "staff", actions: ["read"] },
    { module: "inventory", actions: allPermissionActions },
    { module: "medicines", actions: allPermissionActions },
    { module: "messages", actions: ["read", "update"] },
    { module: "finance", actions: ["read", "update"] },
    { module: "discounts", actions: allPermissionActions },
    { module: "settings", actions: ["read", "update"] },
  ],
  center_master: [
    { module: "dashboard", actions: ["read"] },
    { module: "bookings", actions: allPermissionActions },
    { module: "diagnostics", actions: allPermissionActions },
    { module: "patients", actions: ["read"] },
    { module: "reports", actions: ["read", "create"] },
    { module: "centers", actions: allPermissionActions },
    { module: "staff", actions: ["read"] },
    { module: "inventory", actions: allPermissionActions },
    { module: "finance", actions: ["read", "update"] },
    { module: "discounts", actions: allPermissionActions },
    { module: "settings", actions: ["read", "update"] },
  ],
  staff: [
    { module: "bookings", actions: ["read", "update"] },
    { module: "reports", actions: ["read", "create"] },
  ],
  patient: [
    { module: "bookings", actions: allPermissionActions },
    { module: "diagnostics", actions: ["read"] },
    { module: "reports", actions: ["read"] },
    { module: "centers", actions: ["read"] },
  ],
};

export function getDefaultBuiltInRolePermissions(role) {
  return (defaultPermissions[role] || []).map(({ module, actions }) => ({
    module,
    actions: [...actions],
  }));
}
