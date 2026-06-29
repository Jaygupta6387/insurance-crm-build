const { z } = require('zod');
const { FUEL_TYPE_VALUES } = require('../../constants/motor.constants');

const emptyToUndefined = (v) => (v === '' || v === null ? undefined : v);

const baseVehicleShape = {
  customer_id: z.string().min(1, 'Customer is required'),
  registration_number: z.preprocess(emptyToUndefined, z.string().trim().max(20).optional()),
  is_new_registration: z.boolean().optional().default(false),
  rto_code_id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  chassis_last6: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^[A-Za-z0-9]{6}$/, 'Chassis must be exactly 6 alphanumeric characters').optional(),
  ),
  make_id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  model_id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  variant_id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  manufacture_year: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1980).max(new Date().getFullYear() + 1).optional(),
  ),
  registration_date: z.preprocess(emptyToUndefined, z.string().optional()),
  fuel_type: z.preprocess(emptyToUndefined, z.enum(FUEL_TYPE_VALUES).optional()),
  cubic_capacity: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(20000).optional()),
  battery_capacity: z.preprocess(emptyToUndefined, z.string().optional()),
  seating_capacity: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).optional()),
};

const createVehicleSchema = z
  .object(baseVehicleShape)
  .superRefine((data, ctx) => {
    if (!data.is_new_registration && !data.registration_number) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['registration_number'],
        message: 'Registration number is required',
      });
    }
  });

const updateVehicleShape = { ...baseVehicleShape };
delete updateVehicleShape.customer_id;
const updateVehicleSchema = z.object(updateVehicleShape).partial();

module.exports = { createVehicleSchema, updateVehicleSchema };
