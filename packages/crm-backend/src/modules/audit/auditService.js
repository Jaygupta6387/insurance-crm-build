const { resolveCompanyDb } = require('../dynamic-db/dbResolver');
const logger = require('../../config/logger');

/**
 * Records an action to the company's audit_logs table.
 * Non-blocking — errors are swallowed so audit failures never break the main flow.
 */
const audit = async (companySlug, { userId, action, entityType, entityId, metadata, ipAddress }) => {
  try {
    const db = await resolveCompanyDb(companySlug);
    await db.auditLog.create({
      data: {
        user_id: userId || null,
        action,
        entity_type: entityType || null,
        entity_id: entityId || null,
        metadata: metadata || null,
        ip_address: ipAddress || null,
      },
    });
  } catch (err) {
    logger.warn(`Audit log write failed for "${action}" in company "${companySlug}": ${err.message}`);
  }
};

module.exports = { audit };
