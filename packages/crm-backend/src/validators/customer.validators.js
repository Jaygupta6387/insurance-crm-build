const { z } = require('zod');

const CustomerPriority = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const CustomerStatus = z.enum(['ACTIVE', 'INACTIVE', 'PROSPECT', 'BLOCKED']);
const BloodGroup = z.enum(['A_POSITIVE', 'A_NEGATIVE', 'B_POSITIVE', 'B_NEGATIVE', 'AB_POSITIVE', 'AB_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE', 'UNKNOWN']);
const ReferredByType = z.enum(['SUB_BROKER', 'CUSTOMER', 'SELF']);
const FamilyRelation = z.enum(['SELF', 'SPOUSE', 'FATHER', 'MOTHER', 'SON', 'DAUGHTER', 'BROTHER', 'SISTER', 'OTHER']);

const phoneRegex = /^[6-9]\d{9}$/;
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const aadharRegex = /^\d{12}$/;
const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const createCustomerSchema = z.object({
  customer_name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  customer_phone: z.string().regex(phoneRegex, 'Enter a valid 10-digit Indian mobile number'),
  customer_email: z.string().email('Invalid email').optional().or(z.literal('')).transform(v => v || undefined),
  customer_dob: z.string().optional().transform(v => (v ? new Date(v) : undefined)),
  age: z.coerce.number().int().min(0).max(120).optional(),
  customer_priority: CustomerPriority.optional().default('MEDIUM'),
  customer_since: z.string().regex(/^\d{4}$/).optional().transform(v => (v ? parseInt(v, 10) : undefined)),

  // Family
  is_family_head: z.boolean().optional().default(false),
  family_relation: FamilyRelation.optional(),
  family_code: z.string().max(20).optional().transform(v => v?.toUpperCase() || undefined),

  // Health
  height: z.coerce.number().positive().optional(),
  weight: z.coerce.number().positive().optional(),
  blood_group: BloodGroup.optional(),
  has_ped: z.boolean().optional().default(false),
  ped_details: z.string().optional(),

  // Address
  house_no: z.string().max(50).optional(),
  area: z.string().max(150).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional().default('India'),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits').optional().or(z.literal('')).transform(v => v || undefined),

  // KYC
  pan_card: z.string().regex(panRegex, 'Invalid PAN format (e.g. ABCDE1234F)').optional().or(z.literal('')).transform(v => v?.toUpperCase() || undefined),
  aadhar_card: z.string().regex(aadharRegex, 'Aadhar must be 12 digits').optional().or(z.literal('')).transform(v => v || undefined),

  // Referral
  referred_by_type: ReferredByType.optional(),
  referred_by_sub_broker_id: z.string().uuid().optional(),
  referred_by_customer_id: z.string().uuid().optional(),

  // Referral
  referred_by_type: ReferredByType.optional(),
  status: CustomerStatus.optional().default('ACTIVE'),
});

const updateCustomerSchema = createCustomerSchema.partial();

const customerQuerySchema = z.object({
  search: z.string().optional(),
  phone: z.string().optional(),
  pan: z.string().optional(),
  family_code: z.string().optional(),
  customer_code: z.string().optional(),
  status: CustomerStatus.optional(),
  page: z.string().optional().transform(v => (v ? parseInt(v, 10) : 1)),
  limit: z.string().optional().transform(v => (v ? Math.min(parseInt(v, 10), 100) : 20)),
  sort_by: z.enum(['customer_name', 'created_at', 'customer_since', 'customer_code']).optional().default('created_at'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
});

module.exports = { createCustomerSchema, updateCustomerSchema, customerQuerySchema };
