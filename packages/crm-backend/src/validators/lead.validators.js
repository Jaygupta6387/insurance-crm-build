const { z } = require('zod');

const LeadStatus    = z.enum(['NEW', 'HOT', 'WARM', 'COLD', 'CONVERTED', 'LOST']);
const ReferredByType = z.enum(['SUB_BROKER', 'CUSTOMER', 'SELF']);
const DocumentType  = z.enum([
  'PAN_CARD', 'AADHAR_CARD', 'PASSPORT', 'DRIVING_LICENSE',
  'VOTER_ID', 'PHOTO', 'BANK_STATEMENT', 'CANCELLED_CHEQUE',
  'SALARY_SLIP', 'OTHER',
]);

const followUpSchema = z.object({
  id:             z.string().uuid().optional(),
  notes:          z.string().optional(),
  follow_up_date: z.string().optional().transform(v => (v ? new Date(v) : undefined)),
  is_done:        z.boolean().optional().default(false),
});

const documentSchema = z.object({
  id:            z.string().uuid().optional(),
  document_type: DocumentType,
  file_name:     z.string().min(1),
  file_url:      z.string().min(1),
});

const createLeadSchema = z.object({
  lead_name:                z.string().min(2, 'Name must be at least 2 characters').max(150),
  phone_number:             z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  email:                    z.string().email('Invalid email').optional().or(z.literal('')).transform(v => v || undefined),
  expected_premium:         z.coerce.number().positive().optional(),
  referred_by_type:         ReferredByType.optional().default('SELF'),
  referred_by_sub_broker_id: z.string().uuid().optional().or(z.literal('')).transform(v => v || undefined),
  referred_by_customer_id:  z.string().uuid().optional().or(z.literal('')).transform(v => v || undefined),
  lob_id:                   z.string().uuid().optional().or(z.literal('')).transform(v => v || undefined),
  product_id:               z.string().uuid().optional().or(z.literal('')).transform(v => v || undefined),
  sub_product_id:           z.string().uuid().optional().or(z.literal('')).transform(v => v || undefined),
  assigned_to:              z.string().uuid().optional().or(z.literal('')).transform(v => v || undefined),
  status:                   LeadStatus.optional().default('NEW'),
  notes:                    z.string().optional(),
  follow_ups:               z.array(followUpSchema).optional().default([]),
  documents:                z.array(documentSchema).optional().default([]),
});

const updateLeadSchema = createLeadSchema.partial();

const leadQuerySchema = z.object({
  search:      z.string().optional(),
  status:      LeadStatus.optional(),
  assigned_to: z.string().optional(),
  lob_id:      z.string().optional(),
  page:        z.string().optional().transform(v => (v ? parseInt(v, 10) : 1)),
  limit:       z.string().optional().transform(v => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  sort_by:     z.enum(['lead_name', 'created_at', 'expected_premium', 'status']).optional().default('created_at'),
  sort_order:  z.enum(['asc', 'desc']).optional().default('desc'),
});

module.exports = { createLeadSchema, updateLeadSchema, leadQuerySchema };
