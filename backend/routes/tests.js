import express from "express";
import mongoose from "mongoose";
import Center from "../models/Center.js";
import DiagnosticTest from "../models/DiagnosticTest.js";
import { getUserCenterId, getUserPermissions, requireAuth, requireModuleAccess, allowCustomModuleAccess } from "../middleware/auth.js";

const router = express.Router();

router.get("/", requireAuth, allowCustomModuleAccess("diagnostics", "read"), async (req, res) => {
  try {
    const centerScope = getUserCenterId(req.user);
    const canManageCatalog = getUserPermissions(req.user).some((permission) =>
      permission.module === "diagnostics" &&
      permission.actions.some((action) => ["update", "delete"].includes(action))
    );
    const filter = centerScope
      ? { centers: [centerScope], allCenters: false }
      : canManageCatalog ? {} : { active: true };
    const tests = await DiagnosticTest.find(filter)
      .sort({ category: 1, name: 1 })
      .lean();
    return res.json({ tests });
  } catch (error) {
    console.error("Diagnostic test list error:", error.message);
    return res.status(500).json({ message: "Unable to load diagnostic tests." });
  }
});

router.post("/", requireAuth, requireModuleAccess("diagnostics", "create"), async (req, res) => {
  try {
    const { name, category, description = "", price, turnaround = "24 hours", homeCollection = false, centers = [], allCenters = true } = req.body;
    if (
      typeof name !== "string" || !name.trim() || name.trim().length > 120 ||
      typeof category !== "string" || !category.trim() || category.trim().length > 60 ||
      typeof description !== "string" || description.length > 500 ||
      !Number.isFinite(price) || price < 1 || price > 1000000 ||
      typeof turnaround !== "string" || turnaround.length > 80 ||
      typeof homeCollection !== "boolean" ||
      typeof allCenters !== "boolean" ||
      !Array.isArray(centers) ||
      centers.some((centerId) => !mongoose.isValidObjectId(centerId))
    ) {
      return res.status(400).json({ message: "Enter valid test details." });
    }
    const centerScope = getUserCenterId(req.user);
    const centerIds = centerScope
      ? [centerScope]
      : allCenters ? [] : [...new Set(centers.map(String))];
    if (!centerScope && !allCenters && !centerIds.length) {
      return res.status(400).json({ message: "Select at least one center or choose all centers." });
    }
    if (!centerScope && centerIds.length &&
      await Center.countDocuments({ _id: { $in: centerIds } }) !== centerIds.length) {
      return res.status(400).json({ message: "Choose valid centers for this diagnostic." });
    }
    const test = await DiagnosticTest.create({
      name: name.trim(),
      category: category.trim(),
      description: description.trim(),
      price,
      turnaround: turnaround.trim() || "24 hours",
      homeCollection,
      centers: centerIds,
      allCenters: !centerScope && allCenters,
    });
    return res.status(201).json({ test });
  } catch (error) {
    console.error("Diagnostic test create error:", error.message);
    return res.status(500).json({ message: "Unable to create this test." });
  }
});

router.put("/:id", requireAuth, requireModuleAccess("diagnostics", "update"), async (req, res) => {
  try {
    const { name, category, description = "", price, turnaround = "24 hours", homeCollection = false, active, centers = [], allCenters = true } = req.body;
    if (
      typeof name !== "string" || !name.trim() || name.trim().length > 120 ||
      typeof category !== "string" || !category.trim() || category.trim().length > 60 ||
      typeof description !== "string" || description.length > 500 ||
      !Number.isFinite(price) || price < 1 || price > 1000000 ||
      typeof turnaround !== "string" || turnaround.length > 80 ||
      typeof homeCollection !== "boolean" ||
      typeof allCenters !== "boolean" ||
      !Array.isArray(centers) ||
      centers.some((centerId) => !mongoose.isValidObjectId(centerId)) ||
      typeof active !== "boolean"
    ) {
      return res.status(400).json({ message: "Enter valid test details." });
    }
    const centerScope = getUserCenterId(req.user);
    const centerIds = centerScope
      ? [centerScope]
      : allCenters ? [] : [...new Set(centers.map(String))];
    if (!centerScope && !allCenters && !centerIds.length) {
      return res.status(400).json({ message: "Select at least one center or choose all centers." });
    }
    if (!centerScope && centerIds.length &&
      await Center.countDocuments({ _id: { $in: centerIds } }) !== centerIds.length) {
      return res.status(400).json({ message: "Choose valid centers for this diagnostic." });
    }
    const filter = centerScope
      ? { _id: req.params.id, centers: [centerScope], allCenters: false }
      : { _id: req.params.id };
    const test = await DiagnosticTest.findOneAndUpdate(
      filter,
      {
        name: name.trim(),
        category: category.trim(),
        description: description.trim(),
        price,
        turnaround: turnaround.trim(),
        homeCollection,
        active,
        centers: centerIds,
        allCenters: !centerScope && allCenters,
      },
      { new: true, runValidators: true }
    );
    if (!test) return res.status(404).json({ message: "Test not found." });
    return res.json({ test });
  } catch (error) {
    console.error("Diagnostic test update error:", error.message);
    return res.status(500).json({ message: "Unable to update this test." });
  }
});

router.patch("/:id/reactivate", requireAuth, requireModuleAccess("diagnostics", "update"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Test not found." });
    }
    const centerScope = getUserCenterId(req.user);
    const filter = centerScope
      ? { _id: req.params.id, centers: [centerScope], allCenters: false }
      : { _id: req.params.id };
    const test = await DiagnosticTest.findOneAndUpdate(
      filter,
      { active: true },
      { new: true }
    );
    if (!test) return res.status(404).json({ message: "Test not found." });
    return res.json({ test, message: "Diagnostic test reactivated." });
  } catch (error) {
    console.error("Diagnostic test reactivation error:", error.message);
    return res.status(500).json({ message: "Unable to reactivate this test." });
  }
});

router.delete("/:id", requireAuth, requireModuleAccess("diagnostics", "delete"), async (req, res) => {
  try {
    const centerScope = getUserCenterId(req.user);
    const filter = centerScope
      ? { _id: req.params.id, centers: [centerScope], allCenters: false }
      : { _id: req.params.id };
    const test = await DiagnosticTest.findOneAndUpdate(
      filter,
      { active: false },
      { new: true }
    );
    if (!test) return res.status(404).json({ message: "Test not found." });
    return res.json({ test, message: "Test is no longer available for new bookings." });
  } catch (error) {
    console.error("Diagnostic test archive error:", error.message);
    return res.status(500).json({ message: "Unable to archive this test." });
  }
});

export default router;
