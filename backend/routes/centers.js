import express from "express";
import Center from "../models/Center.js";
import CenterSettings from "../models/CenterSettings.js";
import { ensureCenterSettings } from "../services/centerSettings.js";
import { getUserCenterId, requireAuth, allowCustomAnyModuleAccess } from "../middleware/auth.js";

const router = express.Router();

router.get("/payment-info", requireAuth, async (req, res) => {
  try {
    const userCenterId = getUserCenterId(req.user);
    const centerId = userCenterId || req.query.centerId;
    if (centerId && !/^[\da-f]{24}$/i.test(centerId)) {
      return res.status(400).json({ message: "Choose a valid diagnostic center." });
    }
    if (userCenterId && req.query.centerId && String(userCenterId) !== String(req.query.centerId)) {
      return res.status(404).json({ message: "Diagnostic center not found." });
    }
    const centerSettings = centerId
      ? await ensureCenterSettings(centerId)
      : null;
    if (centerId && !centerSettings) {
      return res.status(404).json({ message: "Diagnostic center not found." });
    }
    const settings = centerSettings || await CenterSettings.findOne({ key: "main", center: null })
      .select("name email phone address upiId")
      .lean();
    return res.json({
      businessName: settings?.name || "Vitalia Diagnostics",
      email: settings?.email || "",
      phone: settings?.phone || "",
      address: settings?.address || "",
      upiId: settings?.upiId || "",
    });
  } catch (error) {
    console.error("Payment information error:", error.message);
    return res.status(500).json({ message: "Unable to load payment information." });
  }
});

router.get(
  "/",
  requireAuth,
  allowCustomAnyModuleAccess(
    { module: "centers", action: "read" },
    { module: "bookings", action: "create" }
  ),
  async (req, res) => {
  try {
    const centerId = getUserCenterId(req.user);
    const centers = await Center.find({ active: true, ...(centerId ? { _id: centerId } : {}) })
      .select("name address city phone openingHours")
      .sort({ city: 1, name: 1 })
      .lean();
    return res.json({ centers: centers.map((center) => ({ ...center, id: center._id })) });
  } catch (error) {
    console.error("Public center list error:", error.message);
    return res.status(500).json({ message: "Unable to load diagnostic centers." });
  }
  }
);

export default router;
