const rateLimit = require('express-rate-limit');
const { rateLimit: rateLimitConfig, isDev, crmMode } = require('../config/env');

const isDesktopMode = () => crmMode === 'desktop';

/** General rate limiter — disabled for local desktop (single user on 127.0.0.1). */
const generalLimiter = rateLimit({
  windowMs: rateLimitConfig.windowMs,
  max: isDesktopMode() ? 10_000 : rateLimitConfig.max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev || isDesktopMode(),
  message: {
    success: false,
    message: 'Too many requests — please try again later.',
  },
});

/** Stricter limiter for authentication endpoints (login, forgot-password). */
const authLimiter = rateLimit({
  windowMs: rateLimitConfig.windowMs,
  max: isDesktopMode() ? 200 : rateLimitConfig.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
  message: {
    success: false,
    message: 'Too many authentication attempts — please try again in 15 minutes.',
  },
  skipSuccessfulRequests: true,
});

module.exports = { generalLimiter, authLimiter };
