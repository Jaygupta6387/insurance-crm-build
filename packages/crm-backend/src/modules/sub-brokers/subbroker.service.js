const { resolveCompanyDb } = require('../dynamic-db/dbResolver');

// ─── Broker Code Generator ────────────────────────────────────────────────────
const generateBrokerCode = async (db, fullName) => {
  const prefix = fullName.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X');
  const year = new Date().getFullYear().toString().slice(-2);
  const last = await db.subBroker.findFirst({
    where: { broker_code: { startsWith: `${prefix}${year}` } },
    orderBy: { broker_code: 'desc' },
    select: { broker_code: true },
  });
  const seq = last ? parseInt(last.broker_code.replace(`${prefix}${year}`, ''), 10) + 1 : 1;
  return `${prefix}${year}${String(seq).padStart(4, '0')}`;
};

// ─── CRUD ─────────────────────────────────────────────────────────────────────

const createSubBroker = async (data, creatorId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  if (data.email) {
    const existing = await db.subBroker.findFirst({
      where: { email: data.email, deleted_at: null },
    });
    if (existing) {
      throw Object.assign(new Error('A sub-broker with this email already exists'), { statusCode: 409 });
    }
  }

  if (data.phone) {
    const existing = await db.subBroker.findFirst({
      where: { phone: data.phone, deleted_at: null },
    });
    if (existing) {
      throw Object.assign(new Error('A sub-broker with this phone number already exists'), { statusCode: 409 });
    }
  }

  const broker_code = await generateBrokerCode(db, data.full_name);

  return db.subBroker.create({
    data: {
      broker_code,
      full_name: data.full_name,
      phone: data.phone,
      email: data.email ?? null,
      status: data.status ?? 'ACTIVE',
      wallet_balance: 0,
      created_by: creatorId ?? null,
    },
  });
};

const getSubBrokers = async (companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);

  const where = { deleted_at: null };

  if (filters.search) {
    where.OR = [
      { full_name: { contains: filters.search, mode: 'insensitive' } },
      { phone: { contains: filters.search } },
      { broker_code: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters.status) where.status = filters.status;

  const page  = Math.max(1, parseInt(filters.page  || '1',  10));
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit || '20', 10)));
  const skip  = (page - 1) * limit;

  const [brokers, total] = await Promise.all([
    db.subBroker.findMany({
      where,
      orderBy: { full_name: 'asc' },
      skip,
      take: limit,
      include: {
        _count: { select: { customers: true, commissions: true } },
      },
    }),
    db.subBroker.count({ where }),
  ]);

  return { brokers, total, page, limit, pages: Math.ceil(total / limit) };
};

const getSubBroker = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const broker = await db.subBroker.findFirst({
    where: { id, deleted_at: null },
    include: {
      _count: { select: { customers: true, commissions: true, wallet_transactions: true } },
    },
  });

  if (!broker) {
    throw Object.assign(new Error('Sub-broker not found'), { statusCode: 404 });
  }
  return broker;
};

const updateSubBroker = async (id, data, updaterId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const existing = await db.subBroker.findFirst({ where: { id, deleted_at: null } });
  if (!existing) {
    throw Object.assign(new Error('Sub-broker not found'), { statusCode: 404 });
  }

  if (data.email && data.email !== existing.email) {
    const conflict = await db.subBroker.findFirst({
      where: { email: data.email, deleted_at: null, NOT: { id } },
    });
    if (conflict) {
      throw Object.assign(new Error('A sub-broker with this email already exists'), { statusCode: 409 });
    }
  }

  if (data.phone && data.phone !== existing.phone) {
    const conflict = await db.subBroker.findFirst({
      where: { phone: data.phone, deleted_at: null, NOT: { id } },
    });
    if (conflict) {
      throw Object.assign(new Error('A sub-broker with this phone already exists'), { statusCode: 409 });
    }
  }

  return db.subBroker.update({
    where: { id },
    data: {
      ...(data.full_name  !== undefined && { full_name:  data.full_name  }),
      ...(data.phone      !== undefined && { phone:      data.phone      }),
      ...(data.email      !== undefined && { email:      data.email      }),
      ...(data.status     !== undefined && { status:     data.status     }),
      updated_by: updaterId ?? null,
    },
  });
};

