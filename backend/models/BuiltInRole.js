import mongoose from "mongoose";
import { builtInRoleKeys } from "../services/builtInRolePermissions.js";

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

const builtInRoleSchema = new mongoose.Schema(
  {
    role: { type: String, enum: builtInRoleKeys, required: true, unique: true },
    permissions: { type: [permissionSchema], required: true, default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("BuiltInRole", builtInRoleSchema);
