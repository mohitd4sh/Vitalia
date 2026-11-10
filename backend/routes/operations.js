import express from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Center from "../models/Center.js";
import CenterSettings from "../models/CenterSettings.js";
import DiagnosticTest from "../models/DiagnosticTest.js";
import InventoryItem from "../models/InventoryItem.js";
import CustomRole from "../models/CustomRole.js";
import BuiltInRole from "../models/BuiltInRole.js";
import User from "../models/User.js";
import { getUserCenterId, getUserPermissions, requireAuth, requireAdmin, requireCenterManager, requireModuleAccess } from "../middleware/auth.js";
import { notifyUser } from "../services/notifications.js";
import { ensureCenterSettings } from "../services/centerSettings.js";
import { builtInRoleKeys, builtInRoleMetadata, getDefaultBuiltInRolePermissions } from "../services/builtInRolePermissions.js";

const router = express.Router();
router.use(requireAuth);
const staffRoles = ["receptionist", "technician", "phlebotomist"];
const accountRoles = ["patient", "admin", "center_master", "staff"];
const permissionModules = [
  "dashboard", "bookings", "diagnostics", "patients", "reports",
  "centers", "staff", "inventory", "medicines", "messages", "finance", "discounts", "settings",
];
const permissionActions = ["read", "create", "update", "delete"];
const moduleActions = {
  dashboard: ["read"],
  bookings: permissionActions,
  diagnostics: permissionActions,
  patients: ["read"],
  reports: ["read", "create"],
  centers: permissionActions,
  staff: ["read"],
  inventory: permissionActions,
  medicines: permissionActions,
  messages: ["read", "update"],
  finance: ["read", "update"],
  discounts: permissionActions,
  settings: ["read", "update"],
};

function canReadOverviewModule(user, module) {
  return getUserPermissions(user).some((permission) =>
    permission.module === module && permission.actions.includes("read")
  );
}

function getOverviewPeriod(period) {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (period === "year") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    const buckets = Array.from({ length: 12 }, (_, index) =>
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1))
    );
    return {
      now,
      start,
      buckets,
      format: "%Y-%m",
    };
  }

  const days = period === "month" ? 30 : 7;
  const start = new Date(today - (days - 1) * 24 * 60 * 60 * 1000);
  const buckets = Array.from({ length: days }, (_, index) =>
    new Date(start.getTime() + index * 24 * 60 * 60 * 1000)
  );
  return {
    now,
    start,
    buckets,
    format: "%Y-%m-%d",
  };
}

