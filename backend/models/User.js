import mongoose from "mongoose";

const profileSchema = new mongoose.Schema(
  {
    dateOfBirth: {
      type: Date,
      default: null,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say", ""],
      default: "",
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    address: {
      type: String,
      default: "",
      trim: true,
    },
    preferredLocation: {
      type: String,
      default: "",
      trim: true,
    },
    homeCollection: {
      type: Boolean,
      default: false,
    },
    emergencyName: {
      type: String,
      default: "",
      trim: true,
    },
    emergencyPhone: {
      type: String,
      default: "",
      trim: true,
    },
    relationship: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false }
);

const permissionOverrideSchema = new mongoose.Schema(
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

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["patient", "admin", "center_master", "staff", "custom"],
      default: "patient",
    },
    assignedCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      default: null,
      index: true,
    },
    customRole: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomRole",
      default: null,
    },
    permissionOverrides: {
      type: [permissionOverrideSchema],
      default: null,
    },
    staffRole: {
      type: String,
      enum: ["receptionist", "technician", "phlebotomist", ""],
      default: "",
    },
    active: { type: Boolean, default: true },
    profile: {
      type: profileSchema,
      default: () => ({}),
    },
    profileCompleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
