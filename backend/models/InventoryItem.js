import mongoose from "mongoose";

const inventoryItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    sku: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 50 },
    category: { type: String, required: true, trim: true, maxlength: 80 },
    quantity: { type: Number, required: true, min: 0 },
    reorderLevel: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, trim: true, maxlength: 30 },
    center: { type: mongoose.Schema.Types.ObjectId, ref: "Center", default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("InventoryItem", inventoryItemSchema);