function formatOverviewBucket(date, period) {
  return period === "year"
    ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
    : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function validateRoleFields(body) {
  const { name, description = "", permissions, center = null } = body;
  if (
    typeof name !== "string" || !name.trim() || name.trim().length > 60 ||
    typeof description !== "string" || description.length > 240 ||
    (center !== null && !mongoose.isValidObjectId(center))
  ) return null;

  const normalizedPermissions = validatePermissionOverrides(permissions);
  if (!normalizedPermissions) return null;
  return { name: name.trim(), description: description.trim(), permissions: normalizedPermissions, center };
}

function validatePermissionOverrides(permissions) {
  if (!Array.isArray(permissions) || permissions.length > permissionModules.length) return null;
  const normalizedPermissions = [];
  const seenModules = new Set();
  for (const permission of permissions) {
    if (
      !permission || !permissionModules.includes(permission.module) ||
      seenModules.has(permission.module) || !Array.isArray(permission.actions) ||
      permission.actions.some((action) =>
        !permissionActions.includes(action) || !moduleActions[permission.module].includes(action)
      ) ||
      (permission.actions.some((action) => action !== "read") && !permission.actions.includes("read"))
    ) return null;
    seenModules.add(permission.module);
    normalizedPermissions.push({
      module: permission.module,
      actions: [...new Set(permission.actions)],
    });
  }
  return normalizedPermissions;
}

async function centerAccountFilter(centerId) {
  const patientIds = await Booking.distinct("patient", { center: centerId });
  return {
    $or: [
      { assignedCenter: centerId },
      {
        role: "patient",
        _id: { $in: patientIds },
        assignedCenter: { $in: [null, centerId] },
      },
    ],
  };
}

router.get("/overview", requireModuleAccess("dashboard", "read"), async (req, res) => {
  try {
    const period = ["week", "month", "year"].includes(req.query.period) ? req.query.period : "week";
    const { now, start, buckets, format } = getOverviewPeriod(period);
    const assignedCenterId = getUserCenterId(req.user);
    const canReadFinance = canReadOverviewModule(req.user, "finance");
    const centerPatientIds = assignedCenterId
      ? await Booking.distinct("patient", { center: assignedCenterId })
      : null;
    const [patients, staff, tests, centers, inventoryItems, bookings, paid] = await Promise.all([
      User.countDocuments({ role: "patient", ...(centerPatientIds ? { _id: { $in: centerPatientIds } } : {}) }),
      User.countDocuments({ role: "staff", active: true, ...(assignedCenterId ? { assignedCenter: assignedCenterId } : {}) }),
      DiagnosticTest.countDocuments({ active: true, ...(assignedCenterId ? { centers: [assignedCenterId], allCenters: false } : {}) }),
      Center.countDocuments({ active: true, ...(assignedCenterId ? { _id: assignedCenterId } : {}) }),
      InventoryItem.countDocuments(assignedCenterId ? { center: assignedCenterId } : {}),
      Booking.countDocuments({
        status: { $nin: ["completed", "cancelled"] },
        ...(assignedCenterId ? { center: assignedCenterId } : {}),
      }),
      canReadFinance
        ? Booking.aggregate([
            { $match: { "payment.status": "paid", ...(assignedCenterId ? { center: assignedCenterId } : {}) } },
            { $group: { _id: null, revenue: { $sum: "$price" } } },
          ])
        : Promise.resolve([]),
    ]);

    const extraData = {};
    if (canReadOverviewModule(req.user, "patients")) {
      const patientFilter = {
        role: "patient",
        ...(centerPatientIds ? { _id: { $in: centerPatientIds } } : {}),
      };
      const [newPatients, trend, recentPatients] = await Promise.all([
        User.countDocuments({
          ...patientFilter,
          createdAt: { $gte: start, $lte: now },
        }),
        User.aggregate([
          {
            $match: {
              ...patientFilter,
              createdAt: { $gte: start, $lte: now },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format, date: "$createdAt", timezone: "UTC" } },
              count: { $sum: 1 },
            },
          },
        ]),
        User.find(patientFilter)
          .select("name createdAt")
          .sort({ createdAt: -1 })
          .limit(8)
          .lean(),
      ]);
      const trendByBucket = new Map(trend.map(({ _id, count }) => [_id, count]));
      extraData.newPatients = newPatients;
      extraData.patientTrend = buckets.map((bucket) => ({
        bucket: formatOverviewBucket(bucket, period),
        count: trendByBucket.get(formatOverviewBucket(bucket, period)) || 0,
      }));
      extraData.recentPatients = recentPatients.map((patient) => ({
        id: patient._id,
        name: patient.name,
        createdAt: patient.createdAt,
      }));
    }

    if (canReadOverviewModule(req.user, "bookings")) {
      const bookingFilter = {
        status: { $ne: "cancelled" },
        createdAt: { $gte: start, $lte: now },
        ...(assignedCenterId ? { center: assignedCenterId } : {}),
      };
      const [diagnosticBreakdown, upcomingBookings] = await Promise.all([
        Booking.aggregate([
          { $match: bookingFilter },
          { $group: { _id: "$testName", count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 6 },
        ]),
        Booking.find({
          status: { $nin: ["completed", "cancelled"] },
          appointmentAt: {
            $gte: now,
            $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
          ...(assignedCenterId ? { center: assignedCenterId } : {}),
        })
          .populate("patient", "name")
          .select("patient testName appointmentAt status centerName")
          .sort({ appointmentAt: 1 })
          .limit(10)
          .lean(),
      ]);
      extraData.diagnosticBreakdown = diagnosticBreakdown.map(({ _id, count }) => ({
        name: _id,
        count,
      }));
      extraData.upcomingBookings = upcomingBookings.map((booking) => ({
        id: booking._id,
        patientName: booking.patient?.name || "Patient",
        testName: booking.testName,
        appointmentAt: booking.appointmentAt,
        status: booking.status,
        centerName: booking.centerName,
      }));
    }

    return res.json({
      patients,
      staff,
      tests,
      centers,
      inventoryItems,
      activeBookings: bookings,
      ...extraData,
      ...(canReadFinance ? { paidRevenue: paid[0]?.revenue || 0 } : {}),
    });
  } catch (error) {
    console.error("Operations overview error:", error.message);
    return res.status(500).json({ message: "Unable to load operations overview." });
  }
});

router.get("/patients", requireModuleAccess("patients", "read"), async (req, res) => {
  try {
    const centerId = getUserCenterId(req.user);
    const patientBookings = centerId
      ? await Booking.distinct("patient", { center: centerId })
      : null;
    const patients = await User.find({
      role: "patient",
      ...(patientBookings ? { _id: { $in: patientBookings } } : {}),
    })
      .select("name email profileCompleted createdAt")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ patients: patients.map((patient) => ({ ...patient, id: patient._id })) });
  } catch (error) {
    console.error("Patient list error:", error.message);
    return res.status(500).json({ message: "Unable to load patients." });
  }
});

