const { z } = require('zod');
const {
  FUEL_TYPE_VALUES,
  PACKAGE_TYPE_VALUES,
  PAYMENT_MODE_VALUES,
  CLAIM_STATUSES,
} = require('../../constants/motor.constants');

const healthPaymentModes = PAYMENT_MODE_VALUES;

const optStr = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());
const optNum = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().optional(),
);
const optBool = z.boolean().optional();

const motorDetailSchema = z
  .object({
    package_type: z.preprocess((v) => (v === '' ? undefined : v), z.enum(PACKAGE_TYPE_VALUES).optional()),
    idv: optNum,
    electric_accessory_idv: optNum,
    non_electric_accessory_idv: optNum,
    od_start_date: optStr,
    od_end_date: optStr,
    tp_start_date: optStr,
    tp_end_date: optStr,
    rate_source: optStr,
    basic_premium: optNum,
    discount_percent: optNum,
    basic_after_discount: optNum,
    ncb_percent: optNum,
    od_premium: optNum,
    tp_premium: optNum,
    addon_premium: optNum,
    total_od_premium: optNum,
    net_premium: optNum,
    gst_on_od: optNum,
    gst_on_tp: optNum,
    total_gst: optNum,
    total_premium: optNum,
    pa_owner: optBool,
    pa_owner_amount: optNum,
    pa_passenger_1l: optBool,
    pa_passenger_2l: optBool,
    pa_passenger_amount: optNum,
    paid_driver: optBool,
    paid_driver_amount: optNum,
    payment_mode: z.preprocess((v) => (v === '' ? undefined : v), z.enum(PAYMENT_MODE_VALUES).optional()),
    payment_reference: optStr,
    is_full_payment: optBool,
    amount_received: optNum,
  })
  .partial();

const healthMemberSchema = z.object({
  customer_id: optStr,
  relation: optStr,
  member_name: z.string().min(1),
  member_phone: optStr,
  member_email: optStr,
  member_age: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().int().optional()),
  is_covered: optBool,
});

const healthDetailSchema = z
  .object({
    health_plan_id: optStr,
    deductible: optNum,
    sum_insured: optNum,
    cumulative_bonus: optNum,
    base_premium: optNum,
    gst_percent: optNum,
    gst_amount: optNum,
    net_premium: optNum,
    total_premium: optNum,
    payment_mode: z.preprocess((v) => (v === '' ? undefined : v), z.enum(healthPaymentModes).optional()),
    payment_reference: optStr,
    is_full_payment: optBool,
    amount_received: optNum,
  })
  .partial();

const addOnSchema = z.object({
  add_on_coverage_id: optStr,
  add_on_name: z.string().min(1),
  amount: optNum,
});

const documentSchema = z.object({
  id: optStr,
  category: optStr,
  file_name: z.string().min(1),
  file_url: z.string().min(1),
  mime_type: optStr,
});

const previousPolicySchema = z
  .object({
    previous_policy_number: optStr,
    previous_insurance_company_id: optStr,
    claim_status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(CLAIM_STATUSES).optional()),
    claim_amount: optNum,
    claim_description: optStr,
  })
  .partial();

const basePolicyShape = {
  customer_id: z.string().min(1, 'Customer is required'),
  policy_number: z.string().min(1, 'Policy number is required'),
  lob_id: optStr,
  product_id: optStr,
  sub_product_id: optStr,
  insurance_company_id: optStr,
  policy_type_id: optStr,
  vehicle_id: optStr,
  referred_by_type: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['SUB_BROKER', 'CUSTOMER', 'SELF']).optional()),
  referred_by_sub_broker_id: optStr,
  referred_by_customer_id: optStr,
  start_date: optStr,
  end_date: optStr,
  issue_date: optStr,
  notes: optStr,
  motor_detail: motorDetailSchema.optional(),
  health_detail: healthDetailSchema.optional(),
  health_members: z.array(healthMemberSchema).optional(),
  add_ons: z.array(addOnSchema).optional(),
  documents: z.array(documentSchema).optional(),
  previous_policy: previousPolicySchema.optional(),
};

const createPolicySchema = z.object(basePolicyShape);
const updatePolicySchema = z.object(basePolicyShape).partial();

const fuelTypeEnum = z.enum(FUEL_TYPE_VALUES);

const commissionItemSchema = z.object({
  component_type: z.string().min(1),
  base_amount: optNum,
  percentage: optNum,
  commission_amount: z.coerce.number(),
});

const commissionSchema = z.object({
  our_commission: z
    .object({
      items: z.array(commissionItemSchema).optional(),
      total_commission_amount: optNum,
      notes: optStr,
    })
    .optional(),
  sub_broker_share: z
    .object({
      enabled: optBool,
      sub_broker_id: optStr,
      commission_basis: z.preprocess(
        (v) => (v === '' ? undefined : v),
        z.enum(['PREMIUM_PERCENTAGE', 'COMMISSION_PERCENTAGE', 'FIXED_AMOUNT']).optional(),
      ),
      items: z.array(commissionItemSchema).optional(),
      total_commission_amount: optNum,
    })
    .optional(),
});

module.exports = {
  createPolicySchema,
  updatePolicySchema,
  commissionSchema,
  fuelTypeEnum,
};
