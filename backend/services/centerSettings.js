import Center from "../models/Center.js";
import CenterSettings from "../models/CenterSettings.js";

export async function ensureCenterSettings(centerId) {
  const center = await Center.findById(centerId).select("name").lean();
  if (!center) return null;
  const shared = await CenterSettings.findOne({ key: "main", center: null })
    .select("email phone address upiId currency timezone")
    .lean();
  return CenterSettings.findOneAndUpdate(
    { center: centerId },
    {
      $setOnInsert: {
        key: String(centerId),
        center: centerId,
        name: center.name,
        email: shared?.email || "",
        phone: shared?.phone || "",
        address: shared?.address || "",
        upiId: shared?.upiId || "",
        currency: shared?.currency || "INR",
        timezone: shared?.timezone || "Asia/Kolkata",
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
}