router.get("/staff", requireModuleAccess("staff", "read"), async (req, res) => {
  try {
    const centerId = getUserCenterId(req.user);
    const staff = await User.find({
      role: "staff",
      ...(centerId ? { assignedCenter: centerId } : {}),
    })
      .select("name email staffRole assignedCenter active createdAt")
      .populate("assignedCenter", "name")
      .sort({ name: 1 })
      .lean();
    return res.json({ staff: staff.map((member) => ({ ...member, id: member._id })) });
  } catch (error) {
    console.error("Staff list error:", error.message);
    return res.status(500).json({ message: "Unable to load staff." });
  }
});

router.get("/accounts", requireCenterManager, async (req, res) => {
  try {
    const centerFilter = req.user.role === "center_master"
      ? await centerAccountFilter(req.user.assignedCenter?._id || req.user.assignedCenter)
      : {};
    const accounts = await User.find(centerFilter)
      .select("name email role staffRole customRole permissionOverrides assignedCenter active createdAt")
      .populate("customRole", "name permissions")
      .populate("assignedCenter", "name")
      .sort({ name: 1 })
      .lean();
    return res.json({
      accounts: accounts.map((account) => ({
        ...account,
        id: account._id,
        customRoleId: account.customRole?._id || null,
        customRoleName: account.customRole?.name || "",
        permissions: account.permissionOverrides ?? account.customRole?.permissions ?? [],
        hasPermissionOverride: account.permissionOverrides != null,
        assignedCenterId: account.assignedCenter?._id || null,
        assignedCenterName: account.assignedCenter?.name || "",
      })),
    });
  } catch (error) {
    console.error("Account roles list error:", error.message);
    return res.status(500).json({ message: "Unable to load account roles." });
  }
});

router.patch("/accounts/:id/role", requireCenterManager, async (req, res) => {
  try {
    const { role, staffRole, customRoleId, active, assignedCenter, permissionOverrides } = req.body;
    const normalizedPermissionOverrides = permissionOverrides === undefined || permissionOverrides === null
      ? permissionOverrides
      : validatePermissionOverrides(permissionOverrides);
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      (role !== undefined && ![...accountRoles, "custom"].includes(role)) ||
      (staffRole !== undefined && staffRole !== "" && !staffRoles.includes(staffRole)) ||
      (customRoleId !== undefined && customRoleId !== null && !mongoose.isValidObjectId(customRoleId)) ||
      (assignedCenter !== undefined && assignedCenter !== null && !mongoose.isValidObjectId(assignedCenter)) ||
      (active !== undefined && typeof active !== "boolean") ||
      (permissionOverrides !== undefined && permissionOverrides !== null && !normalizedPermissionOverrides) ||
      (role === undefined && staffRole === undefined && customRoleId === undefined && active === undefined && assignedCenter === undefined && permissionOverrides === undefined)
    ) {
      return res.status(400).json({ message: "Provide valid account role, permissions, center, or access details." });
    }
    const centerFilter = req.user.role === "center_master"
      ? await centerAccountFilter(req.user.assignedCenter?._id || req.user.assignedCenter)
      : {};
    const account = await User.findOne({ _id: req.params.id, ...centerFilter });
    if (!account) return res.status(404).json({ message: "Account not found." });
    if (account._id.equals(req.user._id)) {
      return res.status(400).json({ message: "You cannot change your own role or access status." });
    }

    const nextRole = role ?? account.role;
    const nextActive = active ?? account.active;
    const nextCustomRoleId = customRoleId === undefined ? account.customRole : customRoleId;
    const customRoleChanged = account.role !== nextRole ||
      String(account.customRole?._id || account.customRole || "") !== String(nextCustomRoleId || "");
    const nextCenterId = req.user.role === "center_master"
      ? req.user.assignedCenter?._id || req.user.assignedCenter
      : assignedCenter === undefined ? account.assignedCenter : assignedCenter;
    if (req.user.role === "center_master" && nextRole === "admin") {
      return res.status(403).json({ message: "Center Masters cannot grant global administrator access." });
    }
    if (nextRole === "center_master" && !nextCenterId) {
      return res.status(400).json({ message: "Assign a center to this Center Master account." });
    }
    if (nextCenterId && !await Center.exists({ _id: nextCenterId })) {
      return res.status(400).json({ message: "Choose a valid diagnostic center." });
    }
    if (nextRole === "custom") {
      if (!nextCustomRoleId) {
        return res.status(400).json({ message: "Choose a custom role for this account." });
      }
      const customRole = await CustomRole.findOne({
        _id: nextCustomRoleId,
        active: true,
        ...(req.user.role === "center_master" ? { center: req.user.assignedCenter?._id || req.user.assignedCenter } : {}),
      }).select("_id center");
      if (!customRole) return res.status(400).json({ message: "Choose an active custom role." });
      if (customRole.center && String(customRole.center) !== String(nextCenterId)) {
        return res.status(400).json({ message: "Assign this account to the custom role's center." });
      }
    }
    if (permissionOverrides !== undefined && nextRole !== "custom") {
      return res.status(400).json({ message: "Per-account permissions are only available for custom-role accounts." });
    }
    if (
      account.role === "admin" &&
      account.active &&
      (nextRole !== "admin" || !nextActive)
    ) {
      const activeAdminCount = await User.countDocuments({ role: "admin", active: true });
      if (activeAdminCount <= 1) {
        return res.status(409).json({ message: "The last active administrator cannot be demoted or deactivated." });
      }
    }

    account.role = nextRole;
    account.customRole = nextRole === "custom" ? nextCustomRoleId : null;
    if (nextRole !== "custom") {
      account.permissionOverrides = null;
    } else if (permissionOverrides !== undefined) {
      account.permissionOverrides = normalizedPermissionOverrides;
    } else if (customRoleChanged) {
      account.permissionOverrides = null;
    }
    account.staffRole = nextRole === "staff"
      ? staffRole ?? account.staffRole
      : "";
    if (nextRole === "staff" && !staffRoles.includes(account.staffRole)) {
      return res.status(400).json({ message: "Choose a valid staff permission." });
    }
    account.active = nextActive;
    account.assignedCenter = nextCenterId || null;
    await account.save();
    await account.populate("customRole", "name permissions");
    await notifyUser(account._id, {
      category: "account",
      severity: "info",
      title: "Account access updated",
      message: "Your assigned role or center access has been updated. Sign in again to refresh your permissions.",
      href: "/login",
    });

    return res.json({
      account: {
        id: account._id,
        name: account.name,
        email: account.email,
        role: account.role,
        staffRole: account.staffRole,
        customRoleId: account.customRole?._id || null,
        customRoleName: account.customRole?.name || "",
        permissions: account.permissionOverrides ?? account.customRole?.permissions ?? [],
        hasPermissionOverride: account.permissionOverrides != null,
        assignedCenterId: account.assignedCenter?._id || account.assignedCenter || null,
        active: account.active,
        createdAt: account.createdAt,
      },
    });
  } catch (error) {
    console.error("Account role update error:", error.message);
    return res.status(500).json({ message: "Unable to update this account role." });
  }
});

