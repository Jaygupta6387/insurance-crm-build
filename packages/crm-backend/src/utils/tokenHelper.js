const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config/env');

/**
 * Signs and returns a short-lived access token.
 */
const signAccessToken = (payload) =>
  jwt.sign(payload, jwtConfig.accessSecret, { expiresIn: jwtConfig.accessExpiresIn });

/**
 * Signs and returns a long-lived refresh token.
 */
const signRefreshToken = (payload) =>
  jwt.sign(payload, jwtConfig.refreshSecret, { expiresIn: jwtConfig.refreshExpiresIn });

/**
 * Verifies an access token; throws if invalid/expired.
 */
const verifyAccessToken = (token) => jwt.verify(token, jwtConfig.accessSecret);

/**
 * Verifies a refresh token; throws if invalid/expired.
 */
const verifyRefreshToken = (token) => jwt.verify(token, jwtConfig.refreshSecret);

/**
 * Builds the standard JWT payload from a user + company context.
 */
const buildTokenPayload = (user, companySlug) => ({
  sub: user.id,
  email: user.email,
  role: user.role,
  company_slug: companySlug,
  full_name: user.full_name,
});

const isDesktopMode = () => process.env.CRM_MODE === 'desktop';

/**
 * Cookie options for the httpOnly refresh token.
 * Desktop serves over http://127.0.0.1 — Secure cookies are dropped by the browser.
 */
const refreshCookieOptions = (expires) => ({
  httpOnly: true,
  secure: !isDesktopMode() && process.env.NODE_ENV === 'production',
  sameSite: isDesktopMode() ? 'lax' : 'strict',
  path: '/',
  expires,
});

const clearRefreshCookieOptions = () => ({
  httpOnly: true,
  secure: !isDesktopMode() && process.env.NODE_ENV === 'production',
  sameSite: isDesktopMode() ? 'lax' : 'strict',
  path: '/',
});

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  buildTokenPayload,
  refreshCookieOptions,
  clearRefreshCookieOptions,
};
