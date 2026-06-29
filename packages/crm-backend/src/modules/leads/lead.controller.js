const leadService = require('./lead.service');
const asyncWrapper = require('../../utils/asyncWrapper');
const { sendSuccess, sendCreated } = require('../../utils/responseHelper');
const { leadQuerySchema } = require('../../validators/lead.validators');

const createLead = asyncWrapper(async (req, res) => {
  const lead = await leadService.createLead(req.body, req.user.sub, req.companySlug);
  sendCreated(res, { lead }, 'Lead created successfully');
});

const getLeads = asyncWrapper(async (req, res) => {
  const filters = leadQuerySchema.parse(req.query);
  const { leads, pagination } = await leadService.getLeads(filters, req.companySlug);
  sendSuccess(res, { leads, pagination });
});

const getLead = asyncWrapper(async (req, res) => {
  const lead = await leadService.getLead(req.params.id, req.companySlug);
  sendSuccess(res, { lead });
});

const updateLead = asyncWrapper(async (req, res) => {
  const lead = await leadService.updateLead(req.params.id, req.body, req.user.sub, req.companySlug);
  sendSuccess(res, { lead }, 'Lead updated successfully');
});

const deleteLead = asyncWrapper(async (req, res) => {
  const isAdmin = req.user.role === 'ADMIN';
  await leadService.deleteLead(req.params.id, req.user.sub, isAdmin, req.companySlug);
  sendSuccess(res, {}, 'Lead deleted successfully');
});

const convertLead = asyncWrapper(async (req, res) => {
  const customerPrefill = await leadService.convertLead(req.params.id, req.user.sub, req.companySlug);
  sendSuccess(res, { customerPrefill }, 'Lead marked as converted');
});

module.exports = { createLead, getLeads, getLead, updateLead, deleteLead, convertLead };
