import mongoose from "mongoose";

const passwordResetRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    method: {
      type: String,
      enum: ["email", "admin"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "processing", "completed", "rejected"],
      required: true,
      default: "pending",
      index: true,
    },
    tokenHash: { type: String, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("PasswordResetRequest", passwordResetRequestSchema);
