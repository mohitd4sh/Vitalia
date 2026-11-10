import express from "express";
import mongoose from "mongoose";
import Center from "../models/Center.js";
import Coupon from "../models/Coupon.js";
import DiagnosticTest from "../models/DiagnosticTest.js";
import {
  allowCustomModuleAccess,
  getUserCenterId,
  requireAuth,
  requireModuleAccess,
} from "../middleware/auth.js";
import { findApplicableCoupon } from "../services/coupons.js";

const router = express.Router();

function formatCoupon(coupon) {
  return {
    id: coupon._id,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    maxDiscount: coupon.maxDiscount,
    minOrderAmount: coupon.minOrderAmount,
    usageLimit: coupon.usageLimit,
    usageCount: coupon.usageCount,
    maxUsesPerUser: coupon.maxUsesPerUser ?? 1,
    startsAt: coupon.startsAt,
    expiresAt: coupon.expiresAt,
    active: coupon.active,
    center: coupon.center,
    createdAt: coupon.createdAt,
  };
}

function validateCouponFields(body) {
  const {
    code, discountType, discountValue, maxDiscount = null,
    minOrderAmount = 0, usageLimit = null, maxUsesPerUser = 1, startsAt = null, expiresAt = null,
    active = true, centerId = null,
  } = body;
  const normalizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
  const start = startsAt ? new Date(startsAt) : null;
  const expiry = expiresAt ? new Date(expiresAt) : null;

  if (
    !/^[A-Z0-9_-]{3,32}$/.test(normalizedCode) ||
    !["percentage", "fixed"].includes(discountType) ||
    !Number.isFinite(discountValue) || discountValue <= 0 ||
    (discountType === "percentage" && discountValue > 100) ||
    (discountType === "fixed" && discountValue > 1000000) ||
    (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0 || discountType !== "percentage")) ||
    !Number.isFinite(minOrderAmount) || minOrderAmount < 0 || minOrderAmount > 1000000 ||
    (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1 || usageLimit > 10000000)) ||
    !Number.isInteger(maxUsesPerUser) || maxUsesPerUser < 1 || maxUsesPerUser > 10000000 ||
    (startsAt !== null && (!start || Number.isNaN(start.getTime()))) ||
    (expiresAt !== null && (!expiry || Number.isNaN(expiry.getTime()))) ||
    (start && expiry && expiry <= start) ||
    typeof active !== "boolean" ||
    (centerId !== null && centerId !== "" && !mongoose.isValidObjectId(centerId))
  ) return null;

  return {
    code: normalizedCode,
    discountType,
    discountValue,
    maxDiscount,
    minOrderAmount,
    usageLimit,
    maxUsesPerUser,
    startsAt: start,
    expiresAt: expiry,
    active,
    center: centerId || null,
  };
}

router.post(
  "/validate",
  requireAuth,
  allowCustomModuleAccess("bookings", "create"),
  async (req, res) => {
    try {
      const { testId, centerId, code } = req.body;
      if (!mongoose.isValidObjectId(testId) || !mongoose.isValidObjectId(centerId)) {
        return res.status(400).json({ message: "Choose a valid diagnostic test and center." });
      }
      const centerScope = getUserCenterId(req.user);
      if (centerScope && String(centerId) !== String(centerScope)) {
        return res.status(404).json({ message: "This diagnostic center is unavailable." });
      }
      const [test, center] = await Promise.all([
        DiagnosticTest.findOne({ _id: testId, active: true }),
        Center.findOne({ _id: centerId, active: true }),
      ]);
      if (!test) return res.status(404).json({ message: "This diagnostic test is unavailable." });
      if (!center) return res.status(404).json({ message: "This diagnostic center is unavailable." });
      if (test.allCenters === false && !test.centers?.some((id) => String(id) === String(center._id))) {
        return res.status(400).json({ message: "This diagnostic is not available at the selected center." });
      }
      const result = await findApplicableCoupon({
        code,
        userId: req.user._id,
        centerId,
        price: test.price,
      });
      if (!result) return res.status(400).json({ message: "Enter a coupon code." });
      return res.json({
        code: result.coupon.code,
        discountAmount: result.discountAmount,
        originalPrice: test.price,
        finalPrice: result.finalPrice,
      });
    } catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
      console.error("Coupon validation error:", error.message);
      return res.status(500).json({ message: "Unable to validate this coupon." });
    }
  }
);

router.get("/", requireAuth, requireModuleAccess("discounts", "read"), async (req, res) => {
  try {
    const centerScope = getUserCenterId(req.user);
    const filter = centerScope ? { center: centerScope } : {};
    const coupons = await Coupon.find(filter)
      .populate("center", "name city")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ coupons: coupons.map(formatCoupon) });
  } catch (error) {
    console.error("Coupon list error:", error.message);
    return res.status(500).json({ message: "Unable to load discounts." });
  }
});

router.post("/", requireAuth, requireModuleAccess("discounts", "create"), async (req, res) => {
  try {
    const fields = validateCouponFields(req.body);
    if (!fields) return res.status(400).json({ message: "Enter valid coupon details." });
    const centerScope = getUserCenterId(req.user);
    if (centerScope) fields.center = centerScope;
    if (fields.center && !await Center.exists({ _id: fields.center, active: true })) {
      return res.status(400).json({ message: "Choose an active diagnostic center." });
    }
    const coupon = await Coupon.create(fields);
    return res.status(201).json({ coupon: formatCoupon(coupon) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "A coupon with this code already exists." });
    console.error("Coupon create error:", error.message);
    return res.status(500).json({ message: "Unable to create this coupon." });
  }
});

router.patch("/:id", requireAuth, requireModuleAccess("discounts", "update"), async (req, res) => {
  try {
    const fields = validateCouponFields(req.body);
    if (!fields || !mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Enter valid coupon details." });
    }
    const centerScope = getUserCenterId(req.user);
    if (centerScope) fields.center = centerScope;
    if (fields.center && !await Center.exists({ _id: fields.center, active: true })) {
      return res.status(400).json({ message: "Choose an active diagnostic center." });
    }
    const filter = centerScope
      ? { _id: req.params.id, center: centerScope }
      : { _id: req.params.id };
    const coupon = await Coupon.findOneAndUpdate(filter, fields, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ message: "Discount not found." });
    return res.json({ coupon: formatCoupon(coupon) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "A coupon with this code already exists." });
    console.error("Coupon update error:", error.message);
    return res.status(500).json({ message: "Unable to update this coupon." });
  }
});

router.delete("/:id", requireAuth, requireModuleAccess("discounts", "delete"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Choose a valid discount." });
    }
    const centerScope = getUserCenterId(req.user);
    const coupon = await Coupon.findOneAndUpdate(
      { _id: req.params.id, ...(centerScope ? { center: centerScope } : {}) },
      { active: false },
      { new: true }
    );
    if (!coupon) return res.status(404).json({ message: "Discount not found." });
    return res.json({ coupon: formatCoupon(coupon) });
  } catch (error) {
    console.error("Coupon deactivate error:", error.message);
    return res.status(500).json({ message: "Unable to deactivate this coupon." });
  }
});

export default router;
