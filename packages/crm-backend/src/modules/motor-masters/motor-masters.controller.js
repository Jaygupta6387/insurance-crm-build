const service = require('./motor-masters.service');
const validators = require('./motor-masters.validator');
const asyncWrapper = require('../../utils/asyncWrapper');
const { sendSuccess, sendCreated } = require('../../utils/responseHelper');

// ─── MOTOR MAKES ──────────────────────────────────────────────────────────────

const getMotorMakes = asyncWrapper(async (req, res) => {
  const result = await service.getMotorMakes(req.companySlug, req.query);
  sendSuccess(res, result);
});

const createMotorMake = asyncWrapper(async (req, res) => {
  const data = validators.motorMakeCreateSchema.parse(req.body);
  const motorMake = await service.createMotorMake(data, req.companySlug, req.user.sub);
  sendCreated(res, { motor_make: motorMake }, 'Motor make created successfully');
});

const updateMotorMake = asyncWrapper(async (req, res) => {
  const data = validators.motorMakeUpdateSchema.parse(req.body);
  const motorMake = await service.updateMotorMake(req.params.id, data, req.companySlug, req.user.sub);
  sendSuccess(res, { motor_make: motorMake }, 'Motor make updated successfully');
});

const deleteMotorMake = asyncWrapper(async (req, res) => {
  await service.deleteMotorMake(req.params.id, req.companySlug);
  sendSuccess(res, {}, 'Motor make deleted successfully');
});

// ─── MOTOR MODELS ─────────────────────────────────────────────────────────────

const getMotorModels = asyncWrapper(async (req, res) => {
  const result = await service.getMotorModels(req.companySlug, req.query);
  sendSuccess(res, result);
});

const createMotorModel = asyncWrapper(async (req, res) => {
  const data = validators.motorModelCreateSchema.parse(req.body);
  const motorModel = await service.createMotorModel(data, req.companySlug, req.user.sub);
  sendCreated(res, { motor_model: motorModel }, 'Motor model created successfully');
});

const updateMotorModel = asyncWrapper(async (req, res) => {
  const data = validators.motorModelUpdateSchema.parse(req.body);
  const motorModel = await service.updateMotorModel(req.params.id, data, req.companySlug, req.user.sub);
  sendSuccess(res, { motor_model: motorModel }, 'Motor model updated successfully');
});

const deleteMotorModel = asyncWrapper(async (req, res) => {
  await service.deleteMotorModel(req.params.id, req.companySlug);
  sendSuccess(res, {}, 'Motor model deleted successfully');
});

// ─── MOTOR VARIANTS ───────────────────────────────────────────────────────────

const getMotorVariants = asyncWrapper(async (req, res) => {
  const result = await service.getMotorVariants(req.companySlug, req.query);
  sendSuccess(res, result);
});

const createMotorVariant = asyncWrapper(async (req, res) => {
  const data = validators.motorVariantCreateSchema.parse(req.body);
  const motorVariant = await service.createMotorVariant(data, req.companySlug, req.user.sub);
  sendCreated(res, { motor_variant: motorVariant }, 'Motor variant created successfully');
});

const updateMotorVariant = asyncWrapper(async (req, res) => {
  const data = validators.motorVariantUpdateSchema.parse(req.body);
  const motorVariant = await service.updateMotorVariant(req.params.id, data, req.companySlug, req.user.sub);
  sendSuccess(res, { motor_variant: motorVariant }, 'Motor variant updated successfully');
});

const deleteMotorVariant = asyncWrapper(async (req, res) => {
  await service.deleteMotorVariant(req.params.id, req.companySlug);
  sendSuccess(res, {}, 'Motor variant deleted successfully');
});

// ─── RTO CODES ────────────────────────────────────────────────────────────────

const getRtoCodes = asyncWrapper(async (req, res) => {
  const result = await service.getRtoCodes(req.companySlug, req.query);
  sendSuccess(res, result);
});

const createRtoCode = asyncWrapper(async (req, res) => {
  const data = validators.rtoCodeCreateSchema.parse(req.body);
  const rtoCode = await service.createRtoCode(data, req.companySlug, req.user.sub);
  sendCreated(res, { rto_code: rtoCode }, 'RTO code created successfully');
});

const updateRtoCode = asyncWrapper(async (req, res) => {
  const data = validators.rtoCodeUpdateSchema.parse(req.body);
  const rtoCode = await service.updateRtoCode(req.params.id, data, req.companySlug, req.user.sub);
  sendSuccess(res, { rto_code: rtoCode }, 'RTO code updated successfully');
});

const deleteRtoCode = asyncWrapper(async (req, res) => {
  await service.deleteRtoCode(req.params.id, req.companySlug);
  sendSuccess(res, {}, 'RTO code deleted successfully');
});

// ─── ADD-ON COVERAGES ─────────────────────────────────────────────────────────

const getAddOnCoverages = asyncWrapper(async (req, res) => {
  const result = await service.getAddOnCoverages(req.companySlug, req.query);
  sendSuccess(res, result);
});

const createAddOnCoverage = asyncWrapper(async (req, res) => {
  const data = validators.addOnCoverageCreateSchema.parse(req.body);
  const addOnCoverage = await service.createAddOnCoverage(data, req.companySlug, req.user.sub);
  sendCreated(res, { add_on_coverage: addOnCoverage }, 'Add-on coverage created successfully');
});

const updateAddOnCoverage = asyncWrapper(async (req, res) => {
  const data = validators.addOnCoverageUpdateSchema.parse(req.body);
  const addOnCoverage = await service.updateAddOnCoverage(req.params.id, data, req.companySlug, req.user.sub);
  sendSuccess(res, { add_on_coverage: addOnCoverage }, 'Add-on coverage updated successfully');
});

const deleteAddOnCoverage = asyncWrapper(async (req, res) => {
  await service.deleteAddOnCoverage(req.params.id, req.companySlug);
  sendSuccess(res, {}, 'Add-on coverage deleted successfully');
});

module.exports = {
  // Motor Makes
  getMotorMakes,
  createMotorMake,
  updateMotorMake,
  deleteMotorMake,
  // Motor Models
  getMotorModels,
  createMotorModel,
  updateMotorModel,
  deleteMotorModel,
  // Motor Variants
  getMotorVariants,
  createMotorVariant,
  updateMotorVariant,
  deleteMotorVariant,
  // RTO Codes
  getRtoCodes,
  createRtoCode,
  updateRtoCode,
  deleteRtoCode,
  // Add-On Coverages
  getAddOnCoverages,
  createAddOnCoverage,
  updateAddOnCoverage,
  deleteAddOnCoverage,
};
