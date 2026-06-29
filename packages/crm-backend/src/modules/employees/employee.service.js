const bcryptjs = require('bcryptjs');
const { resolveCompanyDb } = require('../dynamic-db/dbResolver');
const { generateRawToken } = require('../../utils/cryptoHelper');
const { bcryptRounds } = require('../../config/env');
const { sendEmployeeCredentials } = require('../mail/mailService');
const { audit } = require('../audit/auditService');
const { getSuperAdminClient } = require('../../prisma/superAdminClient');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sanitizeUser = (user) => {
  const { password_hash, ...safe } = user;
  return safe;
};

/**
 * Generates a readable temporary password: Abc@12345
 */
const generateTempPassword = () => {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '@#$!';
  const rest = 'abcdefghjkmnpqrstuvwxyz0123456789';

  let pass =
    upper[Math.floor(Math.random() * upper.length)] +
    lower[Math.floor(Math.random() * lower.length)] +
    special[Math.floor(Math.random() * special.length)] +
    digits[Math.floor(Math.random() * digits.length)];

  for (let i = 0; i < 6; i++) {
    pass += rest[Math.floor(Math.random() * rest.length)];
  }

  return pass
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
};

// ─── Service Methods ──────────────────────────────────────────────────────────

/**
 * Creates a new employee in the company DB.
 * Generates a temporary password, sends credentials via email.
 */
const createEmployee = async (data, adminId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  // Prevent duplicate emails
  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw Object.assign(new Error('An employee with this email already exists'), { statusCode: 409 });
  }

  // Prevent creating another admin via this route
  const admin = await db.user.findFirst({ where: { role: 'ADMIN' } });
  if (admin && data.email === admin.email) {
    throw Object.assign(new Error('Cannot create an employee with the admin email'), {
      statusCode: 409,
    });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcryptjs.hash(tempPassword, bcryptRounds);

  // Look up company name for the welcome email
  const superAdmin = getSuperAdminClient();
  const company = await superAdmin.company.findUnique({ where: { subdomain: companySlug } });

  const employee = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        full_name: data.full_name,
        email: data.email,
        phone: data.phone || null,
        password_hash: passwordHash,
        role: 'EXECUTIVE',
        must_change_password: true,
        created_by: adminId,
      },
    });

    // Create default (all-false) permission row for the new executive
    await tx.executivePermission.create({
      data: { executive_id: user.id },
    });

    return user;
  });

  // Send welcome email — non-blocking
  sendEmployeeCredentials({
    to: employee.email,
    fullName: employee.full_name,
    companyName: company?.subdomain || companySlug,
    email: employee.email,
    tempPassword,
  }).catch((err) => console.error('Failed to send employee credentials email:', err.message));

  await audit(companySlug, {
    userId: adminId,
    action: 'CREATE_EMPLOYEE',
    entityType: 'USER',
    entityId: employee.id,
    metadata: { email: employee.email },
  });

  return sanitizeUser(employee);
};

/**
 * Lists all executives (employees) for a company.
 */
const getEmployees = async (companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const employees = await db.user.findMany({
    where: { role: 'EXECUTIVE' },
    include: { permissions: true },
    orderBy: { created_at: 'desc' },
  });

  return employees.map(sanitizeUser);
};

/**
 * Gets a single employee by ID.
 */
const getEmployee = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const employee = await db.user.findFirst({
    where: { id, role: 'EXECUTIVE' },
    include: { permissions: true },
  });

  if (!employee) {
    throw Object.assign(new Error('Employee not found'), { statusCode: 404 });
  }

  return sanitizeUser(employee);
};

/**
 * Updates an employee's profile fields.
 */
const updateEmployee = async (id, data, adminId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const employee = await db.user.findFirst({ where: { id, role: 'EXECUTIVE' } });
  if (!employee) throw Object.assign(new Error('Employee not found'), { statusCode: 404 });

  const updated = await db.user.update({
    where: { id },
    data: {
      ...(data.full_name !== undefined && { full_name: data.full_name }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
    },
  });

  await audit(companySlug, {
    userId: adminId,
    action: 'UPDATE_EMPLOYEE',
    entityType: 'USER',
    entityId: id,
    metadata: data,
  });

  return sanitizeUser(updated);
};

/**
 * Blocks an employee (prevents login).
 */
const blockEmployee = async (id, adminId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const employee = await db.user.findFirst({ where: { id, role: 'EXECUTIVE' } });
  if (!employee) throw Object.assign(new Error('Employee not found'), { statusCode: 404 });

  await db.user.update({ where: { id }, data: { is_blocked: true } });

  await audit(companySlug, {
    userId: adminId,
    action: 'BLOCK_EMPLOYEE',
    entityType: 'USER',
    entityId: id,
  });
};

/**
 * Unblocks an employee.
 */
const unblockEmployee = async (id, adminId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const employee = await db.user.findFirst({ where: { id, role: 'EXECUTIVE' } });
  if (!employee) throw Object.assign(new Error('Employee not found'), { statusCode: 404 });

  await db.user.update({ where: { id }, data: { is_blocked: false } });

  await audit(companySlug, {
    userId: adminId,
    action: 'UNBLOCK_EMPLOYEE',
    entityType: 'USER',
    entityId: id,
  });
};

/**
 * Permanently deletes an employee and their associated data.
 */
const deleteEmployee = async (id, adminId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const employee = await db.user.findFirst({ where: { id, role: 'EXECUTIVE' } });
  if (!employee) throw Object.assign(new Error('Employee not found'), { statusCode: 404 });

  await db.user.delete({ where: { id } });

  await audit(companySlug, {
    userId: adminId,
    action: 'DELETE_EMPLOYEE',
    entityType: 'USER',
    entityId: id,
    metadata: { email: employee.email },
  });
};

module.exports = {
  createEmployee,
  getEmployees,
  getEmployee,
  updateEmployee,
  blockEmployee,
  unblockEmployee,
  deleteEmployee,
};
