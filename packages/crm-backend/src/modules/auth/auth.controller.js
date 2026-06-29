const authService = require('./auth.service');
const asyncWrapper = require('../../utils/asyncWrapper');
const {
  sendSuccess,
  sendError,
} = require('../../utils/responseHelper');
const { refreshCookieOptions } = require('../../utils/tokenHelper');
const { isDesktopMode } = require('../dynamic-db/dbResolver');

const REFRESH_COOKIE_NAME = 'crm_refresh_token';
const desktopSlug = () => process.env.DESKTOP_COMPANY_SLUG || 'local';

// ─── Login ────────────────────────────────────────────────────────────────────

const login = asyncWrapper(async (req, res) => {
  const { email, password, company_slug } = req.body;
  const ipAddress = req.ip;
  const slug = company_slug || (isDesktopMode() ? desktopSlug() : company_slug);

  const { accessToken, refreshToken, user } = await authService.login(
    email,
    password,
    slug,
    ipAddress
  );

  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(expires));

  sendSuccess(res, { accessToken, user }, 'Login successful');
});

// ─── Refresh Token ────────────────────────────────────────────────────────────

const refresh = asyncWrapper(async (req, res) => {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!rawRefreshToken) {
    return sendError(res, 'No refresh token — please log in', 401);
  }

  const { accessToken, refreshToken, user } = await authService.refreshTokens(rawRefreshToken);

  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(expires));

  sendSuccess(res, { accessToken, user }, 'Token refreshed');
});

// ─── Get Me ───────────────────────────────────────────────────────────────────

const getMe = asyncWrapper(async (req, res) => {
  const user = await authService.getMe(req.user.sub, req.companySlug);
  sendSuccess(res, { user });
});

// ─── Forgot Password ──────────────────────────────────────────────────────────

const forgotPassword = asyncWrapper(async (req, res) => {
  const { email, company_slug } = req.body;
  const slug = company_slug || (isDesktopMode() ? desktopSlug() : company_slug);
  await authService.forgotPassword(email, slug);
  sendSuccess(
    res,
    {},
    'If that email is registered, a password reset link has been sent.'
  );
});

// ─── Reset Password ───────────────────────────────────────────────────────────

const resetPassword = asyncWrapper(async (req, res) => {
  const { token, password, company_slug } = req.body;
  const slug = company_slug || (isDesktopMode() ? desktopSlug() : company_slug);
  await authService.resetPassword(token, password, slug);
  sendSuccess(res, {}, 'Password reset successfully. You can now log in.');
});

// ─── Change First Password ────────────────────────────────────────────────────

const changeFirstPassword = asyncWrapper(async (req, res) => {
  const { current_password, new_password } = req.body;
  await authService.changeFirstPassword(
    req.user.sub,
    current_password,
    new_password,
    req.companySlug
  );
  sendSuccess(res, {}, 'Password changed successfully.');
});

// ─── Logout ───────────────────────────────────────────────────────────────────

const logout = asyncWrapper(async (req, res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  sendSuccess(res, {}, 'Logged out successfully.');
});

module.exports = { login, refresh, getMe, forgotPassword, resetPassword, changeFirstPassword, logout };
