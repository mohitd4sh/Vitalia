import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import Medicine from "../models/Medicine.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.resolve(scriptDirectory, "../data/India_e-phrama.json");
const excludedCategoryPattern =
  /supplement|nutritional|personal care|accessory|aromatherapy|orthopaedic|eye care\s*\/\s*hygiene|homeopathic product/i;

function sourceKeyFor(name) {
  const key = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `india-e-pharmacy:${key}`;
}

function firstValue(values, fieldName, medicineName, maxLength) {
  if (
    !Array.isArray(values) ||
    typeof values[0] !== "string" ||
    !values[0].trim() ||
    values[0].trim().length > maxLength
  ) {
    throw new Error(`Invalid ${fieldName} for ${medicineName}.`);
  }
  return values[0].trim();
}

function normalizeEntry(entry) {
  const name = entry.name.trim();
  const brand = firstValue(entry.brand, "brand", name, 100);
  const strength = firstValue(entry.strength, "strength", name, 100);
  const form = firstValue(entry.form, "form", name, 60);
  const category = entry.category.trim();
  const description = entry.description.trim();
  const packSize = Number.isFinite(entry.price?.packSize)
    ? String(entry.price.packSize)
    : "Not stated";
  const mrp = Number.isFinite(entry.price?.mrp) && entry.price.mrp > 0
    ? entry.price.mrp
    : null;
  const discountPrice = Number.isFinite(entry.price?.max) && entry.price.max >= 0
    ? entry.price.max
    : null;

  if (
    (mrp !== null && discountPrice !== null && discountPrice > mrp) ||
    name.length > 120 ||
    !category ||
    category.length > 60 ||
    description.length > 500 ||
    packSize.length > 100 ||
    typeof entry.source?.retailer !== "string" ||
    !entry.source.retailer.trim() ||
    typeof entry.source.sourceUrl !== "string" ||
    entry.source.sourceUrl.length > 500 ||
    Number.isNaN(new Date(entry.source.listingChecked).getTime())
  ) {
    throw new Error(`Invalid India e-pharmacy entry: ${name || "(unnamed)"}.`);
  }

  let sourceUrl;
  try {
    sourceUrl = new URL(entry.source.sourceUrl);
  } catch {
    throw new Error(`Invalid source URL for ${name}.`);
  }
  if (sourceUrl.protocol !== "https:") {
    throw new Error(`Source URL must use HTTPS for ${name}.`);
  }

  return {
    name,
    brand,
    strength,
    form,
    category,
    description,
    packSize,
    mrp,
    discountPrice,
    retailer: entry.source.retailer.trim(),
    sourceUrl: sourceUrl.href,
    verifiedAt: new Date(entry.source.listingChecked),
  };
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  const sourceEntries = catalog.medicines;
  if (!Array.isArray(sourceEntries) || !sourceEntries.length) {
    throw new Error("The India e-pharmacy data file does not contain any product entries.");
  }

  const namedEntries = sourceEntries.filter(
    (entry) => typeof entry?.name === "string" && entry.name.trim()
  );
  const skippedUnnamedCount = sourceEntries.length - namedEntries.length;
  const entries = [];
  let excludedCount = 0;
  const seen = new Set();

  for (const entry of namedEntries) {
    if (typeof entry.category === "string" && excludedCategoryPattern.test(entry.category)) {
      excludedCount += 1;
      continue;
    }

    const normalized = normalizeEntry(entry);
    const sourceKey = sourceKeyFor(normalized.name);
    if (seen.has(sourceKey)) {
      throw new Error(`Duplicate India e-pharmacy product: ${normalized.name}`);
    }
    seen.add(sourceKey);
    entries.push({ ...normalized, sourceKey });
  }

  if (!entries.length) {
    throw new Error("No named medicine entries were found; nothing can be imported.");
  }

  if (process.argv.includes("--dry-run")) {
    const withMrp = entries.filter((entry) => entry.mrp !== null).length;
    console.log(
      `Validated ${entries.length} India medicine records, including ${withMrp} with MRP and discounted price; excluded ${excludedCount} non-medicine records and skipped ${skippedUnnamedCount} unnamed records.`
    );
    return;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI must be configured before importing the India medicine list.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  await Medicine.init();

  const operations = entries.map((entry) => ({
    updateOne: {
      filter: { sourceKey: entry.sourceKey },
      update: {
        $set: {
          mrp: entry.mrp,
          discountPrice: entry.discountPrice,
          retailProducts: [
            {
              market: "IN",
              brand: entry.brand,
              strength: entry.strength,
              form: entry.form,
              packSize: entry.packSize,
              manufacturer: "",
              mrp: entry.mrp,
              discountPrice: entry.discountPrice,
              sources: [
                {
                  retailer: entry.retailer,
                  url: entry.sourceUrl,
                  verifiedAt: entry.verifiedAt,
                },
              ],
            },
          ],
        },
        $setOnInsert: {
          sourceKey: entry.sourceKey,
          name: entry.name,
          brand: entry.brand,
          strength: entry.strength,
          form: entry.form,
          category: entry.category,
          description: entry.description,
          price: 0,
          stock: 0,
          requiresPrescription: null,
          active: true,
          sourceName: `${entry.retailer} India listing`,
          sourceUrl: entry.sourceUrl,
        },
      },
      upsert: true,
    },
  }));

  const result = await Medicine.bulkWrite(operations, { ordered: true });
  console.log(
    `India e-pharmacy import complete: ${result.upsertedCount} added, ${result.matchedCount} already present, ${excludedCount} non-medicine records excluded, ${skippedUnnamedCount} unnamed records skipped.`
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("India e-pharmacy import failed:", error.message);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exitCode = 1;
});
