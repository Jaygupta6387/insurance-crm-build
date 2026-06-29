const { z } = require('zod');

const createSubBrokerSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  email: z.string().email('Invalid email').optional().or(z.literal('')).transform((v) => v || undefined),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE'),
});

const updateSubBrokerSchema = createSubBrokerSchema.partial();

const walletAdjustmentSchema = z.object({
  type: z.enum(['CREDIT', 'DEBIT'], { required_error: 'Transaction type is required' }),
  amount: z.coerce
    .number({ required_error: 'Amount is required' })
    .positive('Amount must be positive')
    .multipleOf(0.01, 'Amount can have at most 2 decimal places'),
  reason: z.enum(['MANUAL_CREDIT', 'MANUAL_DEBIT', 'PAYOUT', 'ADJUSTMENT'], {
    required_error: 'Reason is required',
  }),
  note: z.string().max(500).optional(),
});

const createCommissionSchema = z.object({
  // Optional policy reference
  policy_id:     z.string().uuid().optional(),
  policy_number: z.string().max(100).optional(),
  customer_id:   z.string().uuid().optional(),

  // Insurance hierarchy (all optional FK references)
  lob_id:               z.string().uuid().optional(),
  product_id:           z.string().uuid().optional(),
  sub_product_id:       z.string().uuid().optional(),
  insurance_company_id: z.string().uuid().optional(),

  // Commission calculation method
  commission_basis: z.enum(['PREMIUM_PERCENTAGE', 'COMMISSION_PERCENTAGE', 'FIXED_AMOUNT']).optional(),

  // Total commission (required)
  total_commission_amount: z.coerce
    .number({ required_error: 'Commission amount is required' })
    .positive('Commission amount must be positive'),

  notes: z.string().max(2000).optional(),

  // Optional breakdown items
  items: z
    .array(
      z.object({
        component_type: z.enum([
          'OD', 'TP', 'ADDON', 'RSA', 'ZERO_DEP',
          'PREMIUM', 'TOPUP', 'YEAR_1', 'RENEWAL', 'OTHER',
        ]),
        base_amount:       z.coerce.number().positive().optional(),
        percentage:        z.coerce.number().min(0).max(100).optional(),
        commission_amount: z.coerce.number().positive('Item commission amount must be positive'),
      })
    )
    .optional(),
});

const updateCommissionStatusSchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'CANCELLED'], { required_error: 'Status is required' }),
  notes: z.string().max(2000).optional(),
});

module.exports = {
  createSubBrokerSchema,
  updateSubBrokerSchema,
  walletAdjustmentSchema,
  createCommissionSchema,
  updateCommissionStatusSchema,
};
