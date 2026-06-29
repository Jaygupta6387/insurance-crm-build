const { resolveCompanyDb } = require('../dynamic-db/dbResolver');
const { audit } = require('../audit/auditService');

/**
 * Gets the permission row for an executive.
 * Admin callers receive a synthetic all-true object.
 */
const getPermissions = async (executiveId, companySlug, callerRole) => {
  if (callerRole === 'ADMIN') {
    // Admins implicitly have all permissions
    return buildAdminPermissions(executiveId);
  }

  const db = await resolveCompanyDb(companySlug);
  const perms = await db.executivePermission.findUnique({
    where: { executive_id: executiveId },
  });

  if (!perms) throw Object.assign(new Error('Permissions not found for this user'), { statusCode: 404 });

  return perms;
};

/**
 * Updates permission flags for an executive.
 * Only admins can call this.
 */
const updatePermissions = async (executiveId, data, adminId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  // Ensure target is an executive
  const user = await db.user.findFirst({ where: { id: executiveId, role: 'EXECUTIVE' } });
  if (!user) throw Object.assign(new Error('Executive not found'), { statusCode: 404 });

  const perms = await db.executivePermission.upsert({
    where: { executive_id: executiveId },
    update: data,
    create: { executive_id: executiveId, ...data },
  });

  await audit(companySlug, {
    userId: adminId,
    action: 'UPDATE_PERMISSIONS',
    entityType: 'PERMISSION',
    entityId: executiveId,
    metadata: data,
  });

  return perms;
};

// ─── Internal ─────────────────────────────────────────────────────────────────

const buildAdminPermissions = (userId) => ({
  executive_id: userId,
  can_view_customers: true,
  can_create_customer: true,
  can_edit_customer: true,
  can_delete_customer: true,
  can_create_policy: true,
  can_edit_policy: true,
  can_delete_policy: true,
  can_manage_policy_commission: true,
  can_manage_claims: true,
  can_create_employee: true,
  can_edit_employee: true,
  can_delete_employee: true,
  can_view_reports: true,
});

module.exports = { getPermissions, updatePermissions };
