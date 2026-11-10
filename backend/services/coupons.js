import Coupon from "../models/Coupon.js";

export function calculateDiscount(coupon, price) {
  const discount = coupon.discountType === "percentage"
    ? price * coupon.discountValue / 100
    : coupon.discountValue;
  const cappedDiscount = coupon.discountType === "percentage" && coupon.maxDiscount
    ? Math.min(discount, coupon.maxDiscount)
    : discount;
  return Math.min(price, Math.round(cappedDiscount * 100) / 100);
}

export function getUserCouponUseCount(coupon, userId) {
  const usage = coupon.userUsage?.find((entry) => String(entry.user) === String(userId));
  if (usage) return usage.count;
  return coupon.usedBy?.some((id) => String(id) === String(userId)) ? 1 : 0;
}

export async function findApplicableCoupon({ code, userId, centerId, price }) {
  if (code === undefined || code === null || code === "") return null;
  const normalizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9_-]{3,32}$/.test(normalizedCode)) {
    const error = new Error("Enter a valid coupon code.");
    error.statusCode = 400;
    throw error;
  }

  const coupon = await Coupon.findOne({ code: normalizedCode });
  const reject = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
  };
  if (!coupon || !coupon.active) reject("This coupon is not available.");
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) reject("This coupon is not active yet.");
  if (coupon.expiresAt && coupon.expiresAt <= now) reject("This coupon has expired.");
  if (coupon.center && String(coupon.center) !== String(centerId)) {
    reject("This coupon is not valid at the selected center.");
  }
  if (price < coupon.minOrderAmount) {
    reject(`This coupon requires a minimum booking of ₹${coupon.minOrderAmount}.`);
  }
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    reject("This coupon has reached its usage limit.", 409);
  }
  const maxUsesPerUser = coupon.maxUsesPerUser ?? 1;
  if (getUserCouponUseCount(coupon, userId) >= maxUsesPerUser) {
    reject(`You have reached the limit of ${maxUsesPerUser} uses for this coupon.`, 409);
  }

  const discountAmount = calculateDiscount(coupon, price);
  return {
    coupon,
    discountAmount,
    finalPrice: Math.max(0, Math.round((price - discountAmount) * 100) / 100),
  };
}

export async function claimCoupon(coupon, userId) {
  const now = new Date();
  const userIdForQuery = userId;
  const userUsages = { $ifNull: ["$userUsage", []] };
  const userUsageEntry = {
    $arrayElemAt: [
      {
        $filter: {
          input: userUsages,
          as: "usage",
          cond: { $eq: ["$$usage.user", userIdForQuery] },
        },
      },
      0,
    ],
  };
  const userUseCount = {
    $let: {
      vars: { usage: userUsageEntry },
      in: {
        $ifNull: [
          "$$usage.count",
          { $cond: [{ $in: [userIdForQuery, { $ifNull: ["$usedBy", []] }] }, 1, 0] },
        ],
      },
    },
  };
  const claimed = await Coupon.findOneAndUpdate(
    {
      _id: coupon._id,
      active: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
      ],
      $expr: {
        $and: [
          {
            $or: [
              { $eq: ["$usageLimit", null] },
              { $lt: ["$usageCount", "$usageLimit"] },
            ],
          },
          { $lt: [userUseCount, coupon.maxUsesPerUser ?? 1] },
        ],
      },
    },
    [
      {
        $set: {
          usageCount: { $add: [{ $ifNull: ["$usageCount", 0] }, 1] },
          usedBy: { $setUnion: [{ $ifNull: ["$usedBy", []] }, [userIdForQuery]] },
          userUsage: {
            $let: {
              vars: {
                usages: userUsages,
                hasEntry: {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: userUsages,
                          as: "usage",
                          cond: { $eq: ["$$usage.user", userIdForQuery] },
                        },
                      },
                    },
                    0,
                  ],
                },
              },
              in: {
                $cond: [
                  "$$hasEntry",
                  {
                    $map: {
                      input: "$$usages",
                      as: "usage",
                      in: {
                        $cond: [
                          { $eq: ["$$usage.user", userIdForQuery] },
                          { $mergeObjects: ["$$usage", { count: { $add: ["$$usage.count", 1] } }] },
                          "$$usage",
                        ],
                      },
                    },
                  },
                  {
                    $concatArrays: [
                      "$$usages",
                      [{ user: userIdForQuery, count: { $add: [userUseCount, 1] } }],
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    ],
    { new: true, updatePipeline: true }
  );
  if (!claimed) {
    const error = new Error("This coupon was just used or is no longer available.");
    error.statusCode = 409;
    throw error;
  }
}

export async function releaseCouponClaim(couponId, userId) {
  const userUsages = { $ifNull: ["$userUsage", []] };
  await Coupon.updateOne(
    { _id: couponId, userUsage: { $elemMatch: { user: userId, count: { $gt: 0 } } } },
    [
      {
        $set: {
          usageCount: { $max: [0, { $subtract: [{ $ifNull: ["$usageCount", 0] }, 1] }] },
          userUsage: {
            $map: {
              input: userUsages,
              as: "usage",
              in: {
                $cond: [
                  { $eq: ["$$usage.user", userId] },
                  { $mergeObjects: ["$$usage", { count: { $max: [0, { $subtract: ["$$usage.count", 1] }] } }] },
                  "$$usage",
                ],
              },
            },
          },
        },
      },
    ],
    { updatePipeline: true }
  );
}
