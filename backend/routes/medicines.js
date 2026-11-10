import express from "express";
import mongoose from "mongoose";
import Medicine from "../models/Medicine.js";
import { requireAuth, requireModuleAccess } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

function requireAdminOrCustomMedicineAccess(action) {
  return (req, res, next) => {
    if (req.user.role === "admin") {
      next();
      return;
    }
    if (req.user.role !== "custom") {
      return res.status(403).json({ message: "Administrator access required." });
    }
    return requireModuleAccess("medicines", action)(req, res, next);
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateRetailProducts(products) {
  if (!Array.isArray(products) || products.length > 100) return null;

  const normalized = [];
  for (const product of products) {
    if (
      !product ||
      !["IN", "TZ"].includes(product.market) ||
      typeof product.brand !== "string" ||
      !product.brand.trim() ||
      product.brand.trim().length > 100 ||
      typeof product.strength !== "string" ||
      !product.strength.trim() ||
      product.strength.trim().length > 100 ||
      typeof product.form !== "string" ||
      !product.form.trim() ||
      product.form.trim().length > 60 ||
      typeof product.packSize !== "string" ||
      !product.packSize.trim() ||
      product.packSize.trim().length > 100 ||
      typeof product.manufacturer !== "string" ||
      product.manufacturer.length > 120 ||
      (product.mrp !== null && product.mrp !== undefined &&
        (!Number.isFinite(product.mrp) || product.mrp <= 0 || product.mrp > 1000000)) ||
      (product.discountPrice !== null && product.discountPrice !== undefined &&
        (!Number.isFinite(product.discountPrice) || product.discountPrice < 0 || product.discountPrice > 1000000)) ||
      (product.mrp != null && product.discountPrice != null && product.discountPrice > product.mrp) ||
      !Array.isArray(product.sources) ||
      product.sources.length < 1 ||
      product.sources.length > 10
    ) return null;

    const sources = [];
    for (const source of product.sources) {
      if (
        !source ||
        typeof source.retailer !== "string" ||
        !source.retailer.trim() ||
        source.retailer.trim().length > 100 ||
        typeof source.url !== "string" ||
        source.url.length > 500 ||
        typeof source.verifiedAt !== "string"
      ) return null;

      let url;
      try {
        url = new URL(source.url);
      } catch {
        return null;
      }
      const verifiedAt = new Date(source.verifiedAt);
      if (url.protocol !== "https:" || !url.hostname || Number.isNaN(verifiedAt.getTime())) {
        return null;
      }
      sources.push({
        retailer: source.retailer.trim(),
        url: url.href,
        verifiedAt,
      });
    }

    normalized.push({
      market: product.market,
      brand: product.brand.trim(),
      strength: product.strength.trim(),
      form: product.form.trim(),
      packSize: product.packSize.trim(),
      manufacturer: product.manufacturer.trim(),
      mrp: product.mrp ?? null,
      discountPrice: product.discountPrice ?? null,
      sources,
    });
  }
  return normalized;
}

function validateMedicine(body) {
  const {
    name,
    brand = "",
    strength = "",
    form = "",
    category,
    description = "",
    price,
    mrp = null,
    discountPrice = null,
    stock = 0,
    requiresPrescription = true,
    active = true,
    retailProducts = [],
  } = body;
  const normalizedRetailProducts = validateRetailProducts(retailProducts);

  if (
    !normalizedRetailProducts ||
    typeof name !== "string" || !name.trim() || name.trim().length > 120 ||
    typeof brand !== "string" || brand.length > 100 ||
    typeof strength !== "string" || strength.length > 100 ||
    typeof form !== "string" || form.length > 60 ||
    typeof category !== "string" || !category.trim() || category.trim().length > 60 ||
    typeof description !== "string" || description.length > 500 ||
    !Number.isFinite(price) || price < 0 || price > 1000000 ||
    (mrp !== null && (!Number.isFinite(mrp) || mrp <= 0 || mrp > 1000000)) ||
    (discountPrice !== null && (!Number.isFinite(discountPrice) || discountPrice < 0 || discountPrice > 1000000)) ||
    (mrp !== null && discountPrice !== null && discountPrice > mrp) ||
    !Number.isInteger(stock) || stock < 0 || stock > 1000000 ||
    (requiresPrescription !== null && typeof requiresPrescription !== "boolean") ||
    typeof active !== "boolean"
  ) return null;

  return {
    name: name.trim(),
    brand: brand.trim(),
    strength: strength.trim(),
    form: form.trim(),
    category: category.trim(),
    description: description.trim(),
    price,
    mrp,
    discountPrice,
    stock,
    requiresPrescription,
    active,
    retailProducts: normalizedRetailProducts,
  };
}

router.get("/admin", requireAdminOrCustomMedicineAccess("read"), async (req, res) => {
  try {
    const medicines = await Medicine.find().sort({ updatedAt: -1, name: 1 }).lean();
    return res.json({ medicines });
  } catch (error) {
    console.error("Admin medicine list error:", error.message);
    return res.status(500).json({ message: "Unable to load medicines." });
  }
});

router.get("/", async (req, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length > 100) {
      return res.status(400).json({ message: "Medicine search must be 100 characters or fewer." });
    }

    const filter = {
      active: true,
      retailProducts: { $elemMatch: { market: "IN" } },
    };
    if (query) {
      const matcher = new RegExp(escapeRegex(query), "i");
      filter.$or = [
        { name: matcher },
        { brand: matcher },
        { strength: matcher },
        { category: matcher },
        { form: matcher },
        { "retailProducts.brand": matcher },
        { "retailProducts.manufacturer": matcher },
        { "retailProducts.packSize": matcher },
      ];
    }
    const medicines = await Medicine.find(filter)
      .select("name category description price mrp discountPrice stock requiresPrescription retailProducts sourceName sourceUrl sourcePage")
      .sort({ name: 1 })
      .limit(100)
      .lean();
    return res.json({ medicines });
  } catch (error) {
    console.error("Medicine catalogue search error:", error.message);
    return res.status(500).json({ message: "Unable to search the medicine catalogue." });
  }
});

