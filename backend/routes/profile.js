import express from "express";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      staffRole: req.user.staffRole,
      profile: req.user.profile,
      profileCompleted: req.user.profileCompleted,
    },
  });
});

router.put("/", requireAuth, async (req, res) => {
  try {
    const {
      fullName,
      dateOfBirth,
      gender,
      phone,
      address,
      preferredLocation,
      homeCollection,
      emergencyName,
      emergencyPhone,
      relationship,
    } = req.body;

    if (
      typeof fullName !== "string" ||
      !fullName.trim() ||
      fullName.trim().length > 100
    ) {
      return res.status(400).json({
        message: "Enter a valid full name.",
      });
    }

    if (
      typeof phone !== "string" ||
      !/^[6-9]\d{9}$/.test(phone.trim())
    ) {
      return res.status(400).json({
        message: "Enter a valid 10-digit Indian mobile number.",
      });
    }

    if (
      !["male", "female", "other", "prefer_not_to_say"].includes(gender)
    ) {
      return res.status(400).json({
        message: "Select a valid gender option.",
      });
    }

    if (typeof dateOfBirth !== "string" || !dateOfBirth) {
      return res.status(400).json({
        message: "Date of birth is required.",
      });
    }

    const dob = new Date(dateOfBirth);

    if (
      Number.isNaN(dob.getTime()) ||
      dob.toISOString().slice(0, 10) !== dateOfBirth ||
      dob >= new Date()
    ) {
      return res.status(400).json({
        message: "Enter a valid date of birth in the past.",
      });
    }

    if (
      typeof address !== "string" ||
      !address.trim() ||
      address.trim().length > 300
    ) {
      return res.status(400).json({
        message: "Enter a valid address.",
      });
    }

    if (typeof homeCollection !== "boolean") {
      return res.status(400).json({
        message: "Select your home collection preference.",
      });
    }

    if (
      typeof emergencyName !== "string" ||
      !emergencyName.trim() ||
      emergencyName.trim().length > 100 ||
      typeof emergencyPhone !== "string" ||
      !/^[6-9]\d{9}$/.test(emergencyPhone.trim()) ||
      typeof relationship !== "string" ||
      !relationship.trim() ||
      relationship.trim().length > 50
    ) {
      return res.status(400).json({
        message: "Enter valid emergency contact details.",
      });
    }

    if (
      typeof preferredLocation !== "string" ||
      preferredLocation.trim().length > 150
    ) {
      return res.status(400).json({
        message: "Enter a valid preferred location.",
      });
    }

    req.user.name = fullName.trim();

    req.user.profile = {
      dateOfBirth: dob,
      gender,
      phone: phone.trim(),
      address: address.trim(),
      preferredLocation: preferredLocation.trim(),
      homeCollection,
      emergencyName: emergencyName.trim(),
      emergencyPhone: emergencyPhone.trim(),
      relationship: relationship.trim(),
    };

    req.user.profileCompleted = true;

    await req.user.save();

    return res.json({
      message: "Profile saved successfully.",
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        staffRole: req.user.staffRole,
        profile: req.user.profile,
        profileCompleted: req.user.profileCompleted,
      },
    });
  } catch (error) {
    console.error("Profile update error:", error.message);

    return res.status(500).json({
      message: "Unable to save your profile. Please try again.",
    });
  }
});

export default router;
