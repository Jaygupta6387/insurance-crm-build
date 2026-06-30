const { resolveCompanyDb } = require('../dynamic-db/dbResolver');

// ─── LOBs ─────────────────────────────────────────────────────────────────────

const DEFAULT_LOBS = ['MOTOR', 'HEALTH', 'LIFE', 'SME'];

const ensureDefaultLobs = async (db) => {
  const count = await db.lob.count();
  if (count > 0) return;
  for (const name of DEFAULT_LOBS) {
    await db.lob.create({ data: { name, is_active: true } });
  }
};

const getLobs = async (companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);
  await ensureDefaultLobs(db);
  const where = {};
  if (filters.is_active !== undefined) where.is_active = filters.is_active === 'true' || filters.is_active === true;
  return db.lob.findMany({ where, orderBy: { name: 'asc' } });
};

const createLob = async (data, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  return db.lob.create({
    data: { name: data.name },
  });
};

const updateLob = async (id, data, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const lob = await db.lob.findUnique({ where: { id } });
  if (!lob) throw Object.assign(new Error('LOB not found'), { statusCode: 404 });
  return db.lob.update({
    where: { id },
    data: {
      ...(data.name        !== undefined && { name: data.name }),
      ...(data.is_active   !== undefined && { is_active: data.is_active }),
    },
  });
};

// ─── Products ─────────────────────────────────────────────────────────────────

const getProducts = async (companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);
  const where = {};
  if (filters.lob_id)    where.lob_id    = filters.lob_id;
  if (filters.is_active !== undefined) where.is_active = filters.is_active === 'true' || filters.is_active === true;
  return db.product.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { lob: { select: { id: true, name: true } } },
  });
};

const createProduct = async (data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);
  const lob = await db.lob.findUnique({ where: { id: data.lob_id } });
  if (!lob) throw Object.assign(new Error('LOB not found'), { statusCode: 404 });
  return db.product.create({
    data: {
      lob_id: data.lob_id,
      name: data.name,
      created_by: userId ?? null,
    },
  });
};

const updateProduct = async (id, data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);
  const product = await db.product.findUnique({ where: { id } });
  if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404 });
  return db.product.update({
    where: { id },
    data: {
      ...(data.name        !== undefined && { name: data.name }),
      ...(data.is_active   !== undefined && { is_active: data.is_active }),
      ...(userId && { updated_by: userId }),
    },
  });
};

const deleteProduct = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const product = await db.product.findUnique({ where: { id } });
  if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404 });
  return db.product.delete({ where: { id } });
};

// ─── Sub-Products ─────────────────────────────────────────────────────────────

const getSubProducts = async (companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);
  const where = {};
  if (filters.product_id) where.product_id = filters.product_id;
  if (filters.is_active !== undefined) where.is_active = filters.is_active === 'true' || filters.is_active === true;
  return db.subProduct.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { product: { select: { id: true, name: true, lob_id: true } } },
  });
};

const createSubProduct = async (data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);
  const product = await db.product.findUnique({ where: { id: data.product_id } });
  if (!product) throw Object.assign(new Error('Product not found'), { statusCode: 404 });
  return db.subProduct.create({
    data: {
      product_id: data.product_id,
      name: data.name,
      created_by: userId ?? null,
    },
  });
};

const updateSubProduct = async (id, data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);
  const subProduct = await db.subProduct.findUnique({ where: { id } });
  if (!subProduct) throw Object.assign(new Error('Sub-product not found'), { statusCode: 404 });
  return db.subProduct.update({
    where: { id },
    data: {
      ...(data.name        !== undefined && { name: data.name }),
      ...(data.is_active   !== undefined && { is_active: data.is_active }),
      ...(userId && { updated_by: userId }),
    },
  });
};

const deleteSubProduct = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const subProduct = await db.subProduct.findUnique({ where: { id } });
  if (!subProduct) throw Object.assign(new Error('Sub-product not found'), { statusCode: 404 });
  return db.subProduct.delete({ where: { id } });
};

