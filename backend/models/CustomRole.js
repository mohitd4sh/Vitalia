import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      enum: [
        "dashboard",
        "bookings",
        "diagnostics",
        "patients",
        "reports",
        "centers",
        "staff",
        "inventory",
        "medicines",
        "messages",
        "finance",
        "discounts",
        "settings",
      ],
      required: true,
    },
    actions: {
      type: [{ type: String, enum: ["read", "create", "update", "delete"] }],
      default: [],
    },
  },
  { _id: false }
);

const customRoleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60, unique: true },
    center: { type: mongoose.Schema.Types.ObjectId, ref: "Center", default: null, index: true },
    description: { type: String, default: "", trim: true, maxlength: 240 },
    permissions: { type: [permissionSchema], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

customRoleSchema.index({ center: 1, name: 1 });

export default mongoose.model("CustomRole", customRoleSchema);
