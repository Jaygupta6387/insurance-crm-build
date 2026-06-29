const rateLimit = require('express-rate-limit');
const { rateLimit: rateLimitConfig, isDev } = require('../config/env');

/** General rate limiter applied to all routes (disabled in development). */
const generalLimiter = rateLimit({
  windowMs: rateLimitConfig.windowMs,
  max: rateLimitConfig.max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
  message: {
    success: false,
    message: 'Too many requests — please try again later.',
  },
});

/** Stricter limiter for authentication endpoints (login, forgot-password). */
const authLimiter = rateLimit({
  windowMs: rateLimitConfig.windowMs,
  max: rateLimitConfig.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts — please try again in 15 minutes.',
  },
  skipSuccessfulRequests: true,
});

module.exports = { generalLimiter, authLimiter };
