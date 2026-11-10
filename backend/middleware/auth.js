import jwt from "jsonwebtoken";
import User from "../models/User.js";
import BuiltInRole from "../models/BuiltInRole.js";
import { getDefaultBuiltInRolePermissions } from "../services/builtInRolePermissions.js";

export async function requireAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required. Please log in.",
      });
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        message: "Authentication token is missing.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.userId) {
      return res.status(401).json({
        message: "Invalid authentication token.",
      });
    }

    const user = await User.findById(decoded.userId)
      .populate("customRole")
      .populate("assignedCenter", "name");

    if (!user) {
      return res.status(401).json({
        message: "The account associated with this token no longer exists.",
      });
    }

    if (!user.active) {
      return res.status(401).json({
        message: "This account is inactive. Contact your administrator.",
      });
    }

    if (user.role === "custom" && (!user.customRole || !user.customRole.active)) {
      return res.status(403).json({
        message: "This account's custom role is unavailable. Contact your administrator.",
      });
    }

    if (user.role === "center_master" && !user.assignedCenter) {
      return res.status(403).json({
        message: "This Center Master account has no assigned center. Contact an administrator.",
      });
    }

    let builtInRolePermissions;
    if (["admin", "center_master", "staff", "patient"].includes(user.role)) {
      const builtInRole = await BuiltInRole.findOne({ role: user.role }).lean();
      builtInRolePermissions = builtInRole?.permissions ?? getDefaultBuiltInRolePermissions(user.role);
    }

    if (builtInRolePermissions) {
      user.$locals.builtInRolePermissions = builtInRolePermissions;
    }

    req.user = user;
    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        message: "Your session is invalid or expired. Please log in again.",
      });
    }

    console.error("Authentication error:", error.message);

    return res.status(500).json({
      message: "Authentication failed. Please try again.",
    });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      message: "Administrator access required.",
    });
  }

  next();
}

export function requireCenterManager(req, res, next) {
  if (!req.user || !["admin", "center_master"].includes(req.user.role)) {
    return res.status(403).json({ message: "Center management access required." });
  }
  next();
}

export function getUserCenterId(user) {
  if (["center_master", "staff"].includes(user?.role)) {
    return user.assignedCenter?._id || user.assignedCenter || null;
  }
  if (user?.role === "custom") {
    return user.customRole?.center?._id || user.customRole?.center || null;
  }
  return null;
}

export function getUserPermissions(user) {
  if (user?.role === "custom") {
    return user.permissionOverrides ?? user.customRole?.permissions ?? [];
  }
  return user?.builtInRolePermissions ?? user?.$locals?.builtInRolePermissions ?? [];
}

export function requireModuleAccess(module, action) {
  return function moduleAccessGuard(req, res, next) {
    const permission = getUserPermissions(req.user).find((entry) => entry.module === module);
    if (permission?.actions?.includes(action)) {
      next();
      return;
    }

    return res.status(403).json({
      message: `Permission denied: ${action} access to ${module} is required.`,
    });
  };
}

export function allowCustomModuleAccess(module, action) {
  return function customModuleAccessGuard(req, res, next) {
    if (req.user?.role !== "custom" && !["admin", "center_master", "staff", "patient"].includes(req.user?.role)) {
      next();
      return;
    }
    return requireModuleAccess(module, action)(req, res, next);
  };
}

export function allowCustomAnyModuleAccess(...permissions) {
  return function customAnyModuleAccessGuard(req, res, next) {
    if (req.user?.role !== "custom" && !["admin", "center_master", "staff", "patient"].includes(req.user?.role)) {
      next();
      return;
    }
    const allowed = permissions.some(({ module, action }) =>
      getUserPermissions(req.user).some((permission) =>
        permission.module === module && permission.actions.includes(action)
      )
    );
    if (allowed) {
      next();
      return;
    }
    return res.status(403).json({
      message: "Permission denied for this action.",
    });
  };
}

export function requireStaffRoles(...allowedRoles) {
  return function staffRoleGuard(req, res, next) {
    if (["admin", "center_master", "custom"].includes(req.user?.role)) {
      next();
      return;
    }

    if (
      req.user?.role !== "staff" ||
      !allowedRoles.includes(req.user.staffRole)
    ) {
      return res.status(403).json({
        message: "You do not have permission to perform this action.",
      });
    }

    next();
  };
}