const deleteSubBroker = async (id, deleterId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const existing = await db.subBroker.findFirst({ where: { id, deleted_at: null } });
  if (!existing) {
    throw Object.assign(new Error('Sub-broker not found'), { statusCode: 404 });
  }

  return db.subBroker.update({
    where: { id },
    data: {
      deleted_at: new Date(),
      deleted_by: deleterId ?? null,
      status: 'INACTIVE',
    },
  });
};

// ─── Wallet ───────────────────────────────────────────────────────────────────

const adjustWallet = async (id, data, performedById, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const broker = await db.subBroker.findFirst({ where: { id, deleted_at: null } });
  if (!broker) {
    throw Object.assign(new Error('Sub-broker not found'), { statusCode: 404 });
  }

  const amount = parseFloat(data.amount);
  const currentBalance = parseFloat(broker.wallet_balance);
  let newBalance;

  if (data.type === 'CREDIT') {
    newBalance = currentBalance + amount;
  } else {
    if (currentBalance < amount) {
      throw Object.assign(new Error('Insufficient wallet balance for this debit'), { statusCode: 400 });
    }
    newBalance = currentBalance - amount;
  }

  const [transaction] = await db.$transaction([
    db.subBrokerWalletTransaction.create({
      data: {
        sub_broker_id: id,
        type:          data.type,
        reason:        data.reason,
        amount,
        balance_after: newBalance,
        note:          data.note ?? null,
        performed_by:  performedById ?? null,
      },
    }),
    db.subBroker.update({
      where: { id },
      data: { wallet_balance: newBalance },
    }),
  ]);

  return { transaction, new_balance: newBalance };
};

const getWalletHistory = async (id, companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);

  const broker = await db.subBroker.findFirst({
    where: { id, deleted_at: null },
    select: { id: true, wallet_balance: true },
  });
  if (!broker) {
    throw Object.assign(new Error('Sub-broker not found'), { statusCode: 404 });
  }

  const page  = Math.max(1, parseInt(filters.page  || '1',  10));
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit || '20', 10)));
  const skip  = (page - 1) * limit;

  const where = { sub_broker_id: id };
  if (filters.type)   where.type   = filters.type;
  if (filters.reason) where.reason = filters.reason;

  const [transactions, total] = await Promise.all([
    db.subBrokerWalletTransaction.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    db.subBrokerWalletTransaction.count({ where }),
  ]);

  return {
    wallet_balance: broker.wallet_balance,
    transactions,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
};

// ─── Commissions ──────────────────────────────────────────────────────────────

const createCommission = async (brokerId, data, creatorId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const broker = await db.subBroker.findFirst({ where: { id: brokerId, deleted_at: null } });
  if (!broker) {
    throw Object.assign(new Error('Sub-broker not found'), { statusCode: 404 });
  }

  return db.policySubBrokerCommission.create({
    data: {
      sub_broker_id:          brokerId,
      policy_id:              data.policy_id              ?? null,
      policy_number:          data.policy_number          ?? null,
      customer_id:            data.customer_id            ?? null,
      lob_id:                 data.lob_id                 ?? null,
      product_id:             data.product_id             ?? null,
      sub_product_id:         data.sub_product_id         ?? null,
      insurance_company_id:   data.insurance_company_id   ?? null,
      commission_basis:       data.commission_basis       ?? null,
      total_commission_amount: data.total_commission_amount,
      status:                 'PENDING',
      notes:                  data.notes ?? null,
      created_by:             creatorId  ?? null,
      items: data.items?.length
        ? {
            create: data.items.map((item) => ({
              component_type:    item.component_type,
              base_amount:       item.base_amount    ?? null,
              percentage:        item.percentage     ?? null,
              commission_amount: item.commission_amount,
            })),
          }
        : undefined,
    },
    include: {
      items: true,
      lob:               { select: { id: true, name: true } },
      product:           { select: { id: true, name: true } },
      sub_product:       { select: { id: true, name: true } },
      insurance_company: { select: { id: true, name: true } },
      customer:          { select: { id: true, customer_name: true } },
    },
  });
};

