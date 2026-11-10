import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import Medicine from "../models/Medicine.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.resolve(scriptDirectory, "../data/tanzania-eml-2026.json");

function sourceKeyFor(name) {
  const key = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `tanzania-neml-2026:${key}`;
}

function validateRetailProducts(products, medicineName) {
  if (products === undefined) return [];
  if (!Array.isArray(products) || products.length > 100) {
    throw new Error(`Invalid retail product list for ${medicineName}.`);
  }
  for (const product of products) {
    if (
      !product ||
      !["IN", "TZ"].includes(product.market) ||
      !["brand", "strength", "form", "packSize"].every((field) =>
        typeof product[field] === "string" && product[field].trim()
      ) ||
      typeof product.manufacturer !== "string" ||
      !Array.isArray(product.sources) ||
      !product.sources.length ||
      product.sources.length > 10
    ) {
      throw new Error(`Invalid retail product entry for ${medicineName}.`);
    }

    for (const source of product.sources) {
      let url;
      try {
        url = new URL(source.url);
      } catch {
        throw new Error(`Invalid retailer source URL for ${medicineName}.`);
      }
      if (
        typeof source.retailer !== "string" ||
        !source.retailer.trim() ||
        url.protocol !== "https:" ||
        Number.isNaN(new Date(source.verifiedAt).getTime())
      ) {
        throw new Error(`Invalid retailer source metadata for ${medicineName}.`);
      }
    }
  }
  return products;
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const sourceEntries = catalog.medicines;
  if (!Array.isArray(sourceEntries) || !sourceEntries.length) {
    throw new Error("The Tanzania NEML data file does not contain any medicine entries.");
  }
  const entries = sourceEntries.filter(
    (entry) => typeof entry?.name === "string" && entry.name.trim()
  );
  const skippedUnnamedCount = sourceEntries.length - entries.length;
  if (!entries.length) {
    throw new Error("No named medicine entries were found; nothing can be imported.");
  }

  const seen = new Set();
  for (const entry of entries) {
    if (
      typeof entry.name !== "string" ||
      !entry.name.trim() ||
      entry.name.length > 120 ||
      typeof entry.category !== "string" ||
      !entry.category.trim() ||
      entry.category.length > 60 ||
      !Number.isInteger(entry.sourcePage) ||
      entry.sourcePage < 1
    ) {
      throw new Error(`Invalid Tanzania NEML entry: ${JSON.stringify(entry)}`);
    }
    entry.retailProducts = validateRetailProducts(entry.retailProducts, entry.name);

    const sourceKey = sourceKeyFor(entry.name);
    if (seen.has(sourceKey)) {
      throw new Error(`Duplicate source medicine: ${entry.name}`);
    }
    seen.add(sourceKey);
  }

  if (process.argv.includes("--dry-run")) {
    const retailProductCount = entries.reduce((count, entry) => count + entry.retailProducts.length, 0);
    const retailLabel = retailProductCount === 1 ? "retail product" : "retail products";
    console.log(
      `Validated ${entries.length} unique entries and ${retailProductCount} ${retailLabel} from ${catalog.sourceName}; skipped ${skippedUnnamedCount} unnamed entries.`
    );
    return;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI must be configured before importing the medicine list.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  await Medicine.init();

  const operations = entries.map((entry) => {
    const update = {
      $setOnInsert: {
        name: entry.name.trim(),
        brand: "",
        strength: "",
        form: "",
        category: entry.category.trim(),
        description: "Generic medicine listed in the Tanzania National Essential Medicines List (2026).",
        price: 0,
        stock: 0,
        requiresPrescription: null,
        active: true,
        sourceKey: sourceKeyFor(entry.name),
        sourceName: catalog.sourceName,
        sourceUrl: catalog.sourceUrl,
        sourcePage: entry.sourcePage,
      },
    };
    if (entry.retailProducts.length) {
      update.$addToSet = { retailProducts: { $each: entry.retailProducts } };
    }
    return {
      updateOne: {
        filter: { sourceKey: sourceKeyFor(entry.name) },
        update,
        upsert: true,
      },
    };
  });

  const result = await Medicine.bulkWrite(operations, { ordered: true });
  console.log(
    `Tanzania NEML import complete: ${result.upsertedCount} added, ${result.matchedCount} already present, ${skippedUnnamedCount} unnamed entries skipped.`
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Tanzania NEML import failed:", error.message);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exitCode = 1;
});
