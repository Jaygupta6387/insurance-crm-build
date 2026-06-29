const { z } = require('zod');

const adjustCustomerWalletSchema = z.object({
  type: z.enum(['CREDIT', 'DEBIT'], { required_error: 'Transaction type is required' }),
  amount: z.coerce
    .number({ required_error: 'Amount is required' })
    .positive('Amount must be positive')
    .multipleOf(0.01, 'Amount can have at most 2 decimal places'),
  reason: z
    .enum(['PAYMENT_RECEIVED', 'MANUAL_ADD', 'MANUAL_SETTLE', 'ADJUSTMENT'])
    .optional(),
  note: z.string().max(500).optional(),
  policy_number: z.string().max(100).optional().transform((v) => v?.trim() || undefined),
});

const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive().multipleOf(0.01),
  note: z.string().max(500).optional(),
  policy_number: z.string().max(100).optional().transform((v) => v?.trim() || undefined),
});

module.exports = { adjustCustomerWalletSchema, recordPaymentSchema };
