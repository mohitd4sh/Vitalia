import mongoose from "mongoose";

const centerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, trim: true, uppercase: true, maxlength: 30 },
    address: { type: String, required: true, trim: true, maxlength: 400 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, default: "", trim: true, maxlength: 30 },
    openingHours: { type: String, default: "", trim: true, maxlength: 200 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Center", centerSchema);
