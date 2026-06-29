const { z } = require('zod');

const BankAccountType = z.enum(['SAVINGS', 'CURRENT', 'SALARY', 'FIXED_DEPOSIT', 'OTHER']);
const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const createBankAccountSchema = z.object({
  customer_id: z.string().uuid('Invalid customer ID'),
  account_holder_name: z.string().min(2, 'Account holder name required').max(150),
  account_number: z.string().min(6, 'Invalid account number').max(20),
  ifsc_code: z
    .string()
    .transform(v => v.toUpperCase())
    .refine(v => ifscRegex.test(v), 'Invalid IFSC code format (e.g. SBIN0001234)'),
  bank_name: z.string().max(100).optional(),
  branch_name: z.string().max(150).optional(),
  micr_code: z.string().max(20).optional(),
  account_type: BankAccountType.optional().default('SAVINGS'),
  is_primary: z.boolean().optional().default(false),
});

const updateBankAccountSchema = createBankAccountSchema.omit({ customer_id: true }).partial();

module.exports = { createBankAccountSchema, updateBankAccountSchema };
