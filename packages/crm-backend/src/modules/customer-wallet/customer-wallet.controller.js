const service = require('./customer-wallet.service');
const asyncWrapper = require('../../utils/asyncWrapper');
const { sendSuccess } = require('../../utils/responseHelper');

const getPendingBalances = asyncWrapper(async (req, res) => {
  const result = await service.getPendingBalances(req.query, req.companySlug);
  sendSuccess(res, result);
});

const getCustomerLedger = asyncWrapper(async (req, res) => {
  const result = await service.getCustomerLedger(req.params.customerId, req.companySlug);
  sendSuccess(res, result);
});

const recordPayment = asyncWrapper(async (req, res) => {
  const result = await service.recordPayment(req.params.customerId, req.body, req.user.sub, req.companySlug);
  sendSuccess(res, result, 'Payment recorded successfully');
});

const adjustWallet = asyncWrapper(async (req, res) => {
  const result = await service.adjustWallet(req.params.customerId, req.body, req.user.sub, req.companySlug);
  sendSuccess(res, result, 'Wallet updated successfully');
});

module.exports = { getPendingBalances, getCustomerLedger, recordPayment, adjustWallet };
