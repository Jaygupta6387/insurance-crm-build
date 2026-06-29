const nodemailer = require('nodemailer');
const { mail } = require('../../config/env');
const logger = require('../../config/logger');

let transporter = null;

/**
 * Lazy-initialised Nodemailer transporter (Gmail SMTP).
 * Returns the singleton; creates it on first call.
 */
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: mail.smtpHost,
      port: mail.smtpPort,
      secure: mail.smtpSecure,
      auth: { user: mail.smtpUser, pass: mail.smtpPass },
    });
    logger.debug('Nodemailer transporter initialised');
  }
  return transporter;
};

/**
 * Core send function — wraps nodemailer.sendMail with error logging.
 */
const sendMail = async ({ to, subject, html }) => {
  try {
    const info = await getTransporter().sendMail({
      from: `"${mail.fromName}" <${mail.fromAddress}>`,
      to,
      subject,
      html,
    });
    logger.debug(`Email sent to ${to} — messageId: ${info.messageId}`);
    return info;
  } catch (err) {
    logger.error(`Failed to send email to ${to}: ${err.message}`);
    throw err;
  }
};

// ─── Email Templates ──────────────────────────────────────────────────────────

/**
 * Sends welcome email with initial credentials to a newly created employee.
 */
const sendEmployeeCredentials = async ({ to, fullName, companyName, email, tempPassword }) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f4f5f7; margin:0; padding:40px 0;">
      <div style="max-width:520px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%); padding:32px 40px;">
          <h1 style="color:#fff; margin:0; font-size:24px; font-weight:700;">Welcome to ${companyName} CRM</h1>
        </div>
        <div style="padding:40px;">
          <p style="color:#374151; font-size:15px; margin-top:0;">Hi <strong>${fullName}</strong>,</p>
          <p style="color:#6b7280; font-size:14px; line-height:1.6;">
            Your CRM account has been created. Use the credentials below to log in for the first time.
            You will be asked to set a new password on your first login.
          </p>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:20px; margin:24px 0;">
            <p style="margin:0 0 8px; color:#6b7280; font-size:12px; text-transform:uppercase; letter-spacing:0.05em; font-weight:600;">Your Credentials</p>
            <p style="margin:4px 0; font-size:14px; color:#1e293b;"><strong>Email:</strong> ${email}</p>
            <p style="margin:4px 0; font-size:14px; color:#1e293b;"><strong>Temporary Password:</strong> <code style="background:#e2e8f0; padding:2px 6px; border-radius:4px; font-family:monospace;">${tempPassword}</code></p>
          </div>
          <p style="color:#ef4444; font-size:13px;">⚠️ Do not share these credentials with anyone.</p>
          <a href="${mail.resetPasswordUrl}" style="display:inline-block; background:#0f172a; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-size:14px; font-weight:600; margin-top:8px;">
            Go to CRM Login →
          </a>
          <p style="color:#9ca3af; font-size:12px; margin-top:32px; border-top:1px solid #f3f4f6; padding-top:16px;">
            This is an automated message. If you did not expect this email, please contact your administrator.
          </p>
        </div>
      </div>
    </body>
    </html>`;

  return sendMail({ to, subject: `Your CRM account has been created — ${companyName}`, html });
};

/**
 * Sends a password reset link to the user.
 */
const sendPasswordResetEmail = async ({ to, fullName, companySlug, rawToken }) => {
  const resetUrl = `${mail.resetPasswordUrl}/${companySlug}/reset-password?token=${rawToken}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f4f5f7; margin:0; padding:40px 0;">
      <div style="max-width:520px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.08);">
        <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%); padding:32px 40px;">
          <h1 style="color:#fff; margin:0; font-size:24px; font-weight:700;">Reset Your Password</h1>
        </div>
        <div style="padding:40px;">
          <p style="color:#374151; font-size:15px; margin-top:0;">Hi <strong>${fullName}</strong>,</p>
          <p style="color:#6b7280; font-size:14px; line-height:1.6;">
            We received a request to reset your CRM password. Click the button below to choose a new password.
            This link is valid for <strong>1 hour</strong>.
          </p>
          <a href="${resetUrl}" style="display:inline-block; background:#0f172a; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-size:14px; font-weight:600; margin:24px 0;">
            Reset Password →
          </a>
          <p style="color:#6b7280; font-size:13px;">Or copy this link:<br>
            <span style="color:#3b82f6; word-break:break-all;">${resetUrl}</span>
          </p>
          <p style="color:#9ca3af; font-size:12px; margin-top:32px; border-top:1px solid #f3f4f6; padding-top:16px;">
            If you did not request a password reset, you can safely ignore this email.
          </p>
        </div>
      </div>
    </body>
    </html>`;

  return sendMail({ to, subject: 'Password Reset Request — CRM Platform', html });
};

module.exports = { sendEmployeeCredentials, sendPasswordResetEmail };
