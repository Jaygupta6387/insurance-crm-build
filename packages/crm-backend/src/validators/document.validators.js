const { z } = require('zod');

const DocumentType = z.enum([
  'PAN_CARD', 'AADHAR_CARD', 'PASSPORT', 'DRIVING_LICENSE',
  'VOTER_ID', 'PHOTO', 'BANK_STATEMENT', 'SALARY_SLIP', 'OTHER',
]);

const createDocumentSchema = z.object({
  customer_id: z.string().uuid('Invalid customer ID'),
  document_type: DocumentType,
  file_name: z.string().min(1, 'File name is required').max(255),
  file_url: z.string().url('Invalid file URL'),
  mime_type: z.string().max(100).optional(),
});

module.exports = { createDocumentSchema, DocumentType };
