import Notification from "../models/Notification.js";
import User from "../models/User.js";

export async function notifyUser(recipient, notification) {
  if (!recipient) return;
  try {
    await Notification.create({ ...notification, recipient });
  } catch (error) {
    console.error("Notification create error:", error.message);
  }
}

export async function notifyCenterTeam(centerId, notification) {
  try {
    const team = await User.find({
      active: true,
      $or: [
        { role: "admin" },
        { role: "center_master", assignedCenter: centerId },
        { role: "staff", assignedCenter: centerId },
        { role: "custom", assignedCenter: centerId },
      ],
    }).select("_id").lean();
    if (team.length) {
      await Notification.insertMany(team.map(({ _id }) => ({ ...notification, recipient: _id })));
    }
  } catch (error) {
    console.error("Center team notification error:", error.message);
  }
}
