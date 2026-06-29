const customerService = require('./customer.service');
const asyncWrapper = require('../../utils/asyncWrapper');
const { sendSuccess, sendCreated } = require('../../utils/responseHelper');
const { customerQuerySchema } = require('../../validators/customer.validators');

const createCustomer = asyncWrapper(async (req, res) => {
  const customer = await customerService.createCustomer(
    req.body,
    req.user.sub,
    req.companySlug
  );
  sendCreated(res, { customer }, 'Customer created successfully');
});

const getCustomers = asyncWrapper(async (req, res) => {
  const filters = customerQuerySchema.parse(req.query);
  const isAdmin = req.user.role === 'ADMIN';
  const { customers, pagination } = await customerService.getCustomers(
    filters,
    req.user.sub,
    isAdmin,
    req.companySlug
  );
  sendSuccess(res, { customers, pagination });
});

const getCustomer = asyncWrapper(async (req, res) => {
  const isAdmin = req.user.role === 'ADMIN';
  const customer = await customerService.getCustomer(
    req.params.id,
    req.user.sub,
    isAdmin,
    req.companySlug
  );
  sendSuccess(res, { customer });
});

const updateCustomer = asyncWrapper(async (req, res) => {
  const isAdmin = req.user.role === 'ADMIN';
  const customer = await customerService.updateCustomer(
    req.params.id,
    req.body,
    req.user.sub,
    isAdmin,
    req.companySlug
  );
  sendSuccess(res, { customer }, 'Customer updated successfully');
});

const deleteCustomer = asyncWrapper(async (req, res) => {
  const isAdmin = req.user.role === 'ADMIN';
  await customerService.deleteCustomer(
    req.params.id,
    req.user.sub,
    isAdmin,
    req.companySlug
  );
  sendSuccess(res, {}, 'Customer deleted successfully');
});

const generateFamilyCode = asyncWrapper(async (req, res) => {
  const { name, phone } = req.query;
  if (!name || !phone) {
    return res.status(400).json({ success: false, message: 'name and phone are required' });
  }
  const family_code = await customerService.generateFamilyCode(name, phone, req.companySlug);
  sendSuccess(res, { family_code });
});

const lookupFamilyCode = asyncWrapper(async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ success: false, message: 'code is required' });
  const result = await customerService.lookupFamilyCode(code, req.companySlug);
  if (!result) return res.status(404).json({ success: false, message: 'Family code not found' });
  sendSuccess(res, result);
});

const searchFamilyCodes = asyncWrapper(async (req, res) => {
  const { q, limit } = req.query;
  if (!q || String(q).trim().length < 2) {
    return res.status(400).json({ success: false, message: 'q must be at least 2 characters' });
  }
  const parsedLimit = limit ? Math.min(parseInt(limit, 10) || 10, 20) : 10;
  const family_codes = await customerService.searchFamilyCodes(q, req.companySlug, parsedLimit);
  sendSuccess(res, { family_codes });
});

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
