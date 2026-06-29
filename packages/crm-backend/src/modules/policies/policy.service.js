const { resolveCompanyDb } = require('../dynamic-db/dbResolver');
const { audit } = require('../audit/auditService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toDate = (v) => (v ? new Date(v) : null);
const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

const policyInclude = {
  customer: { select: { id: true, customer_name: true, customer_phone: true, customer_email: true } },
  lob: { select: { id: true, name: true } },
  product: { select: { id: true, name: true } },
  sub_product: { select: { id: true, name: true } },
  insurance_company: { select: { id: true, name: true } },
  policy_type: { select: { id: true, name: true } },
  vehicle: {
    include: {
      rto_code: { select: { id: true, rto_code: true, rto_name: true, city: true } },
      make: { select: { id: true, make_name: true } },
      model: { select: { id: true, model_name: true } },
      variant: { select: { id: true, variant_name: true } },
    },
  },
  motor_detail: true,
  health_detail: { include: { health_plan: { select: { id: true, name: true } } } },
  health_members: {
    orderBy: { created_at: 'asc' },
    include: { customer: { select: { id: true, customer_name: true, customer_phone: true, customer_email: true, age: true, family_relation: true } } },
  },
  add_ons: true,
  documents: true,
  previous_policy: { include: { previous_insurance_company: { select: { id: true, name: true } } } },
  our_commissions: {
    orderBy: { created_at: 'desc' },
    take: 1,
    include: { items: true },
  },
  commissions: {
    orderBy: { created_at: 'desc' },
    take: 1,
    include: {
      items: true,
      sub_broker: { select: { id: true, full_name: true, phone: true } },
    },
  },
};

const mapMotorDetail = (m = {}) => ({
  package_type: m.package_type || null,
  idv: toNum(m.idv),
  electric_accessory_idv: toNum(m.electric_accessory_idv),
  non_electric_accessory_idv: toNum(m.non_electric_accessory_idv),
  od_start_date: toDate(m.od_start_date),
  od_end_date: toDate(m.od_end_date),
  tp_start_date: toDate(m.tp_start_date),
  tp_end_date: toDate(m.tp_end_date),
  rate_source: m.rate_source || 'MANUAL',
  basic_premium: toNum(m.basic_premium),
  discount_percent: toNum(m.discount_percent),
  basic_after_discount: toNum(m.basic_after_discount),
  ncb_percent: toNum(m.ncb_percent),
  od_premium: toNum(m.od_premium),
  tp_premium: toNum(m.tp_premium),
  addon_premium: toNum(m.addon_premium),
  total_od_premium: toNum(m.total_od_premium),
  net_premium: toNum(m.net_premium),
  gst_on_od: toNum(m.gst_on_od),
  gst_on_tp: toNum(m.gst_on_tp),
  total_gst: toNum(m.total_gst),
  total_premium: toNum(m.total_premium),
  pa_owner: !!m.pa_owner,
  pa_owner_amount: toNum(m.pa_owner_amount),
  pa_passenger_1l: !!m.pa_passenger_1l,
  pa_passenger_2l: !!m.pa_passenger_2l,
  pa_passenger_amount: toNum(m.pa_passenger_amount),
  paid_driver: !!m.paid_driver,
  paid_driver_amount: toNum(m.paid_driver_amount),
  payment_mode: m.payment_mode || null,
  payment_reference: m.payment_reference || null,
  is_full_payment: m.is_full_payment === undefined ? true : !!m.is_full_payment,
  amount_received: toNum(m.amount_received),
});

const mapHealthDetail = (h = {}) => ({
  health_plan_id: h.health_plan_id || null,
  deductible: toNum(h.deductible),
  sum_insured: toNum(h.sum_insured),
  cumulative_bonus: toNum(h.cumulative_bonus),
  base_premium: toNum(h.base_premium),
  gst_percent: toNum(h.gst_percent),
  gst_amount: toNum(h.gst_amount),
  net_premium: toNum(h.net_premium),
  total_premium: toNum(h.total_premium),
  payment_mode: h.payment_mode || null,
  payment_reference: h.payment_reference || null,
  is_full_payment: h.is_full_payment === undefined ? true : !!h.is_full_payment,
  amount_received: toNum(h.amount_received),
});

const mapHealthMembers = (members = []) =>
  members.map((m) => ({
    customer_id: m.customer_id || null,
    relation: m.relation || null,
    member_name: m.member_name,
    member_phone: m.member_phone || null,
    member_email: m.member_email || null,
    member_age: m.member_age != null ? Number(m.member_age) : null,
    is_covered: m.is_covered !== false,
  }));

// ─── Validation guards ────────────────────────────────────────────────────────

const assertUniquePolicyNumber = async (db, policy_number, excludeId) => {
  if (!policy_number) return;
  const existing = await db.policy.findFirst({
    where: { policy_number, ...(excludeId && { id: { not: excludeId } }) },
    select: { id: true },
  });
  if (existing) {
    throw Object.assign(new Error('This policy number already exists'), { statusCode: 409 });
  }
};

const assertVehicleAvailable = async (db, vehicle_id, excludePolicyId) => {
  if (!vehicle_id) return;
  const existing = await db.policy.findFirst({
    where: {
      vehicle_id,
      status: { not: 'CANCELLED' },
      ...(excludePolicyId && { id: { not: excludePolicyId } }),
    },
    select: { id: true, policy_number: true },
  });
  if (existing) {
    throw Object.assign(
      new Error(`This vehicle already has a policy (${existing.policy_number || existing.id})`),
      { statusCode: 409 },
    );
  }
};

const checkPolicyNumber = async (policy_number, excludeId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  if (!policy_number) return { available: false };
  const existing = await db.policy.findFirst({
    where: { policy_number, ...(excludeId && { id: { not: excludeId } }) },
    select: { id: true },
  });
  return { available: !existing };
};

/** Fetches an existing policy by its number (for renew/port prefill). */
const lookupByNumber = async (policy_number, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  if (!policy_number) return null;
  return db.policy.findFirst({
    where: { policy_number },
    include: policyInclude,
    orderBy: { created_at: 'desc' },
  });
};

// ─── Listing ──────────────────────────────────────────────────────────────────

const getPolicies = async (filters = {}, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.lob_id) where.lob_id = filters.lob_id;
  if (filters.customer_id) where.customer_id = filters.customer_id;
  if (filters.search) {
    where.OR = [
      { policy_number: { contains: filters.search, mode: 'insensitive' } },
      { customer: { customer_name: { contains: filters.search, mode: 'insensitive' } } },
      { customer: { customer_phone: { contains: filters.search, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await Promise.all([
    db.policy.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' }, include: policyInclude }),
    db.policy.count({ where }),
  ]);

  return {
    policies: items,
    pagination: { total, page, limit, total_pages: Math.ceil(total / limit) },
  };
};

const getPolicy = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const policy = await db.policy.findUnique({ where: { id }, include: policyInclude });
  if (!policy) throw Object.assign(new Error('Policy not found'), { statusCode: 404 });

  const [referred_broker, referred_customer, sub_broker_commission] = await Promise.all([
    policy.referred_by_sub_broker_id
      ? db.subBroker.findUnique({
          where: { id: policy.referred_by_sub_broker_id },
          select: { id: true, full_name: true, phone: true },
        })
      : null,
    policy.referred_by_customer_id
      ? db.customer.findUnique({
          where: { id: policy.referred_by_customer_id },
          select: { id: true, customer_name: true, customer_phone: true },
        })
      : null,
    policy.commissions?.[0]
      || db.policySubBrokerCommission.findFirst({
          where: { policy_id: id },
          orderBy: { created_at: 'desc' },
          include: {
            items: true,
            sub_broker: { select: { id: true, full_name: true, phone: true } },
          },
        }),
  ]);

  const resolvedReferredBroker = referred_broker || sub_broker_commission?.sub_broker || null;

  return { ...policy, referred_broker: resolvedReferredBroker, referred_customer, sub_broker_commission };
};

const getPolicyTypes = async (companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  return db.policyType.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } });
};

// ─── Create / Update ──────────────────────────────────────────────────────────

const buildCorePolicyData = (data) => ({
  policy_number: data.policy_number || null,
  customer_id: data.customer_id,
  lob_id: data.lob_id || null,
  product_id: data.product_id || null,
  sub_product_id: data.sub_product_id || null,
  insurance_company_id: data.insurance_company_id || null,
  policy_type_id: data.policy_type_id || null,
  vehicle_id: data.vehicle_id || null,
  referred_by_type: data.referred_by_type || null,
  referred_by_sub_broker_id: data.referred_by_sub_broker_id || null,
  referred_by_customer_id: data.referred_by_customer_id || null,
  premium_amount: toNum(data.health_detail?.total_premium ?? data.motor_detail?.total_premium),
  sum_insured: toNum(data.health_detail?.sum_insured ?? data.motor_detail?.idv),
  start_date: toDate(data.start_date),
  end_date: toDate(data.end_date),
  issue_date: toDate(data.issue_date),
  notes: data.notes || null,
});

const createPolicy = async (data, userId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const customer = await db.customer.findFirst({
    where: { id: data.customer_id, deleted_at: null },
    select: { id: true },
  });
  if (!customer) throw Object.assign(new Error('Customer not found'), { statusCode: 404 });

  await assertUniquePolicyNumber(db, data.policy_number);
  if (data.vehicle_id) await assertVehicleAvailable(db, data.vehicle_id);

  const isHealth = !!data.health_detail;

  const policy = await db.$transaction(async (tx) => {
    const created = await tx.policy.create({
      data: {
        ...buildCorePolicyData(data),
        status: 'DRAFT',
        created_by: userId,
        ...(isHealth
          ? {
              health_detail: { create: mapHealthDetail(data.health_detail) },
              ...(Array.isArray(data.health_members) && data.health_members.length
                ? { health_members: { create: mapHealthMembers(data.health_members) } }
                : {}),
            }
          : data.motor_detail
            ? { motor_detail: { create: mapMotorDetail(data.motor_detail) } }
            : {}),
        ...(Array.isArray(data.add_ons) && data.add_ons.length && !isHealth
          ? {
              add_ons: {
                create: data.add_ons.map((a) => ({
                  add_on_coverage_id: a.add_on_coverage_id || null,
                  add_on_name: a.add_on_name,
                  amount: toNum(a.amount),
                })),
              },
            }
          : {}),
        ...(Array.isArray(data.documents) && data.documents.length
          ? {
              documents: {
                create: data.documents.map((d) => ({
                  category: d.category || 'POLICY_PDF',
                  file_name: d.file_name,
                  file_url: d.file_url,
                  mime_type: d.mime_type || null,
                  created_by: userId,
                })),
              },
            }
          : {}),
        ...(data.previous_policy
          ? {
              previous_policy: {
                create: {
                  previous_policy_number: data.previous_policy.previous_policy_number || null,
                  previous_insurance_company_id: data.previous_policy.previous_insurance_company_id || null,
                  claim_status: data.previous_policy.claim_status || null,
                  claim_amount: toNum(data.previous_policy.claim_amount),
                  claim_description: data.previous_policy.claim_description || null,
                },
              },
            }
          : {}),
      },
      include: policyInclude,
    });
    return created;
  });

  await audit(companySlug, {
    userId,
    action: 'CREATE_POLICY',
    entityType: 'POLICY',
    entityId: policy.id,
    metadata: { policy_number: policy.policy_number },
  });

  return policy;
};

const updatePolicy = async (id, data, userId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const existing = await db.policy.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) throw Object.assign(new Error('Policy not found'), { statusCode: 404 });

  if (data.policy_number !== undefined) await assertUniquePolicyNumber(db, data.policy_number, id);
  if (data.vehicle_id) await assertVehicleAvailable(db, data.vehicle_id, id);

  await db.$transaction(async (tx) => {
    await tx.policy.update({
      where: { id },
      data: { ...buildCorePolicyData(data), updated_by: userId },
    });

    if (data.motor_detail) {
      await tx.motorPolicyDetail.upsert({
        where: { policy_id: id },
        create: { policy_id: id, ...mapMotorDetail(data.motor_detail) },
        update: mapMotorDetail(data.motor_detail),
      });
    }

    if (data.health_detail) {
      await tx.healthPolicyDetail.upsert({
        where: { policy_id: id },
        create: { policy_id: id, ...mapHealthDetail(data.health_detail) },
        update: mapHealthDetail(data.health_detail),
      });
    }

    if (Array.isArray(data.health_members)) {
      await tx.healthPolicyMember.deleteMany({ where: { policy_id: id } });
      if (data.health_members.length) {
        await tx.healthPolicyMember.createMany({
          data: mapHealthMembers(data.health_members).map((m) => ({ ...m, policy_id: id })),
        });
      }
    }

    if (Array.isArray(data.add_ons)) {
      await tx.policyAddOn.deleteMany({ where: { policy_id: id } });
      if (data.add_ons.length) {
        await tx.policyAddOn.createMany({
          data: data.add_ons.map((a) => ({
            policy_id: id,
            add_on_coverage_id: a.add_on_coverage_id || null,
            add_on_name: a.add_on_name,
            amount: toNum(a.amount),
          })),
        });
      }
    }

    if (Array.isArray(data.documents)) {
      // Append newly added documents only (those without an id)
      const fresh = data.documents.filter((d) => !d.id && d.file_url);
      if (fresh.length) {
        await tx.policyDocument.createMany({
          data: fresh.map((d) => ({
            policy_id: id,
            category: d.category || 'POLICY_PDF',
            file_name: d.file_name,
            file_url: d.file_url,
            mime_type: d.mime_type || null,
            created_by: userId,
          })),
        });
      }
    }

    if (data.previous_policy) {
      await tx.previousPolicy.upsert({
        where: { policy_id: id },
        create: {
          policy_id: id,
          previous_policy_number: data.previous_policy.previous_policy_number || null,
          previous_insurance_company_id: data.previous_policy.previous_insurance_company_id || null,
          claim_status: data.previous_policy.claim_status || null,
          claim_amount: toNum(data.previous_policy.claim_amount),
          claim_description: data.previous_policy.claim_description || null,
        },
        update: {
          previous_policy_number: data.previous_policy.previous_policy_number || null,
          previous_insurance_company_id: data.previous_policy.previous_insurance_company_id || null,
          claim_status: data.previous_policy.claim_status || null,
          claim_amount: toNum(data.previous_policy.claim_amount),
          claim_description: data.previous_policy.claim_description || null,
        },
      });
    }
  });

  await audit(companySlug, { userId, action: 'UPDATE_POLICY', entityType: 'POLICY', entityId: id });

  return getPolicy(id, companySlug);
};

