const service = require('./policy.service');
const requestService = require('./policy-request.service');
const commissionService = require('./commission.service');
const premiumService = require('./premium.service');
const masterdataService = require('../masterdata/masterdata.service');
const { resolveCompanyDb } = require('../dynamic-db/dbResolver');
const { createPolicySchema, updatePolicySchema, commissionSchema } = require('./policy.validator');
const asyncWrapper = require('../../utils/asyncWrapper');
const { sendSuccess, sendCreated } = require('../../utils/responseHelper');

const getPolicies = asyncWrapper(async (req, res) => {
  const result = await service.getPolicies(req.query, req.companySlug);
  sendSuccess(res, result);
});

const getPolicyTypes = asyncWrapper(async (req, res) => {
  const policy_types = await service.getPolicyTypes(req.companySlug);
  sendSuccess(res, { policy_types });
});

const checkPolicyNumber = asyncWrapper(async (req, res) => {
  const result = await service.checkPolicyNumber(req.query.policy_number, req.query.exclude_id, req.companySlug);
  sendSuccess(res, result);
});

const lookupByNumber = asyncWrapper(async (req, res) => {
  const policy = await service.lookupByNumber(req.query.policy_number, req.companySlug);
  sendSuccess(res, { policy });
});

const calculatePremium = asyncWrapper(async (req, res) => {
  const result = await premiumService.calculatePremium(req.body, req.companySlug);
  sendSuccess(res, { premium: result });
});

const getHealthGst = asyncWrapper(async (req, res) => {
  const db = await resolveCompanyDb(req.companySlug);
  const result = await premiumService.resolveHealthGst(db, {
    lob_id: req.query.lob_id || null,
    product_id: req.query.product_id || null,
  });
  sendSuccess(res, result);
});

const getHealthPlans = asyncWrapper(async (req, res) => {
  const health_plans = await masterdataService.getHealthPlans(req.companySlug, {
    ...req.query,
    is_active: 'true',
  });
  sendSuccess(res, { health_plans });
});

const getPolicy = asyncWrapper(async (req, res) => {
  let policy = await service.getPolicy(req.params.id, req.companySlug);
  if (req.user.role !== 'ADMIN') {
    const { our_commissions, commissions, sub_broker_commission, ...rest } = policy;
    policy = rest;
  }
  sendSuccess(res, { policy });
});

const createPolicy = asyncWrapper(async (req, res) => {
  const data = createPolicySchema.parse(req.body);
  const policy = await service.createPolicy(data, req.user.sub, req.companySlug);
  sendCreated(res, { policy }, 'Policy saved successfully');
});

const updatePolicy = asyncWrapper(async (req, res) => {
  const data = updatePolicySchema.parse(req.body);
  const policy = await service.updatePolicy(req.params.id, data, req.user.sub, req.companySlug);
  sendSuccess(res, { policy }, 'Policy updated successfully');
});

const deletePolicy = asyncWrapper(async (req, res) => {
  await service.deletePolicy(req.params.id, req.user.sub, req.companySlug);
  sendSuccess(res, {}, 'Policy deleted successfully');
});

const listChangeRequests = asyncWrapper(async (req, res) => {
  const requests = await requestService.listChangeRequests(req.companySlug, req.query);
  sendSuccess(res, { requests });
});

const createChangeRequest = asyncWrapper(async (req, res) => {
  const { request_type, payload, reason } = req.body;
  const request = await requestService.createChangeRequest(
    { policy_id: req.params.id, request_type, payload, reason },
    req.user.sub,
    req.companySlug,
  );
  sendCreated(res, { request }, 'Change request submitted for admin approval');
});

const reviewChangeRequest = asyncWrapper(async (req, res) => {
  const result = await requestService.reviewChangeRequest(
    req.params.requestId,
    req.body,
    req.user.sub,
    req.companySlug,
  );
  sendSuccess(res, result, req.body.action === 'APPROVE' ? 'Request approved' : 'Request rejected');
});

const getCommission = asyncWrapper(async (req, res) => {
  const commission = await commissionService.getPolicyCommission(req.params.id, req.companySlug);
  sendSuccess(res, { commission });
});

const finalizeCommission = asyncWrapper(async (req, res) => {
  const data = commissionSchema.parse(req.body);
  const policy = await commissionService.finalizePolicyCommission(req.params.id, data, req.user.sub, req.companySlug);
  sendSuccess(res, { policy }, 'Policy finalized successfully');
});

module.exports = {
  getPolicies,
  getPolicyTypes,
  checkPolicyNumber,
  lookupByNumber,
  calculatePremium,
  getHealthGst,
  getHealthPlans,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
  listChangeRequests,
  createChangeRequest,
  reviewChangeRequest,
  getCommission,
  finalizeCommission,
};