router.get("/roles", requireCenterManager, async (req, res) => {
  try {
    const [roles, savedBuiltInRoles] = await Promise.all([
      CustomRole.find(req.user.role === "center_master"
        ? { center: req.user.assignedCenter?._id || req.user.assignedCenter }
        : {}).sort({ name: 1 }).lean(),
      BuiltInRole.find().lean(),
    ]);
    const builtInRoles = builtInRoleKeys.map((role) => ({
      role,
      ...builtInRoleMetadata[role],
      permissions: savedBuiltInRoles.find((savedRole) => savedRole.role === role)?.permissions
        ?? getDefaultBuiltInRolePermissions(role),
    }));
    return res.json({ roles, builtInRoles });
  } catch (error) {
    console.error("Custom role list error:", error.message);
    return res.status(500).json({ message: "Unable to load custom roles." });
  }
});

router.patch("/roles/builtin/:role", requireAdmin, async (req, res) => {
  try {
    const { role } = req.params;
    const metadata = builtInRoleMetadata[role];
    const permissions = validatePermissionOverrides(req.body?.permissions);
    if (!metadata || !permissions || permissions.some(({ module, actions }) =>
      !metadata.editableModules.includes(module) ||
      actions.some((action) => !(metadata.editableActions?.[module] || moduleActions[module]).includes(action))
    )) {
      return res.status(400).json({ message: "Choose a valid built-in role permission matrix." });
    }

    const builtInRole = await BuiltInRole.findOneAndUpdate(
      { role },
      { role, permissions },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({
      builtInRole: {
        role,
        ...metadata,
        permissions: builtInRole.permissions,
      },
    });
  } catch (error) {
    console.error("Built-in role update error:", error.message);
    return res.status(500).json({ message: "Unable to update this built-in role." });
  }
});

router.post("/roles", requireCenterManager, async (req, res) => {
  try {
    const fields = validateRoleFields(req.body);
    if (!fields) return res.status(400).json({ message: "Enter a valid role name, description, and permission matrix." });
    if (req.user.role === "center_master") fields.center = req.user.assignedCenter?._id || req.user.assignedCenter;
    const role = await CustomRole.create(fields);
    return res.status(201).json({ role });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "A role with this name already exists." });
    console.error("Custom role create error:", error.message);
    return res.status(500).json({ message: "Unable to create this custom role." });
  }
});

