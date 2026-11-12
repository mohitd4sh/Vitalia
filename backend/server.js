
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

// MongoDB connection cache
const cached = globalThis.vitaliaMongo || {
  promise: null,
};

globalThis.vitaliaMongo = cached;

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing");
  }

  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGODB_URI)
      .then(() => {
        console.log("MongoDB connected successfully");
      })
      .catch((error) => {
        cached.promise = null;
        throw error;
      });
  }

  await cached.promise;
}

// CORS configuration
const allowedOrigins = (
  process.env.CLIENT_URL || "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
  })
);

app.use(express.json({ limit: "20kb" }));

// Database connection middleware
app.use(async (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing");
    }

    await connectDB();
    next();
  } catch (error) {
    console.error("Backend initialization failed:", error.message);

    res.status(500).json({
      status: "error",
      message: "Backend initialization failed",
    });
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "VITALIA API is running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "VITALIA API is running",
    database: "connected",
  });
});

// API routes
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

// Not found
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "API route not found",
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error("API error:", error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    status: "error",
    message: "Internal server error",
  });
});

// Local development only
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`VITALIA API running at http://localhost:${PORT}`);
  });
}

export default app;