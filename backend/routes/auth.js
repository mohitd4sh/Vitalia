import express from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import BuiltInRole from "../models/BuiltInRole.js";
import { getDefaultBuiltInRolePermissions } from "../services/builtInRolePermissions.js";
import PasswordResetRequest from "../models/PasswordResetRequest.js";
import { getUserPermissions, requireAuth } from "../middleware/auth.js";
import { sendPasswordResetEmail } from "../services/passwordResetEmail.js";

const router = express.Router();

async function attachBuiltInRolePermissions(user) {
  if (!["admin", "center_master", "staff", "patient"].includes(user.role)) return;
  const builtInRole = await BuiltInRole.findOne({ role: user.role }).lean();
  user.$locals.builtInRolePermissions = builtInRole?.permissions ?? getDefaultBuiltInRolePermissions(user.role);
}

function createToken(user) {
  return jwt.sign(
    { userId: user._id },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    staffRole: user.staffRole,
    customRoleId: user.customRole?._id || user.customRole || null,
    customRoleName: user.customRole?.name || "",
    permissions: getUserPermissions(user),
    assignedCenter: user.assignedCenter?._id || user.assignedCenter || null,
    assignedCenterName: user.assignedCenter?.name || "",
    profile: user.profile,
    profileCompleted: user.profileCompleted,
  };
}

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" || !name.trim() ||
      name.trim().length > 100 ||
      typeof email !== "string" || !email.trim() ||
      email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      typeof password !== "string" ||
      password.length < 8 || password.length > 72
    ) {
      return res.status(400).json({
        message: "Enter a valid name and email, and use a password of 8–72 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 12),
      role: "patient",
    });
    await attachBuiltInRolePermissions(user);

    return res.status(201).json({
      token: createToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }
    console.error("Registration error:", error.message);
    return res.status(500).json({
      message: "Registration failed. Please try again.",
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" || !email.trim() ||
      typeof password !== "string" || !password
    ) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+password").populate("customRole").populate("assignedCenter", "name");

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    await attachBuiltInRolePermissions(user);

    return res.json({
      token: createToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({
      message: "Login failed. Please try again.",
    });
  }
});

router.post("/password-reset/request", async (req, res) => {
  try {
    const { email, method } = req.body;
    if (
      typeof email !== "string" || email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      !["email", "admin"].includes(method)
    ) {
      return res.status(400).json({ message: "Enter a valid email and choose a recovery method." });
    }
    if (method === "email" && (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD)) {
      return res.status(503).json({ message: "Email password recovery is not configured. Contact an administrator." });
    }

    const recoveryToken = method === "admin"
      ? crypto.randomBytes(32).toString("hex")
      : null;
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("_id email");
    if (!user) {
      return res.status(202).json({ message: "If the account exists, the password request has been submitted." });
    }

    const recentRequestCount = await PasswordResetRequest.countDocuments({
      user: user._id,
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    });
    if (method === "admin") {
      const existingRequest = await PasswordResetRequest.findOneAndUpdate(
        { user: user._id, method: "admin", status: "pending" },
        {
          tokenHash: crypto.createHash("sha256").update(recoveryToken).digest("hex"),
          expiresAt: null,
        },
        { new: true }
      );
      if (existingRequest) {
        return res.status(202).json({
          message: "If the account exists, the password request has been submitted.",
          recoveryToken,
        });
      }
    } else if (recentRequestCount >= 3) {
      return res.status(202).json({
        message: "If the account exists, the password request has been submitted.",
      });
    }

    await PasswordResetRequest.updateMany(
      { user: user._id, status: { $in: ["pending", "approved"] } },
      { status: "rejected", tokenHash: null, expiresAt: null }
    );
    const request = await PasswordResetRequest.create({
      user: user._id,
      method,
      ...(recoveryToken ? {
        tokenHash: crypto.createHash("sha256").update(recoveryToken).digest("hex"),
      } : {}),
    });
    if (method === "email") {
      const token = crypto.randomBytes(32).toString("hex");
      request.status = "approved";
      request.tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      request.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await request.save();
      try {
        await sendPasswordResetEmail({ address: user.email, token });
      } catch (error) {
        await request.deleteOne();
        console.error("Password reset email error:", error.message);
        return res.status(503).json({ message: "Unable to send the password reset email. Contact an administrator." });
      }
    }

    return res.status(202).json({
      message: "If the account exists, the password request has been submitted.",
      ...(recoveryToken ? { recoveryToken } : {}),
    });
  } catch (error) {
    console.error("Password reset request error:", error.message);
    return res.status(500).json({ message: "Unable to submit the password request." });
  }
});

router.post("/password-reset/complete", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (
      typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token) ||
      typeof password !== "string" || password.length < 8 || password.length > 72
    ) {
      return res.status(400).json({ message: "Use a valid reset link and a password of 8–72 characters." });
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const request = await PasswordResetRequest.findOneAndUpdate(
      {
        tokenHash,
        status: "approved",
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } },
        ],
      },
      { status: "processing" },
      { new: true }
    );
    if (!request) return res.status(400).json({ message: "This password reset link is invalid or expired. Request a new one." });

    try {
      const updatedUser = await User.findByIdAndUpdate(request.user, {
        password: await bcrypt.hash(password, 12),
      });
      if (!updatedUser) {
        request.status = "rejected";
        request.tokenHash = null;
        request.expiresAt = null;
        await request.save();
        return res.status(400).json({ message: "This account is no longer available." });
      }
      request.status = "completed";
      request.tokenHash = null;
      request.expiresAt = null;
      await request.save();
      await PasswordResetRequest.updateMany(
        { user: request.user, _id: { $ne: request._id }, status: { $in: ["pending", "approved"] } },
        { status: "rejected", tokenHash: null, expiresAt: null }
      );
    } catch (error) {
      request.status = "approved";
      await request.save();
      throw error;
    }
    return res.json({ message: "Password changed. You can now sign in with your new password." });
  } catch (error) {
    console.error("Password reset completion error:", error.message);
    return res.status(500).json({ message: "Unable to change the password. Please try the link again." });
  }
});

