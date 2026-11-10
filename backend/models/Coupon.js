import mongoose from "mongoose";

const userUsageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    count: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 32 },
    discountType: { type: String, enum: ["percentage", "fixed"], required: true },
    discountValue: { type: Number, required: true, min: 0.01, max: 1000000 },
    maxDiscount: { type: Number, default: null, min: 0 },
    minOrderAmount: { type: Number, default: 0, min: 0 },
    usageLimit: { type: Number, default: null, min: 1 },
    usageCount: { type: Number, default: 0, min: 0 },
    maxUsesPerUser: { type: Number, default: 1, min: 1 },
    usedBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], default: [] },
    userUsage: { type: [userUsageSchema], default: [] },
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    center: { type: mongoose.Schema.Types.ObjectId, ref: "Center", default: null, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("Coupon", couponSchema);
