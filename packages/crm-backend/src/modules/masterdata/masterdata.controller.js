const service = require('./masterdata.service');
const asyncWrapper = require('../../utils/asyncWrapper');
const { sendSuccess, sendCreated } = require('../../utils/responseHelper');

// ─── LOBs ─────────────────────────────────────────────────────────────────────

const getLobs = asyncWrapper(async (req, res) => {
  const lobs = await service.getLobs(req.companySlug, req.query);
  sendSuccess(res, { lobs });
});

const createLob = asyncWrapper(async (req, res) => {
  const lob = await service.createLob(req.body, req.companySlug);
  sendCreated(res, { lob }, 'LOB created successfully');
});

const updateLob = asyncWrapper(async (req, res) => {
  const lob = await service.updateLob(req.params.id, req.body, req.companySlug);
  sendSuccess(res, { lob }, 'LOB updated successfully');
});

// ─── Products ─────────────────────────────────────────────────────────────────

const getProducts = asyncWrapper(async (req, res) => {
  const products = await service.getProducts(req.companySlug, req.query);
  sendSuccess(res, { products });
});

const createProduct = asyncWrapper(async (req, res) => {
  const product = await service.createProduct(req.body, req.companySlug, req.user.sub);
  sendCreated(res, { product }, 'Product created successfully');
});

const updateProduct = asyncWrapper(async (req, res) => {
  const product = await service.updateProduct(req.params.id, req.body, req.companySlug, req.user.sub);
  sendSuccess(res, { product }, 'Product updated successfully');
});

const deleteProduct = asyncWrapper(async (req, res) => {
  await service.deleteProduct(req.params.id, req.companySlug);
  sendSuccess(res, {}, 'Product deleted successfully');
});

// ─── Sub-Products ─────────────────────────────────────────────────────────────

const getSubProducts = asyncWrapper(async (req, res) => {
  const subProducts = await service.getSubProducts(req.companySlug, req.query);
  sendSuccess(res, { sub_products: subProducts });
});

const createSubProduct = asyncWrapper(async (req, res) => {
  const subProduct = await service.createSubProduct(req.body, req.companySlug, req.user.sub);
  sendCreated(res, { sub_product: subProduct }, 'Sub-product created successfully');
});

const updateSubProduct = asyncWrapper(async (req, res) => {
  const subProduct = await service.updateSubProduct(req.params.id, req.body, req.companySlug, req.user.sub);
  sendSuccess(res, { sub_product: subProduct }, 'Sub-product updated successfully');
});

const deleteSubProduct = asyncWrapper(async (req, res) => {
  await service.deleteSubProduct(req.params.id, req.companySlug);
  sendSuccess(res, {}, 'Sub-product deleted successfully');
});

// ─── Insurance Companies ──────────────────────────────────────────────────────

const getInsuranceCompanies = asyncWrapper(async (req, res) => {
  const companies = await service.getInsuranceCompanies(req.companySlug, req.query);
  sendSuccess(res, { insurance_companies: companies });
});

const createInsuranceCompany = asyncWrapper(async (req, res) => {
  const company = await service.createInsuranceCompany(req.body, req.companySlug, req.user.sub);
  sendCreated(res, { insurance_company: company }, 'Insurance company created successfully');
});

const updateInsuranceCompany = asyncWrapper(async (req, res) => {
  const company = await service.updateInsuranceCompany(req.params.id, req.body, req.companySlug, req.user.sub);
  sendSuccess(res, { insurance_company: company }, 'Insurance company updated successfully');
});

const deleteInsuranceCompany = asyncWrapper(async (req, res) => {
  await service.deleteInsuranceCompany(req.params.id, req.companySlug);
  sendSuccess(res, {}, 'Insurance company deleted successfully');
});

// ─── Policy Types ─────────────────────────────────────────────────────────────

const getPolicyTypes = asyncWrapper(async (req, res) => {
  const policy_types = await service.getPolicyTypes(req.companySlug, req.query);
  sendSuccess(res, { policy_types });
});

const createPolicyType = asyncWrapper(async (req, res) => {
  const policy_type = await service.createPolicyType(req.body, req.companySlug);
  sendCreated(res, { policy_type }, 'Policy type created successfully');
});

const updatePolicyType = asyncWrapper(async (req, res) => {
  const policy_type = await service.updatePolicyType(req.params.id, req.body, req.companySlug);
  sendSuccess(res, { policy_type }, 'Policy type updated successfully');
});

// ─── Motor Premium Rates ──────────────────────────────────────────────────────

const getMotorPremiumRates = asyncWrapper(async (req, res) => {
  const premium_rates = await service.getMotorPremiumRates(req.companySlug, req.query);
  sendSuccess(res, { premium_rates });
});

const createMotorPremiumRate = asyncWrapper(async (req, res) => {
  const premium_rate = await service.createMotorPremiumRate(req.body, req.companySlug, req.user.sub);
  sendCreated(res, { premium_rate }, 'Premium rate created successfully');
});

const updateMotorPremiumRate = asyncWrapper(async (req, res) => {
  const premium_rate = await service.updateMotorPremiumRate(req.params.id, req.body, req.companySlug, req.user.sub);
  sendSuccess(res, { premium_rate }, 'Premium rate updated successfully');
});

const deleteMotorPremiumRate = asyncWrapper(async (req, res) => {
  await service.deleteMotorPremiumRate(req.params.id, req.companySlug);
  sendSuccess(res, {}, 'Premium rate deleted successfully');
});

// ─── GST Rates ────────────────────────────────────────────────────────────────

const getGstRates = asyncWrapper(async (req, res) => {
  const gst_rates = await service.getGstRates(req.companySlug, req.query);
  sendSuccess(res, { gst_rates });
});

const createGstRate = asyncWrapper(async (req, res) => {
  const result = await service.createGstRate(req.body, req.companySlug, req.user.sub);
  sendCreated(res, result, 'GST rate saved successfully');
});

const updateGstRate = asyncWrapper(async (req, res) => {
  const gst_rate = await service.updateGstRate(req.params.id, req.body, req.companySlug, req.user.sub);
  sendSuccess(res, { gst_rate }, 'GST rate updated successfully');
});

const deleteGstRate = asyncWrapper(async (req, res) => {
  await service.deleteGstRate(req.params.id, req.companySlug);
  sendSuccess(res, {}, 'GST rate deleted successfully');
});

// ─── Health Plans ─────────────────────────────────────────────────────────────

const getHealthPlans = asyncWrapper(async (req, res) => {
  const health_plans = await service.getHealthPlans(req.companySlug, req.query);
  sendSuccess(res, { health_plans });
});

const createHealthPlan = asyncWrapper(async (req, res) => {
  const health_plan = await service.createHealthPlan(req.body, req.companySlug, req.user.sub);
  sendCreated(res, { health_plan }, 'Health plan created successfully');
});

const updateHealthPlan = asyncWrapper(async (req, res) => {
  const health_plan = await service.updateHealthPlan(req.params.id, req.body, req.companySlug, req.user.sub);
  sendSuccess(res, { health_plan }, 'Health plan updated successfully');
});

const deleteHealthPlan = asyncWrapper(async (req, res) => {
  await service.deleteHealthPlan(req.params.id, req.companySlug);
  sendSuccess(res, {}, 'Health plan deleted successfully');
});

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
