const service = require('./subbroker.service');
const asyncWrapper = require('../../utils/asyncWrapper');
const { sendSuccess, sendCreated, sendNotFound } = require('../../utils/responseHelper');

// ─── CRUD ─────────────────────────────────────────────────────────────────────

const createSubBroker = asyncWrapper(async (req, res) => {
  const broker = await service.createSubBroker(req.body, req.user.id, req.companySlug);
  sendCreated(res, { broker }, 'Sub-broker created successfully');
});

const getSubBrokers = asyncWrapper(async (req, res) => {
  const result = await service.getSubBrokers(req.companySlug, req.query);
  sendSuccess(res, result);
});

const getSubBroker = asyncWrapper(async (req, res) => {
  const broker = await service.getSubBroker(req.params.id, req.companySlug);
  sendSuccess(res, { broker });
});

const updateSubBroker = asyncWrapper(async (req, res) => {
  const broker = await service.updateSubBroker(req.params.id, req.body, req.user.id, req.companySlug);
  sendSuccess(res, { broker }, 'Sub-broker updated successfully');
});

const deleteSubBroker = asyncWrapper(async (req, res) => {
  await service.deleteSubBroker(req.params.id, req.user.id, req.companySlug);
  sendSuccess(res, {}, 'Sub-broker deleted successfully');
});

// ─── Analytics ───────────────────────────────────────────────────────────────

const getAnalytics = asyncWrapper(async (req, res) => {
  const analytics = await service.getAnalytics(req.companySlug);
  sendSuccess(res, { analytics });
});

// ─── Wallet ───────────────────────────────────────────────────────────────────

const adjustWallet = asyncWrapper(async (req, res) => {
  const result = await service.adjustWallet(req.params.id, req.body, req.user.id, req.companySlug);
  sendSuccess(res, result, 'Wallet adjusted successfully');
});

const getWalletHistory = asyncWrapper(async (req, res) => {
  const result = await service.getWalletHistory(req.params.id, req.companySlug, req.query);
  sendSuccess(res, result);
});

// ─── Commissions ─────────────────────────────────────────────────────────────

const createCommission = asyncWrapper(async (req, res) => {
  const commission = await service.createCommission(
    req.params.id,
    req.body,
    req.user.id,
    req.companySlug
  );
  sendCreated(res, { commission }, 'Commission record created successfully');
});

const getCommissions = asyncWrapper(async (req, res) => {
  const result = await service.getCommissions(req.params.id, req.companySlug, req.query);
  sendSuccess(res, result);
});

const updateCommissionStatus = asyncWrapper(async (req, res) => {
  const commission = await service.updateCommissionStatus(
    req.params.commissionId,
    req.body,
    req.user.id,
    req.companySlug
  );
  sendSuccess(res, { commission }, 'Commission status updated');
});

module.exports = {
  createSubBroker,
  getSubBrokers,
  getSubBroker,
  updateSubBroker,
  deleteSubBroker,
  getAnalytics,
  adjustWallet,
  getWalletHistory,
  createCommission,
  getCommissions,
  updateCommissionStatus,
};
