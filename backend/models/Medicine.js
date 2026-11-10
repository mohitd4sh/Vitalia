import mongoose from "mongoose";

const retailProductSourceSchema = new mongoose.Schema(
  {
    retailer: { type: String, required: true, trim: true, maxlength: 100 },
    url: { type: String, required: true, trim: true, maxlength: 500 },
    verifiedAt: { type: Date, required: true },
  },
  { _id: false }
);

const retailProductSchema = new mongoose.Schema(
  {
    market: { type: String, enum: ["IN", "TZ"], required: true, default: "IN" },
    brand: { type: String, required: true, trim: true, maxlength: 100 },
    strength: { type: String, required: true, trim: true, maxlength: 100 },
    form: { type: String, required: true, trim: true, maxlength: 60 },
    packSize: { type: String, required: true, trim: true, maxlength: 100 },
    manufacturer: { type: String, default: "", trim: true, maxlength: 120 },
    mrp: { type: Number, min: 0, max: 1000000, default: null },
    discountPrice: { type: Number, min: 0, max: 1000000, default: null },
    sources: {
      type: [retailProductSourceSchema],
      validate: (sources) => sources.length > 0 && sources.length <= 10,
    },
  },
  { _id: false }
);

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    brand: { type: String, default: "", trim: true, maxlength: 100 },
    strength: { type: String, default: "", trim: true, maxlength: 100 },
    form: { type: String, default: "", trim: true, maxlength: 60 },
    category: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: "", trim: true, maxlength: 500 },
    price: { type: Number, required: true, min: 0, max: 1000000 },
    mrp: { type: Number, min: 0, max: 1000000, default: null },
    discountPrice: { type: Number, min: 0, max: 1000000, default: null },
    stock: { type: Number, default: 0, min: 0, max: 1000000, validate: Number.isInteger },
    requiresPrescription: { type: Boolean, default: true },
    active: { type: Boolean, default: true, index: true },
    sourceKey: { type: String, trim: true, default: undefined },
    sourceName: { type: String, trim: true, maxlength: 120, default: "" },
    sourceUrl: { type: String, trim: true, maxlength: 500, default: "" },
    sourcePage: { type: Number, min: 1, default: null },
    retailProducts: {
      type: [retailProductSchema],
      validate: (products) => products.length <= 100,
    },
  },
  { timestamps: true }
);

medicineSchema.index({ name: 1, brand: 1, strength: 1 });
medicineSchema.index({ active: 1, category: 1, name: 1 });
medicineSchema.index({ sourceKey: 1 }, { unique: true, sparse: true });

export default mongoose.model("Medicine", medicineSchema);
