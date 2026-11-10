import nodemailer from "nodemailer";

function getTransport() {
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !password) {
    throw new Error("SMTP_USER and SMTP_APP_PASSWORD must be configured to send password reset emails.");
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: password },
  });
}

export async function sendPasswordResetEmail(email) {
  const appUrl = process.env.PASSWORD_RESET_URL || process.env.CLIENT_URL || "http://localhost:5173";
  const resetUrl = new URL("/reset-password", appUrl);
  resetUrl.searchParams.set("token", email.token);
  const htmlUrl = resetUrl.href.replaceAll("&", "&amp;").replaceAll("\"", "&quot;");

  await getTransport().sendMail({
    from: process.env.SMTP_USER,
    to: email.address,
    subject: "Reset your VITALIA password",
    text: `A password change was authorized for your VITALIA account. Choose a new password using this one-time link, valid for 30 minutes: ${resetUrl.href}\n\nIf you did not request this change, contact an administrator.`,
    html: `<p>A password change was authorized for your VITALIA account.</p><p><a href="${htmlUrl}">Choose a new password</a></p><p>This one-time link expires in 30 minutes. If you did not request this change, contact an administrator.</p>`,
  });
}