const getCommissions = async (brokerId, companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);

  const broker = await db.subBroker.findFirst({
    where: { id: brokerId, deleted_at: null },
    select: { id: true },
  });
  if (!broker) {
    throw Object.assign(new Error('Sub-broker not found'), { statusCode: 404 });
  }

  const page  = Math.max(1, parseInt(filters.page  || '1',  10));
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit || '20', 10)));
  const skip  = (page - 1) * limit;

  const where = { sub_broker_id: brokerId };
  if (filters.status) where.status = filters.status;

  const [commissions, total] = await Promise.all([
    db.policySubBrokerCommission.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
      include: {
        items: true,
        lob:               { select: { id: true, name: true } },
        product:           { select: { id: true, name: true } },
        sub_product:       { select: { id: true, name: true } },
        insurance_company: { select: { id: true, name: true } },
        customer:          { select: { id: true, customer_name: true } },
      },
    }),
    db.policySubBrokerCommission.count({ where }),
  ]);

  return { commissions, total, page, limit, pages: Math.ceil(total / limit) };
};

const updateCommissionStatus = async (commissionId, data, updaterId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const commission = await db.policySubBrokerCommission.findUnique({
    where: { id: commissionId },
    include: { customer: { select: { customer_name: true } }, insurance_company: { select: { name: true } }, product: { select: { name: true } } },
  });
  if (!commission) {
    throw Object.assign(new Error('Commission record not found'), { statusCode: 404 });
  }

  // If marking as PAID and not already credited — auto-credit the wallet atomically
  if (data.status === 'PAID' && commission.status !== 'PAID' && !commission.is_wallet_credited) {
    const broker = await db.subBroker.findUnique({
      where: { id: commission.sub_broker_id },
      select: { wallet_balance: true },
    });
    const newBalance =
      parseFloat(broker.wallet_balance) + parseFloat(commission.total_commission_amount);

    return db.$transaction(async (tx) => {
      // 1. Create immutable ledger entry (with analytics FK + snapshot fields)
      const walletTx = await tx.subBrokerWalletTransaction.create({
        data: {
          sub_broker_id:        commission.sub_broker_id,
          type:                 'CREDIT',
          reason:               'COMMISSION_EARNED',
          amount:               commission.total_commission_amount,
          balance_after:        newBalance,
          note:                 `Commission paid — policy: ${commission.policy_number ?? 'N/A'}`,
          reference_id:         commissionId,
          performed_by:         updaterId ?? null,
          // Analytics FK references
          policy_id:            commission.policy_id            ?? null,
          customer_id:          commission.customer_id          ?? null,
          lob_id:               commission.lob_id               ?? null,
          product_id:           commission.product_id           ?? null,
          sub_product_id:       commission.sub_product_id       ?? null,
          insurance_company_id: commission.insurance_company_id ?? null,
          // Historical snapshots
          customer_name_snapshot:          commission.customer?.customer_name          ?? null,
          insurance_company_name_snapshot: commission.insurance_company?.name          ?? null,
          product_name_snapshot:           commission.product?.name                    ?? null,
        },
      });

      // 2. Update commission: mark paid + link wallet transaction
      const updatedCommission = await tx.policySubBrokerCommission.update({
        where: { id: commissionId },
        data: {
          status:               'PAID',
          is_wallet_credited:   true,
          wallet_transaction_id: walletTx.id,
          notes:                data.notes ?? commission.notes,
        },
        include: {
          items: true,
          lob:               { select: { id: true, name: true } },
          product:           { select: { id: true, name: true } },
          sub_product:       { select: { id: true, name: true } },
          insurance_company: { select: { id: true, name: true } },
          customer:          { select: { id: true, customer_name: true } },
        },
      });

      // 3. Update cached wallet balance on sub-broker
      await tx.subBroker.update({
        where: { id: commission.sub_broker_id },
        data:  { wallet_balance: newBalance },
      });

      return updatedCommission;
    });
  }

  // Non-payment status updates (CANCELLED, or already paid)
  return db.policySubBrokerCommission.update({
    where: { id: commissionId },
    data:  { status: data.status, notes: data.notes ?? commission.notes },
    include: {
      items: true,
      lob:               { select: { id: true, name: true } },
      product:           { select: { id: true, name: true } },
      sub_product:       { select: { id: true, name: true } },
      insurance_company: { select: { id: true, name: true } },
      customer:          { select: { id: true, customer_name: true } },
    },
  });
};

