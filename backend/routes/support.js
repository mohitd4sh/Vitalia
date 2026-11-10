import express from "express";
import mongoose from "mongoose";
import SupportConversation from "../models/SupportConversation.js";
import { requireAuth, requireModuleAccess } from "../middleware/auth.js";
import { notifyUser } from "../services/notifications.js";

const router = express.Router();
router.use(requireAuth);

function requireAdminOrCustomMessageAccess(action) {
  return (req, res, next) => {
    if (req.user.role === "admin") {
      next();
      return;
    }
    if (req.user.role !== "custom") {
      return res.status(403).json({ message: "Administrator access required." });
    }
    return requireModuleAccess("messages", action)(req, res, next);
  };
}

function isValidMessage(subject, message) {
  return (
    typeof subject === "string" &&
    subject.trim().length > 0 &&
    subject.trim().length <= 100 &&
    !/[\r\n]/.test(subject) &&
    typeof message === "string" &&
    message.trim().length >= 10 &&
    message.trim().length <= 3000
  );
}

function serializeConversation(conversation) {
  return {
    id: conversation._id,
    patient: conversation.patient?._id
      ? {
          id: conversation.patient._id,
          name: conversation.patient.name,
          email: conversation.patient.email,
        }
      : conversation.patient,
    subject: conversation.subject,
    status: conversation.status,
    messages: conversation.messages,
    lastMessageAt: conversation.lastMessageAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

router.get("/admin", requireAdminOrCustomMessageAccess("read"), async (req, res) => {
  try {
    const conversations = await SupportConversation.find()
      .populate("patient", "name email")
      .sort({ lastMessageAt: -1 })
      .limit(200)
      .lean();
    return res.json({ conversations: conversations.map(serializeConversation) });
  } catch (error) {
    console.error("Admin support inbox error:", error.message);
    return res.status(500).json({ message: "Unable to load support messages." });
  }
});

router.get("/mine", async (req, res) => {
  if (req.user.role !== "patient") {
    return res.status(403).json({ message: "Patient access is required." });
  }
  try {
    const conversations = await SupportConversation.find({ patient: req.user._id })
      .sort({ lastMessageAt: -1 })
      .limit(100)
      .lean();
    return res.json({ conversations: conversations.map(serializeConversation) });
  } catch (error) {
    console.error("Patient support messages error:", error.message);
    return res.status(500).json({ message: "Unable to load your support messages." });
  }
});

router.post("/messages", async (req, res) => {
  if (req.user.role !== "patient") {
    return res.status(403).json({ message: "Patient access is required." });
  }
  const { subject, message } = req.body;
  if (!isValidMessage(subject, message)) {
    return res.status(400).json({ message: "Enter a subject and a message between 10 and 3,000 characters." });
  }
  try {
    const conversation = await SupportConversation.create({
      patient: req.user._id,
      subject: subject.trim(),
      status: "open",
      messages: [{
        sender: req.user._id,
        senderRole: "patient",
        senderName: req.user.name,
        body: message.trim(),
      }],
      lastMessageAt: new Date(),
    });
    return res.status(201).json({ conversation: serializeConversation(conversation.toObject()) });
  } catch (error) {
    console.error("Support conversation create error:", error.message);
    return res.status(500).json({ message: "Unable to save your support message." });
  }
});

router.post("/messages/:id/replies", (req, res, next) => {
  if (req.user.role === "patient") {
    next();
    return;
  }
  return requireAdminOrCustomMessageAccess("update")(req, res, next);
}, async (req, res) => {
  if (!["patient", "admin", "custom"].includes(req.user.role)) {
    return res.status(403).json({ message: "Patient or support access is required." });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Support conversation not found." });
  }
  const { message } = req.body;
  if (typeof message !== "string" || message.trim().length < 1 || message.trim().length > 3000) {
    return res.status(400).json({ message: "Enter a reply between 1 and 3,000 characters." });
  }

  try {
    const filter = {
      _id: req.params.id,
      ...(req.user.role === "patient" ? { patient: req.user._id } : {}),
    };
    const conversation = await SupportConversation.findOne(filter);
    if (!conversation) return res.status(404).json({ message: "Support conversation not found." });
    if (conversation.messages.length >= 200) {
      return res.status(409).json({ message: "This conversation has reached its reply limit. Please open a new support message." });
    }

    conversation.messages.push({
      sender: req.user._id,
      senderRole: req.user.role,
      senderName: req.user.name,
      body: message.trim(),
    });
    conversation.status = req.user.role === "patient" ? "open" : "awaiting_patient";
    conversation.lastMessageAt = new Date();
    await conversation.save();

    if (req.user.role !== "patient") {
      await notifyUser(conversation.patient, {
        category: "message",
        severity: "info",
        title: "Vitalia support replied",
        message: `There is a new reply to “${conversation.subject}”.`,
        href: "/messages",
      });
    }

    return res.json({ conversation: serializeConversation(conversation.toObject()) });
  } catch (error) {
    console.error("Support reply error:", error.message);
    return res.status(500).json({ message: "Unable to send this reply." });
  }
});

router.patch("/messages/:id/close", requireAdminOrCustomMessageAccess("update"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Support conversation not found." });
  }
  try {
    const conversation = await SupportConversation.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "closed" } },
      { new: true }
    ).populate("patient", "name email").lean();
    if (!conversation) return res.status(404).json({ message: "Support conversation not found." });
    return res.json({ conversation: serializeConversation(conversation) });
  } catch (error) {
    console.error("Support conversation close error:", error.message);
    return res.status(500).json({ message: "Unable to close this conversation." });
  }
});

export default router;