router.patch("/roles/:id", requireCenterManager, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Choose a valid custom role." });
    }
    const fields = validateRoleFields(req.body);
    if (!fields) return res.status(400).json({ message: "Enter a valid role name, description, and permission matrix." });
    const filter = req.user.role === "center_master"
      ? { _id: req.params.id, center: req.user.assignedCenter?._id || req.user.assignedCenter }
      : { _id: req.params.id };
    if (req.user.role === "center_master") fields.center = req.user.assignedCenter?._id || req.user.assignedCenter;
    const existingRole = await CustomRole.findOne(filter).select("_id center");
    if (!existingRole) return res.status(404).json({ message: "Custom role not found." });
    if (String(existingRole.center || "") !== String(fields.center || "") &&
      await User.exists({ customRole: existingRole._id })) {
      return res.status(409).json({ message: "Reassign accounts before changing this role's center." });
    }
    const role = await CustomRole.findOneAndUpdate(filter, fields, {
      new: true,
      runValidators: true,
    });
    if (!role) return res.status(404).json({ message: "Custom role not found." });
    return res.json({ role });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "A role with this name already exists." });
    console.error("Custom role update error:", error.message);
    return res.status(500).json({ message: "Unable to update this custom role." });
  }
});

router.delete("/roles/:id", requireCenterManager, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Choose a valid custom role." });
    }
    const roleFilter = req.user.role === "center_master"
      ? { _id: req.params.id, center: req.user.assignedCenter?._id || req.user.assignedCenter }
      : { _id: req.params.id };
    const role = await CustomRole.findOne(roleFilter).select("_id");
    if (!role) return res.status(404).json({ message: "Custom role not found." });
    const assignedAccounts = await User.countDocuments({ customRole: role._id });
    if (assignedAccounts) {
      return res.status(409).json({
        message: "Reassign accounts before deleting this role.",
      });
    }
    await CustomRole.deleteOne({ _id: role._id });
    return res.json({ message: "Custom role deleted." });
  } catch (error) {
    console.error("Custom role delete error:", error.message);
    return res.status(500).json({ message: "Unable to delete this custom role." });
  }
});

router.post("/staff", requireCenterManager, async (req, res) => {
  try {
    const { name, email, password, staffRole } = req.body;
    if (
      typeof name !== "string" || !name.trim() || name.trim().length > 100 ||
      typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" || password.length < 12 || password.length > 72 ||
      !staffRoles.includes(staffRole) ||
      (req.user.role !== "center_master" && req.body.assignedCenter != null && !mongoose.isValidObjectId(req.body.assignedCenter))
    ) {
      return res.status(400).json({
        message: "Provide a valid name, email, staff role, and a 12–72 character temporary password.",
      });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.exists({ email: normalizedEmail })) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }
    const assignedCenter = req.user.role === "center_master"
      ? req.user.assignedCenter?._id || req.user.assignedCenter
      : req.body.assignedCenter || null;
    if (assignedCenter && !await Center.exists({ _id: assignedCenter })) {
      return res.status(400).json({ message: "Choose a valid diagnostic center." });
    }
    const member = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 12),
      role: "staff",
      staffRole,
      assignedCenter,
    });
    await notifyUser(member._id, {
      category: "account",
      severity: "success",
      title: "Staff portal access created",
      message: "Your staff account is ready. Contact your center manager for sign-in details.",
      href: "/login",
    });
    return res.status(201).json({
      staff: {
        id: member._id,
        name: member.name,
        email: member.email,
        staffRole: member.staffRole,
        assignedCenterId: member.assignedCenter,
        active: member.active,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }
    console.error("Staff create error:", error.message);
    return res.status(500).json({ message: "Unable to create this staff account." });
  }
});

router.patch("/staff/:id", requireCenterManager, async (req, res) => {
  try {
    const { staffRole, active } = req.body;
    if (
      (staffRole !== undefined && !staffRoles.includes(staffRole)) ||
      (active !== undefined && typeof active !== "boolean") ||
      (staffRole === undefined && active === undefined)
    ) {
      return res.status(400).json({ message: "Provide a valid staff role or active status." });
    }
    const member = await User.findOne({
      _id: req.params.id,
      role: "staff",
      ...(req.user.role === "center_master" ? { assignedCenter: req.user.assignedCenter?._id || req.user.assignedCenter } : {}),
    });
    if (!member) return res.status(404).json({ message: "Staff member not found." });
    if (staffRole !== undefined) member.staffRole = staffRole;
    if (active !== undefined) member.active = active;
    await member.save();
    return res.json({
      staff: {
        id: member._id,
        name: member.name,
        email: member.email,
        staffRole: member.staffRole,
        active: member.active,
      },
    });
  } catch (error) {
    console.error("Staff update error:", error.message);
    return res.status(500).json({ message: "Unable to update this staff account." });
  }
});