// ─── Insurance Companies ──────────────────────────────────────────────────────

const getInsuranceCompanies = async (companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);
  const where = {};
  if (filters.is_active !== undefined) where.is_active = filters.is_active === 'true' || filters.is_active === true;
  return db.insuranceCompany.findMany({ where, orderBy: { name: 'asc' } });
};

const createInsuranceCompany = async (data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);
  return db.insuranceCompany.create({
    data: {
      name: data.name,
      created_by: userId ?? null,
    },
  });
};

const updateInsuranceCompany = async (id, data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);
  const company = await db.insuranceCompany.findUnique({ where: { id } });
  if (!company) throw Object.assign(new Error('Insurance company not found'), { statusCode: 404 });
  return db.insuranceCompany.update({
    where: { id },
    data: {
      ...(data.name        !== undefined && { name: data.name }),
      ...(data.is_active   !== undefined && { is_active: data.is_active }),
      ...(userId && { updated_by: userId }),
    },
  });
};

const deleteInsuranceCompany = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const company = await db.insuranceCompany.findUnique({ where: { id } });
  if (!company) throw Object.assign(new Error('Insurance company not found'), { statusCode: 404 });
  return db.insuranceCompany.delete({ where: { id } });
};

// ─── Policy Types ─────────────────────────────────────────────────────────────

const getPolicyTypes = async (companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);
  const where = {};
  if (filters.is_active !== undefined) where.is_active = filters.is_active === 'true' || filters.is_active === true;
  return db.policyType.findMany({ where, orderBy: { name: 'asc' } });
};

const createPolicyType = async (data, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const existing = await db.policyType.findUnique({ where: { name: data.name } });
  if (existing) throw Object.assign(new Error('Policy type already exists'), { statusCode: 409 });
  return db.policyType.create({ data: { name: data.name } });
};

const updatePolicyType = async (id, data, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const row = await db.policyType.findUnique({ where: { id } });
  if (!row) throw Object.assign(new Error('Policy type not found'), { statusCode: 404 });
  return db.policyType.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
    },
  });
};

// ─── Motor Premium Rates ──────────────────────────────────────────────────────

const getMotorPremiumRates = async (companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);
  const where = {};
  if (filters.product_id) where.product_id = filters.product_id;
  if (filters.sub_product_id) where.sub_product_id = filters.sub_product_id;
  if (filters.zone) where.zone = filters.zone;
  if (filters.is_active !== undefined) where.is_active = filters.is_active === 'true' || filters.is_active === true;
  return db.motorPremiumRate.findMany({
    where,
    orderBy: [{ age_bracket: 'asc' }, { zone: 'asc' }, { cc_bracket: 'asc' }],
    include: {
      product: { select: { id: true, name: true } },
      sub_product: { select: { id: true, name: true } },
    },
  });
};

const assertPremiumRateProductSubProduct = (data, existing = null) => {
  const productId = data.product_id !== undefined ? data.product_id : existing?.product_id;
  const subProductId = data.sub_product_id !== undefined ? data.sub_product_id : existing?.sub_product_id;
  if (!productId || String(productId).trim() === '') {
    throw Object.assign(new Error('Product is required for motor premium rates'), { statusCode: 400 });
  }
  if (!subProductId || String(subProductId).trim() === '') {
    throw Object.assign(new Error('Sub-product is required for motor premium rates'), { statusCode: 400 });
  }
};

const DUPLICATE_PREMIUM_RATE_MSG =
  'A premium rate already exists for this product, sub-product, zone, CC bracket and vehicle age';

