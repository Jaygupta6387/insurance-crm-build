const documentService = require('./document.service');
const asyncWrapper = require('../../utils/asyncWrapper');
const { sendSuccess, sendCreated } = require('../../utils/responseHelper');

const addDocument = asyncWrapper(async (req, res) => {
  const isAdmin = req.user.role === 'ADMIN';
  const document = await documentService.addDocument(
    req.body,
    req.user.sub,
    isAdmin,
    req.companySlug
  );
  sendCreated(res, { document }, 'Document added successfully');
});

const getDocuments = asyncWrapper(async (req, res) => {
  const isAdmin = req.user.role === 'ADMIN';
  const documents = await documentService.getDocuments(
    req.params.customerId,
    req.user.sub,
    isAdmin,
    req.companySlug
  );
  sendSuccess(res, { documents, count: documents.length });
});

const deleteDocument = asyncWrapper(async (req, res) => {
  const isAdmin = req.user.role === 'ADMIN';
  await documentService.deleteDocument(
    req.params.id,
    req.user.sub,
    isAdmin,
    req.companySlug
  );
  sendSuccess(res, {}, 'Document deleted successfully');
});

module.exports = { addDocument, getDocuments, deleteDocument };
