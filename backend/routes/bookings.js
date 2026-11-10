import express from "express";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Center from "../models/Center.js";
import DiagnosticTest from "../models/DiagnosticTest.js";
import { claimCoupon, findApplicableCoupon, releaseCouponClaim } from "../services/coupons.js";
import { notifyCenterTeam, notifyUser } from "../services/notifications.js";
import { ensureCenterSettings } from "../services/centerSettings.js";
import {
  allowCustomModuleAccess,
  allowCustomAnyModuleAccess,
  getUserCenterId,
  requireAuth,
  requireStaffRoles,
} from "../middleware/auth.js";

const router = express.Router();

function formatBooking(booking) {
  return {
    id: booking._id,
    patient: booking.patient,
    test: booking.test,
    testName: booking.testName,
    price: booking.price,
    originalPrice: booking.originalPrice ?? booking.price,
    discountAmount: booking.discountAmount || 0,
    couponCode: booking.couponCode || "",
    center: booking.center,
    centerName: booking.centerName,
    appointmentAt: booking.appointmentAt,
    collectionType: booking.collectionType,
    address: booking.address,
    status: booking.status,
    payment: booking.payment,
    notes: booking.notes,
    createdAt: booking.createdAt,
  };
}

router.post("/", requireAuth, allowCustomModuleAccess("bookings", "create"), async (req, res) => {
  try {
    if (req.user.role !== "patient" && req.user.role !== "custom") {
      return res.status(403).json({ message: "Only patient accounts can create bookings." });
    }
    const { testId, centerId, appointmentAt, collectionType = "center", address = "", couponCode = "" } = req.body;
    const userCenterId = getUserCenterId(req.user);
    if (!mongoose.isValidObjectId(testId) || !mongoose.isValidObjectId(centerId)) {
      return res.status(400).json({ message: "Choose a valid test and diagnostic center." });
    }
    if (userCenterId && String(centerId) !== String(userCenterId)) {
      return res.status(404).json({ message: "This diagnostic center is unavailable." });
    }
    const date = new Date(appointmentAt);
    if (!appointmentAt || Number.isNaN(date.getTime()) || date <= new Date()) {
      return res.status(400).json({ message: "Choose a valid appointment time in the future." });
    }
    if (!["center", "home"].includes(collectionType)) {
      return res.status(400).json({ message: "Choose center or home collection." });
    }
    if (typeof address !== "string" || address.length > 300) {
      return res.status(400).json({ message: "Enter a valid collection address." });
    }
    if (collectionType === "home" && !address.trim()) {
      return res.status(400).json({ message: "A home collection address is required." });
    }

    const [test, center] = await Promise.all([
      DiagnosticTest.findOne({ _id: testId, active: true }),
      Center.findOne({ _id: centerId, active: true }),
    ]);
    if (!test) return res.status(404).json({ message: "This diagnostic test is unavailable." });
    if (!center) return res.status(404).json({ message: "This diagnostic center is unavailable." });
    if (test.allCenters === false && !test.centers?.some((testCenter) => String(testCenter) === String(center._id))) {
      return res.status(400).json({ message: "This diagnostic is not available at the selected center." });
    }
    if (!Number.isFinite(test.price) || test.price < 1) {
      return res.status(409).json({ message: "This diagnostic test has an invalid price and cannot be booked." });
    }
    if (collectionType === "home" && !test.homeCollection) {
      return res.status(400).json({ message: "Home collection is not offered for this diagnostic test." });
    }

    let couponResult;
    if (couponCode !== undefined && couponCode !== null && couponCode !== "") {
      couponResult = await findApplicableCoupon({
        code: couponCode,
        userId: req.user._id,
        centerId: center._id,
        price: test.price,
      });
      if (!couponResult) {
        return res.status(400).json({ message: "Enter a valid coupon code." });
      }
    }
    if (couponResult) await claimCoupon(couponResult.coupon, req.user._id);
    let booking;
    try {
      booking = await Booking.create({
        patient: req.user._id,
        test: test._id,
        testName: test.name,
        originalPrice: test.price,
        discountAmount: couponResult?.discountAmount || 0,
        couponCode: couponResult?.coupon.code || "",
        price: couponResult?.finalPrice ?? test.price,
        center: center._id,
        centerName: center.name,
        appointmentAt: date,
        collectionType,
        address: address.trim(),
        payment: (couponResult?.finalPrice ?? test.price) === 0 ? { status: "paid" } : { status: "unpaid" },
      });
    } catch (error) {
      if (couponResult) await releaseCouponClaim(couponResult.coupon._id, req.user._id);
      throw error;
    }
    await notifyCenterTeam(center._id, {
      category: "booking",
      severity: "info",
      title: "New appointment requested",
      message: `${req.user.name} requested ${test.name}.`,
      href: "/admin/bookings",
    });
    return res.status(201).json({ booking: formatBooking(booking) });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error("Booking create error:", error.message);
    return res.status(500).json({ message: "Unable to create this booking." });
  }
});

