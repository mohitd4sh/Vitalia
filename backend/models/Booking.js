import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["unpaid", "pending", "paid", "failed", "refunded", "cancelled"],
      default: "unpaid",
    },
    method: { type: String, enum: ["upi", "cash", ""], default: "" },
    gateway: { type: String, default: "" },
    orderId: { type: String, default: "" },
    paymentId: { type: String, default: "" },
    refundId: { type: String, default: "" },
    reference: { type: String, default: "", trim: true, maxlength: 100 },
    paidAt: { type: Date, default: null },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    test: { type: mongoose.Schema.Types.ObjectId, ref: "DiagnosticTest", required: true },
    testName: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    couponCode: { type: String, default: "", trim: true, uppercase: true, maxlength: 32 },
    center: { type: mongoose.Schema.Types.ObjectId, ref: "Center", default: null },
    centerName: { type: String, default: "", trim: true },
    appointmentAt: { type: Date, required: true, index: true },
    collectionType: { type: String, enum: ["center", "home"], default: "center" },
    address: { type: String, default: "", trim: true, maxlength: 300 },
    status: {
      type: String,
      enum: ["pending", "confirmed", "sample_collected", "processing", "completed", "cancelled"],
      default: "pending",
      index: true,
    },
    payment: { type: paymentSchema, default: () => ({}) },
    notes: { type: String, default: "", trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

export default mongoose.model("Booking", bookingSchema);
