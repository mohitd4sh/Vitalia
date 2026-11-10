import express from "express";
import User from "../models/User.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: "patient" })
      .select("name email")
      .sort({ name: 1 })
      .lean();

    return res.json({
      users: users.map((user) => ({
        id: user._id,
        name: user.name,
        email: user.email,
      })),
      registeredUserCount: users.length,
    });
  } catch (error) {
    console.error("Admin user list error:", error.message);
    return res.status(500).json({
      message: "Unable to load registered users. Please try again.",
    });
  }
});

export default router;
