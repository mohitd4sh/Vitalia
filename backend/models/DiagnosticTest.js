import mongoose from "mongoose";

const diagnosticTestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: "", trim: true, maxlength: 500 },
    price: { type: Number, required: true, min: 1, max: 1000000 },
    turnaround: { type: String, default: "24 hours", trim: true, maxlength: 80 },
    homeCollection: { type: Boolean, default: false },
    centers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Center" }],
    allCenters: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

diagnosticTestSchema.index({ name: 1, category: 1 });

export default mongoose.model("DiagnosticTest", diagnosticTestSchema);
