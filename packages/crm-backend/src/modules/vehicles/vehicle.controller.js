const service = require('./vehicle.service');
const { createVehicleSchema, updateVehicleSchema } = require('./vehicle.validator');
const asyncWrapper = require('../../utils/asyncWrapper');
const { sendSuccess, sendCreated } = require('../../utils/responseHelper');

const getVehiclesByCustomer = asyncWrapper(async (req, res) => {
  const vehicles = await service.getVehiclesByCustomer(req.params.customerId, req.companySlug);
  sendSuccess(res, { vehicles });
});

const getVehicle = asyncWrapper(async (req, res) => {
  const vehicle = await service.getVehicle(req.params.id, req.companySlug);
  sendSuccess(res, { vehicle });
});

const createVehicle = asyncWrapper(async (req, res) => {
  const data = createVehicleSchema.parse(req.body);
  const vehicle = await service.createVehicle(data, req.companySlug, req.user.sub);
  sendCreated(res, { vehicle }, 'Vehicle added successfully');
});

const updateVehicle = asyncWrapper(async (req, res) => {
  const data = updateVehicleSchema.parse(req.body);
  const vehicle = await service.updateVehicle(req.params.id, data, req.companySlug, req.user.sub);
  sendSuccess(res, { vehicle }, 'Vehicle updated successfully');
});

const deleteVehicle = asyncWrapper(async (req, res) => {
  await service.deleteVehicle(req.params.id, req.companySlug, req.user.sub);
  sendSuccess(res, {}, 'Vehicle deleted successfully');
});

const lookupRto = asyncWrapper(async (req, res) => {
  const rto = await service.lookupRtoByRegistration(req.query.registration, req.companySlug);
  sendSuccess(res, { rto_code: rto });
});

module.exports = {
  getVehiclesByCustomer,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  lookupRto,
};