// ─── Analytics ───────────────────────────────────────────────────────────────

const getAnalytics = async (companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const [total, active, inactive, walletResult, commissionResult, topBrokers, byLob, byCompany] =
    await Promise.all([
      db.subBroker.count({ where: { deleted_at: null } }),
      db.subBroker.count({ where: { deleted_at: null, status: 'ACTIVE' } }),
      db.subBroker.count({ where: { deleted_at: null, status: 'INACTIVE' } }),
      db.subBroker.aggregate({ where: { deleted_at: null }, _sum: { wallet_balance: true } }),
      db.policySubBrokerCommission.aggregate({
        where: { status: 'PAID' },
        _sum: { total_commission_amount: true },
      }),
      db.subBroker.findMany({
        where: { deleted_at: null, status: 'ACTIVE' },
        orderBy: { wallet_balance: 'desc' },
        take: 5,
        select: {
          id: true, full_name: true, broker_code: true, wallet_balance: true,
          _count: { select: { customers: true, commissions: true } },
        },
      }),
      // Commission breakdown by LOB
      db.policySubBrokerCommission.groupBy({
        by: ['lob_id'],
        where: { status: 'PAID', lob_id: { not: null } },
        _sum: { total_commission_amount: true },
        _count: true,
        orderBy: { _sum: { total_commission_amount: 'desc' } },
        take: 5,
      }),
      // Commission breakdown by Insurance Company
      db.policySubBrokerCommission.groupBy({
        by: ['insurance_company_id'],
        where: { status: 'PAID', insurance_company_id: { not: null } },
        _sum: { total_commission_amount: true },
        _count: true,
        orderBy: { _sum: { total_commission_amount: 'desc' } },
        take: 5,
      }),
    ]);

  // Enrich LOB analytics with names
  const lobIds = byLob.map((r) => r.lob_id).filter(Boolean);
  const lobNames = lobIds.length
    ? await db.lob.findMany({ where: { id: { in: lobIds } }, select: { id: true, name: true } })
    : [];
  const lobNameMap = Object.fromEntries(lobNames.map((l) => [l.id, l.name]));

  // Enrich Insurance Company analytics with names
  const companyIds = byCompany.map((r) => r.insurance_company_id).filter(Boolean);
  const companyNames = companyIds.length
    ? await db.insuranceCompany.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, name: true },
      })
    : [];
  const companyNameMap = Object.fromEntries(companyNames.map((c) => [c.id, c.name]));

  return {
    total_brokers:         total,
    active_brokers:        active,
    inactive_brokers:      inactive,
    total_wallet_balance:  walletResult._sum.wallet_balance           ?? 0,
    total_commission_paid: commissionResult._sum.total_commission_amount ?? 0,
    top_brokers:           topBrokers,
    commission_by_lob: byLob.map((r) => ({
      lob_id:   r.lob_id,
      lob_name: lobNameMap[r.lob_id] ?? 'Unknown',
      total:    r._sum.total_commission_amount ?? 0,
      count:    r._count,
    })),
    commission_by_insurance_company: byCompany.map((r) => ({
      insurance_company_id:   r.insurance_company_id,
      insurance_company_name: companyNameMap[r.insurance_company_id] ?? 'Unknown',
      total: r._sum.total_commission_amount ?? 0,
      count: r._count,
    })),
  };
};

module.exports = {
  createSubBroker,
  getSubBrokers,
  getSubBroker,
  updateSubBroker,
  deleteSubBroker,
  adjustWallet,
  getWalletHistory,
  createCommission,
  getCommissions,
  updateCommissionStatus,
  getAnalytics,
};
