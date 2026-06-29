const logger = require('../config/logger');

/**
 * Centralised error handler — must be registered last in Express middleware chain.
 * Handles Prisma errors, JWT errors, Zod errors, and generic errors.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Respect statusCode set by the resolver or service layers
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = [];

  // Prisma known request errors
  if (err.code) {
    switch (err.code) {
      case 'P2002': {
        const field = err.meta?.target?.[0] || 'field';
        statusCode = 409;
        message = `A record with this ${field} already exists`;
        break;
      }
      case 'P2025':
        statusCode = 404;
        message = 'Record not found';
        break;
      case 'P2003':
        statusCode = 400;
        message = 'Related record not found (foreign key constraint failed)';
        break;
      default:
        statusCode = 500;
        message = 'Database operation failed';
        logger.error(`Unhandled Prisma error code: ${err.code}`, { message: err.message, meta: err.meta });
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Log server errors
  if (statusCode >= 500) {
    logger.error(`[${req.method}] ${req.path} — ${message}`, { stack: err.stack });
  }

  res.status(statusCode).json({ success: false, message, errors });
};

module.exports = errorHandler;
