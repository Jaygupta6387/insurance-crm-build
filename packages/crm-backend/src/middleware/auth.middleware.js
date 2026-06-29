const { verifyAccessToken } = require('../utils/tokenHelper');
const { sendUnauthorized, sendForbidden } = require('../utils/responseHelper');
const { validateCompanyStatus } = require('../modules/dynamic-db/dbResolver');

/**
 * Validates the JWT Bearer token in the Authorization header.
 * Attaches decoded payload to req.user and req.companySlug on success.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendUnauthorized(res, 'No token provided');
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    req.companySlug = decoded.company_slug;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendUnauthorized(res, 'Token has expired');
    }
    return sendUnauthorized(res, 'Invalid token');
  }
};

/**
 * Re-validates company subscription + blocked status on every protected request.
 * Must be used AFTER authenticate (needs req.companySlug).
 * Prevents users with a valid JWT from accessing the CRM after their subscription expires.
 */
const validateSubscription = async (req, res, next) => {
  try {
    await validateCompanyStatus(null, req.companySlug);
    next();
  } catch (err) {
    const status = err.statusCode || 403;
    return res.status(status).json({ success: false, message: err.message });
  }
};

/**
 * Restricts a route to users who have the ADMIN role.
 * Must be used after `authenticate`.
 */
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return sendForbidden(res, 'Admin access required');
  }
  next();
};

module.exports = { authenticate, validateSubscription, requireAdmin };
