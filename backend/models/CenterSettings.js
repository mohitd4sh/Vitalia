
import mongoose from "mongoose";

const centerSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "main" },

    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      default: null,
    },

    name: {
      type: String,
      default: "Vitalia Diagnostics",
      trim: true,
      maxlength: 120,
    },

    email: { type: String, default: "", trim: true, maxlength: 254 },
    phone: { type: String, default: "", trim: true, maxlength: 30 },
    address: { type: String, default: "", trim: true, maxlength: 400 },
    upiId: { type: String, default: "", trim: true, maxlength: 100 },

    currency: { type: String, enum: ["INR"], default: "INR" },

    timezone: {
      type: String,
      default: "Asia/Kolkata",
      trim: true,
      maxlength: 80,
    },
  },
  { timestamps: true }
);

// One settings document per center.
// Allows multiple documents with center: null.
centerSettingsSchema.index(
  { center: 1 },
  {
    unique: true,
    partialFilterExpression: {
      center: { $type: "objectId" },
    },
  }
);

export default mongoose.model("CenterSettings", centerSettingsSchema);