router.get(
  "/centers",
  (req, res, next) => {
    if (req.user?.role === "patient") {
      return res.status(403).json({ message: "Center management access required." });
    }
    if (getUserPermissions(req.user).some((permission) =>
      (permission.module === "inventory" && permission.actions.includes("read")) ||
      (permission.module === "bookings" && permission.actions.includes("create"))
    )) {
      next();
      return;
    }
    return requireModuleAccess("centers", "read")(req, res, next);
  },
  async (req, res) => {
  try {
    const centerId = getUserCenterId(req.user);
    const centers = await Center.find(centerId
      ? { _id: centerId }
      : {})
      .select("name code address city phone openingHours active createdAt updatedAt")
      .sort({ name: 1 })
      .lean();
    const centerMasters = await User.find({
      role: "center_master",
      assignedCenter: { $in: centers.map((center) => center._id) },
    }).select("name email assignedCenter").lean();
    const centerMasterByCenter = new Map(
      centerMasters.map((account) => [String(account.assignedCenter), {
        id: account._id,
        name: account.name,
        email: account.email,
      }])
    );
    return res.json({
      centers: centers.map((center) => ({
        ...center,
        id: center._id,
        centerMaster: centerMasterByCenter.get(String(center._id)) || null,
      })),
    });
  } catch (error) {
    console.error("Center list error:", error.message);
    return res.status(500).json({ message: "Unable to load diagnostic centers." });
  }
  }
);

router.post("/centers", requireModuleAccess("centers", "create"), async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Only administrators can create centers." });
    const centerMaster = req.body.centerMaster;
    if (centerMaster !== undefined && (
      !centerMaster ||
      typeof centerMaster.name !== "string" || !centerMaster.name.trim() ||
      centerMaster.name.trim().length > 100 ||
      typeof centerMaster.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(centerMaster.email.trim()) ||
      typeof centerMaster.password !== "string" || centerMaster.password.length < 8 || centerMaster.password.length > 72
    )) {
      return res.status(400).json({ message: "Enter a valid Center Master name, email, and temporary password of 8–72 characters." });
    }
    const fields = validateCenterFields(req.body);
    if (!fields) return res.status(400).json({ message: "Enter valid center details." });
    const password = centerMaster
      ? await bcrypt.hash(centerMaster.password, 12)
      : null;
    const center = await Center.create(fields);
    if (!centerMaster) return res.status(201).json({ center });

    try {
      const master = await User.create({
        name: centerMaster.name.trim(),
        email: centerMaster.email.trim().toLowerCase(),
        password,
        role: "center_master",
        assignedCenter: center._id,
      });
      return res.status(201).json({
        center,
        centerMaster: {
          id: master._id,
          name: master.name,
          email: master.email,
          assignedCenter: center._id,
        },
      });
    } catch (error) {
      await Center.deleteOne({ _id: center._id });
      throw error;
    }
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "A user with this email address already exists." });
    console.error("Center create error:", error.message);
    return res.status(500).json({ message: "Unable to create this center." });
  }
});

router.put("/centers/:id", requireModuleAccess("centers", "update"), async (req, res) => {
  try {
    const centerId = getUserCenterId(req.user);
    const filter = centerId
      ? { _id: centerId }
      : { _id: req.params.id };
    if (centerId && String(req.params.id) !== String(centerId)) {
      return res.status(404).json({ message: "Diagnostic center not found." });
    }
    const fields = validateCenterFields(req.body);
    if (!fields) return res.status(400).json({ message: "Enter valid center details." });
    const { centerMaster } = req.body;
    if (centerMaster !== undefined && (
      !centerMaster ||
      typeof centerMaster.name !== "string" || !centerMaster.name.trim() ||
      centerMaster.name.trim().length > 100 ||
      typeof centerMaster.email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(centerMaster.email.trim()) ||
      Object.hasOwn(centerMaster, "password")
    )) {
      return res.status(400).json({ message: "Enter a valid Center Master name and email. Use account recovery to change passwords." });
    }
    const center = await Center.findOne(filter).select("_id");
    if (!center) return res.status(404).json({ message: "Diagnostic center not found." });
    if (centerMaster !== undefined) {
      const master = await User.findOne({ role: "center_master", assignedCenter: center._id });
      if (!master) return res.status(404).json({ message: "Center Master account not found for this center." });
      const name = centerMaster.name.trim();
      const email = centerMaster.email.trim().toLowerCase();
      if (email !== master.email) {
        const existingAccount = await User.exists({ email, _id: { $ne: master._id } });
        if (existingAccount) {
          return res.status(409).json({ message: "That email address is already used by another account." });
        }
      }
      if (name !== master.name || email !== master.email) {
        master.name = name;
        master.email = email;
        await master.save();
      }
    }
    const updatedCenter = await Center.findOneAndUpdate(filter, fields, {
      new: true,
      runValidators: true,
    });
    if (!updatedCenter) return res.status(404).json({ message: "Diagnostic center not found." });
    return res.json({ center: updatedCenter });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A user with this email address already exists." });
    }
    console.error("Center update error:", error.message);
    return res.status(500).json({ message: "Unable to update this center." });
  }
});

