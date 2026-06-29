const { resolveCompanyDb } = require('../modules/dynamic-db/dbResolver');
const { sendForbidden } = require('../utils/responseHelper');

/**
 * Factory that returns a middleware checking whether the authenticated user
 * holds a specific permission flag.
 *
 * Admins are always granted access.
 * Executives must have the permission row with the given flag set to true.
 *
 * Usage:
 *   router.get('/something', authenticate, requirePermission('can_view_reports'), handler)
 */
const requirePermission = (permissionKey) => async (req, res, next) => {
  try {
    if (req.user?.role === 'ADMIN') {
      return next(); // Admins have full access
    }

    const db = await resolveCompanyDb(req.companySlug);
    const permRow = await db.executivePermission.findUnique({
      where: { executive_id: req.user.sub },
    });

    if (!permRow || !permRow[permissionKey]) {
      return sendForbidden(res, `Permission denied: ${permissionKey} is required`);
    }

    // Cache permissions on req so downstream handlers can inspect without extra DB call
    req.permissions = permRow;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { requirePermission };