router.get("/mine", requireAuth, allowCustomModuleAccess("bookings", "read"), async (req, res) => {
  try {
    const centerId = getUserCenterId(req.user);
    const bookings = await Booking.find({
      patient: req.user._id,
      ...(centerId ? { center: centerId } : {}),
    })
      .populate("center", "name address city phone")
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    return res.json({ bookings: bookings.map(formatBooking) });
  } catch (error) {
    console.error("Patient booking list error:", error.message);
    return res.status(500).json({ message: "Unable to load your bookings." });
  }
});

router.delete("/:id", requireAuth, allowCustomModuleAccess("bookings", "delete"), async (req, res) => {
  try {
    const centerId = getUserCenterId(req.user);
    const booking = await Booking.findOne({
      _id: req.params.id,
      patient: req.user._id,
      ...(centerId ? { center: centerId } : {}),
    });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (booking.status !== "pending" || booking.payment.status === "paid") {
      return res.status(409).json({
        message: "Only unpaid pending bookings can be cancelled online. Contact the center for help.",
      });
    }
    booking.status = "cancelled";
    if (booking.payment.status === "pending") {
      booking.payment.status = "cancelled";
    }
    await booking.save();
    await notifyCenterTeam(booking.center, {
      category: "booking",
      severity: "info",
      title: "Appointment cancelled",
      message: `${booking.testName} was cancelled by the patient.`,
      href: "/admin/bookings",
    });
    return res.json({ booking: formatBooking(booking) });
  } catch (error) {
    console.error("Patient booking cancellation error:", error.message);
    return res.status(500).json({ message: "Unable to cancel this booking." });
  }
});

router.get("/", requireAuth, allowCustomModuleAccess("bookings", "read"), requireStaffRoles("receptionist", "technician", "phlebotomist"), async (req, res) => {
  try {
    const { status } = req.query;
    const centerId = getUserCenterId(req.user);
    const filter = {
      ...(status && status !== "all" ? { status } : {}),
      ...(centerId ? { center: centerId } : {}),
    };
    const bookings = await Booking.find(filter)
      .populate("patient", "name email profile.phone")
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    return res.json({ bookings: bookings.map(formatBooking), count: bookings.length });
  } catch (error) {
    console.error("Booking list error:", error.message);
    return res.status(500).json({ message: "Unable to load bookings." });
  }
});

router.patch("/:id/status", requireAuth, allowCustomModuleAccess("bookings", "update"), requireStaffRoles("receptionist", "technician", "phlebotomist"), async (req, res) => {
  try {
    const { status, notes } = req.body;
    const permitted = {
      receptionist: ["confirmed", "cancelled"],
      phlebotomist: ["sample_collected"],
      technician: ["processing", "completed"],
    };
    const allowed = ["admin", "center_master", "custom"].includes(req.user.role)
      ? ["confirmed", "sample_collected", "processing", "completed", "cancelled"]
      : permitted[req.user.staffRole] || [];
    if (!allowed.includes(status)) {
      return res.status(403).json({ message: "Your staff role cannot apply this booking status." });
    }
    if (notes !== undefined && (typeof notes !== "string" || notes.length > 500)) {
      return res.status(400).json({ message: "Notes must be 500 characters or fewer." });
    }
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    const centerId = getUserCenterId(req.user);
    if (centerId && String(booking.center) !== String(centerId)) {
      return res.status(404).json({ message: "Booking not found." });
    }
    if (booking.status === "cancelled" || booking.status === "completed") {
      return res.status(409).json({ message: "This booking is already closed." });
    }
    const allowedNextStates = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["sample_collected", "cancelled"],
      sample_collected: ["processing"],
      processing: ["completed"],
    };
    if (!allowedNextStates[booking.status]?.includes(status)) {
      return res.status(409).json({
        message: `A booking cannot move from ${booking.status.replaceAll("_", " ")} to ${status.replaceAll("_", " ")}.`,
      });
    }
    if (status === "cancelled" && booking.payment.status === "paid") {
      return res.status(409).json({
        message: "Refund the paid booking before cancelling it.",
      });
    }
    if (status === "completed" && booking.payment.status !== "paid") {
      return res.status(409).json({ message: "A booking must be paid before it can be completed." });
    }
    booking.status = status;
    if (status === "cancelled" && booking.payment.status === "pending") {
      booking.payment.status = "cancelled";
    }
    if (notes !== undefined) booking.notes = notes.trim();
    await booking.save();
    await notifyUser(booking.patient, {
      category: "booking",
      severity: status === "cancelled" ? "error" : "info",
      title: status === "cancelled" ? "Appointment cancelled" : "Appointment updated",
      message: `${booking.testName}: ${status.replaceAll("_", " ")}.`,
      href: "/bookings",
    });
    return res.json({ booking: formatBooking(booking) });
  } catch (error) {
    console.error("Booking status update error:", error.message);
    return res.status(500).json({ message: "Unable to update this booking." });
  }
});