router.post("/", requireAdminOrCustomMedicineAccess("create"), async (req, res) => {
  const medicineFields = validateMedicine(req.body);
  if (!medicineFields) {
    return res.status(400).json({ message: "Enter valid medicine details." });
  }
  try {
    const medicine = await Medicine.create(medicineFields);
    return res.status(201).json({ medicine });
  } catch (error) {
    console.error("Medicine create error:", error.message);
    return res.status(500).json({ message: "Unable to add this medicine." });
  }
});

router.put("/:id", requireAdminOrCustomMedicineAccess("update"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Medicine not found." });
  }
  const medicineFields = validateMedicine(req.body);
  if (!medicineFields) {
    return res.status(400).json({ message: "Enter valid medicine details." });
  }
  try {
    const medicine = await Medicine.findByIdAndUpdate(
      req.params.id,
      { $set: medicineFields },
      { new: true, runValidators: true }
    );
    if (!medicine) return res.status(404).json({ message: "Medicine not found." });
    return res.json({ medicine });
  } catch (error) {
    console.error("Medicine update error:", error.message);
    return res.status(500).json({ message: "Unable to update this medicine." });
  }
});

router.delete("/:id", requireAdminOrCustomMedicineAccess("delete"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Medicine not found." });
  }
  try {
    const medicine = await Medicine.findByIdAndDelete(req.params.id);
    if (!medicine) return res.status(404).json({ message: "Medicine not found." });
    return res.json({ message: "Medicine deleted." });
  } catch (error) {
    console.error("Medicine delete error:", error.message);
    return res.status(500).json({ message: "Unable to delete this medicine." });
  }
});

export default router;
