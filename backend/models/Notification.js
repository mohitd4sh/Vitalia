import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: { type: String, enum: ["message", "booking", "payment", "report", "account"], default: "message" },
    severity: { type: String, enum: ["info", "success", "error"], default: "info" },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    href: { type: String, default: "", trim: true, maxlength: 240 },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

export default mongoose.model("Notification", notificationSchema);