router.delete("/centers/:id", requireModuleAccess("centers", "delete"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Diagnostic center not found." });
    }
    const centerId = getUserCenterId(req.user);
    if (centerId && String(req.params.id) !== String(centerId)) {
      return res.status(404).json({ message: "Diagnostic center not found." });
    }
    const filter = centerId
      ? { _id: centerId }
      : { _id: req.params.id };
    const center = await Center.findOne(filter).select("_id name");
    if (!center) return res.status(404).json({ message: "Diagnostic center not found." });

    const centerRoleIds = await CustomRole.distinct("_id", { center: center._id });
    await User.updateMany(
      {
        active: true,
        $or: [
          { role: { $in: ["center_master", "staff", "custom"] }, assignedCenter: center._id },
          { role: "custom", customRole: { $in: centerRoleIds } },
        ],
      },
      { $set: { active: false } }
    );

    const result = await Center.deleteOne({ _id: center._id });
    if (!result.deletedCount) return res.status(404).json({ message: "Diagnostic center not found." });
    return res.json({
      center,
      message: "Center permanently deleted. Center-assigned operational accounts were deactivated.",
    });
  } catch (error) {
    console.error("Center delete error:", error.message);
    return res.status(500).json({ message: "Unable to delete this center. Assigned accounts may have been deactivated." });
  }
});

function validateCenterFields(body) {
  const { name, code = "", address, city, phone = "", openingHours = "", active = true } = body;
  if (
    typeof name !== "string" || !name.trim() || name.length > 120 ||
    typeof code !== "string" || code.length > 30 ||
    typeof address !== "string" || !address.trim() || address.length > 400 ||
    typeof city !== "string" || !city.trim() || city.length > 100 ||
    typeof phone !== "string" || phone.length > 30 ||
    typeof openingHours !== "string" || openingHours.length > 200 ||
    typeof active !== "boolean"
  ) return null;
  return {
    name: name.trim(), code: code.trim().toUpperCase(), address: address.trim(),
    city: city.trim(), phone: phone.trim(), openingHours: openingHours.trim(), active,
  };
}

router.get("/inventory", requireModuleAccess("inventory", "read"), async (req, res) => {
  try {
    const centerId = getUserCenterId(req.user);
    const items = await InventoryItem.find(centerId
      ? { center: centerId }
      : {}).populate("center", "name").sort({ name: 1 }).lean();
    return res.json({ items: items.map((item) => ({ ...item, id: item._id })) });
  } catch (error) {
    console.error("Inventory list error:", error.message);
    return res.status(500).json({ message: "Unable to load inventory." });
  }
});

router.post("/inventory", requireModuleAccess("inventory", "create"), async (req, res) => {
  try {
    const fields = validateInventoryFields(req.body);
    if (!fields) return res.status(400).json({ message: "Enter valid inventory details." });
    const centerId = getUserCenterId(req.user);
    if (centerId) fields.center = centerId;
    if (fields.center && !await Center.exists({ _id: fields.center })) {
      return res.status(400).json({ message: "Choose a valid diagnostic center." });
    }
    if (centerId && String(fields.center) !== String(centerId)) {
      return res.status(403).json({ message: "Inventory must belong to your assigned center." });
    }
    const item = await InventoryItem.create(fields);
    return res.status(201).json({ item });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "That SKU already exists." });
    console.error("Inventory create error:", error.message);
    return res.status(500).json({ message: "Unable to create this inventory item." });
  }
});

router.put("/inventory/:id", requireModuleAccess("inventory", "update"), async (req, res) => {
  try {
    const fields = validateInventoryFields(req.body);
    if (!fields) return res.status(400).json({ message: "Enter valid inventory details." });
    const centerId = getUserCenterId(req.user);
    if (centerId) fields.center = centerId;
    const item = await InventoryItem.findOneAndUpdate({
      _id: req.params.id,
      ...(centerId ? { center: centerId } : {}),
    }, fields, {
      new: true,
      runValidators: true,
    });
    if (!item) return res.status(404).json({ message: "Inventory item not found." });
    return res.json({ item });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "That SKU already exists." });
    console.error("Inventory update error:", error.message);
    return res.status(500).json({ message: "Unable to update this item." });
  }
});

router.delete("/inventory/:id", requireModuleAccess("inventory", "delete"), async (req, res) => {
  try {
    const centerId = getUserCenterId(req.user);
    const item = await InventoryItem.findOneAndDelete({
      _id: req.params.id,
      ...(centerId ? { center: centerId } : {}),
    });
    if (!item) return res.status(404).json({ message: "Inventory item not found." });
    return res.json({ message: "Inventory item deleted." });
  } catch (error) {
    console.error("Inventory delete error:", error.message);
    return res.status(500).json({ message: "Unable to delete this item." });
  }
});

