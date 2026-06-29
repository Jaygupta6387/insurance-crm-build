const { resolveCompanyDb } = require('../dynamic-db/dbResolver');

// Mask account number: show only last 4 digits
const maskAccount = (num) => `****${num.slice(-4)}`;

const createBankAccount = async (data, creatorId, isAdmin, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  // Verify customer exists and is accessible
  const customer = await db.customer.findFirst({
    where: {
      id: data.customer_id,
      deleted_at: null,
    },
  });

  if (!customer) {
    throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
  }

  // Enforce one bank account per customer
  const existingCount = await db.customerBankAccount.count({
    where: { customer_id: data.customer_id, is_active: true },
  });
  if (existingCount > 0) {
    throw Object.assign(new Error('Customer already has a bank account. Only one account is allowed per customer.'), { statusCode: 409 });
  }

  // If marking is_primary, unset any existing primary account
  if (data.is_primary) {
    await db.customerBankAccount.updateMany({
      where: { customer_id: data.customer_id, is_primary: true, is_active: true },
      data: { is_primary: false },
    });
  }

  return db.customerBankAccount.create({
    data: {
      customer_id: data.customer_id,
      account_holder_name: data.account_holder_name,
      account_number: data.account_number,
      ifsc_code: data.ifsc_code.toUpperCase(),
      bank_name: data.bank_name || null,
      branch_name: data.branch_name || null,
      micr_code: data.micr_code || null,
      account_type: data.account_type || 'SAVINGS',
      is_primary: data.is_primary ?? false,
      created_by: creatorId,
      updated_by: creatorId,
    },
  });
};

const getBankAccounts = async (customerId, userId, isAdmin, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  // Verify customer access
  const customer = await db.customer.findFirst({
    where: {
      id: customerId,
      deleted_at: null,
    },
  });

  if (!customer) {
    throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
  }

  const accounts = await db.customerBankAccount.findMany({
    where: { customer_id: customerId, is_active: true },
    orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
    include: {
      creator: { select: { id: true, full_name: true } },
    },
  });

  // Mask account numbers in list
  return accounts.map((acc) => ({ ...acc, account_number: maskAccount(acc.account_number) }));
};

const updateBankAccount = async (id, data, updaterId, isAdmin, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const existing = await db.customerBankAccount.findUnique({
    where: { id },
    include: { customer: { select: { deleted_at: true } } },
  });

  if (!existing || existing.customer.deleted_at) {
    throw Object.assign(new Error('Bank account not found'), { statusCode: 404 });
  }

  // If setting as primary, unset other primaries
  if (data.is_primary) {
    await db.customerBankAccount.updateMany({
      where: { customer_id: existing.customer_id, is_primary: true, is_active: true, NOT: { id } },
      data: { is_primary: false },
    });
  }

  return db.customerBankAccount.update({
    where: { id },
    data: {
      ...data,
      ifsc_code: data.ifsc_code ? data.ifsc_code.toUpperCase() : undefined,
      updated_by: updaterId,
    },
  });
};

const deleteBankAccount = async (id, deleterId, isAdmin, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const existing = await db.customerBankAccount.findUnique({
    where: { id },
    include: { customer: { select: { id: true } } },
  });

  if (!existing) {
    throw Object.assign(new Error('Bank account not found'), { statusCode: 404 });
  }

  await db.customerBankAccount.update(
    { where: { id }, data: { is_active: false, updated_by: deleterId } },
  );
};

module.exports = { createBankAccount, getBankAccounts, updateBankAccount, deleteBankAccount };