router.get("/password-reset/requests", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Administrator access required." });
    const requests = await PasswordResetRequest.find({ method: "admin", status: "pending" })
      .populate("user", "name email role")
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();
    return res.json({
      requests: requests.map((request) => ({
        id: request._id,
        user: request.user,
        createdAt: request.createdAt,
      })),
    });
  } catch (error) {
    console.error("Password reset request list error:", error.message);
    return res.status(500).json({ message: "Unable to load password reset requests." });
  }
});

router.post("/password-reset/status", async (req, res) => {
  try {
    const { token } = req.body;
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).json({ message: "This password change request is invalid or no longer available." });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const request = await PasswordResetRequest.findOne({
      tokenHash,
      status: { $in: ["pending", "approved"] },
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    }).select("method status expiresAt");
    if (!request) {
      return res.status(404).json({ message: "This password change request is invalid or no longer available." });
    }
    return res.json({ method: request.method, status: request.status });
  } catch (error) {
    console.error("Password reset status error:", error.message);
    return res.status(500).json({ message: "Unable to check the password change request." });
  }
});

router.patch("/password-reset/requests/:id/approve", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Administrator access required." });
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
      return res.status(404).json({ message: "Password reset request not found." });
    }
    const request = await PasswordResetRequest.findOneAndUpdate(
      { _id: req.params.id, method: "admin", status: "pending" },
      { status: "approved" },
      { new: true }
    ).populate("user", "email");
    if (!request) return res.status(404).json({ message: "Password reset request not found." });
    if (!request.user) {
      request.status = "rejected";
      await request.save();
      return res.status(404).json({ message: "Password reset request account not found." });
    }

    return res.json({ message: "Password change request approved. The user can now change their password from the original browser." });
  } catch (error) {
    console.error("Password reset approval error:", error.message);
    return res.status(500).json({ message: "Unable to approve this password request." });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;