function validateInventoryFields(body) {
  const { name, sku, category, quantity, reorderLevel, unit, center = null, expiresAt = null } = body;
  if (
    typeof name !== "string" || !name.trim() || name.length > 120 ||
    typeof sku !== "string" || !sku.trim() || sku.length > 50 ||
    typeof category !== "string" || !category.trim() || category.length > 80 ||
    !Number.isInteger(quantity) || quantity < 0 ||
    !Number.isInteger(reorderLevel) || reorderLevel < 0 ||
    typeof unit !== "string" || !unit.trim() || unit.length > 30 ||
    (center !== null && !/^[\da-f]{24}$/i.test(center)) ||
    (expiresAt !== null && Number.isNaN(new Date(expiresAt).getTime()))
  ) return null;
  return {
    name: name.trim(), sku: sku.trim().toUpperCase(), category: category.trim(),
    quantity, reorderLevel, unit: unit.trim(), center, expiresAt: expiresAt || null,
  };
}

router.get("/settings", requireModuleAccess("settings", "read"), async (req, res) => {
  try {
    const centerId = getUserCenterId(req.user)
      || (req.user.role !== "custom" ? req.query.centerId : null);
    if (centerId && !await Center.exists({ _id: centerId })) {
      return res.status(400).json({ message: "Choose a valid diagnostic center." });
    }
    const filter = centerId ? { center: centerId } : { key: "main", center: null };
    const settings = centerId
      ? await ensureCenterSettings(centerId)
      : await CenterSettings.findOneAndUpdate(
        filter,
        { $setOnInsert: { key: "main" } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();
    return res.json({ settings });
  } catch (error) {
    console.error("Settings read error:", error.message);
    return res.status(500).json({ message: "Unable to load center settings." });
  }
});

router.put("/settings", requireModuleAccess("settings", "update"), async (req, res) => {
  try {
    const { name, email = "", phone = "", address = "", timezone = "Asia/Kolkata", upiId = "" } = req.body;
    const centerId = getUserCenterId(req.user)
      || (req.user.role !== "custom" ? req.body.centerId || null : null);
    if (centerId && !await Center.exists({ _id: centerId })) {
      return res.status(400).json({ message: "Choose a valid diagnostic center." });
    }
    if (
      typeof name !== "string" || !name.trim() || name.length > 120 ||
      typeof email !== "string" || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
      email.length > 254 ||
      typeof phone !== "string" || phone.length > 30 ||
      typeof address !== "string" || address.length > 400 ||
      typeof timezone !== "string" || !timezone.trim() || timezone.length > 80 ||
      typeof upiId !== "string" || upiId.length > 100 ||
      (upiId.trim() && !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/.test(upiId.trim()))
    ) return res.status(400).json({ message: "Enter valid center settings." });
    const filter = centerId ? { center: centerId } : { key: "main", center: null };
    const settings = await CenterSettings.findOneAndUpdate(
      filter,
      {
        $set: { name: name.trim(), email: email.trim(), phone: phone.trim(), address: address.trim(), timezone: timezone.trim(), upiId: upiId.trim(), currency: "INR" },
        $setOnInsert: { key: centerId ? String(centerId) : "main", ...(centerId ? { center: centerId } : {}) },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return res.json({ settings });
  } catch (error) {
    console.error("Settings save error:", error.message);
    return res.status(500).json({ message: "Unable to save center settings." });
  }
});

router.get("/billing", requireModuleAccess("finance", "read"), async (req, res) => {
  try {
    const centerId = getUserCenterId(req.user);
    const bookings = await Booking.find(centerId
      ? { center: centerId }
      : {})
      .populate("patient", "name email")
      .populate("center", "name address city phone")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({
      payments: bookings.map((booking) => ({
        bookingId: booking._id,
        patient: booking.patient,
        center: booking.center,
        centerName: booking.centerName || booking.center?.name || "",
        collectionType: booking.collectionType,
        collectionAddress: booking.address,
        appointmentAt: booking.appointmentAt,
        testName: booking.testName,
        amount: booking.price,
        originalPrice: booking.originalPrice ?? booking.price,
        discountAmount: booking.discountAmount || 0,
        couponCode: booking.couponCode || "",
        status: booking.status === "cancelled" && booking.payment?.status === "pending"
          ? "cancelled"
          : booking.payment?.status || "unpaid",
        bookingStatus: booking.status,
        method: booking.payment?.method || (booking.payment?.gateway ? "gateway" : ""),
        reference: booking.payment?.reference || "",
        paidAt: booking.payment?.paidAt || null,
        createdAt: booking.createdAt,
      })),
    });
  } catch (error) {
    console.error("Billing list error:", error.message);
    return res.status(500).json({ message: "Unable to load billing records." });
  }
});

export default router;
