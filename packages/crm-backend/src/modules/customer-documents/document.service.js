const { resolveCompanyDb } = require('../dynamic-db/dbResolver');

const addDocument = async (data, uploaderId, isAdmin, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const customer = await db.customer.findFirst({
    where: {
      id: data.customer_id,
      deleted_at: null,
    },
  });

  if (!customer) {
    throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
  }

  return db.customerDocument.create({
    data: {
      customer_id: data.customer_id,
      document_type: data.document_type,
      file_name: data.file_name,
      file_url: data.file_url,
      mime_type: data.mime_type || null,
      uploaded_by: uploaderId,
    },
    include: {
      uploader: { select: { id: true, full_name: true } },
    },
  });
};

const getDocuments = async (customerId, userId, isAdmin, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const customer = await db.customer.findFirst({
    where: {
      id: customerId,
      deleted_at: null,
    },
  });

  if (!customer) {
    throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
  }

  return db.customerDocument.findMany({
    where: { customer_id: customerId },
    orderBy: { created_at: 'desc' },
    include: { uploader: { select: { id: true, full_name: true } } },
  });
};

const deleteDocument = async (id, deleterId, isAdmin, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const doc = await db.customerDocument.findUnique({
    where: { id },
    include: { customer: { select: { deleted_at: true } } },
  });

  if (!doc || doc.customer.deleted_at) {
    throw Object.assign(new Error('Document not found'), { statusCode: 404 });
  }

  await db.customerDocument.delete({ where: { id } });
};

module.exports = { addDocument, getDocuments, deleteDocument };
