const bankAccountService = require('./bank-account.service');
const asyncWrapper = require('../../utils/asyncWrapper');
const { sendSuccess, sendCreated } = require('../../utils/responseHelper');

const createBankAccount = asyncWrapper(async (req, res) => {
  const isAdmin = req.user.role === 'ADMIN';
  const account = await bankAccountService.createBankAccount(
    req.body,
    req.user.sub,
    isAdmin,
    req.companySlug
  );
  sendCreated(res, { account }, 'Bank account added successfully');
});

const getBankAccounts = asyncWrapper(async (req, res) => {
  const isAdmin = req.user.role === 'ADMIN';
  const accounts = await bankAccountService.getBankAccounts(
    req.params.customerId,
    req.user.sub,
    isAdmin,
    req.companySlug
  );
  sendSuccess(res, { accounts, count: accounts.length });
});

const updateBankAccount = asyncWrapper(async (req, res) => {
  const isAdmin = req.user.role === 'ADMIN';
  const account = await bankAccountService.updateBankAccount(
    req.params.id,
    req.body,
    req.user.sub,
    isAdmin,
    req.companySlug
  );
  sendSuccess(res, { account }, 'Bank account updated successfully');
});

const deleteBankAccount = asyncWrapper(async (req, res) => {
  const isAdmin = req.user.role === 'ADMIN';
  await bankAccountService.deleteBankAccount(
    req.params.id,
    req.user.sub,
    isAdmin,
    req.companySlug
  );
  sendSuccess(res, {}, 'Bank account removed successfully');
});

module.exports = { createBankAccount, getBankAccounts, updateBankAccount, deleteBankAccount };
