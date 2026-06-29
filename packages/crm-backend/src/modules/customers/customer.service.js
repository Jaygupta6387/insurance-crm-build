const { resolveCompanyDb } = require('../dynamic-db/dbResolver');
const { audit } = require('../audit/auditService');

// ─── Customer Code Generator ──────────────────────────────────────────────────
const generateCustomerCode = async (db) => {
  const year = new Date().getFullYear();
  const prefix = `CUS-${year}-`;

  const last = await db.customer.findFirst({
    where: { customer_code: { startsWith: prefix } },
    orderBy: { customer_code: 'desc' },
    select: { customer_code: true },
  });

  const seq = last ? parseInt(last.customer_code.replace(prefix, ''), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(6, '0')}`;
};

// ─── Family Code Generator ────────────────────────────────────────────────────
const buildFamilyCode = (name, phone) => {
  const namePart = name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4).padEnd(4, 'X');
  const phonePart = phone.replace(/\D/g, '').slice(0, 6).padEnd(6, '0');
  return `${namePart}${phonePart}`;
};

// ─── Build where clause for filtered queries ──────────────────────────────────
const buildWhereClause = (filters, isAdmin, userId) => {
  const where = { deleted_at: null };

  if (filters.search) {
    where.OR = [
      { customer_name: { contains: filters.search, mode: 'insensitive' } },
      { customer_email: { contains: filters.search, mode: 'insensitive' } },
      { customer_phone: { contains: filters.search } },
      { customer_code: { contains: filters.search, mode: 'insensitive' } },
      { pan_card: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters.phone)         where.customer_phone = { contains: filters.phone };
  if (filters.pan)           where.pan_card = { contains: filters.pan.toUpperCase() };
  if (filters.family_code)   where.family_code = filters.family_code.toUpperCase();
  if (filters.customer_code) where.customer_code = { contains: filters.customer_code.toUpperCase() };
  if (filters.status)        where.status = filters.status;

  return where;
};

// ─── Service Methods ──────────────────────────────────────────────────────────

const generateFamilyCode = async (name, phone, companySlug) => {
  return buildFamilyCode(name, phone);
};

/** Resolve display name for the family head (falls back to earliest member). */
const resolveFamilyHeadName = async (db, familyCode) => {
  const code = familyCode.toUpperCase();
  const head = await db.customer.findFirst({
    where: { family_code: code, is_family_head: true, deleted_at: null },
    select: { customer_name: true },
    orderBy: { created_at: 'asc' },
  });
  if (head) return head.customer_name;

  const fallback = await db.customer.findFirst({
    where: { family_code: code, deleted_at: null },
    select: { customer_name: true },
    orderBy: { created_at: 'asc' },
  });
  return fallback?.customer_name ?? null;
};

const searchFamilyCodes = async (q, companySlug, limit = 10) => {
  const db = await resolveCompanyDb(companySlug);
  const prefix = q.trim().toUpperCase();
  if (!prefix || prefix.length < 2) return [];

  const distinctRows = await db.customer.findMany({
    where: {
      deleted_at: null,
      family_code: { not: null, startsWith: prefix },
    },
    distinct: ['family_code'],
    select: { family_code: true },
    take: limit,
    orderBy: { family_code: 'asc' },
  });

  const codes = distinctRows.map((r) => r.family_code).filter(Boolean);
  if (!codes.length) return [];

  const heads = await db.customer.findMany({
    where: {
      family_code: { in: codes },
      is_family_head: true,
      deleted_at: null,
    },
    select: { family_code: true, customer_name: true },
  });
  const headByCode = Object.fromEntries(heads.map((h) => [h.family_code, h.customer_name]));

  const missing = codes.filter((c) => !headByCode[c]);
  if (missing.length) {
    const fallbacks = await db.customer.findMany({
      where: { family_code: { in: missing }, deleted_at: null },
      select: { family_code: true, customer_name: true },
      orderBy: { created_at: 'asc' },
    });
    for (const row of fallbacks) {
      if (!headByCode[row.family_code]) headByCode[row.family_code] = row.customer_name;
    }
  }

  return codes.map((code) => ({
    family_code: code,
    family_head_name: headByCode[code] ?? null,
  }));
};

const lookupFamilyCode = async (code, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const upper = code.toUpperCase();
  const exists = await db.customer.findFirst({
    where: { family_code: upper, deleted_at: null },
    select: { family_code: true },
  });
  if (!exists) return null;

  const [family_head_name, member_count] = await Promise.all([
    resolveFamilyHeadName(db, upper),
    db.customer.count({ where: { family_code: upper, deleted_at: null } }),
  ]);

  return { family_code: upper, family_head_name, member_count };
};

const createCustomer = async (data, creatorId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  // Duplicate check: same phone OR same (name + phone) combination
  const duplicate = await db.customer.findFirst({
    where: {
      OR: [
        { customer_phone: data.customer_phone },
        {
          customer_name: { equals: data.customer_name, mode: 'insensitive' },
          customer_phone: data.customer_phone,
        },
      ],
    },
    select: { customer_code: true, customer_name: true, customer_phone: true },
  });
  if (duplicate) {
    const err = new Error(
      `Customer already exists with phone ${duplicate.customer_phone} (${duplicate.customer_name} — ${duplicate.customer_code})`
    );
    err.statusCode = 409;
    throw err;
  }

  const customer_code = await generateCustomerCode(db);

  // Auto-generate family code if not provided
  let family_code = data.family_code
    ? data.family_code.toUpperCase()
    : buildFamilyCode(data.customer_name, data.customer_phone);

  const customer = await db.customer.create({
    data: {
      customer_code,
      family_code,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      customer_email: data.customer_email || null,
      customer_dob: data.customer_dob || null,
      age: data.age ?? null,
      customer_priority: data.customer_priority || 'MEDIUM',
      customer_since: data.customer_since || null,
      is_family_head: data.is_family_head ?? false,
      family_relation: data.family_relation || null,
      height: data.height ?? null,
      weight: data.weight ?? null,
      blood_group: data.blood_group || null,
      has_ped: data.has_ped ?? false,
      ped_details: data.ped_details || null,
      house_no: data.house_no || null,
      area: data.area || null,
      city: data.city || null,
      state: data.state || null,
      country: data.country || 'India',
      pincode: data.pincode || null,
      pan_card: data.pan_card || null,
      aadhar_card: data.aadhar_card || null,
      referred_by_type: data.referred_by_type || null,
      referred_by_sub_broker_id: data.referred_by_sub_broker_id || null,
      referred_by_customer_id: data.referred_by_customer_id || null,
      created_by: creatorId,
      updated_by: creatorId,
      status: data.status || 'ACTIVE',
    },
    include: {
      creator: { select: { id: true, full_name: true, email: true } },

    },
  });

  await audit(companySlug, {
    userId: creatorId,
    action: 'CREATE_CUSTOMER',
    entityType: 'CUSTOMER',
    entityId: customer.id,
    metadata: { customer_code, customer_name: data.customer_name },
  });

  return customer;
};

const getCustomers = async (filters, userId, isAdmin, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  const where = buildWhereClause(filters, isAdmin, userId);

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [filters.sort_by || 'created_at']: filters.sort_order || 'desc' },
      include: {
        creator: { select: { id: true, full_name: true } },
        _count: { select: { documents: true, bank_accounts: true } },
      },
    }),
    db.customer.count({ where }),
  ]);

  return {
    customers,
    pagination: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  };
};

const getCustomer = async (id, userId, isAdmin, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const customer = await db.customer.findFirst({
    where: {
      id,
      deleted_at: null,
    },
    include: {
      creator: { select: { id: true, full_name: true, email: true } },
      updater: { select: { id: true, full_name: true } },
      referred_broker: { select: { id: true, full_name: true, broker_code: true } },
      documents: true,
      bank_accounts: {
        where: { is_active: true },
        select: {
          id: true,
          account_holder_name: true,
          account_number: true, // masked in service
          ifsc_code: true,
          bank_name: true,
          branch_name: true,
          micr_code: true,
          account_type: true,
          is_primary: true,
          is_verified: true,
          created_at: true,
        },
        orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
      },
    },
  });

  if (!customer) {
    throw Object.assign(new Error('Customer not found or access denied'), { statusCode: 404 });
  }

  // Mask account numbers: show only last 4 digits
  customer.bank_accounts = customer.bank_accounts.map((acc) => ({
    ...acc,
    account_number: `****${acc.account_number.slice(-4)}`,
  }));

  return customer;
};

const updateCustomer = async (id, data, updaterId, isAdmin, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const existing = await db.customer.findFirst({
    where: {
      id,
      deleted_at: null,
    },
  });

  if (!existing) {
    throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
  }

  const customer = await db.customer.update({
    where: { id },
    data: {
      ...data,
      updated_by: updaterId,
      family_code: data.family_code ? data.family_code.toUpperCase() : existing.family_code,
      pan_card: data.pan_card ? data.pan_card.toUpperCase() : existing.pan_card,
    },
    include: {
      creator: { select: { id: true, full_name: true } },
    },
  });

  await audit(companySlug, {
    userId: updaterId,
    action: 'UPDATE_CUSTOMER',
    entityType: 'CUSTOMER',
    entityId: id,
    metadata: { fields_updated: Object.keys(data) },
  });

  return customer;
};

const deleteCustomer = async (id, deleterId, isAdmin, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const existing = await db.customer.findFirst({
    where: { id, deleted_at: null },
  });

  if (!existing) {
    throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
  }

  if (!isAdmin) {
    throw Object.assign(new Error('Only administrators can delete customers'), { statusCode: 403 });
  }

  // Soft delete
  await db.customer.update({
    where: { id },
    data: {
      deleted_at: new Date(),
      is_active: false,
      updated_by: deleterId,
    },
  });

  await audit(companySlug, {
    userId: deleterId,
    action: 'DELETE_CUSTOMER',
    entityType: 'CUSTOMER',
    entityId: id,
    metadata: { customer_code: existing.customer_code, customer_name: existing.customer_name },
  });
};

module.exports = {
  createCustomer,
  getCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer,
  generateFamilyCode,
  lookupFamilyCode,
  searchFamilyCodes,
};