const hardDeletePolicy = async (id, userId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const policy = await db.policy.findUnique({
    where: { id },
    include: {
      motor_detail: true,
      health_detail: true,
      customer: { select: { id: true, wallet_balance: true } },
    },
  });
  if (!policy) throw Object.assign(new Error('Policy not found'), { statusCode: 404 });

  await db.$transaction(async (tx) => {
    // Reverse customer pending balance (partial payment ledger)
    const custPendingTxs = await tx.customerWalletTransaction.findMany({
      where: { policy_id: id, reason: 'POLICY_PENDING', type: 'DEBIT' },
    });
    if (custPendingTxs.length) {
      const customer = await tx.customer.findUnique({ where: { id: policy.customer_id } });
      let balance = Number(customer?.wallet_balance) || 0;
      for (const txRow of custPendingTxs) {
        const amt = Number(txRow.amount) || 0;
        balance = Math.round((balance - amt) * 100) / 100;
        await tx.customerWalletTransaction.create({
          data: {
            customer_id: policy.customer_id,
            type: 'CREDIT',
            amount: amt,
            balance_after: balance,
            reason: 'POLICY_REVERSAL',
            policy_id: id,
            policy_number: policy.policy_number,
            note: 'Reversal — policy deleted',
            performed_by: userId,
          },
        });
      }
      await tx.customer.update({ where: { id: policy.customer_id }, data: { wallet_balance: balance } });
    }

    // Reverse sub-broker commission credits
    const subComms = await tx.policySubBrokerCommission.findMany({
      where: { policy_id: id, is_wallet_credited: true },
      include: { items: true },
    });
    for (const sc of subComms) {
      const broker = await tx.subBroker.findUnique({ where: { id: sc.sub_broker_id } });
      if (!broker) continue;
      const amt = Number(sc.total_commission_amount) || 0;
      if (amt <= 0) continue;
      const newBalance = Math.round((Number(broker.wallet_balance) - amt) * 100) / 100;
      await tx.subBrokerWalletTransaction.create({
        data: {
          sub_broker_id: broker.id,
          type: 'DEBIT',
          reason: 'COMMISSION_REVERSAL',
          amount: amt,
          balance_after: newBalance,
          note: `Commission reversal — policy deleted: ${policy.policy_number || id}`,
          performed_by: userId,
          policy_id: id,
          customer_id: policy.customer_id,
        },
      });
      await tx.subBroker.update({ where: { id: broker.id }, data: { wallet_balance: newBalance } });
    }

    // Remove sub-broker commission rows (items cascade)
    await tx.policySubBrokerCommission.deleteMany({ where: { policy_id: id } });

    // Hard delete policy — cascades motor_detail, add_ons, documents, previous_policy, our_commissions
    await tx.policy.delete({ where: { id } });
  });

  await audit(companySlug, { userId, action: 'DELETE_POLICY', entityType: 'POLICY', entityId: id });
  return { id };
};

const deletePolicy = hardDeletePolicy;

module.exports = {
  getPolicies,
  getPolicy,
  getPolicyTypes,
  checkPolicyNumber,
  lookupByNumber,
  createPolicy,
  updatePolicy,
  deletePolicy,
  hardDeletePolicy,
};