router.post("/:id/payment/method", requireAuth, allowCustomModuleAccess("bookings", "update"), async (req, res) => {
  try {
    if (req.user.role !== "patient" && req.user.role !== "custom") {
      return res.status(403).json({ message: "Only patients can choose a booking payment method." });
    }
    const { method } = req.body;
    if (!["upi", "cash"].includes(method)) {
      return res.status(400).json({ message: "Choose UPI or cash." });
    }
    const centerId = getUserCenterId(req.user);
    const booking = await Booking.findOne({
      _id: req.params.id,
      patient: req.user._id,
      ...(centerId ? { center: centerId } : {}),
    });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (booking.status === "cancelled") {
      return res.status(409).json({ message: "Cancelled bookings cannot be paid." });
    }
    if (booking.payment.status === "paid") {
      return res.status(409).json({ message: "This booking is already paid." });
    }
    if (booking.payment.status === "refunded") {
      return res.status(409).json({ message: "This booking payment has been refunded." });
    }

    const settings = method === "upi"
      ? await ensureCenterSettings(booking.center)
      : null;
    if (method === "upi" && !settings?.upiId) {
      return res.status(503).json({ message: "The center has not configured its UPI ID yet. Please choose cash or contact the center." });
    }

    booking.payment = {
      status: "pending",
      method,
      gateway: "",
      orderId: "",
      paymentId: "",
      refundId: "",
      reference: "",
      paidAt: null,
    };
    await booking.save();
    await notifyCenterTeam(booking.center, {
      category: "payment",
      severity: "info",
      title: "Payment method selected",
      message: `${booking.testName}: patient selected ${method.toUpperCase()} payment.`,
      href: "/admin/finance",
    });

    const payment = { status: booking.payment.status, method };
    if (method === "upi") {
      const query = new URLSearchParams({
        pa: settings.upiId,
        pn: settings.name || "Vitalia Diagnostics",
        am: booking.price.toFixed(2),
        cu: "INR",
        tn: `Booking ${String(booking._id).slice(-8)}`,
      });
      payment.upiId = settings.upiId;
      payment.businessName = settings.name || "Vitalia Diagnostics";
      payment.upiUri = `upi://pay?${query.toString()}`;
    }
    return res.json({ payment });
  } catch (error) {
    console.error("Booking payment method error:", error.message);
    return res.status(500).json({ message: "Unable to save this payment method." });
  }
});

router.patch(
  "/:id/payment/confirm",
  requireAuth,
  allowCustomAnyModuleAccess(
    { module: "bookings", action: "update" },
    { module: "finance", action: "update" }
  ),
  requireStaffRoles("receptionist"),
  async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    const centerId = getUserCenterId(req.user);
    if (centerId && String(booking.center) !== String(centerId)) {
      return res.status(404).json({ message: "Booking not found." });
    }
    if (booking.status === "cancelled") {
      return res.status(409).json({ message: "Cancelled bookings cannot have payments confirmed." });
    }
    if (
      booking.payment.status !== "pending" ||
      !["upi", "cash"].includes(booking.payment.method)
    ) {
      return res.status(409).json({ message: "Only pending UPI or cash payments can be confirmed." });
    }
    const confirmedBooking = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        status: booking.status,
        "payment.status": "pending",
        "payment.method": { $in: ["upi", "cash"] },
      },
      {
        $set: {
          "payment.status": "paid",
          "payment.paidAt": new Date(),
          ...(booking.status === "pending" ? { status: "confirmed" } : {}),
        },
      },
      { new: true, runValidators: true }
    );
    if (!confirmedBooking) {
      return res.status(409).json({ message: "This booking was cancelled or its payment was already updated." });
    }
    await notifyUser(confirmedBooking.patient, {
      category: "payment",
      severity: "success",
      title: "Payment received",
      message: `Payment for ${confirmedBooking.testName} has been confirmed.`,
      href: "/bookings",
    });
    return res.json({
      booking: formatBooking(confirmedBooking),
      message: confirmedBooking.status === "confirmed"
        ? "Payment received and booking confirmed."
        : "Payment marked as received.",
      }
    );
  } catch (error) {
    console.error("Manual payment confirmation error:", error.message);
    return res.status(500).json({ message: "Unable to confirm this payment." });
  }
});

export default router;
