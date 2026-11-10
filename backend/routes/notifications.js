import express from "express";
import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

function formatNotification(notification) {
  return {
    id: notification._id,
    category: notification.category,
    severity: notification.severity,
    title: notification.title,
    message: notification.message,
    href: notification.href,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(30).lean(),
      Notification.countDocuments({ recipient: req.user._id, readAt: null }),
    ]);
    return res.json({ notifications: notifications.map(formatNotification), unreadCount });
  } catch (error) {
    console.error("Notification list error:", error.message);
    return res.status(500).json({ message: "Unable to load notifications." });
  }
});

router.post("/message", async (req, res) => {
  try {
    const { title, message, severity = "info" } = req.body;
    if (
      typeof title !== "string" || !title.trim() || title.length > 100 ||
      typeof message !== "string" || !message.trim() || message.length > 500 ||
      !["info", "success", "error"].includes(severity)
    ) {
      return res.status(400).json({ message: "Enter a valid notification." });
    }
    const notification = await Notification.create({
      recipient: req.user._id,
      category: "message",
      title: title.trim(),
      message: message.trim(),
      severity,
    });
    return res.status(201).json({ notification: formatNotification(notification) });
  } catch (error) {
    console.error("Notification create error:", error.message);
    return res.status(500).json({ message: "Unable to save this notification." });
  }
});

router.patch("/read-all", async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, readAt: null },
      { $set: { readAt: new Date() } }
    );
    return res.json({ message: "All notifications marked as read." });
  } catch (error) {
    console.error("Notification read-all error:", error.message);
    return res.status(500).json({ message: "Unable to update notifications." });
  }
});

router.patch("/:id/read", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Choose a valid notification." });
    }
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { $set: { readAt: new Date() } },
      { new: true }
    ).lean();
    if (!notification) return res.status(404).json({ message: "Notification not found." });
    return res.json({ notification: formatNotification(notification) });
  } catch (error) {
    console.error("Notification read error:", error.message);
    return res.status(500).json({ message: "Unable to update this notification." });
  }
});

export default router;
