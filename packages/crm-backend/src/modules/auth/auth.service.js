const bcryptjs = require('bcryptjs');
const { resolveCompanyDb } = require('../dynamic-db/dbResolver');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  buildTokenPayload,
} = require('../../utils/tokenHelper');
const { generateRawToken, hashToken } = require('../../utils/cryptoHelper');
const { bcryptRounds } = require('../../config/env');
const { sendPasswordResetEmail } = require('../mail/mailService');
const { audit } = require('../audit/auditService');
const logger = require('../../config/logger');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ONE_HOUR_MS = 60 * 60 * 1000;

const sanitizeUser = (user) => {
  const { password_hash, ...safe } = user;
  return safe;
};

// ─── Service Methods ──────────────────────────────────────────────────────────

/**
 * Authenticates a user against their company database.
 * Returns { accessToken, refreshToken, user }.
 */
const login = async (email, password, companySlug, ipAddress) => {
  const db = await resolveCompanyDb(companySlug); // validates subscription + block

  const user = await db.user.findUnique({ where: { email } });

  if (!user) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
  }

  if (!user.is_active) {
    throw Object.assign(new Error('Your account has been deactivated. Contact your administrator.'), {
      statusCode: 403,
    });
  }

  if (user.is_blocked) {
    throw Object.assign(new Error('Your account has been blocked. Contact your administrator.'), {
      statusCode: 403,
    });
  }

  const passwordMatch = await bcryptjs.compare(password, user.password_hash);
  if (!passwordMatch) {
    await audit(companySlug, { userId: user.id, action: 'LOGIN_FAILED', ipAddress });
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
  }

  // Update last_login timestamp
  await db.user.update({ where: { id: user.id }, data: { last_login: new Date() } });

  // Load permissions for executives
  let permissions = null;
  if (user.role === 'EXECUTIVE') {
    permissions = await db.executivePermission.findUnique({
      where: { executive_id: user.id },
    });
  }

  const payload = buildTokenPayload(user, companySlug);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await audit(companySlug, { userId: user.id, action: 'LOGIN_SUCCESS', ipAddress });

  return {
    accessToken,
    refreshToken,
    user: sanitizeUser({ ...user, permissions }),
  };
};

/**
 * Returns the authenticated user's profile including permissions.
 */
const getMe = async (userId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const user = await db.user.findUnique({
    where: { id: userId },
    include: { permissions: true },
  });

  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

  return sanitizeUser(user);
};

/**
 * Rotates the access token using a valid refresh token cookie.
 * Returns a new { accessToken, refreshToken }.
 */
const refreshTokens = async (rawRefreshToken) => {
  let decoded;
  try {
    decoded = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw Object.assign(new Error('Refresh token is invalid or expired — please log in again'), {
      statusCode: 401,
    });
  }

  // Re-validate company status on every refresh
  const db = await resolveCompanyDb(decoded.company_slug);

  // Fetch fresh user data
  const user = await db.user.findUnique({
    where: { id: decoded.sub },
  });

  if (!user || !user.is_active || user.is_blocked) {
    throw Object.assign(new Error('User account is no longer active'), { statusCode: 401 });
  }

  // Load permissions for executives
  let permissions = null;
  if (user.role === 'EXECUTIVE') {
    permissions = await db.executivePermission.findUnique({
      where: { executive_id: user.id },
    });
  }

  const payload = {
    sub: decoded.sub,
    email: decoded.email,
    role: decoded.role,
    company_slug: decoded.company_slug,
    full_name: decoded.full_name,
  };

  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: sanitizeUser({ ...user, permissions }),
  };
};

/**
 * Initiates a password reset: generates a secure token, stores its hash, sends email.
 * Always returns success (even if user not found) to avoid user enumeration.
 */
const forgotPassword = async (email, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    // Return silently — do not leak whether an email exists
    return;
  }

  // Invalidate any existing unused tokens for this user
  await db.passwordResetToken.updateMany({
    where: { user_id: user.id, used: false },
    data: { used: true },
  });

  const rawToken = generateRawToken(32);
  const hashedToken = hashToken(rawToken);

  await db.passwordResetToken.create({
    data: {
      user_id: user.id,
      token: hashedToken,
      expires_at: new Date(Date.now() + ONE_HOUR_MS),
    },
  });

  await sendPasswordResetEmail({
    to: user.email,
    fullName: user.full_name,
    companySlug,
    rawToken,
  });

  logger.debug(`Password reset email sent to ${email} for company ${companySlug}`);
};

/**
 * Validates a reset token and updates the user's password.
 */
const resetPassword = async (rawToken, newPassword, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const hashedToken = hashToken(rawToken);

  const tokenRecord = await db.passwordResetToken.findUnique({
    where: { token: hashedToken },
    include: { user: true },
  });

  if (!tokenRecord || tokenRecord.used) {
    throw Object.assign(new Error('Invalid or expired reset token'), { statusCode: 400 });
  }

  if (new Date() > new Date(tokenRecord.expires_at)) {
    throw Object.assign(new Error('Reset token has expired — please request a new one'), {
      statusCode: 400,
    });
  }

  const newHash = await bcryptjs.hash(newPassword, bcryptRounds);

  await db.$transaction([
    db.user.update({
      where: { id: tokenRecord.user_id },
      data: { password_hash: newHash, must_change_password: false },
    }),
    db.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { used: true },
    }),
  ]);

  await audit(companySlug, {
    userId: tokenRecord.user_id,
    action: 'PASSWORD_RESET',
  });
};

/**
 * Handles the forced first-login password change.
 * Verifies current password before setting the new one.
 */
const changeFirstPassword = async (userId, currentPassword, newPassword, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

  if (!user.must_change_password) {
    throw Object.assign(new Error('Password change is not required for this account'), {
      statusCode: 400,
    });
  }

  const match = await bcryptjs.compare(currentPassword, user.password_hash);
  if (!match) {
    throw Object.assign(new Error('Current password is incorrect'), { statusCode: 400 });
  }

  const newHash = await bcryptjs.hash(newPassword, bcryptRounds);

  await db.user.update({
    where: { id: userId },
    data: { password_hash: newHash, must_change_password: false },
  });

  await audit(companySlug, { userId, action: 'FIRST_PASSWORD_CHANGE' });
};

module.exports = {
  login,
  getMe,
  refreshTokens,
  forgotPassword,
  resetPassword,
  changeFirstPassword,
};