const assertNoDuplicatePremiumRate = async (db, keys, excludeId = null) => {
  const duplicate = await db.motorPremiumRate.findFirst({
    where: {
      product_id: keys.product_id,
      sub_product_id: keys.sub_product_id,
      zone: keys.zone,
      cc_bracket: keys.cc_bracket,
      age_bracket: keys.age_bracket,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (duplicate) {
    throw Object.assign(new Error(DUPLICATE_PREMIUM_RATE_MSG), { statusCode: 409 });
  }
};

const createMotorPremiumRate = async (data, companySlug, userId) => {
  assertPremiumRateProductSubProduct(data);
  const db = await resolveCompanyDb(companySlug);
  await assertNoDuplicatePremiumRate(db, {
    product_id: data.product_id,
    sub_product_id: data.sub_product_id,
    zone: data.zone,
    cc_bracket: data.cc_bracket,
    age_bracket: data.age_bracket,
  });
  return db.motorPremiumRate.create({
    data: {
      product_id: data.product_id,
      sub_product_id: data.sub_product_id,
      zone: data.zone,
      cc_bracket: data.cc_bracket,
      age_bracket: data.age_bracket,
      od_rate_percent: data.od_rate_percent,
      tp_premium: data.tp_premium,
      created_by: userId ?? null,
    },
  });
};

const updateMotorPremiumRate = async (id, data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);
  const row = await db.motorPremiumRate.findUnique({ where: { id } });
  if (!row) throw Object.assign(new Error('Premium rate not found'), { statusCode: 404 });
  assertPremiumRateProductSubProduct(data, row);
  await assertNoDuplicatePremiumRate(
    db,
    {
      product_id: data.product_id ?? row.product_id,
      sub_product_id: data.sub_product_id ?? row.sub_product_id,
      zone: data.zone ?? row.zone,
      cc_bracket: data.cc_bracket ?? row.cc_bracket,
      age_bracket: data.age_bracket ?? row.age_bracket,
    },
    id,
  );
  return db.motorPremiumRate.update({
    where: { id },
    data: {
      ...(data.product_id !== undefined && { product_id: data.product_id }),
      ...(data.sub_product_id !== undefined && { sub_product_id: data.sub_product_id }),
      ...(data.zone !== undefined && { zone: data.zone }),
      ...(data.cc_bracket !== undefined && { cc_bracket: data.cc_bracket }),
      ...(data.age_bracket !== undefined && { age_bracket: data.age_bracket }),
      ...(data.od_rate_percent !== undefined && { od_rate_percent: data.od_rate_percent }),
      ...(data.tp_premium !== undefined && { tp_premium: data.tp_premium }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      updated_by: userId ?? null,
    },
  });
};

const deleteMotorPremiumRate = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const row = await db.motorPremiumRate.findUnique({ where: { id } });
  if (!row) throw Object.assign(new Error('Premium rate not found'), { statusCode: 404 });
  return db.motorPremiumRate.delete({ where: { id } });
};

// ─── GST Rates ────────────────────────────────────────────────────────────────

const getGstRates = async (companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);
  const where = {};
  if (filters.lob_id) where.lob_id = filters.lob_id;
  if (filters.product_id) where.product_id = filters.product_id;
  if (filters.is_active !== undefined) where.is_active = filters.is_active === 'true' || filters.is_active === true;
  return db.gstRate.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: {
      lob: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
    },
  });
};

/**
 * Creates one GST row, optionally fan-out across all products of a LOB when
 * `apply_to_all_products` is set (motor "apply on all product" checkbox).
 */
const createGstRate = async (data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);

  if (data.apply_to_all_products && data.lob_id) {
    const products = await db.product.findMany({ where: { lob_id: data.lob_id, is_active: true } });
    const rows = products.length ? products : [{ id: null }];
    const created = await db.$transaction(
      rows.map((p) =>
        db.gstRate.create({
          data: {
            lob_id: data.lob_id,
            product_id: p.id,
            gst_on_od_percent: data.gst_on_od_percent ?? null,
            gst_on_tp_percent: data.gst_on_tp_percent ?? null,
            gst_percent: data.gst_percent ?? null,
            created_by: userId ?? null,
          },
        }),
      ),
    );
    return { count: created.length, items: created };
  }

  const row = await db.gstRate.create({
    data: {
      lob_id: data.lob_id || null,
      product_id: data.product_id || null,
      gst_on_od_percent: data.gst_on_od_percent ?? null,
      gst_on_tp_percent: data.gst_on_tp_percent ?? null,
      gst_percent: data.gst_percent ?? null,
      created_by: userId ?? null,
    },
  });
  return { count: 1, items: [row] };
};

