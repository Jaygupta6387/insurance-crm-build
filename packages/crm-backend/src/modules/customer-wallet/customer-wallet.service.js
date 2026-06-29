const { resolveCompanyDb } = require('../dynamic-db/dbResolver');

/**
 * Lists customers carrying a pending balance (money owed to the agency from
 * partial policy payments). Positive wallet_balance == outstanding receivable.
 */
const getPendingBalances = async (filters = {}, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const where = { wallet_balance: { gt: 0 }, deleted_at: null };
  if (filters.search) {
    where.OR = [
      { customer_name: { contains: filters.search, mode: 'insensitive' } },
      { customer_phone: { contains: filters.search } },
    ];
  }

  const [customers, total, aggregate] = await Promise.all([
    db.customer.findMany({
      where,
      skip,
      take: limit,
      orderBy: { wallet_balance: 'desc' },
      select: {
        id: true,
        customer_name: true,
        customer_phone: true,
        customer_email: true,
        wallet_balance: true,
        customer_wallet_txs: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: { created_at: true, policy_number: true, product_name: true },
        },
      },
    }),
    db.customer.count({ where }),
    db.customer.aggregate({ where, _sum: { wallet_balance: true } }),
  ]);

  return {
    pending: customers.map((c) => ({
      id: c.id,
      customer_name: c.customer_name,
      customer_phone: c.customer_phone,
      customer_email: c.customer_email,
      pending_amount: c.wallet_balance,
      last_transaction: c.customer_wallet_txs[0] || null,
    })),
    total_pending: aggregate._sum.wallet_balance || 0,
    pagination: { total, page, limit, total_pages: Math.ceil(total / limit) },
  };
};

const getCustomerLedger = async (customerId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const customer = await db.customer.findFirst({
    where: { id: customerId, deleted_at: null },
    select: { id: true, customer_name: true, customer_phone: true, wallet_balance: true },
  });
  if (!customer) throw Object.assign(new Error('Customer not found'), { statusCode: 404 });

  const transactions = await db.customerWalletTransaction.findMany({
    where: { customer_id: customerId },
    orderBy: { created_at: 'desc' },
  });
  return { customer, transactions };
};

/**
 * Records a payment received against a customer's pending balance (CREDIT),
 * reducing the outstanding amount.
 */
const recordPayment = async (customerId, data, userId, companySlug) =>
  adjustWallet(
    customerId,
    {
      type: 'CREDIT',
      amount: data.amount,
      reason: 'PAYMENT_RECEIVED',
      note: data.note || 'Payment received',
      policy_number: data.policy_number,
    },
    userId,
    companySlug,
  );

/**
 * Manual wallet adjustment.
 * DEBIT  → increases pending (customer owes more).
 * CREDIT → settles pending (payment received).
 */
const adjustWallet = async (customerId, data, userId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const customer = await db.customer.findFirst({
    where: { id: customerId, deleted_at: null },
    select: { id: true, customer_name: true, customer_phone: true, wallet_balance: true },
  });
  if (!customer) throw Object.assign(new Error('Customer not found'), { statusCode: 404 });

  const amount = Number(data.amount) || 0;
  if (amount <= 0) throw Object.assign(new Error('Amount must be greater than zero'), { statusCode: 400 });

  const currentBalance = Number(customer.wallet_balance) || 0;
  let newBalance;

  if (data.type === 'DEBIT') {
    newBalance = Math.round((currentBalance + amount) * 100) / 100;
  } else {
    if (currentBalance < amount) {
      throw Object.assign(new Error('Settlement amount exceeds pending balance'), { statusCode: 400 });
    }
    newBalance = Math.round((currentBalance - amount) * 100) / 100;
  }

  const defaultReason = data.type === 'CREDIT' ? 'PAYMENT_RECEIVED' : 'MANUAL_ADD';
  const reason = data.reason || defaultReason;

  const [transaction] = await db.$transaction([
    db.customerWalletTransaction.create({
      data: {
        customer_id: customerId,
        type: data.type,
        amount,
        balance_after: newBalance,
        reason,
        policy_number: data.policy_number || null,
        note: data.note || null,
        performed_by: userId,
      },
    }),
    db.customer.update({ where: { id: customerId }, data: { wallet_balance: newBalance } }),
  ]);

  return {
    transaction,
    new_balance: newBalance,
    customer: {
      id: customer.id,
      customer_name: customer.customer_name,
      customer_phone: customer.customer_phone,
      wallet_balance: newBalance,
    },
  };
};

module.exports = { getPendingBalances, getCustomerLedger, recordPayment, adjustWallet };
