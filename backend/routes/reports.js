import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import { notifyUser } from "../services/notifications.js";
import {
  allowCustomModuleAccess,
  getUserCenterId,
  requireAuth,
  requireStaffRoles,
} from "../middleware/auth.js";

const router = express.Router();
const REPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PENDING_BYTES = 50 * 1024 * 1024;
const MAX_PENDING_REPORTS = 100;
const pendingReports = new Map();
let pendingBytes = 0;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter(req, file, callback) {
    if (file.mimetype !== "application/pdf") {
      callback(new Error("Upload a PDF file."));
      return;
    }

    callback(null, true);
  },
});

function removeReport(id) {
  const report = pendingReports.get(id);

  if (!report) return;

  clearTimeout(report.expiryTimer);
  pendingBytes -= report.buffer.length;
  pendingReports.delete(id);
}

function safeFileName(originalName) {
  const baseName = originalName.split(/[\\/]/).pop() || "";
  const sanitized = [...baseName]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .slice(0, 255);

  return sanitized || "report.pdf";
}

function parseUpload(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (error) {
      const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "Report PDFs must be 10 MB or smaller."
        : error.message;
      return res.status(status).json({ message });
    }

    next();
  });
}

router.get("/", requireAuth, allowCustomModuleAccess("reports", "read"), (req, res) => {
  const now = Date.now();
  const reports = [];

  for (const [id, report] of pendingReports) {
    if (report.expiresAt <= now) {
      removeReport(id);
      continue;
    }

    if (report.userId === String(req.user._id) && !report.delivering) {
      reports.push({
        id,
        bookingId: report.bookingId,
        testName: report.testName,
        fileName: report.fileName,
        uploadedAt: report.uploadedAt,
        expiresAt: report.expiresAt,
        physicalCopyHandedOver: report.physicalCopyHandedOver,
      });
    }
  }

  return res.json({ reports });
});

router.get("/patients", requireAuth, allowCustomModuleAccess("reports", "create"), requireStaffRoles("technician", "receptionist"), async (req, res) => {
  try {
    const centerId = getUserCenterId(req.user);
    const bookingFilter = {
      status: "completed",
      ...(centerId ? { center: centerId } : {}),
    };
    const bookings = await Booking.find(bookingFilter)
      .select("patient testName appointmentAt")
      .populate("patient", "name email")
      .sort({ appointmentAt: -1 })
      .lean();
    const eligiblePatientIds = [...new Set(bookings.filter((booking) => booking.patient).map((booking) => String(booking.patient._id)))];
    const patients = await User.find({
      role: "patient",
      ...(centerId ? { _id: { $in: eligiblePatientIds } } : {}),
    })
      .select("name email")
      .sort({ name: 1 })
      .lean();
    return res.json({
      patients: patients.map((patient) => ({
        id: patient._id,
        name: patient.name,
        email: patient.email,
      })),
      bookings: bookings
        .filter((booking) => booking.patient)
        .map((booking) => ({
          id: booking._id,
          patientId: String(booking.patient._id),
          patientName: booking.patient.name,
          patientEmail: booking.patient.email,
          testName: booking.testName,
          appointmentAt: booking.appointmentAt,
        })),
    });
  } catch (error) {
    console.error("Report recipient list error:", error.message);
    return res.status(500).json({ message: "Unable to load report recipients." });
  }
});

router.post("/", requireAuth, allowCustomModuleAccess("reports", "create"), requireStaffRoles("technician", "receptionist"), parseUpload, async (req, res) => {
  try {
    const { userId, bookingId, testName, physicalCopyHandedOver = "false" } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "Choose a PDF report to send." });
    }

    if (!file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      return res.status(400).json({ message: "The selected file is not a valid PDF." });
    }

    if (
      typeof userId !== "string" ||
      !mongoose.isValidObjectId(userId) ||
      typeof bookingId !== "string" ||
      !mongoose.isValidObjectId(bookingId) ||
      typeof testName !== "string" ||
      !testName.trim() ||
      testName.trim().length > 120 ||
      !["true", "false"].includes(physicalCopyHandedOver)
    ) {
      return res.status(400).json({
        message: "Select a patient and enter a valid test name.",
      });
    }

    const patient = await User.findOne({ _id: userId, role: "patient" })
      .select("_id")
      .lean();

    if (!patient) {
      return res.status(404).json({ message: "The selected patient was not found." });
    }

    const centerId = getUserCenterId(req.user);
    const booking = await Booking.findOne({
      _id: bookingId,
      patient: patient._id,
      status: "completed",
      ...(centerId ? { center: centerId } : {}),
    }).select("_id").lean();
    if (!booking) {
      return res.status(400).json({ message: "Choose a completed booking for this patient." });
    }

    if (
      pendingReports.size >= MAX_PENDING_REPORTS ||
      pendingBytes + file.buffer.length > MAX_PENDING_BYTES
    ) {
      return res.status(503).json({
        message: "The temporary report queue is full. Please retry later.",
      });
    }

    const id = randomUUID();
    const uploadedAt = Date.now();
    const expiresAt = uploadedAt + REPORT_TTL_MS;
    const expiryTimer = setTimeout(() => removeReport(id), REPORT_TTL_MS);
    expiryTimer.unref();

    pendingReports.set(id, {
      userId: String(patient._id),
      bookingId: String(booking._id),
      testName: testName.trim(),
      fileName: safeFileName(file.originalname),
      buffer: file.buffer,
      uploadedAt,
      expiresAt,
      physicalCopyHandedOver: physicalCopyHandedOver === "true",
      expiryTimer,
      delivering: false,
    });
    pendingBytes += file.buffer.length;
    await notifyUser(patient._id, {
      category: "report",
      severity: "success",
      title: "Medical report available",
      message: `Your ${testName.trim()} report is ready to download.`,
      href: "/reports",
    });

    return res.status(201).json({
      report: {
        id,
        bookingId: String(booking._id),
        testName: testName.trim(),
        uploadedAt,
        expiresAt,
        physicalCopyHandedOver: physicalCopyHandedOver === "true",
      },
      message: physicalCopyHandedOver === "true"
        ? "PDF report sent to the patient and physical copy handover recorded."
        : "PDF report queued for the patient. It will be discarded after download or seven days.",
    });
  } catch (error) {
    console.error("Report upload error:", error.message);
    return res.status(500).json({
      message: "Unable to send this report. Please try again.",
    });
  }
});

router.get("/:id/download", requireAuth, allowCustomModuleAccess("reports", "read"), (req, res) => {
  const report = pendingReports.get(req.params.id);

  if (
    !report ||
    report.expiresAt <= Date.now() ||
    report.userId !== String(req.user._id) ||
    report.delivering
  ) {
    if (report?.expiresAt <= Date.now()) {
      removeReport(req.params.id);
    }

    return res.status(404).json({
      message: "This report is no longer available.",
    });
  }

  report.delivering = true;
  res.set({
    "Cache-Control": "private, no-store",
    "Content-Disposition": 'attachment; filename="medical-report.pdf"',
    "Content-Length": report.buffer.length,
    "Content-Type": "application/pdf",
    "X-Content-Type-Options": "nosniff",
  });
  res.once("finish", () => removeReport(req.params.id));
  res.once("close", () => {
    if (!res.writableFinished && pendingReports.has(req.params.id)) {
      report.delivering = false;
    }
  });

  return res.send(report.buffer);
});

export default router;