const updateGstRate = async (id, data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);
  const row = await db.gstRate.findUnique({ where: { id } });
  if (!row) throw Object.assign(new Error('GST rate not found'), { statusCode: 404 });
  return db.gstRate.update({
    where: { id },
    data: {
      ...(data.lob_id !== undefined && { lob_id: data.lob_id || null }),
      ...(data.product_id !== undefined && { product_id: data.product_id || null }),
      ...(data.gst_on_od_percent !== undefined && { gst_on_od_percent: data.gst_on_od_percent ?? null }),
      ...(data.gst_on_tp_percent !== undefined && { gst_on_tp_percent: data.gst_on_tp_percent ?? null }),
      ...(data.gst_percent !== undefined && { gst_percent: data.gst_percent ?? null }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      updated_by: userId ?? null,
    },
  });
};

const deleteGstRate = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const row = await db.gstRate.findUnique({ where: { id } });
  if (!row) throw Object.assign(new Error('GST rate not found'), { statusCode: 404 });
  return db.gstRate.delete({ where: { id } });
};

// ─── Health Plans ─────────────────────────────────────────────────────────────

const getHealthPlans = async (companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);
  const where = {};
  if (filters.is_active !== undefined) where.is_active = filters.is_active === 'true' || filters.is_active === true;
  if (filters.search) where.name = { contains: filters.search, mode: 'insensitive' };
  if (filters.insurance_company_id) where.insurance_company_id = filters.insurance_company_id;
  return db.healthPlan.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { insurance_company: { select: { id: true, name: true } } },
  });
};

const createHealthPlan = async (data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);
  if (data.insurance_company_id) {
    const co = await db.insuranceCompany.findUnique({ where: { id: data.insurance_company_id } });
    if (!co) throw Object.assign(new Error('Insurance company not found'), { statusCode: 404 });
  }
  return db.healthPlan.create({
    data: {
      name: data.name,
      insurance_company_id: data.insurance_company_id || null,
      is_active: data.is_active !== undefined ? data.is_active : true,
      created_by: userId ?? null,
    },
    include: { insurance_company: { select: { id: true, name: true } } },
  });
};

const updateHealthPlan = async (id, data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);
  const plan = await db.healthPlan.findUnique({ where: { id } });
  if (!plan) throw Object.assign(new Error('Health plan not found'), { statusCode: 404 });
  return db.healthPlan.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.insurance_company_id !== undefined && { insurance_company_id: data.insurance_company_id || null }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      updated_by: userId ?? null,
    },
    include: { insurance_company: { select: { id: true, name: true } } },
  });
};

const deleteHealthPlan = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const plan = await db.healthPlan.findUnique({ where: { id } });
  if (!plan) throw Object.assign(new Error('Health plan not found'), { statusCode: 404 });
  const inUse = await db.healthPolicyDetail.count({ where: { health_plan_id: id } });
  if (inUse > 0) {
    throw Object.assign(new Error('Cannot delete — plan is linked to policies'), { statusCode: 409 });
  }
  return db.healthPlan.delete({ where: { id } });
};

module.exports = {
  getLobs,
  createLob,
  updateLob,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getSubProducts,
  createSubProduct,
  updateSubProduct,
  deleteSubProduct,
  getInsuranceCompanies,
  createInsuranceCompany,
  updateInsuranceCompany,
  deleteInsuranceCompany,
  getPolicyTypes,
  createPolicyType,
  updatePolicyType,
  getMotorPremiumRates,
  createMotorPremiumRate,
  updateMotorPremiumRate,
  deleteMotorPremiumRate,
  getGstRates,
  createGstRate,
  updateGstRate,
  deleteGstRate,
  getHealthPlans,
  createHealthPlan,
  updateHealthPlan,
  deleteHealthPlan,
};
