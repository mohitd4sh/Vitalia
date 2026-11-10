import mongoose from "mongoose";

const supportMessageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["patient", "admin"], required: true },
    senderName: { type: String, required: true, trim: true, maxlength: 100 },
    body: { type: String, required: true, trim: true, maxlength: 3000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const supportConversationSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 100 },
    status: { type: String, enum: ["open", "awaiting_patient", "closed"], default: "open", index: true },
    messages: {
      type: [supportMessageSchema],
      validate: (messages) => messages.length > 0 && messages.length <= 200,
    },
    lastMessageAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

supportConversationSchema.index({ patient: 1, lastMessageAt: -1 });
supportConversationSchema.index({ status: 1, lastMessageAt: -1 });

export default mongoose.model("SupportConversation", supportConversationSchema);
