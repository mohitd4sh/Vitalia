
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import bookingRoutes from "./routes/bookings.js";
import centerRoutes from "./routes/centers.js";
import couponRoutes from "./routes/coupons.js";
import operationsRoutes from "./routes/operations.js";
import profileRoutes from "./routes/profile.js";
import reportRoutes from "./routes/reports.js";
import testRoutes from "./routes/tests.js";
import notificationRoutes from "./routes/notifications.js";
import supportRoutes from "./routes/support.js";
import medicineRoutes from "./routes/medicines.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
  })
);

app.use(express.json({ limit: "20kb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "VITALIA API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/centers", centerRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/operations", operationsRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/medicines", medicineRoutes);

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from backend/.env");
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing from backend/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected successfully");

    app.listen(PORT, () => {
      console.log(`VITALIA API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();